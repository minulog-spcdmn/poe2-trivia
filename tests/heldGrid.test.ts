import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canWrap, gridHeight } from '../src/lib/heldGrid.ts';

const m = { cols: 3, gap: 8, base: 100, line: 16 };

test('a grid is its rows, each as tall as its longest name, with a gap between rows', () => {
  assert.equal(gridHeight([], m), 0);
  assert.equal(gridHeight([1], m), 116);
  assert.equal(gridHeight([1, 1, 1], m), 116);
  assert.equal(gridHeight([1, 2, 1], m), 132);
  assert.equal(gridHeight([1, 1, 1, 1], m), 116 + 8 + 116);
  assert.equal(gridHeight([1, 1, 1, 2, 1, 1, 1], m), 116 + 8 + 132 + 8 + 116);
});

test('a name wraps only after a space or a hyphen', () => {
  assert.equal(canWrap('Undiscovered'), false);
  assert.equal(canWrap("Atziri's"), false);
  assert.equal(canWrap('Two-Point'), true);
  assert.equal(canWrap('The Flow Untethered'), true);
  assert.equal(canWrap(' Lone '), false);
});

// canWrap knows only these breaks: a name with a dash, a slash or the like
// could wrap where it doesn't look, and a held grid would stand too short.
test('item names break only at spaces and hyphens', () => {
  const items = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8')) as { name: string }[];
  const odd = items.filter((it) => /[^\p{L}\p{N} '-]/u.test(it.name)).map((it) => it.name);
  assert.deepEqual(odd, []);
});
