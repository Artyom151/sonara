import { Capacitor, registerPlugin } from '@capacitor/core';
import { poToken, setPoTokenProvider } from '../core/potoken';
import { setAudioContainer } from '../core/youtube';
import { isCapacitor, isTauri } from '.';

/**
 * PO token hosts (see core/potoken.ts): BotGuard has to run on the youtube.com origin, so the
 * native shells mint in a hidden page of their own.
 */
if (isTauri) {
  setAudioContainer('webm');
  setPoTokenProvider(async (videoId) => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('pot_mint', { videoId });
  });
} else if (isCapacitor && Capacitor.getPlatform() === 'android') {
  setAudioContainer('webm');
  const PoToken = registerPlugin<{ mint(o: { videoId: string }): Promise<{ token: string }> }>('PoToken');
  setPoTokenProvider(async (videoId) => (await PoToken.mint({ videoId })).token);
}

// Warm up: building the minter (BotGuard VM + GenerateIT) is the slow part, a few seconds on a
// slow phone. Do it once in the background so the first YouTube/Deezer track starts quickly.
if (isTauri || (isCapacitor && Capacitor.getPlatform() === 'android')) {
  setTimeout(() => void poToken(() => Promise.reject(new Error('unused')), 'dQw4w9WgXcQ').catch(() => {}), 4000);
}
