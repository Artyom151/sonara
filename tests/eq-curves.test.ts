import assert from 'node:assert/strict';
import { test } from 'node:test';

const { EQ_PRESETS, EQ_RANGE, BANDS, adaptivePreset, deviceKey } = await import('../src/player/eqCurves');
const { readFileSync } = await import('node:fs');

test('the frequency layout spans sub-bass to presence, ten ascending bands', () => {
  // audioGraph.ts cannot be imported in node (it creates the audio element), so its source is checked.
  const src = readFileSync(new URL('../src/player/audioGraph.ts', import.meta.url), 'utf8');
  const freqs = [...src.matchAll(/\b(31|62|125|250|500|1000|2000|4000|8000|16000)\b/g)].map((m) => Number(m[1]));
  const layout = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  assert.deepEqual(freqs.slice(0, 10), layout);
});

test('every fixed preset has exactly 10 bands within ±12 dB', () => {
  const ids = Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[];
  assert.ok(ids.length >= 12, `got ${ids.length} presets`);
  for (const id of ids) {
    const bands = EQ_PRESETS[id];
    assert.equal(bands.length, BANDS, `${id}: band count`);
    for (const db of bands) {
      assert.ok(Math.abs(db) <= EQ_RANGE, `${id}: ${db} dB out of range`);
      assert.ok(Number.isFinite(db), `${id}: non-finite band`);
    }
  }
});

test('flat is all zeros; the shaped presets are not flat', () => {
  assert.deepEqual(EQ_PRESETS.flat, new Array(BANDS).fill(0));
  for (const id of ['bass', 'treble', 'metal', 'vocal'] as const) {
    assert.ok(EQ_PRESETS[id].some((db) => db !== 0), `${id} should shape the curve`);
  }
});

test('bass lifts the low end, treble the high end, vocal the middle', () => {
  const bass = EQ_PRESETS.bass, treble = EQ_PRESETS.treble, vocal = EQ_PRESETS.vocal;
  assert.ok(bass[0] > bass[9], 'bass favours the first band');
  assert.ok(treble[9] > treble[0], 'treble favours the last band');
  const mid = Math.floor(BANDS / 2);
  assert.ok(vocal[mid] > vocal[0], 'vocal favours the middle band');
});

test('the presets are written in the band order of the graph (low to high frequencies)', () => {
  // audioGraph.ts cannot be imported in node (it creates the audio element at import time), so the
  // layout is verified against its source.
  const src = readFileSync(new URL('../src/player/audioGraph.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000'), 'EQ_FREQS as the presets expect');
  assert.equal(EQ_PRESETS.flat.length, 10);
});

test('the adaptive preset recognises the genres of the major styles', () => {
  assert.equal(adaptivePreset(['Metalcore']), 'metal');
  assert.equal(adaptivePreset(['death metal', 'doom']), 'metal');
  assert.equal(adaptivePreset(['Punk', 'grunge']), 'rock');
  assert.equal(adaptivePreset(['Hip-Hop', 'rap']), 'hiphop');
  assert.equal(adaptivePreset(['Drum and Bass']), 'electronic');
  assert.equal(adaptivePreset(['techno', 'house']), 'electronic');
  assert.equal(adaptivePreset(['Jazz', 'soul']), 'jazz');
  assert.equal(adaptivePreset(['Symphony No. 5', 'orchestra']), 'classical');
  assert.equal(adaptivePreset(['Pop', 'dance']), 'pop');
  assert.equal(adaptivePreset(['acoustic', 'singer-songwriter']), 'vocal');
  assert.equal(adaptivePreset(['Lo-fi beats', 'chill']), 'night');
  assert.equal(adaptivePreset(['something utterly unclassifiable']), 'flat');
  assert.equal(adaptivePreset([]), 'flat');
});

test('hard styles win over softer matches: metal beats rock for a metal-punk mix', () => {
  assert.equal(adaptivePreset(['metal', 'punk']), 'metal', 'the first matching rule decides');
});

test('the device key collapses owner names, case and punctuation to one model', () => {
  assert.equal(deviceKey("Arvind's AirPods Pro"), deviceKey('AirPods Pro'));
  assert.equal(deviceKey('Sony WH-1000XM5'), deviceKey('WH-1000XM5'));
  assert.equal(deviceKey('Samsung Galaxy Buds2 Pro'), deviceKey('Galaxy Buds2 Pro'));
  assert.notEqual(deviceKey('AirPods Pro'), deviceKey('AirPods Max'), 'different models stay different');
  assert.notEqual(deviceKey('AirPods Pro'), deviceKey('Galaxy Buds2 Pro'), 'different brands stay different');
});
