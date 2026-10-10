import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialOf } from '../src/lib/names.ts';

test("a name's initial is its first letter, capitalised, whole even when it takes two code units", () => {
  assert.equal(initialOf('kalguur'), 'K');
  assert.equal(initialOf('  una of the vaal'), 'U');
  assert.equal(initialOf('ölmo'), 'Ö');
  assert.equal(initialOf('𝓗ost'), '𝓗', 'a letter outside the BMP stays whole');
  assert.equal(initialOf(''), '');
  assert.equal(initialOf('   '), '');
});
