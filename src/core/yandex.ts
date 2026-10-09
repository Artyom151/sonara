import { md5 } from '../lib/md5';
import type { Fetcher, Playlist, StreamInfo, Track } from './types';

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

  private uid: Promise<string> | null = null;
  /** Account id of the token's owner (needs a token Yandex accepts). */
  private account(): Promise<string> {
    if (!this.hasToken) return Promise.reject(new Error('Yandex Music: a music token is needed for your library'));
    return (this.uid ??= this.get('/account/status').then((r) => {
      const uid = r?.account?.uid;
      if (!uid) throw new Error('Yandex Music: not signed in');
      return String(uid);
    })).catch((e) => {
      this.uid = null;
      throw e;
    });
  }

  /** Full track objects for ids ("id" or "id:albumId"), 100 per request. */
  private async tracksById(ids: string[]): Promise<Track[]> {
    const out: Track[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const qs = new URLSearchParams({ 'track-ids': ids.slice(i, i + 100).join(',') });
      const r = await this.get(`/tracks?${qs}`);
      out.push(...((r ?? []) as any[]).map(this.mapTrack).filter((t): t is Track => !!t));
    }
    return out;
  }

  private mapPlaylist = (p: any, owner: string): Playlist => ({
    key: `yandex:${owner}:${p.kind}`,
    id: `${owner}:${p.kind}`,
    source: 'yandex',
    title: p.title,
    subtitle: p.owner?.name ?? p.owner?.login,
    artwork: cover(p.cover?.uri ?? p.cover?.itemsUri?.[0] ?? p.ogImage, 400),
    trackCount: p.trackCount ?? p.tracks?.length ?? 0,
    url: `https://music.yandex.ru/users/${owner}/playlists/${p.kind}`,
  });

  /** "Мне нравится" of the token's owner. */
  async likes(): Promise<Playlist> {
    const uid = await this.account();
    const r = await this.get(`/users/${uid}/likes/tracks`);
    const ids = ((r?.library?.tracks ?? []) as any[]).map((t) => (t.albumId ? `${t.id}:${t.albumId}` : String(t.id)));
    const tracks = await this.tracksById(ids);
    return { key: 'yandex:likes', id: 'likes', source: 'yandex', title: 'Мне нравится', subtitle: 'Яндекс Музыка', artwork: tracks[0]?.artworkLarge, trackCount: tracks.length, tracks };
  }

  /** The owner's own playlists (without tracks). */
  async myPlaylists(): Promise<Playlist[]> {
    const uid = await this.account();
    const r = await this.get(`/users/${uid}/playlists/list`);
    return ((r ?? []) as any[]).map((p) => this.mapPlaylist(p, uid));
  }

  /** A user playlist ("owner:kind"; owner may be a login) or an album ("album:id"). */
  async playlist(id: string): Promise<Playlist> {
    if (id === 'likes') return this.likes();
    if (id.startsWith('album:')) {
      const a = await this.get(`/albums/${id.slice(6)}/with-tracks`);
      const tracks = ((a?.volumes ?? []) as any[][]).flat().map(this.mapTrack).filter((t): t is Track => !!t);
      return {
        key: `yandex:${id}`,
        id,
        source: 'yandex',
        title: a.title,
        subtitle: (a.artists ?? []).map((x: any) => x.name).join(', '),
        artwork: cover(a.coverUri, 400),
        trackCount: tracks.length,
        tracks,
        url: `https://music.yandex.ru/album/${a.id}`,
      };
    }
    const [owner, kind] = id.split(':');
    const p = await this.get(`/users/${encodeURIComponent(owner)}/playlists/${kind}?rich-tracks=true`);
    let tracks = ((p?.tracks ?? []) as any[]).map((x) => (x.track ? this.mapTrack(x.track) : null)).filter((t): t is Track => !!t);
    // Without rich-tracks only ids come back.
    if (!tracks.length && p?.tracks?.length) tracks = await this.tracksById(p.tracks.map((x: any) => (x.albumId ? `${x.id}:${x.albumId}` : String(x.id))));
    return { ...this.mapPlaylist(p, owner), trackCount: tracks.length, tracks };
  }

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
