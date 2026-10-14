import type { Fetcher, StreamInfo } from '../core/types';
import { BINARY_HINT, isTauri, nativeFetch } from '../platform';

/** MWEB client identity: YouTube stream URLs are issued to it (core/youtube.ts). */
export const YT_UA =
  'Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)';
/** googlevideo throttles long un-ranged reads; 1 MB ranges come at full speed. */
export const CHUNK = 1 << 20;
/** Hosts the webview cannot fetch itself: client-bound YouTube links, Yandex's CDN (refuses our Origin). */
export const PROXIED = /\.googlevideo\.com\/|\.yandex\.net\//;

let proxyBase: Promise<string | null> | null = null;
/** Desktop: base URL of the local media proxy (src-tauri/src/media_proxy.rs). */
export const mediaProxyBase = () =>
  (proxyBase ??= import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke<string | null>('media_proxy_base'))
    .catch(() => null));

export const audioMime = (url: string) => new URL(url, location.href).searchParams.get('mime') ?? (/\.yandex\.net\//.test(url) ? 'audio/mpeg' : 'audio/mp4');

/**
 * Whole file in parallel ranges of 1 MB (4 at a time). `alive` stops it early (superseded track,
 * cancelled download); `onProgress` gets 0..1.
 */
export async function downloadRanged(
  url: string,
  fetcher: Fetcher,
  opts: { headers?: Record<string, string>; alive?: () => boolean; onProgress?: (p: number) => void } = {},
): Promise<ArrayBuffer[]> {
  const alive = opts.alive ?? (() => true);
  const get = async (from: number, to: number) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetcher(url, { headers: { ...opts.headers, [BINARY_HINT]: '1', Range: `bytes=${from}-${to}` } });
      if (r.ok) return { buf: await r.arrayBuffer(), total: Number(r.headers.get('content-range')?.split('/')[1]) || 0 };
      if (attempt >= 2) throw new Error(`HTTP ${r.status}`);
    }
  };
  const fromUrl = Number(new URL(url, location.href).searchParams.get('clen')) || 0;
  const first = await get(0, CHUNK - 1);
  const total = fromUrl || first.total || first.buf.byteLength;
  const parts: ArrayBuffer[] = [first.buf];
  if (first.buf.byteLength < total) {
    const ranges: [number, number][] = [];
    for (let from = first.buf.byteLength; from < total; from += CHUNK) ranges.push([from, Math.min(total, from + CHUNK) - 1]);
    const out: ArrayBuffer[] = new Array(ranges.length);
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < ranges.length && alive()) {
        const i = next++;
        out[i] = (await get(ranges[i][0], ranges[i][1])).buf;
        opts.onProgress?.(++done / ranges.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!alive()) throw new Error('superseded');
    parts.push(...out);
  }
  opts.onProgress?.(1);
  return parts;
}

/** All segments of an HLS media playlist joined (SoundCloud mp3 / AAC streams, unencrypted). */
/**
 * One HLS piece, checked: a failed request or an error page (XML / HTML from a throttling CDN) must
 * never end up inside the file, or the download plays noise. Retries, then fails the whole download.
 */
async function hlsPiece(fetcher: Fetcher, url: string, init?: RequestInit): Promise<ArrayBuffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetcher(url, init);
      if (r.ok) {
        const buf = await r.arrayBuffer();
        if (await looksLikeAudio(new Blob([buf]))) return buf;
        throw new Error('not audio');
      }
      if (r.status !== 429 && r.status < 500 && attempt >= 1) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (attempt >= 3) throw e;
    }
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
  }
}

async function downloadHls(url: string, fetcher: Fetcher, onProgress?: (p: number) => void): Promise<ArrayBuffer[]> {
  const playlist = await fetcher(url);
  if (!playlist.ok) throw new Error(`HTTP ${playlist.status}`);
  const text = await playlist.text();
  if (/#EXT-X-KEY:METHOD=(?!NONE)/.test(text)) throw new Error('Protected stream');
  const abs = (u: string) => new URL(u, url).toString();
  const init = text.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1];
  const segs = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!segs.length) throw new Error('empty playlist');
  const parts: ArrayBuffer[] = [];
  if (init) parts.push(await hlsPiece(fetcher, abs(init)));
  for (let i = 0; i < segs.length; i++) {
    parts.push(await hlsPiece(fetcher, abs(segs[i])));
    onProgress?.((i + 1) / segs.length);
  }
  return parts;
}

/** Recognisable audio container at the start of the file (a text/HTML error page is not). */
export async function looksLikeAudio(b: Blob): Promise<boolean> {
  const h = new Uint8Array(await b.slice(0, 12).arrayBuffer());
  const s = String.fromCharCode(...h);
  return (
    s.startsWith('ID3') || // mp3 with tags
    (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) || // mp3 / AAC ADTS frame
    (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) || // webm / mkv
    s.slice(4, 8) === 'ftyp' || s.slice(4, 8) === 'styp' || s.slice(4, 8) === 'sidx' || // mp4 / m4a
    s.startsWith('OggS') ||
    s.startsWith('fLaC') ||
    h[0] === 0x47 // MPEG-TS (HLS segments)
  );
}

/** The whole audio file of a resolved stream, from any platform (used for offline downloads). */
export async function fetchAudioFile(s: StreamInfo, onProgress?: (p: number) => void): Promise<Blob> {
  let url = s.url;
  // The hint header only means something to the native fetch: a browser would need a CORS preflight for it.
  let fetcher: Fetcher = (u, i) => {
    const h = new Headers(i?.headers);
    h.delete(BINARY_HINT);
    return fetch(u, { ...i, headers: h });
  };
  let headers: Record<string, string> | undefined;
  if (isTauri && PROXIED.test(url)) {
    // Desktop: through the local proxy (handles client-bound / origin-checked hosts, CORS *).
    const base = await mediaProxyBase();
    if (base) url = base + encodeURIComponent(url);
  } else if (nativeFetch) {
    fetcher = nativeFetch;
    if (/\.googlevideo\.com\//.test(url)) headers = { 'User-Agent': YT_UA };
  }
  const mime = s.kind === 'hls' ? (s.mime?.split(';')[0] ?? 'audio/mpeg') : (s.mime?.split(';')[0] ?? audioMime(s.url));
  const parts = s.kind === 'hls' ? await downloadHls(url, fetcher, onProgress) : await downloadRanged(url, fetcher, { headers, onProgress });
  return new Blob(parts, { type: mime });
}
