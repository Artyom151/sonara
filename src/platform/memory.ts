import { useSyncExternalStore } from 'react';
import { relatedCache, tagCache } from '../player/wave';
import { colorCache } from '../theme/color';
import { purgeGlass } from '../ui/glass/liquid';
import { asyncCache } from '../ui/useAsync';

/**
 * Background memory trim. When the app has been hidden (minimised window / Android
 * background) for a while: drop caches that are cheap to rebuild and tell heavy visuals
 * (WebGL shaders) to unmount. Everything comes back lazily when the app is shown again.
 */
const IDLE_MS = 20_000;
let active = true;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function trim() {
  for (const key of [...asyncCache.keys()]) if (!key.startsWith('home:')) asyncCache.delete(key);
  colorCache.clear();
  relatedCache.clear();
  tagCache.clear();
  purgeGlass();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    timer ??= setTimeout(() => {
      timer = null;
      active = false;
      trim();
      listeners.forEach((f) => f());
    }, IDLE_MS);
  } else {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!active) {
      active = true;
      listeners.forEach((f) => f());
    }
  }
});

/** False while the app is trimmed in the background: unmount GPU-heavy components. */
export const useAppActive = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => active,
  );
