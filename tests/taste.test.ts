import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Track } from '../src/core/types';
import { features, flagsOf, makeCtx, mergeCandidates, mix, pick, scoreCandidate, scriptOf, type Candidate, type Profile } from '../src/player/taste';

let n = 0;
const T = (title: string, artist: string, o: Partial<Track> = {}): Track => ({
  key: `t:${++n}`,
  id: String(n),
  source: 'youtube',
  title,
  artist,
  duration: 200,
  ...o,
});
const cand = (track: Track, o: Partial<Candidate> = {}): Candidate => ({ track, related: 0, votes: 0, via: [], ...o });
const profileOf = (seeds: Track[]): Profile => {
  const p: Profile = {};
  seeds.forEach((t) => mix(p, features(t), 1));
  return p;
};

test('script detection', () => {
  assert.equal(scriptOf('Кино - Группа крови'), 'cyr');
  assert.equal(scriptOf('Daft Punk - Get Lucky'), 'lat');
  assert.equal(scriptOf('米津玄師 - 馬と鹿'), 'cjk');
  assert.equal(scriptOf('2024 - 1 2 3'), null);
});

test('kinds of release are flagged', () => {
  assert.ok(flagsOf(T('Song (Sped Up)', 'A')).sped);
  assert.ok(flagsOf(T('Song nightcore', 'A')).sped);
  assert.ok(flagsOf(T('Песня (slowed + reverb)', 'A')).sped);
  assert.ok(flagsOf(T('Song karaoke version', 'A')).karaoke);
  assert.ok(flagsOf(T('Song cover by someone', 'A')).cover);
  assert.ok(flagsOf(T('Chill mix 1 hour', 'A')).junk);
  assert.ok(flagsOf(T('Long set', 'A', { duration: 3600 })).junk);
  assert.ok(!flagsOf(T('Plain song', 'A')).sped);
});

test('sped-up versions, karaoke and covers are never suggested; same-kind seeds allow them', () => {
  const seed = T('Midnight City', 'M83', { tags: ['synthpop', 'electronic'] });
  const ctx = makeCtx([seed], profileOf([seed]));
  const good = cand(T('Reunion', 'M83'), { votes: 1, related: 0.9 });
  const sped = cand(T('Midnight City (sped up)', 'Fan'), { votes: 1, related: 0.95 });
  const kar = cand(T('Midnight City karaoke', 'Karaoke Hits'), { votes: 1, related: 0.9 });
  const out = pick([sped, kar, good], ctx, 5).map((x) => x.track.title);
  assert.deepEqual(out, ['Reunion']);
  const spedSeed = T('Midnight City (sped up)', 'Fan');
  const ctx2 = makeCtx([spedSeed], profileOf([spedSeed]));
  assert.ok(pick([sped], ctx2, 5).length === 1);
});

test('consensus of several anchors beats a single mention and a chart entry', () => {
  const a = T('Strobe', 'deadmau5', { tags: ['progressive house'] });
  const ctx = makeCtx([a], profileOf([a]));
  const voted = cand(T('Ghosts n Stuff', 'deadmau5'), { votes: 3, related: 0.4 });
  const single = cand(T('Some Other', 'Someone', { tags: ['progressive house'] }), { votes: 1, related: 0.4 });
  const chart = cand(T('Chart Hit', 'Pop Star', { tags: ['progressive house'] }), { votes: 0 });
  const [first, second, third] = pick([chart, single, voted], ctx, 3).map((x) => x.track.title);
  assert.equal(first, 'Ghosts n Stuff');
  assert.equal(second, 'Some Other');
  assert.equal(third, 'Chart Hit');
});

test('a chart entry that shares nothing with the taste is dropped, not ranked last', () => {
  const a = T('Strobe', 'deadmau5', { tags: ['progressive house'] });
  const ctx = makeCtx([a], profileOf([a]));
  const off = cand(T('Country Roads', 'Folk Singer', { tags: ['country', 'folk'] }), { votes: 0 });
  assert.equal(scoreCandidate(off, ctx), null);
  assert.equal(pick([off], ctx, 5).length, 0);
});

test('a Cyrillic seed does not drift into Latin-only releases of other artists', () => {
  const seeds = [T('Группа крови', 'Кино'), T('Звезда по имени Солнце', 'Кино'), T('Перемен', 'Кино')];
  const ctx = makeCtx(seeds, profileOf(seeds));
  assert.equal(ctx.script, 'cyr');
  const ru = cand(T('Закрой за мной дверь', 'Аквариум'), { votes: 1, related: 0.6 });
  const en = cand(T('Another One Bites The Dust', 'Queen'), { votes: 1, related: 0.6 });
  assert.ok(scoreCandidate(ru, ctx)! > scoreCandidate(en, ctx)!);
});

test('at most two per artist, no near-duplicates', () => {
  const a = T('Song A', 'Band');
  const ctx = makeCtx([a], profileOf([a]));
  const list = [
    cand(T('Song One', 'Other'), { votes: 2, related: 0.9 }),
    cand(T('Song One (Official Video)', 'Other'), { votes: 2, related: 0.88 }),
    cand(T('Two', 'Other'), { votes: 2, related: 0.8 }),
    cand(T('Three', 'Other'), { votes: 2, related: 0.7 }),
  ];
  const out = pick(list, ctx, 10).map((x) => x.track.title);
  assert.equal(out.filter((t) => t.startsWith('Song One')).length, 1);
  assert.ok(out.length <= 2);
});

test('merge adds votes and keeps the best rank', () => {
  const t = T('X', 'Y');
  const merged = mergeCandidates([[cand(t, { votes: 1, related: 0.3, via: ['a'] })], [cand(t, { votes: 1, related: 0.8, via: ['b'] })]]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].votes, 2);
  assert.equal(merged[0].related, 0.8);
  assert.deepEqual(merged[0].via, ['a', 'b']);
});
