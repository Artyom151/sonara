import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Local listening statistics: seconds of audio heard per day and per artist, and how many tracks
 * were played (a play counts after 30 seconds). Kept on this device only.
 */
export interface ArtistStat {
  name: string;
  seconds: number;
  plays: number;
}

interface StatsState {
  /** 'YYYY-MM-DD' -> seconds heard that day. */
  days: Record<string, number>;
  /** Lower-case artist -> totals. */
  artists: Record<string, ArtistStat>;
  plays: number;
  add: (artist: string, seconds: number) => void;
  countPlay: (artist: string) => void;
}

const MAX_ARTISTS = 300;

export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const artistKey = (artist: string) => artist.toLowerCase().trim() || '?';

export const useStats = create<StatsState>()(
  persist(
    (set) => ({
      days: {},
      artists: {},
      plays: 0,
      add: (artist, seconds) =>
        set((s) => {
          const key = artistKey(artist);
          const prev = s.artists[key] ?? { name: artist, seconds: 0, plays: 0 };
          let artists = { ...s.artists, [key]: { ...prev, seconds: prev.seconds + seconds } };
          if (Object.keys(artists).length > MAX_ARTISTS) {
            // Keep the artists with the most listening.
            artists = Object.fromEntries(Object.entries(artists).sort((a, b) => b[1].seconds - a[1].seconds).slice(0, MAX_ARTISTS));
          }
          const day = dayKey();
          return { days: { ...s.days, [day]: (s.days[day] ?? 0) + seconds }, artists };
        }),
      countPlay: (artist) =>
        set((s) => {
          const key = artistKey(artist);
          const prev = s.artists[key] ?? { name: artist, seconds: 0, plays: 0 };
          return { plays: s.plays + 1, artists: { ...s.artists, [key]: { ...prev, plays: prev.plays + 1 } } };
        }),
    }),
    { name: 'sonara.stats' },
  ),
);
