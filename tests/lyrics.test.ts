import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLrc, parseTtml } from '../src/core/lyrics';

test('parseLrc reads timestamps, repeats and sorts', () => {
  const l = parseLrc('[00:12.50]second\n[00:01.00][00:30.00]first\n[ar:x]');
  assert.deepEqual(l.map((x) => x.time), [1, 12.5, 30]);
  assert.equal(l[1].text, 'second');
  assert.equal(l[2].text, 'first');
});

test('parseTtml joins word spans, decodes entities, drops background vocals', () => {
  const ttml = `<tt><body><div>
    <p begin="00:00:01.500" end="00:00:03"><span>Rock</span> <span>&amp; roll</span><span ttm:role="x-bg"><span>(ooh)</span></span></p>
    <p begin="1:02.5" end="1:05"><span>Second</span><span> line</span></p>
    <p begin="62s" end="64s"></p>
  </div></body></tt>`;
  const l = parseTtml(ttml);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { time: 1.5, text: 'Rock & roll' });
  assert.equal(l[1].time, 62.5);
  assert.match(l[1].text, /^Second\s?line$/);
});
