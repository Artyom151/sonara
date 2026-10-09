import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitArtists } from '../src/ui/artists';

test('splits the separators users asked for', () => {
  assert.deepEqual(splitArtists('x & y'), ['x', 'y']);
  assert.deepEqual(splitArtists('x; y'), ['x', 'y']);
  assert.deepEqual(splitArtists('x,y'), ['x', 'y']);
  assert.deepEqual(splitArtists('x , y'), ['x', 'y']);
  assert.deepEqual(splitArtists('x feat. y'), ['x', 'y']);
  assert.deepEqual(splitArtists('x x y'), ['x', 'y']);
});

test('keeps a single artist whole', () => {
  assert.deepEqual(splitArtists('Daft Punk'), ['Daft Punk']);
  assert.deepEqual(splitArtists('Maxwell'), ['Maxwell']);
});

test('adds featured artists from the title and removes duplicates', () => {
  assert.deepEqual(splitArtists('A', 'Song (feat. B & C)'), ['A', 'B', 'C']);
  assert.deepEqual(splitArtists('A & a'), ['A']);
});

test('drops placeholder artists', () => {
  assert.deepEqual(splitArtists('Various Artists'), []);
});
