import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Fetcher } from '../core/types';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isCapacitor = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isNative = isTauri || isCapacitor;
export const platformName = isAndroid ? 'android' : isTauri ? 'desktop' : 'web';

const toRecord = (h?: HeadersInit) => {
  const out: Record<string, string> = {};
  if (h) new Headers(h).forEach((v, k) => (out[k] = v));
  return out;
};

/** CapacitorHttp performs the request natively: no CORS, any header allowed. */
/** Media and images must come back as bytes: CapacitorHttp returns those base64-encoded. */
const BINARY = /(^|\.)(googlevideo\.com|sndcdn\.com|soundcloud\.cloud|dzcdn\.net|ytimg\.com|yandex\.net|googleusercontent\.com)$/;
/** Callers that need bytes from any host send this header; it is not forwarded. */
export const BINARY_HINT = 'x-sonara-binary';
const fromBase64 = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const capacitorFetch: Fetcher = async (url, init = {}) => {
  const headers = toRecord(init.headers);
  const binary = BINARY.test(new URL(url).hostname) || BINARY_HINT in headers;
  delete headers[BINARY_HINT];
  // YouTube through the DPI bypass: from Chromium, see platform/dpi.ts.
  const dpi = await import('./dpi');
  if (dpi.viaPage(new URL(url).hostname)) return dpi.pageFetch(url, { ...init, headers }, binary);
  const r = await CapacitorHttp.request({
    url,
    method: init.method ?? 'GET',
    headers,
    data: init.body ?? undefined,
    responseType: binary ? 'blob' : 'text',
  });
  const body = binary && typeof r.data === 'string' ? fromBase64(r.data) : typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  return new Response(r.status === 204 ? null : body, { status: r.status, headers: r.headers });
};

/**
 * The Tauri HTTP plugin sends the webview origin (tauri://localhost) by default, which
 * YouTube rejects with 403. Present each service with its own first-party origin instead.
 */
const ORIGINS: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|googlevideo\.com|ytimg\.com)$/, 'https://www.youtube.com'],
  [/(^|\.)googleapis\.com$/, 'https://www.youtube.com'],
  [/(^|\.)(soundcloud\.com|sndcdn\.com|soundcloud\.cloud)$/, 'https://soundcloud.com'],
  [/(^|\.)lrclib\.net$/, 'https://lrclib.net'],
  // The Yandex Music API answers 403 to foreign origins such as tauri://localhost.
  [/(^|\.)yandex\.net$/, 'https://music.yandex.ru'],
];

let tauriFetch: Fetcher | null = null;
const tauriNativeFetch: Fetcher = async (url, init = {}) => {
  if (!tauriFetch) tauriFetch = (await import('@tauri-apps/plugin-http')).fetch as Fetcher;
  const host = new URL(url).hostname;
  const origin = ORIGINS.find(([re]) => re.test(host))?.[1];
  const headers = new Headers(init.headers);
  headers.delete(BINARY_HINT);
  if (origin) {
    if (!headers.has('origin')) headers.set('Origin', origin);
    if (!headers.has('referer')) headers.set('Referer', `${origin}/`);
  }
  // Through the built-in DPI bypass when it is on (platform/dpi.ts).
  const { bypassProxy } = await import('./dpi');
  const proxy = bypassProxy();
  return tauriFetch(url, { ...init, headers, ...(proxy ? { proxy: { all: proxy } } : {}) } as RequestInit);
};

/** A fetch that bypasses CORS on native platforms. `null` on the plain web. */
export const nativeFetch: Fetcher | null = isTauri ? tauriNativeFetch : isCapacitor ? capacitorFetch : null;
