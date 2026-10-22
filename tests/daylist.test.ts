import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDaylist, slotAt } from '../src/player/daylistPlan';
import type { Track } from '../src/core/types';

const track = { key: 'one', artist: 'Artist', title: 'Song', source: 'soundcloud', id: 'one', duration: 180, genre: 'ambient' } as Track;
test('daylist follows local time boundaries', () => {
  const morning = slotAt(new Date(2026, 9, 18, 9, 59));
  assert.equal(morning.part, 'morning');
  assert.equal(new Date(morning.next).getHours(), 10);
  assert.equal(slotAt(new Date(2026, 9, 18, 10)).part, 'lateMorning');
  const night = slotAt(new Date(2026, 9, 18, 23));
  assert.equal(new Date(night.next).getDate(), 19);
});
test('same-time listening informs taste profile', () => {
  const date = new Date(2026, 9, 18, 8);
  const matching = new Date(2026, 9, 17, 7).getTime();
  const plan = makeDaylist(date, [{ track, at: matching }], [], []);
  assert.equal(plan.personalized, true);
  assert.equal(plan.tags[0], 'ambient');
  assert.equal(plan.anchors[0].key, 'one');
});
