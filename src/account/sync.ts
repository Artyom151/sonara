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
const PENDING = 'sonara.likes.pending';
const pending: Record<string, LikeOp> = (() => {
  try {
    return JSON.parse(localStorage.getItem(PENDING) ?? '{}') as Record<string, LikeOp>;
  } catch {
    return {};
  }
})();
const savePending = () => {
  try {
    localStorage.setItem(PENDING, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
};

async function mirror(userId: string, ops: LikeOp[]) {
  for (const op of ops) pending[op.track.key] = op;
  savePending();
  const p = useAccount.getState().provider();
  const results = await Promise.allSettled(
    ops.map((op) =>
      p.likes.set(userId, op.track, op.liked).then(() => {
        if (pending[op.track.key] === op) delete pending[op.track.key];
      }),
    ),
  );
  savePending();
  bump();
  if (results.some((r) => r.status === 'fulfilled')) onLikesChanged();
}

/** Retry likes that could not be sent earlier. */
export function flushPendingLikes() {
  const { profile, status } = useAccount.getState();
  const ops = Object.values(pending);
  if (status === 'signedIn' && profile && ops.length) return mirror(profile.id, ops);
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
    bump();
    if (upload.length) onLikesChanged();
    flushPendingLikes();
  } catch {
    syncedFor = null;
  }
  applyPendingAvatar();
}

useAccount.subscribe((s, prev) => {
  if (s.status === 'signedIn' && (prev.status !== 'signedIn' || s.profile?.id !== prev.profile?.id)) mergeOnSignIn();
  if (s.status === 'signedOut') syncedFor = null;
});

let prevLikes = new Map(useLibrary.getState().likes.map((t) => [t.key, t]));
useLibrary.subscribe((s) => {
  const next = new Map(s.likes.map((t) => [t.key, t]));
  const added: Track[] = [];
  const removed: Track[] = [];
  for (const [k, t] of next) if (!prevLikes.has(k)) added.push(t);
  for (const [k, t] of prevLikes) if (!next.has(k)) removed.push(t);
  prevLikes = next;
  const { profile, status } = useAccount.getState();
  if (merging || status !== 'signedIn' || !profile || (!added.length && !removed.length)) return;
  mirror(profile.id, [...added.map((track) => ({ track, liked: true })), ...removed.map((track) => ({ track, liked: false }))]);
});
