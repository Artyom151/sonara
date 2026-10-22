import { scoreCandidate, type MatchCandidate } from '../core/match';
import type { SearchResult, Source, Track } from '../core/types';

type Search = (query: string, source: Source) => Promise<SearchResult>;

/** Find the same recording on another enabled streaming source. */
export async function findFallbacks(
  track: Track,
  search: Search,
  enabled: { soundcloud: boolean; youtube: boolean },
): Promise<Track[]> {
  const sources: Source[] = [
    ...(enabled.soundcloud && track.source !== 'soundcloud' ? ['soundcloud' as const] : []),
    ...(enabled.youtube && track.source !== 'youtube' ? ['youtube' as const] : []),
  ];
  const query = `${track.artist} ${track.title}`;
  const results = await Promise.all(sources.map((source) => search(query, source).then((r) => r.tracks.slice(0, 12)).catch(() => [] as Track[])));
  const seen = new Set<string>();
  return results.flat().map((candidate) => scoreCandidate(track, candidate))
    .filter((m): m is MatchCandidate => {
      if (!m || m.track.key === track.key || seen.has(m.track.key)) return false;
      seen.add(m.track.key);
      return true;
    })
    .sort((a, b) => b.score - a.score || (a.track.source === 'soundcloud' ? -1 : 1))
    .map((m) => m.track);
}
