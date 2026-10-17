import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { isTauri } from '.';

/**
 * Desktop (Tauri): mirrors the player into Discord Rich Presence — "Listening to <title>",
 * artist, artwork and a live progress bar. The IPC lives in src-tauri/src/discord.rs.
 * Needs a Discord Application ID (Settings → Discord); without one nothing is sent.
 */
if (isTauri) {
  let invoke: typeof import('@tauri-apps/api/core').invoke | null = null;
  const call = async (cmd: string, args?: Record<string, unknown>) => {
    invoke ??= (await import('@tauri-apps/api/core')).invoke;
    return invoke(cmd, args).catch(() => {});
  };

  let lastKey = '';
  let lastPlaying = false;
  let lastPos = 0;
  let lastSent = 0;
  let cleared = true;

  const send = () => {
    const { discordEnabled, lang } = useSettings.getState();
    // The application is the build's own (.env VITE_DISCORD_APP_ID, set for release builds); there is no setting for it.
    const discordAppId = ((import.meta.env.VITE_DISCORD_APP_ID as string | undefined) ?? '').trim();
    const s = usePlayer.getState();
    const t = s.queue[s.index];
    if (!discordEnabled || !discordAppId.trim() || !t) {
      if (!cleared) call('discord_clear');
      cleared = true;
      lastKey = '';
      return;
    }
    cleared = false;
    lastKey = t.key;
    lastPlaying = s.playing;
    lastPos = s.position;
    lastSent = Date.now();
    const duration = s.duration || t.duration;
    const start = Date.now() - s.position * 1000;
    const ru = lang === 'ru' || (lang === 'auto' && navigator.language.toLowerCase().startsWith('ru'));
    call('discord_set', {
      presence: {
        appId: discordAppId.trim(),
        title: t.title.slice(0, 120),
        artist: t.artist.slice(0, 120),
        artwork: t.artworkLarge ?? t.artwork,
        url: t.url,
        playing: s.playing,
        startMs: s.playing && duration ? Math.round(start) : null,
        endMs: s.playing && duration ? Math.round(start + duration * 1000) : null,
        pausedLabel: ru ? 'На паузе' : 'Paused',
      },
    });
  };

  usePlayer.subscribe((s) => {
    const key = s.queue[s.index]?.key ?? '';
    const expected = lastPos + (lastPlaying ? (Date.now() - lastSent) / 1000 : 0);
    const seeked = Math.abs(s.position - expected) > 3;
    // Discord rate-limits presence updates (~5 per 20 s): only send on real changes.
    if (key !== lastKey || s.playing !== lastPlaying || (seeked && Date.now() - lastSent > 1500)) send();
  });
  useSettings.subscribe((s, prev) => {
    if (s.discordEnabled !== prev.discordEnabled) send();
  });
  window.addEventListener('beforeunload', () => call('discord_clear'));
  send();
}
