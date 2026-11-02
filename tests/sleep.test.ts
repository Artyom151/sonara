import assert from 'node:assert/strict';
import { test } from 'node:test';

const { useSleep } = await import('../src/player/sleep');

test('a timeout stores the pause moment a fixed number of minutes away', () => {
  useSleep.getState().set(null);
  const before = Date.now();
  useSleep.getState().set(15);
  const st = useSleep.getState();
  assert.equal(st.endOfTrack, false);
  assert.ok(st.until !== null && st.until >= before + 15 * 60_000 && st.until <= Date.now() + 15 * 60_000);
});

test('"track" pauses when the current track ends, not at a clock time', () => {
  useSleep.getState().set('track');
  const st = useSleep.getState();
  assert.equal(st.until, null);
  assert.equal(st.endOfTrack, true);
});

test('clearing resets both modes at once', () => {
  useSleep.getState().set(30);
  useSleep.getState().set(null);
  const st = useSleep.getState();
  assert.equal(st.until, null);
  assert.equal(st.endOfTrack, false);
  useSleep.getState().set('track');
  useSleep.getState().set(null);
  assert.equal(useSleep.getState().endOfTrack, false);
});
