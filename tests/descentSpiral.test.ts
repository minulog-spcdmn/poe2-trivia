import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownDepth } from '../src/lib/delve.ts';
import { bestLabel, ENDLESS_FROM, keyRows, labelSpot, layout, serpentLit, starPoint, station, zoneIndex, zonesReached, ZONE_COUNT, ZONES_END } from '../src/lib/descentSpiral.ts';

const L = layout(281);
const m = L.margin;

test('the star rests at the mouth before a first run, and on the track from depth 1', () => {
  assert.equal(station(null, m), 0);
  assert.equal(station(0, m), 0);
  assert.equal(station(Number.NaN, m), 0);
  assert.ok(station(1, m) > 0);
});

test('at a zone boundary the star stands on the right side of the gate', () => {
  // Depth 10 is the Mines' last depth, 11 the second zone's first: the gate between them is at a tenth of the way.
  assert.ok(station(10, m) < 0.1);
  assert.ok(station(11, m) > 0.1);
  assert.equal(zoneIndex(10), 0);
  assert.equal(zoneIndex(11), 1);
  // Never on a gate: clear of every one by more than the hole the lines stop short at.
  const Z = L.track.len / ZONE_COUNT;
  const gates = Array.from({ length: ZONE_COUNT + 1 }, (_, k) => L.track.at(k * Z).p);
  for (let d = 1; d <= 100; d++) {
    const p = starPoint(L, station(d, m));
    for (const g of gates) assert.ok(Math.hypot(p[0] - g[0], p[1] - g[1]) > L.star.hole, `depth ${d}`);
  }
});

test('100 is the end of the track, past it the serpent; deeper lights more of it', () => {
  assert.ok(station(100, m) < 1);
  assert.ok(station(101, m) > 1);
  assert.equal(station(999, m), station(101, m));
  assert.equal(serpentLit(100), 0);
  assert.ok(serpentLit(101) > 0);
  assert.ok(serpentLit(134) < serpentLit(250));
  assert.ok(serpentLit(250) < serpentLit(999));
  assert.equal(serpentLit(5000), 1);
});

test('no zone is named or coloured before it is reached', () => {
  assert.equal(zonesReached(null), 0);
  assert.ok(keyRows(null).every((r) => !r.reached && r.name === undefined && r.color === undefined));
  const named = (d: number) => keyRows(d).filter((r) => r.name !== undefined).length;
  assert.equal(named(1), 1);
  assert.equal(named(10), 1);
  assert.equal(named(11), 2);
  assert.equal(named(90), 9);
  assert.equal(named(91), 10);
  assert.equal(named(999), 10);
  assert.ok(keyRows(37).every((r, k) => (k < 4) === (r.name !== undefined && r.color !== undefined)));
  assert.deepEqual(
    keyRows(null).map((r) => r.from),
    [1, 11, 21, 31, 41, 51, 61, 71, 81, 91],
  );
});

test('the key and the star say depths as a player reads them, one less than the internal depth', () => {
  // The key's rows by each zone's first depth as shown, the endless row from 100.
  assert.deepEqual(
    keyRows(null).map((r) => r.shown),
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
  );
  assert.ok(keyRows(37).every((r) => r.shown === shownDepth(r.from)));
  assert.equal(ENDLESS_FROM, shownDepth(ZONES_END + 1));
  assert.equal(ENDLESS_FROM, 100);
  // The number by the star: none before a run, 0 for a run that ended at the first depth.
  assert.equal(bestLabel(null), null);
  assert.equal(bestLabel(0), null);
  assert.equal(bestLabel(1), '0');
  assert.equal(zoneIndex(1), 0);
  // Internal 10 and 11 read 9 and 10: the first zone's last depth, the second zone's first.
  assert.equal(bestLabel(10), '9');
  assert.equal(zoneIndex(10), 0);
  assert.equal(bestLabel(11), '10');
  assert.equal(zoneIndex(11), 1);
  assert.equal(keyRows(11)[1].shown, 10);
  assert.equal(bestLabel(100), '99');
  assert.equal(zoneIndex(100), 9);
  // Internal 101 reads 100, beyond the zones, in the serpent.
  assert.equal(bestLabel(101), '100');
  assert.equal(zoneIndex(101), ZONE_COUNT);
  assert.ok(station(101, m) > 1);
  assert.equal(bestLabel(999), '998');
});

test('the star’s number never lands on a gate, Sol or the serpent, at any width', () => {
  for (const w of [281, 329, 450]) {
    const P = layout(w);
    const Z = P.track.len / ZONE_COUNT;
    const gates = Array.from({ length: ZONE_COUNT }, (_, k) => P.track.at((k + 1) * Z).p);
    let prev: number | null = null;
    for (let d = 1; d <= 100; d++) {
      const p = starPoint(P, station(d, P.margin));
      const spot = labelSpot(P, p, 3 * 7.4, 8.4, prev);
      prev = spot.i;
      const [x, y, bw, bh] = spot.box;
      const inside = (q: number[], pad: number) => q[0] > x - pad && q[0] < x + bw + pad && q[1] > y - pad && q[1] < y + bh + pad;
      assert.ok(!gates.some((g) => inside(g, 1)), `gate, ${w} px, depth ${d}`);
      assert.ok(!inside(P.sol.c, P.sol.r), `Sol, ${w} px, depth ${d}`);
      const s = P.serpent;
      assert.ok(Math.abs(x + bw / 2 - s.c[0]) >= s.a + bw / 2 || Math.abs(y + bh / 2 - s.c[1]) >= s.half + bh / 2, `serpent, ${w} px, depth ${d}`);
      assert.ok(x >= 0 && y >= 0 && x + bw <= P.key.x && y + bh <= P.h, `bounds, ${w} px, depth ${d}`);
    }
  }
});

test('the number stays by its star (nearer it than Sol), and the star’s glory stays on the plate', () => {
  for (const w of [281, 329, 450]) {
    const P = layout(w);
    let prev: number | null = null;
    for (let d = 1; d <= 100; d++) {
      const p = starPoint(P, station(d, P.margin));
      assert.ok(p[0] - P.star.glory >= 0 && p[1] - P.star.glory >= 0 && p[0] + P.star.glory <= P.size && p[1] + P.star.glory <= P.h, `glory, ${w} px, depth ${d}`);
      const nw = String(d).length * 7.35 + 1;
      const spot = labelSpot(P, p, nw, 8.4, prev);
      prev = spot.i;
      const c = [spot.box[0] + nw / 2, spot.box[1] + 4.2];
      const toStar = Math.hypot(c[0] - p[0], c[1] - p[1]);
      assert.ok(toStar < Math.hypot(c[0] - P.sol.c[0], c[1] - P.sol.c[1]), `nearer Sol, ${w} px, depth ${d}`);
      assert.ok(toStar < P.star.glory + 2 + nw / 2 + 17, `far from its star, ${w} px, depth ${d}`);
    }
  }
});
