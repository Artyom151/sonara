import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { goToArtist } from '../artists';
import { api } from '../../core';
import type { Lyrics, Track } from '../../core/types';
import { seek, togglePlay } from '../../player/engine';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { imageColors, playerBackdrop } from '../../theme/color';
import { fmtTime, useT } from '../i18n';
import {
  IconBackward,
  IconBan,
  IconChevronDown,
  IconForward,
  IconHeart,
  IconMore,
  IconNote,
  IconClose,
  IconComment,
  IconPause,
  IconPlay,
  IconQuote,
  IconQueue,
  IconRepeat,
  IconShare,
  IconShuffle,
} from '../icons';
import { Art, Marquee } from './controls';
import { shareTrack } from './actions';
import { useDesktop } from '../useMedia';
import { CommentsPanel, useComments } from '../account/Comments';
import { useAccount } from '../../account/store';
import { useLikeSync } from '../../account/sync';
import { Avatar } from './Avatar';
import { Segmented } from './controls';

export function usePlayerColors(track?: Track) {
  const [colors, setColors] = useState(() => playerBackdrop([]));
  useEffect(() => {
    let alive = true;
    imageColors(track?.artwork).then((c) => alive && setColors(playerBackdrop(c)));
    return () => {
      alive = false;
    };
  }, [track?.artwork]);
  return colors;
}

export function useLyrics(track?: Track) {
  const [lyrics, setLyrics] = useState<Lyrics | null | undefined>(undefined);
  useEffect(() => {
    setLyrics(undefined);
    if (!track) return;
    let alive = true;
    api
      .lyrics(track)
      .then((l) => alive && setLyrics(l))
      .catch(() => alive && setLyrics(null));
    return () => {
      alive = false;
    };
  }, [track?.key]);
  return lyrics;
}

const activeLine = (lyrics: Lyrics | null | undefined, pos: number) => {
  if (!lyrics?.synced) return -1;
  let i = -1;
  for (let j = 0; j < lyrics.synced.length; j++) {
    if (lyrics.synced[j].time <= pos + 0.25) i = j;
    else break;
  }
  return i;
};

function LikedBy({ track }: { track: Track }) {
  const t = useT();
  const provider = useAccount((s) => s.provider);
  const mode = useAccount((s) => s.mode);
  const version = useLikeSync((s) => s.version);
  const [state, setState] = useState<{ people: { name: string; avatar?: string; preset?: boolean }[]; count: number; sonara: boolean }>({ people: [], count: 0, sonara: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      // Sonara listeners first (your database); SoundCloud likers as a fallback.
      const own = await provider().likes.likedBy(track.key).catch(() => ({ users: [], count: 0 }));
      if (!alive) return;
      if (own.count > 0) {
        setState({ people: own.users.map((u) => ({ name: u.displayName, avatar: u.avatar, preset: true })), count: own.count, sonara: true });
        return;
      }
      const sc = await api.likers(track).catch(() => []);
      if (alive) setState({ people: sc.map((l) => ({ name: l.name, avatar: l.avatar })), count: sc.length, sonara: false });
    })();
    return () => {
      alive = false;
    };
  }, [track.key, version, mode, provider]);

  if (!state.people.length) return <div style={{ height: 34 }} />;
  const names = state.people.map((p) => p.name.split(' ')[0]);
  const extra = state.count - names.length;
  const label =
    extra > 0
      ? `${names.join(', ')} ${t('and')} ${extra}`
      : names.length > 1
        ? `${names.slice(0, -1).join(', ')} ${t('and')} ${names[names.length - 1]}`
        : names[0];
  return (
    <motion.div key={track.key} className="liked-by glass" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="avatars">
        {state.people.map((p, i) => (p.preset ? <Avatar key={i} avatar={p.avatar} name={p.name} size={22} /> : p.avatar ? <img key={i} src={p.avatar} alt="" /> : <span key={i} />))}
      </div>
      <div>
        <small>
          {t('likedBy')} <IconHeart size={9} filled style={{ color: 'var(--p-accent)', verticalAlign: '-1px' }} />
          {state.sonara && <span className="liked-src"> Sonara</span>}
        </small>
        <b>{label}</b>
      </div>
    </motion.div>
  );
}

export function Scrubber({ compact }: { compact?: boolean }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const buffered = usePlayer((s) => s.buffered);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pos = drag ?? position;
  const pct = duration ? Math.min(100, (pos / duration) * 100) : 0;
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * duration;
  };
  return (
    <div>
      <div
        ref={ref}
        className={`scrub ${drag != null ? 'active' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
        }}
        onPointerMove={(e) => drag != null && setDrag(at(e.clientX))}
        onPointerUp={() => {
          if (drag != null) seek(drag);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="scrub-track">
          <div className="scrub-buffer" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!compact && (
        <div className="times">
          <span>{fmtTime(pos)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      )}
    </div>
  );
}

export function LyricsView({ lyrics, className }: { lyrics: Lyrics | null | undefined; className?: string }) {
  const t = useT();
  // Select the line index, not the raw position: re-renders only when the line changes.
  const idx = usePlayer((s) => activeLine(lyrics, s.position));
  const box = useRef<HTMLDivElement>(null);
  const userScroll = useRef(0);

  useEffect(() => {
    if (idx < 0 || !box.current || Date.now() - userScroll.current < 3000) return;
    const el = box.current.children[idx] as HTMLElement | undefined;
    // Scroll only the lyrics container. scrollIntoView() would also scroll every
    // scrollable ancestor (including the page root) and shift the whole interface up.
    if (el) {
      const b = box.current;
      b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });
    }
  }, [idx]);

  if (lyrics === undefined) return <div className={`lyrics ${className ?? ''}`} />;
  if (!lyrics || (!lyrics.synced && !lyrics.plain))
    return (
      <div className={`lyrics plain ${className ?? ''}`}>
        <p style={{ color: 'var(--text-2)' }}>{lyrics?.instrumental ? t('instrumental') : t('noLyrics')}</p>
      </div>
    );
  if (!lyrics.synced)
    return (
      <div className={`lyrics plain ${className ?? ''}`}>
        <p>{lyrics.plain}</p>
      </div>
    );
  return (
    <div ref={box} className={`lyrics ${className ?? ''}`} onWheel={() => (userScroll.current = Date.now())} onTouchMove={() => (userScroll.current = Date.now())}>
      {lyrics.synced.map((l, i) => (
        <p key={i} className={i === idx ? 'active' : i < idx ? 'past' : ''} onClick={() => seek(l.time)}>
          {l.text || <IconNote size={22} />}
        </p>
      ))}
    </div>
  );
}

/** Isolated so only this pill re-renders on time updates, not the whole player. */
function LyricPill({ lyrics, onOpen }: { lyrics: Lyrics | null | undefined; onOpen: () => void }) {
  const index = usePlayer((s) => activeLine(lyrics, s.position));
  const line = index >= 0 ? lyrics!.synced![index].text : '';
  return (
    <button className="lyric-pill glass" onClick={onOpen}>
      <AnimatePresence mode="wait">
        <motion.span
          key={line}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.3 }}
        >
          {line || <IconNote size={14} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function Player() {
  const t = useT();
  const expanded = usePlayer((s) => s.expanded);
  const track = usePlayer((s) => s.queue[s.index]);
  const context = usePlayer((s) => s.context);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const liked = useLibrary((s) => (track ? s.likes.some((x) => x.key === track.key) : false));
  const disliked = useLibrary((s) => (track ? s.dislikes.includes(track.key) : false));
  const showLine = useSettings((s) => s.showLyricsLine);
  const lyricsPanel = useSettings((s) => s.lyricsPanel);
  const desktop = useDesktop();
  const sidePanel = desktop && lyricsPanel;
  const toggleLyrics = () => useSettings.getState().set({ lyricsPanel: !lyricsPanel });
  const [sideTab, setSideTab] = useState<'lyrics' | 'comments'>('lyrics');
  const { items: comments } = useComments(expanded ? track?.key : undefined);
  const open = useUi((s) => s.open);
  const colors = usePlayerColors(track);
  const lyrics = useLyrics(expanded ? track : undefined);

  const close = () => usePlayer.getState().setExpanded(false);
  // Swipe-down-to-close starts only from "empty" areas, never from the scrubber, buttons,
  // artwork (its own swipe) or lyrics — so seeking works with mouse and touch.
  const dragControls = useDragControls();
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.scrub, button, input, .player-art, .lyrics, .player-side, .comments, .player-card')) return;
    dragControls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 140 || info.velocity.y > 700) close();
  };

  return (
    <AnimatePresence>
      {expanded && track && (
        <motion.div
          className="player"
          style={
            {
              '--p-deep': colors.deep,
              '--p-card': colors.card,
              '--p-accent': colors.accent,
            } as React.CSSProperties
          }
          initial={{ y: '100%', borderRadius: 40 }}
          animate={{ y: 0, borderRadius: 0 }}
          exit={{ y: '100%', borderRadius: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 36 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          onPointerDown={startDrag}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={onDragEnd}
        >
          <div className="player-bg">
            <div className="art-blur" style={{ backgroundImage: track.artwork ? `url("${track.artworkLarge ?? track.artwork}")` : undefined }} />
            <div className="blob" style={{ background: colors.top, width: '90%', height: '55%', left: '5%', top: '8%' }} />
            <div className="blob" style={{ background: colors.mid, width: '70%', height: '40%', right: '-5%', top: '40%' }} />
            <div className="blob" style={{ background: colors.deep, width: '100%', height: '40%', left: 0, bottom: 0 }} />
          </div>

          <div className="player-head">
            <button className="glass glass-icon glass-press" onClick={close} aria-label="Close">
              <IconChevronDown size={20} />
            </button>
            <div className="ctx">{context.title || t('playlistOfTheDay')}</div>
            {desktop && (
              <button
                className={`glass glass-icon glass-press ${lyricsPanel ? 'on' : ''}`}
                aria-label={lyricsPanel ? t('hideLyrics') : t('showLyrics')}
                title={lyricsPanel ? t('hideLyrics') : t('showLyrics')}
                onClick={toggleLyrics}
              >
                <IconQuote size={18} filled={lyricsPanel} />
              </button>
            )}
            <button
              className="glass glass-icon glass-press"
              aria-label="More"
              onClick={(e) => open({ type: 'track', track, anchor: e.currentTarget.getBoundingClientRect() })}
            >
              <IconMore size={18} />
            </button>
          </div>

          <div className={`player-body ${sidePanel ? '' : 'no-lyrics'}`}>
            <div className="player-col">
              <div className="player-stage">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={track.key}
                    className={`player-art ${playing ? '' : 'paused'}`}
                    initial={{ opacity: 0, scale: 0.8, x: 60 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: -60 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.5}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -80) usePlayer.getState().next();
                      else if (info.offset.x > 80) usePlayer.getState().prev();
                    }}
                  >
                    <Art src={track.artworkLarge ?? track.artwork} seed={track.key} />
                  </motion.div>
                </AnimatePresence>
                <LikedBy track={track} />
              </div>

              <div className="player-card glass refract">
                <div>
                  <div className="np">
                    <div className="np-art">
                      <Art src={track.artwork} seed={track.key} />
                    </div>
                    <div className="np-meta">
                      <Marquee className="np-title" text={track.title} />
                      <button className="np-artist link" onClick={(e) => goToArtist(track, e.currentTarget.getBoundingClientRect())}>
                        {track.artist}
                      </button>
                    </div>
                  </div>
                  <Scrubber />
                  <div className="controls">
                    <button
                      className={`ctl ${disliked ? 'on' : 'dim'}`}
                      aria-label={t('dislike')}
                      onClick={() => {
                        useLibrary.getState().toggleDislike(track);
                        if (!disliked) usePlayer.getState().next();
                      }}
                    >
                      <IconBan size={21} />
                    </button>
                    <button className="ctl" aria-label="Previous" onClick={() => usePlayer.getState().prev()}>
                      <IconBackward size={26} />
                    </button>
                    <button className="ctl-main glass glass-press" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                      {loading && playing ? <span className="spinner" /> : playing ? <IconPause size={26} /> : <IconPlay size={26} />}
                    </button>
                    <button className="ctl" aria-label="Next" onClick={() => usePlayer.getState().next()}>
                      <IconForward size={26} />
                    </button>
                    <button
                      className={`ctl ${liked ? 'on' : 'dim'}`}
                      aria-label={t('like')}
                      onClick={() => useLibrary.getState().toggleLike(track)}
                      style={liked ? { color: 'var(--p-accent)' } : undefined}
                    >
                      <IconHeart size={22} filled={liked} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="player-foot">
                <button className={`ctl ${shuffle ? 'on' : 'dim'}`} aria-label={t('shuffle')} onClick={() => usePlayer.getState().toggleShuffle()}>
                  <IconShuffle size={20} />
                </button>
                {showLine && lyrics?.synced && !desktop ? (
                  <LyricPill lyrics={lyrics} onOpen={() => open({ type: 'lyrics' })} />
                ) : (
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <button className={`ctl ${repeat !== 'off' ? 'on' : 'dim'}`} aria-label={t('repeat')} onClick={() => usePlayer.getState().cycleRepeat()}>
                      <IconRepeat size={20} one={repeat === 'one'} />
                    </button>
                    <button className="ctl dim" aria-label={t('queue')} onClick={() => open({ type: 'queue' })}>
                      <IconQueue size={20} />
                    </button>
                    {/* Phones: unsynced lyrics have no pill, so offer a button for the lyrics sheet. */}
                    {!desktop && lyrics?.plain && (
                      <button className="ctl dim" aria-label={t('lyrics')} onClick={() => open({ type: 'lyrics' })}>
                        <IconQuote size={20} />
                      </button>
                    )}
                  </div>
                )}
                <button
                  className="ctl dim comment-btn"
                  aria-label={t('comments')}
                  onClick={() => (desktop ? (useSettings.getState().set({ lyricsPanel: true }), setSideTab('comments')) : open({ type: 'comments' }))}
                >
                  <IconComment size={20} />
                  {comments.length > 0 && <i className="badge">{comments.length > 99 ? '99+' : comments.length}</i>}
                </button>
                <button className="ctl dim" aria-label={t('share')} onClick={() => shareTrack(track, t('copied'))}>
                  <IconShare size={20} />
                </button>
              </div>
            </div>

            {sidePanel && (
              <div className="player-side">
                <div className="player-side-head">
                  <Segmented
                    value={sideTab}
                    onChange={setSideTab}
                    options={[
                      { value: 'lyrics', label: t('lyrics') },
                      { value: 'comments', label: `${t('comments')}${comments.length ? ` · ${comments.length}` : ''}` },
                    ]}
                  />
                  <button className="ctl dim" aria-label={t('hideLyrics')} title={t('hideLyrics')} onClick={toggleLyrics}>
                    <IconClose size={16} />
                  </button>
                </div>
                {sideTab === 'lyrics' ? <LyricsView lyrics={lyrics} /> : <CommentsPanel />}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
