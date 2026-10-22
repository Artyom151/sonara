import { create } from 'zustand';
import type { Playlist, Source, Track } from '../core/types';

export type Tab = 'home' | 'search' | 'likes' | 'profile';

export type Route =
  | { name: 'genre'; urn: string; title: string; artwork?: string }
  | { name: 'playlist'; source: Source; id: string; title: string; artwork?: string; preview?: Playlist }
  | { name: 'local'; id: string }
  | { name: 'liked' }
  | { name: 'downloads' }
  | { name: 'recent' }
  | { name: 'settings' }
  | { name: 'wave' }
  | { name: 'daylist' }
  | { name: 'stats' }
  | { name: 'artist'; source: Source; id?: string; artistName: string }
  | { name: 'all'; kind: 'trending' | 'mixes' | 'picks' | 'youtube' };

export type Modal =
  | { type: 'track'; track: Track; playlistId?: string; anchor?: DOMRect }
  | { type: 'addToPlaylist'; tracks: Track[] }
  | { type: 'createPlaylist'; tracks?: Track[]; editId?: string }
  | { type: 'queue' }
  | { type: 'artists'; track: Track; names: string[]; anchor?: DOMRect }
  | { type: 'lyrics' }
  | { type: 'import' }
  | { type: 'auth'; tab?: 'signIn' | 'signUp' }
  | { type: 'editProfile' }
  | { type: 'look' }
  | { type: 'comments' }
  | { type: 'confirm'; title: string; message?: string; action: string; destructive?: boolean; onConfirm: () => void };

interface UiState {
  tab: Tab;
  stacks: Record<Tab, Route[]>;
  modals: Modal[];
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  pop: () => void;
  open: (m: Modal) => void;
  close: () => void;
  /** Android back / Escape. Returns false when there is nothing to close. */
  back: () => boolean;
}

export const useUi = create<UiState>((set, get) => ({
  tab: 'home',
  stacks: { home: [], search: [], likes: [], profile: [] },
  modals: [],
  setTab: (tab) =>
    set((s) => (s.tab === tab ? { stacks: { ...s.stacks, [tab]: [] } } : { tab })),
  push: (r) => set((s) => ({ stacks: { ...s.stacks, [s.tab]: [...s.stacks[s.tab], r] } })),
  pop: () => set((s) => ({ stacks: { ...s.stacks, [s.tab]: s.stacks[s.tab].slice(0, -1) } })),
  open: (m) => set((s) => ({ modals: [...s.modals, m] })),
  close: () => set((s) => ({ modals: s.modals.slice(0, -1) })),
  back: () => {
    const s = get();
    if (s.modals.length) return s.close(), true;
    // Player sheet is handled by the player store (see App).
    if (s.stacks[s.tab].length) return s.pop(), true;
    if (s.tab !== 'home') return s.setTab('home'), true;
    return false;
  },
}));
