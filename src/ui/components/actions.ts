import type { Track } from '../../core/types';
import { isTauri } from '../../platform';
import { toast } from './Toast';

export async function openExternal(url: string) {
  if (isTauri) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      return await openUrl(url);
    } catch (e) {
      // Never fail silently: show what went wrong and put the link on the clipboard.
      console.warn('[open]', url, e);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* no clipboard */
      }
      toast(String((e as Error)?.message ?? e));
      return;
    }
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

