import { useEffect, useState } from 'react';
import { useAccount } from '../../account/store';
import { isTauri } from '../../platform';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Brand';
import { useT } from '../i18n';

type Win = Awaited<ReturnType<typeof getWin>>;
export const isMac = /Mac/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
const getWin = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();

/** The brand on the left; the signed-in name and avatar on the right. */
function UserChip() {
  const t = useT();
  const profile = useAccount((s) => s.profile);
  const fallback = useSettings((s) => s.displayName);
  const setTab = useUi((s) => s.setTab);
  const name = profile?.displayName || fallback || t('listener');
  return (
    <button className="top-user glass-press" onClick={() => setTab('profile')} aria-label={t('profile')}>
      <span>{name}</span>
      <Avatar avatar={profile?.avatar} name={name} size={28} />
    </button>
  );
}

/** Window chrome: brand, user chip, a drag strip and, off macOS, minimise / maximise / close. */
export function TitleBar() {
  const setTab = useUi((s) => s.setTab);
  const [win, setWin] = useState<Win | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    getWin().then(async (w) => {
      setWin(w);
      setMaximized(await w.isMaximized());
      unlisten = await w.onResized(async () => setMaximized(await w.isMaximized()));
    });
    return () => unlisten?.();
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <button className="top-brand" onClick={() => setTab('home')} aria-label="Sonara">
        <Logo size={24} />
        <span>Sonara</span>
      </button>
      <div className="top-spacer" data-tauri-drag-region />
      <UserChip />
      {/* macOS keeps its native traffic lights (tauri.macos.conf.json). */}
      {win && !isMac && (
        <div className="win-controls">
          <button className="win-btn" aria-label="Minimize" onClick={() => win.minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.1" /></svg>
          </button>
          <button className="win-btn" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => win.toggleMaximize()}>
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
                <rect x="1" y="3" width="6" height="6" rx="1" />
                <path d="M3 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H7" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
                <rect x="1" y="1" width="8" height="8" rx="1.2" />
              </svg>
            )}
          </button>
          <button className="win-btn close" aria-label="Close" onClick={() => win.close()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.1" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
