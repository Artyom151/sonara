import type { LyricLine } from '../core/types';

export interface CensorInterval {
  start: number;
  end: number;
}

const ENGLISH = [
  'fuck', 'motherfuck', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'cock', 'piss', 'cum',
  'nigger', 'nigga', 'faggot',
];
const SLAVIC = [
  'бляд', 'блят', 'хуй', 'хуё', 'хуе', 'пизд', 'еба', 'ебал', 'ебат', 'ебуч', 'ебан', 'ёб', 'муда', 'пидор', 'пидар', 'сук',
  'залуп', 'шлюх', 'мраз', 'трах', 'дроч', 'нахер', 'нахуй', 'нихуя', 'похер', 'похуй', 'хер', 'говн', 'дерьм', 'сран',
  'ссан', 'засран', 'жоп', 'поган', 'їба', 'їбал', 'йоба', 'йобан', 'єба', 'єбан', 'підар', 'підор', 'гівн',
];

const confusable: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '|': 'i',
  а: 'a', А: 'a', е: 'e', Е: 'e', о: 'o', О: 'o', р: 'p', Р: 'p', с: 'c', С: 'c', х: 'x', Х: 'x',
};

export function normalizeCensorWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[0-9@$|]/g, (c) => confusable[c] ?? c)
    .replace(/[АЕОРСХаеорсх]/g, (c) => confusable[c] ?? c)
    .replace(/[^a-zа-яіїєґ]/gi, '');
}

const slavicConfusable: Record<string, string> = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', b: 'б', h: 'н', i: 'і' };
const isProfane = (value: string) => {
  const word = normalizeCensorWord(value);
  if (!word) return false;
  const slavic = word.replace(/[a-z]/g, (c) => slavicConfusable[c] ?? c);
  return ENGLISH.some((root) => word === root || (root.length >= 4 && word.startsWith(root))) || SLAVIC.some((root) => slavic.startsWith(root));
};

export function hasProfanity(text: string): boolean {
  return text.split(/\s+/).some(isProfane);
}

function spokenWeight(word: string): number {
  const syllables = word.match(/[aeiouyаеёиоуыэюяєії]+/gi)?.length ?? 1;
  return 0.08 + Math.max(0.45, syllables * 0.32);
}

function estimatedWordIntervals(line: LyricLine, lineEnd: number): CensorInterval[] {
  const words = [...line.text.matchAll(/\S+/g)].map((word) => ({ text: word[0], weight: spokenWeight(word[0]) }));
  const duration = Math.max(0.5, lineEnd - line.time);
  const total = Math.max(0.01, words.reduce((sum, word) => sum + word.weight, 0));
  let elapsed = 0;
  return words.flatMap((word) => {
    const start = line.time + (elapsed / total) * duration;
    elapsed += word.weight;
    const end = line.time + (elapsed / total) * duration;
    if (!isProfane(word.text)) return [];
    return [{ start: Math.max(line.time - 0.06, start - 0.1), end: Math.min(lineEnd, Math.max(start + 0.35, end + 0.12)) }];
  });
}

const merge = (items: CensorInterval[]): CensorInterval[] => {
  const sorted = items.filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
  const out: CensorInterval[] = [];
  for (const item of sorted) {
    const last = out.at(-1);
    if (last && item.start <= last.end + 0.12) last.end = Math.max(last.end, item.end);
    else out.push({ ...item });
  }
  return out;
};

export function censorIntervals(lines: LyricLine[], duration = Infinity): CensorInterval[] {
  const intervals: CensorInterval[] = [];
  lines.forEach((line, index) => {
    const lineEnd = lines[index + 1]?.time ?? duration;
    if (line.words?.length) {
      line.words.forEach((word, wordIndex) => {
        if (!isProfane(word.text)) return;
        const next = line.words![wordIndex + 1]?.time ?? lineEnd;
        intervals.push({ start: Math.max(0, word.time - 0.08), end: Math.min(lineEnd, Math.max(word.time + 0.45, next + 0.04)) });
      });
    } else {
      intervals.push(...estimatedWordIntervals(line, Math.min(lineEnd, line.time + 12)));
    }
  });
  return merge(intervals);
}

export function isCensoredAt(intervals: CensorInterval[], position: number): boolean {
  let lo = 0;
  let hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const current = intervals[mid];
    if (position < current.start) hi = mid - 1;
    else if (position > current.end) lo = mid + 1;
    else return true;
  }
  return false;
}
