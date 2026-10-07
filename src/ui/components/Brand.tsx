import { motion } from 'motion/react';
import { useEffect } from 'react';

/** Single-stroke cursive "sonara" (viewBox 0 0 520 200), drawn like iOS "hello". */
export const SONARA_SCRIPT =
  'M 22 146 C 40 138, 58 110, 70 82 C 78 98, 94 108, 92 124 C 90 142, 72 146, 62 138 C 76 146, 94 144, 108 126 C 116 106, 124 84, 140 84 C 120 84, 106 104, 110 124 C 114 144, 142 144, 152 122 C 158 104, 152 86, 140 84 C 152 92, 162 92, 174 86 C 174 104, 172 124, 170 140 C 176 112, 190 82, 206 84 C 222 86, 216 120, 218 132 C 220 144, 234 144, 248 128 C 256 112, 268 90, 288 86 C 266 80, 248 98, 250 118 C 252 142, 280 142, 286 116 L 290 86 C 288 104, 286 124, 290 134 C 294 146, 308 142, 318 126 C 324 110, 330 94, 334 84 C 340 94, 350 96, 358 86 C 354 104, 356 124, 362 134 C 368 144, 382 142, 394 126 C 402 112, 414 90, 434 86 C 412 80, 394 98, 396 118 C 398 142, 426 142, 432 116 L 436 86 C 434 104, 432 124, 436 134 C 440 146, 458 144, 474 124';

/** Logo mark: an open ring with one dot in its gap — a sonar ping leaving the circle (viewBox 0 0 108 108). */
export const LOGO_RING = 'M 74.67 46.48 A 22 22 0 1 1 61.52 33.33';
export const LOGO_DOT = { cx: 69.56, cy: 38.44, r: 4.5 };

export function Logo({ size = 40, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" aria-label="Sonara">
      {rounded && <rect width="108" height="108" rx="28" fill="#0b0b0c" />}
      <path d={LOGO_RING} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      <circle {...LOGO_DOT} fill="#fff" />
    </svg>
  );
}

/** Startup animation: the word is written with one continuous stroke, then dissolves. */
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(14px)', scale: 1.06 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      onClick={onDone}
    >
      <motion.div
        className="splash-glow"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      />
      <svg className="splash-word" viewBox="0 0 520 200" aria-label="sonara">
        <defs>
          <linearGradient id="sp-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.55" stopColor="var(--accent, #c4b5fd)" />
            <stop offset="1" stopColor="var(--accent-tertiary, #f0abfc)" />
          </linearGradient>
          <filter id="sp-soft" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {/* soft bloom under the stroke */}
        <motion.path
          d={SONARA_SCRIPT}
          fill="none"
          stroke="url(#sp-grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#sp-soft)"
          opacity={0.55}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.3, ease: [0.45, 0.05, 0.25, 1], delay: 0.25 }}
        />
        <motion.path
          d={SONARA_SCRIPT}
          fill="none"
          stroke="url(#sp-grad)"
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.3, ease: [0.45, 0.05, 0.25, 1], delay: 0.25 }}
        />
      </svg>
    </motion.div>
  );
}
