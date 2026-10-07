// Builds bilingual (EN + RU) release notes for a version:
//   node scripts/release-notes.mjs 1.2.3 > notes.md
// Sources: the "## [x.y.z]" sections of CHANGELOG.md and CHANGELOG_ru.md, then the commits since
// the previous tag (so every release lists what changed even if the changelog wasn't updated).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const version = (process.argv[2] || '').replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}
const repo = process.env.GITHUB_REPOSITORY || 'Artyom151/sonara';

function section(file) {
  if (!existsSync(file)) return '';
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(`^## \\[?v?${version.replace(/\./g, '\\.')}\\]?[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  // Demote headings one level so they nest under "What's new" / "Что нового".
  return (text.match(re)?.[1] ?? '').trim().replace(/^(#{2,5}) /gm, '#$1 ');
}

function commits() {
  try {
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    const current = tags.find((t) => t.replace(/^v/, '') === version);
    const prev = tags.find((t) => t !== current);
    const range = prev ? `${prev}..${current || 'HEAD'}` : current || 'HEAD';
    return execSync(`git log ${range} --no-merges --pretty=format:"- %s (%h)"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const en = section('CHANGELOG.md');
const ru = section('CHANGELOG_ru.md');
const log = commits();

const downloads = [
  ['Android', `Sonara-${version}-android.apk`, 'Android 7.0+ (APK). `.aab` is for Google Play.', 'Android 7.0+ (APK). `.aab` — для Google Play.'],
  ['iOS', `Sonara-${version}-ios-unsigned.ipa`, 'Unsigned — sign/sideload (AltStore, Sideloadly).', 'Без подписи — подпишите или установите через AltStore / Sideloadly.'],
  ['Windows', '`*_x64-setup.exe` / `*_x64_en-US.msi`', 'Windows 10/11, x64.', 'Windows 10/11, x64.'],
  ['macOS', '`*_universal.dmg`', 'Apple Silicon + Intel, macOS 11+. Unsigned: right-click → Open.', 'Apple Silicon + Intel, macOS 11+. Без подписи: ПКМ → Открыть.'],
  ['Linux (glibc)', '`*.AppImage` / `*.deb` / `*.rpm`', 'Ubuntu, Debian, Fedora, Arch, …', 'Ubuntu, Debian, Fedora, Arch и др.'],
  ['Linux (musl)', `Sonara-${version}-linux-musl-x86_64.tar.gz`, 'Alpine Linux and other musl systems.', 'Alpine Linux и другие musl‑системы.'],
];

const out = [];
out.push(`## Sonara ${version}`, '');
out.push('### What\'s new', '', en || '_See the commit list below._', '');
out.push('### Что нового', '', ru || '_Смотрите список коммитов ниже._', '');
out.push('### Downloads / Загрузки', '', '| Platform | File | Notes | Примечание |', '|---|---|---|---|');
for (const [p, f, n, r] of downloads) out.push(`| ${p} | ${f.startsWith('`') ? f : `\`${f}\``} | ${n} | ${r} |`);
out.push('');
if (log) out.push('<details><summary>Commits / Коммиты</summary>', '', log, '', '</details>', '');
out.push(`**Full changelog / Полный список изменений:** https://github.com/${repo}/blob/main/CHANGELOG.md`);
console.log(out.join('\n'));
