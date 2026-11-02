import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const { snapIndex } = await import('../src/ui/components/lensDrag');

test('snapIndex rounds to the nearest slot', () => {
  assert.equal(snapIndex(0, 90, 4), 0);
  assert.equal(snapIndex(45, 90, 4), 0, 'just under the half still rounds down');
  assert.equal(snapIndex(46, 90, 4), 1);
  assert.equal(snapIndex(180, 90, 4), 2);
  assert.equal(snapIndex(300, 90, 4), 3);
});

test('snapIndex clamps over-drag back into the strip', () => {
  assert.equal(snapIndex(-400, 90, 4), 0);
  assert.equal(snapIndex(9999, 90, 4), 3);
});

test('snapIndex does not divide by zero before the first measure', () => {
  assert.equal(snapIndex(120, 0, 4), 0);
});

test('the tab bar lens is wired to the drag: only the active tab carries the handlers', () => {
  const dock = readFileSync(new URL('../src/ui/components/Dock.tsx', import.meta.url), 'utf8');
  assert.match(dock, /useLensDrag\(\{/, 'the hook is used');
  assert.match(dock, /axis: 'x'/, 'the phone bar drags horizontally');
  assert.match(dock, /i === idx \? bind : \{\}/, 'inactive tabs stay plain buttons');
  assert.match(dock, /left: pos/, 'the lens follows the drag position');
  assert.match(dock, /id !== tab/, 'committing the same tab is a no-op (no stack reset)');
});

test('the desktop rail lens drags vertically and is measured, not hard-coded', () => {
  const rail = readFileSync(new URL('../src/ui/desktop/Rail.tsx', import.meta.url), 'utf8');
  assert.match(rail, /axis: 'y'/);
  assert.match(rail, /height: len/, 'the lens height comes from the measured button box');
  assert.doesNotMatch(rail, /layoutId="rail-lens"/, 'the layout-animation lens is gone');
});

test('a finished drag swallows the trailing click, so the tab does not flip back', () => {
  const hook = readFileSync(new URL('../src/ui/components/lensDrag.ts', import.meta.url), 'utf8');
  assert.match(hook, /onClickCapture/);
  assert.match(hook, /stopPropagation/);
  assert.match(hook, /setPointerCapture/, 'the pointer stays routed to the button during the hold');
});

test('the lift styles exist for both bars', () => {
  const app = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  const desk = readFileSync(new URL('../src/styles/desktop.css', import.meta.url), 'utf8');
  assert.match(app, /\.tabbar\.lens-drag \.tab-lens/);
  assert.match(desk, /\.rail-items\.lens-drag \.rail-lens/);
});
