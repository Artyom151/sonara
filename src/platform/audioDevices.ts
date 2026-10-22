import { registerPlugin } from '@capacitor/core';
import { create } from 'zustand';
import { useSettings } from '../store/settings';
import { isAndroid, isTauri } from '.';
import { headphoneImage } from './headphoneImages';
import { cleanName, headphoneModel, NOT_HEADPHONES, type DeviceKind, type HeadphoneModel } from './headphones';

export type { HeadphoneModel };

/**
 * "Headphones connected" for the island player, like iOS: the island grows into a card with the
 * headphones' picture, their name and a battery ring, then shrinks back to the track.
 *
 * Sources:
 *  - Android: AudioDevicesPlugin.java (audio route callback; battery from the Bluetooth stack);
 *  - Linux: BlueZ over D-Bus (src-tauri/src/audio_devices.rs: Device1.Connected, Battery1);
 *  - Windows: the default output device switching to headphones (name only, no battery).
 * Only listens while the island player is on.
 */

export interface AudioDevice {
  /** Stable per device (Bluetooth address / BlueZ path / endpoint id). */
  id: string;
  name: string;
  model: HeadphoneModel;
  /** Official product photo (headphoneImages.ts), null: use the drawing. */
  image: string | null;
  /** 0–100, null when the device does not report it. */
  battery: number | null;
  /** Bumps on every connect, so the same headphones reconnecting show again. */
  at: number;
}

/** What a platform reports. `kind` helps when the name says nothing ("Headset"). */
export interface DeviceEvent {
  id: string;
  name: string;
  kind?: DeviceKind;
  battery?: number | null;
}

interface DeviceState {
  current: AudioDevice | null;
  show: (e: DeviceEvent) => void;
  battery: (id: string, level: number) => void;
  dismiss: () => void;
}

const valid = (n: number | null | undefined) => (typeof n === 'number' && n >= 0 && n <= 100 ? Math.round(n) : null);

export const useAudioDevice = create<DeviceState>((set, get) => ({
  current: null,
  show(e) {
    if (e.kind === 'default-output' && NOT_HEADPHONES.test(e.name)) return;
    const name = cleanName(e.name);
    const prev = get().current;
    // A2DP and the headset profile arrive as two routes of one device within a second: one card.
    if (prev && prev.id === e.id && Date.now() - prev.at < 3000) {
      if (valid(e.battery) !== null) set({ current: { ...prev, battery: valid(e.battery) } });
      return;
    }
    set({ current: { id: e.id, name, model: headphoneModel(name, e.kind), image: headphoneImage(name), battery: valid(e.battery), at: Date.now() } });
  },
  battery(id, level) {
    const cur = get().current;
    if (cur && cur.id === id && valid(level) !== null) set({ current: { ...cur, battery: valid(level) } });
  },
  dismiss: () => set({ current: null }),
}));

// Platform hookups

interface AudioDevicesPlugin {
  start(): Promise<{ battery: boolean }>;
  stop(): Promise<void>;
  addListener(event: 'connected', cb: (e: DeviceEvent) => void): Promise<{ remove: () => void }>;
  addListener(event: 'battery', cb: (e: { id: string; level: number }) => void): Promise<{ remove: () => void }>;
}

let stopCurrent: (() => void) | null = null;

async function startAndroid() {
  const plugin = registerPlugin<AudioDevicesPlugin>('AudioDevices');
  const a = await plugin.addListener('connected', (e) => useAudioDevice.getState().show(e));
  const b = await plugin.addListener('battery', (e) => useAudioDevice.getState().battery(e.id, e.level));
  await plugin.start();
  return () => {
    a.remove();
    b.remove();
    void plugin.stop();
  };
}

async function startDesktop() {
  const { listen } = await import('@tauri-apps/api/event');
  const { invoke } = await import('@tauri-apps/api/core');
  const un1 = await listen<DeviceEvent>('audio-device', (e) => useAudioDevice.getState().show(e.payload));
  const un2 = await listen<{ id: string; level: number }>('audio-battery', (e) => useAudioDevice.getState().battery(e.payload.id, e.payload.level));
  await invoke('audio_devices_watch', { on: true });
  return () => {
    un1();
    un2();
    void invoke('audio_devices_watch', { on: false });
  };
}

function sync(on: boolean) {
  if (on && !stopCurrent) {
    const starting = (isAndroid ? startAndroid() : startDesktop()).catch((e) => {
      console.warn('[audio-devices]', e);
      return () => {};
    });
    stopCurrent = () => void starting.then((stop) => stop());
  } else if (!on && stopCurrent) {
    stopCurrent();
    stopCurrent = null;
    useAudioDevice.getState().dismiss();
  }
}

if (isAndroid || isTauri) {
  sync(useSettings.getState().islandPlayer);
  useSettings.subscribe((s, prev) => {
    if (s.islandPlayer !== prev.islandPlayer) sync(s.islandPlayer);
  });
}

// Dev only, opt-in (VITE_FAKE_FEEDS=1): scripts/fake-headphones.mjs serves one pretend "headphones connected"
// event here; each run of the script (a new nonce) shows it in the running app, no restart needed.
if (import.meta.env?.DEV && import.meta.env.VITE_FAKE_FEEDS) {
  let lastNonce: unknown;
  setInterval(async () => {
    if (!useSettings.getState().islandPlayer) return;
    try {
      const j = await (await fetch('http://127.0.0.1:8788/')).json();
      if (j.nonce === lastNonce) return;
      const first = lastNonce === undefined;
      lastNonce = j.nonce;
      // A feed left over from before this page loaded is not a new connection.
      if (!first || Date.now() - j.nonce < 5000) useAudioDevice.getState().show(j);
    } catch {
      /* no fake feed running */
    }
  }, 1500);
}
