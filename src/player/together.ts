import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../account/remote';
import type { Track } from '../core/types';
import { usePlayer } from '../store/player';
import { seek } from './engine';

/**
 * Listen together: the host's player is the source. Its state (track, position, paused or playing)
 * goes to a Supabase Realtime broadcast channel named after the room code; guests follow it. Guests
 * do not send anything, so the host always decides what plays. Needs Realtime enabled in the project;
 * no database table is used.
 */
export type Role = 'host' | 'guest';

interface StateMsg {
  track: Track | null;
  position: number;
  playing: boolean;
  /** When the host sent it (ms, the host's clock): guests add the time since then to the position. */
  sentAt: number;
}

interface TogetherState {
  role: Role | null;
  code: string | null;
  start: (role: Role, code?: string) => Promise<void>;
  leave: () => void;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const channelName = (code: string) => `sonara-together-${code}`;

let channel: RealtimeChannel | null = null;
let stopHost: (() => void) | null = null;

/** Host: send the state now and after every change, plus a heartbeat while playing. */
function hostLoop(ch: RealtimeChannel) {
  const send = () => {
    const s = usePlayer.getState();
    const msg: StateMsg = { track: s.queue[s.index] ?? null, position: s.position, playing: s.playing, sentAt: Date.now() };
    void ch.send({ type: 'broadcast', event: 'state', payload: msg });
  };
  let lastKey = '';
  let lastPlaying = false;
  let lastPos = 0;
  let lastSent = 0;
  send();
  lastSent = Date.now();
  lastPos = usePlayer.getState().position;
  lastPlaying = usePlayer.getState().playing;
  const unsub = usePlayer.subscribe((s) => {
    const key = s.queue[s.index]?.key ?? '';
    // A seek shows up as a position that is not where playback would have put it.
    const expected = lastPos + (lastPlaying ? (Date.now() - lastSent) / 1000 : 0);
    const seeked = Math.abs(s.position - expected) > 2;
    if (key !== lastKey || s.playing !== lastPlaying || seeked) {
      lastKey = key;
      lastPlaying = s.playing;
      lastPos = s.position;
      lastSent = Date.now();
      send();
    }
  });
  const beat = setInterval(() => {
    if (usePlayer.getState().playing) {
      lastPos = usePlayer.getState().position;
      lastSent = Date.now();
      lastPlaying = true;
      send();
    }
  }, 5000);
  return () => {
    unsub();
    clearInterval(beat);
  };
}

/** Guest: apply the host's state. A different track replaces the queue; the position is corrected when it drifts. */
function apply(m: StateMsg) {
  if (!m.track) return;
  const s = usePlayer.getState();
  if (s.queue[s.index]?.key !== m.track.key) {
    s.playQueue([m.track], 0, { title: 'Listen together' });
    return;
  }
  const target = m.position + (m.playing ? (Date.now() - m.sentAt) / 1000 : 0);
  if (Math.abs(s.position - target) > 1.5) seek(target);
  if (s.playing !== m.playing) s.patch({ playing: m.playing });
}

export const useTogether = create<TogetherState>()((set, get) => ({
  role: null,
  code: null,
  async start(role, code) {
    if (!supabase) throw new Error('offline');
    get().leave();
    const room = role === 'host' ? newCode() : (code ?? '').trim().toUpperCase();
    if (!room) throw new Error('no-code');
    const ch = supabase.channel(channelName(room), { config: { broadcast: { self: false } } });
    if (role === 'guest') ch.on('broadcast', { event: 'state' }, ({ payload }) => apply(payload as StateMsg));
    await new Promise<void>((resolve, reject) => {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
    });
    channel = ch;
    if (role === 'host') stopHost = hostLoop(ch);
    set({ role, code: room });
  },
  leave() {
    stopHost?.();
    stopHost = null;
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
    set({ role: null, code: null });
  },
}));
