import type { Innertube } from 'youtubei.js';
import type { Fetcher, Playlist, StreamInfo, Track } from './types';

/** youtubei.js is large (~500 KB): load it only when YouTube is first used. */
let lib: Promise<typeof import('youtubei.js')> | null = null;
const loadLib = () =>
  (lib ??= import('youtubei.js').then((m) => {
    m.Log.setLevel(m.Log.Level.NONE);
    // youtubei.js asks the host to evaluate the player's deciphering code.
    m.Platform.shim.eval = async (data: { output: string }, env: Record<string, string | undefined>) => {
      const props: string[] = [];
      if (env.n) props.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
      if (env.sig) props.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
      return new Function(`${data.output}\nreturn { ${props.join(', ')} }`)();
    };
    return m;
  }));

/** Clients ordered by how reliably they return plain (non-ciphered) audio URLs. */
const CLIENTS = ['IOS', 'TV', 'WEB_EMBEDDED', 'MWEB', 'WEB'] as const;

const parseIsoDuration = (iso: string) => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};

const cleanArtist = (s: string) => s.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();

const thumb = (id: string, q: 'hqdefault' | 'maxresdefault' | 'mqdefault' = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

/**
 * YouTube via the Innertube API (no key needed). When a YouTube Data API v3
 * key is configured, search and charts go through the official API instead.
 */
export class YouTube {
  private yt: Promise<Innertube> | null = null;

  constructor(private fetcher: Fetcher) {}

  private client(): Promise<Innertube> {
    if (!this.yt) {
      this.yt = loadLib().then(({ Innertube }) => Innertube.create({
        fetch: ((input: RequestInfo | URL, init?: RequestInit) => this.fetchAdapter(input, init)) as typeof fetch,
        generate_session_locally: true,
        retrieve_player: true,
      })).catch((e) => {
        this.yt = null;
        throw e;
      });
    }
    return this.yt;
  }

  private async fetchAdapter(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === 'string' || input instanceof URL) return this.fetcher(input.toString(), init);
    const req = input as Request;
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.clone().text() : undefined;
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    if (init?.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    return this.fetcher(req.url, { method: req.method, headers, body: (init?.body as string) ?? body });
  }

  private mapVideo = (v: any): Track | null => {
    const id = v.video_id ?? v.id;
    if (!id || typeof id !== 'string') return null;
    const title = v.title?.toString?.() ?? v.title?.text ?? '';
    const artist = cleanArtist(v.author?.name ?? v.short_byline_text?.toString?.() ?? v.artists?.[0]?.name ?? '');
    return {
      key: `youtube:${id}`,
      id,
      source: 'youtube',
      title,
      artist,
      artwork: thumb(id, 'mqdefault'),
      artworkLarge: thumb(id, 'hqdefault'),
      duration: v.duration?.seconds ?? 0,
      plays: v.view_count ? Number(String(v.view_count.toString()).replace(/\D/g, '')) || undefined : undefined,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  };

  async search(q: string, key?: string): Promise<Track[]> {
    if (key) return this.searchData(q, key);
    const yt = await this.client();
    const r = await yt.search(q, { type: 'video' });
    return (r.results ?? [])
      .filter((x: any) => x.type === 'Video' && (x.duration?.seconds ?? 0) > 0 && x.duration.seconds < 1200)
      .map(this.mapVideo)
      .filter(Boolean) as Track[];
  }

  async searchPlaylists(q: string): Promise<Playlist[]> {
    const yt = await this.client();
    const r = await yt.search(q, { type: 'playlist' });
    return (r.results ?? [])
      .filter((x: any) => x.type === 'Playlist' || x.type === 'LockupView')
      .map((p: any): Playlist | null => {
        const id = p.id ?? p.content_id;
        if (!id) return null;
        const title = p.title?.toString?.() ?? p.metadata?.title?.toString?.() ?? '';
        const count = Number(String(p.video_count?.toString?.() ?? '').replace(/\D/g, '')) || 0;
        const thumbnail = p.thumbnails?.[0]?.url ?? p.content_image?.primary_thumbnail?.image?.[0]?.url;
        return { key: `youtube:${id}`, id, source: 'youtube', title, subtitle: p.author?.name, artwork: thumbnail, trackCount: count };
      })
      .filter(Boolean)
      .slice(0, 12) as Playlist[];
  }

  async playlist(id: string): Promise<Playlist> {
    const yt = await this.client();
    const p = await yt.getPlaylist(id);
    const tracks = (p.videos ?? []).map(this.mapVideo).filter(Boolean) as Track[];
    return {
      key: `youtube:${id}`,
      id,
      source: 'youtube',
      title: p.info?.title ?? 'YouTube',
      subtitle: p.info?.author?.name,
      artwork: tracks[0]?.artworkLarge,
      trackCount: tracks.length,
      tracks,
      url: `https://www.youtube.com/playlist?list=${id}`,
    };
  }

  async related(id: string): Promise<Track[]> {
    const yt = await this.client();
    const info = await yt.getInfo(id);
    const feed: any[] = (info as any).watch_next_feed ?? [];
    return feed
      .map((x) => (x.type === 'CompactVideo' ? this.mapVideo(x) : x.content_type === 'VIDEO' ? this.mapLockup(x) : null))
      .filter(Boolean)
      .slice(0, 20) as Track[];
  }

  private mapLockup = (x: any): Track | null => {
    const id = x.content_id;
    if (!id) return null;
    const rows = x.metadata?.metadata?.metadata_rows ?? [];
    return {
      key: `youtube:${id}`,
      id,
      source: 'youtube',
      title: x.metadata?.title?.toString?.() ?? '',
      artist: cleanArtist(rows[0]?.metadata_parts?.[0]?.text?.toString?.() ?? ''),
      artwork: thumb(id, 'mqdefault'),
      artworkLarge: thumb(id, 'hqdefault'),
      duration: 0,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  };

  /** Most popular music videos. Uses the Data API chart when a key is set. */
  async trending(key?: string, region = 'US'): Promise<Track[]> {
    if (key) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&videoCategoryId=10&maxResults=25&regionCode=${region}&key=${key}`;
      const r = await (await this.fetcher(url)).json();
      if (r.error) throw new Error(r.error.message);
      return (r.items ?? []).map(this.mapDataItem);
    }
    return this.search(`top music hits ${new Date().getFullYear()}`);
  }

  private mapDataItem = (it: any): Track => {
    const id = typeof it.id === 'string' ? it.id : it.id.videoId;
    return {
      key: `youtube:${id}`,
      id,
      source: 'youtube',
      title: it.snippet.title,
      artist: cleanArtist(it.snippet.channelTitle),
      artwork: it.snippet.thumbnails?.medium?.url ?? thumb(id, 'mqdefault'),
      artworkLarge: it.snippet.thumbnails?.high?.url ?? thumb(id),
      duration: it.contentDetails ? parseIsoDuration(it.contentDetails.duration) : 0,
      likes: it.statistics?.likeCount ? Number(it.statistics.likeCount) : undefined,
      plays: it.statistics?.viewCount ? Number(it.statistics.viewCount) : undefined,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  };

  private async searchData(q: string, key: string): Promise<Track[]> {
    const s = await (
      await this.fetcher(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=25&q=${encodeURIComponent(q)}&key=${key}`,
      )
    ).json();
    if (s.error) throw new Error(s.error.message);
    const ids = (s.items ?? []).map((i: any) => i.id.videoId).join(',');
    if (!ids) return [];
    const v = await (
      await this.fetcher(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids}&key=${key}`)
    ).json();
    return (v.items ?? []).map(this.mapDataItem);
  }

  async stream(id: string): Promise<StreamInfo> {
    const yt = await this.client();
    let lastError: unknown;
    for (const client of CLIENTS) {
      try {
        const info = await yt.getBasicInfo(id, { client });
        let format;
        try {
          format = info.chooseFormat({ type: 'audio', quality: 'best', format: 'mp4' });
        } catch {
          format = info.chooseFormat({ type: 'audio', quality: 'best' });
        }
        const url = await format.decipher(yt.session.player);
        if (url) return { url, kind: 'progressive', mime: format.mime_type };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('YouTube stream unavailable');
  }
}
