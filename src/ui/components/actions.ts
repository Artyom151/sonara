import type { Track } from '../../core/types';
import { isTauri } from '../../platform';
import { toast } from './Toast';

export async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    return openUrl(url);
  }
  window.open(url, '_blank', 'noopener');
}

export async function shareTrack(track: Track, copiedLabel: string) {
  const url = track.url ?? '';
  const data = { title: track.title, text: `${track.title} — ${track.artist}`, url };
  try {
    if (navigator.share) return await navigator.share(data);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(copiedLabel);
  } catch {
    /* clipboard blocked */
  }
}
