import { ensureGraph, getGraph } from './audioGraph';
import { useSettings } from '../store/settings';

/**
 * Loudness levelling: the level of what plays is measured on the analyser of the audio graph and
 * a gain after the equalizer brings it towards one target loudness. The correction is smoothed and
 * limited to ±6 dB, so a quiet intro is not boosted into noise and a loud drop is not crushed.
 */
const TARGET_DB = -16;
const LIMIT_DB = 6;
const SILENCE_DB = -50;

let buf: Float32Array<ArrayBuffer> | null = null;
let level: number | null = null;

function tick() {
  const g = getGraph();
  if (!g) {
    // Levelling needs the graph: built here once it is switched on (the first gesture already allows it).
    if (useSettings.getState().normalize) ensureGraph();
    return;
  }
  const t = g.ctx.currentTime;
  if (!useSettings.getState().normalize) {
    g.norm.gain.setTargetAtTime(1, t, 0.3);
    return;
  }
  if (!buf || buf.length !== g.analyser.fftSize) buf = new Float32Array(g.analyser.fftSize);
  g.analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
  if (db < SILENCE_DB) return; // silence keeps the last correction
  level = level === null ? db : level + (db - level) * 0.08;
  const correction = Math.max(-LIMIT_DB, Math.min(LIMIT_DB, TARGET_DB - level));
  g.norm.gain.setTargetAtTime(10 ** (correction / 20), t, 0.5);
}

setInterval(tick, 250);
