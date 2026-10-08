import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import './styles/controls.css';
import './styles/extra.css';
import './styles/desktop.css';
import './styles/wave.css';
import './styles/account.css';
import './player/engine';
import './player/likePulse';
import './platform/mediaControls';
import './platform/discord';
import './platform/memory';
import './account/sync';
import './account/cloud';
import { isAndroid, isCapacitor } from './platform';
import { resolveTier } from './platform/perf';
import { useSettings } from './store/settings';
import { App } from './ui/App';
import { startLiquidGlass } from './ui/glass/liquid';

document.documentElement.dataset.platform = isAndroid ? 'android' : 'other';
// Graphics tier before the first paint (ThemeController keeps it in sync with Settings).
document.documentElement.dataset.perf = resolveTier(useSettings.getState().graphics);

if (isCapacitor) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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

// Shader-driven liquid glass for every `.glass` element (see src/ui/glass).
requestAnimationFrame(() => startLiquidGlass());
