import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import type { Track } from '../../core/types';
import { useSettings } from '../../store/settings';
import { useWave } from '../../player/wave';
import { toast } from './Toast';
import { useT } from '../i18n';

/**
 * "Why is this recommended?": the reason the wave gave for the track, its genres and tags, and
 * buttons to stop getting that genre or that artist. The blocks are applied by the wave (waveMood.ts).
 */
export const useWhy = create<{ track: Track | null }>(() => ({ track: null }));
export const openWhy = (track: Track) => useWhy.setState({ track });

export function WhySheet() {
  const t = useT();
  const track = useWhy((s) => s.track);
  const reason = useWave((s) => (track ? s.reasons[track.key] : undefined));
  const close = () => useWhy.setState({ track: null });

  const genres = track ? [...new Set([track.genre, ...(track.tags ?? [])].filter((g): g is string => !!g).map((g) => g.toLowerCase()))].slice(0, 8) : [];

  const blockGenre = (g: string) => {
    const s = useSettings.getState();
    if (!s.waveBlocked.genres.includes(g)) s.set({ waveBlocked: { ...s.waveBlocked, genres: [...s.waveBlocked.genres, g] } });
    toast(t('whyBlocked'));
  };
  const blockArtist = (a: string) => {
    const s = useSettings.getState();
    const key = a.toLowerCase().trim();
    if (!s.waveBlocked.artists.includes(key)) s.set({ waveBlocked: { ...s.waveBlocked, artists: [...s.waveBlocked.artists, key] } });
    toast(t('whyBlocked'));
  };

  return (
    <AnimatePresence>
      {track && (
        <motion.div className="why-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div className="why-sheet glass" initial={{ y: 24 }} animate={{ y: 0 }} exit={{ y: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="why-title">{t('whyTitle')}</div>
            <p className="why-track">
              {track.title} · {track.artist}
            </p>
            <p className="why-reason">{reason ?? t('whyNoReason')}</p>
            {genres.length > 0 && (
              <>
                <div className="why-sub">{t('whyGenres')}</div>
                <div className="why-chips">
                  {genres.map((g) => (
                    <button key={g} className="chip" onClick={() => blockGenre(g)}>
                      {g} ×
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="btn tonal" onClick={() => blockArtist(track.artist)}>
              <span>
                {t('whyBlockArtist')} {track.artist}
              </span>
            </button>
            <button className="btn primary" onClick={close}>
              <span>{t('whyClose')}</span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
