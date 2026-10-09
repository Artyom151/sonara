import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poToken, setPoTokenProvider } from '../src/core/potoken';

test('uses the registered provider (apps)', async () => {
  setPoTokenProvider(async (id) => `tok-${id}`);
  assert.equal(await poToken((() => Promise.reject(new Error('unused'))) as any, 'abc'), 'tok-abc');
});

test('stays in Node mode after a global document appears (regression: only the first track got a token)', async () => {
  (globalThis as any).document = {};
  setPoTokenProvider(undefined as any);
  const fetcher = (() => Promise.reject(new Error('network off'))) as any;
  await assert.rejects(poToken(fetcher, 'abc'), (e: Error) => !/provider not available/.test(e.message));
  delete (globalThis as any).document;
});
