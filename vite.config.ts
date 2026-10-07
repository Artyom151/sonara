import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
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
