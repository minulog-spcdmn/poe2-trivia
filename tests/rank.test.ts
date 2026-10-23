import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankAscending } from '../src/lib/rank.ts';

const bySort = (keys: Float32Array) => Uint32Array.from({ length: keys.length }, (_, j) => j).sort((a, b) => keys[a] - keys[b]);

test('ranks as a sort by value does, negatives, ties and all', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (const n of [0, 1, 2, 17, 5000, 70000]) {
    const keys = new Float32Array(n);
    for (let i = 0; i < n; i++) keys[i] = rand() < 0.1 ? Math.round(rand() * 4) : (rand() - 0.3) * 300;
    assert.deepEqual(rankAscending(keys), bySort(keys));
  }
});

test('leaves the keys as they were', () => {
  const keys = new Float32Array([3, -1, 2.5, -7]);
  rankAscending(keys);
  assert.deepEqual([...keys], [3, -1, 2.5, -7]);
});
