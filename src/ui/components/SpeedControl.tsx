import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { setRate } from '../../player/engine';
import { usePlayer } from '../../store/player';
import { useT } from '../i18n';

/**
 * Playback speed, after iOS 26 Podcasts: a glass chip with the current speed opens a row of presets
 * (touch and slide across them) and a dial for the 0.05 steps in between. Tapping the 1x preset resets.
 */
const MIN = 0.5;
const MAX = 1.5;
const STEP = 0.05;
const PRESETS = [0.5, 0.75, 1, 1.25, 1.5];
/** Pixels between two dial ticks. */
const TICK = 14;
const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;

const label = (r: number) => `${r.toFixed(2)}×`;
const dialSpring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 } as const;

/** The speed counts up or down to its new value instead of jumping. */
function Num({ value }: { value: number }) {
  const mv = useSpring(value, { stiffness: 320, damping: 32, mass: 0.7 });
  useEffect(() => mv.set(value), [mv, value]);
  const text = useTransform(mv, label);
  return <motion.span>{text}</motion.span>;
}

function Presets({ rate }: { rate: number }) {
  const box = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const pick = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const i = Math.min(PRESETS.length - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * PRESETS.length)));
    // The live value, not the rendered one: a fast slide must not compare against a stale render.
    if (PRESETS[i] !== usePlayer.getState().rate) setRate(PRESETS[i]);
  };
  return (
    <div
      ref={box}
      className="speed-presets"
      role="radiogroup"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        down.current = true;
        pick(e.clientX);
      }}
      onPointerMove={(e) => down.current && pick(e.clientX)}
      onPointerUp={() => (down.current = false)}
      onPointerCancel={() => (down.current = false)}
    >
      {PRESETS.map((p) => {
        const on = Math.abs(rate - p) < 0.001;
        return (
          <div key={p} role="radio" aria-checked={on} className={`speed-preset ${on ? 'on' : ''}`}>
            {on && <motion.div layoutId="speed-thumb" className="speed-thumb" transition={spring} />}
            <span>{p}</span>
          </div>
        );
      })}
    </div>
  );
}

function Dial({ rate }: { rate: number }) {
  const start = useRef<{ x: number; rate: number } | null>(null);
  const steps = Math.round((MAX - MIN) / STEP);
  const shift = -((rate - MIN) / STEP) * TICK;
  return (
    <div
      className="speed-dial"
      role="slider"
      tabIndex={0}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={rate}
      aria-valuetext={label(rate)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setRate(rate + STEP);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setRate(rate - STEP);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, rate };
      }}
      // Dragging the ruler to the left speeds up, as with a physical dial.
      onPointerMove={(e) => start.current && setRate(start.current.rate - ((e.clientX - start.current.x) / TICK) * STEP)}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
    >
      <motion.div className="speed-ticks" initial={false} animate={{ x: shift }} transition={dialSpring}>
        {Array.from({ length: steps + 1 }, (_, i) => (
          <i key={i} className={i % 2 === 0 ? 'major' : ''} style={{ left: i * TICK }} />
        ))}
      </motion.div>
      <div className="speed-needle" />
    </div>
  );
}

export function SpeedControl({ rate }: { rate: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="speed">
      <button className="glass glass-press speed-chip" aria-label={t('speed')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Num value={rate} />
      </button>
      {open && (
        // Scale and slide only: animated opacity breaks the glass inside (see Sheet in controls.tsx).
        <motion.div className="glass speed-panel" initial={{ scale: 0.92, y: -8 }} animate={{ scale: 1, y: 0 }} transition={spring}>
          <Presets rate={rate} />
          <Dial rate={rate} />
        </motion.div>
      )}
    </div>
  );
}
