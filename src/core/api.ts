import { LruMap } from '../lib/lru';
import { fetchLyrics } from './lyrics';
import { SoundCloud, type KeyValueStore } from './soundcloud';
import type { ApiOptions, Fetcher, HomeData, Playlist, SearchResult, SonaraApi, Source, Track } from './types';
import { YouTube } from './youtube';

const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    console.warn('[sonara]', e);
    return fallback;
  }
};

/** Interleave two lists so mixed results feel balanced. */
const interleave = <T>(a: T[], b: T[]) => {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
};

/**
 * The whole music backend, written against a plain `fetch`. It runs inside the
 * local Node server (web/dev) and directly in the app on Android and desktop,
 * where a native, CORS-free fetch is injected.
 */
export function createCoreApi(fetcher: Fetcher, store?: KeyValueStore): SonaraApi & { sc: SoundCloud; yt: YouTube } {
  const sc = new SoundCloud(fetcher, store);
  const yt = new YouTube(fetcher);
  const lyricsCache = new LruMap<string, Promise<any>>(40);

  return {
    sc,
    yt,
    clientId: (refresh) => sc.clientId(refresh),

    async home(opts: ApiOptions = {}): Promise<HomeData> {
      const useSc = opts.sources?.soundcloud ?? true;
      const useYt = opts.sources?.youtube ?? true;
      const [scHome, youtube] = await Promise.all([
        useSc ? settle(sc.home(), { trending: [], mixes: [] }) : { trending: [], mixes: [] },
        useYt ? settle(yt.trending(opts.youtubeApiKey, opts.region), []) : [],
      ]);
      let picks: Track[] = [];
      if (useSc && scHome.trending[0]) {
        const top = await settle(sc.systemPlaylist(scHome.trending[0].urn), null as Playlist | null);
        picks = top?.tracks?.slice(0, 12) ?? [];
      }
      return { ...scHome, picks, youtube };
    },

    genre: (urn) => sc.systemPlaylist(urn),

    playlist: (source: Source, id: string) => (source === 'youtube' ? yt.playlist(id) : sc.playlist(id)),

    async search(q, source, opts = {}): Promise<SearchResult> {
      const useSc = source !== 'youtube' && (opts.sources?.soundcloud ?? true);
      const useYt = source !== 'soundcloud' && (opts.sources?.youtube ?? true);
      const [st, sp, yv, yp] = await Promise.all([
        useSc ? settle(sc.search(q), []) : [],
        useSc ? settle(sc.searchPlaylists(q), []) : [],
        useYt ? settle(yt.search(q, opts.youtubeApiKey), []) : [],
        useYt && source === 'youtube' ? settle(yt.searchPlaylists(q), []) : [],
      ]);
      return { tracks: interleave(st, yv), playlists: interleave(sp, yp) };
    },

    tagTracks: (tag) => settle(sc.tagTracks(tag), []),

    related: (t) => (t.source === 'youtube' ? yt.related(t.id) : sc.related(t.id)),

    stream: (t) => (t.source === 'youtube' ? yt.stream(t.id) : sc.stream(t)),

    likers: async (t) => (t.source === 'soundcloud' ? settle(sc.likers(t.id), []) : []),

    lyrics(t) {
      if (!lyricsCache.has(t.key)) lyricsCache.set(t.key, settle(fetchLyrics(fetcher, t), null));
      return lyricsCache.get(t.key)!;
    },
  };
}
