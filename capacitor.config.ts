import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.sonara.music',
  appName: 'Sonara',
  webDir: 'dist',
  backgroundColor: '#000000',
  loggingBehavior: 'production',
  android: {
    backgroundColor: '#000000',
    allowMixedContent: false,
    // Release builds: no remote WebView debugging, quieter bridge logging.
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production' && !process.argv.includes('--release'),
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
    CapacitorHttp: { enabled: false },
  },
};

export default config;
