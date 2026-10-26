// The name plate's weave is worked out in a worker (lib/weaveWorker.ts) ahead
// of the first plate, and on the page where there's none (lib/weaveTile.ts):
// the two give the same tile, the one the plate worked out itself before, so
// a plate looks the same whichever made it.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Just enough of a worker's `self` to catch what it posts back. */
const posted: unknown[] = [];
const self = {
  onmessage: null as null | ((e: { data: unknown }) => void),
  postMessage: (message: unknown) => void posted.push(message),
};
(globalThis as { self?: unknown }).self = self;
await import('../src/lib/weaveWorker.ts');
const { weaveImage, weavePath } = await import('../src/lib/weave.ts');
const { weaveTile } = await import('../src/lib/weaveTile.ts');

test("the weave's worker answers with the tile's path, and the tile drawn from it is the page's own", () => {
  assert.ok(self.onmessage, 'the worker listens');
  self.onmessage!({ data: null });
  assert.equal(posted.length, 1);
  const { d } = posted[0] as { d?: string };
  assert.ok(d && d.startsWith('M'), 'a path');
  assert.equal(d, weavePath());
  // (No worker here: weaveTile works it out on the page.)
  assert.equal(weaveImage(d), weaveTile());
  assert.match(weaveTile(), /^url\("data:image\/svg\+xml,/);
});

test('the tile is the one NamePlate.svelte drew before the weave moved out of it', () => {
  assert.equal(createHash('sha256').update(weaveTile()).digest('hex'), 'f92e1da2fb5c5919cbdf96f317079fb48855b74a673ae55abf1e7f675506ff6a');
});
