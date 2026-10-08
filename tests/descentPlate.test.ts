import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descentPlate, type Box, type Plate } from '../src/lib/descentPlate.ts';
import { FINDS_IN_ORDER, shownDepth } from '../src/lib/delve.ts';

// The descent plate (DelveLadder.svelte): the two stars, their depths, the
// legend, and the finds' lines, at a phone's, a tablet's and a desktop's
// width (stacked, or beside the finds list as the page measures it).
const met = FINDS_IN_ORDER.map((x) => ({ kind: x.kind, from: x.from }));
const beside = {
  targets: FINDS_IN_ORDER.map((x, i) => ({
    kind: x.kind,
    x: 200,
    y: 20 + 120 * i,
  })),
  wall: 196,
};
const plates = (best: number | null, last: number | null, finds = met): Plate[] => [
  descentPlate(281, 420, best, finds, {}, last),
  descentPlate(329, 420, best, finds, {}, last),
  descentPlate(176, 380, best, finds, { beside }, last),
];
/** A star's depth as set (Cinzel at 13 px, about 7.6 px a figure). */
const numBox = (n: { text: string; x: number; y: number; anchor: string }): Box => {
  const w = n.text.length * 7.6;
  const x0 = n.anchor === 'start' ? n.x : n.x - w / 2;
  return [x0, n.y - 4.9, x0 + w, n.y + 4.9];
};
const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

test('both stars carry their depth, under the star, and nothing overlaps them', () => {
  for (const [best, last] of [
    [12, 5],
    [45, 20],
    [99, 101],
    [216, 30],
    [60, 2],
  ])
    for (const p of plates(best, last)) {
      assert.ok(p.last, `${best}/${last} at ${p.w}: the red star is drawn`);
      assert.equal(p.star.num?.text, String(shownDepth(best)));
      assert.equal(p.last.num?.text, String(shownDepth(last)));
      const [g, r] = [numBox(p.star.num!), numBox(p.last.num!)];
      assert.ok(!overlap(g, r), 'the depths apart');
      for (const [s, b] of [
        [p.star, r],
        [p.last, g],
      ] as const)
        assert.ok(Math.hypot(Math.max(b[0] - s.c[0], 0, s.c[0] - b[2]), Math.max(b[1] - s.c[1], 0, s.c[1] - b[3])) > s.gloryR, 'a depth clear of the other star');
      for (const m of p.marks) assert.ok(![g, r].some((b) => overlap(b, [m.x - 8, m.y - 4, m.x + 8, m.y + 4])), "clear of the finds' depths");
      for (const n of p.names) assert.ok(![g, r].some((b) => overlap(b, [n.x - 60, n.y - 5, n.x, n.y + 5])), "clear of the zones' names");
    }
});

test('the stars stand left of the pit, the depth under them; past 100 a star sits in the ouroboros, its depth beside it', () => {
  for (const p of plates(45, 20)) {
    for (const s of [p.star, p.last!]) {
      assert.ok(s.c[0] < p.sol.c[0] - 15, 'left of the pit');
      assert.ok(s.num!.y > s.c[1] + s.gloryR, 'under the star');
      assert.ok(Math.abs(s.num!.x - s.c[0]) < 0.01);
    }
    for (const n of p.names) assert.ok(n.x < p.star.c[0] - p.star.gloryR, 'the names stay left of the lane');
  }
  for (const p of plates(216, 30)) {
    assert.ok(p.star.inSnake);
    assert.deepEqual(p.star.c, p.endless.c);
    assert.ok(p.star.cut < p.endless.r * 0.5, 'clear of the serpent');
    assert.equal(p.star.num!.anchor, 'start');
    assert.ok(p.star.num!.x > p.endless.c[0] + p.endless.r, 'beside the seal');
    assert.ok(p.star.mid, 'it comes down the lane and then into the ouroboros');
  }
});

test('one star when the last run is the best, or would overlap it; the legend names only the stars drawn', () => {
  for (const p of plates(45, 45)) {
    assert.equal(p.last, null);
    assert.deepEqual(
      p.legend.rows.map((r) => r.kind),
      ['best'],
    );
  }
  for (const p of plates(45, 44)) assert.equal(p.last, null, 'a depth apart: they would overlap');
  for (const p of plates(150, 120)) assert.equal(p.last, null, 'room for one star in the ouroboros');
  for (const p of plates(45, 20))
    assert.deepEqual(
      p.legend.rows.map((r) => r.kind),
      ['best', 'last'],
    );
  for (const p of plates(null, null)) {
    assert.equal(p.star.num, null, 'before a first run the star waits by the mouth, with no depth');
    assert.equal(p.star.travel, 0);
    assert.equal(p.last, null);
  }
});

test('the gold star comes down from the mouth (its cutout with it); the red one appears where it stands as the gold one lands', () => {
  for (const p of plates(45, 20)) {
    assert.ok(p.star.travel > 0 && (p.star.from[0] !== 0 || p.star.from[1] !== 0));
    assert.equal(p.last!.travel, 0);
    assert.ok(p.last!.delay >= p.star.delay + p.star.travel, 'the red star appears as the gold one lands');
  }
});

test("a find's line leaves the wall level, slants, and runs level into its heading; only finds met have one", () => {
  for (const p of plates(216, 30)) {
    assert.equal(p.stations.length, met.length);
    const lines = p.parts.filter((x) => x.tone === 'lead');
    assert.equal(lines.length, met.length);
    for (const s of p.stations) {
      const find = FINDS_IN_ORDER.find((x) => x.kind === s.kind)!;
      const mark = p.marks.find((m) => m.kind === s.kind)!;
      assert.equal(mark.text, String(shownDepth(find.from)), 'its depth, from the constants');
    }
    // The first piece of each line starts at its station and runs level (the handle).
    for (const [i, l] of lines.entries()) {
      const [x0, y0, x1, y1] = l.strokes[0].d.slice(1).split(/[ L]/).slice(0, 4).map(Number);
      assert.ok(Math.abs(y1 - y0) < 0.01 && x1 > x0, `line ${i} starts level`);
    }
  }
  for (const p of plates(216, 30, [])) {
    assert.equal(p.stations.length, 0);
    assert.equal(p.parts.filter((x) => x.tone === 'lead').length, 0);
  }
});

test('only the zones reached are named', () => {
  for (const p of plates(12, 5))
    assert.deepEqual(
      p.names.map((n) => n.text),
      ['The Mines', 'Magma Fissure'],
    );
});

test('every path is a number throughout', () => {
  for (const [best, last] of [
    [null, null],
    [12, 5],
    [99, 101],
    [216, 30],
  ] as const)
    for (const p of plates(best, last)) assert.ok(!JSON.stringify(p).includes('NaN'), `${best}/${last} at ${p.w}`);
});
