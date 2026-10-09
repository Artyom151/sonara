import type { Fetcher, StreamInfo, Track } from './types';

/**
 * VK Music (api.vk.com audio.* methods). These methods only answer tokens of clients that VK
 * allows audio for (Kate Mobile / VK Android): VITE_VK_TOKEN in .env. Requests carry that
 * client's user agent, which the apps' native fetch and the server can set.
 */
const API = 'https://api.vk.com/method';
const V = '5.131';
const UA = 'KateMobileAndroid/56 lite-460 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)';

export class VkMusic {
  constructor(
    private fetcher: Fetcher,
    private token: () => string | undefined,
  ) {}

  get enabled() {
    return !!this.token();
  }

  private async call(method: string, params: Record<string, string>): Promise<any> {
    const token = this.token();
    if (!token) throw new Error('VK token is not set (VITE_VK_TOKEN)');
    const qs = new URLSearchParams({ ...params, access_token: token, v: V });
    const r = await this.fetcher(`${API}/${method}?${qs}`, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    if (j.error) throw new Error(`VK ${j.error.error_code}: ${j.error.error_msg}`);
    return j.response;
  }

  private mapTrack = (a: any): Track | null => {
    if (!a?.id || a.content_restricted) return null;
    const thumb = a.album?.thumb;
    return {
      key: `vk:${a.owner_id}_${a.id}`,
      id: `${a.owner_id}_${a.id}${a.access_key ? `_${a.access_key}` : ''}`,
      source: 'vk',
      title: a.subtitle ? `${a.title} (${a.subtitle})` : a.title,
      artist: a.artist ?? '',
      artwork: thumb?.photo_300 ?? thumb?.photo_270,
      artworkLarge: thumb?.photo_1200 ?? thumb?.photo_600 ?? thumb?.photo_300,
      duration: a.duration ?? 0,
      url: `https://vk.com/audio${a.owner_id}_${a.id}`,
    };
  };

  async search(q: string): Promise<Track[]> {
    const r = await this.call('audio.search', { q, count: '30', auto_complete: '1', sort: '2' });
    return ((r?.items ?? []) as any[]).map(this.mapTrack).filter(Boolean) as Track[];
  }

  async related(id: string): Promise<Track[]> {
    const r = await this.call('audio.getRecommendations', { target_audio: id.split('_').slice(0, 2).join('_'), count: '30' });
    return ((r?.items ?? []) as any[]).map(this.mapTrack).filter(Boolean) as Track[];
  }

  /** Links expire, so they are fetched when the track starts. */
  async stream(id: string): Promise<StreamInfo> {
    const [a] = (await this.call('audio.getById', { audios: id })) ?? [];
    if (!a?.url) throw new Error('VK: audio unavailable');
    const hls = /\.m3u8(\?|$)/.test(a.url);
    return { url: a.url, kind: hls ? 'hls' : 'progressive', mime: hls ? undefined : 'audio/mpeg' };
  }
}
