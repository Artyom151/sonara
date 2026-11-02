import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
};

const { useLook, LOOK_GRADIENTS, FRAME_COUNT } = await import('../src/store/look');

test('there is a fixed palette of gradients and avatar frames', () => {
  assert.ok(LOOK_GRADIENTS.length >= 6);
  assert.equal(FRAME_COUNT, 6);
  for (const g of LOOK_GRADIENTS) {
    assert.match(g.from, /^#[0-9a-f]{6}$/i);
    assert.match(g.to, /^#[0-9a-f]{6}$/i);
  }
});

test('a fresh profile shows the artwork background, a gradient banner and no frame', () => {
  const s = useLook.getState();
  assert.equal(s.background, 'artwork');
  assert.equal(s.bannerKind, 'gradient');
  assert.equal(s.bannerImage, null);
  assert.equal(s.frame, 0);
  assert.deepEqual(s.bannerPos, { x: 50, y: 50, zoom: 1 });
});

test('set() patches the profile fields without touching the others', () => {
  useLook.getState().set({ banner: 2, frame: 3, background: 1 });
  const s = useLook.getState();
  assert.equal(s.banner, 2);
  assert.equal(s.frame, 3);
  assert.equal(s.background, 1);
  assert.equal(s.bannerKind, 'gradient', 'kind is untouched by a gradient index change');
  useLook.getState().set({ banner: 0, frame: 0, background: 'artwork' });
});

test('a photo banner carries a position and zoom', () => {
  useLook.getState().set({ bannerKind: 'photo', bannerImage: 'data:image/jpeg;base64,xx', bannerPos: { x: 30, y: 70, zoom: 1.4 } });
  const s = useLook.getState();
  assert.equal(s.bannerKind, 'photo');
  assert.deepEqual(s.bannerPos, { x: 30, y: 70, zoom: 1.4 });
  useLook.getState().set({ bannerKind: 'gradient', bannerImage: null, bannerPos: { x: 50, y: 50, zoom: 1 } });
});
