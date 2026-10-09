import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoreApi } from '../src/core/api';

const offline = (() => Promise.reject(new Error('offline'))) as any;

test('keyed sources stay off with no token or a placeholder token', () => {
  for (const v of [undefined, '', 'your_vk_access_token']) {
    const api = createCoreApi(offline, undefined, { yandex: () => v, vk: () => v });
    assert.equal(api.ym.enabled, false);
    assert.equal(api.vk.enabled, false);
  }
  const api = createCoreApi(offline, undefined, { yandex: () => 'y0_real', vk: () => 'vk1.a.real' });
  assert.ok(api.ym.enabled && api.vk.enabled);
});

test('picking a keyed source without a token reports the missing .env variable', async () => {
  const api = createCoreApi(offline);
  await assert.rejects(api.search('x', 'yandex'), /VITE_YANDEX_MUSIC_TOKEN/);
  await assert.rejects(api.search('x', 'vk'), /VITE_VK_TOKEN/);
});

test('"All" skips keyed sources without tokens', async () => {
  const calls: string[] = [];
  const api = createCoreApi(((u: string) => (calls.push(u), Promise.reject(new Error('offline')))) as any);
  await api.search('x', 'all', { sources: { soundcloud: false, youtube: false, deezer: false } });
  assert.ok(!calls.some((u) => /yandex|vk\.com/.test(u)));
});
