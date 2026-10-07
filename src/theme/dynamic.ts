import { registerPlugin } from '@capacitor/core';
import { isAndroid } from '../platform';
import { argbFromHex, SONARA_SEED } from './color';

interface DynamicColorPlugin {
  /** Android 12+ (API 31) Material You system palette. */
  getColors(): Promise<{ supported: boolean; accent1?: string; accent2?: string; accent3?: string; neutral1?: string; seed?: string }>;
}

const DynamicColor = registerPlugin<DynamicColorPlugin>('DynamicColor');

export interface SystemPalette {
  supported: boolean;
  seed: number;
}

let systemPalette: Promise<SystemPalette> | null = null;

export function getSystemPalette(refresh = false): Promise<SystemPalette> {
  if (!systemPalette || refresh) {
    systemPalette = (async () => {
      if (!isAndroid) return { supported: false, seed: SONARA_SEED };
      try {
        const c = await DynamicColor.getColors();
        if (c.supported && c.seed) return { supported: true, seed: argbFromHex(c.seed) };
      } catch {
        /* plugin unavailable */
      }
      return { supported: false, seed: SONARA_SEED };
    })();
  }
  return systemPalette;
}
