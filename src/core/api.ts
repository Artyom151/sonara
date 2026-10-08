import { LruMap } from '../lib/lru';
import { fetchLyrics } from './lyrics';
import { SoundCloud, type KeyValueStore } from './soundcloud';
import type { ApiOptions, ArtistPage, ArtistRef, Fetcher, HomeData, Playlist, SearchResult, SonaraApi, Source, Track } from './types';
import { YouTube } from './youtube';
import { Deezer } from './deezer';

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
export function createCoreApi(fetcher: Fetcher, store?: KeyValueStore): SonaraApi & { sc: SoundCloud; yt: YouTube; dz: Deezer } {
  const sc = new SoundCloud(fetcher, store);
  const yt = new YouTube(fetcher);
  const dz = new Deezer(fetcher, yt);
  const lyricsCache = new LruMap<string, Promise<any>>(40);

  return {
    sc,
    yt,
    dz,
    clientId: (refresh) => sc.clientId(refresh),

    async home(opts: ApiOptions = {}): Promise<HomeData> {
      const useSc = opts.sources?.soundcloud ?? true;
      const useYt = opts.sources?.youtube ?? true;
      const useDz = opts.sources?.deezer ?? true;
      const [scHome, youtube, deezer] = await Promise.all([
        useSc ? settle(sc.home(), { trending: [], mixes: [] }) : { trending: [], mixes: [] },
        useYt ? settle(yt.trending(opts.youtubeApiKey, opts.region), []) : [],
        useDz ? settle(dz.chart(), []) : [],
      ]);
      let picks: Track[] = [];
      if (useSc && scHome.trending[0]) {
        const top = await settle(sc.systemPlaylist(scHome.trending[0].urn), null as Playlist | null);
        picks = top?.tracks?.slice(0, 12) ?? [];
      }
      return { ...scHome, picks, youtube, deezer };
    },

    genre: (urn) => sc.systemPlaylist(urn),

    playlist: (source: Source, id: string) => (source === 'youtube' ? yt.playlist(id) : source === 'deezer' ? dz.playlist(id) : sc.playlist(id)),

    async search(q, source, opts = {}): Promise<SearchResult> {
      const useSc = source !== 'youtube' && (opts.sources?.soundcloud ?? true);
      const useYt = (source === 'all' || source === 'youtube') && (opts.sources?.youtube ?? true);
      const useDz = (source === 'all' || source === 'deezer') && (opts.sources?.deezer ?? true);
      const [st, sp, yv, yp, dt, dp] = await Promise.all([
        useSc ? settle(sc.search(q), []) : [],
        useSc ? settle(sc.searchPlaylists(q), []) : [],
        useYt ? settle(yt.search(q, opts.youtubeApiKey), []) : [],
        useYt && source === 'youtube' ? settle(yt.searchPlaylists(q), []) : [],
        useDz ? settle(dz.search(q), []) : [],
        useDz ? settle(dz.searchPlaylists(q), []) : [],
      ]);
      return { tracks: interleave(interleave(st, yv), dt), playlists: interleave(interleave(sp, yp), dp) };
    },

    tagTracks: (tag) => settle(sc.tagTracks(tag), []),

    related: (t) => (t.source === 'youtube' ? yt.related(t.id) : t.source === 'deezer' ? dz.related(t) : sc.related(t.id)),

    stream: (t) => (t.source === 'youtube' ? yt.stream(t.id) : t.source === 'deezer' ? dz.stream(t) : sc.stream(t)),

    likers: async (t) => (t.source === 'soundcloud' ? settle(sc.likers(t.id), []) : []),

    async artist(ref: ArtistRef): Promise<ArtistPage> {
      // Native pages when the id is known; otherwise Deezer has the best "popular tracks" data.
      if (ref.source === 'deezer' && ref.id) return dz.artist(ref.id);
      if (ref.source === 'soundcloud' && ref.id) return sc.artist(ref.id);
      const dzId = await settle(dz.findArtist(ref.name), null);
      if (dzId) return dz.artist(dzId);
      if (ref.source === 'soundcloud') {
        const scId = await settle(sc.findArtist(ref.name), null);
        if (scId) return sc.artist(scId);
      }
      const want = ref.name.toLowerCase();
      const found = await settle(yt.search(ref.name), []);
      const top = found.filter((t) => t.artist.toLowerCase().includes(want) || t.title.toLowerCase().includes(want));
      return { key: `youtube:artist:${ref.name}`, source: 'youtube', id: ref.name, name: ref.name, picture: top[0]?.artworkLarge, top: top.length ? top : found, albums: [], related: [] };
    },

    lyrics(t) {
      if (!lyricsCache.has(t.key)) lyricsCache.set(t.key, settle(fetchLyrics(fetcher, t), null));
      return lyricsCache.get(t.key)!;
    },
  };
}
