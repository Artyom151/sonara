import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentMode = 'system' | 'artwork' | 'sonara' | 'custom';
export type Lang = 'auto' | 'en' | 'ru';

export interface Settings {
  lang: Lang;
  accentMode: AccentMode;
  customAccent: string;
  /** Tint the whole interface (backgrounds, glass) with the accent palette. */
  tintInterface: boolean;
  glass: 'clear' | 'tinted';
  reduceMotion: boolean;
  /** Graphics quality; 'auto' picks by device (see platform/perf). */
  graphics: 'auto' | 'high' | 'balanced' | 'low';
  showSplash: boolean;
  sources: { soundcloud: boolean; youtube: boolean };
  youtubeApiKey: string;
  region: string;
  autoplay: boolean;
  skipUnavailable: boolean;
  showLyricsLine: boolean;
  /** Desktop: lyrics column in the full-screen player. */
  lyricsPanel: boolean;
  crossfade: number;
  displayName: string;
  /** Desktop: Discord Rich Presence. */
  discordEnabled: boolean;
  discordAppId: string;
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      lang: 'auto',
      accentMode: 'system',
      customAccent: '#8b5cf6',
      tintInterface: true,
      glass: 'clear',
      reduceMotion: false,
      graphics: 'auto',
      showSplash: true,
      sources: { soundcloud: true, youtube: true },
      youtubeApiKey: '',
      region: 'US',
      autoplay: true,
      skipUnavailable: true,
      showLyricsLine: true,
      lyricsPanel: true,
      crossfade: 0,
      displayName: 'Listener',
      discordEnabled: true,
      discordAppId: (import.meta.env.VITE_DISCORD_APP_ID as string | undefined) ?? '',
      set: (patch) => set(patch),
    }),
    { name: 'sonara.settings', partialize: ({ set: _, ...rest }) => rest },
  ),
);
