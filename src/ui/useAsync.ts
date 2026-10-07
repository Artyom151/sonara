import { useCallback, useEffect, useRef, useState } from 'react';
import { LruMap } from '../lib/lru';

/** Screen data cache, capped (see platform/memory for trimming in the background). */
export const asyncCache = new LruMap<string, { at: number; value: unknown }>(40);
const cache = asyncCache;
const TTL = 10 * 60 * 1000;

/** Tiny cached async loader keyed by string. */
export function useAsync<T>(key: string | null, fn: () => Promise<T>) {
  const hit = key ? (cache.get(key) as { at: number; value: T } | undefined) : undefined;
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    data: hit?.value,
    loading: !!key && !hit,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(
    (force = false) => {
      if (!key) return;
      const c = cache.get(key) as { at: number; value: T } | undefined;
      if (c && !force) {
        setState({ data: c.value, loading: false });
        if (Date.now() - c.at < TTL) return;
      } else setState((s) => ({ data: force ? s.data : undefined, loading: true }));
      let alive = true;
      fnRef
        .current()
        .then((value) => {
          cache.set(key, { at: Date.now(), value });
          if (alive) setState({ data: value, loading: false });
        })
        .catch((error) => alive && setState((s) => ({ data: s.data, error, loading: false })));
      return () => {
        alive = false;
      };
    },
    [key],
  );

  useEffect(() => run(), [run]);
  return { ...state, reload: () => run(true) };
}
