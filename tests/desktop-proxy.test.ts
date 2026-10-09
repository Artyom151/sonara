import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createCoreApi } from '../src/core/api';

/**
 * Desktop media proxy (src-tauri/src/media_proxy.rs) against a real googlevideo URL: serves the
 * open-ended ranges a seeking player sends. Slow (cargo); set TESTS_OFFLINE=1 or TESTS_NO_CARGO=1 to skip.
 */
const skip = process.env.TESTS_OFFLINE || process.env.TESTS_NO_CARGO ? 'skipped by env' : false;

test('desktop proxy serves seek ranges for webm and mp4', { skip, timeout: 900000 }, async () => {
  const api = createCoreApi((u, i) => fetch(u, i as RequestInit));
  for (const c of ['webm', 'mp4'] as const) {
    const { url } = await api.yt.stream('FGBhQbmPwH8', c);
    assert.match(url, c === 'webm' ? /mime=audio%2Fwebm/ : /mime=audio%2Fmp4/);
    execFileSync('cargo', ['test', '--lib', 'media_proxy', '--', '--ignored'], { cwd: 'src-tauri', env: { ...process.env, SONARA_GV_URL: url }, stdio: 'pipe' });
  }
});

test('youtube picks the requested container', { skip: process.env.TESTS_OFFLINE ? 'offline' : false, timeout: 120000 }, async () => {
  const api = createCoreApi((u, i) => fetch(u, i as RequestInit));
  assert.match((await api.yt.stream('dQw4w9WgXcQ', 'webm')).mime ?? '', /webm/);
});
