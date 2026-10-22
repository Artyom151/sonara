import { useEffect, useState } from 'react';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { useStats } from '../store/stats';
import { collect } from './similar';
import { makeCtx, pick, strongTasteMatch } from './taste';
import { makeDaylist, slotAt } from './daylistPlan';
import { useDaylistHistory } from '../store/daylistHistory';

const shuffled = <T,>(xs: T[]) => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const SIZE = 24;

/**
 * A new daylist: the anchors vary between refreshes, tracks the listener heard lately or already
 * got in an earlier daylist are left out, one track per artist, and the order is shuffled so a
 * refresh brings a different set. When the listener has heard almost everything, the history
 * gives way so the list is never empty.
 */
export async function generateDaylist(date = new Date()): Promise<{ tracks: Track[]; tags: string[]; personalized: boolean }> {
  const library = useLibrary.getState();
  const stats = useStats.getState().timedPlays ?? [];
  const plan = makeDaylist(date, stats, library.likes, library.recent);
  const anchors = shuffled(plan.anchors.slice(0, 15)).slice(0, 5);
  const candidates = anchors.length ? await collect(anchors, plan.profile).catch(() => []) : [];
  const heardLately = new Set([...stats.slice(0, 80).map((p) => p.track.key), ...library.recent.slice(0, 40).map((t) => t.key)]);
  const history = useDaylistHistory.getState().recentKeys();
  const hard = new Set([...library.dislikes, ...plan.anchors.map((t) => t.key)]);
  const ctx = makeCtx(plan.anchors, plan.profile);
  const usable = (strict: boolean) => {
    const drop = new Set([...hard, ...heardLately, ...(strict ? history : [])]);
    return shuffled(candidates.filter((c) => !drop.has(c.track.key) && strongTasteMatch(c, ctx)));
  };
  let chosen = pick(usable(true), ctx, SIZE, 1).map((c) => c.track);
  if (chosen.length < SIZE / 2) chosen = pick(usable(false), ctx, SIZE, 1).map((c) => c.track);
  const tracks = [...new Map(chosen.map((t) => [t.key, t])).values()].slice(0, SIZE);
  useDaylistHistory.getState().record(tracks.map((t) => t.key));
  return { tracks, tags: plan.tags, personalized: plan.personalized };
}

type Snapshot = { key: number; tracks: Track[]; tags: string[]; personalized: boolean };
const CACHE = 'sonara.daylist.v2';
function readCache(): Snapshot | null {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? 'null'); } catch { return null; }
}
export function useDaylist() {
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<Snapshot | null>(() => readCache());
  const [loading, setLoading] = useState(false);
  const slot = slotAt(now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const refresh = async () => {
    setLoading(true);
    try {
      const result = await generateDaylist();
      const snapshot = { key: slotAt(new Date()).start, ...result };
      try { localStorage.setItem(CACHE, JSON.stringify(snapshot)); } catch { /* private mode or full storage */ }
      setData(snapshot);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (data?.key !== slot.start) void refresh(); }, [slot.start]);
  return { slot, data: data?.key === slot.start ? data : null, loading, refresh };
}
