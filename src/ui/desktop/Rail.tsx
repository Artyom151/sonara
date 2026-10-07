import { motion } from 'motion/react';
import { useAccount } from '../../account/store';
import { Avatar } from '../components/Avatar';
import { useUi, type Tab } from '../../store/ui';
import { Logo } from '../components/Brand';
import { useT } from '../i18n';
import { IconHeart, IconHome, IconPerson, IconSearch } from '../icons';

const ITEMS: { id: Tab; icon: (a: boolean) => React.ReactNode }[] = [
  { id: 'search', icon: () => <IconSearch size={22} /> },
  { id: 'home', icon: (a) => <IconHome size={22} filled={a} /> },
  { id: 'likes', icon: (a) => <IconHeart size={22} filled={a} /> },
];

/** Narrow icon rail: logo on top, sections, profile avatar at the bottom. */
export function Rail() {
  const t = useT();
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const profile = useAccount((s) => s.profile);
  return (
    <nav className="rail" data-tauri-drag-region>
      <button className="rail-logo" onClick={() => setTab('home')} aria-label="Sonara">
        <Logo size={36} />
      </button>
      <div className="rail-items">
        {ITEMS.map((x) => (
          <button key={x.id} className={`rail-btn ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)} title={t(x.id)} aria-label={t(x.id)}>
            {tab === x.id && <motion.span layoutId="rail-lens" className="rail-lens glass" transition={{ type: 'spring', stiffness: 460, damping: 34 }} />}
            {x.icon(tab === x.id)}
          </button>
        ))}
      </div>
      <button className={`rail-avatar ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')} title={t('profile')} aria-label={t('profile')}>
        {profile ? (
          <Avatar avatar={profile.avatar} name={profile.displayName} size={38} />
        ) : (
          <span>
            <IconPerson size={18} />
          </span>
        )}
      </button>
    </nav>
  );
}
