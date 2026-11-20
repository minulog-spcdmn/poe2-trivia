// The aura picker's words and pictures (components/AuraPicker.svelte): a
// line on how each aura that can be worn is found (lib/auraKinds.ts
// AURA_HINTS), and each one's sign drawn alone (lib/auraEngraving.ts
// auraSign), inside the box the picker shows it in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AURA_HINTS, AURA_NAMES, CLASS_AURAS, WORN } from '../src/lib/auraKinds.ts';
import { className } from '../src/lib/classSigils.ts';
import { SIGN_BOX, auraSign } from '../src/lib/auraEngraving.ts';

test('every aura that can be worn, and no other, has a line on how it is found', () => {
  assert.deepEqual(Object.keys(AURA_HINTS).sort(), [...WORN].sort());
  for (const k of WORN) {
    const h = AURA_HINTS[k]!;
    assert.match(h, /^Found .+\.$/, `${k}: a line of its own`);
    assert.doesNotMatch(h, /['"]/, `${k}: curly quotes only`);
  }
});

test('a class aura’s line names the sigil it is found with', () => {
  for (const [k, cls] of Object.entries(CLASS_AURAS)) {
    assert.ok(AURA_HINTS[k as keyof typeof AURA_HINTS]!.includes(`the ${className(cls)} sigil`), k);
  }
});

test('every aura that can be worn has a name', () => {
  for (const k of WORN) assert.ok(AURA_NAMES[k].name.length > 0, k);
});

test('each sign is drawn, and inside its box', () => {
  for (const k of WORN) {
    const strokes = auraSign(k);
    assert.ok(strokes.length > 0, `${k}: drawn`);
    assert.equal(auraSign(k), strokes, `${k}: kept`);
    // Every number in its paths, x and y alike, as a loose check on its extent (arcs' radii and flags fall inside too).
    const nums = strokes.flatMap((s) => (s.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number));
    assert.ok(nums.length > 0, k);
    const [lo, hi] = [Math.min(...nums), Math.max(...nums)];
    assert.ok(lo >= -0.5 && hi <= 2 * SIGN_BOX + 0.5, `${k}: within the box (${lo} to ${hi})`);
  }
});
