import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as any).__APP_VERSION__ = '1.1.21';
const { newer } = await import('../src/platform/updates');

test('newer compares semantic versions', () => {
  assert.equal(newer('1.1.22', '1.1.21'), true);
  assert.equal(newer('v1.2.0', '1.1.9'), true);
  assert.equal(newer('1.1.21', '1.1.21'), false);
  assert.equal(newer('1.1.20', '1.1.21'), false);
  assert.equal(newer('1.1.2', '1.1.21'), false);
  assert.equal(newer('1.10.0', '1.9.0'), true);
  // A pre-release comes before its release.
  assert.equal(newer('1.2.0', '1.2.0-beta.1'), true);
  assert.equal(newer('1.2.0-beta.1', '1.2.0'), false);
  assert.equal(newer('1.2.0-beta.2', '1.2.0-beta.1'), true);
});
