import { registerPlugin } from '@capacitor/core';
import { isAndroid, isTauri } from '.';
import { useSettings } from '../store/settings';

/**
 * Built-in DPI bypass ("Обход блокировок") for the app's own traffic: a local proxy on desktop
 * (src-tauri/src/dpi.rs) and Android (android/.../DpiProxy.java, BypassPlugin.java). Each service gets a strategy; presets cover the usual zapret/ByeDPI
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

/** Desktop and Android run the bypass proxy; the plain web cannot. */
export const bypassSupported = isTauri || isAndroid;

const Bypass = isAndroid
  ? registerPlugin<{ configure(o: { enabled: boolean; rules: { hosts: string[]; strategy: string }[] }): Promise<{ proxy: string | null }> }>('Bypass')
  : null;

export async function applyBypass(): Promise<string | null> {
  if (!bypassSupported) return null;
  const { bypass } = useSettings.getState();
  const rules = (Object.keys(BYPASS_HOSTS) as BypassService[])
    .map((s) => ({ hosts: BYPASS_HOSTS[s], strategy: strategyOf(bypass.services[s]) }))
    .filter((r) => r.strategy);
  const enabled = bypass.enabled && rules.length > 0;
  if (Bypass) {
    // Android routes CapacitorHttp and the WebViews itself; nothing to pass to fetch.
    await Bypass.configure({ enabled, rules });
    return (proxyUrl = null);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  proxyUrl = await invoke<string | null>('dpi_configure', { enabled, rules });
  return proxyUrl;
}

if (bypassSupported) {
  void applyBypass().catch((e) => console.warn('[bypass]', e));
  useSettings.subscribe((s, prev) => {
    if (s.bypass !== prev.bypass) void applyBypass().catch((e) => console.warn('[bypass]', e));
  });
}
