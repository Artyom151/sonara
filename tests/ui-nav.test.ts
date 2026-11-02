import assert from 'node:assert/strict';
import { test } from 'node:test';

const { useUi } = await import('../src/store/ui');
const { usePlayer } = await import('../src/store/player');

const reset = () => {
  useUi.setState({ tab: 'home', stacks: { home: [], search: [], likes: [], profile: [] }, modals: [] });
};

test('routes stack per tab independently', () => {
  reset();
  useUi.getState().setTab('search');
  useUi.getState().push({ name: 'liked' });
  useUi.getState().push({ name: 'settings' });
  useUi.getState().setTab('home');
  useUi.getState().push({ name: 'stats' });
  assert.equal(useUi.getState().stacks.search.length, 2, 'search keeps its stack');
  assert.equal(useUi.getState().stacks.home.length, 1);
  assert.equal(useUi.getState().stacks.likes.length, 0);
});

test('popping removes the top route only', () => {
  reset();
  useUi.getState().push({ name: 'liked' });
  useUi.getState().push({ name: 'downloads' });
  useUi.getState().pop();
  assert.deepEqual(useUi.getState().stacks.home.map((r) => r.name), ['liked']);
});

test('tapping the current tab resets its stack; switching to another tab keeps theirs', () => {
  reset();
  useUi.getState().setTab('likes');
  useUi.getState().push({ name: 'liked' });
  useUi.getState().setTab('home');
  assert.equal(useUi.getState().stacks.likes.length, 1, 'the hidden tab keeps its stack');
  useUi.getState().setTab('likes');
  assert.equal(useUi.getState().stacks.likes.length, 1, 'switching to it keeps the stack');
  useUi.getState().setTab('likes');
  assert.deepEqual(useUi.getState().stacks.likes, [], 'a repeated tap on the open tab is a reset');
});

test('back closes a modal first, then pops the route, then returns home, then refuses', () => {
  reset();
  assert.equal(useUi.getState().back(), false, 'nothing to close at the root');

  useUi.getState().push({ name: 'stats' });
  assert.equal(useUi.getState().back(), true);
  assert.deepEqual(useUi.getState().stacks.home, []);

  useUi.getState().push({ name: 'stats' });
  useUi.getState().open({ type: 'queue' });
  assert.equal(useUi.getState().back(), true);
  assert.equal(useUi.getState().modals.length, 0, 'the modal went');
  assert.equal(useUi.getState().stacks.home.length, 1, 'the route stayed');

  useUi.getState().back(); // pops the 'stats' route
  useUi.getState().setTab('search');
  useUi.getState().push({ name: 'liked' });
  useUi.getState().back(); // pops 'liked', stays on search
  assert.equal(useUi.getState().tab, 'search');
  assert.equal(useUi.getState().back(), true, 'an empty stack still goes home');
  assert.equal(useUi.getState().tab, 'home');
});

test('modals stack and close in reverse order', () => {
  reset();
  const t = (id: string): any => ({ key: id, id, source: 'youtube', title: id, artist: 'A', duration: 1 });
  useUi.getState().open({ type: 'queue' });
  useUi.getState().open({ type: 'track', track: t('a') });
  assert.equal(useUi.getState().modals.length, 2);
  useUi.getState().close();
  assert.deepEqual(useUi.getState().modals.map((m) => m.type), ['queue']);
});

test('the player queue is untouched by navigation', () => {
  reset();
  const track = (id: string): any => ({ key: `youtube:${id}`, id, source: 'youtube', title: id, artist: 'A', duration: 1 });
  usePlayer.getState().playQueue([track('a'), track('b')]);
  useUi.getState().push({ name: 'stats' });
  useUi.getState().pop();
  assert.equal(usePlayer.getState().queue.length, 2);
});
