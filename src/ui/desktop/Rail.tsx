import { motion, useTransform } from 'motion/react';
import { useRef } from 'react';
import { useLensDrag } from '../components/lensDrag';
import { useUi, type Tab } from '../../store/ui';
import { useT } from '../i18n';
import { IconHeart, IconHome, IconPerson, IconSearch } from '../icons';

const ITEMS: { id: Tab; icon: (active: boolean) => React.ReactNode }[] = [
  { id: 'home', icon: (active) => <IconHome size={21} filled={active} /> },
  { id: 'search', icon: () => <IconSearch size={21} /> },
  { id: 'likes', icon: (active) => <IconHeart size={21} filled={active} /> },
  { id: 'profile', icon: (active) => <IconPerson size={21} filled={active} /> },
];

export function Rail() {
  const t = useT();
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const index = ITEMS.findIndex((item) => item.id === tab);
  const navRef = useRef<HTMLDivElement>(null);
  const { pos, stretch, dragging, len, bind } = useLensDrag({
    navRef,
    idx: index,
    count: ITEMS.length,
    axis: 'y',
    inset: 0,
    commit: (next) => {
      const id = ITEMS[next]?.id;
      if (id && id !== tab) setTab(id);
    },
  });
  const scaleY = useTransform(stretch, (value) => 1 + Math.abs(value));
  const scaleX = useTransform(stretch, (value) => 1 - Math.abs(value) * 0.5);
  return (
    <nav className="rail" aria-label="Main navigation">
      <div ref={navRef} className={`rail-items glass ${dragging ? 'lens-drag' : ''}`}>
        <motion.div className="rail-lens" style={{ top: pos, height: len || 44, scaleX, scaleY }} aria-hidden />
        {ITEMS.map((item, i) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              className={`rail-btn ${active ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
              title={t(item.id)}
              aria-label={t(item.id)}
              aria-current={active ? 'page' : undefined}
              {...(i === index ? bind : {})}
            >
              {item.icon(active)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
