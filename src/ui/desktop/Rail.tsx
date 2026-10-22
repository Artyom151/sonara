import { motion } from 'motion/react';
import { useUi, type Tab } from '../../store/ui';
import { useT } from '../i18n';
import { IconHeart, IconHome, IconPerson, IconSearch } from '../icons';

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
  return (
    <nav className="rail">
      <div className="rail-items glass refract">
        {ITEMS.map((x) => (
          <button key={x.id} className={`rail-btn ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)} title={t(x.id)} aria-label={t(x.id)}>
            {tab === x.id && <motion.span layoutId="rail-lens" className="rail-lens" transition={{ type: 'spring', stiffness: 460, damping: 34 }} />}
            {x.icon(tab === x.id)}
          </button>
        ))}
      </div>
    </nav>
  );
}
