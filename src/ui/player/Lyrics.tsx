import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../core';
import type { Lyrics, Track } from '../../core/types';
import { seek } from '../../player/engine';
import { usePlayer } from '../../store/player';
import { useT } from '../i18n';
import { IconNote } from '../icons';

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

export const activeLine = (lyrics: Lyrics | null | undefined, pos: number) => {
  if (!lyrics?.synced) return -1;
  let i = -1;
  for (let j = 0; j < lyrics.synced.length; j++) {
    if (lyrics.synced[j].time <= pos + 0.25) i = j;
    else break;
  }
  return i;
};

/** A lead-in before the first line (3 s+), or an empty line. */
const isGap = (lyrics: Lyrics | null | undefined, i: number) => {
  const s = lyrics?.synced;
  if (!s?.length) return false;
  if (i < 0) return s[0].time > 3;
  return !s[i].text.trim();
};

/** A note while waiting, then 3 · 2 · 1 in the last three seconds before the next line. */
function GapMark({ next, size }: { next: number; size: number }) {
  const left = usePlayer((s) => Math.ceil(next - s.position));
  if (left >= 1 && left <= 3)
    return (
      <motion.span key={left} className="lyric-count" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
        {left}
      </motion.span>
    );
  return <IconNote size={size} />;
}

/** The active line with word-sync: the words the playback has reached are bright. */
function WordsLine({ words }: { words: { time: number; text: string }[] }) {
  const pos = usePlayer((s) => s.position);
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className={`lyric-word ${pos >= w.time ? 'on' : ''}`}>
          {w.text}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

export function LyricsView({ lyrics, className }: { lyrics: Lyrics | null | undefined; className?: string }) {
  const t = useT();
  // The line index, not the raw position: re-renders only when the line changes.
  const idx = usePlayer((s) => activeLine(lyrics, s.position));
  const box = useRef<HTMLDivElement>(null);
  const userScroll = useRef(0);
  const introRow = isGap(lyrics, -1) ? 1 : 0;

  useEffect(() => {
    if (idx + introRow < 0 || !box.current || Date.now() - userScroll.current < 3000) return;
    const el = box.current.children[idx + introRow] as HTMLElement | undefined;
    // scrollIntoView() would also scroll every scrollable ancestor and shift the whole interface.
    if (el) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });
  }, [idx, introRow]);

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
  const s = lyrics.synced;
  return (
    <div ref={box} className={`lyrics ${className ?? ''}`} onWheel={() => (userScroll.current = Date.now())} onTouchMove={() => (userScroll.current = Date.now())}>
      {introRow > 0 && (
        <p className={`lyric-gap ${idx < 0 ? 'active' : 'past'}`} onClick={() => seek(0)}>
          <GapMark next={s[0].time} size={26} />
        </p>
      )}
      {s.map((l, i) => {
        const state = i === idx ? 'active' : i < idx ? 'past' : '';
        const text = l.text.trim();
        return (
          <p key={i} className={`${state} ${text ? '' : 'lyric-gap'}`} onClick={() => seek(l.time)}>
            {text ? i === idx && l.words ? <WordsLine words={l.words} /> : l.text : i === idx && s[i + 1] ? <GapMark next={s[i + 1].time} size={26} /> : <IconNote size={26} />}
          </p>
        );
      })}
    </div>
  );
}

/** The current line, animated; used as the label of the lyrics panel. */
export function LyricLine({ lyrics, fallback }: { lyrics: Lyrics | null | undefined; fallback: string }) {
  const index = usePlayer((s) => activeLine(lyrics, s.position));
  const synced = lyrics?.synced;
  const line = index >= 0 ? synced![index].text : '';
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={line || fallback}
        className="lyric-line"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
      >
        {line || fallback}
      </motion.span>
    </AnimatePresence>
  );
}
