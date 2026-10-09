import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as any).location ??= { href: 'http://localhost/' };
const { looksLikeAudio } = await import('../src/player/fetchAudio');

const blob = (bytes: number[] | string) => new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)]);

test('downloads are kept only when they are real audio files', async () => {
  assert.ok(await looksLikeAudio(blob('ID3\x04\x00\x00\x00\x00\x00\x00\x00\x00')), 'mp3 with tags');
  assert.ok(await looksLikeAudio(blob([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])), 'mp3 frame');
  assert.ok(await looksLikeAudio(blob([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), 'webm');
  assert.ok(await looksLikeAudio(blob('\x00\x00\x00\x18ftypdash')), 'm4a');
  assert.ok(await looksLikeAudio(blob('OggS\x00\x02\x00\x00\x00\x00\x00\x00')), 'ogg');
  // What a text-decoded binary or an error page looks like:
  assert.equal(await looksLikeAudio(blob('<!DOCTYPE html><html>')), false);
  assert.equal(await looksLikeAudio(blob('{"error":"forbidden"}')), false);
  assert.equal(await looksLikeAudio(blob('��ID3')), false, 'bytes mangled by a text decoder');
});
