import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELVE_MIN_TIMER, FINDS, delveTimer, findLosses, shownDepth } from '../src/lib/delve.ts';
import { STRATA, stratumName } from '../src/lib/descent.ts';
import {
  DEEP_FACE,
  DEEP_FROM,
  EDGE,
  FINDS_BY_DEPTH,
  FIND_KEY,
  PER_ZONE,
  SHORTEST_FROM,
  ZONES,
  ZONE_INFO,
  clockAt,
  deepName,
  faceDepth,
  namesOnPlate,
  pointAt,
  section,
  unitsOf,
  zonesReached,
} from '../src/lib/descentPlateB.ts';

// The drawings as the plate lays them out: phone, tablet, and the desktop's drawing beside its key.
const SECTIONS = [section(281, 248), section(329, 248), section(240, 300)];
const SAMPLES = [null, 1, 2, 5, 9, 10, 11, 12, 20, 21, 37, 50, 51, 90, 91, 99, 100, 101, 102, 150, 999, 9999];

test('ten zones of ten depths, each starting on a round shown depth', () => {
  assert.equal(ZONES, 10);
  ZONE_INFO.forEach((z, k) => assert.equal(z.from, k * PER_ZONE));
  assert.equal(shownDepth(DEEP_FROM), ZONES * PER_ZONE);
});

test('a zone is reached from its first depth, and none before any run', () => {
  assert.equal(zonesReached(null), 0);
  assert.equal(zonesReached(0), 0);
  for (let k = 0; k < ZONES; k++) {
    const first = k * PER_ZONE + 1;
    assert.equal(zonesReached(first), k + 1, `depth ${first}`);
    if (first > 1) assert.equal(zonesReached(first - 1), k, `depth ${first - 1}`);
  }
  assert.equal(zonesReached(9999), ZONES);
});

test('nothing unreached is named', () => {
  for (const d of [...SAMPLES, ...Array.from({ length: 120 }, (_, i) => i + 1)]) {
    const names = namesOnPlate(d);
    const reached = zonesReached(d);
    ZONE_INFO.forEach((z, k) => assert.equal(names.includes(z.name), k < reached, `depth ${d}: ${z.name}`));
    // A zone is named only once the deepest's shown depth has come to its first.
    for (const z of ZONE_INFO) if (names.includes(z.name)) assert.ok(d !== null && shownDepth(d) >= z.from);
    // Past the zones only the deepest's own stratum is named, and only once there.
    assert.equal(deepName(d), d !== null && d >= DEEP_FROM ? stratumName(Math.floor((d - 1) / PER_ZONE)) : null);
    assert.equal(names.length, reached + (d !== null && d >= DEEP_FROM ? 1 : 0));
  }
  assert.deepEqual(namesOnPlate(null), []);
  assert.deepEqual(namesOnPlate(10), [STRATA[0].name]);
  assert.deepEqual(namesOnPlate(11), [STRATA[0].name, STRATA[1].name]);
});

test("each depth sits inside its own zone's band, clear of its lines", () => {
  assert.equal(unitsOf(null), -1);
  let last = -Infinity;
  for (let d = 1; d < DEEP_FROM; d++) {
    const u = unitsOf(d);
    const k = Math.floor((d - 1) / PER_ZONE);
    assert.ok(u >= k * PER_ZONE + EDGE - 1e-9 && u <= (k + 1) * PER_ZONE - EDGE + 1e-9, `depth ${d} at ${u}`);
    assert.ok(u > last, `depth ${d} deeper than ${d - 1}`);
    last = u;
  }
  // A zone's first depth and the last of the one above are a clear gap apart, a line between them.
  for (let k = 1; k < ZONES; k++) {
    const [above, first] = [unitsOf(k * PER_ZONE), unitsOf(k * PER_ZONE + 1)];
    assert.ok(above < k * PER_ZONE && first > k * PER_ZONE && first - above >= 2 * EDGE - 1e-9);
  }
});

test('past the zones the face sinks into the deep, ever slower, and stays in the drawing', () => {
  for (const s of SECTIONS) {
    const floor = ZONES * PER_ZONE * s.unit;
    const top = s.top;
    const at = (d: number | null) => top + faceDepth(s, d);
    assert.ok(at(DEEP_FROM - 1) < top + floor, 'the last zone depth is above the floor');
    assert.ok(Math.abs(at(DEEP_FROM) - (top + floor + DEEP_FACE[0])) < 1e-9, 'the first deep depth is just under it');
    let last = at(DEEP_FROM);
    for (const d of [102, 150, 999, 9999]) {
      assert.ok(at(d) > last, `${d} deeper`);
      last = at(d);
    }
    // The star and its face stay inside the drawing, however deep.
    assert.ok(at(1e9) + 6 <= s.h, `width ${s.w}`);
    assert.ok(at(null) < top, 'before a run, above the surface');
  }
});

test('the drawing fits its box: bands thick enough to letter, the deep floor meeting the walls inside it', () => {
  for (const s of SECTIONS) {
    assert.ok(s.unit * PER_ZONE >= 15, `bands at width ${s.w}`);
    assert.ok(Math.abs(pointAt(s, 0, s.cx)[1] - s.top) < 1e-9);
    const [, wall] = pointAt(s, ZONES * PER_ZONE, s.x0);
    assert.ok(wall < s.h, `the tenth floor meets the walls inside the drawing at width ${s.w}`);
  }
});

test('the numbers on the plate come from the rules', () => {
  assert.deepEqual(
    FINDS_BY_DEPTH.map((f) => f.from),
    FINDS.filter((f) => f.cap > 0)
      .map((f) => shownDepth(f.from))
      .sort((a, b) => a - b),
  );
  assert.equal(clockAt(0), delveTimer(1));
  assert.equal(delveTimer(SHORTEST_FROM + 1), DELVE_MIN_TIMER);
  assert.ok(delveTimer(SHORTEST_FROM) > DELVE_MIN_TIMER);
  const two = ['no', 'one', 'two', 'three'][findLosses('azurite')];
  assert.match(FIND_KEY.azurite.risk, new RegExp(`${two} lives`));
});
