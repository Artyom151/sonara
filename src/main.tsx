import { StrictMode } from 'react';
import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import './styles/controls.css';
import './styles/extra.css';
import './styles/desktop.css';
import './styles/wave.css';
import './styles/account.css';
import './player/engine';
import './player/equalizer';
import './platform/dpi';
import './player/likePulse';
import './player/normalize';
import './platform/mediaControls';
import './platform/audioDevices';
import './platform/network';
import './platform/tray';
import './platform/logs';
import './platform/discord';
import './platform/pot';
import './platform/memory';
import './account/sync';
import './account/cloud';
import { isAndroid, isCapacitor } from './platform';
import { resolveTier } from './platform/perf';
import { useSettings } from './store/settings';
import { App } from './ui/App';
import { startLiquidGlass, warmGlass } from './ui/glass/liquid';

document.documentElement.dataset.platform = isAndroid ? 'android' : 'other';
// Graphics tier before the first paint (ThemeController keeps it in sync with Settings).
document.documentElement.dataset.perf = resolveTier(useSettings.getState().graphics);

// Compile and link the glass shader now, not on the first glass element, and start watching the
// DOM before React paints so the very first frame already has its glass layers.
warmGlass();
startLiquidGlass();

if (isCapacitor) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  });
}

/**
 * A render error used to unmount the whole app and leave a black window. Now the error is logged
 * and shown with a reload button.
 */
class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[render] crashed:', error, info.componentStack ?? '');
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, color: 'var(--text, #fff)', background: '#000', minHeight: '100vh', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 17, marginBottom: 12 }}>Sonara crashed while drawing the screen</div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.8 }}>{this.state.error.message}</pre>
        <button style={{ marginTop: 12, padding: '8px 14px' }} onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <App />
    </RootBoundary>
  </StrictMode>,
);

// Root containers are overflow:hidden but can still be scrolled programmatically (focus,
// scrollIntoView). Pin them so the interface never shifts.
document.addEventListener(
  'scroll',
  (e) => {
    const t = e.target;
    const el = t === document ? document.scrollingElement : (t as HTMLElement);
    if (el && (el === document.scrollingElement || el === document.body || (el as HTMLElement).id === 'root' || (el as HTMLElement).classList?.contains('app') || (el as HTMLElement).classList?.contains('main'))) {
      if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0);
    }
  },
  true,
);

