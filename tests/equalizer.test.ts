import assert from 'node:assert/strict';
import { test } from 'node:test';

test('presets cover ten bands within ±12 dB', async () => {
  const { EQ_PRESETS, EQ_RANGE } = await import('../src/player/eqCurves');
  for (const [name, g] of Object.entries(EQ_PRESETS)) {
    assert.equal(g.length, 10, name);
    assert.ok(g.every((x) => Math.abs(x) <= EQ_RANGE), name);
  }
  assert.ok(EQ_PRESETS.flat.every((x) => x === 0));
});

test('one profile per headphone model, whoever owns them', async () => {
  const { deviceKey } = await import('../src/player/eqCurves');
  assert.equal(deviceKey("Arvind's AirPods Pro"), deviceKey('Anna AirPods Pro'));
  assert.equal(deviceKey('Galaxy Buds2 Pro (A1B2)'), deviceKey('Galaxy Buds2 Pro (C3D4)'));
  assert.notEqual(deviceKey('Galaxy Buds2'), deviceKey('Galaxy Buds2 Pro'));
});
