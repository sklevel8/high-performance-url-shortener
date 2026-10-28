import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase62 } from '../src/utils/base62.js';

test('encodeBase62 converts ID 1 to deterministic 5-char code 6LAze', () => {
  assert.equal(encodeBase62(1), '6LAze');
});

test('encodeBase62 produces unique codes for sequential IDs', () => {
  const code1 = encodeBase62(100);
  const code2 = encodeBase62(101);
  assert.notEqual(code1, code2);
});

test('encodeBase62 handles 0', () => {
  assert.equal(typeof encodeBase62(0), 'string');
  assert.ok(encodeBase62(0).length > 0);
});

test('encodeBase62 handles large ids', () => {
  const code = encodeBase62(Number.MAX_SAFE_INTEGER);
  assert.equal(typeof code, 'string');
  assert.ok(code.length > 0);
});