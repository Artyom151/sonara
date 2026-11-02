import assert from 'node:assert/strict';
import { test } from 'node:test';

const { useIslandNotice, pushNotice } = await import('../src/store/islandNotice');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a notice takes the island and then leaves it after its ttl', async () => {
  useIslandNotice.getState().clear();
  pushNotice({ kind: 'offline', text: 'No connection' }, 20);
  assert.ok(useIslandNotice.getState().current, 'the notice is shown');
  assert.equal(useIslandNotice.getState().current?.kind, 'offline');
  await sleep(60);
  assert.equal(useIslandNotice.getState().current, null, 'it clears itself');
});

test('a newer notice replaces the older one; the old timer does not hide the new notice', async () => {
  useIslandNotice.getState().clear();
  pushNotice({ kind: 'queue', text: 'first' }, 30);
  await sleep(10);
  pushNotice({ kind: 'wave', text: 'second' }, 60);
  assert.equal(useIslandNotice.getState().current?.text, 'second');
  await sleep(40); // the first timer already fired
  assert.equal(useIslandNotice.getState().current?.text, 'second', 'the stale timer is cancelled');
  await sleep(60);
  assert.equal(useIslandNotice.getState().current, null);
});

test('clear() dismisses immediately', () => {
  pushNotice({ kind: 'warn', text: 'x' }, 5000);
  useIslandNotice.getState().clear();
  assert.equal(useIslandNotice.getState().current, null);
});

test('every notice has a unique id, so a late clear cannot hide a newer notice', async () => {
  useIslandNotice.getState().clear();
  pushNotice({ kind: 'queue', text: 'a' }, 15);
  const first = useIslandNotice.getState().current?.id;
  pushNotice({ kind: 'queue', text: 'b' }, 500);
  const second = useIslandNotice.getState().current?.id;
  assert.notEqual(first, second);
  await sleep(40);
  assert.ok(useIslandNotice.getState().current, 'the newer notice outlives the older ttl');
  useIslandNotice.getState().clear();
});
