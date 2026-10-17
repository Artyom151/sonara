import assert from 'node:assert/strict';
import { test } from 'node:test';

const { parseTtml } = await import('../src/core/lyrics');

test('word timings are kept when a line has word spans; plain lines stay as they were', () => {
  const ttml = `<tt><body><div>
    <p begin="00:01.000"><span begin="00:01.000">one</span> <span begin="00:01.500">two</span></p>
    <p begin="00:03.000">plain line</p>
  </div></body></tt>`;
  const lines = parseTtml(ttml);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'one two');
  assert.deepEqual(lines[0].words, [
    { time: 1, text: 'one' },
    { time: 1.5, text: 'two' },
  ]);
  assert.equal(lines[1].words, undefined);
});
