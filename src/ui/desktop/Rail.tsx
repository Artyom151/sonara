import { motion, useTransform } from 'motion/react';
import { useRef } from 'react';
import { useUi, type Tab } from '../../store/ui';
import { useT } from '../i18n';
import { IconHeart, IconHome, IconPerson, IconSearch } from '../icons';
import { useLensDrag } from '../components/lensDrag';

const ITEMS: { id: Tab; icon: (active: boolean) => React.ReactNode }[] = [
  { id: 'home', icon: (a) => <IconHome size={21} filled={a} /> },
  { id: 'search', icon: () => <IconSearch size={21} /> },
  { id: 'likes', icon: (a) => <IconHeart size={21} filled={a} /> },
  { id: 'profile', icon: (a) => <IconPerson size={21} filled={a} /> },
];

/** The floating icon rail; it sits on the left or the right (Settings → Sidebar). */
export function Rail() {
  const t = useT();
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const idx = ITEMS.findIndex((x) => x.id === tab);
  const navRef = useRef<HTMLDivElement>(null);
  const { pos, stretch, dragging, len, bind } = useLensDrag({
    navRef,
    idx,
    count: ITEMS.length,
    axis: 'y',
    inset: 0,
    commit: (i) => {
      const id = ITEMS[i]?.id;
      if (id && id !== tab) setTab(id);
    },
  });
  const scaleY = useTransform(stretch, (s) => 1 + Math.abs(s));
  const scaleX = useTransform(stretch, (s) => 1 - Math.abs(s) * 0.5);
  return (
    <nav className="rail">
      <div ref={navRef} className={`rail-items glass refract${dragging ? ' lens-drag' : ''}`}>
        <motion.div className="rail-lens" style={{ top: pos, height: len || 44, scaleY, scaleX }} />
        {ITEMS.map((x, i) => (
          <button
            key={x.id}
            className={`rail-btn ${tab === x.id ? 'active' : ''}`}
            onClick={() => setTab(x.id)}
            title={t(x.id)}
            aria-label={t(x.id)}
            {...(i === idx ? bind : {})}
          >
            {x.icon(tab === x.id)}
          </button>
        ))}
      </div>
    </nav>
  );
}
