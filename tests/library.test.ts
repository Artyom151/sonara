import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
};

const { useLibrary } = await import('../src/store/library');
const track = (id: string, artist = 'Artist'): any => ({
  key: `youtube:${id}`,
  id,
  source: 'youtube',
  title: `Track ${id}`,
  artist,
  duration: 100,
  sc: { auth: 'token', transcodings: [{ url: 'x' }] } as any,
});

const reset = () => useLibrary.setState({ likes: [], dislikes: [], playlists: [], savedPlaylists: [], recent: [], recentSearches: [] });

test('the heart toggles: like → unlike → like; disliking takes back the like', () => {
  reset();
  const t = track('a');
  useLibrary.getState().toggleLike(t);
  assert.equal(useLibrary.getState().likes.length, 1);
  useLibrary.getState().toggleLike(track('a'));
  assert.equal(useLibrary.getState().likes.length, 0, 'the second tap unlikes');
  useLibrary.getState().toggleLike(t);
  assert.equal(useLibrary.getState().likes.length, 1);
  useLibrary.getState().toggleDislike(t);
  assert.ok(useLibrary.getState().dislikes.includes(t.key));
  assert.equal(useLibrary.getState().likes.length, 0, 'disliking removes the like');
});

test('isLiked answers by key', () => {
  reset();
  const t = track('a');
  useLibrary.getState().toggleLike(t);
  assert.ok(useLibrary.getState().isLiked(t.key));
  assert.equal(useLibrary.getState().isLiked('youtube:b'), false);
});

test('a persisted like is slim: transient SoundCloud payloads are dropped', () => {
  reset();
  useLibrary.getState().toggleLike(track('a'));
  const stored = useLibrary.getState().likes[0] as any;
  assert.ok(stored.sc, 'the source snapshot stays');
  assert.equal(stored.sc.auth, undefined);
  assert.equal(stored.sc.transcodings, undefined);
});

test('playlists: created at the top, renamed, deleted, and a like-shape is kept', () => {
  reset();
  const lib = useLibrary.getState();
  const a = lib.createPlaylist(' Chill ', 'desc');
  const b = useLibrary.getState().createPlaylist('Second');
  assert.equal(a.title, 'Chill', 'the title is trimmed');
  assert.equal(useLibrary.getState().playlists[0].id, b.id, 'new playlists go on top');
  assert.ok(a.id && a.createdAt > 0 && a.updatedAt > 0);

  useLibrary.getState().updatePlaylist(a.id, { title: 'Renamed' });
  assert.equal(useLibrary.getState().playlists.find((p) => p.id === a.id)!.title, 'Renamed');

  useLibrary.getState().deletePlaylist(a.id);
  assert.equal(useLibrary.getState().playlists.find((p) => p.id === a.id), undefined);
});

test('addToPlaylist appends without duplicating keys; removeFromPlaylist removes by key', () => {
  reset();
  const lib = useLibrary.getState();
  const p = lib.createPlaylist('Mix', '', [track('a'), track('b')]);
  useLibrary.getState().addToPlaylist(p.id, [track('b'), track('c')]);
  const tracks = useLibrary.getState().playlists[0].tracks;
  assert.deepEqual(tracks.map((t) => t.id), ['a', 'b', 'c'], 'duplicates are filtered');
  useLibrary.getState().removeFromPlaylist(p.id, 'youtube:b');
  assert.deepEqual(useLibrary.getState().playlists[0].tracks.map((t) => t.id), ['a', 'c']);
});

test('moveInPlaylist reorders tracks within bounds', () => {
  reset();
  const p = useLibrary.getState().createPlaylist('Order', '', [track('a'), track('b'), track('c')]);
  useLibrary.getState().moveInPlaylist(p.id, 0, 2);
  assert.deepEqual(useLibrary.getState().playlists[0].tracks.map((t) => t.id), ['b', 'c', 'a']);
});

test('recent keeps the newest at the front, dedupes and caps at 50', () => {
  reset();
  const push = useLibrary.getState().pushRecent;
  push(track('a'));
  push(track('b'));
  push(track('a'));
  assert.deepEqual(useLibrary.getState().recent.map((t) => t.id), ['a', 'b']);
  for (let i = 0; i < 60; i++) push(track(`r${i}`));
  const recent = useLibrary.getState().recent;
  assert.equal(recent.length, 50);
  assert.equal(recent[0].id, 'r59');
});

test('searches dedupe case-insensitively, cap at 12 and can be cleared', () => {
  reset();
  const push = useLibrary.getState().pushSearch;
  push('Daft Punk');
  push('daft punk');
  push('Radiohead');
  assert.deepEqual(useLibrary.getState().recentSearches, ['Radiohead', 'daft punk'], 'the newest casing of the query wins');
  for (let i = 0; i < 20; i++) push(`query ${i}`);
  assert.equal(useLibrary.getState().recentSearches.length, 12);
  useLibrary.getState().clearSearches();
  assert.deepEqual(useLibrary.getState().recentSearches, []);
});

test('saved playlists toggle and drop their track payloads (the snapshot stays small)', () => {
  reset();
  const pl: any = { key: 'soundcloud:1', source: 'soundcloud', id: '1', title: 'Big Mix', tracks: [track('a')] };
  const toggle = useLibrary.getState().toggleSavedPlaylist;
  toggle(pl);
  toggle({ ...pl, tracks: [track('a')] });
  assert.equal(useLibrary.getState().savedPlaylists.length, 0, 'the second toggle unsaves');
  toggle(pl);
  const saved = useLibrary.getState().savedPlaylists[0];
  assert.equal(saved.title, 'Big Mix');
  assert.equal((saved as any).tracks, undefined, 'tracks are not persisted');
});
