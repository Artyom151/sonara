// Tells what the build will (not) contain, so a missing .env never goes unnoticed:
// without VITE_SUPABASE_* the app falls back to device-only accounts (no sign-in on a second
// device), without VITE_YANDEX_MUSIC_TOKEN Yandex Music needs a token entered in Settings.
// Never prints values. Warns, does not fail.
import { existsSync, readFileSync } from 'node:fs';

const file = new URL('../.env', import.meta.url);
const fromFile = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = (k) => process.env[k] || fromFile[k] || '';

const checks = [
  ['VITE_SUPABASE_URL', 'cloud accounts (sign in on several devices); the build will use device-only accounts'],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', 'cloud accounts; the build will use device-only accounts'],
  ['VITE_YANDEX_MUSIC_TOKEN', 'Yandex Music full tracks; enter a token in Settings → Sources instead'],
  ['VITE_DISCORD_APP_ID', 'Discord Rich Presence'],
];
const missing = checks.filter(([k]) => !get(k));
console.log(`[env] ${existsSync(file) ? '.env found' : '.env not found (copy .env.example)'}`);
for (const [k] of checks) console.log(`[env] ${get(k) ? 'set    ' : 'MISSING'} ${k}`);
for (const [k, why] of missing) console.warn(`[env] warning: ${k} is not set: no ${why}`);
