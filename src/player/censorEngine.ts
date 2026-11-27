import { api } from '../core';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { ensureGraph, getGraph } from './audioGraph';
import { censorIntervals, isCensoredAt, type CensorInterval } from './censor';

let intervals: CensorInterval[] = [];
let muted = false;

function apply(mute: boolean) {
  if (muted === mute) return;
  muted = mute;
  const graph = getGraph();
  if (!graph) return;
  graph.censor.gain.setTargetAtTime(mute ? 0 : 1, graph.ctx.currentTime, mute ? 0.018 : 0.065);
}

function update() {
  const enabled = useSettings.getState().censor;
  const position = usePlayer.getState().position;
  apply(enabled && isCensoredAt(intervals, position));
}

let trackKey = '';
usePlayer.subscribe((state) => {
  const track = state.queue[state.index];
  if (!track || track.key === trackKey) return;
  trackKey = track.key;
  intervals = [];
  apply(false);
  void api.lyrics(track).then((lyrics) => {
    if (trackKey !== track.key || !lyrics?.synced) return;
    intervals = censorIntervals(lyrics.synced, state.duration || track.duration || Infinity);
    update();
  }).catch(() => {});
});

useSettings.subscribe((state, previous) => {
  if (state.censor === previous.censor) return;
  if (state.censor) ensureGraph();
  if (!state.censor) apply(false);
  update();
});

if (useSettings.getState().censor) ensureGraph();
setInterval(update, 40);
