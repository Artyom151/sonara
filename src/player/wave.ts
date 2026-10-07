import { create } from 'zustand';
import { LruMap } from '../lib/lru';
import { api } from '../core';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { toast } from '../ui/components/Toast';

/* ───────────────────────────── Sonara Wave ─────────────────────────────
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

export type Profile = Record<string, number>;

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

/* ───────── Tokens ───────── */

const STOP = new Set(
  (
    'the a an and or of in on at to for with by from is are be it this that my your our me you we i ' +
    'official video audio lyric lyrics lyrical visualizer visualiser hd hq 4k mv clip full version original ' +
    'feat ft featuring prod produced free download out now new premiere exclusive explicit clean ' +
    'remastered remaster live session track song music records record label topic vevo channel ' +
    'и в на с по для из от к о у за не что это мой моя мне ты мы клип официальный текст песня трек музыка премьера'
  ).split(' '),
);

export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, (m) => ` ${m.slice(1, -1)} `)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

/** Weighted feature vector of a track. Tags/genre dominate; artist identity is a separate token. */
export function features(t: Track): Profile {
  const f: Profile = {};
  const add = (k: string, w: number) => (f[k] = (f[k] ?? 0) + w);
  if (t.genre) for (const w of words(t.genre)) add(`g:${w}`, 3);
  // Uploaders often stuff dozens of SEO tags; the more tags, the less each one counts.
  const tags = (t.tags ?? []).filter((x) => x !== t.genre?.toLowerCase());
  const tagWeight = 2 / Math.sqrt(Math.max(1, tags.length / 4));
  for (const tag of tags.slice(0, 12)) {
    const ws = words(tag);
    if (ws.length) add(`g:${ws.join(' ')}`, tagWeight);
    for (const w of ws) add(`w:${w}`, tagWeight * 0.4);
  }
  for (const w of words(t.title)) add(`w:${w}`, 0.6);
  const artist = t.artist.toLowerCase().trim();
  if (artist) add(`a:${artist}`, 1.6);
  return f;
}

const norm = (v: Profile) => Math.sqrt(Object.values(v).reduce((s, x) => s + x * x, 0)) || 1;

export function cosine(a: Profile, b: Profile) {
  let dot = 0;
  for (const k in b) if (a[k]) dot += a[k] * b[k];
  return dot / (norm(a) * norm(b));
}

export function mix(into: Profile, v: Profile, weight: number) {
  const n = norm(v);
  for (const k in v) into[k] = (into[k] ?? 0) + (v[k] / n) * weight;
}

export const topTokens = (p: Profile, prefix: string, n: number) =>
  Object.entries(p)
    .filter(([k, w]) => k.startsWith(prefix) && w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k.slice(prefix.length));

/* ───────── Candidates ───────── */

interface Candidate {
  track: Track;
  /** 0..1, stronger when it came from a related graph of a positive track. */
  related: number;
  via?: string;
}

export const relatedCache = new LruMap<string, Promise<Track[]>>(60);
const relatedOf = (t: Track) => {
  if (!relatedCache.has(t.key)) relatedCache.set(t.key, api.related(t).catch(() => []));
  return relatedCache.get(t.key)!;
};
export const tagCache = new LruMap<string, Promise<Track[]>>(30);
const byTag = (tag: string) => {
  if (!tagCache.has(tag)) tagCache.set(tag, api.tagTracks(tag).catch(() => []));
  return tagCache.get(tag)!;
};

/** Anchors: the tracks the wave currently "likes" most (seeds, liked, fully played). */
let anchors: Track[] = [];
let seedDuration = 210;

async function gather(): Promise<Candidate[]> {
  const st = useWave.getState();
  const out: Candidate[] = [];
  const recentAnchors = anchors.slice(-4);
  const rel = await Promise.all(recentAnchors.map((a) => relatedOf(a).then((list) => ({ a, list }))));
  for (const { a, list } of rel) list.forEach((track, i) => out.push({ track, related: 1 - i / Math.max(20, list.length), via: a.title }));

  const genres = topTokens(st.profile, 'g:', 3);
  const tagLists = await Promise.all(genres.map((g) => byTag(g)));
  tagLists.forEach((list) => list.forEach((track) => out.push({ track, related: 0 })));

  // A text search over the strongest descriptors also pulls in YouTube.
  const terms = [...topTokens(st.profile, 'a:', 1), ...genres.slice(0, 2)].join(' ').trim();
  if (terms) {
    const r = await api.search(terms, 'all').catch(() => ({ tracks: [] as Track[], playlists: [] }));
    r.tracks.forEach((track) => out.push({ track, related: 0 }));
  }
  return out;
}

function score(c: Candidate, profile: Profile, recentArtists: string[]) {
  const t = c.track;
  const f = features(t);
  let s = cosine(profile, f) * 1.0 + c.related * 0.45;
  const artist = t.artist.toLowerCase().trim();
  const repeats = recentArtists.filter((a) => a === artist).length;
  s -= repeats * 0.35;
  if (t.duration) {
    const ratio = Math.abs(Math.log(t.duration / seedDuration));
    if (ratio > 0.8) s -= (ratio - 0.8) * 0.5;
    if (t.duration < 60) s -= 0.4;
  }
  if (t.plays) s += Math.min(0.08, Math.log10(t.plays + 1) / 80);
  return s;
}

/** Explain the pick with the strongest shared descriptor. */
function reasonFor(c: Candidate, profile: Profile, ru: boolean) {
  const f = features(c.track);
  let best = '';
  let bestW = 0;
  for (const k in f) {
    if (k.startsWith('w:')) continue;
    const w = (profile[k] ?? 0) * f[k];
    if (w > bestW) (bestW = w), (best = k);
  }
  if (c.related > 0.5 && c.via) return ru ? `Похож на «${c.via}»` : `Like “${c.via}”`;
  if (best.startsWith('g:')) return `#${best.slice(2)}`;
  if (best.startsWith('a:')) return ru ? `Артист в вашей волне` : 'Artist in your wave';
  return c.via ? (ru ? `Похож на «${c.via}»` : `Like “${c.via}”`) : ru ? 'В вашем стиле' : 'In your style';
}

let refilling: Promise<void> | null = null;

/** Append the best-matching fresh tracks to the queue. */
async function refill(count = 12) {
  if (refilling) return refilling;
  refilling = (async () => {
    const ru = navigator.language.toLowerCase().startsWith('ru');
    const candidates = await gather();
    const st = useWave.getState();
    if (!st.active) return;
    const seen = new Set(st.seen);
    const dislikes = new Set(useLibrary.getState().dislikes);
    const pool = new Map<string, Candidate>();
    for (const c of candidates) {
      const k = c.track.key;
      if (seen.has(k) || dislikes.has(k)) continue;
      const prev = pool.get(k);
      if (!prev || c.related > prev.related) pool.set(k, prev ? { ...c, related: Math.min(1, c.related + prev.related * 0.5) } : c);
    }
    const queue = usePlayer.getState().queue;
    const recentArtists = queue.slice(-6).map((t) => t.artist.toLowerCase().trim());
    const picked: Track[] = [];
    const reasons: Record<string, string> = {};
    const items = [...pool.values()];
    while (picked.length < count && items.length) {
      let bi = 0;
      let bs = -Infinity;
      for (let i = 0; i < items.length; i++) {
        const s = score(items[i], st.profile, recentArtists);
        if (s > bs) (bs = s), (bi = i);
      }
      const [c] = items.splice(bi, 1);
      picked.push(c.track);
      reasons[c.track.key] = reasonFor(c, st.profile, ru);
      recentArtists.push(c.track.artist.toLowerCase().trim());
    }
    if (!picked.length) return;
    useWave.setState((s) => ({ seen: [...s.seen, ...picked.map((t) => t.key)], reasons: { ...s.reasons, ...reasons } }));
    if (isWaveContext()) usePlayer.getState().addToQueue(picked);
    else return picked;
  })()
    .then(() => undefined)
    .finally(() => (refilling = null));
  return refilling;
}

function setProfile(profile: Profile) {
  useWave.setState({ profile, topTags: topTokens(profile, 'g:', 6) });
}

/* ───────── Public API ───────── */

export async function startWave(seed?: WaveSeed, label?: string) {
  const ru = navigator.language.toLowerCase().startsWith('ru');
  useSettings.getState().set({ autoplay: true });
  const cur = usePlayer.getState().current();
  const s: WaveSeed | undefined = seed ?? (cur ? { kind: 'track', track: cur } : undefined);
  useWave.setState({ active: true, status: 'loading', seen: [], reasons: {}, label: label ?? 'Wave', seedArt: [] });

  try {
    let seeds: Track[] = [];
    const profile: Profile = {};
    let title = label ?? (ru ? 'Волна' : 'Wave');

    if (!s) {
      const home = await api.home();
      seeds = (home.picks.length ? home.picks : home.youtube).slice(0, 6);
    } else if (s.kind === 'query') {
      const q = s.query.trim();
      title = q;
      const [found, tagged] = await Promise.all([
        api.search(q, 'all').catch(() => ({ tracks: [] as Track[], playlists: [] })),
        api.tagTracks(q.toLowerCase()).catch(() => [] as Track[]),
      ]);
      // Seeds: best text matches first, then the tag chart (moods / genres like "phonk", "lofi").
      seeds = [...found.tracks.slice(0, 5), ...tagged.slice(0, 5)];
      for (const w of words(q)) {
        profile[`g:${w}`] = (profile[`g:${w}`] ?? 0) + 2.5;
        profile[`w:${w}`] = (profile[`w:${w}`] ?? 0) + 1;
      }
      if (words(q).length > 1) profile[`g:${words(q).join(' ')}`] = 2.5;
    } else if (s.kind === 'genre') {
      title = s.title;
      seeds = ((await api.genre(s.urn)).tracks ?? []).slice(0, 10);
      for (const w of words(s.title)) profile[`g:${w}`] = 3;
    } else if (s.kind === 'track') {
      title = s.track.title;
      seeds = [s.track];
    } else {
      title = s.title;
      seeds = s.tracks.slice(0, 10);
    }

    if (!seeds.length) throw new Error('empty');
    for (const t of seeds) mix(profile, features(t), 1);
    anchors = seeds.slice(0, 4);
    const durations = seeds.map((t) => t.duration).filter(Boolean).sort((a, b) => a - b);
    seedDuration = durations[Math.floor(durations.length / 2)] || 210;
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

/* ───────── Live behaviour ───────── */

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
