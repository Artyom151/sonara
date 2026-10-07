import { useEffect, useState } from 'react';
import type { HomeData } from '../../core/types';
import { startWave, useWave } from '../../player/wave';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { imageColors, playerBackdrop } from '../../theme/color';
import { Art } from '../components/controls';
import { useT } from '../i18n';
import { IconGrab, IconPause, IconPlay } from '../icons';
import { WaveOrb } from './WaveOrb';

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Vivid palette for the orb: artwork colours re-toned to a bright mid tone, then the accent palette. */
export function useWaveColors() {
  const artwork = usePlayer((s) => s.queue[s.index]?.artwork);
  const [colors, setColors] = useState<string[]>(['#ff9f0a', '#ff375f', '#bf5af2', '#ffd60a']);
  useEffect(() => {
    let alive = true;
    (async () => {
      const list: string[] = [];
      if (artwork) {
        for (const c of (await imageColors(artwork)).slice(0, 3)) {
          const p = playerBackdrop([c]);
          list.push(p.card, p.top);
        }
      }
      for (const v of ['--accent', '--accent-tertiary', '--accent-strong', '--accent-secondary']) {
        const x = cssVar(v);
        if (/^#[0-9a-f]{6}$/i.test(x)) list.push(x);
      }
      if (alive && list.length >= 4) setColors(list.slice(0, 4));
    })();
    return () => {
      alive = false;
    };
  }, [artwork]);
  return colors;
}

export function useWavePlaying() {
  const playing = usePlayer((s) => s.playing);
  const inWave = usePlayer((s) => s.context.id === 'wave');
  return { inWave, playing: inWave && playing };
}

export function toggleWave(label: string) {
  const p = usePlayer.getState();
  if (p.context.id === 'wave' && p.queue.length) return p.patch({ playing: !p.playing });
  startWave(undefined, label);
}

export function WaveHero({ data }: { data?: HomeData }) {
  const t = useT();
  const colors = useWaveColors();
  const { playing } = useWavePlaying();
  const label = useWave((s) => (s.active ? s.label : ''));
  const push = useUi((s) => s.push);

  const chips = [
    data?.picks.length && {
      title: t('forYou'),
      sub: [...new Set(data.picks.map((p) => p.artist))].slice(0, 2).join(', '),
      arts: data.picks.slice(0, 2).map((p) => p.artwork),
      onClick: () => startWave({ kind: 'tracks', tracks: data.picks, title: t('forYou') }),
    },
    data?.trending.length && {
      title: t('trends'),
      sub: data.trending.slice(0, 3).map((g) => g.title).join(', '),
      arts: data.trending.slice(0, 2).map((g) => g.artwork),
      onClick: () => startWave({ kind: 'genre', urn: data.trending[0].urn, title: data.trending[0].title }),
    },
  ].filter(Boolean) as { title: string; sub: string; arts: (string | undefined)[]; onClick: () => void }[];

  return (
    <section className="wave">
      <WaveOrb colors={colors} active={playing} size={0.5} />
      <div className="wave-center">
        <button className="wave-title" onClick={() => toggleWave(t('wave'))}>
          {playing ? <IconPause size={30} /> : <IconPlay size={30} />}
          <span>{t('wave')}</span>
        </button>
        {label && <div className="wave-label">{label}</div>}
        <button className="wave-tune glass glass-press" onClick={() => push({ name: 'wave' })}>
          <IconGrab size={16} />
          <span>{t('tune')}</span>
        </button>
      </div>
      <div className="wave-chips">
        {chips.map((c) => (
          <button key={c.title} className="wave-chip glass glass-press" onClick={c.onClick}>
            <span className="wave-chip-arts">
              {c.arts.map((a, i) => (
                <span key={i}>
                  <Art src={a} seed={`${c.title}${i}`} />
                </span>
              ))}
            </span>
            <span className="wave-chip-text">
              <b>{c.title}</b>
              <small>{c.sub}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Compact Wave card for the phone home screen. */
export function WaveCard() {
  const t = useT();
  const colors = useWaveColors();
  const { playing } = useWavePlaying();
  const label = useWave((s) => (s.active ? s.label : ''));
  const push = useUi((s) => s.push);
  return (
    <section className="wave-card">
      <WaveOrb colors={colors} active={playing} size={0.34} className="wave-card-orb" />
      <div className="wave-card-body">
        <button className="wave-card-title" onClick={() => toggleWave(t('wave'))}>
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
          <span>{t('wave')}</span>
        </button>
        <small>{label || t('waveHint')}</small>
      </div>
      <button className="wave-tune glass glass-press small" onClick={() => push({ name: 'wave' })}>
        <IconGrab size={14} />
        <span>{t('tune')}</span>
      </button>
    </section>
  );
}
