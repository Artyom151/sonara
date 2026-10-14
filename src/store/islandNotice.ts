import { create } from 'zustand';

/**
 * Short messages for the island player ("No connection", "12 similar tracks added"…).
 * They take the island for a few seconds, like the iOS live-activity banners, then it returns
 * to the track. Only the island player renders them; the toast stays for the other layouts.
 */
export type NoticeKind = 'offline' | 'online' | 'queue' | 'wave' | 'warn';

export interface IslandNotice {
  id: number;
  kind: NoticeKind;
  text: string;
  detail?: string;
}

interface State {
  current: IslandNotice | null;
  push: (n: Omit<IslandNotice, 'id'>, ttl?: number) => void;
  clear: () => void;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useIslandNotice = create<State>((set) => ({
  current: null,
  push: (n, ttl = 3200) => {
    const id = ++seq;
    clearTimeout(timer);
    set({ current: { ...n, id } });
    timer = setTimeout(() => set((s) => (s.current?.id === id ? { current: null } : s)), ttl);
  },
  clear: () => {
    clearTimeout(timer);
    set({ current: null });
  },
}));

export const pushNotice = (n: Omit<IslandNotice, 'id'>, ttl?: number) => useIslandNotice.getState().push(n, ttl);

/** Text in the interface language without the i18n hook (called from non-React code). */
export const tr = (en: string, ru: string) => (navigator.language.toLowerCase().startsWith('ru') ? ru : en);
