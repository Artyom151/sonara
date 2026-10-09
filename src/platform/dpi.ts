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

interface ProbeResult {
  strategy: string;
  ok: boolean;
  ms: number;
  bytes: number;
}
const Bypass = isAndroid
  ? registerPlugin<{
      configure(o: { enabled: boolean; rules: { hosts: string[]; strategy: string }[] }): Promise<{ proxy: string | null }>;
      probe(o: { hosts: string[]; strategies: string[]; urls: string[] }): Promise<{ results: ProbeResult[] }>;
    }>('Bypass')
  : null;

interface WebFetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  binary?: boolean;
  timeout?: number;
  mode?: RequestMode;
}
/** fetch() run by Chromium in the hidden youtube.com page (PoTokenPlugin.java). */
const PageFetch = isAndroid
  ? registerPlugin<{ fetch(o: WebFetchOptions): Promise<{ status: number; headers: Record<string, string>; data: string }> }>('PoToken')
  : null;

/**
 * Android with the YouTube bypass on: YouTube requests go through Chromium instead of
 * HttpURLConnection. Its ClientHello is large enough (two TCP segments) for tlsrec to get past
 * DPI that reassembles the small one Android's own TLS sends, whatever the split.
 */
export function viaPage(host: string): boolean {
  if (!PageFetch) return false;
  const { bypass } = useSettings.getState();
  if (!bypass.enabled || !strategyOf(bypass.services.youtube)) return false;
  return BYPASS_HOSTS.youtube.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Headers fetch() may not set (the page supplies its own). */
const FORBIDDEN = /^(user-agent|origin|referer|cookie|host|content-length|accept-encoding|connection)$/i;

export async function pageFetch(url: string, init: RequestInit, binary: boolean): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => {
    if (!FORBIDDEN.test(k)) headers[k] = v;
  });
  const r = await PageFetch!.fetch({ url, method: init.method ?? 'GET', headers, body: typeof init.body === 'string' ? init.body : undefined, binary });
  let body: BodyInit | null = r.data;
  if (binary) {
    const bin = atob(r.data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    body = out;
  }
  return new Response(r.status === 204 || r.status === 304 ? null : body, { status: r.status, headers: r.headers });
}

/** The app can try every strategy on the device's own network and keep the fastest. */
export const bypassAutoSupported = isAndroid || isTauri;

/** Small real responses per service: page, image CDN and media CDN where the service has one. */
const PROBE_URLS: Record<BypassService, string[]> = {
  youtube: ['https://www.youtube.com/', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 'https://redirector.googlevideo.com/generate_204'],
  soundcloud: ['https://soundcloud.com/robots.txt', 'https://a-v2.sndcdn.com/assets/'],
  deezer: ['https://www.deezer.com/robots.txt', 'https://api.deezer.com/infos'],
  yandex: ['https://music.yandex.ru/robots.txt', 'https://api.music.yandex.net/'],
};

/** Presets plus the usual ByeDPI variants worth trying. */
const PROBE_STRATEGIES = [
  // Inflate the hello with one-byte TLS records: gets past DPI that reassembles a small split
  // hello (Android and desktop TLS stacks send ~300-520 bytes), where every other trick fails.
  'tlsfrag=240',
  'tlsfrag=120,oob=sni+1',
  // OOB: an urgent byte the server drops but DPI counts as data.
  'tlsrec=sni+1,oob=sni+3',
  'oob=1',
  'oob=sni+1',
  'tlsrec=sni+1,oob=1',
  'disorder=1,oob=sni+1',
  BYPASS_PRESETS.tlsrec,
  BYPASS_PRESETS.split,
  BYPASS_PRESETS.disorder,
  BYPASS_PRESETS.strong,
  'split=1',
  'tlsrec=sni+1,split=1',
];

/**
 * Tries each strategy for `service` and stores the fastest working one. Returns it, or null when
 * none got through (blocked by IP, not by DPI). The rules are re-applied afterwards either way.
 */
/**
 * YouTube is probed the way it is used: through Chromium in the youtube.com page. Each strategy
 * gets a host of its own so Chromium cannot reuse a tunnel opened with the previous one.
 */
const YT_PROBE_HOSTS = ['www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'i.ytimg.com', 's.ytimg.com', 'i1.ytimg.com', 'i2.ytimg.com', 'i3.ytimg.com', 'i4.ytimg.com', 'tv.youtube.com', 'studio.youtube.com'];
const YT_PROBE_STRATEGIES = [
  BYPASS_PRESETS.tlsrec,
  'tlsfrag=240',
  'tlsrec=1',
  'tlsrec=sni+1,oob=sni+3',
  BYPASS_PRESETS.split,
  BYPASS_PRESETS.disorder,
  BYPASS_PRESETS.strong,
  'oob=1',
  'tlsrec=sni+1,split=1',
  'tlsrec=sni+1,disorder=1',
];

async function probeYoutube(): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  for (let i = 0; i < YT_PROBE_STRATEGIES.length; i++) {
    const strategy = YT_PROBE_STRATEGIES[i];
    await Bypass!.configure({ enabled: true, rules: [{ hosts: BYPASS_HOSTS.youtube, strategy }] });
    const t0 = Date.now();
    let ok = false;
    try {
      // no-cors: any answer means the handshake got through; a block is a network error.
      await PageFetch!.fetch({ url: `https://${YT_PROBE_HOSTS[i]}/robots.txt?${t0}`, mode: 'no-cors', timeout: 6000 });
      ok = true;
    } catch {
      /* blocked */
    }
    out.push({ strategy, ok, ms: Date.now() - t0, bytes: 0 });
  }
  return out;
}

async function probeDesktop(service: BypassService): Promise<ProbeResult[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ProbeResult[]>('dpi_probe', { hosts: BYPASS_HOSTS[service], strategies: PROBE_STRATEGIES, urls: PROBE_URLS[service] });
}

export async function autoPickBypass(service: BypassService): Promise<{ strategy: string; ms: number } | null> {
  if (!bypassAutoSupported) return null;
  try {
    const results = isTauri
      ? await probeDesktop(service)
      : service === 'youtube'
        ? await probeYoutube()
        : (await Bypass!.probe({ hosts: BYPASS_HOSTS[service], strategies: PROBE_STRATEGIES, urls: PROBE_URLS[service] })).results;
    const best = results.filter((r) => r.ok).sort((a, b) => a.ms - b.ms)[0];
    if (!best) return null;
    const preset = (Object.keys(BYPASS_PRESETS) as (keyof typeof BYPASS_PRESETS)[]).find((k) => k !== 'off' && BYPASS_PRESETS[k] === best.strategy);
    const { bypass, set } = useSettings.getState();
    set({ bypass: { ...bypass, services: { ...bypass.services, [service]: preset ? { ...bypass.services[service], preset } : { preset: 'custom', custom: best.strategy } } } });
    return { strategy: best.strategy, ms: best.ms };
  } finally {
    await applyBypass();
  }
}

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
