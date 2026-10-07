import { useLibrary } from '../store/library';

/** Time (performance.now) of the last "added to Likes"; visuals read it to flare. */
export const likePulse = { at: -1e9 };

let prev = new Set(useLibrary.getState().likes.map((t) => t.key));
useLibrary.subscribe((s) => {
  const next = new Set(s.likes.map((t) => t.key));
  for (const k of next) if (!prev.has(k)) likePulse.at = performance.now();
  prev = next;
});
