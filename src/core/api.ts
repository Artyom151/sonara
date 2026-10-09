import { LruMap } from '../lib/lru';
import { fetchLyrics } from './lyrics';
import { SoundCloud, type KeyValueStore } from './soundcloud';
import type { ApiOptions, ArtistPage, ArtistRef, Fetcher, HomeData, Playlist, SearchResult, SonaraApi, Source, StreamInfo, Track } from './types';
import { YouTube } from './youtube';
import { Deezer } from './deezer';
import { RecordingMatcher } from './match';
import { YandexMusic } from './yandex';

/** Optional tokens (VITE_YANDEX_MUSIC_TOKEN in .env). */
export interface SourceTokens {
  yandex?: () => string | undefined;
}

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
export function createCoreApi(
  fetcher: Fetcher,
  store?: KeyValueStore,
  tokens: SourceTokens = {},
): SonaraApi & { sc: SoundCloud; yt: YouTube; dz: Deezer; ym: YandexMusic; matcher: RecordingMatcher; match: (t: Track) => Promise<Track | null> } {
  const sc = new SoundCloud(fetcher, store);
  const yt = new YouTube(fetcher);
  const dz = new Deezer(fetcher, yt);
  // .env ships placeholders ("your_…"): those count as unset.
  const real = (get?: () => string | undefined) => () => {
    const v = get?.()?.trim();
    return v && !v.startsWith('your_') ? v : undefined;
  };
  const ym = new YandexMusic(fetcher, real(tokens.yandex));
  const matcher = new RecordingMatcher(yt, sc);

  /** Yandex plays only from Yandex: the full file with a music token + Plus, otherwise its preview. */
  const yandexStream = async (t: Track): Promise<StreamInfo> => (await settle(ym.full(t.id), null)) ?? ym.preview(t.id);

  const importLink = async (raw: string): Promise<Playlist> => {
    const url = raw.trim();
    const ym1 = url.match(/music\.yandex\.[a-z]+\/users\/([^/?#]+)\/playlists\/(\d+)/);
    if (ym1) return ym.playlist(`${decodeURIComponent(ym1[1])}:${ym1[2]}`);
    const ym2 = url.match(/music\.yandex\.[a-z]+\/album\/(\d+)/);
    if (ym2) return ym.playlist(`album:${ym2[1]}`);
    const ytList = url.match(/(?:youtube\.com|youtu\.be).*[?&]list=([\w-]+)/);
    if (ytList) return yt.playlist(ytList[1]);
    if (/soundcloud\.com\//.test(url)) return sc.playlistByUrl(url.split('?')[0]);
    const dzList = url.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/);
    if (dzList) return dz.playlist(dzList[1]);
    throw new Error('Unsupported link');
  };

  /**
   * Stream links are reused while valid (googlevideo links carry `expire`): replaying a track or
   * the prefetched next track starts at once instead of re-resolving (and minting a token).
   */
  const streamCache = new LruMap<string, { s: StreamInfo; until: number }>(60);
  const cachedStream = async (t: Track): Promise<StreamInfo> => {
    const hit = streamCache.get(t.key);
    if (hit && hit.until > Date.now()) return hit.s;
    const s = await (t.source === 'youtube' ? yt.stream(t.id) : t.source === 'deezer' ? catalogueStream(t) : t.source === 'yandex' ? yandexStream(t) : sc.stream(t));
    const expire = Number(s.url.match(/[?&]expire=(\d+)/)?.[1]) * 1000;
    // Without an expiry: 10 minutes (SoundCloud / Yandex links are short-lived too).
    streamCache.set(t.key, { s, until: expire ? expire - 10 * 60_000 : Date.now() + 10 * 60_000 });
    return s;
  };

  /** Deezer: the same recording on YouTube or SoundCloud, else Deezer's own preview. */
  const catalogueStream = async (t: Track): Promise<StreamInfo> => {
    // Best copy first; one can still refuse to stream (region-blocked SoundCloud), then the next.
    for (const m of await matcher.candidates(t)) {
      try {
        const s = await (m.source === 'youtube' ? yt.stream(m.id) : sc.stream(m));
        // SoundCloud answers label tracks with a 30-second preview: not a full copy.
        if (/\/preview\//.test(s.url)) throw new Error('only a preview');
        return s;
      } catch (e) {
        console.warn(`[match] ${m.source} copy unplayable, trying the next:`, (e as Error).message);
        matcher.drop(t, m);
      }
    }
    if (t.preview) return { url: t.preview, kind: 'progressive', mime: 'audio/mpeg' };
    throw new Error('No full recording of this track was found');
  };
  const lyricsCache = new LruMap<string, Promise<any>>(40);

  return {
    sc,
    yt,
    dz,
    ym,
    matcher,
    match: (t) => matcher.find(t),
    clientId: (refresh) => sc.clientId(refresh),

    async home(opts: ApiOptions = {}): Promise<HomeData> {
      const useSc = opts.sources?.soundcloud ?? true;
      const useYt = opts.sources?.youtube ?? true;
      const useDz = opts.sources?.deezer ?? true;
      const useYm = (opts.sources?.yandex ?? true) && ym.hasToken;
      const [scHome, youtube, deezer, yandex] = await Promise.all([
        useSc ? settle(sc.home(), { trending: [], mixes: [] }) : { trending: [], mixes: [] },
        useYt ? settle(yt.trending(opts.youtubeApiKey, opts.region), []) : [],
        useDz ? settle(dz.chart(), []) : [],
        useYm ? settle(Promise.all([ym.likes(), settle(ym.myPlaylists(), [])]).then(([l, ps]) => [l, ...ps]), []) : [],
      ]);
      let picks: Track[] = [];
      if (useSc && scHome.trending[0]) {
        const top = await settle(sc.systemPlaylist(scHome.trending[0].urn), null as Playlist | null);
        picks = top?.tracks?.slice(0, 12) ?? [];
      }
      return { ...scHome, picks, youtube, deezer, yandex };
    },

    genre: (urn) => sc.systemPlaylist(urn),

    playlist: (source: Source, id: string) =>
      source === 'youtube' ? yt.playlist(id) : source === 'deezer' ? dz.playlist(id) : source === 'yandex' ? ym.playlist(id) : sc.playlist(id),

    importLink: (url) => importLink(url),

    async search(q, source, opts = {}): Promise<SearchResult> {
      const useSc = (source === 'all' || source === 'soundcloud') && (opts.sources?.soundcloud ?? true);
      const useYt = (source === 'all' || source === 'youtube') && (opts.sources?.youtube ?? true);
      const useDz = (source === 'all' || source === 'deezer') && (opts.sources?.deezer ?? true);
      const useYm = (source === 'all' || source === 'yandex') && (opts.sources?.yandex ?? true);
      const [st, sp, yv, yp, dt, dp, ymt] = await Promise.all([
        useSc ? settle(sc.search(q), []) : [],
        useSc ? settle(sc.searchPlaylists(q), []) : [],
        useYt ? settle(yt.search(q, opts.youtubeApiKey), []) : [],
        useYt && source === 'youtube' ? settle(yt.searchPlaylists(q), []) : [],
        useDz ? settle(dz.search(q), []) : [],
        useDz ? settle(dz.searchPlaylists(q), []) : [],
        useYm ? settle(ym.search(q), []) : [],
      ]);
      return { tracks: interleave(interleave(interleave(st, yv), dt), ymt), playlists: interleave(interleave(sp, yp), dp) };
    },

    tagTracks: (tag) => settle(sc.tagTracks(tag), []),

    related: (t) =>
      t.source === 'youtube' ? yt.related(t.id) : t.source === 'deezer' ? dz.related(t) : t.source === 'yandex' ? ym.related(t.id) : sc.related(t.id),

    stream: (t) => cachedStream(t),

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
