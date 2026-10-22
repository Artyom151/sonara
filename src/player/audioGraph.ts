import { isNative } from '../platform';
import { audio } from './element';

/**
 * One Web Audio graph for the single <audio> element: source → preamp → 10 EQ bands → analyser → output.
 * A media element can be routed through Web Audio only once, so the equalizer and the visual
 * analyser share this graph. The element already loads with `crossOrigin = 'anonymous'`, so routing
 * it adds no CORS requirement.
 *
 * Web (and desktop): created on the first gesture, so the visuals work. Android / native shells:
 * only when the equalizer is switched on (some platforms may suspend Web Audio in the background).
 */
export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export interface Graph {
  ctx: AudioContext;
  preamp: GainNode;
  bands: BiquadFilterNode[];
  analyser: AnalyserNode;
  /** Loudness levelling (player/normalize.ts): a gain after the equalizer. */
  norm: GainNode;
}

let graph: Graph | null = null;
let failed = false;
const readyListeners = new Set<(g: Graph) => void>();

/** Runs `fn` with the graph now and whenever it gets built (the equalizer applies its curve this way). */
export function onGraphReady(fn: (g: Graph) => void) {
  readyListeners.add(fn);
  if (graph) fn(graph);
}

export function getGraph(): Graph | null {
  return graph;
}

/** Build the graph (idempotent). Call from a user gesture where possible. */
export function ensureGraph(): Graph | null {
  if (graph || failed) return graph;
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    const preamp = ctx.createGain();
    const bands = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      b.gain.value = 0;
      return b;
    });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    let node: AudioNode = src.connect(preamp);
    for (const b of bands) node = node.connect(b);
    node.connect(analyser);
    const norm = ctx.createGain();
    analyser.connect(norm);
    norm.connect(ctx.destination);
    graph = { ctx, preamp, bands, analyser, norm };
    for (const fn of readyListeners) fn(graph);
    // Keep it running: the context starts suspended until a gesture and may be suspended by the OS.
    const resume = () => void ctx.resume().catch(() => {});
    audio.addEventListener('play', resume);
    ctx.addEventListener('statechange', () => ctx.state === 'suspended' && !audio.paused && resume());
    resume();
  } catch (e) {
    console.warn('[audio-graph]', e);
    failed = true;
    graph = null;
  }
  return graph;
}

// Web: the first gesture unlocks audio and starts the graph (as the analyser always did).
if (!isNative) {
  const once = () => {
    ensureGraph();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}
