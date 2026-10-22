import { useEffect, useState } from 'react';
import type { Track } from '../core/types';
import { useLibrary } from '../store/library';
import { useStats } from '../store/stats';
import { collect } from './similar';
import { makeCtx, pick, strongTasteMatch } from './taste';
import { makeDaylist, slotAt } from './daylistPlan';

export async function generateDaylist(date = new Date()): Promise<{ tracks: Track[]; tags: string[]; personalized: boolean }> {
  const library = useLibrary.getState();
  const plan = makeDaylist(date, useStats.getState().timedPlays ?? [], library.likes, library.recent);
  const anchors = plan.anchors;
  const candidates = anchors.length ? await collect(anchors.slice(0, 5), plan.profile).catch(() => []) : [];
  const excluded = new Set([...library.dislikes, ...anchors.map((t) => t.key), ...(useStats.getState().timedPlays ?? []).map((p) => p.track.key)]);
  const ctx = makeCtx(anchors, plan.profile);
  const chosen = candidates.length ? pick(candidates.filter((c) => !excluded.has(c.track.key) && strongTasteMatch(c, ctx)), ctx, 24).map((c) => c.track) : [];
  const tracks = chosen.filter((t, i, all) => !excluded.has(t.key) && all.findIndex((x) => x.key === t.key) === i).slice(0, 24);
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
