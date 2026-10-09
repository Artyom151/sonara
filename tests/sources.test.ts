import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoreApi } from '../src/core/api';

const offline = (() => Promise.reject(new Error('offline'))) as any;

test('yandex token: unset or placeholder counts as none', () => {
  for (const v of [undefined, '', 'your_yandex_music_oauth_token']) assert.equal(createCoreApi(offline, undefined, { yandex: () => v }).ym.hasToken, false);
  assert.equal(createCoreApi(offline, undefined, { yandex: () => 'y0_real' }).ym.hasToken, true);
});

test('a refused yandex token falls back to anonymous requests', async () => {
  const auths: (string | null)[] = [];
  const fetcher = (async (_u: string, i?: RequestInit) => {
    const a = (i?.headers as Record<string, string>)?.Authorization ?? null;
    auths.push(a);
    if (a) return new Response(JSON.stringify({ error: { name: 'missing-required-scopes' } }), { status: 403 });
    return new Response(JSON.stringify({ result: { tracks: { results: [{ id: 1, title: 'One More Time', artists: [{ name: 'Daft Punk' }], durationMs: 320000 }] } } }));
  }) as any;
  const api = createCoreApi(fetcher, undefined, { yandex: () => 'y0_wrong_scopes' });
  const t = await api.ym.search('daft punk');
  assert.equal(t[0].key, 'yandex:1');
  assert.equal(api.ym.hasToken, false);
  await api.ym.search('again');
  assert.deepEqual(auths, ['OAuth y0_wrong_scopes', null, null]);
});
