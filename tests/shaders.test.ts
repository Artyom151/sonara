import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAGMENT, VERTEX } from '../src/ui/glass/shaders';
import { GLASS_PRESETS, MENU_SPRING } from '../src/ui/glass/sdk';

test('the WebGL2 port keeps the original Liquid Glass optics', () => {
  assert.match(VERTEX, /^#version 300 es/);
  assert.match(FRAGMENT, /^#version 300 es/);
  assert.match(FRAGMENT, /float roundedBoxSDF/);
  assert.match(FRAGMENT, /uRefraction\.y \* pow\(uRefraction\.z \* E/);
  assert.match(FRAGMENT, /sin\(atan\(p\.y, p\.x\) - 0\.5\)/);
});

test('one render produces displacement, light and alpha together', () => {
  assert.match(FRAGMENT, /vec4\(clamp\(0\.5 \+ displacement \/ uDispScale/);
  assert.match(FRAGMENT, /light, alpha\)/);
  assert.doesNotMatch(FRAGMENT, /uMode|Sampler0/);
});

test('SDK presets use the original refraction curve and compositor-friendly menus', () => {
  for (const preset of Object.values(GLASS_PRESETS)) assert.deepEqual(preset.refraction, [0.7, 2.3, 5.2, 6.9]);
  assert.equal(MENU_SPRING.type, 'spring');
  assert.ok(MENU_SPRING.damping > 30);
});
