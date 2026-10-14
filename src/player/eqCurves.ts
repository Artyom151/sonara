/** Equalizer presets and helpers: pure, no platform imports (the store is player/equalizer.ts). */
export type EqPresetId = 'flat' | 'bass' | 'treble' | 'vocal' | 'rock' | 'pop' | 'jazz' | 'electronic' | 'hiphop' | 'classical' | 'night' | 'custom';

export const BANDS = 10;
export const EQ_RANGE = 12;

/** dB per band, in the order of EQ_FREQS. */
export const EQ_PRESETS: Record<Exclude<EqPresetId, 'custom'>, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 1, 3, 4, 5, 6],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  rock: [4, 3, 2, -1, -2, -1, 2, 3, 4, 4],
  pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  electronic: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5],
  hiphop: [5, 4, 2, 3, -1, -1, 1, 0, 2, 3],
  classical: [3, 2, 1, 0, 0, 0, -1, -2, -3, -4],
  night: [-3, -2, -1, 0, 1, 2, 1, 0, -2, -4],
};


/** "Arvind's AirPods Pro" and "AirPods Pro" are the same model: key by the lowercase letters and digits. */
export const deviceKey = (name: string) =>
  name
    .replace(/\s*\([^)]*\)/g, '') // "(A1B2)": the code differs per unit
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/^(.*?)(airpods|galaxybuds|buds|freebuds|wh|wf|qc)/u, '$2')
    .slice(0, 40);

