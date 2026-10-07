import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Playlist, Track } from '../core/types';

export interface LocalPlaylist {
  id: string;
  title: string;
  description: string;
  /** Index into the generated cover palettes. */
  cover: number;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

interface Library {
  likes: Track[];
  dislikes: string[];
  playlists: LocalPlaylist[];
  savedPlaylists: Playlist[];
  recent: Track[];
  recentSearches: string[];
  toggleLike: (t: Track) => void;
  isLiked: (key: string) => boolean;
  toggleDislike: (t: Track) => void;
  createPlaylist: (title: string, description?: string, tracks?: Track[]) => LocalPlaylist;
  updatePlaylist: (id: string, patch: Partial<Pick<LocalPlaylist, 'title' | 'description' | 'cover'>>) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, tracks: Track[]) => void;
  removeFromPlaylist: (id: string, key: string) => void;
  moveInPlaylist: (id: string, from: number, to: number) => void;
  toggleSavedPlaylist: (p: Playlist) => void;
  pushRecent: (t: Track) => void;
  pushSearch: (q: string) => void;
  clearSearches: () => void;
}

/** Strip transient data so the persisted library stays small. */
const slim = (t: Track): Track => ({ ...t, sc: t.sc ? { auth: undefined, transcodings: undefined } : undefined });

export const useLibrary = create<Library>()(
  persist(
    (set, get) => ({
      likes: [],
      dislikes: [],
      playlists: [],
      savedPlaylists: [],
      recent: [],
      recentSearches: [],
      toggleLike: (t) =>
        set((s) => ({
          likes: s.likes.some((x) => x.key === t.key) ? s.likes.filter((x) => x.key !== t.key) : [slim(t), ...s.likes],
          dislikes: s.dislikes.filter((k) => k !== t.key),
        })),
      isLiked: (key) => get().likes.some((x) => x.key === key),
      toggleDislike: (t) =>
        set((s) => ({
          dislikes: s.dislikes.includes(t.key) ? s.dislikes.filter((k) => k !== t.key) : [...s.dislikes, t.key],
          likes: s.likes.filter((x) => x.key !== t.key),
        })),
      createPlaylist: (title, description = '', tracks = []) => {
        const p: LocalPlaylist = {
          id: crypto.randomUUID(),
          title: title.trim() || 'New Playlist',
          description,
          cover: Math.floor(Math.random() * 8),
          tracks: tracks.map(slim),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({ playlists: [p, ...s.playlists] }));
        return p;
      },
      updatePlaylist: (id, patch) =>
        set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) })),
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addToPlaylist: (id, tracks) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? { ...p, tracks: [...p.tracks, ...tracks.filter((t) => !p.tracks.some((x) => x.key === t.key)).map(slim)], updatedAt: Date.now() }
              : p,
          ),
        })),
      removeFromPlaylist: (id, key) =>
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.key !== key), updatedAt: Date.now() } : p)),
        })),
      moveInPlaylist: (id, from, to) =>
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            const tracks = [...p.tracks];
            const [x] = tracks.splice(from, 1);
            tracks.splice(to, 0, x);
            return { ...p, tracks, updatedAt: Date.now() };
          }),
        })),
      toggleSavedPlaylist: (pl) =>
        set((s) => ({
          savedPlaylists: s.savedPlaylists.some((x) => x.key === pl.key)
            ? s.savedPlaylists.filter((x) => x.key !== pl.key)
            : [{ ...pl, tracks: undefined }, ...s.savedPlaylists],
        })),
      pushRecent: (t) => set((s) => ({ recent: [slim(t), ...s.recent.filter((x) => x.key !== t.key)].slice(0, 50) })),
      pushSearch: (q) =>
        set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12) })),
      clearSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'sonara.library',
      partialize: (s) => ({
        likes: s.likes,
        dislikes: s.dislikes,
        playlists: s.playlists,
        savedPlaylists: s.savedPlaylists,
        recent: s.recent,
        recentSearches: s.recentSearches,
      }),
    },
  ),
);
