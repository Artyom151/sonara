import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const version = JSON.parse(read('package.json')).version as string;

test('release.sh is valid bash and rejects bad versions', () => {
  execFileSync('bash', ['-n', 'release.sh']);
  assert.throws(() => execFileSync('./release.sh', ['abc'], { stdio: 'pipe' }), /not a semantic version/);
});

test('both changelogs have a section for every released-or-next version', () => {
  for (const f of ['CHANGELOG.md', 'CHANGELOG_ru.md']) {
    assert.match(read(f), /^## \[1\.1\.0\]/m, `${f} lacks 1.1.0`);
    assert.match(read(f), /^## \[1\.0\.0\]/m, `${f} lacks 1.0.0`);
  }
});

test('release notes render both languages and the download table', () => {
  const out = execFileSync('node', ['scripts/release-notes.mjs', '1.1.0'], { encoding: 'utf8' });
  assert.match(out, /## Sonara 1\.1\.0/);
  assert.match(out, /#### Изменено/);
  assert.match(out, /Downloads/);
});

test('package version is semver', () => assert.match(version, /^\d+\.\d+\.\d+/));

test('personal promo folder is not tracked', () => {
  const files = execFileSync('git', ['ls-files', 'promo'], { encoding: 'utf8' }).trim();
  assert.equal(files, '');
});

test('bundled pot.js exists for desktop and Android', () => {
  for (const p of ['src-tauri/pot.js', 'android/app/src/main/assets/pot.js']) assert.ok(read(p).length > 1000, p);
});
