// Sets one version everywhere: package.json, Tauri (conf + Cargo), Android, iOS.
//   node scripts/set-version.mjs 1.2.3        (CI passes the tag without the leading "v")
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const raw = (process.argv[2] || '').replace(/^v/, '');
const m = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
if (!m) {
  console.error('usage: node scripts/set-version.mjs <semver>  (e.g. 1.2.3 or 1.3.0-beta.1)');
  process.exit(1);
}
const [, major, minor, patch, pre] = m;
// Android versionCode must grow monotonically: MMmmppbb (bb = pre-release build, 99 = final).
const preNum = pre ? Math.min(98, Number((pre.match(/(\d+)$/) || [, '0'])[1])) : 99;
const versionCode = Number(major) * 1_000_000 + Number(minor) * 10_000 + Number(patch) * 100 + preNum;

const edit = (file, fn) => {
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`${after !== before ? 'updated' : 'unchanged'}  ${file}`);
};

edit('package.json', (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${raw}"`));
edit('src-tauri/tauri.conf.json', (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${raw}"`));
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]+"/m, `version = "${raw}"`));
edit('android/app/build.gradle', (s) =>
  s.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]+"/, `versionName "${raw}"`),
);
edit('ios/App/App.xcodeproj/project.pbxproj', (s) =>
  s
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${major}.${minor}.${patch};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`),
);
console.log(`version ${raw} (android versionCode ${versionCode})`);
