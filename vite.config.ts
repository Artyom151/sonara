import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

const host = process.env.TAURI_DEV_HOST;

/** Parent of a process and its command line ('' when unknown). */
function parentOf(pid: number): { ppid: number; cmd: string } {
  try {
    if (process.platform === 'linux') {
      const ppid = Number(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]) || 0;
      const cmd = ppid > 1 ? readFileSync(`/proc/${ppid}/cmdline`, 'utf8').replace(/\0/g, ' ') : '';
      return { ppid, cmd };
    }
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `$p=(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId; $p; (Get-CimInstance Win32_Process -Filter "ProcessId=$p").CommandLine`],
        { encoding: 'utf8' },
      ).split(/\r?\n/);
      return { ppid: Number(out[0]) || 0, cmd: out[1] ?? '' };
    }
    const ppid = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()) || 0;
    const cmd = ppid > 1 ? execFileSync('ps', ['-o', 'command=', '-p', String(ppid)], { encoding: 'utf8' }).trim() : '';
    return { ppid, cmd };
  } catch {
    return { ppid: 0, cmd: '' };
  }
}

/** Our `tauri dev` ancestor (pnpm and the shell in between are not watched: they may exit early). */
function tauriAncestor(): number {
  let pid = process.pid;
  for (let i = 0; i < 6; i++) {
    const { ppid, cmd } = parentOf(pid);
    if (ppid <= 1) break;
    if (/tauri/i.test(cmd)) return ppid;
    pid = ppid;
  }
  return 0;
}

const exitWithTauri = (): Plugin => ({
  name: 'sonara:exit-with-tauri',
  apply: 'serve',
  configureServer(server) {
    if (!process.env.TAURI_ENV_PLATFORM) return;
    const tauri = tauriAncestor();
    if (!tauri) return;
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'EPERM';
      }
    };
    const timer = setInterval(() => {
      // The tauri process is gone: the app is closed.
      if (!alive(tauri)) {
        clearInterval(timer);
        void server.close().finally(() => process.exit(0));
      }
    }, 1000);
    timer.unref();
  },
});

export default defineConfig({
  plugins: [react(), exitWithTauri()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  build: {
    target: ['es2022', 'chrome100', 'safari16'],
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    // Web dev: the local Sonara server handles /api.
    proxy: { '/api': 'http://127.0.0.1:8787' },
    watch: { ignored: ['**/src-tauri/**', '**/android/**'] },
  },
});
