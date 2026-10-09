import { isTauri } from '.';
import { useSettings } from '../store/settings';

/**
 * Built-in DPI bypass ("Обход блокировок") for the app's own traffic: desktop only for now
 * (src-tauri/src/dpi.rs). Each service gets a strategy; presets cover the usual zapret/ByeDPI
 * choices and a custom string allows any combination.
 */
export type BypassService = 'youtube' | 'soundcloud' | 'deezer' | 'yandex';

export const BYPASS_HOSTS: Record<BypassService, string[]> = {
  youtube: ['youtube.com', 'googlevideo.com', 'ytimg.com', 'ggpht.com', 'googleusercontent.com', 'youtubei.googleapis.com', 'youtube-nocookie.com', 'youtu.be'],
  soundcloud: ['soundcloud.com', 'sndcdn.com', 'soundcloud.cloud'],
  deezer: ['deezer.com', 'dzcdn.net'],
  yandex: ['yandex.net', 'yandex.ru', 'music.yandex.ru'],
};

/** Strategy presets (see dpi.rs for the syntax). */
export const BYPASS_PRESETS = {
  off: '',
  tlsrec: 'tlsrec=sni+1',
  split: 'split=sni+2',
  disorder: 'disorder',
  strong: 'tlsrec=sni+1,split=sni+3,disorder,delay=5',
} as const;
export type BypassPreset = keyof typeof BYPASS_PRESETS | 'custom';

export interface BypassServiceConfig {
  preset: BypassPreset;
  custom: string;
}

export const strategyOf = (c: BypassServiceConfig) => (c.preset === 'custom' ? c.custom.trim() : BYPASS_PRESETS[c.preset]);

/** Proxy URL the native fetch uses while the bypass is on (null: direct). */
let proxyUrl: string | null = null;
export const bypassProxy = () => proxyUrl;

export async function applyBypass(): Promise<string | null> {
  if (!isTauri) return null;
  const { bypass } = useSettings.getState();
  const rules = (Object.keys(BYPASS_HOSTS) as BypassService[])
    .map((s) => ({ hosts: BYPASS_HOSTS[s], strategy: strategyOf(bypass.services[s]) }))
    .filter((r) => r.strategy);
  const { invoke } = await import('@tauri-apps/api/core');
  proxyUrl = await invoke<string | null>('dpi_configure', { enabled: bypass.enabled && rules.length > 0, rules });
  return proxyUrl;
}

if (isTauri) {
  void applyBypass().catch((e) => console.warn('[bypass]', e));
  useSettings.subscribe((s, prev) => {
    if (s.bypass !== prev.bypass) void applyBypass().catch((e) => console.warn('[bypass]', e));
  });
}
