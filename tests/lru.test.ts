import assert from 'node:assert/strict';
import { test } from 'node:test';

const { LruMap } = await import('../src/lib/lru');

test('reading refreshes an entry, so the oldest is the least recently used', () => {
  const lru = new LruMap<string, number>(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  lru.get('a'); // 'a' becomes the newest
  lru.set('d', 4); // evicts 'b', the oldest
  assert.ok(lru.has('a'), 'the refreshed entry survives');
  assert.ok(!lru.has('b'), 'the untouched oldest goes');
  assert.ok(lru.has('c') && lru.has('d'));
});

test('inserting past the cap evicts until the cap holds', () => {
  const lru = new LruMap<string, number>(2);
  for (const [k, v] of [['x', 1], ['y', 2], ['z', 3], ['w', 4]] as const) lru.set(k, v);
  assert.equal(lru.size, 2);
  assert.deepEqual([...lru.keys()], ['z', 'w']);
});

test('re-setting an existing key updates it in place without evicting itself', () => {
  const lru = new LruMap<string, number>(2);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('a', 10);
  assert.equal(lru.size, 2);
  assert.equal(lru.get('a'), 10);
  assert.ok(lru.has('b'), 'the other entry survives the update');
});

test('get of a missing key does not create anything', () => {
  const lru = new LruMap<string, number>(2);
  assert.equal(lru.get('nope'), undefined);
  assert.equal(lru.size, 0);
});
