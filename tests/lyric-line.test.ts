import assert from 'node:assert/strict';
import { test } from 'node:test';

const { indexAt } = await import('../src/player/lyricIndex');

const lines = [
  { time: 1, text: 'one' },
  { time: 4, text: 'two' },
  { time: 9, text: 'three' },
];

test('the current line is the last one that has started', () => {
  assert.equal(indexAt(lines, 0), -1, 'before the first line');
  assert.equal(indexAt(lines, 1), 0);
  assert.equal(indexAt(lines, 3.5), 0);
  assert.equal(indexAt(lines, 4), 1);
  assert.equal(indexAt(lines, 100), 2, 'after the last line');
  assert.equal(indexAt([], 5), -1, 'no lines');
});

test('a line starts a quarter second early', () => {
  assert.equal(indexAt(lines, 3.8), 1);
});
