import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Track } from '../core/types';
import type { AccountProvider, Comment, Liker, Profile, SyncRow } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Supabase client, or null when the project is not configured (.env). */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
}

/** Small, stream-free copy of a track for the synced library. */
export const snapshot = (t: Track): Track => ({
  key: t.key,
  id: t.id,
  source: t.source,
  title: t.title,
  artist: t.artist,
  artwork: t.artwork,
  artworkLarge: t.artworkLarge,
  duration: t.duration,
  genre: t.genre,
  tags: t.tags?.slice(0, 8),
  url: t.url,
});

const toProfile = (r: ProfileRow, email?: string): Profile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name || r.username,
  avatar: r.avatar || 'preset:0',
  email,
});

/** Works before the SQL migration has been run: falls back to the sign-up metadata. */
function fromUser(u: User): Profile {
  const m = u.user_metadata ?? {};
  const username = (m.username as string) || (u.email ?? 'user').split('@')[0];
  return { id: u.id, username, displayName: (m.display_name as string) || username, avatar: (m.avatar as string) || 'preset:0', email: u.email };
}

async function loadProfile(sb: SupabaseClient, u: User): Promise<Profile> {
  const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar').eq('id', u.id).maybeSingle();
  if (error || !data) return fromUser(u);
  return toProfile(data as ProfileRow, u.email);
}

const authError = (e: { message?: string; code?: string } | null) => {
  const m = (e?.message ?? '').toLowerCase();
  if (m.includes('invalid login')) return new Error('invalid_credentials');
  if (m.includes('not confirmed')) return new Error('email_not_confirmed');
  if (m.includes('already registered') || m.includes('already been registered')) return new Error('email_taken');
  if (m.includes('password')) return new Error('weak_password');
  return new Error(e?.message || 'network');
};

export function remoteProvider(sb: SupabaseClient): AccountProvider {
  return {
    kind: 'supabase',

    async restore() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ? loadProfile(sb, data.session.user) : null;
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) throw authError(error);
      return loadProfile(sb, data.user);
    },

    async signUp({ email, password, username, displayName, avatar }) {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username, display_name: displayName || username, avatar },
          emailRedirectTo: /^https?:/.test(location.origin) ? location.origin : undefined,
        },
      });
      if (error) throw authError(error);
      if (!data.session || !data.user) return { needsConfirm: true };
      return { profile: await loadProfile(sb, data.user) };
    },

    async resendConfirmation(email) {
      const { error } = await sb.auth.resend({ type: 'signup', email: email.trim() });
      if (error) throw authError(error);
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async updateProfile(id, patch) {
      const row: Record<string, string> = {};
      if (patch.username !== undefined) row.username = patch.username;
      if (patch.displayName !== undefined) row.display_name = patch.displayName;
      if (patch.avatar !== undefined) row.avatar = patch.avatar;
      const { data, error } = await sb.from('profiles').update(row).eq('id', id).select('id, username, display_name, avatar').single();
      if (error) {
        if (error.code === '23505') throw new Error('username_taken');
        throw new Error(error.message);
      }
      // Mirror into auth metadata so the profile survives even without the table.
      await sb.auth.updateUser({ data: { username: data.username, display_name: data.display_name, avatar: data.avatar } });
      const { data: u } = await sb.auth.getUser();
      return toProfile(data as ProfileRow, u.user?.email);
    },

    async usernameAvailable(username, selfId) {
      const { data, error } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
      if (error) return true; // table missing: cannot check, let the server decide
      return !data || data.id === selfId;
    },

    async uploadAvatar(id, file) {
      const path = `${id}/avatar-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('avatars').upload(path, file, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(error.message);
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },

    likes: {
      async set(userId, track, liked) {
        const q = liked
          ? sb.from('likes').upsert({ user_id: userId, track_key: track.key, track: snapshot(track) })
          : sb.from('likes').delete().eq('user_id', userId).eq('track_key', track.key);
        const { error } = await q;
        if (error && error.code !== 'PGRST205') throw new Error(error.message);
      },
      async upsert(userId, tracks) {
        if (!tracks.length) return;
        const rows = tracks.map((t) => ({ user_id: userId, track_key: t.key, track: snapshot(t) }));
        const { error } = await sb.from('likes').upsert(rows, { onConflict: 'user_id,track_key', ignoreDuplicates: true });
        if (error && error.code !== 'PGRST205') throw new Error(error.message);
      },
      async list(userId) {
        const { data, error } = await sb.from('likes').select('track, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000);
        if (error) return [];
        return (data ?? []).map((r: any) => r.track as Track).filter((t) => t?.key);
      },
      async likedBy(trackKey) {
        const { data, count, error } = await sb
          .from('likes')
          .select('created_at, user:profiles(id, username, display_name, avatar)', { count: 'exact' })
          .eq('track_key', trackKey)
          .order('created_at', { ascending: false })
          .limit(3);
        if (error) return { users: [], count: 0 };
        const users: Liker[] = (data ?? [])
          .map((r: any) => r.user)
          .filter(Boolean)
          .map((u: any) => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar }));
        return { users, count: count ?? users.length };
      },
    },

    sync: {
      async load(userId) {
        const { data, error } = await sb.from('user_sync').select('playlists, saved, recent, dislikes, prefs, now_playing, likes_at').eq('user_id', userId).maybeSingle();
        if (error) throw new Error(error.code === 'PGRST205' || error.code === '42P01' ? 'sync_not_setup' : error.message);
        return (data as SyncRow | null) ?? null;
      },
      async save(userId, patch) {
        const { error } = await sb.from('user_sync').upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw new Error(error.code === 'PGRST205' || error.code === '42P01' ? 'sync_not_setup' : error.message);
      },
      subscribe(userId, onChange) {
        const channel = sb
          .channel(`sync:${userId}:${crypto.randomUUID()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sync', filter: `user_id=eq.${userId}` }, () => onChange())
          .subscribe();
        return () => {
          sb.removeChannel(channel);
        };
      },
    },

    comments: {
      async list(trackKey) {
        const { data, error } = await sb
          .from('comments')
          .select('id, track_key, body, position, created_at, author:profiles(id, username, display_name, avatar)')
          .eq('track_key', trackKey)
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw new Error(error.code === 'PGRST205' ? 'comments_not_setup' : error.message);
        return (data ?? []).map(
          (r: any): Comment => ({
            id: r.id,
            trackKey: r.track_key,
            body: r.body,
            position: r.position,
            createdAt: r.created_at,
            author: r.author
              ? { id: r.author.id, username: r.author.username, displayName: r.author.display_name || r.author.username, avatar: r.author.avatar }
              : { id: '', username: 'user', displayName: 'User', avatar: 'preset:0' },
          }),
        );
      },
      async post(author, trackKey, body, position) {
        const { data, error } = await sb
          .from('comments')
          .insert({ track_key: trackKey, user_id: author.id, body, position })
          .select('id, created_at')
          .single();
        if (error) throw new Error(error.code === 'PGRST205' ? 'comments_not_setup' : error.message);
        return {
          id: data.id,
          trackKey,
          body,
          position,
          createdAt: data.created_at,
          author: { id: author.id, username: author.username, displayName: author.displayName, avatar: author.avatar },
        };
      },
      async remove(id) {
        const { error } = await sb.from('comments').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
      subscribe(trackKey, onChange) {
        // Unique name per subscriber: several components (badge + panel) may watch the same track,
        // and supabase.channel(name) would return the already-subscribed instance.
        const channel = sb
          .channel(`comments:${trackKey}:${crypto.randomUUID()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `track_key=eq.${trackKey}` }, () => onChange())
          .subscribe();
        return () => {
          sb.removeChannel(channel);
        };
      },
    },
  };
}
