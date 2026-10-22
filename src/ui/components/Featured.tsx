import type { ReactNode } from 'react';
import { useAccount } from '../../account/store';
import { api } from '../../core';
import type { Playlist, Track } from '../../core/types';
import { useDaylist } from '../../player/daylist';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { toggleWave, useWaveColors, useWavePlaying } from '../desktop/WaveHero';
import { useT } from '../i18n';
import { IconPause, IconPlay, IconSearch, IconSparkles } from '../icons';
import { useDaylistTitle } from '../screens/Daylist';
import { Avatar } from './Avatar';
import { Art } from './controls';
import { MixCover, hashIndex } from './MixCover';

type Part = 'goodNight' | 'goodMorning' | 'goodAfternoon' | 'goodEvening';

function partOfDay(hour: number): Part {
  switch (Math.floor(hour / 6)) {
    case 0:
      return 'goodNight';
    case 1:
      return 'goodMorning';
    case 2:
      return 'goodAfternoon';
    default:
      return 'goodEvening';
  }
}

export async function playPlaylist(p: Playlist) {
  const full = p.tracks?.length || p.source === 'local' ? p : await api.playlist(p.source, p.id);
  if (full.tracks?.length) usePlayer.getState().playQueue(full.tracks, 0, { title: p.title, id: p.key });
}

/** "Good evening, Name", the avatar, and a search field that opens the Search tab. */
export function Greeting() {
  const t = useT();
  const profile = useAccount((s) => s.profile);
  const fallback = useSettings((s) => s.displayName);
  const setTab = useUi((s) => s.setTab);
  const name = profile?.displayName || fallback || t('listener');
  return (
    <header className="greeting">
      <div className="greeting-row">
        <div className="greeting-copy">
          <h1>{t(partOfDay(new Date().getHours()))},</h1>
          <p>{name}</p>
        </div>
        <button className="greeting-avatar glass-press" aria-label={t('profile')} onClick={() => setTab('profile')}>
          <Avatar avatar={profile?.avatar} name={name} size={44} />
        </button>
      </div>
      <button className="greeting-search glass glass-press" onClick={() => setTab('search')}>
        <IconSearch size={17} />
        <span>{t('searchPlaceholder')}</span>
      </button>
    </header>
  );
}

function FeatureCard({ label, title, sub, cover, footer, playing, onOpen, onPlay }: {
  label: string;
  title: string;
  sub: string;
  cover: ReactNode;
  footer: string;
  playing?: boolean;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const t = useT();
  return (
    <article className="feature" onClick={onOpen}>
      <div className="feature-cover">{cover}</div>
      <span className="feature-label">{label}</span>
      <div className="feature-body">
        <h3>{title}</h3>
        <p>{sub}</p>
        <div className="feature-foot">
          <span>{footer}</span>
          <button
            className="feature-play glass-press"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
            <span>{t('play')}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function WaveFeature() {
  const t = useT();
  const push = useUi((s) => s.push);
  const colors = useWaveColors();
  const recent = useLibrary((s) => s.recent);
  const { playing } = useWavePlaying();
  const [a, b, c] = colors;
  const art = recent[0]?.artworkLarge ?? recent[0]?.artwork;
  return (
    <FeatureCard
      label={t('forYou')}
      title={t('wave')}
      sub={t('waveHint')}
      cover={
        art ? (
          <div className="feature-blurred">
            <Art src={art} seed={recent[0].key} />
          </div>
        ) : (
          <div className="feature-gradient" style={{ background: `radial-gradient(circle at 30% 30%, ${a}, transparent 60%), radial-gradient(circle at 70% 70%, ${b ?? a}, transparent 55%), ${c ?? b ?? a}` }} />
        )
      }
      footer={t('tune')}
      playing={playing}
      onOpen={() => push({ name: 'wave' })}
      onPlay={() => toggleWave(t('wave'))}
    />
  );
}

function DaylistFeature() {
  const t = useT();
  const push = useUi((s) => s.push);
  const { slot, data } = useDaylist();
  const title = useDaylistTitle(slot.part, data?.tags ?? []);
  const tracks = data?.tracks ?? [];
  const recent = useLibrary((s) => s.recent);
  const covers = tracks.length ? tracks : recent;
  return (
    <FeatureCard
      label={t('daylist')}
      title={title}
      sub={t('daylistPitch')}
      cover={
        covers.length ? (
          <div className="feature-collage">
            {covers.slice(0, 4).map((x) => (
              <Art key={x.key} src={x.artworkLarge ?? x.artwork} seed={x.key} />
            ))}
          </div>
        ) : (
          <div className="feature-gradient feature-empty">
            <IconSparkles size={48} />
          </div>
        )
      }
      footer={tracks.length ? `${tracks.length} ${t('tracks')}` : t('daylistNoTracks')}
      onOpen={() => push({ name: 'daylist' })}
      onPlay={() => tracks.length && usePlayer.getState().playQueue(tracks, 0, { title, id: `daylist:${slot.start}` })}
    />
  );
}

function MixFeature({ p }: { p: Playlist }) {
  const t = useT();
  const push = useUi((s) => s.push);
  return (
    <FeatureCard
      label={t('mixesForYou')}
      title={p.title}
      sub={p.subtitle ?? ''}
      cover={p.artwork ? <Art src={p.artwork} seed={p.key} /> : <MixCover className="feature-mix" index={hashIndex(p.key)} />}
      footer={`${p.trackCount ?? p.tracks?.length ?? 0} ${t('tracks')}`}
      onOpen={() => p.source !== 'local' && push({ name: 'playlist', source: p.source, id: p.id, title: p.title, artwork: p.artwork, preview: p })}
      onPlay={() => void playPlaylist(p)}
    />
  );
}

/** The big swipeable cards at the top of Home: Wave, the daylist, then mixes. */
export function Featured({ mixes, wave = true }: { mixes: Playlist[]; wave?: boolean }) {
  return (
    <div className="featured">
      {wave && <WaveFeature />}
      <DaylistFeature />
      {mixes.slice(0, 4).map((p) => (
        <MixFeature key={p.key} p={p} />
      ))}
    </div>
  );
}

/** Recently played as cover tiles; a tap plays from that track on. */
export function RecentTiles({ title }: { title: string }) {
  const recent = useLibrary((s) => s.recent);
  const tracks: Track[] = recent.slice(0, 12);
  if (!tracks.length) return null;
  return (
    <div className="recent-tiles">
      {tracks.map((x, i) => (
        <button key={x.key} className="recent-tile glass-press" onClick={() => usePlayer.getState().playQueue(tracks, i, { title })}>
          <Art src={x.artworkLarge ?? x.artwork} seed={x.key} />
          <span className="recent-play">
            <IconPlay size={14} />
          </span>
          <span className="recent-title">{x.title}</span>
        </button>
      ))}
    </div>
  );
}
