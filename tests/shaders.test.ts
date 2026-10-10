import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error plain .mjs script
import { build } from '../scripts/gen-shaders.mjs';
import { FRAGMENT, VERTEX } from '../src/ui/glass/shaders';

test('shaders.ts is generated from the original glass.vsh / glass.fsh', () => {
  assert.equal(readFileSync(new URL('../src/ui/glass/shaders.ts', import.meta.url), 'utf8'), build());
});

test('the port keeps the original shader maths', () => {
  const orig = readFileSync(new URL('../src/ui/glass/glass.fsh', import.meta.url), 'utf8');
  // Every function of the original is present, unchanged, in the WebGL2 port.
  for (const name of ['roundedBoxSDF', 'cornerCutSDF', 'rectSDF', 'smoothUnion', 'rectUv', 'glassDistortion']) {
    const body = (src: string) => src.match(new RegExp(`(?:float|vec2) ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(body(orig), `${name} missing in glass.fsh`);
    assert.equal(body(FRAGMENT), body(orig), `${name} differs in the port`);
  }
  assert.match(VERTEX, /^#version 300 es/);
  assert.match(FRAGMENT, /^#version 300 es/);
});
