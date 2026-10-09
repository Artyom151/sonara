import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

/**
 * End-to-end against the real server and real YouTube/Deezer (no keys).
 * Needs internet; set TESTS_OFFLINE=1 to skip.
 */
const skip = process.env.TESTS_OFFLINE ? 'TESTS_OFFLINE' : false;
const PORT = 8000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}`;
let srv: ChildProcess;

before(async () => {
  if (skip) return;
  srv = spawn('node', ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${base}/api/search?q=a&source=soundcloud`, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('server did not start');
});
after(() => srv?.kill());

const search = async (q: string, source: string) => ((await (await fetch(`${base}/api/search?q=${encodeURIComponent(q)}&source=${source}`)).json()) as any).tracks as any[];
const range = async (path: string, r: string) => {
  const res = await fetch(base + path, { headers: { Range: `bytes=${r}` } });
  const n = (await res.arrayBuffer()).byteLength;
  return { status: res.status, n };
};

test('youtube: several tracks stream past the 1.2 MB cut-off (PO token on every track)', { skip, timeout: 240000 }, async () => {
  for (const id of ['FGBhQbmPwH8', 'dQw4w9WgXcQ', 'k65dUiecq7E', 'FGBhQbmPwH8']) {
    for (const r of ['0-999', '1500000-1500999', '3000000-3000999']) {
      const x = await range(`/api/yt/stream/${id}`, r);
      assert.equal(x.status, 206, `${id} ${r}`);
      assert.equal(x.n, 1000);
    }
  }
});

test('youtube search returns tracks', { skip, timeout: 60000 }, async () => {
  const t = await search('daft punk one more time', 'youtube');
  assert.ok(t.length > 0);
  assert.equal(t[0].source, 'youtube');
});

test('deezer search returns only deezer tracks and they stream past the cut-off', { skip, timeout: 240000 }, async () => {
  const t = await search('daft punk', 'deezer');
  assert.ok(t.length > 0);
  assert.ok(t.every((x) => x.source === 'deezer'));
  const s = (await (await fetch(`${base}/api/stream?track=${encodeURIComponent(JSON.stringify(t[0]))}`)).json()) as any;
  assert.ok(s.url);
  assert.equal((await range(s.url, '3000000-3000999')).status, 206);
});

test('soundcloud search returns only soundcloud tracks', { skip, timeout: 60000 }, async () => {
  const t = await search('lofi', 'soundcloud');
  assert.ok(t.length > 0 && t.every((x) => x.source === 'soundcloud'));
});

test('yandex music: search works and tracks play from yandex itself', { skip, timeout: 240000 }, async () => {
  const t = await search('SIDERR hate you', 'yandex');
  assert.ok(t.length > 0, 'no yandex results');
  assert.ok(t.every((x) => x.source === 'yandex'));
  const s = (await (await fetch(`${base}/api/stream?track=${encodeURIComponent(JSON.stringify(t[0]))}`)).json()) as any;
  assert.match(decodeURIComponent(s.url), /yandex\.net/, 'a yandex track must not be replaced by another service');
  const r = await fetch(base + s.url, { headers: { Range: 'bytes=0-999', Origin: 'http://localhost:5173' } });
  assert.equal(r.status, 206, `yandex file ${r.status}`);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await r.arrayBuffer()).byteLength, 1000);
});
