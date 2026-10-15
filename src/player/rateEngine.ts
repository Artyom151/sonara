import { ensureGraph } from './audioGraph';

/**
 * Playback speed through Web Audio, for Linux (WebKitGTK), where the media element cannot change
 * its speed. The whole track is decoded once and played from an AudioBufferSourceNode: its
 * playbackRate changes the speed and the pitch together, like a record. Output goes through the
 * equalizer's graph when it exists, so the EQ keeps working.
 *
 * The engine owns when to start and stop; this module only keeps the buffer, the source and the
 * clock (position = offset + elapsed time × rate).
 */

/** Longer tracks would not fit comfortably in memory as decoded PCM (about 100 MB for 5 minutes). */
export const MAX_RATE_SECONDS = 15 * 60;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let buffer: AudioBuffer | null = null;
let bufferKey = '';
let src: AudioBufferSourceNode | null = null;
let rate = 1;
let volume = 1;
let offset = 0;
let startedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let onEnded: (() => void) | null = null;
let onTick: ((pos: number) => void) | null = null;

function context(): AudioContext {
  if (!ctx) {
    // The equalizer's context when it exists: the buffer then passes through the same graph.
    const g = ensureGraph();
    ctx = g ? g.ctx : new AudioContext();
    out = ctx.createGain();
    out.gain.value = volume;
    out.connect(g ? g.preamp : ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const hasBuffer = (key: string) => buffer !== null && bufferKey === key;
export const isPlaying = () => src !== null;

/** Decode a whole track. Throws when the browser cannot decode it or it is too long. */
export async function load(key: string, blob: Blob): Promise<void> {
  const c = context();
  const pcm = await c.decodeAudioData(await blob.arrayBuffer());
  if (pcm.duration > MAX_RATE_SECONDS) throw new Error(`track is ${Math.round(pcm.duration)} s, speed works up to ${MAX_RATE_SECONDS} s`);
  buffer = pcm;
  bufferKey = key;
}

export function setHandlers(ended: () => void, tick: (pos: number) => void) {
  onEnded = ended;
  onTick = tick;
}

/** Where the sound is now, in track seconds. */
export function position(): number {
  if (!buffer) return offset;
  if (!src || !ctx) return Math.min(buffer.duration, offset);
  return Math.min(buffer.duration, offset + (ctx.currentTime - startedAt) * rate);
}

function stopSource() {
  clearInterval(timer);
  timer = undefined;
  if (src) {
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    src.disconnect();
    src = null;
  }
}

function startSource() {
  if (!buffer) return;
  const c = context();
  const s = c.createBufferSource();
  s.buffer = buffer;
  s.playbackRate.value = rate;
  s.connect(out!);
  s.onended = () => {
    if (src !== s) return;
    offset = 0;
    stopSource();
    onEnded?.();
  };
  s.start(0, offset);
  startedAt = c.currentTime;
  src = s;
  timer = setInterval(() => onTick?.(position()), 250);
}

/** Start from `from` (or from where it was paused). */
export function play(from?: number) {
  if (from !== undefined) offset = Math.min(Math.max(0, from), buffer?.duration ?? 0);
  if (src) return;
  startSource();
}

/** Stop and keep the position. Returns it. */
export function pause(): number {
  const p = position();
  stopSource();
  offset = p;
  return p;
}

/** Jump to `t`; keeps playing if it was playing. */
export function seek(t: number) {
  const wasPlaying = src !== null;
  stopSource();
  offset = Math.min(Math.max(0, t), buffer?.duration ?? 0);
  if (wasPlaying) startSource();
}

/** Change the speed; a playing track restarts from the same place at the new speed. */
export function setRate(r: number) {
  if (r === rate) return;
  const p = position();
  const wasPlaying = src !== null;
  stopSource();
  rate = r;
  offset = p;
  if (wasPlaying) startSource();
}

export function setVolume(v: number) {
  volume = v;
  if (out) out.gain.value = v;
}

/** Forget the buffer (track change, or back to normal speed). */
export function stop() {
  stopSource();
  buffer = null;
  bufferKey = '';
  offset = 0;
}
