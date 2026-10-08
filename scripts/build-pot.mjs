// Bundles src/core/pot-page.ts (the BotGuard minter that runs in a youtube.com-origin page) for
// the native hosts: the desktop app (src-tauri/pot.js) and the Android app (assets/pot.js).
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

const outputs = ['src-tauri/pot.js', 'android/app/src/main/assets/pot.js'];
mkdirSync('android/app/src/main/assets', { recursive: true });
for (const outfile of outputs) {
  await build({ entryPoints: ['src/core/pot-page.ts'], bundle: true, minify: true, format: 'iife', target: ['chrome90', 'safari15'], outfile, logLevel: 'error' });
}
console.log('pot.js built:', outputs.join(', '));
