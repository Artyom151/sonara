import type { ApiOptions, SonaraApi, Source, Track } from './types';

/** Talks to the local Sonara server (server/index.ts). */
export function createHttpApi(base = '', getOptions: () => ApiOptions = () => ({})): SonaraApi {
  const headers = () => {
    const o = getOptions();
    const h: Record<string, string> = {};
    if (o.youtubeApiKey) h['x-yt-key'] = o.youtubeApiKey;
    if (o.region) h['x-region'] = o.region;
    if (o.sources) {
      h['x-src-sc'] = o.sources.soundcloud ? '1' : '0';
      h['x-src-yt'] = o.sources.youtube ? '1' : '0';
    }
    return h;
  };
  const get = async <T>(path: string, params: Record<string, string> = {}): Promise<T> => {
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`${base}/api/${path}${qs ? `?${qs}` : ''}`, { headers: headers() });
    const j = await r.json();
    if (!r.ok || j?.error) throw new Error(j?.error ?? `HTTP ${r.status}`);
    return j;
  };
  // Only the fields the server needs, to keep URLs short.
  const t = (track: Track) => JSON.stringify({ ...track, sc: track.sc ? { auth: track.sc.auth, transcodings: track.sc.transcodings } : undefined });
  return {
    home: () => get('home'),
    genre: (urn) => get('genre', { urn }),
    playlist: (source: Source, id) => get('playlist', { source, id }),
    search: (q, source) => get('search', { q, source }),
    related: (track) => get('related', { track: t(track) }),
    tagTracks: (tag) => get('tag', { tag }),
    async stream(track) {
      const s = await get<{ url: string; kind: 'progressive' | 'hls' }>('stream', { track: t(track) });
      return { ...s, url: s.url.startsWith('/') ? base + s.url : s.url };
    },
    lyrics: (track) => get('lyrics', { track: t(track) }),
    likers: (track) => get('likers', { track: t(track) }),
    clientId: async (refresh) => (await get<{ clientId: string }>('client-id', refresh ? { refresh: '1' } : {})).clientId,
  };
}
