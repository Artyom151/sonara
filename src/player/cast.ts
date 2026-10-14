import { registerPlugin } from '@capacitor/core';
import { create } from 'zustand';
import { api } from '../core';
import type { Track } from '../core/types';
import { isAndroid, isTauri } from '../platform';
import { pushNotice, tr } from '../store/islandNotice';
import { usePlayer } from '../store/player';

/**
 * Chromecast. The web player keeps owning the queue; while a device is connected the local
 * <audio> stays paused and the device plays one stream at a time:
 *  - desktop: Cast v2 over TLS in Rust (src-tauri/src/cast.rs), devices found by mDNS;
 *  - Android: the Google Cast SDK (CastPlugin.java) with the system device picker.
 * The device fetches the stream itself, so only network-reachable URLs can be cast: SoundCloud and
 * most YouTube / Deezer links work; downloads and the desktop's loopback media proxy cannot.
 */
export interface CastDevice {
  id: string;
  name: string;
  host?: string;
  port?: number;
  model?: string;
}

type CastState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering';

interface CastStore {
  supported: boolean;
  scanning: boolean;
  devices: CastDevice[];
  connected: CastDevice | null;
  state: CastState;
}

export const useCast = create<CastStore>(() => ({ supported: isTauri || isAndroid, scanning: false, devices: [], connected: null, state: 'idle' }));

export const isCasting = () => useCast.getState().connected !== null;

interface LoadArgs {
  url: string;
  mime: string;
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
  position?: number;
  autoplay: boolean;
}

interface StatusEvent {
  state: string;
  position?: number;
  duration?: number | null;
  idleReason?: string | null;
}

/* ───────── Backends ───────── */

interface CastPlugin {
  /** Shows the system device picker; resolves with the chosen device, or null when dismissed. */
  pick(): Promise<{ id: string; name: string } | null>;
  load(o: LoadArgs): Promise<void>;
  play(o: { on: boolean }): Promise<void>;
  seek(o: { position: number }): Promise<void>;
  volume(o: { volume: number }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(event: 'status', cb: (e: StatusEvent) => void): Promise<{ remove: () => void }>;
  addListener(event: 'closed', cb: () => void): Promise<{ remove: () => void }>;
}

const android = isAndroid ? registerPlugin<CastPlugin>('Cast') : null;

async function invoke<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/* ───────── Public API ───────── */

/** Desktop: look for Chromecasts on the network (a few seconds). */
export async function scan(): Promise<CastDevice[]> {
  if (!isTauri) return [];
  useCast.setState({ scanning: true });
  try {
    const found = await invoke<CastDevice[]>('cast_discover');
    useCast.setState({ devices: found });
    return found;
  } catch {
    return [];
  } finally {
    useCast.setState({ scanning: false });
  }
}

/** Android: the system picker; desktop: connect to a device from `scan`. */
export async function connect(device?: CastDevice): Promise<boolean> {
  try {
    let d: CastDevice | null = device ?? null;
    if (android) {
      const picked = await android.pick();
      // Dismissing the picker resolves with an empty object.
      if (!picked?.id) return false;
      d = picked;
    } else if (isTauri && device?.host) {
      await invoke('cast_connect', { host: device.host, port: device.port ?? 8009 });
    } else return false;
    useCast.setState({ connected: d, state: 'loading' });
    pushNotice({ kind: 'online', text: tr('Casting to', 'Трансляция на'), detail: d!.name });
    // Move what is playing to the device.
    const st = usePlayer.getState();
    const t = st.queue[st.index];
    window.dispatchEvent(new Event('sonara-cast'));
    if (t) await castTrack(t, st.position, st.playing);
    return true;
  } catch (e) {
    console.warn('[cast]', e);
    pushNotice({ kind: 'warn', text: tr('Cannot connect', 'Не удалось подключиться'), detail: String((e as Error)?.message ?? e).slice(0, 60) });
    return false;
  }
}

export async function disconnect() {
  const was = useCast.getState().connected;
  useCast.setState({ connected: null, state: 'idle' });
  try {
    if (android) await android.disconnect();
    else await invoke('cast_disconnect');
  } catch {
    /* already gone */
  }
  if (was) {
    pushNotice({ kind: 'queue', text: tr('Back to this device', 'Играет на этом устройстве') });
    window.dispatchEvent(new Event('sonara-cast-end'));
  }
}

/** Resolve a stream the device can fetch and load it. Resolves false when the track cannot be cast. */
export async function castTrack(track: Track, position = 0, autoplay = true): Promise<boolean> {
  if (!isCasting()) return false;
  try {
    useCast.setState({ state: 'loading' });
    const s = await api.stream(track);
    if (!/^https?:\/\//.test(s.url) || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(s.url)) throw new Error('local url');
    const args: LoadArgs = {
      url: s.url,
      mime: s.kind === 'hls' ? 'application/x-mpegURL' : (s.mime?.split(';')[0] ?? 'audio/mpeg'),
      title: track.title,
      artist: track.artist,
      artwork: track.artworkLarge ?? track.artwork,
      duration: track.duration || undefined,
      position,
      autoplay,
    };
    if (android) await android.load(args);
    else await invoke('cast_load', { args });
    return true;
  } catch (e) {
    console.warn('[cast] load', track.title, e);
    pushNotice({ kind: 'warn', text: tr('Cannot cast this track', 'Этот трек нельзя транслировать'), detail: track.title });
    useCast.setState({ state: 'idle' });
    return false;
  }
}

export const castSetPlaying = (on: boolean) => {
  if (!isCasting()) return;
  const p = android ? android.play({ on }) : invoke('cast_play', { on });
  void p.catch(() => {});
};
export const castSeek = (position: number) => {
  if (!isCasting()) return;
  void (android ? android.seek({ position }) : invoke('cast_seek', { position })).catch(() => {});
};
export const castSetVolume = (volume: number) => {
  if (!isCasting()) return;
  void (android ? android.volume({ volume }) : invoke('cast_volume', { volume })).catch(() => {});
};

/* ───────── Receiver events ───────── */

function onStatus(e: StatusEvent) {
  const state = (e.state === 'playing' || e.state === 'paused' || e.state === 'buffering' ? e.state : 'idle') as CastState;
  useCast.setState({ state });
  const p = usePlayer.getState();
  const patch: Partial<{ position: number; duration: number; playing: boolean; loading: boolean }> = { loading: state === 'buffering' };
  if (typeof e.position === 'number' && state !== 'idle') patch.position = e.position;
  if (e.duration) patch.duration = e.duration;
  if (state === 'playing' && !p.playing) patch.playing = true;
  if (state === 'paused' && p.playing) patch.playing = false;
  if (Object.keys(patch).length) p.patch(patch);
  if (state === 'idle' && e.idleReason === 'finished') p.next(true);
  if (state === 'idle' && e.idleReason === 'error') {
    pushNotice({ kind: 'warn', text: tr('The device cannot play this track', 'Устройство не может воспроизвести трек') });
    p.next(true);
  }
}

function onClosed() {
  if (!isCasting()) return;
  useCast.setState({ connected: null, state: 'idle' });
  pushNotice({ kind: 'offline', text: tr('Cast connection lost', 'Связь с устройством потеряна') });
  window.dispatchEvent(new Event('sonara-cast-end'));
}

if (isTauri) {
  void (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<StatusEvent>('cast-status', (e) => onStatus(e.payload));
    await listen('cast-closed', onClosed);
  })();
} else if (android) {
  void android.addListener('status', onStatus).catch(() => {});
  void android.addListener('closed', onClosed).catch(() => {});
}

// The device reports its position every few seconds: keep the progress bar moving in between.
setInterval(() => {
  if (useCast.getState().state !== 'playing') return;
  const p = usePlayer.getState();
  if (p.playing) p.patch({ position: Math.min(p.duration || Infinity, p.position + 0.5) });
}, 500);
