import { api } from '../core';
import type { Lyrics, LyricLine, Track } from '../core/types';
import { usePlayer } from '../store/player';
import { indexAt } from './lyricIndex';

/**
 * The current line of the synced lyrics, for the system notification and the home screen widget
 * (Android). The lines are fetched once per track; `send` is called only when the line changes.
 */
const cache = new Map<string, Promise<Lyrics | null>>();

const lyricsFor = (t: Track) => {
  let hit = cache.get(t.key);
  if (!hit) {
    hit = api.lyrics(t).catch(() => null);
    cache.set(t.key, hit);
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  }
  return hit;
};

export function startLyricLine(send: (text: string) => void) {
  let key = '';
  let lines: LyricLine[] = [];
  let last = -2;

  const update = (pos: number) => {
    if (!lines.length) return;
    const i = indexAt(lines, pos);
    if (i === last) return;
    last = i;
    send(i < 0 ? '' : lines[i].text);
  };

  usePlayer.subscribe((s) => {
    const t = s.queue[s.index];
    const next = t?.key ?? '';
    if (next !== key) {
      key = next;
      lines = [];
      last = -2;
      send('');
      if (t) {
        const want = t.key;
        void lyricsFor(t).then((l) => {
          if (key !== want) return;
          lines = (l?.synced ?? []).filter((x) => x.text.trim());
          update(usePlayer.getState().position);
        });
      }
    }
    update(s.position);
  });
}
