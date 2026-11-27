import { isTauri, nativeFetch } from '../platform';

const cache = new Map<string, Promise<string>>();

export function proxiedArtwork(src: string): Promise<string> {
  const cached = cache.get(src);
  if (cached) return cached;
  const request = nativeFetch!(src).then(async (response) => {
    if (!response.ok) throw new Error(`Artwork HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error('Artwork is empty');
    return URL.createObjectURL(new Blob([bytes], { type: response.headers.get('content-type') ?? 'image/jpeg' }));
  }).catch((error) => {
    console.warn('[artwork] native fetch failed:', src, error);
    cache.delete(src);
    throw error;
  });
  cache.set(src, request);
  if (cache.size > 60) {
    const oldest = cache.keys().next().value!;
    const request = cache.get(oldest);
    cache.delete(oldest);
    void request?.then(URL.revokeObjectURL).catch(() => {});
  }
  return request;
}

export function needsNativeArtwork(src: string): boolean {
  if (!isTauri || !nativeFetch) return false;
  try {
    const host = new URL(src).hostname;
    return host === 'sndcdn.com' || host.endsWith('.sndcdn.com');
  } catch {
    return false;
  }
}
