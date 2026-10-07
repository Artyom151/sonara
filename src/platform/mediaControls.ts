import { registerPlugin } from '@capacitor/core';
import { seek } from '../player/engine';
import { usePlayer } from '../store/player';
import { isAndroid } from '.';

/**
 * Android: keeps playback alive in the background through a foreground media service
 * and mirrors the player into the system media notification / lock screen / headset buttons.
 */
interface MediaControlsPlugin {
  update(o: { title: string; artist: string; artwork?: string; playing: boolean; position: number; duration: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'action', cb: (e: { action: 'play' | 'pause' | 'next' | 'prev' | 'seek'; position?: number }) => void): Promise<{ remove: () => void }>;
}

if (isAndroid) {
  const MediaControls = registerPlugin<MediaControlsPlugin>('MediaControls');

  MediaControls.addListener('action', ({ action, position }) => {
    const p = usePlayer.getState();
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

  usePlayer.subscribe((s) => {
    const t = s.queue[s.index];
    const key = t?.key ?? '';
    // Send on track / state change, on seeks, and every 10 s to keep the notification's progress honest.
    const expected = lastPos + (lastPlaying ? (Date.now() - lastSent) / 1000 : 0);
    const seeked = Math.abs(s.position - expected) > 3;
    if (key !== lastKey || s.playing !== lastPlaying || seeked || Date.now() - lastSent > 10_000) send();
  });
}
