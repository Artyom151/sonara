import { pushNotice, tr } from '../store/islandNotice';

/** Connection state for the island player: "No connection" / "Back online". */
let wasOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

window.addEventListener('offline', () => {
  wasOffline = true;
  pushNotice({ kind: 'offline', text: tr('No connection', 'Нет сети'), detail: tr('Downloaded tracks still play', 'Скачанные треки играют') }, 4500);
});
window.addEventListener('online', () => {
  if (!wasOffline) return;
  wasOffline = false;
  pushNotice({ kind: 'online', text: tr('Back online', 'Сеть вернулась') }, 2600);
});
