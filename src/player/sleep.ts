import { create } from 'zustand';

/** Sleep timer: pause at a time, or when the current track ends. Not persisted. */
interface SleepState {
  until: number | null;
  endOfTrack: boolean;
  set: (minutes: number | 'track' | null) => void;
}

export const useSleep = create<SleepState>((set) => ({
  until: null,
  endOfTrack: false,
  set: (m) => set(m === 'track' ? { until: null, endOfTrack: true } : m == null ? { until: null, endOfTrack: false } : { until: Date.now() + m * 60_000, endOfTrack: false }),
}));
