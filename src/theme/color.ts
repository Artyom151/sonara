import { LruMap } from '../lib/lru';
import { argbFromRgb, Hct, hexFromArgb, argbFromHex, QuantizerCelebi, Score, TonalPalette } from '@material/material-color-utilities';

export const SONARA_SEED = 0xff8b5cf6;

/** Artwork palettes (capped; cleared by platform/memory when the app is in the background). */
export const colorCache = new LruMap<string, Promise<number[]>>(120);
const cache = colorCache;

/** Dominant colors of an image, ranked by Material's scoring (best first). */
export function imageColors(url: string | undefined): Promise<number[]> {
  if (!url) return Promise.resolve([SONARA_SEED]);
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise<number[]>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
          try {
            const size = 48;
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const ctx = c.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;
            const pixels: number[] = [];
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 250) pixels.push(argbFromRgb(data[i], data[i + 1], data[i + 2]));
            const result = QuantizerCelebi.quantize(pixels, 64);
            resolve(Score.score(result, { desired: 4, fallbackColorARGB: SONARA_SEED, filter: true }));
          } catch {
            resolve([SONARA_SEED]);
          }
        };
        img.onerror = () => resolve([SONARA_SEED]);
        img.src = url;
      }),
    );
  }
  return cache.get(url)!;
}

const tone = (p: TonalPalette, t: number) => hexFromArgb(p.tone(t));
const rgbTriplet = (argb: number) => `${(argb >> 16) & 255} ${(argb >> 8) & 255} ${argb & 255}`;

export type Scheme = 'dark' | 'light';

/** Interface palette (Material You tonal spot) as CSS custom properties, for the dark or the light scheme. */
export function accentVars(seed: number, tint: boolean, scheme: Scheme): Record<string, string> {
  const hct = Hct.fromInt(seed);
  const primary = TonalPalette.fromHueAndChroma(hct.hue, Math.max(48, hct.chroma));
  const secondary = TonalPalette.fromHueAndChroma(hct.hue, 16);
  const tertiary = TonalPalette.fromHueAndChroma((hct.hue + 60) % 360, 24);
  const neutral = TonalPalette.fromHueAndChroma(hct.hue, tint ? 8 : 0);
  const glass = TonalPalette.fromHueAndChroma(hct.hue, 14);
  // Surfaces over artwork (the full-screen player, the island) stay dark in both schemes.
  const onDark = {
    '--accent-dark': tone(primary, 80),
    '--accent-dark-rgb': rgbTriplet(primary.tone(80)),
    '--on-accent-dark': tone(primary, 15),
  };
  switch (scheme) {
    case 'light':
      return {
        '--accent': tone(primary, 40),
        '--accent-rgb': rgbTriplet(primary.tone(40)),
        '--accent-strong': tone(primary, 50),
        '--accent-container': tone(primary, 90),
        '--on-accent': '#ffffff',
        '--accent-secondary': tone(secondary, 40),
        '--accent-tertiary': tone(tertiary, 40),
        '--bg': tint ? tone(neutral, 97) : '#f5f5f7',
        '--bg-rgb': rgbTriplet(tint ? neutral.tone(97) : 0xfff5f5f7),
        '--surface': tint ? tone(neutral, 99) : '#ffffff',
        '--surface-2': tone(neutral, 92),
        '--glass-tint-rgb': rgbTriplet(tint ? glass.tone(92) : 0xffe5e5ea),
        '--fg-rgb': '0 0 0',
        '--text': '#0b0b0f',
        '--text-2': 'rgb(60 60 67 / 0.7)',
        '--text-3': 'rgb(60 60 67 / 0.42)',
        '--sep': 'rgb(60 60 67 / 0.2)',
        '--elevated-rgb': '250 250 252',
        '--panel': tint ? tone(neutral, 99) : '#ffffff',
        ...onDark,
      };
    case 'dark':
      return {
        '--accent': tone(primary, 80),
        '--accent-rgb': rgbTriplet(primary.tone(80)),
        '--accent-strong': tone(primary, 60),
        '--accent-container': tone(primary, 30),
        '--on-accent': tone(primary, 15),
        '--accent-secondary': tone(secondary, 80),
        '--accent-tertiary': tone(tertiary, 80),
        '--bg': tint ? tone(neutral, 4) : '#050505',
        '--bg-rgb': rgbTriplet(tint ? neutral.tone(4) : 0xff050505),
        '--surface': tone(neutral, 10),
        '--surface-2': tone(neutral, 17),
        '--glass-tint-rgb': rgbTriplet(tint ? glass.tone(30) : 0xff3a3a3c),
        '--fg-rgb': '255 255 255',
        '--text': '#ffffff',
        '--text-2': 'rgb(235 235 245 / 0.62)',
        '--text-3': 'rgb(235 235 245 / 0.34)',
        '--sep': 'rgb(84 84 88 / 0.5)',
        '--elevated-rgb': '28 28 30',
        '--panel': tint ? tone(neutral, 6) : '#0c0c0c',
        ...onDark,
      };
  }
}

/** Two colors for the full-screen player backdrop, like the concept's purple / amber screens. */
export function playerBackdrop(colors: number[]) {
  const base = Hct.fromInt(colors[0] ?? SONARA_SEED);
  const second = Hct.fromInt(colors[1] ?? colors[0] ?? SONARA_SEED);
  const chroma = Math.min(Math.max(base.chroma, 24), 64);
  const pal = TonalPalette.fromHueAndChroma(base.hue, chroma);
  const pal2 = TonalPalette.fromHueAndChroma(second.hue, Math.min(Math.max(second.chroma, 20), 56));
  return {
    top: hexFromArgb(pal.tone(42)),
    mid: hexFromArgb(pal2.tone(30)),
    deep: hexFromArgb(pal.tone(12)),
    card: hexFromArgb(pal.tone(55)),
    accent: hexFromArgb(pal.tone(85)),
  };
}

export { argbFromHex, hexFromArgb };
