import { ensureGraph, getGraph } from './audioGraph';
import { useSettings } from '../store/settings';

/**
 * Karaoke: the vocals are mostly in the centre of a stereo mix, so the difference of the channels
 * takes most of them out. Switching it on moves the output to that difference (mono); the
 * levelling and the equalizer still apply. Bass and drums in the centre are reduced too.
 */
function apply() {
  const on = useSettings.getState().karaoke;
  if (on && !getGraph()) ensureGraph();
  const g = getGraph();
  if (!g) return;
  const t = g.ctx.currentTime;
  const amount = Math.min(1, Math.max(0, useSettings.getState().karaokeAmount));
  g.dry.gain.setTargetAtTime(on ? 1 - amount : 1, t, 0.05);
  g.kwet.gain.setTargetAtTime(on ? amount : 0, t, 0.05);
}

useSettings.subscribe((s, prev) => {
  if (s.karaoke !== prev.karaoke || s.karaokeAmount !== prev.karaokeAmount) apply();
});
