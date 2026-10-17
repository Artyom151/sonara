import type { Track } from '../core/types';
import type { Candidate } from './taste';

/**
 * The wave's knobs, as pure functions: mood sliders (0..1, 0.5 = neutral), discovery (only artists
 * the listener has not heard) and blocks ("Why this?": a genre or an artist never again).
 */
export interface Mood {
  familiar: number;
  energy: number;
  popular: number;
}

export interface Blocked {
  genres: string[];
  artists: string[];
}

const CALM = /chill|acoustic|lo-?fi|ambient|sleep|piano|relax|slow|mellow|calm/;
const ENERGETIC = /energetic|dance|edm|party|hardstyle|rock|metal|techno|workout|hype|punk|drum|trap/;

/** -1 calm … +1 energetic, from the genre and tags. */
export function energyOf(t: Track): number {
  const text = [t.genre, ...(t.tags ?? [])].filter(Boolean).join(' | ').toLowerCase();
  if (ENERGETIC.test(text)) return 1;
  if (CALM.test(text)) return -1;
  return 0;
}

const artistKey = (a: string) => a.toLowerCase().trim();

/** Does this track carry a blocked artist or a blocked genre word? */
export function isBlocked(t: Track, b: Blocked): boolean {
  if (b.artists.includes(artistKey(t.artist))) return true;
  if (!b.genres.length) return false;
  const text = [t.genre, ...(t.tags ?? [])].filter(Boolean).join(' | ').toLowerCase();
  return b.genres.some((g) => text.includes(g.toLowerCase()));
}

/** Score adjustment for the sliders: known artists up when "familiar" is high, calm up when "calm", etc. */
export function moodBias(mood: Mood, known: Set<string>): (c: Candidate) => number {
  return (c) => {
    const isKnown = known.has(artistKey(c.track.artist)) ? 1 : -1;
    const familiar = isKnown * (mood.familiar - 0.5) * 0.4;
    const energy = energyOf(c.track) * (mood.energy - 0.5) * 0.5;
    const plays = c.track.plays ?? 0;
    const popularity = plays > 0 ? Math.min(1, Math.log10(plays + 1) / 6) - 0.5 : 0;
    const popular = popularity * (mood.popular - 0.5) * 0.8;
    return familiar + energy + popular;
  };
}

/** Artists heard in the statistics (at least one second of listening). */
export function knownArtists(stats: Record<string, { seconds: number }>): Set<string> {
  return new Set(Object.entries(stats).filter(([, a]) => a.seconds > 0).map(([k]) => k));
}
