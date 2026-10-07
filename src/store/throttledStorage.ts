import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * localStorage writes are synchronous; the player store changes ~4×/s (time updates) and
 * serialises the whole queue each time, which stutters Android WebView. Coalesce writes:
 * at most one per `ms`, flushed immediately when the app is hidden or closed.
 */
export function throttledStorage(ms = 3000) {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const [k, v] of pending) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* quota / blocked */
      }
    }
    pending.clear();
  };

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    window.addEventListener('pagehide', flush);
  }

  const storage: StateStorage = {
    getItem: (k) => pending.get(k) ?? localStorage.getItem(k),
    setItem: (k, v) => {
      pending.set(k, v);
      timer ??= setTimeout(flush, ms);
    },
    removeItem: (k) => {
      pending.delete(k);
      localStorage.removeItem(k);
    },
  };
  return createJSONStorage(() => storage);
}
