// Starts the Vite dev server for `tauri dev` and `pnpm dev`, or reuses the one this project
// already runs on the same port (a second `tauri dev`, `pnpm dev` left open in another terminal).
// A port held by some other program is reported plainly instead of Vite's bare "already in use".
//   node scripts/dev-web.mjs [vite args]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';

const HOST = process.env.TAURI_DEV_HOST || '127.0.0.1';
const PORT = 5173;
const URL = `http://${HOST}:${PORT}`;

const portOpen = () =>
  new Promise((resolve) => {
    const s = connect({ host: HOST, port: PORT });
    s.setTimeout(1000);
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('timeout', () => (s.destroy(), resolve(false)));
    s.once('error', () => resolve(false));
  });

/** 'free', 'sonara' (our Vite answers there) or 'other'. */
async function portState() {
  if (!(await portOpen())) return 'free';
  try {
    const [client, page] = await Promise.all([
      fetch(`${URL}/@vite/client`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${URL}/`, { signal: AbortSignal.timeout(2000) }).then((r) => r.text()),
    ]);
    return client.ok && page.includes('<title>Sonara</title>') ? 'sonara' : 'other';
  } catch {
    return 'other';
  }
}

// Vite runs as a direct child (not through `pnpm exec`, which puts it in its own process group), so
// it stops with this script: a Vite orphaned by a closed `tauri dev` is what used to hold the port.
function startVite() {
  // vite exports only its API (dist/node/index.js); the CLI sits at the package root, in bin/.
  const bin = join(dirname(createRequire(import.meta.url).resolve('vite')), '../../bin/vite.js');
  const vite = spawn(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit' });
  const stop = () => vite.exitCode === null && vite.kill('SIGTERM');
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => (stop(), process.exit(0)));
  process.on('exit', stop);
  vite.on('exit', (code, signal) => process.exit(signal ? 0 : (code ?? 0)));
}

/** Stay alive while the other Vite serves; take over if it goes away. */
function reuse() {
  console.log(`[dev] Vite is already running for Sonara at ${URL}: using it.`);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
  const timer = setInterval(async () => {
    if ((await portState()) !== 'free') return;
    clearInterval(timer);
    console.log('[dev] The other Vite stopped: starting one here.');
    startVite();
  }, 3000);
}

switch (await portState()) {
  case 'free':
    startVite();
    break;
  case 'sonara':
    reuse();
    break;
  case 'other':
    console.error(`[dev] Port ${PORT} on ${HOST} is taken by another program. Close it, or find it with:`);
    console.error(process.platform === 'win32' ? `  netstat -ano | findstr :${PORT}` : `  lsof -i :${PORT}   (or: ss -ltnp | grep ${PORT})`);
    process.exit(1);
}
