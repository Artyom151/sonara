import type { Fetcher, Liker, Playlist, ScTranscoding, StreamInfo, Track, TrendingGenre, ArtistPage } from './types';

const API = 'https://api-v2.soundcloud.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CLIENT_ID_TTL = 6 * 60 * 60 * 1000;

export class StreamUnavailableError extends Error {
  readonly unavailable = true;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

/** SoundCloud tag_list: space separated, multi-word tags in double quotes. */
const parseTags = (list?: string, genre?: string) => {
  const out = new Set<string>();
  if (genre) out.add(genre.toLowerCase().trim());
  for (const m of (list ?? '').matchAll(/"([^"]+)"|(\S+)/g)) {
    const tag = (m[1] ?? m[2] ?? '').toLowerCase().replace(/^#/, '').trim();
    if (tag && tag.length < 40 && !tag.includes(':')) out.add(tag);
  }
  return [...out].slice(0, 20);
};

export const artworkUrl = (url: string | null | undefined, size: 't500x500' | 't300x300' | 'large' = 't500x500') =>
  url ? url.replace(/-(large|t\d+x\d+|crop|original)\.(jpg|png)/, `-${size}.$2`) : undefined;

/**
 * SoundCloud api-v2 client. The public web client_id is scraped from the
 * soundcloud.com JS bundles automatically and refreshed when it expires.
 */
export class SoundCloud {
  private pendingId: Promise<string> | null = null;

  constructor(
    private fetcher: Fetcher,
    private store: KeyValueStore = memoryStore(),
  ) {}

  async clientId(refresh = false): Promise<string> {
    if (!refresh) {
      const cached = this.store.get('sc.client_id');
      const at = Number(this.store.get('sc.client_id.at') ?? 0);
      if (cached && Date.now() - at < CLIENT_ID_TTL) {
        // Past half its life: renew it in the background, so no request ever waits for the scrape.
        if (Date.now() - at > CLIENT_ID_TTL / 2) void this.clientId(true).catch(() => {});
        return cached;
      }
    }
    if (!this.pendingId) {
      this.pendingId = this.scrapeClientId()
        .then((id) => {
          this.store.set('sc.client_id', id);
          this.store.set('sc.client_id.at', String(Date.now()));
          return id;
        })
        .finally(() => (this.pendingId = null));
    }
    return this.pendingId;
  }

  private async scrapeClientId(): Promise<string> {
    const html = await (await this.fetcher('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text();
    const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.js)"/g)].map((m) => m[1]);
    // The client_id lives in one of the last bundles; scan from the end.
    for (const src of scripts.reverse()) {
      try {
        const js = await (await this.fetcher(src, { headers: { 'User-Agent': UA } })).text();
        const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/) ?? js.match(/client_id=([a-zA-Z0-9]{32})/);
        if (m) return m[1];
      } catch {
        /* try next bundle */
      }
    }
    throw new Error('SoundCloud client_id not found');
  }

  async get<T = any>(path: string, params: Record<string, string | number | undefined> = {}, retry = true): Promise<T> {
    const id = await this.clientId();
    const url = new URL(path.startsWith('http') ? path : API + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    url.searchParams.set('client_id', id);
    const res = await this.fetcher(url.toString(), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if ((res.status === 401 || res.status === 403) && retry) {
      await this.clientId(true);
      return this.get(path, params, false);
    }
    if (!res.ok) throw new Error(`SoundCloud ${res.status} ${url.pathname}`);
    return res.json();
  }

  mapTrack = (t: any): Track => ({
    key: `soundcloud:${t.id}`,
    id: String(t.id),
    source: 'soundcloud',
    title: t.title ?? '',
    artist: t.publisher_metadata?.artist || t.user?.username || '',
    artistId: t.user?.id ? String(t.user.id) : undefined,
    artwork: artworkUrl(t.artwork_url || t.user?.avatar_url, 't300x300'),
    artworkLarge: artworkUrl(t.artwork_url || t.user?.avatar_url, 't500x500'),
    duration: Math.round((t.full_duration || t.duration || 0) / 1000),
    likes: t.likes_count ?? undefined,
    plays: t.playback_count ?? undefined,
    genre: t.genre || undefined,
    tags: parseTags(t.tag_list, t.genre),
    url: t.permalink_url,
    sc: {
      auth: t.track_authorization,
      transcodings: (t.media?.transcodings ?? []).map(
        (x: any): ScTranscoding => ({ url: x.url, protocol: x.format?.protocol, mime: x.format?.mime_type, quality: x.quality }),
      ),
    },
  });

  mapPlaylist = (p: any): Playlist => ({
    key: `soundcloud:${p.urn ?? p.id}`,
    id: String(p.urn ?? p.id),
    source: 'soundcloud',
    title: p.short_title || p.title || '',
    subtitle: p.short_description || p.user?.username,
    artwork: artworkUrl(p.artwork_url || p.calculated_artwork_url || p.tracks?.[0]?.artwork_url, 't500x500'),
    trackCount: p.track_count ?? p.tracks?.length ?? 0,
    likes: p.likes_count,
    url: p.permalink_url,
  });

  /** Tracks inside playlists are often stubs ({id} only); hydrate them in batches of 50. */
  async hydrate(stubs: any[]): Promise<Track[]> {
    const full = new Map<number, any>();
    const missing = stubs.filter((t) => !t.title).map((t) => t.id);
    for (let i = 0; i < missing.length; i += 50) {
      const batch: any[] = await this.get('/tracks', { ids: missing.slice(i, i + 50).join(',') });
      for (const t of batch) full.set(t.id, t);
    }
    return stubs
      .map((t) => (t.title ? t : full.get(t.id)))
      .filter((t) => t && t.policy !== 'BLOCK')
      .map(this.mapTrack);
  }

  async search(q: string, limit = 30): Promise<Track[]> {
    const r = await this.get('/search/tracks', { q, limit });
    return r.collection.filter((t: any) => t.policy !== 'BLOCK').map(this.mapTrack);
  }

  async tagTracks(tag: string, limit = 40): Promise<Track[]> {
    const r = await this.get('/search/tracks', { q: '*', 'filter.genre_or_tag': tag, sort: 'popular', limit });
    return r.collection.filter((t: any) => t.policy !== 'BLOCK').map(this.mapTrack);
  }

  async searchPlaylists(q: string, limit = 12): Promise<Playlist[]> {
    const r = await this.get('/search/playlists', { q, limit });
    return r.collection.map(this.mapPlaylist);
  }

  private async selections(): Promise<any[]> {
    const r = await this.get('/mixed-selections', { limit: 10 });
    return r.collection ?? [];
  }

  async home(): Promise<{ trending: TrendingGenre[]; mixes: Playlist[] }> {
    const sel = await this.selections();
    const trendingSel = sel.find((s) => s.urn?.includes('trending-by-genre'));
    const trending: TrendingGenre[] = (trendingSel?.items?.collection ?? [])
      .filter((p: any) => !/all genres/i.test(p.title))
      .map((p: any) => ({
        id: p.urn.split(':').pop(),
        urn: p.urn,
        title: p.short_title || p.title,
        artwork: artworkUrl(p.artwork_url || p.calculated_artwork_url, 't300x300'),
        likes: p.likes_count ?? 0,
      }));
    // Order like charts: by popularity.
    trending.sort((a, b) => b.likes - a.likes);
    const mixes = sel
      .filter((s) => !s.urn?.includes('trending-by-genre'))
      .flatMap((s) => s.items?.collection ?? [])
      .filter((p: any) => p.kind === 'playlist' || p.kind === 'system-playlist')
      .map(this.mapPlaylist);
    return { trending, mixes };
  }

  async systemPlaylist(urn: string): Promise<Playlist> {
    const p = await this.get(`/system-playlists/${encodeURIComponent(urn)}`);
    const tracks = await this.hydrate(p.tracks ?? []);
    return { ...this.mapPlaylist(p), trackCount: tracks.length, tracks };
  }

  /** A playlist (set) from its soundcloud.com link. */
  async playlistByUrl(url: string): Promise<Playlist> {
    const p = await this.get('/resolve', { url });
    if (p?.kind !== 'playlist') throw new Error('Not a SoundCloud playlist link');
    const tracks = await this.hydrate(p.tracks ?? []);
    return { ...this.mapPlaylist(p), trackCount: tracks.length, tracks };
  }

  async playlist(id: string): Promise<Playlist> {
    if (id.startsWith('soundcloud:system-playlists')) return this.systemPlaylist(id);
    const numeric = id.replace(/^soundcloud:playlists:/, '');
    const p = await this.get(`/playlists/${numeric}`);
    const tracks = await this.hydrate(p.tracks ?? []);
    return { ...this.mapPlaylist(p), trackCount: tracks.length, tracks };
  }

  async related(id: string, limit = 20): Promise<Track[]> {
    const r = await this.get(`/tracks/${id}/related`, { limit });
    return r.collection.filter((t: any) => t.policy !== 'BLOCK').map(this.mapTrack);
  }

  async likers(id: string): Promise<Liker[]> {
    const r = await this.get(`/tracks/${id}/likers`, { limit: 3 });
    return (r.collection ?? []).map((u: any) => ({ name: u.first_name || u.username, avatar: artworkUrl(u.avatar_url, 'large') }));
  }

  /** Artist page for a SoundCloud user: top tracks, albums / sets. */
  async artist(id: string): Promise<ArtistPage> {
    const [u, top, albums, sets] = await Promise.all([
      this.get(`/users/${id}`),
      this.get(`/users/${id}/toptracks`, { limit: 25 }).catch(() => ({ collection: [] })),
      this.get(`/users/${id}/albums`, { limit: 20 }).catch(() => ({ collection: [] })),
      this.get(`/users/${id}/playlists_without_albums`, { limit: 20 }).catch(() => ({ collection: [] })),
    ]);
    let tracks: Track[] = (top.collection ?? []).filter((t: any) => t.policy !== 'BLOCK').map(this.mapTrack);
    if (!tracks.length) {
      const r = await this.get(`/users/${id}/tracks`, { limit: 25 }).catch(() => ({ collection: [] }));
      tracks = (r.collection ?? []).filter((t: any) => t.policy !== 'BLOCK').map(this.mapTrack).sort((a: Track, b: Track) => (b.plays ?? 0) - (a.plays ?? 0));
    }
    return {
      key: `soundcloud:artist:${u.id}`,
      source: 'soundcloud',
      id: String(u.id),
      name: u.username,
      picture: artworkUrl(u.avatar_url, 't500x500'),
      fans: u.followers_count,
      top: tracks,
      albums: [...(albums.collection ?? []), ...(sets.collection ?? [])].map(this.mapPlaylist),
      related: [],
    };
  }

  /** First SoundCloud user whose name matches. */
  async findArtist(name: string): Promise<string | null> {
    const r = await this.get('/search/users', { q: name, limit: 5 });
    const n = name.toLowerCase();
    const hit = (r.collection ?? []).find((u: any) => u.username?.toLowerCase() === n) ?? r.collection?.[0];
    return hit ? String(hit.id) : null;
  }

  async track(id: string): Promise<Track> {
    return this.mapTrack(await this.get(`/tracks/${id}`));
  }

  async stream(track: Track, fresh = false): Promise<StreamInfo> {
    let t = track;
    if (fresh || !t.sc?.transcodings?.length) t = await this.track(track.id);
    const list = t.sc?.transcodings ?? [];
    const rank = (x: ScTranscoding) =>
      (x.protocol === 'progressive' ? 0 : 2) + (x.mime.includes('mpeg') ? 0 : 1) + (/preview/.test(x.url) ? 10 : 0);
    // DRM-protected (encrypted HLS) transcodings are not supported.
    const candidates = list.filter((x) => x.protocol === 'progressive' || x.protocol === 'hls').sort((a, b) => rank(a) - rank(b));
    let lastError: unknown = new StreamUnavailableError('This track is only available as a protected stream');
    // Some listed transcodings 404 (region/monetization); fall through until one resolves.
    for (const pick of candidates) {
      try {
        const r = await this.get<{ url: string }>(pick.url, { track_authorization: t.sc?.auth });
        return { url: r.url, kind: pick.protocol === 'hls' ? 'hls' : 'progressive', mime: pick.mime };
      } catch (e) {
        lastError = e;
      }
    }
    // track_authorization expires after a while (e.g. a queue restored after a restart):
    // fetch the track again for fresh authorization and transcodings, then retry once.
    if (!fresh && track.sc?.transcodings?.length) return this.stream(track, true);
    throw lastError;
  }
}
