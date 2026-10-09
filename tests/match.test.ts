import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreCandidate } from '../src/core/match';
import type { Track } from '../src/core/types';

const tr = (artist: string, title: string, duration: number, source: Track['source'] = 'youtube'): Track => ({ key: `${source}:${artist}${title}`, id: '1', source, artist, title, duration });

test('rejects a different, longer song (SIDERR - hate you, 1:58 vs a 5:50 video)', () => {
  const want = tr('SIDERR', 'hate you', 118, 'deezer');
  assert.equal(scoreCandidate(want, tr('Three Days Grace', 'I Hate Everything About You (Official Video)', 350)), null);
  assert.equal(scoreCandidate(want, tr('SZA', 'I Hate U (Lyrics)', 171)), null);
  assert.equal(scoreCandidate(want, tr('SIDERR', 'hate you', 300)), null, 'same name, wrong length');
});

test('accepts the same recording with channel noise and a small length difference', () => {
  const want = tr('Daft Punk', 'One More Time', 320, 'deezer');
  assert.ok(scoreCandidate(want, tr('Daft Punk', 'Daft Punk - One More Time (Official Audio)', 321)));
  assert.ok(scoreCandidate(want, tr('Daft Punk', 'One More Time', 320, 'soundcloud')));
});

test('rejects covers, remixes and sped-up versions unless asked for', () => {
  const want = tr('Daft Punk', 'One More Time', 320, 'deezer');
  assert.equal(scoreCandidate(want, tr('Someone', 'Daft Punk - One More Time (Piano Cover)', 322)), null);
  assert.equal(scoreCandidate(want, tr('Daft Punk', 'One More Time (sped up)', 318)), null);
});
