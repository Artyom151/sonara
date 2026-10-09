import type { ArtistPage, Fetcher, Playlist, StreamInfo, Track } from './types';
import type { YouTube } from './youtube';

/**
 * Deezer's public catalogue API (https://api.deezer.com, no key): search, charts, playlists.
 * Deezer only serves 30-second previews without a subscription, so a full track is played from
 * the same recording on YouTube or SoundCloud (core/match.ts); the preview is the last resort.
 */
const API = 'https://api.deezer.com';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Optional Deezer client library. The Node server plugs in `deezer-api-ts`; in the apps (Android,
 * desktop) the same endpoints are called with the native fetch.
 */
export interface DeezerLib {
  searchTracks(q: string): Promise<{ data?: any[] }>;
  searchArtists(q: string): Promise<{ data?: any[] }>;
  searchPlaylists(q: string): Promise<{ data?: any[] }>;
  getArtist(id: number): Promise<any>;
  getArtistAlbums(id: number): Promise<{ data?: any[] }>;
  getAlbum(id: number): Promise<any>;
}

const norm2 = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export class Deezer {
  lib: DeezerLib | null = null;

  constructor(
    private fetcher: Fetcher,
    private yt: YouTube,
  ) {}

  private async get(path: string): Promise<any> {
    const r = await this.fetcher(`${API}${path}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error.message ?? 'Deezer error');
    return j;
  }

  private mapTrack = (t: any): Track | null => {
    if (!t?.id || t.readable === false) return null;
    return {
      key: `deezer:${t.id}`,
      id: String(t.id),
      source: 'deezer',
      title: t.title,
      artist: t.artist?.name ?? '',
      artistId: t.artist?.id ? String(t.artist.id) : undefined,
      artwork: t.album?.cover_medium,
      artworkLarge: t.album?.cover_xl ?? t.album?.cover_big,
      duration: t.duration ?? 0,
      plays: t.rank,
      url: t.link,
      preview: t.preview || undefined,
    };
  };

  async search(q: string): Promise<Track[]> {
    const j = this.lib ? await this.lib.searchTracks(q) : await this.get(`/search?q=${encodeURIComponent(q)}&limit=25`);
    return (j.data ?? []).slice(0, 25).map(this.mapTrack).filter(Boolean) as Track[];
  }

  async searchPlaylists(q: string): Promise<Playlist[]> {
    const j = this.lib ? await this.lib.searchPlaylists(q) : await this.get(`/search/playlist?q=${encodeURIComponent(q)}&limit=12`);
    return (j.data ?? []).slice(0, 12).map(
      (p: any): Playlist => ({
        key: `deezer:${p.id}`,
        id: String(p.id),
        source: 'deezer',
        title: p.title,
        subtitle: p.user?.name,
        artwork: p.picture_medium,
        trackCount: p.nb_tracks ?? 0,
        url: p.link,
      }),
    );
  }

  async chart(): Promise<Track[]> {
    const j = await this.get('/chart/0/tracks?limit=25');
    return (j.data ?? []).map(this.mapTrack).filter(Boolean) as Track[];
  }

  private mapAlbum = (a: any): Playlist => ({
    key: `deezer:album:${a.id}`,
    id: `album:${a.id}`,
    source: 'deezer',
    title: a.title,
    subtitle: [a.artist?.name, a.release_date?.slice(0, 4)].filter(Boolean).join(' · '),
    artwork: a.cover_xl ?? a.cover_big ?? a.cover_medium,
    trackCount: a.nb_tracks ?? 0,
    url: a.link,
  });

  async album(id: string): Promise<Playlist> {
    const a = this.lib ? await this.lib.getAlbum(Number(id)) : await this.get(`/album/${encodeURIComponent(id)}`);
    if (a?.error) throw new Error(a.error.message ?? 'Deezer error');
    // Album tracks carry no album object: give them the album's cover.
    const tracks = (a.tracks?.data ?? []).map((t: any) => this.mapTrack({ ...t, album: { cover_medium: a.cover_medium, cover_xl: a.cover_xl } })).filter(Boolean) as Track[];
    return { ...this.mapAlbum(a), trackCount: tracks.length, tracks };
  }

  async artist(id: string): Promise<ArtistPage> {
    const n = Number(id);
    const [a, top, albums, related] = await Promise.all([
      this.lib ? this.lib.getArtist(n) : this.get(`/artist/${n}`),
      this.get(`/artist/${n}/top?limit=30`),
      (this.lib ? this.lib.getArtistAlbums(n) : this.get(`/artist/${n}/albums?limit=40`)).catch(() => ({ data: [] })),
      this.get(`/artist/${n}/related?limit=12`).catch(() => ({ data: [] })),
    ]);
    if (a?.error) throw new Error(a.error.message ?? 'Deezer error');
    return {
      key: `deezer:artist:${a.id}`,
      source: 'deezer',
      id: String(a.id),
      name: a.name,
      picture: a.picture_xl ?? a.picture_big,
      fans: a.nb_fan,
      top: (top.data ?? []).map(this.mapTrack).filter(Boolean) as Track[],
      // Newest first, singles after albums.
      albums: (albums.data ?? [])
        .sort((x: any, y: any) => (x.record_type === 'album' ? 0 : 1) - (y.record_type === 'album' ? 0 : 1) || String(y.release_date).localeCompare(String(x.release_date)))
        .map(this.mapAlbum),
      related: (related.data ?? []).map((r: any) => ({ source: 'deezer' as const, id: String(r.id), name: r.name, picture: r.picture_medium })),
    };
  }

  /** Deezer artist id for a name, only when the name really matches. */
  async findArtist(name: string): Promise<string | null> {
    const j = this.lib ? await this.lib.searchArtists(name) : await this.get(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    const want = norm2(name);
    const hit = (j.data ?? []).find((a: any) => norm2(a.name) === want);
    return hit ? String(hit.id) : null;
  }

  async playlist(id: string): Promise<Playlist> {
    if (id.startsWith('album:')) return this.album(id.slice(6));
    const p = await this.get(`/playlist/${encodeURIComponent(id)}`);
    const tracks = (p.tracks?.data ?? []).map(this.mapTrack).filter(Boolean) as Track[];
    return {
      key: `deezer:${p.id}`,
      id: String(p.id),
      source: 'deezer',
      title: p.title,
      subtitle: p.creator?.name,
      artwork: p.picture_xl ?? p.picture_big,
      trackCount: tracks.length,
      tracks,
      url: p.link,
    };
  }

  async related(t: Track): Promise<Track[]> {
    if (!t.artistId) return [];
    const j = await this.get(`/artist/${t.artistId}/radio?limit=20`);
    return (j.data ?? []).map(this.mapTrack).filter(Boolean) as Track[];
  }
}
