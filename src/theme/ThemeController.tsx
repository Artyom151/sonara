import { useEffect, useState } from 'react';
import { isAndroid } from '../platform';
import { resolveTier } from '../platform/perf';
import { usePlayer } from '../store/player';
import { useSettings, type AccentMode, type ThemeMode } from '../store/settings';
import { refreshGlass, retintGlass } from '../ui/glass/liquid';
import { useMedia } from '../ui/useMedia';
import { accentVars, argbFromHex, imageColors, SONARA_SEED, type Scheme } from './color';
import { getSystemPalette } from './dynamic';

function useScheme(theme: ThemeMode): Scheme {
  const prefersLight = useMedia('(prefers-color-scheme: light)');
  switch (theme) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'system':
      return prefersLight ? 'light' : 'dark';
  }
}

async function seedFor(mode: AccentMode, custom: string, artwork: string | undefined): Promise<number> {
  switch (mode) {
    case 'system': {
      const p = await getSystemPalette();
      return p.supported ? p.seed : ((await imageColors(artwork))[0] ?? SONARA_SEED);
    }
    case 'artwork':
      return (await imageColors(artwork))[0] ?? SONARA_SEED;
    case 'custom':
      return argbFromHex(custom);
    case 'sonara':
      return SONARA_SEED;
  }
}

/** Applies the theme (dark / light) and the accent palette to :root as CSS variables. */
export function ThemeController() {
  const theme = useSettings((s) => s.theme);
  const mode = useSettings((s) => s.accentMode);
  const custom = useSettings((s) => s.customAccent);
  const tint = useSettings((s) => s.tintInterface);
  const glass = useSettings((s) => s.glass);
  const reduce = useSettings((s) => s.reduceMotion);
  const graphics = useSettings((s) => s.graphics);
  const artwork = usePlayer((s) => s.queue[s.index]?.artwork);
  const scheme = useScheme(theme);
  const [seed, setSeed] = useState(SONARA_SEED);

  useEffect(() => {
    let alive = true;
    // Material You comes from the wallpaper, which only Android exposes.
    const effective = mode === 'system' && !isAndroid ? 'artwork' : mode;
    void seedFor(effective, custom, artwork).then((s) => alive && setSeed(s));
    return () => {
      alive = false;
    };
  }, [mode, custom, artwork]);

  // The wallpaper may have changed while the app was in the background.
  useEffect(() => {
    if (!isAndroid || mode !== 'system') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void getSystemPalette(true).then((p) => p.supported && setSeed(p.seed));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(accentVars(seed, tint, scheme))) root.style.setProperty(k, v);
    root.dataset.theme = scheme;
    root.style.colorScheme = scheme;
    root.dataset.glass = glass;
    root.dataset.reduceMotion = reduce ? '1' : '0';
    root.dataset.accentToggles = mode === 'system' && isAndroid ? '1' : '0';
    const tier = resolveTier(graphics);
    if (root.dataset.perf !== tier) {
      root.dataset.perf = tier;
      refreshGlass();
    }
    retintGlass();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }, [seed, tint, scheme, glass, reduce, mode, graphics]);

  return null;
}
