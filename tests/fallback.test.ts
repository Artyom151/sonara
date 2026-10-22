import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findFallbacks } from '../src/player/fallback';
import type { SearchResult, Source, Track } from '../src/core/types';

const track = (source: Source, id: string, title: string, duration = 220): Track => ({
  source, id, key: `${source}:${id}`, title, artist: 'Daft Punk', duration,
});
const original = track('youtube', 'old', 'Around the World');
const result = (tracks: Track[]): SearchResult => ({ tracks, playlists: [] });

test('fallback finds only the same recording on another enabled source', async () => {
  const searched: Source[] = [];
  const matches = await findFallbacks(original, async (_query, source) => {
    searched.push(source);
    return result([
      track('soundcloud', 'wrong', 'Around the World', 350),
      track('soundcloud', 'cover', 'Around the World (Cover)'),
      track('soundcloud', 'good', 'Around the World', 222),
    ]);
  }, { soundcloud: true, youtube: true });
  assert.deepEqual(searched, ['soundcloud']);
  assert.deepEqual(matches.map((t) => t.id), ['good']);
});

test('fallback ignores a failed source and disabled sources', async () => {
  const matches = await findFallbacks(track('deezer', 'one', 'Around the World'), async (_query, source) => {
    if (source === 'soundcloud') throw new Error('offline');
    return result([track('youtube', 'good', 'Around the World')]);
  }, { soundcloud: true, youtube: true });
  assert.deepEqual(matches.map((t) => t.key), ['youtube:good']);
  assert.deepEqual(await findFallbacks(original, async () => result([track('soundcloud', 'good', 'Around the World')]), { soundcloud: false, youtube: true }), []);
});
