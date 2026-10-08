import { Capacitor, registerPlugin } from '@capacitor/core';
import { setPoTokenProvider } from '../core/potoken';
import { isCapacitor, isTauri } from '.';

/**
 * PO token hosts (see core/potoken.ts): BotGuard has to run on the youtube.com origin, so the
 * native shells mint in a hidden page of their own.
 */
if (isTauri) {
  setPoTokenProvider(async (videoId) => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('pot_mint', { videoId });
  });
} else if (isCapacitor && Capacitor.getPlatform() === 'android') {
  const PoToken = registerPlugin<{ mint(o: { videoId: string }): Promise<{ token: string }> }>('PoToken');
  setPoTokenProvider(async (videoId) => (await PoToken.mint({ videoId })).token);
}
