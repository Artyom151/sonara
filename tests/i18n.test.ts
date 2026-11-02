import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as any).navigator ??= { language: 'en-US' };

const { en, ru, resolveLang, compact, fmtTime } = await import('../src/ui/i18n');

test('the ru dictionary covers every key of en (and nothing extra)', () => {
  const enKeys = Object.keys(en);
  const ruKeys = new Set(Object.keys(ru));
  const missing = enKeys.filter((k) => !ruKeys.has(k));
  const extra = [...ruKeys].filter((k) => !(k in en));
  assert.deepEqual(missing, [], 'ru misses translations');
  assert.deepEqual(extra, [], 'ru has stale keys without an en source');
  assert.ok(enKeys.length > 100, 'the dictionary is not truncated');
});

test('no translation is empty or not a string', () => {
  for (const [k, v] of Object.entries(ru)) {
    assert.equal(typeof v, 'string', `ru.${k}`);
    assert.ok((v as string).length > 0, `ru.${k} is empty`);
  }
  for (const [k, v] of Object.entries(en)) {
    assert.equal(typeof v, 'string', `en.${k}`);
    assert.ok((v as string).length > 0, `en.${k} is empty`);
  }
});

test('placeholders match between the languages, so interpolation cannot break', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const k of Object.keys(en)) {
    assert.deepEqual(ph(en[k as keyof typeof en]), ph(ru[k as keyof typeof ru]), `placeholder mismatch in ${k}`);
  }
});

test('no translation is identical non-trivial text reused for both languages', () => {
  // Distinguishable pairs only: short words, numbers and source names are the same in both.
  const same = Object.keys(en).filter((k) => {
    const a = en[k as keyof typeof en] as string;
    const b = ru[k as keyof typeof ru] as string;
    return a === b && /[a-z]{4,}/.test(a) && !/^(sonara|soundcloud|youtube|deezer|yandex)/i.test(a);
  });
  assert.ok(same.length < 10, `suspected untranslated keys: ${same.join(', ')}`);
});

test('resolveLang follows the explicit setting and falls back to the system language', () => {
  assert.equal(resolveLang('ru'), 'ru');
  assert.equal(resolveLang('en'), 'en');
  const lang = (l: string) => Object.defineProperty(globalThis, 'navigator', { value: { language: l }, configurable: true });
  lang('ru-RU');
  assert.equal(resolveLang('auto'), 'ru');
  lang('en');
  assert.equal(resolveLang('auto'), 'en');
});

test('compact formats counts the way the interface shows them', () => {
  assert.equal(compact(undefined), '');
  assert.equal(compact(999), '999');
  assert.equal(compact(1000), '1.0 K');
  assert.equal(compact(25000), '25 K');
  assert.equal(compact(1200000), '1.2M');
  assert.equal(compact(2000000), '2.0M');
});

test('fmtTime renders minutes:seconds and clamps broken values to zero', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(59), '0:59');
  assert.equal(fmtTime(61), '1:01');
  assert.equal(fmtTime(3599), '59:59');
  assert.equal(fmtTime(-5), '0:00');
  assert.equal(fmtTime(NaN), '0:00');
});
