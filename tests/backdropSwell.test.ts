// A card's light that swells (a find's, a duel's) is mixed by the backdrop
// from --bs1 / --bs1-color toward --bs1-pulse / --bs1-pulse-color, as far as
// its pulse has gone (lib/backdropShadow.ts, `pulse`): as Chrome would
// animate the registered properties themselves, so the light looks the same
// whether the backdrop or CSS draws it. Colours mix premultiplied; lists of
// lengths mix by item, or swap halfway where their lengths differ.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mixColor, mixLengths } = await import('../src/lib/backdropShadow.ts');

const near = (got: number[] | null, want: number[]) => {
  assert.ok(got, `got no colour, wanted ${want}`);
  got.forEach((x, i) => assert.ok(Math.abs(x - want[i]!) < 1e-9, `${got} is not ${want}`));
};

test('a colour mixes premultiplied: from transparent it keeps its hue, only its alpha grows', () => {
  const red = [224 / 255, 85 / 255, 63 / 255, 0.45];
  near(mixColor([0, 0, 0, 0], red, 0.5), [224 / 255, 85 / 255, 63 / 255, 0.225]);
  near(mixColor(red, [0, 0, 0, 0], 0.25), [224 / 255, 85 / 255, 63 / 255, 0.3375]);
});

test('a colour mixes premultiplied between two seen ones', () => {
  // Half way from opaque white to half-see-through black: alpha 0.75, and
  // white weighs twice what black does.
  near(mixColor([1, 1, 1, 1], [0, 0, 0, 0.5], 0.5), [2 / 3, 2 / 3, 2 / 3, 0.75]);
  near(mixColor([0.2, 0.4, 0.6, 0.3], [0.8, 0.1, 0.5, 0.6], 0), [0.2, 0.4, 0.6, 0.3]);
  near(mixColor([0.2, 0.4, 0.6, 0.3], [0.8, 0.1, 0.5, 0.6], 1), [0.8, 0.1, 0.5, 0.6]);
});

test('a colour that could not be read swaps halfway', () => {
  assert.equal(mixColor(null, [1, 0, 0, 1], 0.4), null);
  assert.deepEqual(mixColor(null, [1, 0, 0, 1], 0.5), [1, 0, 0, 1]);
});

test('lengths mix item by item, and lists of other lengths swap halfway', () => {
  assert.deepEqual(mixLengths([16, 40], [0, 45], 0.5), [8, 42.5]);
  assert.deepEqual(mixLengths([0, 34], [0, 46], 0.25), [0, 37]);
  assert.deepEqual(mixLengths([0, 34], [0, 46, 2], 0.49), [0, 34]);
  assert.deepEqual(mixLengths([0, 34], [0, 46, 2], 0.5), [0, 46, 2]);
});
