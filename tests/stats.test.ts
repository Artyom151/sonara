import assert from 'node:assert/strict';
import { test } from 'node:test';

const { useStats, dayKey } = await import('../src/store/stats');

test('listening adds up per day and per artist, plays count separately', () => {
  const s = useStats;
  s.setState({ days: {}, artists: {}, plays: 0 });
  s.getState().add('Artist A', 30);
  s.getState().add('  artist a ', 20);
  s.getState().add('B', 5);
  s.getState().countPlay('Artist A');
  const st = s.getState();
  assert.equal(st.days[dayKey()], 55);
  assert.equal(st.artists['artist a'].seconds, 50);
  assert.equal(st.artists['artist a'].plays, 1);
  assert.equal(st.artists['b'].seconds, 5);
  assert.equal(st.plays, 1);
});

test('only the 300 artists with the most listening are kept', () => {
  const s = useStats;
  s.setState({ days: {}, artists: {}, plays: 0 });
  for (let i = 0; i < 305; i++) s.getState().add(`artist ${i}`, i + 1);
  const keys = Object.keys(s.getState().artists);
  assert.equal(keys.length, 300);
  assert.ok(keys.includes('artist 304'), 'the most listened stays');
  assert.ok(!keys.includes('artist 0'), 'the least listened goes');
});
