import type { SoundCloud } from './soundcloud';
import type { Track } from './types';
import type { YouTube } from './youtube';

/**
 * Finds a full, playable recording of a catalogue track (Deezer) on YouTube or
 * SoundCloud. A candidate is accepted only when title, artist and duration agree: playing a wrong
 * song is worse than none (a 1:58 track once got a 5:50 video because YouTube had no copy).
 */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(official|video|audio|lyrics?|visualizer|music|hd|hq|mv|clip|клип)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const VARIANT = /\b(live|cover|karaoke|instrumental|8d|slowed|sped up|speed up|nightcore|reverb|remix|mashup)\b/;

export interface MatchCandidate {
  track: Track;
  score: number;
  why: string;
}

/** Score of one candidate, or null when it is not the same recording. Exported for tests. */
export function scoreCandidate(want: Track, c: Track): MatchCandidate | null {
  const title = norm(want.title);
  const artists = norm(want.artist).split(' ').filter((w) => w.length > 1);
  const hay = norm(`${c.title} ${c.artist}`);
  if (!title || !hay.includes(title)) return null;
  // Every word of the artist name must appear (channel name or title).
  const artistHits = artists.filter((w) => hay.includes(w)).length;
  if (artists.length && artistHits < Math.ceil(artists.length * 0.6)) return null;
  // Same recording ⇒ nearly the same length.
  let dd = 0;
  if (want.duration && c.duration) {
    dd = Math.abs(c.duration - want.duration);
    if (dd > Math.max(8, want.duration * 0.08)) return null;
  }
  // Checked on the raw text: the markers usually sit in brackets, which norm() removes.
  if (VARIANT.test(`${c.title} ${c.artist}`.toLowerCase()) && !VARIANT.test(want.title.toLowerCase())) return null;
  const exactTitle = norm(c.title) === title || norm(c.title).endsWith(title);
  const score = 10 - dd / 2 + (exactTitle ? 2 : 0) + (artistHits === artists.length ? 1 : 0);
  return { track: c, score, why: `Δ${dd}s title${exactTitle ? '=' : '⊂'} artist ${artistHits}/${artists.length}` };
}

export class RecordingMatcher {
  private cache = new Map<string, Track[]>();
  /** Last decision per track key, for debugging (window/console). */
  readonly log = new Map<string, { picked?: string; candidates: string[] }>();

  constructor(
    private yt: YouTube,
    private sc: SoundCloud,
  ) {}

  /** The best YouTube or SoundCloud copy of the same recording, or null if none is close enough. */
  async find(t: Track): Promise<Track | null> {
    return (await this.candidates(t))[0] ?? null;
  }

  /** Every acceptable copy, best first. */
  async candidates(t: Track): Promise<Track[]> {
    if (this.cache.has(t.key)) return this.cache.get(t.key)!;
    const q = `${t.artist} ${t.title}`;
    const settle = (p: Promise<Track[]>) => p.catch(() => [] as Track[]);
    const [yt, sc] = await Promise.all([settle(this.yt.search(q)), settle(this.sc.search(q))]);
    const all = [...yt.slice(0, 12), ...sc.slice(0, 12)];
    const scored = all.map((c) => scoreCandidate(t, c)).filter((x): x is MatchCandidate => !!x);
    // Same score: SoundCloud first (it streams without the YouTube token dance).
    scored.sort((a, b) => b.score - a.score || (a.track.source === 'soundcloud' ? -1 : 1));
    const best = scored[0]?.track ?? null;
    this.log.set(t.key, {
      picked: best ? `${best.source}:${best.id} ${best.duration}s ${best.artist} - ${best.title}` : undefined,
      candidates: all.map((c) => `${c.source} ${c.duration}s ${c.artist} - ${c.title}${scored.find((s) => s.track === c) ? ` ✓ ${scored.find((s) => s.track === c)!.why}` : ''}`),
    });
    console.info(`[match] ${t.artist} - ${t.title} (${t.duration}s) →`, best ? `${best.source} ${best.duration}s ${best.artist} - ${best.title}` : 'no match');
    const list = scored.map((s) => s.track);
    this.cache.set(t.key, list);
    return list;
  }

  /** A copy turned out unplayable (blocked, protected): try the next one from now on. */
  drop(t: Track, copy: Track) {
    this.cache.set(t.key, (this.cache.get(t.key) ?? []).filter((c) => c.key !== copy.key));
  }
}
