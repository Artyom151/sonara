export type Source = 'soundcloud' | 'youtube' | 'deezer' | 'yandex';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface Track {
  /** Globally unique id: `${source}:${nativeId}` */
  key: string;
  id: string;
  source: Source;
  title: string;
  artist: string;
  artistId?: string;
  artwork?: string;
  artworkLarge?: string;
  /** seconds */
  duration: number;
  likes?: number;
  plays?: number;
  genre?: string;
  /** Style tags (SoundCloud tag_list + genre), lower-case. */
  tags?: string[];
  url?: string;
  /** 30-second preview (Deezer), played when no full recording is found. */
  preview?: string;
  /** SoundCloud-only data needed to resolve a stream */
  sc?: { auth?: string; transcodings?: ScTranscoding[] };
}

export interface ScTranscoding {
  url: string;
  protocol: 'progressive' | 'hls' | string;
  mime: string;
  quality?: string;
}

export interface Playlist {
  key: string;
  id: string;
  source: Source | 'local';
  title: string;
  subtitle?: string;
  artwork?: string;
  trackCount: number;
  likes?: number;
  tracks?: Track[];
  url?: string;
}

export interface TrendingGenre {
  id: string;
  urn: string;
  title: string;
  artwork?: string;
  likes: number;
}

export interface HomeData {
  trending: TrendingGenre[];
  mixes: Playlist[];
  picks: Track[];
  youtube: Track[];
  /** Deezer global chart. */
  deezer?: Track[];
  /** Yandex Music library of the token's owner ("Мне нравится" + own playlists). */
  yandex?: Playlist[];
}

export interface SearchResult {
  tracks: Track[];
  playlists: Playlist[];
}

export interface StreamInfo {
  url: string;
  kind: 'progressive' | 'hls';
  mime?: string;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface Lyrics {
  synced: LyricLine[] | null;
  plain: string | null;
  instrumental?: boolean;
}

export interface Liker {
  name: string;
  avatar?: string;
}

export interface ApiOptions {
  youtubeApiKey?: string;
  region?: string;
  sources?: { soundcloud: boolean; youtube: boolean; deezer?: boolean; yandex?: boolean };
}

/** What the UI knows about an artist when opening their page. */
export interface ArtistRef {
  source: Source;
  /** Native id when known (SoundCloud user id, Deezer artist id, YouTube channel id). */
  id?: string;
  name: string;
}

export interface ArtistPage {
  key: string;
  source: Source;
  id: string;
  name: string;
  picture?: string;
  /** Followers / fans. */
  fans?: number;
  top: Track[];
  albums: Playlist[];
  related: (ArtistRef & { picture?: string })[];
}

export interface SonaraApi {
  home(opts?: ApiOptions): Promise<HomeData>;
  genre(urn: string): Promise<Playlist>;
  playlist(source: Source, id: string): Promise<Playlist>;
  search(q: string, source: 'all' | Source, opts?: ApiOptions): Promise<SearchResult>;
  related(track: Track): Promise<Track[]>;
  stream(track: Track): Promise<StreamInfo>;
  lyrics(track: Track): Promise<Lyrics | null>;
  likers(track: Track): Promise<Liker[]>;
  /** Popular tracks for a genre or tag (SoundCloud). */
  tagTracks(tag: string): Promise<Track[]>;
  clientId(refresh?: boolean): Promise<string>;
  artist(ref: ArtistRef): Promise<ArtistPage>;
  /** A playlist or album from a Yandex Music, YouTube or SoundCloud link, with its tracks. */
  importLink(url: string): Promise<Playlist>;
}
