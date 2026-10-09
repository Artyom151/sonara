import type Hls from 'hls.js';
import { api } from '../core';
import type { Track } from '../core/types';
import { isTauri, nativeFetch } from '../platform';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { toast } from '../ui/components/Toast';

/**
 * Single audio element driven by the player store. Subscribes to the store and
 * reacts to track/playing changes; pushes time updates back into the store.
 */
const audio = new Audio();
audio.preload = 'auto';
audio.crossOrigin = 'anonymous';

let hls: Hls | null = null;
let loadedKey: string | null = null;
let loadToken = 0;
let blobUrl: string | null = null;
/** True while a new source is being attached (the element may emit a spurious pause). */
let switching = false;

const resetSource = () => {
  hls?.destroy();
  hls = null;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = null;
};

// MWEB client identity: the stream URLs are issued to it (core/youtube.ts).
const YT_UA = 'Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)';
const CHUNK = 1 << 20; // googlevideo throttles long un-ranged reads; 1 MB ranges come at full speed

/**
 * Native platforms: download YouTube audio through the native fetch in parallel 1 MB ranges and
 * play it from a blob. The webview's own media stack cannot be used for googlevideo URLs:
 * WebKitGTK's GStreamer source never starts (play() hangs without an error) and other webviews
 * get 403 for URLs issued to the iOS client.
 */
async function viaNativeBlob(url: string, token: number) {
  if (!nativeFetch) throw new Error('unavailable');
  const get = async (from: number, to: number) => {
    for (let attempt = 0; ; attempt++) {
      const r = await nativeFetch!(url, { headers: { 'User-Agent': YT_UA, Range: `bytes=${from}-${to}` } });
      if (r.ok) return { buf: await r.arrayBuffer(), total: Number(r.headers.get('content-range')?.split('/')[1]) || 0, len: Number(r.headers.get('content-length')) || 0 };
      if (attempt >= 2) throw new Error(`HTTP ${r.status}`);
    }
  };
  const fromUrl = Number(new URL(url).searchParams.get('clen')) || 0;
  const first = await get(0, CHUNK - 1);
  const total = fromUrl || first.total || first.buf.byteLength;
  const parts: ArrayBuffer[] = [first.buf];
  if (first.buf.byteLength < total) {
    const ranges: [number, number][] = [];
    for (let from = first.buf.byteLength; from < total; from += CHUNK) ranges.push([from, Math.min(total, from + CHUNK) - 1]);
    const out: ArrayBuffer[] = new Array(ranges.length);
    let next = 0;
    const worker = async () => {
      while (next < ranges.length && token === loadToken) {
        const i = next++;
        out[i] = (await get(ranges[i][0], ranges[i][1])).buf;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (token !== loadToken) throw new Error('superseded');
    parts.push(...out);
  }
  const mime = new URL(url).searchParams.get('mime') ?? (/\.yandex\.net\//.test(url) ? 'audio/mpeg' : 'audio/mp4');
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(new Blob(parts, { type: mime }));
  return blobUrl;
}

let proxyBase: Promise<string | null> | null = null;
const mediaProxyBase = () =>
  (proxyBase ??= import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke<string | null>('media_proxy_base'))
    .catch(() => null));

/** Audio the webview cannot fetch itself: YouTube (client-bound URLs) and Yandex (CDN refuses our Origin). */
const isYouTubeAudio = (t: Track) => t.source === 'youtube' || t.source === 'deezer' || t.source === 'yandex';
const PROXIED = /\.googlevideo\.com\/|\.yandex\.net\//;

async function attach(url: string, kind: 'progressive' | 'hls') {
  switching = true;
  setTimeout(() => (switching = false), 0);
  resetSource();
  if (kind === 'hls' && !audio.canPlayType('application/vnd.apple.mpegurl')) {
    const { default: HlsCtor } = await import('hls.js');
    hls = new HlsCtor({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(audio);
    return;
  }
  audio.src = url;
}

async function load(track: Track, autoplay: boolean, startAt = 0) {
  const token = ++loadToken;
  loadedKey = track.key;
  usePlayer.getState().patch({ loading: true, error: null, buffered: 0, duration: track.duration || 0 });
  updateMediaSession(track);
  try {
    const s = await api.stream(track);
    if (token !== loadToken) return;
    // Desktop (Tauri): always through the native fetch, see viaNativeBlob. Android plays the
    // URL directly and falls back to it in playSafe.
    if (isYouTubeAudio(track) && isTauri && PROXIED.test(s.url)) {
      // Desktop: through the app's local media proxy (src-tauri/src/media_proxy.rs): streams,
      // seeks with Range, and keeps megabytes of audio out of the IPC bridge.
      const base = await mediaProxyBase();
      if (token !== loadToken) return;
      await attach(base ? base + encodeURIComponent(s.url) : await viaNativeBlob(s.url, token), 'progressive');
    } else await attach(s.url, s.kind);
    // Resume position only once metadata is known; setting it earlier is ignored or aborts play().
    if (startAt > 1) {
      const seekTo = () => {
        if (startAt < (audio.duration || Infinity) - 2) audio.currentTime = startAt;
      };
      if (audio.readyState >= 1) seekTo();
      else audio.addEventListener('loadedmetadata', seekTo, { once: true });
    }
    if (autoplay) await playSafe(track, s.url);
    useLibrary.getState().pushRecent(track);
  } catch (e) {
    if (token !== loadToken) return;
    onUnavailable(track, e as Error);
  }
}

async function playSafe(track: Track, url: string) {
  try {
    await audio.play();
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'NotAllowedError') {
      usePlayer.getState().patch({ playing: false, loading: false });
      return;
    }
    // A fresh source can abort the first play() (seek / source switch in flight): retry when ready.
    if (name === 'AbortError') {
      await new Promise<void>((resolve) => {
        if (audio.readyState >= 3) return resolve();
        audio.addEventListener('canplay', () => resolve(), { once: true });
        setTimeout(resolve, 4000);
      });
      if (usePlayer.getState().playing) await audio.play();
      return;
    }
    if (isYouTubeAudio(track) && nativeFetch && !isTauri && !url.startsWith('blob:')) {
      audio.src = await viaNativeBlob(url, loadToken);
      await audio.play();
      return;
    }
    throw e;
  }
}

function onUnavailable(track: Track, e: Error) {
  console.warn('[player]', track.title, e);
  const st = usePlayer.getState();
  st.patch({ loading: false, error: e.message });
  toast(`«${track.title}» — ${navigator.language.startsWith('ru') ? 'недоступен' : 'unavailable'}`);
  if (useSettings.getState().skipUnavailable && st.index + 1 < st.queue.length) setTimeout(() => usePlayer.getState().next(true), 400);
}

audio.addEventListener('timeupdate', () => usePlayer.getState().patch({ position: audio.currentTime }));
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration)) usePlayer.getState().patch({ duration: audio.duration });
});
audio.addEventListener('progress', () => {
  if (audio.buffered.length) usePlayer.getState().patch({ buffered: audio.buffered.end(audio.buffered.length - 1) });
});
// Element events only mirror *external* changes (media keys, OS interruptions) into the store.
// Our own play()/pause() calls already match the store, so these become no-ops — no feedback loop.
audio.addEventListener('playing', () => {
  const st = usePlayer.getState();
  st.patch(st.playing ? { loading: false } : { loading: false, playing: true });
});
audio.addEventListener('waiting', () => usePlayer.getState().patch({ loading: true }));
audio.addEventListener('pause', () => {
  if (switching || audio.ended) return;
  const st = usePlayer.getState();
  if (st.playing) st.patch({ playing: false, loading: false });
});
audio.addEventListener('error', () => {
  const t = usePlayer.getState().current();
  if (!t || t.key !== loadedKey || !audio.src) return;
  // Android: retry through the native fetch. Desktop never does (megabytes over IPC freeze the page).
  if (isYouTubeAudio(t) && nativeFetch && !isTauri && !blobUrl) {
    const src = audio.src;
    viaNativeBlob(src, loadToken)
      .then((u) => {
        audio.src = u;
        return audio.play();
      })
      .catch((e) => onUnavailable(t, e));
    return;
  }
  onUnavailable(t, new Error(audio.error?.message || 'Playback error'));
});
audio.addEventListener('ended', async () => {
  const st = usePlayer.getState();
  const atEnd = st.index + 1 >= st.queue.length && st.repeat === 'off';
  // The Wave refills its own queue (player/wave.ts); other contexts continue with related tracks.
  if (atEnd && useSettings.getState().autoplay && st.queue.length && st.context.id !== 'wave') {
    // Keep the music going with related tracks.
    try {
      const cur = st.current()!;
      const dislikes = new Set(useLibrary.getState().dislikes);
      const keys = new Set(st.queue.map((t) => t.key));
      const more = (await api.related(cur)).filter((t) => !keys.has(t.key) && !dislikes.has(t.key));
      if (more.length) usePlayer.getState().addToQueue(more.slice(0, 15));
    } catch {
      /* nothing to add */
    }
  }
  usePlayer.getState().next(true);
  if (usePlayer.getState().repeat === 'one') {
    audio.currentTime = 0;
    audio.play();
  }
});

export const seek = (t: number) => {
  audio.currentTime = t;
  usePlayer.getState().patch({ position: t });
};

/** Flip the desired state; the store subscription below performs the actual play / pause. */
export const togglePlay = () => {
  const st = usePlayer.getState();
  if (!st.current()) return;
  st.patch({ playing: !st.playing });
};

export const setVolume = (v: number) => {
  audio.volume = v;
  usePlayer.getState().patch({ volume: v });
};

// React to store changes — edge-triggered: only a change of track or of `playing` acts on the element.
let prevKey: string | undefined;
usePlayer.subscribe((s, prev) => {
  const cur = s.queue[s.index];
  if (cur?.key !== prevKey) {
    prevKey = cur?.key;
    if (cur && s.playing) load(cur, true);
    else if (!cur) {
      audio.pause();
      resetSource();
      audio.removeAttribute('src');
      loadedKey = null;
    }
    return;
  }
  if (!cur || s.playing === prev.playing) return;
  if (s.playing) {
    if (loadedKey !== cur.key) return void load(cur, true, s.position);
    audio.play().catch((e) => {
      if ((e as Error).name !== 'AbortError') usePlayer.getState().patch({ playing: false });
    });
  } else if (!audio.paused) {
    audio.pause();
  }
});

// Restore the last session paused.
{
  const s = usePlayer.getState();
  prevKey = s.queue[s.index]?.key;
  audio.volume = s.volume;
  usePlayer.setState({ playing: false, loading: false });
}

function updateMediaSession(t: Track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: usePlayer.getState().context.title,
    artwork: t.artworkLarge ? [{ src: t.artworkLarge, sizes: '500x500', type: 'image/jpeg' }] : [],
  });
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => usePlayer.getState().patch({ playing: true }));
  ms.setActionHandler('pause', () => usePlayer.getState().patch({ playing: false }));
  ms.setActionHandler('nexttrack', () => usePlayer.getState().next());
  ms.setActionHandler('previoustrack', () => usePlayer.getState().prev());
  ms.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime));
}

export { audio };
