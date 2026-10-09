import { md5 } from '../lib/md5';
import type { Fetcher, StreamInfo, Track } from './types';

/**
 * Yandex Music (unofficial mobile API, https://api.music.yandex.net).
 * Search and similar tracks work without an account. Full tracks need an OAuth token issued to the
 * Yandex Music app (its music scopes) and a Plus subscription: VITE_YANDEX_MUSIC_TOKEN in .env.
 * A token from another app is refused ("missing-required-scopes"); then, and without a token,
 * Yandex itself only serves its 30-second previews. Tracks never play from another service.
 */
const API = 'https://api.music.yandex.net';
// Constant salt of the official clients for signing download links.
const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA';

const cover = (uri: string | undefined, size: number) => (uri ? `https://${uri.replace('%%', `${size}x${size}`)}` : undefined);

export class YandexMusic {
  /** Set once Yandex refuses the token, so it is not sent again. */
  private tokenRefused = false;

  constructor(
    private fetcher: Fetcher,
    private token: () => string | undefined,
  ) {}

  /** A token is set and Yandex has not refused it. */
  get hasToken() {
    return !!this.token() && !this.tokenRefused;
  }

  private async get(path: string, withToken = this.hasToken): Promise<any> {
    const headers: Record<string, string> = { 'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621' };
    if (withToken) headers.Authorization = `OAuth ${this.token()}`;
    const r = await this.fetcher(`${API}${path}`, { headers });
    if (withToken && (r.status === 401 || r.status === 403)) {
      console.warn('[yandex] token refused, continuing without it:', (await r.json().catch(() => null))?.error?.name ?? r.status);
      this.tokenRefused = true;
      return this.get(path, false);
    }
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

  /** Signed file link of one download-info entry. */
  private async link(info: any): Promise<StreamInfo> {
    const d = await (await this.fetcher(`${info.downloadInfoUrl}&format=json`)).json();
    const sign = md5(SIGN_SALT + String(d.path).slice(1) + d.s);
    return { url: `https://${d.host}/get-mp3/${sign}/${d.ts}${d.path}`, kind: 'progressive', mime: 'audio/mpeg' };
  }

  /** The full file (token with music scopes + Plus), else null. */
  async full(id: string): Promise<StreamInfo | null> {
    if (!this.hasToken) return null;
    const infos = ((await this.get(`/tracks/${id}/download-info`)) ?? []) as any[];
    const best = infos.filter((i) => !i.preview && i.codec === 'mp3').sort((a, b) => b.bitrateInKbps - a.bitrateInKbps)[0];
    return best ? this.link(best) : null;
  }

  /** 30-second preview, available to everyone. */
  async preview(id: string): Promise<StreamInfo> {
    const infos = ((await this.get(`/tracks/${id}/download-info`)) ?? []) as any[];
    const best = infos.filter((i) => i.codec === 'mp3').sort((a, b) => b.bitrateInKbps - a.bitrateInKbps)[0] ?? infos[0];
    if (!best) throw new Error('Yandex Music: no download info');
    return this.link(best);
  }
}
