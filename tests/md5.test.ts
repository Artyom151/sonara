import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { md5 } from '../src/lib/md5';

test('md5 matches node:crypto (Yandex Music link signing)', () => {
  for (const s of ['', 'abc', 'XGRlBW9FXlekgbPrRHuSiA/path/to/file.mp3', 'Сонара ♫', 'x'.repeat(1000)]) {
    assert.equal(md5(s), createHash('md5').update(s).digest('hex'), JSON.stringify(s.slice(0, 20)));
  }
});
