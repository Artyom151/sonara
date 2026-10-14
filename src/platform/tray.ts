import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { isTauri } from '.';

/**
 * Desktop tray (src-tauri/src/tray.rs): the menu shows the track and play / next / previous;
 * "close to tray" keeps the music going when the window is closed.
 */
export const trayAvailable = async (): Promise<boolean> => {
  if (!isTauri) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('tray_available').catch(() => false);
};

const labels = () => {
  const ru = navigator.language.toLowerCase().startsWith('ru');
  return ru
    ? { prev: 'Назад', play: 'Играть', pause: 'Пауза', next: 'Далее', show: 'Открыть Sonara', quit: 'Выйти' }
    : { prev: 'Previous', play: 'Play', pause: 'Pause', next: 'Next', show: 'Show Sonara', quit: 'Quit' };
};

if (isTauri) {
  void (async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    await listen<string>('tray-action', ({ payload }) => {
      const p = usePlayer.getState();
      if (payload === 'play') p.patch({ playing: !p.playing });
      else if (payload === 'next') p.next();
      else if (payload === 'prev') p.prev();
    });

    let sig = '';
    const push = () => {
      const s = usePlayer.getState();
      const t = s.queue[s.index];
      const next = `${t?.key ?? ''}|${s.playing}`;
      if (next === sig) return;
      sig = next;
      void invoke('tray_update', { title: t?.title ?? '', artist: t?.artist ?? '', playing: s.playing, labels: labels() }).catch(() => {});
    };
    usePlayer.subscribe(push);
    push();

    const sync = () => void invoke('tray_close_to_tray', { on: useSettings.getState().closeToTray }).catch(() => {});
    useSettings.subscribe((s, prev) => s.closeToTray !== prev.closeToTray && sync());
    sync();
  })();
}
