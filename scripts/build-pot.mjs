// Bundles src/core/pot-page.ts (the BotGuard minter that runs in a youtube.com-origin page) for
// the native hosts: the desktop app (src-tauri/pot.js) and the Android app (assets/pot.js).
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const outputs = ['src-tauri/pot.js', 'android/app/src/main/assets/pot.js'];
mkdirSync('android/app/src/main/assets', { recursive: true });
// Bundle to memory, then write only when the bytes changed: src-tauri embeds pot.js with
// include_str!, so a rewritten file (same content, new mtime) would rebuild the whole desktop crate.
for (const outfile of outputs) {
  const r = await build({ entryPoints: ['src/core/pot-page.ts'], bundle: true, minify: true, format: 'iife', target: ['chrome90', 'safari15'], write: false, logLevel: 'error' });
  const next = r.outputFiles[0].contents;
  if (existsSync(outfile) && Buffer.compare(readFileSync(outfile), Buffer.from(next)) === 0) continue;
  writeFileSync(outfile, next);
}
console.log('pot.js built:', outputs.join(', '));
