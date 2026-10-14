import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';

/**
 * Easter egg: five quick taps on "Check for updates" in Settings open a confetti card.
 * Tap anywhere or wait a few seconds to close it.
 */
export const useParty = create<{ open: boolean }>(() => ({ open: false }));

const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];

export function PartyLayer() {
  const t = useT();
  const open = useParty((s) => s.open);
  // A fresh set of pieces each time the card opens.
  const pieces = useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 160,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.4,
      })),
    [open],
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="party"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => useParty.setState({ open: false })}
        >
          {pieces.map((p) => (
            <span
              key={p.id}
              className="party-piece"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 0.45,
                background: p.color,
                borderRadius: p.round ? '50%' : 2,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                ['--drift' as string]: `${p.drift}px`,
              }}
            />
          ))}
          <motion.div className="party-card" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
            <div className="party-title">{t('partyTitle')}</div>
            <div className="party-sub">{t('partySub')}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
