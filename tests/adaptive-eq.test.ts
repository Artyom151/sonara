import assert from 'node:assert/strict';
import { test } from 'node:test';

const { adaptivePreset } = await import('../src/player/eqCurves');

test('adaptive preset follows the genre and tags of a track', () => {
  assert.equal(adaptivePreset(['Metal', 'heavy metal']), 'metal');
  assert.equal(adaptivePreset(['Rock']), 'rock');
  assert.equal(adaptivePreset(['Hip-Hop', 'rap']), 'hiphop');
  assert.equal(adaptivePreset(['Electronic', 'house']), 'electronic');
  assert.equal(adaptivePreset(['Pop']), 'pop');
  assert.equal(adaptivePreset([undefined, 'jazz']), 'jazz');
  assert.equal(adaptivePreset([]), 'flat', 'no genre and no tags: flat');
  assert.equal(adaptivePreset(['unknown genre']), 'flat');
});
