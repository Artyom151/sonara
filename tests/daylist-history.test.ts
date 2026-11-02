import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
};

const { useDaylistHistory } = await import('../src/store/daylistHistory');

test('recorded tracks come back as recent keys for ten days', () => {
  useDaylistHistory.setState({ served: {} });
  useDaylistHistory.getState().record(['a', 'b']);
  const now = Date.now();
  const recent = useDaylistHistory.getState().recentKeys(now);
  assert.ok(recent.has('a') && recent.has('b'));
  const later = useDaylistHistory.getState().recentKeys(now + 11 * 86_400_000);
  assert.equal(later.size, 0, 'after ten days the track is offered again');
});

test('re-recording refreshes the timestamp, so a served track stays excluded', () => {
  useDaylistHistory.setState({ served: {} });
  useDaylistHistory.getState().record(['x']);
  const first = Date.now();
  useDaylistHistory.setState({ served: { x: first - 9 * 86_400_000 } }); // almost expired
  useDaylistHistory.getState().record(['x']);
  const recent = useDaylistHistory.getState().recentKeys();
  assert.ok(recent.has('x'), 'the fresh record pushes the expiry away');
});

test('the history is capped at 800 keys, keeping the most recent ones', () => {
  useDaylistHistory.setState({ served: {} });
  const keys = Array.from({ length: 850 }, (_, i) => `k${i}`);
  useDaylistHistory.getState().record(keys);
  const served = useDaylistHistory.getState().served;
  assert.equal(Object.keys(served).length, 800);
  assert.ok('k849' in served, 'the newest stays');
  assert.ok(!('k0' in served), 'the oldest goes');
});

test('a second record merges with, not replaces, the earlier history', () => {
  useDaylistHistory.setState({ served: {} });
  useDaylistHistory.getState().record(['a']);
  useDaylistHistory.getState().record(['b']);
  const recent = useDaylistHistory.getState().recentKeys();
  assert.ok(recent.has('a') && recent.has('b'));
});
