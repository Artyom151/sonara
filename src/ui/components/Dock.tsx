import { motion } from 'motion/react';
import { togglePlay } from '../../player/engine';
import { useLibrary } from '../../store/library';
import { useSettings } from '../../store/settings';
import { usePlayer } from '../../store/player';
import { useUi, type Tab } from '../../store/ui';
import { useT } from '../i18n';
import { IconHeart, IconHome, IconPause, IconPerson, IconPlay, IconSearch } from '../icons';
import { Art } from './controls';

const TABS: { id: Tab; icon: (a: boolean) => React.ReactNode }[] = [
  { id: 'home', icon: (a) => <IconHome size={23} filled={a} /> },
  { id: 'search', icon: () => <IconSearch size={23} /> },
  { id: 'likes', icon: (a) => <IconHeart size={23} filled={a} /> },
  { id: 'profile', icon: (a) => <IconPerson size={23} filled={a} /> },
];

export function MiniPlayer() {
  const track = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const progress = usePlayer((s) => (s.duration ? s.position / s.duration : 0));
  const liked = useLibrary((s) => (track ? s.likes.some((x) => x.key === track.key) : false));
  if (!track) return null;
  return (
    <motion.div
      layoutId="mini"
      className="mini glass refract"
      onClick={() => usePlayer.getState().setExpanded(true)}
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
    >
      <div className="mini-art">
        <Art src={track.artwork} seed={track.key} />
      </div>
      <div className="mini-meta">
        <div className="mini-title">{track.title}</div>
        <div className="mini-sub">{track.artist}</div>
      </div>
      <button
        className="mini-btn"
        aria-label="Like"
        onClick={(e) => {
          e.stopPropagation();
          useLibrary.getState().toggleLike(track);
        }}
        style={{ color: liked ? 'var(--red)' : undefined }}
      >
        <IconHeart size={21} filled={liked} />
      </button>
      <button
        className="mini-btn"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
      >
        {loading && playing ? <span className="spinner" style={{ width: 18, height: 18 }} /> : playing ? <IconPause size={20} /> : <IconPlay size={20} />}
      </button>
      <div className="mini-progress">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
    </motion.div>
  );
}

export function TabBar() {
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const hasNewLikes = useLibrary((s) => s.likes.length > 0);
  const t = useT();
  const idx = TABS.findIndex((x) => x.id === tab);
  return (
    <nav className="tabbar glass refract">
      <motion.div
        className="tab-lens"
        animate={{ left: `calc(${idx * 25}% + 4px)` }}
        style={{ width: 'calc(25% - 8px)' }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      />
      {TABS.map((x) => (
        <button key={x.id} className={`tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
          {x.icon(tab === x.id)}
          <span>{t(x.id)}</span>
          {x.id === 'likes' && hasNewLikes && tab !== 'likes' && <i className="dot" />}
        </button>
      ))}
    </nav>
  );
}

export function Dock() {
  const island = useSettings((s) => s.islandPlayer);
  return (
    <div className="dock">
      {island ? null : <MiniPlayer />}
      <TabBar />
    </div>
  );
}
