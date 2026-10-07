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
            initial={{ opacity: 0, y: -30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
