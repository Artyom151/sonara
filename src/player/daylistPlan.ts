import type { Track } from '../core/types';
import { features, mix, topTokens, type Profile } from './taste';

const HOURS = [0, 6, 10, 14, 18, 22];
const PARTS = ['lateNight', 'morning', 'lateMorning', 'afternoon', 'evening', 'night'] as const;
export type Part = typeof PARTS[number];
export function slotAt(date: Date) {
  const hour = date.getHours();
  const index = HOURS.findLastIndex((h) => hour >= h);
  const start = new Date(date);
  start.setHours(HOURS[index], 0, 0, 0);
  const next = new Date(date);
  if (index === HOURS.length - 1) next.setDate(next.getDate() + 1);
  next.setHours(HOURS[(index + 1) % HOURS.length], 0, 0, 0);
  return { part: PARTS[index], start: start.getTime(), next: next.getTime(), index };
}

export function makeDaylist(date: Date, plays: { track: Track; at: number }[], likes: Track[], recent: Track[]) {
  const slot = slotAt(date);
  const weekday = date.getDay();
  const sameTime = plays.filter((p) => slotAt(new Date(p.at)).part === slot.part);
  const sameDay = sameTime.filter((p) => new Date(p.at).getDay() === weekday);
  const seeds = [...sameDay.slice(0, 12), ...sameTime.slice(0, 20)].map((p) => p.track);
  const unique = (xs: Track[]) => [...new Map(xs.map((x) => [x.key, x])).values()];
  const anchors = unique([...seeds, ...likes.slice(0, 12), ...recent.slice(0, 12)]);
  const profile: Profile = {};
  seeds.forEach((t, i) => mix(profile, features(t), 2 / (1 + i * 0.08)));
  likes.slice(0, 15).forEach((t, i) => mix(profile, features(t), 0.7 / (1 + i * 0.08)));
  recent.slice(0, 12).forEach((t) => mix(profile, features(t), 0.3));
  return { ...slot, anchors, profile, tags: topTokens(profile, 'g:', 2), personalized: sameTime.length > 0 };
}

