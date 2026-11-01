import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engrave, engravedAt, keep, type Engraved } from '../src/lib/cardEngraving.ts';
import { findVariant } from '../src/lib/findEngraving.ts';
import { LANTERN_PLATE } from '../src/lib/wayOut/lanternPlate.ts';
import { engraveAhead } from '../src/lib/engraveAhead.ts';
import type { EngraveAnswer, EngraveJob, VariantName } from '../src/lib/engraveWorker.ts';

test('the worker engraves the same plate as the page, to the last digit', async () => {
  // The worker's script, run here: what it posts back, as the page would get it (a structured clone).
  const answers: EngraveAnswer[] = [];
  const self = { postMessage: (a: EngraveAnswer) => answers.push(structuredClone(a)) } as { postMessage: (a: EngraveAnswer) => void; onmessage?: (e: { data: EngraveJob }) => void };
  (globalThis as { self?: unknown }).self = self;
  await import('../src/lib/engraveWorker.ts');
  const variants: [VariantName, object | undefined][] = [
    ['plain', undefined],
    ['azurite', findVariant('azurite')],
    ['flare', findVariant('flare')],
    ['dynamite', findVariant('dynamite')],
    ['out', LANTERN_PLATE],
  ];
  let id = 0;
  for (const [variant, v] of variants)
    for (const side of ['face', 'back'] as const)
      // (A tall card, and a row on a phone.)
      for (const [w, h] of [
        [203, 371],
        [343, 92],
      ]) {
        self.onmessage!({ data: { id: ++id, side, w, h, variant } });
        const answer = answers.at(-1)!;
        assert.equal(answer.id, id);
        // The page's own, through a copy of the variant: a plate of its own, not one the worker's run left kept.
        assert.deepEqual(answer.plate, engrave(side, w, h, v ? { ...v } : {}), `${variant} ${side} ${w}x${h}`);
      }
  delete (globalThis as { self?: unknown }).self;
});

test('a plate engraved elsewhere is kept as engrave()’s, never in place of one it has', () => {
  const plate = engrave('back', 207, 361);
  const other = structuredClone(plate) as Engraved;
  assert.equal(keep('back', 207, 361, undefined, other), plate);
  assert.equal(engrave('back', 207, 361), plate);
  assert.equal(engravedAt('face', 207, 361, findVariant('flare')), undefined);
  const kept = structuredClone(engrave('face', 207, 361, { ...findVariant('flare') })) as Engraved;
  assert.equal(keep('face', 207, 361, findVariant('flare'), kept), kept);
  assert.equal(engrave('face', 207, 361, findVariant('flare')), kept);
});

test('where no worker runs, the page engraves the plate when it’s drawn', async () => {
  assert.equal(typeof Worker, 'undefined');
  await engraveAhead('face', 209, 359);
  assert.equal(engravedAt('face', 209, 359), undefined);
  // A variant the worker doesn't know, likewise.
  await engraveAhead('face', 209, 359, {});
  assert.equal(engravedAt('face', 209, 359, {}), undefined);
});
