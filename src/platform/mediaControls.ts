import { registerPlugin } from '@capacitor/core';
import { seek } from '../player/engine';
import { api } from '../core';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { isAndroid } from '.';

/**
 * Android: keeps playback alive in the background through a foreground media service
 * and mirrors the player into the system media notification / lock screen / headset buttons.
 */
interface MediaControlsPlugin {
  update(o: { title: string; artist: string; artwork?: string; playing: boolean; position: number; duration: number }): Promise<void>;
  stop(): Promise<void>;
  /** The lists Android Auto browses (MediaPlaybackService). */
  setLibrary(o: { queue?: LibItem[]; liked?: LibItem[]; recent?: LibItem[]; titles: Record<string, string> }): Promise<void>;
  addListener(
    event: 'action',
    cb: (e: { action: 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'playId' | 'search'; position?: number; arg?: string }) => void,
  ): Promise<{ remove: () => void }>;
}

interface LibItem {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
}

if (isAndroid) {
  const MediaControls = registerPlugin<MediaControlsPlugin>('MediaControls');

  MediaControls.addListener('action', ({ action, position, arg }) => {
    const p = usePlayer.getState();
    // Android Auto: a tapped entry ("liked/<key>") or a voice request.
    if (action === 'playId' && arg) return void playFromBrowse(arg);
    if (action === 'search' && arg !== undefined) return void playFromSearch(arg);
    if (action === 'play') p.patch({ playing: true });
    else if (action === 'pause') p.patch({ playing: false });
    else if (action === 'next') p.next();
    else if (action === 'prev') p.prev();
    else if (action === 'seek' && position != null) seek(position);
  });

  let lastSent = 0;
  let lastKey = '';
  let lastPlaying = false;
  let lastPos = 0;

  const send = () => {
    const s = usePlayer.getState();
    const t = s.queue[s.index];
    if (!t) {
      if (lastKey) MediaControls.stop().catch(() => {});
      lastKey = '';
      return;
    }
    lastSent = Date.now();
    lastKey = t.key;
    lastPlaying = s.playing;
    lastPos = s.position;
    MediaControls.update({
      title: t.title,
      artist: t.artist,
      artwork: t.artworkLarge ?? t.artwork,
      playing: s.playing,
      position: s.position,
      duration: s.duration || t.duration,
    }).catch(() => {});
  };

  const item = (t: Track): LibItem => ({ id: t.key, title: t.title, artist: t.artist, artwork: t.artwork });
  const lists = () => {
    const s = usePlayer.getState();
    const lib = useLibrary.getState();
    return { queue: s.queue.slice(0, 100), liked: lib.likes.slice(0, 100), recent: lib.recent.slice(0, 50) };
  };

  /** "queue/<key>" | "liked/<key>" | "recent/<key>": play that track inside its list. */
  function playFromBrowse(id: string) {
    const slash = id.indexOf('/');
    const list = id.slice(0, slash) as 'queue' | 'liked' | 'recent';
    const key = id.slice(slash + 1);
    const tracks = lists()[list] ?? [];
    const i = tracks.findIndex((t) => t.key === key);
    if (i < 0) return;
    if (list === 'queue') usePlayer.getState().jump(i);
    else usePlayer.getState().playQueue(tracks, i, { title: list === 'liked' ? 'Liked' : 'Recent', id: list });
  }

  /** "Hey Google, play <query> on Sonara": the best matches become the queue. */
  async function playFromSearch(query: string) {
    try {
      const q = query.trim();
      const tracks = q ? (await api.search(q, 'all')).tracks : lists().liked;
      if (tracks.length) usePlayer.getState().playQueue(tracks.slice(0, 30), 0, { title: q || 'Liked', id: `search:${q}` });
    } catch {
      /* nothing to play */
    }
  }

  let libSig = '';
  let libTimer: ReturnType<typeof setTimeout> | undefined;
  /** Publish the browse tree when it changes (at most every two seconds). */
  const publishLibrary = () => {
    // Throttle, not debounce: the player store ticks several times a second while it plays.
    if (libTimer) return;
    libTimer = setTimeout(() => {
      libTimer = undefined;
      const l = lists();
      const sig = [l.queue.length, l.queue[0]?.key, l.liked.length, l.liked[0]?.key, l.recent[0]?.key].join('|');
      if (sig === libSig) return;
      libSig = sig;
      const ru = navigator.language.toLowerCase().startsWith('ru');
      MediaControls.setLibrary({
        queue: l.queue.map(item),
        liked: l.liked.map(item),
        recent: l.recent.map(item),
        titles: { queue: ru ? 'Очередь' : 'Up next', liked: ru ? 'Любимое' : 'Favorites', recent: ru ? 'Недавнее' : 'Recent' },
      }).catch(() => {});
    }, 2000);
  };
  useLibrary.subscribe(publishLibrary);

  usePlayer.subscribe((s) => {
    publishLibrary();
    const t = s.queue[s.index];
    const key = t?.key ?? '';
    // Send on track / state change, on seeks, and every 10 s to keep the notification's progress honest.
    const expected = lastPos + (lastPlaying ? (Date.now() - lastSent) / 1000 : 0);
    const seeked = Math.abs(s.position - expected) > 3;
    if (key !== lastKey || s.playing !== lastPlaying || seeked || Date.now() - lastSent > 10_000) send();
  });
}
