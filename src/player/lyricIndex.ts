import type { LyricLine } from '../core/types';

/** Index of the last line that has started by `pos` (-1 before the first one). */
export function indexAt(lines: LyricLine[], pos: number) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= pos + 0.25) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
