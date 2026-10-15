import { motion, AnimatePresence } from 'motion/react';
import { create } from 'zustand';
import { useEffect, useRef, useState } from 'react';
import type { Track } from '../../core/types';
import { drawFrame, loadArt, makeBackdrop, cardPng, cardVideo, makeCanvas, SIZE, type MomentData } from '../../player/moment';
import { toast } from './Toast';
import { fmtTime, useT } from '../i18n';

/**
 * "Share a moment" with a live preview: the card is drawn right here, so you see what will be
 * shared before anything is recorded. The still is shared by default; the video is a separate,
 * explicit step (recording is the slow part).
 */
export const useMoment = create<{ track: Track | null; position: number }>(() => ({ track: null, position: 0 }));
export const openMoment = (track: Track, position: number) => useMoment.setState({ track, position });

interface Prepared {
  data: MomentData;
  backdrop: HTMLCanvasElement | null;
}

export function MomentSheet() {
  const t = useT();
  const track = useMoment((s) => s.track);
  const position = useMoment((s) => s.position);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 0, to: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const max = track?.duration || Math.max(600, range.to);

  // A new sheet starts from the moment itself, up to 30 seconds long.
  useEffect(() => {
    if (!track) return;
    setRange({ from: position, to: Math.min(track.duration || position + 30, position + 30) });
    // Only when the sheet opens for a track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const setFrom = (v: number) => setRange((r) => ({ from: Math.min(v, r.to - 1), to: r.to }));
  const setTo = (v: number) => setRange((r) => ({ from: r.from, to: Math.max(v, r.from + 1) }));

  // Prepare the cover once per track (drawing it is then cheap).
  useEffect(() => {
    if (!track) return setPrep(null);
    let alive = true;
    loadArt(track.artworkLarge ?? track.artwork).then((art) => {
      if (!alive) return;
      const data: MomentData = { title: track.title, artist: track.artist, position, duration: track.duration || 0, art, from: position, to: position };
      setPrep({ data, backdrop: makeBackdrop(art) });
    });
    return () => {
      alive = false;
    };
    // The position is read when the sheet opens; the preview follows it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  // The live preview: redrawn whenever the prepared card or the moment changes.
  useEffect(() => {
    if (!prep || !canvas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, { ...prep.data, from: range.from, to: range.to }, 0, 0, prep.backdrop);
  }, [prep, range]);

  const close = () => useMoment.setState({ track: null });

  const share = async (file: File) => {
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: track?.title, text: track ? `${track.title} — ${track.artist}` : undefined });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(t('momentSaved'));
  };

  const saveImage = async () => {
    if (!prep) return;
    setBusy('image');
    try {
      // The canvas already shows the card: export it as it is.
      const blob = await new Promise<Blob | null>((res) => canvas.current?.toBlob((b) => res(b), 'image/png'));
      const file = blob ? new File([blob], 'sonara-moment.png', { type: 'image/png' }) : await cardPng(prep.data).then((b) => b && new File([b], 'sonara-moment.png', { type: 'image/png' }));
      if (file) await share(file);
      else toast(t('errNetwork'));
    } catch (e) {
      console.warn('[moment] image failed', e);
      toast(t('errNetwork'));
    } finally {
      setBusy(null);
    }
  };

  const recordVideo = async () => {
    if (!prep) return;
    setBusy('video');
    const t0 = performance.now();
    const step = (m: string) => console.info(`[moment] ${m} at ${((performance.now() - t0) / 1000).toFixed(2)} s`);
    try {
      step('video: start');
      const video = await cardVideo({ ...prep.data, from: range.from, to: range.to });
      step(`video: recorded ${video ? video.size + ' bytes' : 'nothing'}`);
      if (!video) return toast(t('momentNoVideo'));
      await share(new File([video], 'sonara-moment.' + (video.type.includes('mp4') ? 'mp4' : 'webm'), { type: video.type }));
      step('video: shared');
    } catch (e) {
      console.warn('[moment] video failed', e);
      toast(t('momentNoVideo'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnimatePresence>
      {track && (
        <motion.div className="moment-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div className="moment-sheet glass" initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="moment-title">{t('shareMoment')}</div>
            <canvas ref={canvas} className="moment-preview" width={SIZE} height={SIZE} aria-label={t('shareMoment')} />
            <label className="moment-range">
              <span>
                {t('momentFrom')} {fmtTime(range.from)}
              </span>
              <input type="range" min={0} max={max} step={1} value={range.from} onChange={(e) => setFrom(Number(e.target.value))} />
            </label>
            <label className="moment-range">
              <span>
                {t('momentTo')} {fmtTime(range.to)}
              </span>
              <input type="range" min={0} max={max} step={1} value={range.to} onChange={(e) => setTo(Number(e.target.value))} />
            </label>
            <div className="moment-actions">
              <button className="btn primary" disabled={!prep || !!busy} onClick={saveImage}>
                <span>{busy === 'image' ? t('momentWorking') : t('momentImage')}</span>
              </button>
              <button className="btn tonal" disabled={!prep || !!busy} onClick={recordVideo}>
                <span>{busy === 'video' ? t('momentWorking') : t('momentVideo')}</span>
              </button>
              <button className="btn tonal" onClick={close}>
                <span>{t('momentClose')}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { makeCanvas };
