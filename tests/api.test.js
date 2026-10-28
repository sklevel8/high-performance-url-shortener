import test from 'node:test';
import assert from 'node:assert/strict';

// Lightweight smoke: import the module to ensure no syntax errors
test('modules load without throwing', async () => {
  const mod = await import('../src/utils/base62.js');
  assert.ok(typeof mod.encodeBase62 === 'function');
});