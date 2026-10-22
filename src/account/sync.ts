import { create } from 'zustand';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { useAccount } from './store';

/**
 * Keeps Likes in sync with the account (Supabase or local mock):
 *  - on sign-in: remote likes are merged into the library, local-only likes are uploaded;
 *  - afterwards every like / unlike is mirrored;
 *  - a photo picked during sign-up is uploaded on the first signed-in session.
 * `version` bumps after each change so "Liked by" can refresh.
 */
export const useLikeSync = create<{ version: number }>(() => ({ version: 0 }));
const bump = () => useLikeSync.setState((s) => ({ version: s.version + 1 }));

const PENDING_AVATAR = 'sonara.pendingAvatar';

export function setPendingAvatar(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(PENDING_AVATAR, dataUrl);
    else localStorage.removeItem(PENDING_AVATAR);
  } catch {
    /* ignore */
  }
}

async function applyPendingAvatar() {
  let data: string | null = null;
  try {
    data = localStorage.getItem(PENDING_AVATAR);
  } catch {
    return;
  }
  if (!data) return;
  try {
    const blob = await (await fetch(data)).blob();
    const url = await useAccount.getState().uploadAvatar(blob);
    await useAccount.getState().update({ avatar: url });
    setPendingAvatar(null);
  } catch {
    /* keep it for the next session */
  }
}

let merging = false;
let syncedFor: string | null = null;

/** Set by account/cloud: tells other devices that this account's likes changed. */
let onLikesChanged: () => void = () => {};
export const setOnLikesChanged = (f: () => void) => void (onLikesChanged = f);

/**
 * Like / unlike operations not yet confirmed by the server (offline, network error).
 * They are retried on the next sync and protect local changes from being undone by
 * reconcileLikes() before they reach the server.
 */
type LikeOp = { track: Track; liked: boolean };
const PENDING = 'sonara.likes.pending.';
const ACCOUNT_LIKES = 'sonara.likes.account.';
const ANONYMOUS_LIKES = 'sonara.likes.anonymous';
const LAST_ACCOUNT = 'sonara.likes.lastAccount';
const read = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};
// The old queue has no owner. Never send it to whichever account signs in next.
try { localStorage.removeItem('sonara.likes.pending'); } catch { /* ignore */ }
let accountId: string | null = null;
let pending: Record<string, LikeOp> = {};
let anonymousLikes = read<Track[] | null>(ANONYMOUS_LIKES, null);
let switching = false;
const savePending = () => accountId && write(PENDING + accountId, pending);

function switchAccount(nextId: string | null, restoring = false) {
  if (accountId === nextId) {
    if (!nextId && anonymousLikes === null) {
      anonymousLikes = useLibrary.getState().likes;
      write(ANONYMOUS_LIKES, anonymousLikes);
    }
    return;
  }
  const current = useLibrary.getState().likes;
  if (accountId) write(ACCOUNT_LIKES + accountId, current);
  else if (anonymousLikes === null) anonymousLikes = restoring ? [] : current;
  if (accountId === null && anonymousLikes !== null) write(ANONYMOUS_LIKES, anonymousLikes);
  accountId = nextId;
  pending = nextId ? read<Record<string, LikeOp>>(PENDING + nextId, {}) : {};
  const saved = nextId ? read<Track[] | null>(ACCOUNT_LIKES + nextId, null) : null;
  const lastAccount = read<string | null>(LAST_ACCOUNT, null);
  const next = nextId
    ? saved ?? (restoring ? (lastAccount === null || lastAccount === nextId ? current : []) : anonymousLikes ?? [])
    : (anonymousLikes ?? []);
  // Anonymous likes are imported once, into the first account used on this device.
  if (nextId && !restoring && saved === null && anonymousLikes?.length) {
    anonymousLikes = [];
    write(ANONYMOUS_LIKES, anonymousLikes);
  }
  switching = true;
  useLibrary.setState({ likes: next });
  switching = false;
  prevLikes = new Map(next.map((t) => [t.key, t]));
  if (nextId) {
    write(ACCOUNT_LIKES + nextId, next);
    write(LAST_ACCOUNT, nextId);
  }
}

async function mirror(userId: string, ops: LikeOp[]) {
  for (const op of ops) pending[op.track.key] = op;
  savePending();
  const p = useAccount.getState().provider();
  const results = await Promise.allSettled(
    ops.map((op) =>
      p.likes.set(userId, op.track, op.liked).then(() => {
        if (accountId === userId && pending[op.track.key] === op) delete pending[op.track.key];
      }),
    ),
  );
  if (accountId === userId) {
    savePending();
    bump();
    if (results.some((r) => r.status === 'fulfilled')) onLikesChanged();
  }
}

/** Retry likes that could not be sent earlier. */
export function flushPendingLikes() {
  const { profile, status } = useAccount.getState();
  const ops = Object.values(pending);
  if (status === 'signedIn' && profile && accountId === profile.id && ops.length) return mirror(profile.id, ops);
}

/**
 * Make local likes match the account after another device changed them. Keeps the server's
 * order (newest first) and any local change that is still on its way to the server.
 */
export function reconcileLikes(remote: Track[]) {
  const local = useLibrary.getState().likes;
  const localByKey = new Map(local.map((t) => [t.key, t]));
  const remoteKeys = new Set(remote.map((t) => t.key));
  const next: Track[] = [];
  for (const t of local) if (!remoteKeys.has(t.key) && pending[t.key]?.liked) next.push(t);
  for (const t of remote) if (pending[t.key]?.liked !== false) next.push(localByKey.get(t.key) ?? t);
  if (next.length === local.length && next.every((t, i) => t.key === local[i].key)) return;
  merging = true;
  useLibrary.setState({ likes: next });
  merging = false;
  bump();
}

async function mergeOnSignIn() {
  const { profile, provider } = useAccount.getState();
  if (!profile || syncedFor === profile.id) return;
  syncedFor = profile.id;
  const p = provider();
  try {
    const remote = await p.likes.list(profile.id);
    if (accountId !== profile.id) return;
    const local = useLibrary.getState().likes;
    const localKeys = new Set(local.map((t) => t.key));
    const remoteKeys = new Set(remote.map((t) => t.key));
    const fromRemote = remote.filter((t) => !localKeys.has(t.key) && pending[t.key]?.liked !== false);
    if (fromRemote.length) {
      merging = true;
      useLibrary.setState((s) => ({ likes: [...s.likes, ...fromRemote] }));
      merging = false;
    }
    const upload = local.filter((t) => !remoteKeys.has(t.key) && pending[t.key]?.liked !== false);
    await p.likes.upsert(profile.id, upload);
    if (accountId !== profile.id) return;
    bump();
    if (upload.length) onLikesChanged();
    flushPendingLikes();
  } catch {
    syncedFor = null;
  }
  applyPendingAvatar();
}

useAccount.subscribe((s, prev) => {
  if (s.status === 'signedIn' && s.profile && (prev.status !== 'signedIn' || s.profile.id !== prev.profile?.id || s.mode !== prev.mode)) {
    switchAccount(s.profile.id, prev.status === 'loading');
    void mergeOnSignIn();
  }
  if (s.status === 'signedOut') {
    switchAccount(null);
    syncedFor = null;
  }
});

let prevLikes = new Map(useLibrary.getState().likes.map((t) => [t.key, t]));
useLibrary.subscribe((s) => {
  const next = new Map(s.likes.map((t) => [t.key, t]));
  const added: Track[] = [];
  const removed: Track[] = [];
  for (const [k, t] of next) if (!prevLikes.has(k)) added.push(t);
  for (const [k, t] of prevLikes) if (!next.has(k)) removed.push(t);
  prevLikes = next;
  if (switching) return;
  if (accountId) write(ACCOUNT_LIKES + accountId, s.likes);
  else {
    anonymousLikes = s.likes;
    write(ANONYMOUS_LIKES, anonymousLikes);
  }
  const { profile, status } = useAccount.getState();
  if (merging || status !== 'signedIn' || !profile || (!added.length && !removed.length)) return;
  mirror(profile.id, [...added.map((track) => ({ track, liked: true })), ...removed.map((track) => ({ track, liked: false }))]);
});
