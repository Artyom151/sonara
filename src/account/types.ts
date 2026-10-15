import type { Track } from '../core/types';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  /** 'preset:<n>' or an image URL (Storage URL, or data: URL in mock mode). */
  avatar: string;
  email?: string;
}

export interface Comment {
  id: string;
  trackKey: string;
  body: string;
  /** Seconds into the track. */
  position: number;
  createdAt: string;
  /** The comment this one answers (replies are one level deep); null for a top-level comment. */
  parentId?: string | null;
  author: Pick<Profile, 'id' | 'username' | 'displayName' | 'avatar'>;
}

export type Liker = Pick<Profile, 'id' | 'username' | 'displayName' | 'avatar'>;

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
  avatar: string;
}

/** One JSON section per column of public.user_sync (see supabase/migrations/0003_sonara_sync.sql). */
export interface SyncRow {
  playlists?: unknown;
  saved?: unknown;
  recent?: unknown;
  dislikes?: unknown;
  prefs?: unknown;
  now_playing?: unknown;
  likes_at?: number | null;
}

export interface AccountProvider {
  kind: 'supabase' | 'mock';
  restore(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<Profile>;
  signUp(input: SignUpInput): Promise<{ profile?: Profile; needsConfirm?: boolean }>;
  resendConfirmation(email: string): Promise<void>;
  signOut(): Promise<void>;
  updateProfile(id: string, patch: Partial<Pick<Profile, 'username' | 'displayName' | 'avatar'>>): Promise<Profile>;
  usernameAvailable(username: string, selfId?: string): Promise<boolean>;
  uploadAvatar(id: string, file: Blob): Promise<string>;
  likes: {
    set(userId: string, track: Track, liked: boolean): Promise<void>;
    /** Many at once (initial sync of local likes). */
    upsert(userId: string, tracks: Track[]): Promise<void>;
    list(userId: string): Promise<Track[]>;
    likedBy(trackKey: string): Promise<{ users: Liker[]; count: number }>;
  };
  sync: {
    /** null: nothing synced yet. Throws 'sync_not_setup' when the table is missing. */
    load(userId: string): Promise<SyncRow | null>;
    /** Writes only the given sections. */
    save(userId: string, patch: SyncRow): Promise<void>;
    /** Called when another device (or window) changed the row. */
    subscribe(userId: string, onChange: () => void): () => void;
  };
  comments: {
    list(trackKey: string): Promise<Comment[]>;
    post(author: Profile, trackKey: string, body: string, position: number, parentId?: string | null): Promise<Comment>;
    remove(id: string): Promise<void>;
    /** Live inserts/deletes for a track; returns an unsubscribe function. */
    subscribe(trackKey: string, onChange: () => void): () => void;
  };
}

export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
export const normalizeUsername = (s: string) => s.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24);
