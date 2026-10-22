import { useEffect, useState } from 'react';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { collect } from './similar';
import { features, makeCtx, mix, pick, strongTasteMatch, type Profile } from './taste';

/**
 * "Picks for you" from the user's own taste: a style profile built from liked
 * tracks (recent likes weigh more) and recent listening, matched against related
 * tracks of the latest likes and the charts of their dominant genres.
 */
const CACHE_KEY = 'sonara.picks.v2';
const TTL = 6 * 60 * 60 * 1000;

const signature = (likes: Track[]) => likes.slice(0, 12).map((t) => t.key).join('|');

export async function recommendFromLikes(likes: Track[], recent: Track[], dislikes: string[], count = 16): Promise<Track[]> {
  if (!likes.length) return [];
  const profile: Profile = {};
  likes.slice(0, 40).forEach((t, i) => mix(profile, features(t), 1 / (1 + i * 0.08)));
  recent.slice(0, 20).forEach((t) => mix(profile, features(t), 0.35));

  // Anchors: the latest likes, spread over different artists so one favourite does not own the list.
  const anchors: Track[] = [];
  const artists = new Set<string>();
  for (const t of likes) {
    const a = t.artist.toLowerCase().trim();
    if (artists.has(a)) continue;
    artists.add(a);
    anchors.push(t);
    if (anchors.length >= 6) break;
  }
  const candidates = await collect(anchors, profile);

  const exclude = new Set([...likes.map((t) => t.key), ...dislikes, ...recent.slice(0, 30).map((t) => t.key)]);
  const ctx = makeCtx(likes.slice(0, 12), profile);
  const pool = candidates.filter((c) => !exclude.has(c.track.key) && strongTasteMatch(c, ctx));
  return pick(pool, ctx, count).map((c) => c.track);
}

/** Personal picks, cached per like-set for a few hours. */
export function usePersonalPicks() {
  const likes = useLibrary((s) => s.likes);
  const sig = signature(likes);
  const [state, setState] = useState<{ tracks: Track[]; loading: boolean }>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
      if (c && c.sig === sig && Date.now() - c.at < TTL) return { tracks: c.tracks, loading: false };
    } catch {
      /* no cache */
    }
    return { tracks: [], loading: likes.length > 0 };
  });

  useEffect(() => {
    if (!likes.length) return setState({ tracks: [], loading: false });
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
      if (c && c.sig === sig && Date.now() - c.at < TTL) return setState({ tracks: c.tracks, loading: false });
    } catch {
      /* refetch */
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const { recent, dislikes } = useLibrary.getState();
    recommendFromLikes(likes, recent, dislikes).then((tracks) => {
      if (!alive) return;
      setState({ tracks, loading: false });
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ sig, at: Date.now(), tracks: tracks.map((t) => ({ ...t, sc: undefined })) }));
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
    };
  }, [sig]);

  return { ...state, personal: likes.length > 0 };
}
