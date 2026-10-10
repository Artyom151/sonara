import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headphoneModel } from '../src/platform/headphones';

test('headphone model from the advertised name', () => {
  const cases: [string, string][] = [
    ["Arvind's AirPods Pro", 'airpods-pro'],
    ['AirPods Pro (2nd generation)', 'airpods-pro'],
    ['AirPods Max', 'airpods-max'],
    ['AirPods (3rd generation)', 'airpods3'],
    ['AirPods 4', 'airpods3'],
    ['Артём AirPods', 'airpods'],
    ['Galaxy Buds2 Pro', 'buds'],
    ['Pixel Buds Pro', 'buds'],
    ['WF-1000XM5', 'buds'],
    ['HUAWEI FreeBuds 5i', 'buds'],
    ['Nothing Ear (2)', 'buds'],
    ['WH-1000XM5', 'over-ear'],
    ['Bose QC45', 'over-ear'],
    ['Beats Studio Pro', 'over-ear'],
  ];
  for (const [name, model] of cases) assert.equal(headphoneModel(name), model, name);
  assert.equal(headphoneModel('Headphones', 'wired'), 'wired');
  assert.equal(headphoneModel('USB-C to 3.5mm', 'usb'), 'wired');
});
