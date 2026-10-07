import { useState } from 'react';
import { rerollWave, startWave, stopWave, useWave } from '../../player/wave';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { Art } from '../components/controls';
import { EqBars, SourceMark } from '../components/TrackRow';
import { useWaveColors, useWavePlaying } from '../desktop/WaveHero';
import { WaveOrb } from '../desktop/WaveOrb';
import { useT, type StrKey } from '../i18n';
import {
  IconBan,
  IconBolt,
  IconCar,
  IconChevronLeft,
  IconClose,
  IconHeadphones,
  IconHeart,
  IconMoon,
  IconPause,
  IconPlay,
  IconRain,
  IconSearch,
  IconShuffle,
  IconSparkles,
  IconWind,
} from '../icons';
import { useHome } from './Home';

/** Mood presets map to style queries; the engine resolves them via tags + search. */
const MOODS: { key: StrKey; query: string; Icon: (p: { size?: number; filled?: boolean }) => React.ReactNode; color: string }[] = [
  { key: 'moodEnergy', query: 'energetic workout', Icon: IconBolt, color: '#ffd60a' },
  { key: 'moodChill', query: 'chill', Icon: IconWind, color: '#64d2ff' },
  { key: 'moodFocus', query: 'lofi', Icon: IconHeadphones, color: '#30d158' },
  { key: 'moodNight', query: 'night drive synthwave', Icon: IconMoon, color: '#bf5af2' },
  { key: 'moodParty', query: 'party dance', Icon: IconSparkles, color: '#ff9f0a' },
  { key: 'moodSad', query: 'sad', Icon: IconRain, color: '#8e9bb5' },
  { key: 'moodPhonk', query: 'phonk', Icon: IconCar, color: '#ff453a' },
  { key: 'moodRomance', query: 'love r&b', Icon: IconHeart, color: '#ff6482' },
];

export function WaveScreen() {
  const t = useT();
  const pop = useUi((s) => s.pop);
  const [q, setQ] = useState('');
  const wave = useWave();
  const colors = useWaveColors();
  const { inWave, playing } = useWavePlaying();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const home = useHome();
  const current = inWave ? queue[index] : undefined;
  const upcoming = inWave ? queue.slice(index + 1) : [];

  const go = (query: string) => {
    const v = query.trim();
    if (!v) return;
    useLibrary.getState().pushSearch(v);
    startWave({ kind: 'query', query: v });
  };

  return (
    <div className="screen wave-screen">
      <div className="nav-bar">
        <button className="glass glass-icon glass-press" onClick={pop} aria-label="Back">
          <IconChevronLeft size={20} />
        </button>
        <div className="title">{t('wave')}</div>
        <div style={{ width: 44 }} />
      </div>

      <header className="ws-head">
        <WaveOrb colors={colors} active={playing} size={0.36} className="ws-orb" />
        <div className="ws-head-text">
          <div className="ws-status">
            {wave.active && <i className={`live-dot ${wave.status === 'loading' ? 'loading' : ''}`} />}
            <span>{wave.active ? (wave.status === 'loading' ? t('waveBuilding') : t('live')) : t('waveIdle')}</span>
          </div>
          <h1>{wave.active ? wave.label : t('wave')}</h1>
          {wave.active && wave.topTags.length > 0 && (
            <div className="ws-tags">
              {wave.topTags.map((tag) => (
                <button key={tag} className="chip" onClick={() => go(tag)}>
                  #{tag}
                </button>
              ))}
            </div>
          )}
          <div className="ws-actions">
            <button
              className="btn primary"
              onClick={() => (inWave && queue.length ? usePlayer.getState().patch({ playing: !playing }) : startWave(undefined, t('wave')))}
            >
              {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
              <span>{playing ? t('pause') : t('play')}</span>
            </button>
            {wave.active && (
              <>
                <button className="btn tonal" onClick={() => rerollWave()}>
                  <IconShuffle size={18} />
                  <span>{t('reroll')}</span>
                </button>
                <button className="btn tonal icon" onClick={stopWave} aria-label={t('stop')} title={t('stop')}>
                  <IconClose size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <form
        className="search-bar glass ws-search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <IconSearch size={18} style={{ opacity: 0.6 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('waveSearch')} enterKeyHint="go" />
        {q && (
          <button type="submit" className="btn primary small ws-go">
            <span>{t('waveGo')}</span>
          </button>
        )}
      </form>

      <section className="section">
        <div className="section-head">
          <h2>{t('waveMoods')}</h2>
        </div>
        <div className="ws-moods">
          {MOODS.map((m) => (
            <button key={m.key} className="ws-mood glass glass-press" onClick={() => startWave({ kind: 'query', query: m.query }, t(m.key))}>
              <span className="ws-mood-icon" style={{ color: m.color }}>
                <m.Icon size={20} filled />
              </span>
              <span>{t(m.key)}</span>
            </button>
          ))}
        </div>
      </section>

      {home.data?.trending.length ? (
        <section className="section">
          <div className="section-head">
            <h2>{t('browseGenres')}</h2>
          </div>
          <div className="ws-genres">
            {home.data.trending.slice(0, 14).map((g) => (
              <button key={g.urn} className="chip" onClick={() => startWave({ kind: 'genre', urn: g.urn, title: g.title })}>
                {g.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {current && (
        <section className="section">
          <div className="section-head">
            <h2>{t('nowPlaying')}</h2>
          </div>
          <WaveRow track={current} reason={wave.reasons[current.key]} index={index} now playing={playing} />
        </section>
      )}

      {inWave && (
        <section className="section">
          <div className="section-head">
            <h2>{t('queue')}</h2>
            {wave.status === 'loading' && <span className="spinner" style={{ width: 16, height: 16 }} />}
          </div>
          {upcoming.length ? (
            upcoming.map((tr, i) => <WaveRow key={`${tr.key}-${i}`} track={tr} reason={wave.reasons[tr.key]} index={index + 1 + i} />)
          ) : (
            <div className="empty">{t('waveEmpty')}</div>
          )}
        </section>
      )}
    </div>
  );
}

function WaveRow({ track, reason, index, now, playing }: { track: import('../../core/types').Track; reason?: string; index: number; now?: boolean; playing?: boolean }) {
  const t = useT();
  return (
    <div className={`track-row wave-row ${now ? 'playing' : ''}`} onClick={() => (now ? usePlayer.getState().setExpanded(true) : usePlayer.getState().jump(index))}>
      <div className="track-art">
        <Art src={track.artwork} seed={track.key} />
        {now && (
          <div className="eq">
            <EqBars paused={!playing} />
          </div>
        )}
      </div>
      <div className="track-meta">
        <div className="track-title">{track.title}</div>
        <div className="track-sub">
          <SourceMark source={track.source} />
          <span>{track.artist}</span>
        </div>
      </div>
      {reason && <span className="wave-reason">{reason}</span>}
      {!now && (
        <button
          className="row-btn"
          title={t('lessLikeThis')}
          aria-label={t('lessLikeThis')}
          onClick={(e) => {
            e.stopPropagation();
            useLibrary.getState().toggleDislike(track);
            const p = usePlayer.getState();
            const i = p.queue.findIndex((x, j) => j > p.index && x.key === track.key);
            if (i > 0) p.removeAt(i);
          }}
        >
          <IconBan size={18} />
        </button>
      )}
    </div>
  );
}
