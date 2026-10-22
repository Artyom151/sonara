import { App as CapApp } from '@capacitor/app';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { isCapacitor } from '../platform';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi, type Tab } from '../store/ui';
import { ThemeController } from '../theme/ThemeController';
import { useAccount } from '../account/store';
import { Splash } from './components/Brand';
import { Dock } from './components/Dock';
import { Modals } from './components/Modals';
import { Player } from './components/Player';
import { PlayerBar } from './desktop/PlayerBar';
import { Rail } from './desktop/Rail';
import { TitleBar, isMac } from './desktop/TitleBar';
import { isTauri } from '../platform';
import { useDesktop } from './useMedia';
import { Toasts } from './components/Toast';
import { WhySheet } from './components/WhySheet';
import { IslandPlayer } from './components/IslandPlayer';
import { UpdateNotice } from './components/UpdateNotice';
import { Handoff } from './components/Handoff';
import { RouteView } from './screens/Detail';
import { StatsScreen } from './screens/Stats';
import { Home } from './screens/Home';
import { Likes } from './screens/Likes';
import { Profile } from './screens/Profile';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { WaveScreen } from './screens/Wave';
import { DaylistScreen } from './screens/Daylist';

const ROOTS: Record<Tab, () => React.ReactNode> = {
  home: () => <Home />,
  search: () => <Search />,
  likes: () => <Likes />,
  profile: () => <Profile />,
};

/** Each tab keeps its own navigation stack; screens slide in like a UINavigationController. */
function TabStack({ tab }: { tab: Tab }) {
  const stack = useUi((s) => s.stacks[tab]);
  const active = useUi((s) => s.tab === tab);
  const top = stack.at(-1);
  return (
    <div className="tab-stack" style={{ position: 'absolute', inset: 0, display: active ? 'block' : 'none' }}>
      {ROOTS[tab]()}
      <AnimatePresence initial={false}>
        {stack.map((r, i) => (
          <motion.div
            key={`${i}-${r.name}`}
            style={{ position: 'absolute', inset: 0, zIndex: 10 + i, boxShadow: '-20px 0 40px rgb(0 0 0 / .4)' }}
            initial={{ x: '100%' }}
            animate={{ x: r === top ? 0 : '-25%' }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            {r.name === 'settings' ? <Settings /> : r.name === 'wave' ? <WaveScreen /> : r.name === 'daylist' ? <DaylistScreen /> : r.name === 'stats' ? <StatsScreen /> : <RouteView r={r} />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function App() {
  const desktop = useDesktop();
  const showSplash = useSettings((s) => s.showSplash);
  const island = useSettings((s) => s.islandPlayer);
  useEffect(() => {
    document.documentElement.dataset.island = island ? (desktop ? 'desk' : '1') : '0';
  }, [island, desktop]);
  const [splash, setSplash] = useState(showSplash);
  const done = useCallback(() => setSplash(false), []);

  useEffect(() => {
    useAccount.getState().init();
  }, []);

  useEffect(() => {
    const back = () => {
      const p = usePlayer.getState();
      if (useUi.getState().modals.length) return useUi.getState().close(), true;
      if (p.expanded) return p.setExpanded(false), true;
      return useUi.getState().back();
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === 'Escape') back();
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        import('../player/engine').then((m) => m.togglePlay());
      }
    };
    window.addEventListener('keydown', onKey);
    const sub = isCapacitor ? CapApp.addListener('backButton', () => !back() && CapApp.minimizeApp()) : null;
    return () => {
      window.removeEventListener('keydown', onKey);
      sub?.then((s) => s.remove());
    };
  }, []);

  return (
    <div className={`app ${desktop ? 'desk' : ''} ${desktop && island ? 'island-mode' : ''} ${isTauri && isMac ? 'mac' : ''}`}>
      <ThemeController />
      {desktop && <TitleBar />}
      {desktop && <Rail />}
      <main className="main">
        {(['home', 'search', 'likes', 'profile'] as Tab[]).map((t) => (
          <TabStack key={t} tab={t} />
        ))}
        {!desktop && <Dock />}
        {!desktop && island && <IslandPlayer />}
      </main>
      {desktop && !island && <PlayerBar />}
      {desktop && island && <IslandPlayer desktop />}
      <Player />
      <Modals />
      <Toasts />
      <WhySheet />
      <UpdateNotice />
      <Handoff />
      <AnimatePresence>{splash && <Splash key="splash" onDone={done} />}</AnimatePresence>
    </div>
  );
}
