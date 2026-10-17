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
  sources: { soundcloud: boolean; youtube: boolean; deezer?: boolean; yandex?: boolean };
  youtubeApiKey: string;
  /** Yandex Music OAuth token, entered in Settings (kept on this device only). */
  yandexToken: string;
  /** Desktop: your own SOCKS5 server (ssh -D, a VPN client), e.g. socks5://127.0.0.1:1080. Empty: direct. */
  upstreamProxy: string;
  /** Built-in DPI bypass (platform/dpi.ts). */
  bypass: { enabled: boolean; services: Record<'youtube' | 'soundcloud' | 'deezer' | 'yandex', { preset: 'off' | 'tlsrec' | 'split' | 'disorder' | 'strong' | 'custom'; custom: string }> };
  region: string;
  autoplay: boolean;
  skipUnavailable: boolean;
  /** Levelling: tracks from different sources play at about the same loudness. */
  normalize: boolean;
  showLyricsLine: boolean;
  /** Desktop: lyrics column in the full-screen player. */
  lyricsPanel: boolean;
  crossfade: number;
  displayName: string;
  /** Desktop: Discord Rich Presence. */
  discordEnabled: boolean;
  /** Desktop: closing the window keeps playing in the tray. */
  closeToTray: boolean;
  discordAppId: string;
  /** Now playing as a Dynamic Island-style pill (phone: top of the screen, desktop: title bar). */
  islandPlayer: boolean;
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
      sources: { soundcloud: true, youtube: true, deezer: true, yandex: true },
      youtubeApiKey: '',
      yandexToken: '',
      upstreamProxy: '',
      bypass: {
        enabled: false,
        services: {
          youtube: { preset: 'tlsrec', custom: '' },
          soundcloud: { preset: 'tlsrec', custom: '' },
          deezer: { preset: 'tlsrec', custom: '' },
          yandex: { preset: 'off', custom: '' },
        },
      },
      region: 'US',
      autoplay: true,
      skipUnavailable: true,
      normalize: false,
      showLyricsLine: true,
      lyricsPanel: true,
      crossfade: 0,
      displayName: 'Listener',
      discordEnabled: true,
      closeToTray: false,
      discordAppId: (import.meta.env.VITE_DISCORD_APP_ID as string | undefined) ?? '',
      islandPlayer: false,
      set: (patch) => set(patch),
    }),
    { name: 'sonara.settings', partialize: ({ set: _, ...rest }) => rest },
  ),
);
