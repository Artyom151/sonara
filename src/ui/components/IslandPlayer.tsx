import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { setVolume, togglePlay } from '../../player/engine';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { useT } from '../i18n';
import {
  IconBackward,
  IconForward,
  IconHeart,
  IconPause,
  IconPlay,
  IconQueue,
  IconQuote,
  IconRepeat,
  IconShuffle,
  IconSpeaker,
  IconSpeakerLow,
} from '../icons';
import { Art, Marquee, Slider } from './controls';
import { Scrubber } from './Player';
import { IslandUpdate } from './UpdateNotice';
import { usePendingUpdate } from '../../platform/updates';
import { useAudioDevice, type AudioDevice } from '../../platform/audioDevices';
import { BatteryRing, HeadphoneArt } from './HeadphoneArt';
import { IslandChips, IslandNoticeView } from './IslandNotice';
import { useIslandNotice } from '../../store/islandNotice';
import { EqBars } from './TrackRow';

const spring = { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 } as const;

/**
 * Now playing as a Dynamic Island-style pill at the top (Settings → Island player).
 * Phone layout: replaces the mini player above the tab bar.
 * Desktop layout: sits in the title bar and replaces the bottom player bar.
 * Tap: expands into a live-activity card with controls; tap the art/title: full player.
 * Collapses by itself after a few idle seconds (desktop: while the pointer is outside).
 * A new release takes the island for a few seconds (tap: Download / Later), then the track returns.
 * Headphones connecting take it for 4.5 s: picture, name and battery ring (platform/audioDevices.ts).
 */
export function IslandPlayer({ desktop = false }: { desktop?: boolean }) {
  const t = useT();
  const track = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const expanded = usePlayer((s) => s.expanded);
  const [open, setOpen] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = useRef(false);

  const touch = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => !hover.current && setOpen(false), desktop ? 2500 : 6000);
  };
  useEffect(() => () => void (idle.current && clearTimeout(idle.current)), []);
  useEffect(() => {
    if (open) touch();
  }, [open]);

  // Update: shown until tapped away, or for 10 s when ignored (then only in Settings this session).
  const update = usePendingUpdate();
  const [seen, setSeen] = useState<string | null>(null);
  const showUpdate = !!update && seen !== update.version;
  useEffect(() => {
    if (!update || open) return;
    const t = setTimeout(() => setSeen(update.version), 10_000);
    return () => clearTimeout(t);
  }, [update, open]);

  // Headphones connected: the island grows into an iOS-style card for a few seconds, over
  // everything (even the full-screen player), then shrinks back to the track.
  const device = useAudioDevice((s) => s.current);
  useEffect(() => {
    if (!device) return;
    setOpen(false);
    const t = setTimeout(() => useAudioDevice.getState().dismiss(), 4500);
    return () => clearTimeout(t);
  }, [device?.at]);

  // Short banners (no connection, similar tracks added…) take the island for a moment.
  const notice = useIslandNotice((s) => s.current);
  const mode = device ? 'device' : expanded ? null : notice ? 'notice' : showUpdate ? 'update' : track ? 'player' : null;
  // One element for every state, so the island morphs between them (layout spring) like iOS.
  if (!mode) return null;

  const openPlayer = () => (setOpen(false), usePlayer.getState().setExpanded(true));
  const radius = mode === 'device' ? (desktop ? 26 : 32) : open && mode !== 'notice' ? (desktop ? 28 : 34) : desktop ? 17 : 22;
  const closeUpdate = () => (setOpen(false), update && setSeen(update.version));

  return (
    <>
      <AnimatePresence>
        {open && mode !== 'device' && mode !== 'notice' && (
          <motion.div
            className="island-scrim"
            initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
            animate={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
            exit={{ backgroundColor: 'rgba(0,0,0,0)' }}
            onClick={mode === 'update' ? closeUpdate : () => setOpen(false)}
          />
        )}
      </AnimatePresence>
      <motion.div
        className={`island is-${mode} ${open && mode !== 'device' && mode !== 'notice' ? 'open' : ''} ${desktop ? 'desk' : ''}`}
        layout
        transition={spring}
        style={{ borderRadius: radius }}
        onClick={() => (mode === 'device' ? useAudioDevice.getState().dismiss() : mode === 'notice' ? useIslandNotice.getState().clear() : !open && setOpen(true))}
        onPointerDown={mode === 'player' ? touch : undefined}
        onPointerEnter={() => mode === 'player' && ((hover.current = true), idle.current && clearTimeout(idle.current))}
        onPointerLeave={() => mode === 'player' && ((hover.current = false), open && touch())}
      >
        {mode === 'device' && device ? (
          <IslandDevice key={`device-${device.at}`} device={device} desktop={desktop} />
        ) : mode === 'notice' && notice ? (
          <IslandNoticeView notice={notice} />
        ) : mode === 'update' && update ? (
          <IslandUpdate info={update} open={open} />
        ) : track ? (
          <>
          {!open ? (
            <motion.div key="compact" className="island-compact" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div layoutId="island-art" className="island-art small">
                <Art src={track.artwork} seed={track.key} />
              </motion.div>
              <Marquee className="island-line" text={`${track.title} · ${track.artist}`} />
              <IslandChips />
              <EqBars paused={!playing} />
            </motion.div>
          ) : (
            <motion.div key="expanded" className="island-expanded" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.08 } }}>
              <div className="island-head">
                <motion.div layoutId="island-art" className="island-art" onClick={openPlayer}>
                  <Art src={track.artwork} seed={track.key} />
                </motion.div>
                <div className="island-meta" onClick={openPlayer}>
                  <Marquee className="island-title" text={track.title} />
                  <div className="island-artist">{track.artist}</div>
                </div>
                {desktop ? <IslandExtras /> : <EqBars paused={!playing} />}
              </div>
              <Scrubber />
              <div className="island-controls">
                {desktop && <ShuffleButton />}
                <button aria-label={t('previous')} onClick={() => (touch(), usePlayer.getState().prev())}>
                  <IconBackward size={26} />
                </button>
                <button className="island-play" aria-label={playing ? t('pause') : t('play')} onClick={() => (touch(), togglePlay())}>
                  {loading && playing ? <span className="spinner" /> : playing ? <IconPause size={26} /> : <IconPlay size={26} />}
                </button>
                <button aria-label={t('nextTrack')} onClick={() => (touch(), usePlayer.getState().next())}>
                  <IconForward size={26} />
                </button>
                {desktop && <RepeatButton />}
              </div>
              {desktop && <IslandVolume />}
            </motion.div>
          )}
          </>
        ) : null}
      </motion.div>
    </>
  );
}

/** The official photo of the model, or our drawing when there is none or it does not load. */
function DevicePicture({ device, size }: { device: AudioDevice; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!device.image || failed) return <HeadphoneArt model={device.model} size={size} />;
  return <img className="island-device-photo" src={device.image} alt="" width={size} height={size} draggable={false} onError={() => setFailed(true)} />;
}

/** "Connected" card: the headphones' picture springs in, name, battery ring on the right. */
function IslandDevice({ device, desktop }: { device: AudioDevice; desktop: boolean }) {
  const t = useT();
  return (
    <motion.div className="island-device" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.2 } }}>
      <motion.div
        className="island-device-art"
        initial={{ scale: 0.4, rotate: -16, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.14 }}
      >
        <DevicePicture device={device} size={desktop ? 36 : 46} />
      </motion.div>
      <div className="island-device-text">
        <small>{t('headphonesConnected')}</small>
        <b>{device.name}</b>
      </div>
      <AnimatePresence>
        {device.battery != null && (
          <motion.div className="island-device-battery" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.18 }}>
            <BatteryRing level={device.battery} size={desktop ? 30 : 36} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ShuffleButton() {
  const t = useT();
  const shuffle = usePlayer((s) => s.shuffle);
  return (
    <button className={`island-small ${shuffle ? 'on' : ''}`} aria-label={t('shuffle')} onClick={() => usePlayer.getState().toggleShuffle()}>
      <IconShuffle size={18} />
    </button>
  );
}

function RepeatButton() {
  const t = useT();
  const repeat = usePlayer((s) => s.repeat);
  return (
    <button className={`island-small ${repeat !== 'off' ? 'on' : ''}`} aria-label={t('repeat')} onClick={() => usePlayer.getState().cycleRepeat()}>
      <IconRepeat size={18} one={repeat === 'one'} />
    </button>
  );
}

/** Desktop: like, lyrics and queue next to the title (the player bar is hidden in island mode). */
function IslandExtras() {
  const t = useT();
  const track = usePlayer((s) => s.queue[s.index]);
  const liked = useLibrary((s) => (track ? s.likes.some((x) => x.key === track.key) : false));
  if (!track) return null;
  return (
    <div className="island-extras">
      <button className={`island-small ${liked ? 'liked' : ''}`} aria-label={t('like')} onClick={() => useLibrary.getState().toggleLike(track)}>
        <IconHeart size={18} filled={liked} />
      </button>
      <button
        className="island-small"
        aria-label={t('lyrics')}
        onClick={() => {
          useSettings.getState().set({ lyricsPanel: true });
          usePlayer.getState().setExpanded(true);
        }}
      >
        <IconQuote size={18} />
      </button>
      <button className="island-small" aria-label={t('queue')} onClick={() => useUi.getState().open({ type: 'queue' })}>
        <IconQueue size={18} />
      </button>
    </div>
  );
}

function IslandVolume() {
  const t = useT();
  const volume = usePlayer((s) => s.volume);
  return (
    <div className="island-volume">
      <Slider
        value={volume}
        onChange={setVolume}
        left={
          <button className="island-small" aria-label={t('volume')} onClick={() => setVolume(volume > 0 ? 0 : 1)}>
            {volume < 0.4 ? <IconSpeakerLow size={16} /> : <IconSpeaker size={16} />}
          </button>
        }
      />
    </div>
  );
}
