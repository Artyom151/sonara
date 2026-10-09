import { md5 } from '../lib/md5';
import type { Fetcher, StreamInfo, Track } from './types';

/**
 * Yandex Music (unofficial mobile API, https://api.music.yandex.net). Needs an OAuth token of a
 * Yandex account: VITE_YANDEX_MUSIC_TOKEN in .env. Without a Plus subscription Yandex serves
 * 30-second previews only.
 */
const API = 'https://api.music.yandex.net';
// Constant salt of the official clients for signing download links.
const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA';

const cover = (uri: string | undefined, size: number) => (uri ? `https://${uri.replace('%%', `${size}x${size}`)}` : undefined);

export class YandexMusic {
  constructor(
    private fetcher: Fetcher,
    private token: () => string | undefined,
  ) {}

  get enabled() {
    return !!this.token();
  }

  private async get(path: string): Promise<any> {
    const token = this.token();
    if (!token) throw new Error('Yandex Music token is not set (VITE_YANDEX_MUSIC_TOKEN)');
    const r = await this.fetcher(`${API}${path}`, { headers: { Authorization: `OAuth ${token}`, 'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621' } });
    if (!r.ok) throw new Error(`Yandex Music ${r.status} ${path}`);
    return (await r.json()).result;
  }

  private mapTrack = (t: any): Track | null => {
    if (!t?.id || t.available === false) return null;
    const album = t.albums?.[0];
    return {
      key: `yandex:${t.id}`,
      id: String(t.id),
      source: 'yandex',
      title: t.version ? `${t.title} (${t.version})` : t.title,
      artist: (t.artists ?? []).map((a: any) => a.name).join(', '),
      artistId: t.artists?.[0]?.id ? String(t.artists[0].id) : undefined,
      artwork: cover(t.coverUri ?? album?.coverUri, 200),
      artworkLarge: cover(t.coverUri ?? album?.coverUri, 600),
      duration: Math.round((t.durationMs ?? 0) / 1000),
      genre: album?.genre,
      url: album?.id ? `https://music.yandex.ru/album/${album.id}/track/${t.id}` : undefined,
    };
  };

  async search(q: string): Promise<Track[]> {
    const r = await this.get(`/search?text=${encodeURIComponent(q)}&type=track&page=0&nocorrect=false`);
    return ((r?.tracks?.results ?? []) as any[]).map(this.mapTrack).filter(Boolean).slice(0, 25) as Track[];
  }

  async related(id: string): Promise<Track[]> {
    const r = await this.get(`/tracks/${id}/similar`);
    return ((r?.similarTracks ?? []) as any[]).map(this.mapTrack).filter(Boolean) as Track[];
  }

  async stream(id: string): Promise<StreamInfo> {
    const infos = ((await this.get(`/tracks/${id}/download-info`)) ?? []) as any[];
    const best = infos.filter((i) => i.codec === 'mp3').sort((a, b) => b.bitrateInKbps - a.bitrateInKbps)[0] ?? infos[0];
    if (!best) throw new Error('Yandex Music: no download info');
    const r = await this.fetcher(`${best.downloadInfoUrl}&format=json`);
    const d = await r.json();
    const sign = md5(SIGN_SALT + String(d.path).slice(1) + d.s);
    return { url: `https://${d.host}/get-mp3/${sign}/${d.ts}${d.path}`, kind: 'progressive', mime: 'audio/mpeg' };
  }
}
