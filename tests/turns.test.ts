import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnOf } from '../src/lib/turns.ts';

test('taking turns: never the same twice running, each once in every few', () => {
  const things = ['eye', 'monad', 'rose', 'moth'];
  for (const seed of [0, 1, 1_792_176_796_707, 20_000]) {
    let last = '';
    for (let n = 19_000; n < 21_000; n++) {
      const now = turnOf(n, things, seed);
      assert.notEqual(now, last, `turn ${n} repeats ${now}`);
      last = now;
      if (n % 4 === 3) assert.equal(new Set([0, 1, 2, 3].map((k) => turnOf(n - k, things, seed))).size, 4);
    }
  }
  assert.equal(turnOf(5, things, 7), turnOf(5, things, 7));
});

test('taking turns of two, and of one', () => {
  for (let n = -5; n < 50; n++) assert.notEqual(turnOf(n, ['monad', 'eye'], 3), turnOf(n + 1, ['monad', 'eye'], 3));
  assert.equal(turnOf(9, ['eye']), 'eye');
  assert.throws(() => turnOf(0, []));
});
