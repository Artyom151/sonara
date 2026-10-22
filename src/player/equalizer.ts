import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAudioDevice } from '../platform/audioDevices';
import { usePlayer } from '../store/player';
import { ensureGraph, getGraph } from './audioGraph';
import type { Track } from '../core/types';
import { adaptivePreset, BANDS, deviceKey, EQ_PRESETS, EQ_RANGE, type EqPresetId, type FixedPresetId } from './eqCurves';

export { BANDS, deviceKey, EQ_PRESETS, EQ_RANGE };
export type { EqPresetId, FixedPresetId };

/**
 * Ten-band equalizer (31 Hz … 16 kHz, ±12 dB) with a preamp, presets and a saved profile per
 * headphone model: connect AirPods and their curve comes back, connect the speaker and it flips.
 */
export interface EqCurve {
  preset: EqPresetId;
  gains: number[];
  preamp: number;
}

interface EqState extends EqCurve {
  enabled: boolean;
  /** Curves per headphone model (normalised device name). */
  profiles: Record<string, EqCurve>;
  /** Remember the curve for the connected headphones and restore it on their next connection. */
  perDevice: boolean;
  setEnabled: (v: boolean) => void;
  /** Adaptive: the preset that matches the track playing now (null when not adaptive). */
  resolved: FixedPresetId | null;
  setPreset: (p: Exclude<EqPresetId, 'custom'>) => void;
  /** Adaptive mode: pick the curve for this track. */
  followTrack: (t: Track) => void;
  setBand: (i: number, db: number) => void;
  setPreamp: (db: number) => void;
  setPerDevice: (v: boolean) => void;
  reset: () => void;
}

const clamp = (v: number) => Math.max(-EQ_RANGE, Math.min(EQ_RANGE, v));
/** The preamp drops with the boost of a preset so it does not clip. */
const presetPreamp = (p: FixedPresetId) => (p === 'flat' ? 0 : -Math.max(...EQ_PRESETS[p]) / 2);

export const useEq = create<EqState>()(
  persist(
    (set, get) => ({
      enabled: false,
      preset: 'flat',
      gains: EQ_PRESETS.flat.slice(),
      preamp: 0,
      profiles: {},
      perDevice: true,
      setEnabled: (enabled) => set({ enabled }),
      resolved: null,
      setPreset: (p) => {
        if (p === 'adaptive') {
          set({ preset: 'adaptive', resolved: null });
          // Apply to the track that is already playing, not only to the next one.
          const cur = usePlayer.getState().current();
          if (cur) get().followTrack(cur);
          return;
        }
        set({ preset: p, resolved: null, gains: EQ_PRESETS[p].slice(), preamp: presetPreamp(p) });
      },
      followTrack: (t) => {
        if (get().preset !== 'adaptive') return;
        // Sources without genres and tags (YouTube, Deezer) fall back to the title.
        const words = t.genre || t.tags?.length ? [t.genre, ...(t.tags ?? [])] : [t.title];
        const p = adaptivePreset(words);
        set({ resolved: p, gains: EQ_PRESETS[p].slice(), preamp: presetPreamp(p) });
      },
      setBand: (i, db) =>
        set((s) => {
          const gains = s.gains.slice();
          gains[i] = clamp(Math.round(db * 2) / 2);
          return { gains, preset: 'custom' };
        }),
      setPreamp: (db) => set({ preamp: clamp(db), preset: get().preset }),
      setPerDevice: (perDevice) => set({ perDevice }),
      reset: () => set({ preset: 'flat', gains: EQ_PRESETS.flat.slice(), preamp: 0 }),
    }),
    {
      name: 'sonara.eq',
      partialize: (s) => ({ enabled: s.enabled, preset: s.preset, gains: s.gains, preamp: s.preamp, profiles: s.profiles, perDevice: s.perDevice }),
    },
  ),
);

/** Push the current curve into the audio graph (no-op until the graph exists). */
export function applyEq() {
  const s = useEq.getState();
  const g = getGraph();
  if (!g) return;
  const t = g.ctx.currentTime;
  // The preamp drops with boosted bands so a bass boost does not clip.
  const gains = s.enabled ? s.gains : s.gains.map(() => 0);
  const pre = s.enabled ? s.preamp : 0;
  g.preamp.gain.setTargetAtTime(10 ** (pre / 20), t, 0.03);
  g.bands.forEach((b, i) => b.gain.setTargetAtTime(gains[i] ?? 0, t, 0.03));
}

// Turning it on builds the graph on native shells (the web already has it from the first gesture).
useEq.subscribe((s, prev) => {
  if (s.enabled && !getGraph()) ensureGraph();
  applyEq();
  // Remember the curve of the headphones that are connected right now.
  const dev = useAudioDevice.getState().current;
  if (s.perDevice && dev && (s.gains !== prev.gains || s.preamp !== prev.preamp || s.preset !== prev.preset)) {
    const key = deviceKey(dev.name);
    useEq.setState((x) => ({ profiles: { ...x.profiles, [key]: { preset: s.preset, gains: s.gains, preamp: s.preamp } } }), false);
  }
});

// A known pair of headphones connects: restore its curve.
let lastDevice = '';
useAudioDevice.subscribe((s) => {
  const dev = s.current;
  if (!dev || dev.at === Number(lastDevice)) return;
  lastDevice = String(dev.at);
  const eq = useEq.getState();
  const curve = eq.perDevice ? eq.profiles[deviceKey(dev.name)] : undefined;
  if (curve) useEq.setState({ ...curve, enabled: true });
});

// Apply the saved curve as soon as the graph appears.
if (useEq.getState().enabled) ensureGraph();
setTimeout(applyEq, 0);
