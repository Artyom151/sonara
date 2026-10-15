import { blobToDataUrl } from './image';
import type { Track } from '../core/types';
import type { AccountProvider, Comment, Profile, SyncRow } from './types';

/**
 * Offline account: everything lives in this device's storage. Used when Supabase
 * is not configured or the user picks the demo account. Passwords are salted
 * SHA-256 hashes, never stored in clear text.
 */
interface MockUser {
  id: string;
  email: string;
  salt: string;
  hash: string;
  profile: Profile;
}

const USERS = 'sonara.mock.users';
const SESSION = 'sonara.mock.session';
const COMMENTS = 'sonara.mock.comments';
/** trackKey → userIds, plus per-user track snapshots. */
const LIKES = 'sonara.mock.likes';
const LIKED_TRACKS = 'sonara.mock.likedTracks';
/** Per-user sync row; other windows on this device see changes through the storage event. */
const SYNC = 'sonara.mock.sync.';

const read = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full / blocked */
  }
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const users = () => read<Record<string, MockUser>>(USERS, {});
const listeners = new Map<string, Set<() => void>>();
const emit = (key: string) => listeners.get(key)?.forEach((f) => f());

export const mockProvider: AccountProvider = {
  kind: 'mock',

  async restore() {
    const id = read<string | null>(SESSION, null);
    return Object.values(users()).find((u) => u.id === id)?.profile ?? null;
  },

  async signIn(email, password) {
    const u = users()[email.trim().toLowerCase()];
    if (!u || (await sha256(u.salt + password)) !== u.hash) throw new Error('invalid_credentials');
    write(SESSION, u.id);
    return u.profile;
  },

  async signUp({ email, password, username, displayName, avatar }) {
    const all = users();
    const key = email.trim().toLowerCase();
    if (all[key]) throw new Error('email_taken');
    if (Object.values(all).some((u) => u.profile.username === username)) throw new Error('username_taken');
    const id = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const profile: Profile = { id, username, displayName: displayName || username, avatar, email: key };
    all[key] = { id, email: key, salt, hash: await sha256(salt + password), profile };
    write(USERS, all);
    write(SESSION, id);
    return { profile };
  },

  async resendConfirmation() {},

  async signOut() {
    write(SESSION, null);
  },

  async updateProfile(id, patch) {
    const all = users();
    const u = Object.values(all).find((x) => x.id === id);
    if (!u) throw new Error('not_found');
    if (patch.username && Object.values(all).some((x) => x.id !== id && x.profile.username === patch.username)) throw new Error('username_taken');
    u.profile = { ...u.profile, ...patch };
    write(USERS, all);
    return u.profile;
  },

  async usernameAvailable(username, selfId) {
    return !Object.values(users()).some((u) => u.profile.username === username && u.id !== selfId);
  },

  async uploadAvatar(_id, file) {
    return blobToDataUrl(file);
  },

  likes: {
    async set(userId, track, liked) {
      const by = read<Record<string, string[]>>(LIKES, {});
      const tracks = read<Record<string, Track[]>>(LIKED_TRACKS, {});
      const ids = new Set(by[track.key] ?? []);
      const mine = (tracks[userId] ?? []).filter((t) => t.key !== track.key);
      if (liked) {
        ids.add(userId);
        mine.unshift({ ...track, sc: undefined });
      } else ids.delete(userId);
      by[track.key] = [...ids];
      tracks[userId] = mine;
      write(LIKES, by);
      write(LIKED_TRACKS, tracks);
    },
    async upsert(userId, list) {
      for (const t of list) await mockProvider.likes.set(userId, t, true);
    },
    async list(userId) {
      return read<Record<string, Track[]>>(LIKED_TRACKS, {})[userId] ?? [];
    },
    async likedBy(trackKey) {
      const ids = read<Record<string, string[]>>(LIKES, {})[trackKey] ?? [];
      const byId = new Map(Object.values(users()).map((u) => [u.id, u.profile]));
      const people = ids.map((id) => byId.get(id)).filter(Boolean) as Profile[];
      return { users: people.slice(0, 3), count: people.length };
    },
  },

  sync: {
    async load(userId) {
      return read<SyncRow | null>(SYNC + userId, null);
    },
    async save(userId, patch) {
      write(SYNC + userId, { ...read<SyncRow>(SYNC + userId, {}), ...patch });
    },
    subscribe(userId, onChange) {
      const on = (e: StorageEvent) => {
        if (e.key === SYNC + userId) onChange();
      };
      window.addEventListener('storage', on);
      return () => window.removeEventListener('storage', on);
    },
  },

  comments: {
    async list(trackKey) {
      const all = read<Record<string, Comment[]>>(COMMENTS, {});
      const byId = new Map(Object.values(users()).map((u) => [u.id, u.profile]));
      // Keep author details current (renames / new avatars).
      return (all[trackKey] ?? []).map((c) => ({ ...c, author: byId.get(c.author.id) ?? c.author })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async post(author, trackKey, body, position, parentId = null) {
      const all = read<Record<string, Comment[]>>(COMMENTS, {});
      const c: Comment = {
        id: crypto.randomUUID(),
        trackKey,
        body,
        position,
        parentId,
        createdAt: new Date().toISOString(),
        author: { id: author.id, username: author.username, displayName: author.displayName, avatar: author.avatar },
      };
      all[trackKey] = [c, ...(all[trackKey] ?? [])].slice(0, 500);
      write(COMMENTS, all);
      emit(trackKey);
      return c;
    },
    async remove(id) {
      const all = read<Record<string, Comment[]>>(COMMENTS, {});
      for (const k of Object.keys(all)) {
        const before = all[k].length;
        all[k] = all[k].filter((c) => c.id !== id);
        if (all[k].length !== before) emit(k);
      }
      write(COMMENTS, all);
    },
    subscribe(trackKey, onChange) {
      if (!listeners.has(trackKey)) listeners.set(trackKey, new Set());
      listeners.get(trackKey)!.add(onChange);
      return () => listeners.get(trackKey)?.delete(onChange);
    },
  },
};
