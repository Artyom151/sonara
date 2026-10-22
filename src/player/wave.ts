import { create } from 'zustand';
import { api } from '../core';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { toast } from '../ui/components/Toast';
import { collect } from './similar';
import { useStats } from '../store/stats';
import { isBlocked, knownArtists, moodBias } from './waveMood';
import { features, makeCtx, mix, pick, topTokens, words, type Candidate, type Profile } from './taste';

/* Sonara Wave
   A live, endless playlist. A style profile (weighted tokens: genres, tags,
   artists, title words) is built from the seed — a search query, a track, a
   set of tracks or a genre. Candidates are gathered from "related" graphs,
   tag/genre charts and searches, scored against the profile and picked with a
   diversity rule. While it plays, listening behaviour reshapes the profile:
   full listens and likes pull it closer, quick skips and dislikes push away. */

export type WaveSeed =
  | { kind: 'query'; query: string }
  | { kind: 'genre'; urn: string; title: string }
  | { kind: 'track'; track: Track }
  | { kind: 'tracks'; tracks: Track[]; title: string };

interface WaveState {
  active: boolean;
  status: 'idle' | 'loading' | 'live';
  label: string;
  seedArt: string[];
  profile: Profile;
  /** Tracks played / queued in this wave (never repeat). */
  seen: string[];
  /** Why a track was picked, keyed by track key. */
  reasons: Record<string, string>;
  /** Strongest profile tokens, for display. */
  topTags: string[];
}

export const useWave = create<WaveState>(() => ({
  active: false,
  status: 'idle',
  label: '',
  seedArt: [],
  profile: {},
  seen: [],
  reasons: {},
  topTags: [],
}));

const WAVE_ID = 'wave';
const isWaveContext = () => usePlayer.getState().context.id === WAVE_ID;

/* Taste model (taste.ts) */

export { cosine, features, mix, topTokens, words, type Profile } from './taste';
export { relatedCache, tagCache } from './similar';

/* Candidates */

/** Anchors: the tracks the wave currently "likes" most (seeds, liked, fully played). */
let anchors: Track[] = [];
let waveSeeds: Track[] = [];

/** Explain the pick: the anchor that listed it, else the strongest shared descriptor. */
function reasonFor(c: Candidate, profile: Profile, ru: boolean) {
  if (c.related > 0.5 && c.via[0]) return ru ? `Похож на «${c.via[0]}»` : `Like “${c.via[0]}”`;
  const f = features(c.track);
  let best = '';
  let bestW = 0;
  for (const k in f) {
    if (k.startsWith('w:')) continue;
    const w = (profile[k] ?? 0) * f[k];
    if (w > bestW) (bestW = w), (best = k);
  }
  if (best.startsWith('g:')) return `#${best.slice(2)}`;
  if (best.startsWith('a:')) return ru ? `Артист в вашей волне` : 'Artist in your wave';
  return c.via[0] ? (ru ? `Похож на «${c.via[0]}»` : `Like “${c.via[0]}”`) : ru ? 'В вашем стиле' : 'In your style';
}

let refilling: Promise<void> | null = null;

/** Append the best-matching fresh tracks to the queue. */
async function refill(count = 12) {
  if (refilling) return refilling;
  refilling = (async () => {
    const ru = navigator.language.toLowerCase().startsWith('ru');
    const st = useWave.getState();
    const candidates = await collect(anchors.slice(-4), st.profile);
    if (!useWave.getState().active) return;
    const seen = new Set(useWave.getState().seen);
    const dislikes = new Set(useLibrary.getState().dislikes);
    const settings = useSettings.getState();
    const known = knownArtists(useStats.getState().artists);
    // Discovery: only artists not heard yet. Blocks: "Why this?" corrections, never again.
    const pool = candidates.filter(
      (c) =>
        !seen.has(c.track.key) &&
        !dislikes.has(c.track.key) &&
        !isBlocked(c.track, settings.waveBlocked) &&
        !(settings.waveDiscovery && known.has(c.track.artist.toLowerCase().trim())),
    );
    const queue = usePlayer.getState().queue;
    const ctx = {
      ...makeCtx([...waveSeeds, ...anchors], useWave.getState().profile, queue.slice(-6).map((t) => t.artist.toLowerCase().trim())),
      bias: moodBias(settings.waveMood, known),
    };
    const chosen = pick(pool, ctx, count);
    if (!chosen.length) return;
    const picked = chosen.map((c) => c.track);
    const reasons: Record<string, string> = {};
    for (const c of chosen) reasons[c.track.key] = reasonFor(c.cand, useWave.getState().profile, ru);
    useWave.setState((s) => ({ seen: [...s.seen, ...picked.map((t) => t.key)], reasons: { ...s.reasons, ...reasons } }));
    if (isWaveContext()) usePlayer.getState().addToQueue(picked);
  })()
    .then(() => undefined)
    .finally(() => (refilling = null));
  return refilling;
}

function setProfile(profile: Profile) {
  useWave.setState({ profile, topTags: topTokens(profile, 'g:', 6) });
}

/* Public API */

interface Seeds {
  seeds: Track[];
  profile: Profile;
  title?: string;
}

/** The tracks a wave grows from, and the taste words the seed adds. */
async function seedsFor(s: WaveSeed | undefined): Promise<Seeds> {
  const profile: Profile = {};
  if (!s) {
    const home = await api.home();
    return { seeds: (home.picks.length ? home.picks : home.youtube).slice(0, 6), profile };
  }
  switch (s.kind) {
    case 'query': {
      const q = s.query.trim();
      const [found, tagged] = await Promise.all([
        api.search(q, 'all').catch(() => ({ tracks: [] as Track[], playlists: [] })),
        api.tagTracks(q.toLowerCase()).catch(() => [] as Track[]),
      ]);
      for (const w of words(q)) {
        profile[`g:${w}`] = (profile[`g:${w}`] ?? 0) + 2.5;
        profile[`w:${w}`] = (profile[`w:${w}`] ?? 0) + 1;
      }
      if (words(q).length > 1) profile[`g:${words(q).join(' ')}`] = 2.5;
      // Best text matches first, then the tag chart (moods and genres like "phonk", "lofi").
      return { seeds: [...found.tracks.slice(0, 5), ...tagged.slice(0, 5)], profile, title: q };
    }
    case 'genre': {
      for (const w of words(s.title)) profile[`g:${w}`] = 3;
      return { seeds: ((await api.genre(s.urn)).tracks ?? []).slice(0, 10), profile, title: s.title };
    }
    case 'track':
      return { seeds: [s.track], profile, title: s.track.title };
    case 'tracks':
      return { seeds: s.tracks.slice(0, 10), profile, title: s.title };
  }
}

export async function startWave(seed?: WaveSeed, label?: string) {
  const ru = navigator.language.toLowerCase().startsWith('ru');
  useSettings.getState().set({ autoplay: true });
  const cur = usePlayer.getState().current();
  const s: WaveSeed | undefined = seed ?? (cur ? { kind: 'track', track: cur } : undefined);
  useWave.setState({ active: true, status: 'loading', seen: [], reasons: {}, label: label ?? 'Wave', seedArt: [] });

  try {
    const found = await seedsFor(s);
    const { seeds, profile } = found;
    const title = found.title ?? label ?? (ru ? 'Волна' : 'Wave');

    if (!seeds.length) throw new Error('empty');
    for (const t of seeds) mix(profile, features(t), 1);
    anchors = seeds.slice(0, 4);
    waveSeeds = seeds;
    setProfile(profile);
    useWave.setState({ label: title, seedArt: seeds.slice(0, 3).map((t) => t.artwork ?? '').filter(Boolean) });

    // Start immediately with the strongest seed, then build the stream around it.
    const first = s?.kind === 'track' ? s.track : seeds[0];
    useWave.setState({ seen: [first.key], reasons: { [first.key]: ru ? 'Начало волны' : 'Wave start' } });
    usePlayer.getState().playQueue([first], 0, { title: `${ru ? 'Волна' : 'Wave'} · ${title}`, id: WAVE_ID });
    await refill(14);
    useWave.setState({ status: 'live' });
  } catch {
    useWave.setState({ active: false, status: 'idle' });
    toast(ru ? 'Не удалось собрать волну' : 'Could not build the wave');
  }
}

export function stopWave() {
  useWave.setState({ active: false, status: 'idle' });
}

/** Re-rank: drop the upcoming part of the queue and pick again with the current profile. */
export async function rerollWave() {
  if (!useWave.getState().active) return;
  const p = usePlayer.getState();
  const kept = p.queue.slice(0, p.index + 1);
  const keptKeys = new Set(kept.map((t) => t.key));
  useWave.setState((s) => ({ seen: s.seen.filter((k) => keptKeys.has(k)) }));
  usePlayer.setState({ queue: kept, baseQueue: kept });
  await refill(14);
}

/** Feedback moves the profile towards (+) or away from (−) a track. */
export function waveFeedback(track: Track, kind: 'like' | 'complete' | 'skip' | 'dislike') {
  const st = useWave.getState();
  if (!st.active) return;
  const weight = { like: 0.9, complete: 0.35, skip: -0.3, dislike: -1 }[kind];
  const profile = { ...st.profile };
  mix(profile, features(track), weight);
  setProfile(profile);
  if (weight > 0) anchors = [...anchors.filter((a) => a.key !== track.key), track].slice(-6);
  if (kind === 'dislike') {
    // Remove the disliked artist's upcoming tracks right away.
    const artist = track.artist.toLowerCase().trim();
    const p = usePlayer.getState();
    const queue = p.queue.filter((t, i) => i <= p.index || t.artist.toLowerCase().trim() !== artist);
    if (queue.length !== p.queue.length) usePlayer.setState({ queue, baseQueue: queue });
  }
}

/* Live behaviour */

let lastKey: string | undefined;
let lastPos = 0;
let lastDur = 0;

usePlayer.subscribe((s, prev) => {
  if (s.context.id !== WAVE_ID) {
    if (useWave.getState().active && prev.context.id === WAVE_ID) stopWave();
    return;
  }
  const cur = s.queue[s.index];
  if (cur?.key !== lastKey) {
    // Judge the track we just left.
    const left = prev.queue.find((t) => t.key === lastKey);
    if (left && lastDur > 0) {
      const ratio = lastPos / lastDur;
      if (ratio > 0.85) waveFeedback(left, 'complete');
      else if (lastPos < 40 && ratio < 0.35) waveFeedback(left, 'skip');
    }
    lastKey = cur?.key;
    lastPos = 0;
  }
  lastPos = s.position;
  lastDur = s.duration;
  // Keep at least a few tracks ahead.
  if (useWave.getState().active && s.queue.length - s.index <= 4) refill(10);
});

let prevLikes = new Set(useLibrary.getState().likes.map((t) => t.key));
let prevDislikes = new Set(useLibrary.getState().dislikes);
useLibrary.subscribe((s) => {
  if (!useWave.getState().active) {
    prevLikes = new Set(s.likes.map((t) => t.key));
    prevDislikes = new Set(s.dislikes);
    return;
  }
  for (const t of s.likes) if (!prevLikes.has(t.key)) waveFeedback(t, 'like');
  const queue = usePlayer.getState().queue;
  for (const k of s.dislikes) {
    if (prevDislikes.has(k)) continue;
    const t = queue.find((x) => x.key === k);
    if (t) waveFeedback(t, 'dislike');
  }
  prevLikes = new Set(s.likes.map((t) => t.key));
  prevDislikes = new Set(s.dislikes);
});
