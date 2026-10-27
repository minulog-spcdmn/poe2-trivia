import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BAY, ROW, WEAVE_CLASS, weaveCss, weaveSvg } from '../src/lib/weave.ts';
import { weaveTile, WEAVE_MODULE } from '../weaveTile.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

test("the name plate's weave, worked out as the app is built, is the tile the plate worked out itself", () => {
  // The tile NamePlate.svelte made on the page before (f620318b): its SVG's length and hash.
  const svg = weaveSvg();
  assert.equal(svg.length, 59810);
  assert.equal(sha(svg), '3da815e1fb4c1bbd9f77032783c5a214855c3ffe23f0817232f8f0e99ddff40e');
  // And the background it set on every plate, now in the stylesheet once.
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  assert.equal(sha(url), 'f92e1da2fb5c5919cbdf96f317079fb48855b74a673ae55abf1e7f675506ff6a');
  assert.equal(weaveCss(), `.${WEAVE_CLASS}{background-image:${url};background-size:${BAY}px ${ROW}px}\n`);
});

test('the build serves the weave as the stylesheet the plate imports', () => {
  const plugin = weaveTile();
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const load = plugin.load as (id: string) => string | undefined;
  const id = resolveId(WEAVE_MODULE);
  assert.ok(id?.endsWith('.css'), 'read as CSS');
  assert.equal(load(id!), weaveCss());
  assert.equal(resolveId('./other.css'), undefined);
});
