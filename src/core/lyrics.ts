import type { Fetcher, LyricLine, Lyrics, Track } from './types';

/** Lyrics are fetched at runtime from LRCLIB (https://lrclib.net), an open lyrics database. */
const LRCLIB = 'https://lrclib.net/api';

const clean = (s: string) =>
  s
    .replace(/\s*[([](official|lyric|lyrics|audio|video|visualizer|hd|4k|mv|prod\.?|free download|out now)[^)\]]*[)\]]/gi, '')
    .replace(/\s*(ft\.?|feat\.?|featuring)\s.+$/i, '')
    .replace(/\s*\|.*$/, '')
    .trim();

const stripAll = (s: string) => clean(s).replace(/\s*[([][^)\]]*[)\]]/g, '').trim();

/** Candidate (artist, title) pairs: uploads are often "Artist - Title" or "Title - Artist". */
const candidates = (track: Track) => {
  const out: { artist: string; title: string }[] = [];
  const m = track.title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    const [a, b] = [stripAll(m[1]), stripAll(m[2])];
    const artist = stripAll(track.artist).toLowerCase();
    if (artist && b.toLowerCase().includes(artist)) out.push({ artist: b, title: a });
    out.push({ artist: a, title: b });
  }
  out.push({ artist: stripAll(track.artist), title: stripAll(track.title) });
  return out.filter((c) => c.artist && c.title);
};

export const parseLrc = (lrc: string): LyricLine[] =>
  lrc
    .split('\n')
    .flatMap((line) => {
      const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const text = line.replace(/\[[^\]]*\]/g, '').trim();
      return stamps.map((m) => ({ time: Number(m[1]) * 60 + Number(m[2]), text }));
    })
    .sort((a, b) => a.time - b.time);

const toLyrics = (r: any): Lyrics => ({
  synced: r.syncedLyrics ? parseLrc(r.syncedLyrics) : null,
  plain: r.plainLyrics ?? null,
  instrumental: !!r.instrumental,
});

export async function fetchLyrics(fetcher: Fetcher, track: Track): Promise<Lyrics | null> {
  const headers = { 'Lrclib-Client': 'Sonara (https://github.com/sonara)' };
  const list = candidates(track);
  for (const { artist, title } of list) {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (track.duration) params.set('duration', String(track.duration));
    try {
      const r = await fetcher(`${LRCLIB}/get?${params}`, { headers });
      if (r.ok) return toLyrics(await r.json());
    } catch {
      /* try next candidate */
    }
  }
  for (const { artist, title } of list) {
    const r = await fetcher(`${LRCLIB}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, { headers });
    if (!r.ok) continue;
    const found: any[] = await r.json();
    const best =
      found.find((x) => x.syncedLyrics && (!track.duration || Math.abs(x.duration - track.duration) < 8)) ??
      found.find((x) => x.syncedLyrics) ??
      found[0];
    if (best) return toLyrics(best);
  }
  return null;
}
