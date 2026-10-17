import assert from 'node:assert/strict';
import { test } from 'node:test';

const { energyOf, isBlocked, moodBias, knownArtists } = await import('../src/player/waveMood');

const track = (over: Record<string, unknown>) => ({ key: 'k', title: 't', artist: 'A', duration: 200, genre: undefined, tags: [], ...over }) as any;

test('energy follows the genre and tags', () => {
  assert.equal(energyOf(track({ genre: 'Metal' })), 1);
  assert.equal(energyOf(track({ tags: ['lofi', 'chill'] })), -1);
  assert.equal(energyOf(track({})), 0);
});

test('blocked artists and genres are filtered', () => {
  const b = { genres: ['phonk'], artists: ['bad artist'] };
  assert.equal(isBlocked(track({ artist: 'Bad Artist' }), b), true);
  assert.equal(isBlocked(track({ tags: ['Phonk'] }), b), true);
  assert.equal(isBlocked(track({ artist: 'Other', tags: ['pop'] }), b), false);
});

test('a neutral mood adds nothing; the sliders move the score', () => {
  const known = new Set(['known']);
  const neutral = moodBias({ familiar: 0.5, energy: 0.5, popular: 0.5 }, known);
  assert.equal(neutral({ track: track({ artist: 'Known' }), related: 0, votes: 0, via: [] } as any), 0);
  const familiar = moodBias({ familiar: 1, energy: 0.5, popular: 0.5 }, known);
  assert.ok(familiar({ track: track({ artist: 'Known' }), related: 0, votes: 0, via: [] } as any) > 0);
  assert.ok(familiar({ track: track({ artist: 'Stranger' }), related: 0, votes: 0, via: [] } as any) < 0);
});

test('known artists come from the listening statistics', () => {
  assert.deepEqual([...knownArtists({ a: { seconds: 30 }, b: { seconds: 0 } })], ['a']);
});
