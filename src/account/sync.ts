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
    const fromRemote = remote.filter((t) => !localKeys.has(t.key));
    if (fromRemote.length) {
      merging = true;
      useLibrary.setState((s) => ({ likes: [...s.likes, ...fromRemote] }));
      merging = false;
    }
    await p.likes.upsert(
      profile.id,
      local.filter((t) => !remoteKeys.has(t.key)),
    );
    bump();
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
  const { profile, provider, status } = useAccount.getState();
  if (merging || status !== 'signedIn' || !profile || (!added.length && !removed.length)) return;
  const p = provider();
  Promise.all([...added.map((t) => p.likes.set(profile.id, t, true)), ...removed.map((t) => p.likes.set(profile.id, t, false))])
    .then(bump)
    .catch(() => {});
});
