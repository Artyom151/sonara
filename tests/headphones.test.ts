import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headphoneImage } from '../src/platform/headphoneImages';
import { headphoneModel } from '../src/platform/headphones';

test('headphone model from the advertised name', () => {
  const cases: [string, string][] = [
    ["Arvind's AirPods Pro", 'airpods-pro'],
    ['AirPods Pro (2nd generation)', 'airpods-pro'],
    ['AirPods Max', 'airpods-max'],
    ['AirPods (3rd generation)', 'airpods3'],
    ['AirPods 4', 'airpods3'],
    ['Артём AirPods', 'airpods'],
    ['Galaxy Buds2 Pro', 'buds-pod'],
    ['Galaxy Buds3', 'buds-stem'],
    ['Galaxy Buds Live', 'buds-bean'],
    ['Galaxy Buds+', 'buds-round'],
    ['Galaxy Buds (2019)', 'buds-round'],
    ['Galaxy Buds (A1B2)', 'buds-round'],
    ['Galaxy Buds3 Pro', 'buds-stem-tip'],
    ['Pixel Buds Pro', 'buds-stem-tip'],
    ['Pixel Buds A-Series', 'buds-stem'],
    ['WF-1000XM5', 'buds-pod'],
    ['HUAWEI FreeBuds 5i', 'buds-pod'],
    ['Nothing Ear (2)', 'buds-pod'],
    ['WH-1000XM5', 'over-ear'],
    ['Bose QC45', 'over-ear'],
    ['Beats Studio Pro', 'over-ear'],
  ];
  for (const [name, model] of cases) assert.equal(headphoneModel(name), model, name);
  assert.equal(headphoneModel('Headphones', 'wired'), 'wired');
  assert.equal(headphoneModel('USB-C to 3.5mm', 'usb'), 'wired');
});

test('official photo per model generation', () => {
  const pick = (n: string) => headphoneImage(n)?.match(/is\/(?:image\/samsung\/)?(.+?)\?/)?.[1] ?? null;
  const cases: [string, RegExp | null][] = [
    ["Arvind's AirPods Pro", /MTJV3_AV1/],
    ['AirPods Pro 3', /airpods-pro-3/],
    ['AirPods Max', /airpods-max/],
    ['AirPods (2nd generation)', /MV7N2_AV1/],
    ['AirPods 4', /MXP93/],
    ['AirPods', /MME73_AV1/],
    ['Galaxy Buds (A1B2)', /r170/],
    ['Galaxy Buds+ (C3D4)', /r175/],
    ['Galaxy Buds Live (2F1A)', /r180/],
    ['Galaxy Buds Pro (77AB)', /r190/],
    ['Galaxy Buds2 (11CC)', /r177/],
    ['Galaxy Buds2 Pro', /r510/],
    ['Galaxy Buds FE', /r400/],
    ['Galaxy Buds3', /r530/],
    ['Galaxy Buds3 Pro (4E2C)', /r630/],
    ['Galaxy Buds3 FE', /r420/],
    ['Galaxy Buds4', /r540/],
    ['Galaxy Buds4 Pro', /r640/],
    ['WH-1000XM5', null],
  ];
  for (const [name, want] of cases) {
    const got = pick(name);
    if (want === null) assert.equal(got, null, name);
    else assert.match(got ?? '', want, name);
  }
});
