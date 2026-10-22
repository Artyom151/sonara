import { useUi } from '../../store/ui';
import { ListeningStats } from '../components/ListeningStats';
import { useT } from '../i18n';
import { IconChevronLeft } from '../icons';

/** Listening statistics on their own screen, opened from the profile (not a tab in the navbar). */
export function StatsScreen() {
  const t = useT();
  const pop = useUi((s) => s.pop);
  return (
    <div className="screen">
      <div className="nav-bar">
        <button className="glass glass-icon glass-press" onClick={pop} aria-label={t('back')}>
          <IconChevronLeft size={20} />
        </button>
        <div className="title">{t('statsTitle')}</div>
        <div style={{ width: 44 }} />
      </div>
      <ListeningStats />
    </div>
  );
}
