import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptLights, LIGHT_TABLE, lightAt, lookOf, STRATA, strataAt, type LightTable } from '../src/lib/descent.ts';
import { endgameAt, SHIPPED, setBackdrops } from '../src/lib/backdrops.ts';

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
/** The strata past the zones the worker hands on (to the one after the table's last), and as the page makes them by itself. */
const strata = Array.from({ length: strataAt(LIGHT_TABLE).stratum + 2 - STRATA.length }, (_, i) => STRATA.length + i);
const madeHere = strata.map((k) => ({ look: lookOf(k), backdrop: endgameAt(k) }));

afresh();
self.onmessage!({ data: null });
const tables = posted.map((p) => p.message.table);
/** The stretches as a page receives them: posted, so structured clones of what the worker made. */
const delivered = () => tables.map((t) => structuredClone(t));

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

test('each stretch brings the strata past the zones it read and the one after, each stratum once', () => {
  let next = STRATA.length;
  for (const t of tables) {
    for (const s of t.strata) assert.equal(s.stratum, next++, 'in order, none twice');
    assert.equal(next - 1, Math.max(STRATA.length - 1, strataAt(t.end).stratum + 1), `to depth ${t.end}: up to the one after the last it read`);
  }
  assert.equal(next - 1, strata.at(-1));
});

test('the strata the page takes from the worker are the ones it makes by itself, and none is made here again', () => {
  afresh();
  const got = delivered();
  for (const t of got) adoptLights(t);
  const taken = new Map(got.flatMap((t) => t.strata.map((s) => [s.stratum, s] as const)));
  strata.forEach((k, i) => {
    const s = taken.get(k)!;
    assert.equal(lookOf(k), s.look, `stratum ${k}: its look taken`);
    assert.equal(endgameAt(k), s.backdrop, `stratum ${k}: its backdrop taken`);
    assert.deepEqual(s.look, madeHere[i].look, `stratum ${k}: the page's look`);
    assert.deepEqual(s.backdrop, madeHere[i].backdrop, `stratum ${k}: the page's backdrop`);
  });
  assert.deepEqual(lights(), here);
});

test('a stratum the page has made itself before the worker hands it on stays as the page made it', () => {
  afresh();
  const k = STRATA.length + 1;
  const look = lookOf(k);
  const backdrop = endgameAt(k);
  for (const t of delivered()) adoptLights(t);
  assert.equal(lookOf(k), look);
  assert.equal(endgameAt(k), backdrop);
  assert.deepEqual(lights(), here);
});
