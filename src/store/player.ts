import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { throttledStorage } from './throttledStorage';
import type { Track } from '../core/types';

export type Repeat = 'off' | 'all' | 'one';

export interface QueueContext {
  title: string;
  /** e.g. `genre:techno`, `playlist:<id>`, `likes` */
  id?: string;
}

interface PlayerState {
  queue: Track[];
  /** Original order, kept to restore after shuffle is turned off. */
  baseQueue: Track[];
  index: number;
  context: QueueContext;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  buffered: number;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
  /** Playback speed, 0.5 to 1.5; pitch follows the speed (like a record), see engine setRate. */
  rate: number;
  error: string | null;
  expanded: boolean;
  lastRemoved: { track: Track; index: number } | null;
  current: () => Track | undefined;
  playQueue: (tracks: Track[], index?: number, context?: QueueContext) => void;
  playNext: (t: Track) => void;
  addToQueue: (t: Track[]) => void;
  removeAt: (i: number) => void;
  moveAt: (from: number, to: number) => void;
  undoRemove: () => void;
  jump: (i: number) => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setExpanded: (v: boolean) => void;
  patch: (p: Partial<PlayerState>) => void;
}

const shuffled = <T,>(list: T[], keepFirst?: T) => {
  const rest = list.filter((x) => x !== keepFirst);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst ? [keepFirst, ...rest] : rest;
};

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      baseQueue: [],
      index: 0,
      context: { title: 'Playlist of the Day' },
      playing: false,
      loading: false,
      position: 0,
      duration: 0,
      buffered: 0,
      shuffle: false,
      repeat: 'off',
      volume: 1,
      rate: 1,
      error: null,
      expanded: false,
      lastRemoved: null,
      current: () => get().queue[get().index],
      playQueue: (tracks, index = 0, context) => {
        const { shuffle } = get();
        const start = tracks[index];
        const queue = shuffle ? shuffled(tracks, start) : tracks;
        set({
          baseQueue: tracks,
          queue,
          index: shuffle ? 0 : index,
          context: context ?? get().context,
          playing: true,
          position: 0,
          error: null,
          lastRemoved: null,
        });
      },
      playNext: (t) =>
        set((s) => {
          if (!s.queue.length) return { queue: [t], baseQueue: [t], index: 0, playing: true };
          const queue = [...s.queue];
          queue.splice(s.index + 1, 0, t);
          return { queue, baseQueue: [...s.baseQueue, t] };
        }),
      addToQueue: (ts) =>
        set((s) =>
          s.queue.length
            ? { queue: [...s.queue, ...ts], baseQueue: [...s.baseQueue, ...ts] }
            : { queue: ts, baseQueue: ts, index: 0, playing: true },
        ),
      removeAt: (i) =>
        set((s) => {
          if (i <= s.index || i >= s.queue.length) return s;
          const queue = s.queue.filter((_, j) => j !== i);
          return { queue, baseQueue: queue, lastRemoved: { track: s.queue[i], index: i } };
        }),
      moveAt: (from, to) =>
        set((s) => {
          if (from <= s.index || to <= s.index || from >= s.queue.length || to >= s.queue.length || from === to) return s;
          const queue = [...s.queue];
          const [track] = queue.splice(from, 1);
          queue.splice(to, 0, track);
          return { queue, baseQueue: queue };
        }),
      undoRemove: () =>
        set((s) => {
          if (!s.lastRemoved) return s;
          const queue = [...s.queue];
          queue.splice(Math.min(Math.max(s.index + 1, s.lastRemoved.index), queue.length), 0, s.lastRemoved.track);
          return { queue, baseQueue: queue, lastRemoved: null };
        }),
      jump: (i) => set({ index: i, playing: true, position: 0, error: null }),
      next: (auto = false) => {
        const { index, queue, repeat } = get();
        if (auto && repeat === 'one') return set({ position: 0, playing: true });
        if (index + 1 < queue.length) return set({ index: index + 1, position: 0, playing: true, error: null });
        if (repeat === 'all' && queue.length) return set({ index: 0, position: 0, playing: true, error: null });
        if (!auto) return;
        set({ playing: false });
      },
      prev: () => {
        const { index, position } = get();
        if (position > 3 || index === 0) return set({ position: 0, error: null });
        set({ index: index - 1, position: 0, playing: true, error: null });
      },
      toggleShuffle: () =>
        set((s) => {
          const cur = s.queue[s.index];
          if (!s.shuffle) {
            const queue = shuffled(s.queue, cur);
            return { shuffle: true, queue, index: 0 };
          }
          const queue = s.baseQueue.length ? s.baseQueue : s.queue;
          return { shuffle: false, queue, index: Math.max(0, queue.findIndex((t) => t.key === cur?.key)) };
        }),
      cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
      setExpanded: (expanded) => set({ expanded }),
      patch: (p) => set(p),
    }),
    {
      name: 'sonara.player',
      storage: throttledStorage(3000),
      partialize: (s) => ({
        queue: s.queue.slice(0, 200),
        baseQueue: s.baseQueue.slice(0, 200),
        index: s.index,
        context: s.context,
        shuffle: s.shuffle,
        repeat: s.repeat,
        volume: s.volume,
        rate: s.rate,
        position: s.position,
      }),
    },
  ),
);
