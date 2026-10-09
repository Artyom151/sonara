import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';

const useToasts = create<{ items: { id: number; text: string }[] }>(() => ({ items: [] }));
let n = 0;

export function toast(text: string) {
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
