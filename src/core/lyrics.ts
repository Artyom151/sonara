import type { Fetcher, LyricLine, Lyrics, Track } from './types';

/**
 * Lyrics are fetched at runtime, no keys needed:
 *  1. LRCLIB (https://lrclib.net), an open lyrics database;
 *  2. BetterLyrics (https://better-lyrics.boidu.dev), synced lyrics as TTML — good coverage for
 *     YouTube / Deezer tracks that LRCLIB misses.
 */
const LRCLIB = 'https://lrclib.net/api';
const BETTER_LYRICS = 'https://lyrics-api.boidu.dev/getLyrics';

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

/** "1:02.5", "00:01:02.500", "62.5s" or "62.5" → seconds. */
const ttmlTime = (v: string) => {
  const parts = v.replace(/s$/, '').split(':').map(Number);
  return parts.reduce((acc, x) => acc * 60 + x, 0);
};
const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** TTML <p begin=…> lines (word-timed spans are joined back into one line). */
export function parseTtml(ttml: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const m of ttml.matchAll(/<p\b[^>]*\bbegin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    // Background vocals (ttm:role="x-bg") stay out of the main line.
    const body = m[2].replace(/<span[^>]*ttm:role="x-bg"[^>]*>[\s\S]*?<\/span>\s*<\/span>|<span[^>]*ttm:role="x-bg"[^>]*>[\s\S]*?<\/span>/g, '');
    const text = decode(body.replace(/<\/span>\s*<span/g, '</span> <span').replace(/<\/span><span/g, '</span><span'));
    if (text) lines.push({ time: ttmlTime(m[1]), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function betterLyrics(fetcher: Fetcher, track: Track): Promise<Lyrics | null> {
  for (const { artist, title } of candidates(track).slice(0, 2)) {
    const params = new URLSearchParams({ s: title, a: artist });
    if (track.duration) params.set('d', String(Math.round(track.duration)));
    try {
      const r = await fetcher(`${BETTER_LYRICS}?${params}`);
      if (!r.ok) continue;
      const j = await r.json();
      const synced = j?.ttml ? parseTtml(String(j.ttml)) : [];
      if (synced.length > 2) return { synced, plain: synced.map((l) => l.text).join('\n') };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

export async function fetchLyrics(fetcher: Fetcher, track: Track): Promise<Lyrics | null> {
  const lrc = await fetchLrclib(fetcher, track).catch(() => null);
  // Prefer synced lyrics: LRCLIB first, BetterLyrics when LRCLIB has none (or only plain text).
  if (lrc?.synced?.length || lrc?.instrumental) return lrc;
  return (await betterLyrics(fetcher, track)) ?? lrc;
}

async function fetchLrclib(fetcher: Fetcher, track: Track): Promise<Lyrics | null> {
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
