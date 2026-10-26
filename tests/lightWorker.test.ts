import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptLights, LIGHT_TABLE, lightAt, type LightTable } from '../src/lib/descent.ts';
import { SHIPPED, setBackdrops } from '../src/lib/backdrops.ts';

/** Just enough of a worker's `self` to catch what it posts back. */
const posted: { message: { table: LightTable }; transfer: ArrayBuffer[] }[] = [];
const self = {
  onmessage: null as null | ((e: { data: unknown }) => void),
  postMessage(message: never, options: { transfer: ArrayBuffer[] }) {
    posted.push({ message, transfer: options.transfer });
  },
};
(globalThis as { self?: unknown }).self = self;
await import('../src/lib/lightWorker.ts');

/** Everything worked out from the looks worked out again, the light table among it, as a page starts. */
const afresh = () => setBackdrops(SHIPPED);
/** Some depths between whole ones (those read the table's brightness, not its light). */
const BETWEEN = [1.5, 9.25, 10.7, 55.5, 101.3, 640.45, 999.9, 2000.6];
/** The light at every whole depth (and past the table) and some between, as lightAt answers. */
const lights = () => [...Array.from({ length: LIGHT_TABLE + 3 }, (_, i) => lightAt(i + 1)), ...BETWEEN.map((d) => lightAt(d))];

afresh();
/** The light as the page works it out by itself. */
const here = lights();

afresh();
self.onmessage!({ data: null });
const tables = posted.map((p) => p.message.table);

test("the light table's worker works the whole table out, handing it over a stretch at a time, its arrays transferred", () => {
  assert.ok(tables.length > 10, `${tables.length} stretches`);
  tables.forEach((t, i) => {
    if (i) assert.ok(t.settled > tables[i - 1].settled, 'each further on');
    assert.equal(t.light.length, t.end + 1);
    for (const a of [t.hall, t.rest, t.k, t.light, t.level]) assert.ok(posted[i].transfer.includes(a.buffer as ArrayBuffer), 'transferred, not copied');
  });
  assert.equal(tables.at(-1)!.settled, LIGHT_TABLE);
});

test('the light the page takes from the worker is the light it works out by itself', () => {
  afresh();
  for (const t of tables) adoptLights(t);
  assert.deepEqual(lights(), here);
});

test('the page goes on from where the worker had got to, the same light, and takes no table from behind it', () => {
  afresh();
  adoptLights(tables[1]);
  // (The first stretch, after the second: nothing changes.)
  adoptLights(tables[0]);
  const reached = tables[1].settled;
  assert.deepEqual(
    Array.from({ length: reached - 1 }, (_, i) => lightAt(i + 1)),
    here.slice(0, reached - 1),
  );
  // On past it, worked out here.
  assert.deepEqual(lights(), here);
  // A stretch from the worker coming in late, behind what's worked out here, changes nothing.
  adoptLights(tables[5]);
  assert.deepEqual(lights(), here);
});
