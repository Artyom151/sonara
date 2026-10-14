import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { pushNotice, tr } from '../store/islandNotice';
import { collect } from './similar';
import { features, makeCtx, mix, pick, type Profile } from './taste';

/**
 * Automatic continuation: when the last track of a queue starts playing, similar tracks are chosen
 * with the same taste model as the Wave (taste.ts) and appended, so the music goes on without a
 * gap. Related lists of the last few played tracks vote; liked tracks of the same artists pull
 * the pick towards what the listener really loves.
 */
const WAVE_ID = 'wave';
const BATCH = 12;
/** Last-track keys already extended (or being extended): one continuation per track. */
const done = new Set<string>();
let busy: Promise<number> | null = null;

/** Add similar tracks to the end of the queue. Resolves with how many were added. */
export function continueQueue(): Promise<number> {
  if (busy) return busy;
  busy = (async () => {
    const st = usePlayer.getState();
    const lib = useLibrary.getState();
    const cur = st.queue[st.index];
    if (!cur) return 0;
    // Anchors: what just played, newest first, one per artist.
    const played = st.queue.slice(Math.max(0, st.index - 6), st.index + 1).reverse();
    const anchors: Track[] = [];
    const seenArtists = new Set<string>();
    for (const t of played) {
      const a = t.artist.toLowerCase().trim();
      if (seenArtists.has(a)) continue;
      seenArtists.add(a);
      anchors.push(t);
      if (anchors.length >= 4) break;
    }
    const profile: Profile = {};
    played.forEach((t, i) => mix(profile, features(t), 1 / (1 + i * 0.35)));
    // Likes that share an artist with the recent tracks say what the listener wants from them.
    lib.likes.filter((t) => seenArtists.has(t.artist.toLowerCase().trim())).slice(0, 8).forEach((t) => mix(profile, features(t), 0.5));

    const candidates = await collect(anchors, profile);
    const queueKeys = new Set(usePlayer.getState().queue.map((t) => t.key));
    const dislikes = new Set(lib.dislikes);
    const recent = new Set(lib.recent.slice(0, 25).map((t) => t.key));
    const pool = candidates.filter((c) => !queueKeys.has(c.track.key) && !dislikes.has(c.track.key) && !recent.has(c.track.key));
    const ctx = makeCtx(played, profile, played.slice(0, 5).map((t) => t.artist.toLowerCase().trim()));
    const chosen = pick(pool, ctx, BATCH).map((c) => c.track);
    if (chosen.length) {
      usePlayer.getState().addToQueue(chosen);
      pushNotice({ kind: 'queue', text: tr(`${chosen.length} similar tracks added`, `Добавлено похожих: ${chosen.length}`), detail: cur.title });
    }
    return chosen.length;
  })()
    .catch(() => 0)
    .finally(() => (busy = null));
  return busy;
}

const enabled = () => useSettings.getState().autoplay;

/** True when a continuation should happen at the end of this queue. */
export function wantsContinuation() {
  const st = usePlayer.getState();
  return enabled() && st.queue.length > 0 && st.repeat === 'off' && st.context.id !== WAVE_ID;
}

// Start early: as soon as the last track of the queue is the current one.
usePlayer.subscribe((s) => {
  const cur = s.queue[s.index];
  if (!cur || s.index + 1 < s.queue.length || !s.playing || !wantsContinuation() || done.has(cur.key)) return;
  done.add(cur.key);
  if (done.size > 200) done.clear();
  void continueQueue();
});
