import { isAndroid, isCapacitor } from '.';

export type PerfTier = 'high' | 'balanced' | 'low';

/** Pick a graphics tier for this device. Phones default to balanced; weak phones to low. */
export function detectTier(): PerfTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? 8;
  const mobile = isAndroid || isCapacitor || /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (memory <= 3 || cores <= 4) return mobile ? 'low' : 'balanced';
  return mobile ? 'balanced' : 'high';
}

export const currentTier = (): PerfTier => (document.documentElement.dataset.perf as PerfTier) || detectTier();
