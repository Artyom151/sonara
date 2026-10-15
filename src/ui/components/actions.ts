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

/**
 * Share a moment of a track: the card as a short video when the platform records it, else as an
 * image. Uses the system share sheet when there is one, otherwise saves the file.
 */
export async function shareMoment(track: Track, position: number, savedLabel: string) {
  const { loadArt, cardPng, cardVideo } = await import('../../player/moment');
  const art = await loadArt(track.artworkLarge ?? track.artwork);
  const data = { title: track.title, artist: track.artist, position, duration: track.duration || 0, art };
  const video = await cardVideo(data).catch(() => null);
  const file = video
    ? new File([video], 'sonara-moment.' + (video.type.includes('mp4') ? 'mp4' : 'webm'), { type: video.type })
    : await cardPng(data).then((b) => (b ? new File([b], 'sonara-moment.png', { type: 'image/png' }) : null));
  if (!file) return toast(savedLabel);
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: track.title, text: `${track.title} — ${track.artist}` });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(savedLabel);
}
