import { isNative } from '../platform';
import { audio } from './engine';

/**
 * Audio levels for visuals. Web only: routing the media element through Web Audio
 * is permanent, and on native builds some streams are not CORS-enabled (the
 * analyser would output silence) and Android may stop Web Audio in the background.
 */
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let data: Uint8Array<ArrayBuffer> | null = null;
const levels = { bass: 0, mid: 0, high: 0 };

function init() {
  if (ctx || isNative) return;
  try {
    ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    data = new Uint8Array(analyser.frequencyBinCount);
    audio.addEventListener('play', () => ctx?.resume());
  } catch {
    ctx = null;
  }
}

// Create inside a user gesture so the context is allowed to run.
if (!isNative) {
  const once = () => {
    init();
    ctx?.resume();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

const band = (from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += data![i];
  return s / ((to - from) * 255);
};

/** Smoothed 0..1 levels; zeros when unavailable. */
export function getLevels() {
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

export const audioReactive = () => !!analyser;
