import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
};

const { useSettings } = await import('../src/store/settings');

test('sensible defaults: every source on, playback helpers on, interface neutral', () => {
  const s = useSettings.getState();
  assert.deepEqual(s.sources, { soundcloud: true, youtube: true, deezer: true, yandex: true });
  assert.equal(s.autoplay, true);
  assert.equal(s.skipUnavailable, true);
  assert.equal(s.normalize, false, 'levelling is opt-in');
  assert.equal(s.theme, 'system');
  assert.equal(s.lang, 'auto');
  assert.equal(s.crossfade, 0);
  assert.equal(s.volume ?? undefined, undefined, 'volume lives in the player store, not here');
});

test('set() applies a partial patch without touching the rest', () => {
  useSettings.getState().set({ theme: 'dark', autoplay: false });
  const s = useSettings.getState();
  assert.equal(s.theme, 'dark');
  assert.equal(s.autoplay, false);
  assert.equal(s.lang, 'auto', 'unrelated keys keep their values');
  useSettings.getState().set({ theme: 'system', autoplay: true });
});

test('the wave mood sliders are 0..1 with a neutral 0.5 and stay in range', () => {
  const s = useSettings.getState();
  assert.deepEqual(s.waveMood, { familiar: 0.5, energy: 0.5, popular: 0.5 });
  s.set({ waveMood: { familiar: 1, energy: 0, popular: 0.25 } });
  assert.deepEqual(useSettings.getState().waveMood, { familiar: 1, energy: 0, popular: 0.25 });
  useSettings.getState().set({ waveMood: { familiar: 0.5, energy: 0.5, popular: 0.5 } });
});

test('the DPI bypass starts per service: youtube/soundcloud/deezer try tlsrec, yandex is off', () => {
  const b = useSettings.getState().bypass;
  assert.equal(b.enabled, false);
  assert.equal(b.services.youtube.preset, 'tlsrec');
  assert.equal(b.services.soundcloud.preset, 'tlsrec');
  assert.equal(b.services.deezer.preset, 'tlsrec');
  assert.equal(b.services.yandex.preset, 'off');
});

test('wave blocking starts empty and holds the correction lists', () => {
  const s = useSettings.getState();
  assert.deepEqual(s.waveBlocked, { genres: [], artists: [] });
  s.set({ waveBlocked: { genres: ['phonk'], artists: ['some sped-up channel'] } });
  assert.deepEqual(useSettings.getState().waveBlocked.artists, ['some sped-up channel']);
  useSettings.getState().set({ waveBlocked: { genres: [], artists: [] } });
});
