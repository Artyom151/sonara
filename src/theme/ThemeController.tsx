import { useEffect, useState } from 'react';
import { isAndroid } from '../platform';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { accentVars, argbFromHex, imageColors, SONARA_SEED } from './color';
import { getSystemPalette } from './dynamic';
import { resolveTier } from '../platform/perf';
import { refreshGlass } from '../ui/glass/liquid';

/** Applies the accent palette (Material You / artwork / custom) to :root as CSS variables. */
export function ThemeController() {
  const mode = useSettings((s) => s.accentMode);
  const custom = useSettings((s) => s.customAccent);
  const tint = useSettings((s) => s.tintInterface);
  const glass = useSettings((s) => s.glass);
  const reduce = useSettings((s) => s.reduceMotion);
  const graphics = useSettings((s) => s.graphics);
  const artwork = usePlayer((s) => s.queue[s.index]?.artwork);
  const [seed, setSeed] = useState(SONARA_SEED);

  useEffect(() => {
    let alive = true;
    const effective = mode === 'system' && !isAndroid ? 'artwork' : mode;
    (async () => {
      let s = SONARA_SEED;
      if (effective === 'system') {
        const p = await getSystemPalette();
        s = p.supported ? p.seed : (await imageColors(artwork))[0];
      } else if (effective === 'artwork') s = (await imageColors(artwork))[0] ?? SONARA_SEED;
      else if (effective === 'custom') s = argbFromHex(custom);
      if (alive) setSeed(s);
    })();
    return () => {
      alive = false;
    };
  }, [mode, custom, artwork]);

  // Re-read the wallpaper palette when the app returns to the foreground (wallpaper may have changed).
  useEffect(() => {
    if (!isAndroid || mode !== 'system') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') getSystemPalette(true).then((p) => p.supported && setSeed(p.seed));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(accentVars(seed, tint))) root.style.setProperty(k, v);
    root.dataset.glass = glass;
    root.dataset.reduceMotion = reduce ? '1' : '0';
    const tier = resolveTier(graphics);
    if (root.dataset.perf !== tier) {
      root.dataset.perf = tier;
      refreshGlass();
    }
    root.dataset.accentToggles = mode === 'system' && isAndroid ? '1' : '0';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }, [seed, tint, glass, reduce, mode, graphics]);

  return null;
}
