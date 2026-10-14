import type Hls from 'hls.js';
import { api } from '../core';
import type { Track } from '../core/types';
import { isTauri, nativeFetch } from '../platform';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { pushNotice, tr } from '../store/islandNotice';
import { toast } from '../ui/components/Toast';
import { audioMime, downloadRanged, mediaProxyBase, PROXIED, YT_UA } from './fetchAudio';
import { continueQueue, wantsContinuation } from './autoplay';
import { castSeek, castSetPlaying, castSetVolume, castTrack, isCasting } from './cast';
import { initOffline, isDownloaded, offlinePlayback, removeDownload } from './offline';
import { useSleep } from './sleep';

void initOffline();

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
/** Key of the track playing from its download (see brokenDownload). */
let localKey: string | null = null;
/** True while a new source is being attached (the element may emit a spurious pause). */
let switching = false;

const resetSource = () => {
  hls?.destroy();
  hls = null;
  // Revoking a blob the element still plays cuts its data (static, errors): wait until the element
  // has moved on to its next source.
  if (blobUrl) {
    const old = blobUrl;
    audio.addEventListener('loadstart', () => URL.revokeObjectURL(old), { once: true });
  }
  blobUrl = null;
};

/**
 * Native platforms: download YouTube audio through the native fetch in parallel 1 MB ranges and
 * play it from a blob. The webview's own media stack cannot be used for googlevideo URLs:
 * WebKitGTK's GStreamer source never starts (play() hangs without an error) and other webviews
 * get 403 for URLs issued to the iOS client.
 */
async function viaNativeBlob(url: string, token: number) {
  if (!nativeFetch) throw new Error('unavailable');
  const parts = await downloadRanged(url, nativeFetch, { headers: /\.googlevideo\.com\//.test(url) ? { 'User-Agent': YT_UA } : {}, alive: () => token === loadToken });
  if (token !== loadToken) throw new Error('superseded');
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(new Blob(parts, { type: audioMime(url) }));
  return blobUrl;
}

const isYouTubeAudio = (t: Track) => t.source === 'youtube' || t.source === 'deezer' || t.source === 'yandex';

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
  console.info(`[player] attach ${kind} ${url.slice(0, 24)}… token ${loadToken}`);
  audio.src = url;
}

/** Pause the local element without the store hearing about it (its pause event would stop the cast). */
function quiet() {
  switching = true;
  audio.pause();
  setTimeout(() => (switching = false), 150);
}

// player/cast.ts: a device was connected / left.
window.addEventListener('sonara-cast', () => {
  quiet();
  const cur = usePlayer.getState().current();
  if (cur) loadedKey = cur.key;
});
window.addEventListener('sonara-cast-end', () => {
  const st = usePlayer.getState();
  const cur = st.current();
  if (!cur) return;
  loadedKey = null; // force a reload of the source on this device
  if (st.playing) void load(cur, true, st.position);
});

async function load(track: Track, autoplay: boolean, startAt = 0) {
  // A Chromecast is connected: the device plays, this element stays quiet (player/cast.ts).
  if (isCasting()) {
    quiet();
    loadedKey = track.key;
    usePlayer.getState().patch({ loading: true, error: null, duration: track.duration || 0 });
    updateMediaSession(track);
    if (await castTrack(track, startAt, autoplay)) return;
    // Not castable (a download, a local link): fall through and play it here.
  }
  const token = ++loadToken;
  if (loadedKey !== track.key) retried.delete(track.key);
  loadedKey = track.key;
  usePlayer.getState().patch({ loading: true, error: null, buffered: 0, duration: track.duration || 0 });
  updateMediaSession(track);
  try {
    // Downloaded: play the stored file, no network needed.
    const local = await offlinePlayback(track.key);
    if (token !== loadToken) return;
    const s = local ? { url: local.url, kind: local.kind } : await api.stream(track);
    if (token !== loadToken) return;
    localKey = local ? track.key : null;
    // offline.ts keeps the object URLs alive while the track plays and revokes them afterwards.
    if (local) await attach(local.url, local.kind);
    // Desktop (Tauri): always through the native fetch, see viaNativeBlob. Android plays the
    // URL directly and falls back to it in playSafe.
    else if (isYouTubeAudio(track) && isTauri && PROXIED.test(s.url)) {
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
    if (localKey === track.key) return brokenDownload(track, autoplay, startAt, e as Error);
    onUnavailable(track, e as Error);
  }
}

/** A download that does not play (damaged file): drop it and stream the track instead. */
function brokenDownload(track: Track, autoplay: boolean, startAt: number, e: Error) {
  console.warn('[player] download unplayable, streaming instead:', track.title, e);
  localKey = null;
  void removeDownload(track.key).then(() => load(track, autoplay, startAt));
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

/** Tracks already retried with a fresh link (a cached one may have expired early). */
const retried = new Set<string>();

function onUnavailable(track: Track, e: Error) {
  if (!retried.has(track.key)) {
    retried.add(track.key);
    console.warn('[player] retrying with a fresh link:', track.title, e);
    api.forgetStream(track.key);
    void load(track, true, audio.currentTime || 0);
    return;
  }
  console.warn('[player]', track.title, e);
  const st = usePlayer.getState();
  st.patch({ loading: false, error: e.message });
  toast(`«${track.title}» — ${navigator.language.startsWith('ru') ? 'недоступен' : 'unavailable'}`);
  pushNotice({ kind: 'warn', text: tr('Track unavailable', 'Трек недоступен'), detail: track.title });
  if (useSettings.getState().skipUnavailable && st.index + 1 < st.queue.length) setTimeout(() => usePlayer.getState().next(true), 400);
}

audio.addEventListener('timeupdate', () => usePlayer.getState().patch({ position: audio.currentTime }));
audio.addEventListener('durationchange', () => {
  // Streams without a known length report 0 or Infinity: keep the catalogue duration then.
  if (Number.isFinite(audio.duration) && audio.duration > 0) usePlayer.getState().patch({ duration: audio.duration });
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
  console.warn(`[player] element error on ${audio.src.slice(0, 24)}…: code ${audio.error?.code}, ${audio.error?.message}, readyState ${audio.readyState}, networkState ${audio.networkState}, blobUrl ${blobUrl ? blobUrl.slice(-8) : 'none'}, localKey ${localKey ? 'yes' : 'no'}`);
  if (localKey === t.key) return brokenDownload(t, usePlayer.getState().playing, audio.currentTime, new Error(audio.error?.message || 'Playback error'));
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
  console.info(`[player] ended at ${audio.currentTime.toFixed(1)} s of ${audio.duration} s, readyState ${audio.readyState}, src ${audio.src.slice(0, 40)}`);
  // Sleep timer "end of track": stop here instead of moving on.
  if (useSleep.getState().endOfTrack) {
    useSleep.getState().set(null);
    usePlayer.getState().patch({ playing: false, position: 0 });
    return;
  }
  const st = usePlayer.getState();
  const atEnd = st.index + 1 >= st.queue.length && st.repeat === 'off';
  // The Wave refills its own queue (player/wave.ts); other contexts get similar tracks appended
  // when their last track starts (player/autoplay.ts). If that did not finish in time, wait here.
  if (atEnd && wantsContinuation()) await continueQueue();
  usePlayer.getState().next(true);
  if (usePlayer.getState().repeat === 'one') {
    audio.currentTime = 0;
    audio.play();
  }
});

export const seek = (t: number) => {
  if (isCasting()) {
    castSeek(t);
    return usePlayer.getState().patch({ position: t });
  }
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
  castSetVolume(v);
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
  if (isCasting()) {
    // A track changed while paused: the device does not have it yet.
    if (s.playing && loadedKey !== cur.key) void load(cur, true, s.position);
    else castSetPlaying(s.playing);
    return;
  }
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

// Sleep timer: pause once the time is up.
setInterval(() => {
  const { until } = useSleep.getState();
  if (until && Date.now() >= until) {
    useSleep.getState().set(null);
    usePlayer.getState().patch({ playing: false });
  }
}, 1000);

// Resolve the next track's stream a few seconds into playback (core/api.ts caches it), so the
// switch is instant: no search, no YouTube token on the boundary.
let prefetched = '';
audio.addEventListener('playing', () => {
  const st = usePlayer.getState();
  const next = st.queue[st.index + 1];
  if (!next || prefetched === next.key || isDownloaded(next.key)) return;
  prefetched = next.key;
  setTimeout(() => void api.stream(next).catch(() => {}), 5000);
});
