import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Track } from '../src/core/types';

const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
};

const { usePlayer } = await import('../src/store/player');
const track = (id: string): Track => ({ key: `youtube:${id}`, id, source: 'youtube', title: id, artist: 'Artist', duration: 100 });
const keys = () => usePlayer.getState().queue.map((t) => t.id);

test('reordering upcoming tracks preserves the current track and survives shuffle changes', () => {
  const p = usePlayer.getState();
  p.playQueue([track('a'), track('b'), track('c'), track('d')]);
  p.moveAt(3, 1);
  assert.deepEqual(keys(), ['a', 'd', 'b', 'c']);
  assert.equal(usePlayer.getState().current()?.id, 'a');
  p.moveAt(1, 0);
  assert.deepEqual(keys(), ['a', 'd', 'b', 'c']);
  p.toggleShuffle();
  p.toggleShuffle();
  assert.deepEqual(keys(), ['a', 'd', 'b', 'c']);
});

test('removing and undoing an upcoming track restores it once in its position', () => {
  const p = usePlayer.getState();
  p.playQueue([track('a'), track('b'), track('c')]);
  p.removeAt(1);
  assert.deepEqual(keys(), ['a', 'c']);
  assert.equal(usePlayer.getState().lastRemoved?.track.id, 'b');
  p.undoRemove();
  assert.deepEqual(keys(), ['a', 'b', 'c']);
  p.undoRemove();
  assert.deepEqual(keys(), ['a', 'b', 'c']);
});
