import { create } from 'zustand';
import { api } from '../core';
import type { Track } from '../core/types';
import { fetchStreamParts, looksLikeAudio } from './fetchAudio';

/**
 * Offline downloads: the audio file, the cover and the track's metadata (title, artists…) are kept
 * in IndexedDB, so a downloaded track plays, shows its cover and is listed without a network.
 * Works the same in the desktop and Android webviews and in the browser.
 */
const DB = 'sonara-offline';
const FILES = 'files'; // key -> { audio: Blob, art?: Blob } or { hls: StoredHls, art?: Blob }

/** An HLS stream kept piece by piece: SoundCloud's fMP4 pieces cannot be joined into one file. */
interface StoredHls {
  init?: Blob;
  segs: Blob[];
  durations: number[];
}
const META = 'meta'; // key -> OfflineEntry

export interface OfflineEntry {
  track: Track;
  size: number;
  at: number;
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () =>
  (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(FILES);
      r.result.createObjectStore(META);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));

const tx = async <T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

interface Job {
  track: Track;
  /** 0..1 while downloading. */
  progress: number;
}

interface OfflineState {
  /** Downloaded tracks by key (metadata only; files stay in IndexedDB). */
  items: Record<string, OfflineEntry>;
  queue: Job[];
  failed: string[];
  ready: boolean;
}

export const useOffline = create<OfflineState>(() => ({ items: {}, queue: [], failed: [], ready: false }));

/** Load the list once at startup. */
export async function initOffline() {
  try {
    const all = await tx<OfflineEntry[]>(META, 'readonly', (s) => s.getAll());
    useOffline.setState({ items: Object.fromEntries(all.map((e) => [e.track.key, e])), ready: true });
  } catch (e) {
    console.warn('[offline] unavailable', e);
    useOffline.setState({ ready: true });
  }
}

export const isDownloaded = (key: string) => !!useOffline.getState().items[key];

export interface OfflinePlayback {
  url: string;
  kind: 'progressive' | 'hls';
}

/** Object URLs of the previous offline playback, revoked once the element has moved on. */
let playingUrls: string[] = [];

/**
 * How to play a downloaded track: a file URL, or a local HLS playlist whose pieces are blob URLs
 * (hls.js reads them). Null when the track is not downloaded.
 */
export async function offlinePlayback(key: string): Promise<OfflinePlayback | null> {
  if (!isDownloaded(key)) return null;
  const f = await tx<{ audio?: Blob; hls?: StoredHls } | undefined>(FILES, 'readonly', (s) => s.get(key)).catch(() => undefined);
  const made: string[] = [];
  const url = (b: Blob) => {
    const u = URL.createObjectURL(b);
    made.push(u);
    return u;
  };
  let result: OfflinePlayback | null = null;
  if (f?.audio) result = { url: url(f.audio), kind: 'progressive' };
  else if (f?.hls) {
    const h = f.hls;
    const target = Math.max(1, Math.ceil(Math.max(0, ...h.durations)));
    const lines = ['#EXTM3U', '#EXT-X-VERSION:7', `#EXT-X-TARGETDURATION:${target}`, '#EXT-X-PLAYLIST-TYPE:VOD'];
    if (h.init) lines.push(`#EXT-X-MAP:URI="${url(h.init)}"`);
    h.segs.forEach((seg, i) => lines.push(`#EXTINF:${h.durations[i] ?? 10},`, url(seg)));
    lines.push('#EXT-X-ENDLIST');
    result = { url: url(new Blob([lines.join('\n')], { type: 'application/vnd.apple.mpegurl' })), kind: 'hls' };
  }
  // The previous track's URLs stay valid for a while: its element may still be finishing a load.
  const old = playingUrls;
  playingUrls = made;
  setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 30_000);
  return result;
}

const artUrls = new Map<string, string>();
/** Cover of a downloaded track as an object URL (cached), for offline display. */
export async function offlineArtUrl(key: string): Promise<string | null> {
  if (artUrls.has(key)) return artUrls.get(key)!;
  const f = await tx<{ art?: Blob } | undefined>(FILES, 'readonly', (s) => s.get(key)).catch(() => undefined);
  if (!f?.art) return null;
  const u = URL.createObjectURL(f.art);
  artUrls.set(key, u);
  return u;
}

async function fetchArt(url?: string): Promise<Blob | undefined> {
  if (!url) return undefined;
  try {
    const { BINARY_HINT, nativeFetch } = await import('../platform');
    const r = await (nativeFetch ?? fetch)(url, nativeFetch ? { headers: { [BINARY_HINT]: '1' } } : undefined);
    return r.ok ? await r.blob() : undefined;
  } catch {
    return undefined;
  }
}

async function downloadOne(track: Track) {
  const setProgress = (p: number) => useOffline.setState((s) => ({ queue: s.queue.map((j) => (j.track.key === track.key ? { ...j, progress: p } : j)) }));
  const info = await api.stream(track);
  console.info(`[offline] ${track.source} ${info.kind} mime ${info.mime ?? 'none'} for ${track.title}`);
  const parts = await fetchStreamParts(info, setProgress);
  let stored: { audio: Blob } | { hls: StoredHls };
  let size: number;
  // A 30-second preview is not worth keeping as "offline".
  if (parts.kind === 'file') {
    const audio = parts.blob;
    if (audio.size < 64 * 1024) throw new Error(`file too small: ${audio.size} bytes (${audio.type || 'no type'})`);
    if (!(await looksLikeAudio(audio))) throw new Error(`not an audio file: ${audio.size} bytes, ${audio.type || 'no type'}`);
    stored = { audio };
    size = audio.size;
  } else {
    const type = parts.mime;
    const init = parts.init ? new Blob([parts.init], { type }) : undefined;
    const segs = parts.segs.map((b) => new Blob([b], { type }));
    size = (init?.size ?? 0) + segs.reduce((n, b) => n + b.size, 0);
    if (size < 64 * 1024) throw new Error(`stream too small: ${size} bytes (${type})`);
    if (!segs.length || !(await looksLikeAudio(segs[0]))) throw new Error(`not an audio segment: ${type}`);
    stored = { hls: { init, segs, durations: parts.durations } };
  }
  console.info(`[offline] saved ${track.title}: ${size} bytes, ${parts.kind === 'hls' ? `hls ${parts.segs.length} pieces` : parts.blob.type || 'no type'}`);
  const art = await fetchArt(track.artworkLarge ?? track.artwork);
  const entry: OfflineEntry = { track: { ...track, sc: undefined }, size: size + (art?.size ?? 0), at: Date.now() };
  await tx(FILES, 'readwrite', (s) => s.put({ ...stored, art }, track.key));
  await tx(META, 'readwrite', (s) => s.put(entry, track.key));
  useOffline.setState((s) => ({ items: { ...s.items, [track.key]: entry } }));
}

let running = false;
async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = useOffline.getState().queue[0];
      if (!job) break;
      try {
        await downloadOne(job.track);
      } catch (e) {
        console.warn(`[offline] download failed: ${job.track.title} (${job.track.source ?? '?'}, ${job.track.key})`, e);
        useOffline.setState((s) => ({ failed: [...s.failed, job.track.key] }));
      }
      useOffline.setState((s) => ({ queue: s.queue.slice(1) }));
    }
  } finally {
    running = false;
  }
}

/** Queue tracks for download (already downloaded or queued ones are skipped). Returns how many were added. */
export function download(tracks: Track[]): number {
  const st = useOffline.getState();
  const queued = new Set(st.queue.map((j) => j.track.key));
  const add = tracks.filter((t) => !st.items[t.key] && !queued.has(t.key));
  if (!add.length) return 0;
  useOffline.setState((s) => ({ queue: [...s.queue, ...add.map((track) => ({ track, progress: 0 }))], failed: s.failed.filter((k) => !add.some((t) => t.key === k)) }));
  void pump();
  return add.length;
}

export async function removeDownload(key: string) {
  await tx(FILES, 'readwrite', (s) => s.delete(key)).catch(() => {});
  await tx(META, 'readwrite', (s) => s.delete(key)).catch(() => {});
  const u = artUrls.get(key);
  if (u) URL.revokeObjectURL(u), artUrls.delete(key);
  useOffline.setState((s) => {
    const items = { ...s.items };
    delete items[key];
    return { items };
  });
}

/** Delete every download (files, covers, list). */
export async function clearDownloads() {
  cancelDownloads();
  await tx(FILES, 'readwrite', (s) => s.clear()).catch(() => {});
  await tx(META, 'readwrite', (s) => s.clear()).catch(() => {});
  for (const u of artUrls.values()) URL.revokeObjectURL(u);
  artUrls.clear();
  useOffline.setState({ items: {}, failed: [] });
}

/** Stop queued downloads (the one in progress finishes). */
export const cancelDownloads = () => useOffline.setState((s) => ({ queue: s.queue.slice(0, 1) }));

export const offlineSize = () => Object.values(useOffline.getState().items).reduce((n, e) => n + e.size, 0);
