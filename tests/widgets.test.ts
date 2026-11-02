import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * The Material You accent of the home-screen widgets is resolved on the device (system_accent1_200),
 * with the built-in violet as a fallback for Android < 12. The Java sources cannot run in node, so
 * their wiring is verified here — the way release.test.ts verifies the release script.
 */
const java = (name: string) => readFileSync(new URL(`../android/app/src/main/java/app/sonara/music/${name}`, import.meta.url), 'utf8');
const shapes = java('WidgetShapes.java');

test('the play/pause button and the previews take the accent as an argument, not a constant', () => {
  assert.match(shapes, /static Bitmap playButton\(boolean playing, int accent\)/);
  assert.match(shapes, /static Bitmap preview\(int shape, int size, int accent\)/);
  assert.match(shapes, /paint\.setColor\(accent\)/);
  // The constant may only remain as the fallback, never as the fill of what the user sees.
  const fills = [...shapes.matchAll(/paint\.setColor\(([^)]+)\)/g)].map((m) => m[1]);
  for (const f of fills) assert.notEqual(f, 'ACCENT_COLOR', 'a static fill leaked back into the drawing code');
});

test('the accent follows the wallpaper palette on Android 12+ and falls back safely', () => {
  assert.match(shapes, /static int accent\(Context context\)/);
  assert.match(shapes, /system_accent1_200/, 'the light tone of the wallpaper accent');
  assert.match(shapes, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.S/, 'the palette needs Android 12');
  const fallbacks = shapes.match(/return ACCENT_COLOR;/g) ?? [];
  assert.ok(fallbacks.length >= 2, 'both the old-API and the error paths fall back');
});

test('every widget render path passes the resolved accent', () => {
  assert.match(java('SonaraWidget.java'), /playButton\(lastPlaying, WidgetShapes\.accent\(context\)\)/);
  const config = java('WidgetConfigActivity.java');
  assert.match(config, /bg\.setStroke\(dp\(2\), WidgetShapes\.accent\(this\)\)/);
  assert.match(config, /preview\(shape, dp\(56\), WidgetShapes\.accent\(this\)\)/);
});

test('the glyph stays dark over the light accent tone', () => {
  assert.match(shapes, /paint\.setColor\(GLYPH\)/);
  assert.match(shapes, /GLYPH = 0xFF101014/);
});

test('every shape name has a Material 3 preset behind it', () => {
  const block = shapes.slice(shapes.indexOf('NAMES = {'), shapes.indexOf('};'));
  const names = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const presets = [...shapes.matchAll(/MaterialShapes\.Companion\.get\w+\(\)/g)].length;
  const cases = [...shapes.matchAll(/case \d+: return/g)].length;
  assert.equal(names.length, presets, 'NAMES entries and preset getters match');
  assert.equal(names.length, cases + 1, 'the last name is the switch default');
  assert.ok(names.length >= 30, 'the picker keeps its full choice');
});

test('the system palette plugin exposes the Material You slots the app builds its colours from', () => {
  const plugin = java('DynamicColorPlugin.java');
  for (const slot of ['seed', 'accent1', 'accent2', 'accent3', 'neutral1']) {
    assert.match(plugin, new RegExp(`result\\.put\\("${slot}"`));
  }
  assert.match(plugin, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.S/, 'unsupported devices resolve, not crash');
});

test('all three widget sizes share the same button wiring', () => {
  const sonara = java('SonaraWidget.java');
  for (const layout of ['widget_player', 'widget_cover', 'widget_large']) {
    assert.match(sonara, new RegExp(`R\\.layout\\.${layout}`));
  }
  assert.match(sonara, /R\.id\.widget_play/, 'the play control exists on every size');
});
