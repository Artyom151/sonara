import assert from 'node:assert/strict';
import { test } from 'node:test';
import { censorIntervals, hasProfanity, isCensoredAt, normalizeCensorWord } from '../src/player/censor';

test('detects English, Russian and Ukrainian profanity including inflections', () => {
  for (const text of ['motherfucking', 'bullshit', 'блядский', 'хуёвый', 'їбать', 'підар', 'гівно']) assert.equal(hasProfanity(text), true, text);
});

test('normalizes common obfuscation and does not flag ordinary words', () => {
  assert.equal(normalizeCensorWord('f*ck1ng'), 'fcking');
  assert.equal(hasProfanity('бля7ь'), true);
  assert.equal(hasProfanity('class assassin passion'), false);
  assert.equal(hasProfanity('слово музыка песня'), false);
});

test('word timings mute only the matching word and merge overlapping intervals', () => {
  const intervals = censorIntervals([
    { time: 10, text: 'clean fucking words', words: [{ time: 10, text: 'clean' }, { time: 10.5, text: 'fucking' }, { time: 11.2, text: 'words' }] },
  ], 20);
  assert.equal(intervals.length, 1);
  assert.equal(isCensoredAt(intervals, 10.2), false);
  assert.equal(isCensoredAt(intervals, 10.6), true);
  assert.equal(isCensoredAt(intervals, 11.25), false);
});

test('plain LRC estimates an interval only around the profane word', () => {
  const intervals = censorIntervals([{ time: 0, text: 'keep this fucking lyric' }, { time: 8, text: 'next' }]);
  assert.equal(intervals.length, 1);
  assert.equal(isCensoredAt(intervals, 0.5), false);
  assert.equal(isCensoredAt(intervals, 3.8), true);
  assert.equal(isCensoredAt(intervals, 7.5), false);
});

test('line timings mute the whole line when word timings are unavailable', () => {
  const intervals = censorIntervals([{ time: 3, text: 'clean' }, { time: 6, text: 'блять' }, { time: 9, text: 'clean' }]);
  assert.equal(isCensoredAt(intervals, 5), false);
  assert.equal(isCensoredAt(intervals, 7), true);
  assert.equal(isCensoredAt(intervals, 9.1), false);
});
