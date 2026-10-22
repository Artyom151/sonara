import { animate, AnimatePresence, motion, useDragControls, useMotionValue, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CommentsPanel, useComments } from '../account/Comments';
import { goToArtist } from '../artists';
import type { Lyrics, Track } from '../../core/types';
import { setVolume, togglePlay } from '../../player/engine';
import { likePulse } from '../../player/likePulse';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { imageColors, playerBackdrop } from '../../theme/color';
import { shareTrack } from '../components/actions';
import { CastButton } from '../components/CastButton';
import { Art, Marquee, Segmented, Slider } from '../components/controls';
import { SpeedControl } from '../components/SpeedControl';
import { SourceMark } from '../components/TrackRow';
import { fmtTime, useT } from '../i18n';
import {
  IconBackward,
  IconBan,
  IconChevronDown,
  IconComment,
  IconForward,
  IconHeart,
  IconMore,
  IconMusic,
  IconPause,
  IconPlay,
  IconPlus,
  IconQueue,
  IconQuote,
  IconRepeat,
  IconShare,
  IconShuffle,
  IconSpeaker,
  IconSpeakerLow,
} from '../icons';
import { useDesktop } from '../useMedia';
import { LikedBy } from './LikedBy';
import { LyricLine, LyricsView, useLyrics } from './Lyrics';
import { Scrubber, TimeCode } from './Scrubber';

type View = 'cover' | 'lyrics' | 'comments';
type Panel = 'queue' | 'about' | 'lyrics';

export function usePlayerColors(track?: Track) {
  const [colors, setColors] = useState(() => playerBackdrop([]));
  useEffect(() => {
    let alive = true;
    void imageColors(track?.artwork).then((c) => alive && setColors(playerBackdrop(c)));
    return () => {
      alive = false;
    };
  }, [track?.artwork]);
  return colors;
}

/** The tracks after the current one; a tap jumps there. The full editor is the queue sheet. */
function UpNext() {
  const t = useT();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const open = useUi((s) => s.open);
  const next = queue.slice(index + 1, index + 30);
  return (
    <div className="pl-upnext">
      {next.length ? (
        next.map((x, i) => (
          <button key={`${x.key}-${i}`} className="pl-upnext-row" onClick={() => usePlayer.getState().jump(index + 1 + i)}>
            <Art src={x.artwork} seed={x.key} />
            <span>
              <b>{x.title}</b>
              <small>{x.artist}</small>
            </span>
            <em>{fmtTime(x.duration)}</em>
          </button>
        ))
      ) : (
        <p className="pl-empty">{t('queueEmpty')}</p>
      )}
      <button className="pl-link" onClick={() => open({ type: 'queue' })}>
        {t('openQueue')}
      </button>
    </div>
  );
}

function About({ track }: { track: Track }) {
  const t = useT();
  const context = usePlayer((s) => s.context);
  return (
    <div className="pl-about">
      <dl>
        <dt>{t('playingFrom')}</dt>
        <dd>{context.title || t('playlistOfTheDay')}</dd>
        <dt>{t('source')}</dt>
        <dd>
          <SourceMark source={track.source} /> {track.source}
        </dd>
        <dt>{t('length')}</dt>
        <dd>{fmtTime(track.duration)}</dd>
      </dl>
      <LikedBy track={track} />
    </div>
  );
}

function PanelBody({ panel, track, lyrics }: { panel: Panel; track: Track; lyrics: Lyrics | null | undefined }) {
  switch (panel) {
    case 'queue':
      return <UpNext />;
    case 'about':
      return <About track={track} />;
    case 'lyrics':
      return <LyricsView lyrics={lyrics} className="pl-lyrics" />;
  }
}

function PanelTab({ icon, label, active, onClick }: { icon: ReactNode; label: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button className={`pl-tab glass glass-press ${active ? 'on' : ''}`} onClick={onClick}>
      {icon}
      <span className="pl-tab-label">{label}</span>
      <IconChevronDown size={13} className="pl-tab-chevron" />
    </button>
  );
}

/** Actions floating on the right of the cover. */
function Rail({ track }: { track: Track }) {
  const t = useT();
  const open = useUi((s) => s.open);
  const liked = useLibrary((s) => s.likes.some((x) => x.key === track.key));
  const disliked = useLibrary((s) => s.dislikes.includes(track.key));
  return (
    <div className="pl-rail glass">
      <button className={`pl-rail-btn ${liked ? 'liked' : ''}`} aria-label={t('like')} onClick={() => useLibrary.getState().toggleLike(track)}>
        <IconHeart size={19} filled={liked} />
      </button>
      <button
        className={`pl-rail-btn ${disliked ? 'on' : ''}`}
        aria-label={t('dislike')}
        onClick={() => {
          useLibrary.getState().toggleDislike(track);
          if (!disliked) usePlayer.getState().next();
        }}
      >
        <IconBan size={18} />
      </button>
      <button className="pl-rail-btn" aria-label={t('addToPlaylist')} onClick={() => open({ type: 'addToPlaylist', tracks: [track] })}>
        <IconPlus size={18} />
      </button>
      <CastButton className="pl-rail-btn" size={18} />
    </div>
  );
}

/** The cover card: artwork, the action rail, and the Up next / About / Lyrics panels over it. */
/** iOS 26 style volume: a vertical capsule that fills from the bottom; drag up or down. */
function VolumePill() {
  const t = useT();
  const volume = usePlayer((s) => s.volume);
  const box = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const set = (clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    setVolume(Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height)));
  };
  return (
    <div
      ref={box}
      className="pl-vol glass"
      role="slider"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t('volume')}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={volume}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        down.current = true;
        set(e.clientY);
      }}
      onPointerMove={(e) => down.current && set(e.clientY)}
      onPointerUp={() => (down.current = false)}
      onPointerCancel={() => (down.current = false)}
      onKeyDown={(e) => {
        switch (e.key) {
          case 'ArrowUp':
            return setVolume(Math.min(1, volume + 0.05));
          case 'ArrowDown':
            return setVolume(Math.max(0, volume - 0.05));
        }
      }}
    >
      <div className="pl-vol-fill" style={{ height: `${volume * 100}%` }} />
      <span className="pl-vol-icon">{volume < 0.4 ? <IconSpeakerLow size={16} /> : <IconSpeaker size={16} />}</span>
    </div>
  );
}

function Stage({ track, lyrics, view, onSwipeDown }: { track: Track; lyrics: Lyrics | null | undefined; view: View; onSwipeDown?: (e: React.PointerEvent) => void }) {
  const t = useT();
  const playing = usePlayer((s) => s.playing);
  const [panel, setPanel] = useState<Panel | null>(null);
  const lastTap = useRef(0);
  const desktop = useDesktop();
  const rate = usePlayer((s) => s.rate);
  const x = useMotionValue(0);
  const gesture = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const art = track.artworkLarge ?? track.artwork;

  const likeOnDoubleTap = () => {
    const now = performance.now();
    if (now - lastTap.current > 320) return void (lastTap.current = now);
    lastTap.current = 0;
    likePulse.at = now;
    useLibrary.getState().toggleLike(track);
  };

  const body = (() => {
    switch (view) {
      case 'lyrics':
        return <LyricsView lyrics={lyrics} className="pl-lyrics big" />;
      case 'comments':
        return (
          <div className="pl-comments">
            <CommentsPanel />
          </div>
        );
      case 'cover':
        return null;
    }
  })();

  return (
    <div className={`pl-stage ${playing ? '' : 'paused'} view-${view}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={track.key}
          className="pl-art"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          style={{ x }}
          // The first 10 px decide: sideways switches the track, down closes the player, no move is a tap.
          onPointerDown={(e) => {
            gesture.current = { x: e.clientX, y: e.clientY, axis: null };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const g = gesture.current;
            if (!g) return;
            const dx = e.clientX - g.x;
            const dy = e.clientY - g.y;
            if (!g.axis) {
              if (Math.hypot(dx, dy) < 10) return;
              g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }
            if (g.axis === 'y') {
              gesture.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (dy > 0) onSwipeDown?.(e);
              return;
            }
            if (view === 'cover') x.set(dx * 0.6);
          }}
          onPointerUp={(e) => {
            const g = gesture.current;
            gesture.current = null;
            if (!g) return;
            if (!g.axis) return likeOnDoubleTap();
            const dx = e.clientX - g.x;
            if (view === 'cover' && dx < -80) usePlayer.getState().next();
            if (view === 'cover' && dx > 80) usePlayer.getState().prev();
            void animate(x, 0, { type: 'spring', stiffness: 400, damping: 34 });
          }}
          onPointerCancel={() => {
            gesture.current = null;
            void animate(x, 0, { type: 'spring', stiffness: 400, damping: 34 });
          }}
        >
          <Art src={art} seed={track.key} />
        </motion.div>
      </AnimatePresence>
      {body && <div className="pl-overlay">{body}</div>}
      {view === 'cover' && (
        <>
          <div className="pl-speed">
            <SpeedControl rate={rate} />
          </div>
          {!desktop && <VolumePill />}
          <Rail track={track} />
          <AnimatePresence>
            {panel && (
              <motion.div
                className="pl-panel"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              >
                <PanelBody panel={panel} track={track} lyrics={lyrics} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="pl-tabs">
            <PanelTab icon={<IconQueue size={15} />} label={t('queue')} active={panel === 'queue'} onClick={() => toggle('queue')} />
            <PanelTab icon={<IconMusic size={15} />} label={t('aboutTrack')} active={panel === 'about'} onClick={() => toggle('about')} />
            <PanelTab
              icon={<IconQuote size={15} />}
              label={lyrics?.synced ? <LyricLine lyrics={lyrics} fallback={t('lyrics')} /> : t('lyrics')}
              active={panel === 'lyrics'}
              onClick={() => toggle('lyrics')}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Transport() {
  const t = useT();
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  return (
    <div className="pl-transport">
      <button className={`pl-btn ${shuffle ? 'on' : ''}`} aria-label={t('shuffle')} onClick={() => usePlayer.getState().toggleShuffle()}>
        <IconShuffle size={19} />
      </button>
      <button className="pl-btn big" aria-label="Previous" onClick={() => usePlayer.getState().prev()}>
        <IconBackward size={24} />
      </button>
      <button className="pl-play glass-press" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
        {loading && playing ? <span className="spinner dark" /> : playing ? <IconPause size={24} /> : <IconPlay size={24} />}
      </button>
      <button className="pl-btn big" aria-label="Next" onClick={() => usePlayer.getState().next()}>
        <IconForward size={24} />
      </button>
      <button className={`pl-btn ${repeat !== 'off' ? 'on' : ''}`} aria-label={t('repeat')} onClick={() => usePlayer.getState().cycleRepeat()}>
        <IconRepeat size={19} one={repeat === 'one'} />
      </button>
    </div>
  );
}

function Volume() {
  const t = useT();
  const volume = usePlayer((s) => s.volume);
  return (
    <div className="pl-volume">
      <Slider
        value={volume}
        onChange={setVolume}
        left={
          <button className="pl-btn small" aria-label={t('volume')} onClick={() => setVolume(volume > 0 ? 0 : 1)}>
            {volume < 0.4 ? <IconSpeakerLow size={16} /> : <IconSpeaker size={16} />}
          </button>
        }
      />
    </div>
  );
}

/** The full-screen player: a cover-first layout after the desktop reference, adapted to phones. */
export function Player() {
  const t = useT();
  const expanded = usePlayer((s) => s.expanded);
  const track = usePlayer((s) => s.queue[s.index]);
  const context = usePlayer((s) => s.context);
  const desktop = useDesktop();
  const open = useUi((s) => s.open);
  const [view, setView] = useState<View>('cover');
  const { items: comments } = useComments(expanded ? track?.key : undefined);
  const lyrics = useLyrics(expanded ? track : undefined);
  const colors = usePlayerColors(track);
  const close = () => usePlayer.getState().setExpanded(false);

  // Swipe down to close, but only from empty areas: seeking, the cover swipe and scrolling stay free.
  const dragControls = useDragControls();
  const startDrag = (e: React.PointerEvent) => {
    if (desktop || (e.target as HTMLElement).closest('.scrub, button, input, .pl-stage, .slider, .speed')) return;
    dragControls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 140 || info.velocity.y > 700) close();
  };

  const showComments = () => (desktop ? setView('comments') : open({ type: 'comments' }));
  const commentsButton = (
    <button className="pl-btn comment-btn" aria-label={t('comments')} onClick={showComments}>
      <IconComment size={19} />
      {comments.length > 0 && <i className="badge">{comments.length > 99 ? '99+' : comments.length}</i>}
    </button>
  );
  const more = (e: React.MouseEvent<HTMLButtonElement>) => track && open({ type: 'track', track, anchor: e.currentTarget.getBoundingClientRect() });

  return (
    <AnimatePresence>
      {expanded && track && (
        <motion.div
          className="fullplayer"
          style={{ '--p-accent': colors.accent, '--p-deep': colors.deep } as React.CSSProperties}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 36 }}
          drag={desktop ? false : 'y'}
          dragListener={false}
          dragControls={dragControls}
          onPointerDown={startDrag}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={onDragEnd}
        >
          <header className="pl-top" data-tauri-drag-region>
            <button className="pl-btn" onClick={close} aria-label={t('close')}>
              <IconChevronDown size={20} />
            </button>
            <div className="pl-context">{context.title || t('playlistOfTheDay')}</div>
            <button className="pl-artist link" onClick={(e) => goToArtist(track, e.currentTarget.getBoundingClientRect())}>
              {track.artist}
            </button>
            <button className="pl-btn" aria-label="More" onClick={more}>
              <IconMore size={18} />
            </button>
          </header>

          <Stage track={track} lyrics={lyrics} view={view} onSwipeDown={desktop ? undefined : (e) => dragControls.start(e)} />

          <div className="pl-meta">
            {desktop && (
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'cover', label: t('playerCover') },
                  { value: 'lyrics', label: t('lyrics') },
                  { value: 'comments', label: `${t('comments')}${comments.length ? ` · ${comments.length}` : ''}` },
                ]}
              />
            )}
            <div className="pl-title">
              <Marquee text={track.title} />
              <button className="pl-sub link" onClick={(e) => goToArtist(track, e.currentTarget.getBoundingClientRect())}>
                {track.artist}
              </button>
            </div>
            {desktop ? <Volume /> : commentsButton}
          </div>

          <footer className="pl-bar">
            <Scrubber compact />
            <div className="pl-bar-row">
              <TimeCode />
              <Transport />
              <div className="pl-actions">
                {desktop && commentsButton}
                <button className="pl-btn" aria-label={t('queue')} onClick={() => open({ type: 'queue' })}>
                  <IconQueue size={19} />
                </button>
                <button className="pl-btn" aria-label={t('share')} onClick={() => shareTrack(track, t('copied'))}>
                  <IconShare size={18} />
                </button>
              </div>
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
