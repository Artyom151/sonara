import { useState } from 'react';
import { rerollWave, startWave, stopWave, useWave } from '../../player/wave';
import { useLibrary } from '../../store/library';
import { useSettings } from '../../store/settings';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { Art, Slider, Toggle } from '../components/controls';
import { EqBars, SourceMark } from '../components/TrackRow';
import { useWaveColors, useWavePlaying } from '../desktop/WaveHero';
import { WaveOrb } from '../desktop/WaveOrb';
import { useT, type StrKey } from '../i18n';
import {
  IconBan,
  IconBolt,
  IconCar,
  IconChevronDown,
  IconClose,
  IconHeadphones,
  IconHeart,
  IconMoon,
  IconPause,
  IconPlay,
  IconRain,
  IconSearch,
  IconShuffle,
  IconGear,
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

/** The wave: one button starts it; the tuning lives in a layer styled like the full-screen player. */
export function WaveScreen() {
  const t = useT();
  const pop = useUi((s) => s.pop);
  const [tuning, setTuning] = useState(false);
  const wave = useWave();
  const colors = useWaveColors();
  const { inWave, playing } = useWavePlaying();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const artwork = usePlayer((s) => s.queue[s.index]?.artworkLarge ?? s.queue[s.index]?.artwork);
  const current = inWave ? queue[index] : undefined;
  const start = () => (inWave && queue.length ? usePlayer.getState().patch({ playing: !playing }) : startWave(undefined, t('wave')));

  return (
    <div className="screen wave-screen">
      <div className="wave-art" aria-hidden style={artwork ? { backgroundImage: `url("${artwork}")` } : undefined} />
      <div className="wave-top">
        <button className="glass glass-icon glass-press" onClick={pop} aria-label={t('back')}>
          <IconChevronDown size={20} />
        </button>
        <button className="glass glass-icon glass-press" onClick={() => setTuning(true)} aria-label={t('waveTune')} title={t('waveTune')}>
          <IconGear size={18} />
        </button>
      </div>

      <div className="wave-hero">
        <WaveOrb colors={colors} active={playing} size={0.5} className="wave-hero-orb" />
        <div className="wave-status">
          {wave.active && <i className={`live-dot ${wave.status === 'loading' ? 'loading' : ''}`} />}
          <span>{wave.active ? (wave.status === 'loading' ? t('waveBuilding') : t('live')) : t('waveIdle')}</span>
        </div>
        <h1>{wave.active ? wave.label : t('wave')}</h1>
        <p>{current ? `${current.title} · ${current.artist}` : t('waveHint')}</p>
      </div>

      <div className="wave-controls">
        <button className="wave-play glass-press" onClick={start} aria-label={playing ? t('pause') : t('play')}>
          {playing ? <IconPause size={34} /> : <IconPlay size={34} />}
        </button>
        {wave.active && (
          <div className="wave-side">
            <button className="glass glass-icon glass-press" onClick={() => rerollWave()} aria-label={t('reroll')} title={t('reroll')}>
              <IconShuffle size={18} />
            </button>
            <button className="glass glass-icon glass-press" onClick={stopWave} aria-label={t('stop')} title={t('stop')}>
              <IconClose size={16} />
            </button>
          </div>
        )}
      </div>

      {tuning && <WaveTuning onClose={() => setTuning(false)} />}
    </div>
  );
}

/** Settings of the wave, in the full-screen player's style: a blurred backdrop, large type, glass cards. */
function WaveTuning({ onClose }: { onClose: () => void }) {
  const t = useT();
  const wave = useWave();
  const artwork = usePlayer((s) => s.queue[s.index]?.artworkLarge ?? s.queue[s.index]?.artwork);
  const { inWave } = useWavePlaying();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const home = useHome();
  const [q, setQ] = useState('');
  const upcoming = inWave ? queue.slice(index + 1) : [];
  const go = (query: string) => {
    const v = query.trim();
    if (!v) return;
    useLibrary.getState().pushSearch(v);
    startWave({ kind: 'query', query: v });
    onClose();
  };
  return (
    <div className="wave-tuning">
      <div className="wave-tuning-bg" aria-hidden style={artwork ? { backgroundImage: `url("${artwork}")` } : undefined} />
      <header className="wave-tuning-head">
        <h2>{t('waveTune')}</h2>
        <button className="glass glass-icon glass-press" onClick={onClose} aria-label={t('close')}>
          <IconClose size={16} />
        </button>
      </header>
      <div className="wave-tuning-body">
        <WaveMood />

        <form
          className="wave-tuning-search"
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
        >
          <IconSearch size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('waveSearch')} enterKeyHint="go" />
          {q && (
            <button type="submit" className="wave-tuning-go">
              {t('waveGo')}
            </button>
          )}
        </form>

        <h3 className="wave-section">{t('waveMoods')}</h3>
        <div className="wt-chips">
          {MOODS.map((m) => (
            <button key={m.key} className="wave-mood-chip glass-press" style={{ ['--mood' as string]: m.color }} onClick={() => { startWave({ kind: 'query', query: m.query }, t(m.key)); onClose(); }}>
              <span>{m.Icon({ size: 16, filled: true })}</span>
              {t(m.key)}
            </button>
          ))}
        </div>

        {home.data?.trending.length ? (
          <>
          <h3 className="wave-section">{t('browseGenres')}</h3>
          <div className="wt-chips">
            {home.data.trending.slice(0, 12).map((g) => (
              <button key={g.urn} className="wave-genre-chip glass-press" onClick={() => { startWave({ kind: 'genre', urn: g.urn, title: g.title }); onClose(); }}>
                {g.title}
              </button>
            ))}
          </div>
          </>
        ) : null}

        {wave.active && (
          <section className="wave-next">
            <h3>{t('queue')}</h3>
            {upcoming.length ? upcoming.slice(0, 20).map((tr, i) => <WaveRow key={`${tr.key}-${i}`} track={tr} reason={wave.reasons[tr.key]} index={index + 1 + i} />) : <p>{t('waveEmpty')}</p>}
          </section>
        )}
      </div>
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

/** Mood sliders and discovery for the wave: they change what the next tracks are picked from. */
function WaveMood() {
  const t = useT();
  const mood = useSettings((s) => s.waveMood);
  const discovery = useSettings((s) => s.waveDiscovery);
  const set = useSettings.getState().set;
  // The same slider as the volume control: left and right ends are labels.
  const row = (key: 'familiar' | 'energy' | 'popular', left: StrKey, right: StrKey) => (
    <div className="wave-slider">
      <Slider
        value={mood[key]}
        onChange={(v) => set({ waveMood: { ...mood, [key]: v } })}
        left={<span className="wave-end">{t(left)}</span>}
        right={<span className="wave-end">{t(right)}</span>}
      />
    </div>
  );
  return (
    <div className="wave-mood">
      {row('familiar', 'waveKnown', 'waveNew')}
      {row('energy', 'waveCalm', 'waveEnergetic')}
      {row('popular', 'wavePopular', 'waveRare')}
      <div className="wave-discovery">
        <span>{t('waveDiscovery')}</span>
        <Toggle checked={discovery} onChange={(v) => set({ waveDiscovery: v })} />
      </div>
    </div>
  );
}

