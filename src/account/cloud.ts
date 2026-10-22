import { create } from 'zustand';
import type { Playlist, Track } from '../core/types';
import { isAndroid, isCapacitor, isTauri } from '../platform';
import { seek } from '../player/engine';
import { useLibrary, type LocalPlaylist } from '../store/library';
import { usePlayer, type QueueContext } from '../store/player';
import { useSettings, type Settings } from '../store/settings';
import { snapshot } from './remote';
import { useAccount } from './store';
import { flushPendingLikes, reconcileLikes, setOnLikesChanged } from './sync';
import type { SyncRow } from './types';

/**
 * Sync between devices signed in to the same account (Supabase table public.user_sync,
 * or this device's storage for the local account):
 *  - playlists: merged per playlist (newest edit wins, deletions are remembered);
 *  - saved playlists, history, "don't recommend", preferences: newest section wins;
 *  - likes: public.likes, re-read when another device bumps likes_at;
 *  - now playing: shown on the other devices as "Continue here" (handoff).
 * Realtime pushes changes as they happen; a focus / resume pull covers missed events.
 */

export interface NowPlaying {
  track: Track;
  queue: Track[];
  index: number;
  position: number;
  playing: boolean;
  context?: QueueContext;
  at: number;
  device: string;
  deviceName: string;
}

interface Stamped<T> {
  v: T;
  at: number;
}
interface PlaylistsSection {
  items: LocalPlaylist[];
  deleted: Record<string, number>;
}

/** Preferences that follow the account. Graphics, island, Discord etc. stay per device. */
const PREF_KEYS = [
  'lang',
  'accentMode',
  'customAccent',
  'tintInterface',
  'glass',
  'sources',
  'region',
  'autoplay',
  'skipUnavailable',
  'showLyricsLine',
  'crossfade',
] as const satisfies readonly (keyof Settings)[];
type Prefs = Pick<Settings, (typeof PREF_KEYS)[number]>;

type Stampable = 'saved' | 'recent' | 'dislikes' | 'prefs';
type Section = Stampable | 'playlists' | 'likes' | 'now';

const DEVICE = 'sonara.device';
export const deviceId = (() => {
  try {
    let id = localStorage.getItem(DEVICE);
    if (!id) localStorage.setItem(DEVICE, (id = crypto.randomUUID()));
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();

const ua = navigator.userAgent;
const os = isAndroid
  ? 'Android'
  : /iPad/.test(ua)
    ? 'iPad'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux|X11/.test(ua)
            ? 'Linux'
            : 'Web';
export const deviceName = isTauri || isCapacitor || os === 'Web' ? os : `${os} · Web`;

export const useCloud = create<{
  status: 'off' | 'syncing' | 'ok' | 'error' | 'not_setup';
  lastSync: number;
  /** What another device played last (null when this device is the latest). */
  remoteNow: NowPlaying | null;
  /** When this device last started playback or resumed a handoff. */
  playedHere: number;
}>(() => ({ status: 'off', lastSync: 0, remoteNow: null, playedHere: 0 }));

// Per-account bookkeeping (this device)

interface Meta {
  /** Last local change of each stamped section. */
  at: Record<Stampable, number>;
  /** Playlist tombstones: id → deletion time. */
  deleted: Record<string, number>;
  likesAt: number;
  /** First sync for this account on this device done (until then lists are merged, not replaced). */
  joined: boolean;
}
const META = 'sonara.sync.meta.';
const PENDING = 'sonara.sync.pending.';
const freshMeta = (): Meta => ({ at: { saved: 0, recent: 0, dislikes: 0, prefs: 0 }, deleted: {}, likesAt: 0, joined: false });
const loadMeta = (uid: string): Meta => {
  try {
    return { ...freshMeta(), ...(JSON.parse(localStorage.getItem(META + uid) ?? '{}') as Partial<Meta>) };
  } catch {
    return freshMeta();
  }
};
const loadPending = (id: string): SyncRow => {
  try {
    return JSON.parse(localStorage.getItem(PENDING + id) ?? '{}') as SyncRow;
  } catch {
    return {};
  }
};

let uid: string | null = null;
let meta = freshMeta();
let unsubscribe: (() => void) | null = null;
/** True while remote data is written into the local stores (so it is not echoed back). */
let applying = false;
let pending: SyncRow = {};
let sending: Promise<boolean> | null = null;
let session = 0;
const savePending = (id: string) => {
  try {
    if (Object.keys(pending).length) localStorage.setItem(PENDING + id, JSON.stringify(pending));
    else localStorage.removeItem(PENDING + id);
  } catch {
    /* retry while this session remains open */
  }
};

const saveMeta = () => {
  if (!uid) return;
  try {
    localStorage.setItem(META + uid, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
};
const provider = () => useAccount.getState().provider();
const prefsOf = (s: Settings): Prefs => Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])) as Prefs;
const slimPlaylist = (p: LocalPlaylist): LocalPlaylist => ({ ...p, tracks: p.tracks.map(snapshot) });
const sig = (list: LocalPlaylist[]) => list.map((p) => `${p.id}:${p.updatedAt}`).join('|');

function mergePlaylists(local: LocalPlaylist[], remote: LocalPlaylist[], deleted: Record<string, number>) {
  const byId = new Map<string, LocalPlaylist>();
  for (const p of [...remote, ...local]) {
    const have = byId.get(p.id);
    if (!have || p.updatedAt > have.updatedAt) byId.set(p.id, p);
  }
  return [...byId.values()].filter((p) => !(deleted[p.id] >= p.updatedAt)).sort((a, b) => b.createdAt - a.createdAt);
}

function unionBy<T>(first: T[], second: T[], key: (x: T) => string) {
  const seen = new Set<string>();
  return [...first, ...second].filter((x) => {
    const k = key(x);
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

const LIB_FIELD = { saved: 'savedPlaylists', recent: 'recent', dislikes: 'dislikes' } as const;

function localSection(s: Stampable): unknown {
  if (s === 'prefs') return prefsOf(useSettings.getState());
  const v = useLibrary.getState()[LIB_FIELD[s]];
  return s === 'recent' ? (v as Track[]).map(snapshot) : v;
}

function applySection(s: Stampable, v: unknown) {
  if (s === 'prefs') {
    const patch: Partial<Settings> = {};
    for (const k of PREF_KEYS) if (k in (v as Prefs)) Object.assign(patch, { [k]: (v as Prefs)[k] });
    useSettings.getState().set(patch);
  } else useLibrary.setState({ [LIB_FIELD[s]]: v } as never);
}

function nowPlaying(): NowPlaying | null {
  const st = usePlayer.getState();
  const cur = st.queue[st.index];
  if (!cur) return null;
  const from = Math.max(0, st.index - 20);
  return {
    track: snapshot(cur),
    queue: st.queue.slice(from, st.index + 80).map(snapshot),
    index: st.index - from,
    position: Math.floor(st.position),
    playing: st.playing,
    context: st.context,
    at: Date.now(),
    device: deviceId,
    deviceName,
  };
}

// Pull

let pulling: Promise<void> | null = null;
let pullAgain = false;

/** Fetch the account's row and merge it into this device. Coalesces overlapping calls. */
export function pull(): Promise<void> {
  if (pulling) {
    pullAgain = true;
    return pulling;
  }
  pulling = doPull().finally(() => {
    pulling = null;
    if (pullAgain) {
      pullAgain = false;
      pull();
    }
  });
  return pulling;
}

async function doPull() {
  const id = uid;
  if (!id) return;
  // A failed local write must reach the server before an older remote section is applied.
  while (Object.keys(pending).length) {
    if (!(await sendPending())) return;
    if (uid !== id) return;
  }
  if (uid !== id) return;
  useCloud.setState({ status: 'syncing' });
  let row: SyncRow | null;
  try {
    row = await provider().sync.load(id);
  } catch (e) {
    useCloud.setState({ status: (e as Error).message === 'sync_not_setup' ? 'not_setup' : 'error' });
    return;
  }
  if (uid !== id) return;
  const out: SyncRow = {};
  const joining = !meta.joined;

  applying = true;
  try {
    // Playlists: per playlist.
    const rp = (row?.playlists as PlaylistsSection | null) ?? { items: [], deleted: {} };
    const deleted = { ...rp.deleted };
    for (const [k, t] of Object.entries(meta.deleted)) deleted[k] = Math.max(deleted[k] ?? 0, t);
    const cutoff = Date.now() - 90 * 864e5;
    for (const k of Object.keys(deleted)) if (deleted[k] < cutoff) delete deleted[k];
    meta.deleted = deleted;
    const local = useLibrary.getState().playlists;
    const merged = mergePlaylists(local, rp.items ?? [], deleted);
    if (sig(merged) !== sig(local)) useLibrary.setState({ playlists: merged });
    if (sig(merged) !== sig(rp.items ?? []) || Object.keys(deleted).length !== Object.keys(rp.deleted ?? {}).length)
      out.playlists = { items: merged.map(slimPlaylist), deleted } satisfies PlaylistsSection;

    // Whole sections: newest wins (the first time on this device lists are merged instead).
    for (const s of ['saved', 'recent', 'dislikes', 'prefs'] as const) {
      const r = row?.[s] as Stamped<unknown> | null | undefined;
      if (joining && r) {
        let v = r.v;
        if (s === 'saved') v = unionBy(r.v as Playlist[], useLibrary.getState().savedPlaylists, (p) => p.key);
        if (s === 'recent') v = unionBy(r.v as Track[], useLibrary.getState().recent, (t) => t.key).slice(0, 50);
        if (s === 'dislikes') v = [...new Set([...(r.v as string[]), ...useLibrary.getState().dislikes])];
        applySection(s, v);
        meta.at[s] = s === 'prefs' ? r.at : Date.now();
        if (s !== 'prefs') out[s] = { v: localSection(s), at: meta.at[s] };
      } else if (r && r.at > meta.at[s]) {
        applySection(s, r.v);
        meta.at[s] = r.at;
      } else if (meta.at[s] > (r?.at ?? 0) || (!r && joining)) {
        meta.at[s] ||= Date.now();
        out[s] = { v: localSection(s), at: meta.at[s] };
      }
    }
  } finally {
    applying = false;
  }

  // Likes: another device changed them.
  const likesAt = row?.likes_at ?? 0;
  if (likesAt > meta.likesAt) {
    meta.likesAt = likesAt;
    if (!joining) {
      try {
        reconcileLikes(await provider().likes.list(id));
      } catch {
        /* next pull */
      }
    }
  }
  flushPendingLikes();

  const np = (row?.now_playing as NowPlaying | null) ?? null;
  useCloud.setState({ remoteNow: np && np.device !== deviceId && np.track ? np : null });

  meta.joined = true;
  saveMeta();
  if (uid !== id) return;
  if (Object.keys(out).length) await push(out);
  else useCloud.setState({ status: 'ok', lastSync: Date.now() });
}

// Push

const dirty = new Set<Section>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(section: Section, delay = 1500) {
  if (!uid) return;
  dirty.add(section);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

/** Send every pending section now (also on app hide). */
export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!uid || !dirty.size) return;
  const out: SyncRow = {};
  for (const s of dirty) {
    switch (s) {
      case 'playlists':
        out.playlists = { items: useLibrary.getState().playlists.map(slimPlaylist), deleted: meta.deleted } satisfies PlaylistsSection;
        break;
      case 'likes':
        out.likes_at = Date.now();
        break;
      case 'now': {
        const np = nowPlaying();
        if (np) out.now_playing = np;
        break;
      }
      default:
        out[s] = { v: localSection(s), at: meta.at[s] };
    }
  }
  dirty.clear();
  if (Object.keys(out).length) void push(out);
}

function push(out: SyncRow): Promise<boolean> {
  const id = uid;
  if (!id) return Promise.resolve(false);
  pending = { ...pending, ...out };
  savePending(id);
  return sendPending();
}

function sendPending(): Promise<boolean> {
  if (sending) return sending;
  const id = uid;
  if (!id || !Object.keys(pending).length) return Promise.resolve(true);
  const currentSession = session;
  const p = provider();
  const batch = { ...pending };
  useCloud.setState({ status: 'syncing' });
  const task = (async () => {
    try {
      await p.sync.save(id, batch);
      if (uid === id && session === currentSession) {
        for (const key of Object.keys(batch) as (keyof SyncRow)[]) {
          if (pending[key] === batch[key]) delete pending[key];
        }
        savePending(id);
        if (batch.likes_at) {
          meta.likesAt = batch.likes_at;
          saveMeta();
        }
        useCloud.setState({ status: 'ok', lastSync: Date.now() });
      }
      return true;
    } catch (e) {
      if (uid === id && session === currentSession) {
        useCloud.setState({ status: (e as Error).message === 'sync_not_setup' ? 'not_setup' : 'error' });
      }
      return false;
    }
  })();
  sending = task;
  void task.then((ok) => {
    if (sending !== task) return;
    sending = null;
    if (ok && uid === id && session === currentSession && Object.keys(pending).length) void sendPending();
  });
  return task;
}

const touch = (s: Stampable) => {
  meta.at[s] = Date.now();
  saveMeta();
  schedule(s);
};

// Local changes

useLibrary.subscribe((s, p) => {
  if (applying || !uid) return;
  if (s.playlists !== p.playlists) {
    const ids = new Set(s.playlists.map((x) => x.id));
    for (const x of p.playlists) if (!ids.has(x.id)) meta.deleted[x.id] = Date.now();
    saveMeta();
    schedule('playlists');
  }
  if (s.savedPlaylists !== p.savedPlaylists) touch('saved');
  if (s.recent !== p.recent) touch('recent');
  if (s.dislikes !== p.dislikes) touch('dislikes');
});

useSettings.subscribe((s, p) => {
  if (applying || !uid) return;
  if (PREF_KEYS.some((k) => s[k] !== p[k])) touch('prefs');
});

// Likes are written to public.likes by account/sync; give the rows a moment to land first.
setOnLikesChanged(() => schedule('likes', 2500));

let lastNowPush = 0;
usePlayer.subscribe((s, p) => {
  if (!uid) return;
  const cur = s.queue[s.index];
  const changed = cur?.key !== p.queue[p.index]?.key || s.playing !== p.playing;
  if (changed && s.playing) useCloud.setState({ playedHere: Date.now() });
  if (!cur) return;
  if (changed || (s.playing && Date.now() - lastNowPush > 20_000)) {
    lastNowPush = Date.now();
    schedule('now', changed ? 800 : 0);
  }
});

/** Handoff: continue what another device was playing, at the same position. */
export function resumeHere(np: NowPlaying) {
  const p = usePlayer.getState();
  useCloud.setState({ remoteNow: null, playedHere: Date.now() });
  if (p.queue[p.index]?.key === np.track.key) {
    seek(np.position);
    p.patch({ playing: true });
    return;
  }
  p.patch({ queue: np.queue, baseQueue: np.queue, index: np.index, context: np.context ?? p.context, shuffle: false, position: np.position, playing: false, error: null });
  usePlayer.getState().patch({ playing: true });
}

// Lifecycle

function start(id: string) {
  stop();
  uid = id;
  meta = loadMeta(id);
  pending = loadPending(id);
  unsubscribe = provider().sync.subscribe(id, () => pull());
  pull();
}

function stop() {
  flush();
  session++;
  if (timer) clearTimeout(timer);
  timer = null;
  dirty.clear();
  unsubscribe?.();
  unsubscribe = null;
  uid = null;
  pending = {};
  sending = null;
  useCloud.setState({ status: 'off', remoteNow: null });
}

useAccount.subscribe((s, prev) => {
  if (s.status === 'signedIn' && s.profile && (prev.status !== 'signedIn' || s.profile.id !== prev.profile?.id || s.mode !== prev.mode)) start(s.profile.id);
  if (s.status === 'signedOut' && uid) stop();
});

document.addEventListener('visibilitychange', () => {
  if (!uid) return;
  if (document.visibilityState === 'hidden') {
    // Only a device that is actually playing may overwrite "now playing" for the others.
    if (usePlayer.getState().playing) dirty.add('now');
    flush();
  } else pull();
});
window.addEventListener('focus', () => uid && pull());
window.addEventListener('online', () => uid && pull());
