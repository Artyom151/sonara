import type { Track } from '../core/types';

/**
 * The taste model behind Wave, "Picks for you" and the automatic continuation of a queue.
 * Pure (no stores, no network), so it can be tested with synthetic tracks.
 *
 * What makes a recommendation "on topic" here:
 *  - consensus: a track that the related lists of several anchors agree on beats one that a single
 *    list mentions, and both beat a genre chart entry that merely shares a tag;
 *  - hard filters: sped-up / slowed / nightcore / 8D versions, karaoke, covers, tutorials and
 *    hour-long loops are dropped unless the seed itself is that kind of track;
 *  - script: a Cyrillic seed does not drift into Latin-only or CJK releases (unless the artist matches);
 *  - a floor for candidates that only share a chart, so noise cannot fill a queue.
 */

export type Profile = Record<string, number>;

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

/* ───────── Kinds of release ───────── */

export interface Flags {
  sped: boolean; // sped up / nightcore / slowed / reverb / 8D / bass boosted
  cover: boolean;
  karaoke: boolean;
  junk: boolean; // tutorial, reaction, hour-long loop, compilation
  live: boolean;
}

const SPED = /\b(sped\s*up|speed\s*up|nightcore|slowed|reverb|8d|16d|bass\s*boost(ed)?|daycore|ускорен\w*|замедлен\w*|слоу\w*|найткор)\b/i;
const COVER = /\b(cover|кавер|tribute|acoustic\s+version|instrumental\s+cover)\b/i;
const KARAOKE = /\b(karaoke|караоке|backing\s*track|minus|минус(овка)?)\b/i;
const JUNK = /\b(tutorial|how\s+to|reaction|react|review|unboxing|podcast|interview|trailer|asmr|1\s*hour|10\s*hours?|loop|compilation|full\s+album|mix\s*20\d\d|top\s*\d+|best\s+of|playlist|подборка|сборник|нарезка|час\s+музыки)\b/i;
const LIVE = /\b(live|концерт|выступление|на\s+концерте)\b/i;

export function flagsOf(t: Track): Flags {
  const s = `${t.title} ${(t.tags ?? []).join(' ')}`;
  return {
    sped: SPED.test(s),
    cover: COVER.test(t.title),
    karaoke: KARAOKE.test(s),
    junk: JUNK.test(t.title) || t.duration > 15 * 60,
    live: LIVE.test(t.title),
  };
}

/* ───────── Script ───────── */

export type Script = 'cyr' | 'lat' | 'cjk' | 'ar' | 'other';

/** Dominant script of a text by letter count (digits and punctuation do not count). */
export function scriptOf(s: string): Script | null {
  let cyr = 0, lat = 0, cjk = 0, ar = 0, other = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x400 && c <= 0x52f) || (c >= 0x1c80 && c <= 0x1c8f)) cyr++;
    else if ((c >= 0x41 && c <= 0x24f) || (c >= 0x1e00 && c <= 0x1eff)) lat++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af)) cjk++;
    else if (c >= 0x600 && c <= 0x6ff) ar++;
    else if (/\p{L}/u.test(ch)) other++;
  }
  const total = cyr + lat + cjk + ar + other;
  if (!total) return null;
  const best = Math.max(cyr, lat, cjk, ar, other);
  if (best / total < 0.6) return null;
  return best === cyr ? 'cyr' : best === lat ? 'lat' : best === cjk ? 'cjk' : best === ar ? 'ar' : 'other';
}

/** What the listener's seeds are written in: the script most of them share, or null when mixed. */
export function seedScript(seeds: Track[]): Script | null {
  const count: Partial<Record<Script, number>> = {};
  let n = 0;
  for (const t of seeds) {
    const sc = scriptOf(`${t.title} ${t.artist}`);
    if (sc) (count[sc] = (count[sc] ?? 0) + 1), n++;
  }
  for (const [sc, c] of Object.entries(count)) if (c! / n >= 0.7) return sc as Script;
  return null;
}

/* ───────── Candidates ───────── */

export interface Candidate {
  track: Track;
  /** Best rank in a related list, 0..1 (1 = first). 0 for chart / search entries. */
  related: number;
  /** How many different anchors' related lists contained it. */
  votes: number;
  /** Anchor titles that listed it, for the explanation. */
  via: string[];
}

export interface RankCtx {
  profile: Profile;
  seeds: Track[];
  seedDuration: number;
  recentArtists: string[];
  /** Flags of the seeds: a slowed seed allows slowed candidates. */
  seedFlags: Flags;
  script: Script | null;
  /** Artists of the seeds (lower case): same-artist tracks are never "off topic". */
  seedArtists: Set<string>;
}

export function makeCtx(seeds: Track[], profile: Profile, recentArtists: string[] = []): RankCtx {
  const flags: Flags = { sped: false, cover: false, karaoke: false, junk: false, live: false };
  for (const t of seeds) {
    const f = flagsOf(t);
    (Object.keys(flags) as (keyof Flags)[]).forEach((k) => (flags[k] = flags[k] || f[k]));
  }
  const durations = seeds.map((t) => t.duration).filter(Boolean).sort((a, b) => a - b);
  return {
    profile,
    seeds,
    seedDuration: durations[Math.floor(durations.length / 2)] || 210,
    recentArtists,
    seedFlags: flags,
    script: seedScript(seeds),
    seedArtists: new Set(seeds.map((t) => t.artist.toLowerCase().trim())),
  };
}

/** False for candidates that must never be suggested for this context. */
export function usable(c: Candidate, ctx: RankCtx): boolean {
  const f = flagsOf(c.track);
  if (f.karaoke || f.junk) return false;
  if (f.sped && !ctx.seedFlags.sped) return false;
  if (f.cover && !ctx.seedFlags.cover && !ctx.seedArtists.has(c.track.artist.toLowerCase().trim())) return false;
  if (c.track.duration && c.track.duration < 45) return false;
  return true;
}

/**
 * Higher is better; `null` means "not close enough to be suggested at all".
 * Related-list entries are always eligible (the graph already says they are alike); chart and
 * search entries must also share a genre, tag or artist with the profile.
 */
export function scoreCandidate(c: Candidate, ctx: RankCtx): number | null {
  const t = c.track;
  const cos = cosine(ctx.profile, features(t));
  const artist = t.artist.toLowerCase().trim();
  const sameArtist = ctx.seedArtists.has(artist);
  if (c.votes === 0 && !sameArtist && cos < 0.16) return null;

  let s = cos;
  s += c.related * 0.45;
  s += Math.min(3, c.votes) * 0.18; // consensus of several anchors is the strongest signal
  if (sameArtist) s += 0.12;

  const repeats = ctx.recentArtists.filter((a) => a === artist).length;
  s -= repeats * 0.35;

  if (t.duration) {
    const ratio = Math.abs(Math.log(t.duration / ctx.seedDuration));
    if (ratio > 0.8) s -= (ratio - 0.8) * 0.5;
  }
  if (ctx.script) {
    const sc = scriptOf(`${t.title} ${t.artist}`);
    if (sc && sc !== ctx.script && !sameArtist) s -= 0.5;
  }
  const f = flagsOf(t);
  if (f.live && !ctx.seedFlags.live) s -= 0.25;
  if (t.plays) s += Math.min(0.08, Math.log10(t.plays + 1) / 80);
  return s;
}

/** Collapse "Title" / "Title (Official Video)" / "Title - Remastered" of one artist into one entry. */
export const dedupeKey = (t: Track) =>
  `${t.artist.toLowerCase().trim()}|${words(t.title).slice(0, 5).join(' ')}`;

/**
 * Pick `count` tracks: best score first, at most `perArtist` per artist, no near-duplicates, and
 * the recent-artist penalty keeps updating as the list fills.
 */
export function pick(cands: Candidate[], ctx: RankCtx, count: number, perArtist = 2): { track: Track; score: number; cand: Candidate }[] {
  const pool = cands.filter((c) => usable(c, ctx));
  const recent = ctx.recentArtists.slice();
  const out: { track: Track; score: number; cand: Candidate }[] = [];
  const seen = new Set<string>();
  const perCount = new Map<string, number>();
  while (out.length < count && pool.length) {
    let bi = -1;
    let bs = -Infinity;
    const local = { ...ctx, recentArtists: recent };
    for (let i = 0; i < pool.length; i++) {
      const s = scoreCandidate(pool[i], local);
      if (s !== null && s > bs) (bs = s), (bi = i);
    }
    if (bi < 0) break;
    const [c] = pool.splice(bi, 1);
    const a = c.track.artist.toLowerCase().trim();
    const dk = dedupeKey(c.track);
    if (seen.has(dk) || (perCount.get(a) ?? 0) >= perArtist) continue;
    seen.add(dk);
    perCount.set(a, (perCount.get(a) ?? 0) + 1);
    out.push({ track: c.track, score: bs, cand: c });
    recent.push(a);
  }
  return out;
}

/** Merge several lists of candidates: votes add up, the best related rank wins. */
export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const list of lists)
    for (const c of list) {
      const prev = map.get(c.track.key);
      if (!prev) map.set(c.track.key, { ...c, via: [...c.via] });
      else {
        prev.votes += c.votes;
        prev.related = Math.max(prev.related, c.related);
        for (const v of c.via) if (!prev.via.includes(v)) prev.via.push(v);
      }
    }
  return [...map.values()];
}
