import { useEffect, useState } from 'react';
import { api } from '../core';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { cosine, features, mix, topTokens, type Profile } from './wave';

/**
 * "Picks for you" from the user's own taste: a style profile built from liked
 * tracks (recent likes weigh more) and recent listening, matched against related
 * tracks of the latest likes and the charts of their dominant genres.
 */
const CACHE_KEY = 'sonara.picks';
const TTL = 6 * 60 * 60 * 1000;

const signature = (likes: Track[]) => likes.slice(0, 12).map((t) => t.key).join('|');

export async function recommendFromLikes(likes: Track[], recent: Track[], dislikes: string[], count = 16): Promise<Track[]> {
  if (!likes.length) return [];
  const profile: Profile = {};
  likes.slice(0, 40).forEach((t, i) => mix(profile, features(t), 1 / (1 + i * 0.08)));
  recent.slice(0, 20).forEach((t) => mix(profile, features(t), 0.35));

  const anchors = likes.slice(0, 5);
  const genres = topTokens(profile, 'g:', 3);
  const [related, charts] = await Promise.all([
    Promise.all(anchors.map((a) => api.related(a).catch(() => [] as Track[]))),
    Promise.all(genres.map((g) => api.tagTracks(g).catch(() => [] as Track[]))),
  ]);

  const exclude = new Set([...likes.map((t) => t.key), ...dislikes, ...recent.slice(0, 30).map((t) => t.key)]);
  const pool = new Map<string, { track: Track; rel: number }>();
  related.forEach((list) =>
    list.forEach((track, i) => {
      if (exclude.has(track.key)) return;
      const rel = 1 - i / Math.max(20, list.length);
      const prev = pool.get(track.key);
      pool.set(track.key, { track, rel: Math.min(1, (prev?.rel ?? 0) * 0.6 + rel) });
    }),
  );
  charts.flat().forEach((track) => {
    if (!exclude.has(track.key) && !pool.has(track.key)) pool.set(track.key, { track, rel: 0 });
  });

  const scored = [...pool.values()].map((c) => ({
    track: c.track,
    s: cosine(profile, features(c.track)) + c.rel * 0.5 + (c.track.duration > 60 && c.track.duration < 600 ? 0 : -0.4),
  }));
  scored.sort((a, b) => b.s - a.s);

  // Diversity: at most two tracks per artist.
  const perArtist = new Map<string, number>();
  const out: Track[] = [];
  for (const { track } of scored) {
    const a = track.artist.toLowerCase();
    if ((perArtist.get(a) ?? 0) >= 2) continue;
    perArtist.set(a, (perArtist.get(a) ?? 0) + 1);
    out.push(track);
    if (out.length >= count) break;
  }
  return out;
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
