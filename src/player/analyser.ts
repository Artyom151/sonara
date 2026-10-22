import { getGraph } from './audioGraph';
import { audio } from './element';

/**
 * Audio levels for visuals. Reads the shared Web Audio graph (audioGraph.ts), which exists on the
 * web from the first gesture and on native shells once the equalizer is on.
 */
let data: Uint8Array<ArrayBuffer> | null = null;
const levels = { bass: 0, mid: 0, high: 0 };

const band = (from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += data![i];
  return s / ((to - from) * 255);
};

/** Smoothed 0..1 levels; zeros when unavailable. */
export function getLevels() {
  const analyser = getGraph()?.analyser;
  if (analyser && !data) data = new Uint8Array(analyser.frequencyBinCount);
  if (analyser && data && !audio.paused) {
    analyser.getByteFrequencyData(data);
    const n = data.length;
    const target = { bass: band(1, Math.floor(n * 0.04)), mid: band(Math.floor(n * 0.04), Math.floor(n * 0.25)), high: band(Math.floor(n * 0.25), Math.floor(n * 0.7)) };
    levels.bass += (target.bass - levels.bass) * 0.35;
    levels.mid += (target.mid - levels.mid) * 0.25;
    levels.high += (target.high - levels.high) * 0.25;
  } else {
    levels.bass *= 0.92;
    levels.mid *= 0.92;
    levels.high *= 0.92;
  }
  return levels;
}

export const audioReactive = () => !!getGraph();
