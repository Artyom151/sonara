import { api } from '../core';
import type { Track } from '../core/types';
import { LruMap } from '../lib/lru';
import { mergeCandidates, topTokens, type Candidate, type Profile } from './taste';

/** Related lists and genre charts, cached: the same anchor is asked again and again while a wave plays. */
export const relatedCache = new LruMap<string, Promise<Track[]>>(60);
export const relatedOf = (t: Track) => {
  if (!relatedCache.has(t.key)) relatedCache.set(t.key, api.related(t).catch(() => []));
  return relatedCache.get(t.key)!;
};
export const tagCache = new LruMap<string, Promise<Track[]>>(30);
export const byTag = (tag: string) => {
  if (!tagCache.has(tag)) tagCache.set(tag, api.tagTracks(tag).catch(() => []));
  return tagCache.get(tag)!;
};

/**
 * Candidates for a set of anchors (tracks the listener likes right now):
 *  - the related list of every anchor (their agreement is counted as votes);
 *  - the chart of the strongest genres of the profile and one text search (kept to fill the pool;
 *    taste.ts only lets them through when they share a genre, tag or artist).
 */
export async function collect(anchors: Track[], profile: Profile, opts: { charts?: boolean; search?: boolean } = {}): Promise<Candidate[]> {
  const lists: Candidate[][] = [];
  const rel = await Promise.all(anchors.map((a) => relatedOf(a).then((list) => ({ a, list }))));
  for (const { a, list } of rel) {
    lists.push(
      list.map((track, i) => ({
        track,
        related: 1 - i / Math.max(20, list.length),
        votes: 1,
        via: [a.title],
      })),
    );
  }
  if (opts.charts !== false) {
    const genres = topTokens(profile, 'g:', 3);
    const tagLists = await Promise.all(genres.map((g) => byTag(g)));
    for (const list of tagLists) lists.push(list.map((track) => ({ track, related: 0, votes: 0, via: [] })));
    if (opts.search !== false) {
      // A text search over the strongest descriptors also pulls in YouTube.
      const terms = [...topTokens(profile, 'a:', 1), ...genres.slice(0, 2)].join(' ').trim();
      if (terms) {
        const r = await api.search(terms, 'all').catch(() => ({ tracks: [] as Track[], playlists: [] }));
        lists.push(r.tracks.map((track) => ({ track, related: 0, votes: 0, via: [] })));
      }
    }
  }
  return mergeCandidates(lists);
}
