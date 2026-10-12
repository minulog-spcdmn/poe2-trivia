import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../src/lib/cardEngraving.ts';
import { findVariant } from '../src/lib/findEngraving.ts';

test("a card's plate is engraved once for its side and size, shared by its layers", () => {
  // A find's card draws its plate and, laid over the item, its front strokes (CardEngraving front): one engraving.
  assert.equal(findVariant('azurite'), findVariant('azurite'));
  const plate = engrave('face', 220, 330, findVariant('azurite'));
  assert.equal(engrave('face', 220, 330, findVariant('azurite')), plate);
  assert.ok(plate.strokes.some((s) => s.front), 'the vein has strokes in front of its emblem');
  // Another side, size or card is its own.
  assert.notEqual(engrave('back', 220, 330, findVariant('azurite')), plate);
  assert.notEqual(engrave('face', 221, 330, findVariant('azurite')), plate);
  assert.notEqual(engrave('face', 220, 330, findVariant('flare')), plate);
  assert.notEqual(engrave('face', 220, 330), plate);
  assert.equal(engrave('face', 220, 330), engrave('face', 220, 330));
});
