import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Tracks a daylist has already offered, so the next one brings new music. */
const DAYS = 10;
const CAP = 800;

interface HistoryState {
  served: Record<string, number>;
  record: (keys: string[]) => void;
  recentKeys: (now?: number) => Set<string>;
}

export const useDaylistHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      served: {},
      record: (keys) =>
        set((s) => {
          const at = Date.now();
          const merged = { ...s.served };
          for (const k of keys) merged[k] = at;
          const entries = Object.entries(merged).sort((a, b) => b[1] - a[1]).slice(0, CAP);
          return { served: Object.fromEntries(entries) };
        }),
      recentKeys: (now = Date.now()) => {
        const since = now - DAYS * 86_400_000;
        return new Set(Object.entries(get().served).filter(([, at]) => at >= since).map(([k]) => k));
      },
    }),
    { name: 'sonara.daylist.history' },
  ),
);
