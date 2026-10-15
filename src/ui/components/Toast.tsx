import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { useSettings } from '../../store/settings';
import { pushNotice } from '../../store/islandNotice';

const useToasts = create<{ items: { id: number; text: string }[] }>(() => ({ items: [] }));
let n = 0;

/**
 * One message for the user. With the island player on, it takes the island (like every other
 * notice); otherwise it is a toast.
 */
export function toast(text: string) {
  if (useSettings.getState().islandPlayer) return pushNotice({ kind: 'queue', text });
  const id = ++n;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 2600);
}

export function Toasts() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toasts">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            className="toast glass dark"
            // Transform only on the glass, so its blur is there from the first frame; the text fades.
            initial={{ y: -80, scale: 0.8 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -80, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {t.text}
            </motion.span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
