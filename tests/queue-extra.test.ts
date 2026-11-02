import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
};

const { usePlayer } = await import('../src/store/player');
const track = (id: string): any => ({ key: `youtube:${id}`, id, source: 'youtube', title: id, artist: 'Artist', duration: 100 });
const ids = () => usePlayer.getState().queue.map((t) => t.id);

const reset = () => usePlayer.setState({ queue: [], baseQueue: [], index: 0, playing: false, shuffle: false, repeat: 'off', lastRemoved: null, error: null, position: 0 });

test('playNext on an empty queue starts playback immediately', () => {
  reset();
  usePlayer.getState().playNext(track('a'));
  assert.deepEqual(ids(), ['a']);
  assert.equal(usePlayer.getState().index, 0);
  assert.equal(usePlayer.getState().playing, true);
});

test('playNext puts a track right after the current one, not at the end', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b'), track('c')]);
  usePlayer.getState().playNext(track('x'));
  assert.deepEqual(ids(), ['a', 'x', 'b', 'c']);
  assert.equal(usePlayer.getState().baseQueue.map((t) => t.id).join(''), 'abcx', 'the base queue grows too, for un-shuffling');
});

test('addToQueue appends; on an empty queue it becomes the current track', () => {
  reset();
  usePlayer.getState().addToQueue([track('a'), track('b')]);
  assert.deepEqual(ids(), ['a', 'b']);
  assert.equal(usePlayer.getState().playing, true);
  usePlayer.getState().addToQueue([track('c')]);
  assert.deepEqual(ids(), ['a', 'b', 'c']);
});

test('removeAt refuses to remove the current or past tracks, and out-of-range indexes', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b'), track('c')]);
  usePlayer.getState().removeAt(0);
  assert.deepEqual(ids(), ['a', 'b', 'c'], 'the current track stays');
  usePlayer.getState().removeAt(5);
  usePlayer.getState().removeAt(-1);
  assert.deepEqual(ids(), ['a', 'b', 'c']);
  usePlayer.getState().removeAt(2);
  assert.deepEqual(ids(), ['a', 'b']);
});

test('moveAt refuses to move the current or played tracks', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b'), track('c'), track('d')]);
  usePlayer.getState().moveAt(0, 2);
  assert.deepEqual(ids(), ['a', 'b', 'c', 'd'], 'moving the current track is refused');
  usePlayer.getState().moveAt(2, 100);
  usePlayer.getState().moveAt(2, 1); // valid
  assert.deepEqual(ids(), ['a', 'c', 'b', 'd']);
});

test('next() at the end: manual is a no-op, automatic pauses, repeat-all wraps', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b')]);
  usePlayer.getState().jump(1);
  usePlayer.getState().next(true);
  assert.equal(usePlayer.getState().playing, false, 'auto stop at the end');
  usePlayer.getState().next(); // manual
  assert.equal(usePlayer.getState().index, 1, 'manual next does not move past the end');
  usePlayer.getState().patch({ repeat: 'all' });
  usePlayer.getState().next(true);
  assert.equal(usePlayer.getState().index, 0);
  assert.equal(usePlayer.getState().playing, true);
});

test('repeat-one replays the same track instead of advancing', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b')]);
  usePlayer.getState().patch({ repeat: 'one' });
  usePlayer.getState().next(true);
  assert.equal(usePlayer.getState().index, 0);
  assert.equal(usePlayer.getState().playing, true);
});

test('cycleRepeat walks off → all → one → off', () => {
  reset();
  assert.equal(usePlayer.getState().repeat, 'off');
  usePlayer.getState().cycleRepeat();
  assert.equal(usePlayer.getState().repeat, 'all');
  usePlayer.getState().cycleRepeat();
  assert.equal(usePlayer.getState().repeat, 'one');
  usePlayer.getState().cycleRepeat();
  assert.equal(usePlayer.getState().repeat, 'off');
});

test('prev restarts the track after three seconds, otherwise goes back', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b')]);
  usePlayer.getState().jump(1);
  usePlayer.getState().patch({ position: 1 });
  usePlayer.getState().prev();
  assert.equal(usePlayer.getState().index, 0, 'early in the track: to the previous one');
  usePlayer.getState().jump(1);
  usePlayer.getState().patch({ position: 10 });
  usePlayer.getState().prev();
  assert.equal(usePlayer.getState().index, 1, 'deep in the track: restart it');
  assert.equal(usePlayer.getState().position, 0);
});

test('prev at the first track restarts instead of underflowing', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b')]);
  usePlayer.getState().patch({ position: 10 });
  usePlayer.getState().prev();
  assert.equal(usePlayer.getState().index, 0);
  assert.equal(usePlayer.getState().position, 0);
});

test('turning shuffle on keeps the current track first; turning it off finds it again', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b'), track('c'), track('d')]);
  usePlayer.getState().jump(2);
  usePlayer.getState().toggleShuffle();
  assert.equal(usePlayer.getState().shuffle, true);
  assert.equal(usePlayer.getState().current()?.id, 'c', 'playback continues from the same track');
  assert.equal(usePlayer.getState().index, 0);
  usePlayer.getState().toggleShuffle();
  assert.equal(usePlayer.getState().shuffle, false);
  assert.equal(usePlayer.getState().current()?.id, 'c', 'the original order is restored around it');
  assert.deepEqual(ids(), ['a', 'b', 'c', 'd']);
});

test('playQueue with shuffle on starts at the chosen track and shuffles the rest', () => {
  reset();
  usePlayer.getState().patch({ shuffle: true });
  usePlayer.getState().playQueue([track('a'), track('b'), track('c')], 1);
  const q = ids();
  assert.equal(q[0], 'b', 'the chosen track plays first');
  assert.equal(q.length, 3);
  assert.equal(new Set(q).size, 3, 'no track lost or duplicated');
  usePlayer.getState().patch({ shuffle: false });
});

test('jump switches the current track and resets the error', () => {
  reset();
  usePlayer.getState().playQueue([track('a'), track('b')]);
  usePlayer.getState().patch({ error: 'stream failed', position: 42 });
  usePlayer.getState().jump(1);
  assert.equal(usePlayer.getState().index, 1);
  assert.equal(usePlayer.getState().error, null);
  assert.equal(usePlayer.getState().position, 0);
  assert.equal(usePlayer.getState().playing, true);
});

test('the persisted state caps the queue at 200 entries', () => {
  const many = Array.from({ length: 250 }, (_, i) => track(`q${i}`));
  usePlayer.getState().playQueue(many);
  assert.equal(usePlayer.getState().queue.length, 250, 'the runtime queue is not capped');
});
