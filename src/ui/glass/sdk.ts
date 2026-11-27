export interface LiquidGlassPreset {
  strength: number;
  alpha: number;
  refraction: readonly [number, number, number, number];
  refractionPower: number;
  glow: number;
}

export const GLASS_PRESETS = {
  regular: { strength: 0.8, alpha: 1, refraction: [0.7, 2.3, 5.2, 6.9], refractionPower: 1, glow: 0.25 },
  control: { strength: 0.65, alpha: 1, refraction: [0.7, 2.3, 5.2, 6.9], refractionPower: 1, glow: 0.2 },
  menu: { strength: 0.9, alpha: 1, refraction: [0.7, 2.3, 5.2, 6.9], refractionPower: 1, glow: 0.22 },
  sheet: { strength: 0.7, alpha: 1, refraction: [0.7, 2.3, 5.2, 6.9], refractionPower: 1, glow: 0.2 },
  alert: { strength: 0.75, alpha: 1, refraction: [0.7, 2.3, 5.2, 6.9], refractionPower: 1, glow: 0.22 },
} as const satisfies Record<string, LiquidGlassPreset>;

export const MENU_SPRING = { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 } as const;
export const MENU_CONTENT_SPRING = { type: 'spring', stiffness: 560, damping: 40 } as const;

export function glassPresetFor(el: HTMLElement): LiquidGlassPreset {
  if (el.matches('.menu')) return GLASS_PRESETS.menu;
  if (el.matches('.sheet')) return GLASS_PRESETS.sheet;
  if (el.matches('.alert')) return GLASS_PRESETS.alert;
  if (el.matches('.glass-icon, .ctl-main, .seg-lens')) return GLASS_PRESETS.control;
  return GLASS_PRESETS.regular;
}
