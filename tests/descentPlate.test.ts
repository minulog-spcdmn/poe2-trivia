import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descentPlate, type Box, type Plate } from '../src/lib/descentPlate.ts';
import { FINDS_IN_ORDER, shownDepth } from '../src/lib/delve.ts';

// The descent plate (DelveLadder.svelte): the two stars in the left wall,
// their depths, the one star for both, the legend, the finds' lines with
// their depths in the middle, and the brace of the zones not reached, at a
// phone's, a tablet's and a desktop's width (stacked, or beside the finds
// list as the page measures it).
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

/** The left wall's lines at height `y`. */
const wallAt = (p: Plate, y: number) => {
  const t = (y - p.wallL.y0) / (p.wallL.y1 - p.wallL.y0);
  return { inner: p.wallL.inner[0] + t * (p.wallL.inner[1] - p.wallL.inner[0]), outer: p.wallL.outer[0] + t * (p.wallL.outer[1] - p.wallL.outer[0]) };
};

test('the stars stand in the left wall, between its lines, the depth under them; past 100 a star sits in the ouroboros, its depth beside it', () => {
  for (const p of [...plates(45, 20), ...plates(null, null), ...plates(100, 3)]) {
    for (const s of [p.star, p.last].filter((x) => x !== null)) {
      const { inner, outer } = wallAt(p, s.c[1]);
      assert.ok(s.c[0] - s.r > outer + 1 && s.c[0] + s.r < inner - 1, 'inside the wall, clear of both its lines');
      assert.ok(Math.abs(s.c[0] - (inner + outer) / 2) < 0.01, 'in the middle of it');
      if (!s.num) continue;
      // Under it (or over it, where under won't fit: by the ouroboros at 100).
      assert.ok(Math.abs(s.num.y - s.c[1]) > s.gloryR, 'under or over the star');
      if (p.star.num?.text === '44') assert.ok(s.num.y > s.c[1] + s.gloryR, 'under the star');
      assert.ok(Math.abs(s.num.x - s.c[0]) < 0.01);
    }
    for (const n of p.names) assert.ok(n.x < wallAt(p, n.y).outer - 2, 'the names stay left of the wall');
  }
  for (const p of plates(216, 30)) {
    assert.ok(p.star.inSnake);
    assert.deepEqual(p.star.c, p.endless.c);
    assert.ok(p.star.cut < p.endless.ouro.inner, "inside the ring, clear of the snakes' jaws");
    assert.ok(p.endless.ouro.hole > p.endless.ouro.inner && p.endless.ouro.reach > p.endless.ouro.hole, 'a ring, the heads over it');
    assert.equal(p.star.num!.anchor, 'start');
    assert.ok(p.star.num!.x > p.endless.c[0] + p.endless.ouro.reach, "beside the seal, clear of the heads as it turns");
    assert.ok(p.star.mid, 'it comes down the lane and then into the ouroboros');
  }
});

test('one star for both when the last run is the best, or would overlap it: the last run\'s depth over the star, yours under it', () => {
  for (const [best, last] of [
    [45, 45],
    [45, 44],
    [150, 120],
  ])
    for (const p of plates(best, last)) {
      assert.equal(p.last, null, `${best}/${last}: no second star`);
      assert.ok(p.star.both);
      assert.equal(p.star.num?.text, String(shownDepth(best)));
      assert.equal(p.star.lastNum?.text, String(shownDepth(last)));
      assert.ok(p.star.lastNum!.y < p.star.num!.y - 9, "the last run's over yours");
      assert.ok(!overlap(numBox(p.star.num!), numBox({ ...p.star.lastNum!, anchor: p.star.num!.anchor })), 'apart');
      if (best > 100) assert.ok(p.star.num!.x > p.endless.c[0] + p.endless.ouro.reach, 'beside the seal, the last run\'s over yours');
      else {
        assert.ok(p.star.lastNum!.y < p.star.c[1] - p.star.gloryR, "the last run's over the star");
        assert.ok(p.star.num!.y > p.star.c[1] + p.star.gloryR, 'yours under it');
      }
      assert.deepEqual(
        p.legend.rows.map((r) => r.kind),
        ['last', 'best'],
      );
    }
  for (const p of [...plates(45, 20), ...plates(216, 30), ...plates(null, null)]) {
    const right = p.legend.x + 58;
    const gap = p.endless.c[0] - p.endless.r - right;
    assert.ok(gap >= 20 && gap <= 32, `the legend about 30 px from the seal, less on a narrow plate (${gap.toFixed(1)})`);
    assert.ok(p.legend.x >= 0, 'on the plate');
  }
  for (const p of plates(45, null)) {
    assert.ok(!p.star.both && p.star.lastNum === null);
    assert.deepEqual(
      p.legend.rows.map((r) => r.kind),
      ['best'],
    );
  }
  for (const p of plates(45, 20))
    assert.deepEqual(
      p.legend.rows.map((r) => r.kind),
      ['last', 'best'],
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
      assert.ok(Math.abs(y1 - y0) < 0.1 && x1 > x0, `line ${i} starts level`);
    }
  }
  for (const p of plates(216, 30, [])) {
    assert.equal(p.stations.length, 0);
    assert.equal(p.parts.filter((x) => x.tone === 'lead').length, 0);
  }
});

test("a find's depth stands in the middle of its slant, the line broken round it", () => {
  for (const [best, last] of [
    [45, 20],
    [216, 30],
    [null, null],
  ] as const)
    for (const p of plates(best, last)) {
      const lines = p.parts.filter((x) => x.tone === 'lead');
      for (const [i, m] of p.marks.entries()) {
        const pts = lines[i].strokes.map((s) => s.d.slice(1).split(/[ L]/).map(Number));
        // The gap the mark sits in: between the end of one piece and the start of the next, the mark on that line, half way along the slant.
        const gaps = pts.slice(1).map((q, k) => {
          const a = pts[k].slice(-2) as [number, number];
          const b = q.slice(0, 2) as [number, number];
          return { a, b };
        });
        const hit = gaps.find(({ a, b }) => {
          const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
          const L = Math.hypot(dx, dy);
          const t = ((m.x - a[0]) * dx + (m.y - a[1]) * dy) / (L * L);
          return t > 0.3 && t < 0.7 && Math.abs((m.x - a[0]) * dy - (m.y - a[1]) * dx) / L < 0.5;
        });
        assert.ok(hit, `${best}/${last} at ${p.w}: ${m.kind}'s depth sits in a break of its line`);
      }
    }
});

test('the zones not reached are held in a brace beside the left wall, its word left of it', () => {
  for (const p of plates(12, 5)) {
    const u = p.uncharted!;
    assert.ok(u && u.upper && u.lower, 'a brace');
    assert.equal(u.balls.length, 2);
    for (const b of u.balls) assert.ok(b[0] < wallAt(p, b[1]).outer - 1, 'its terminals short of the wall');
    assert.ok(u.x - 50 > 0, 'the word on the plate');
    assert.ok(u.balls[0][1] > p.names.at(-1)!.y, 'under the zones named');
  }
  for (const p of plates(216, 30)) assert.equal(p.uncharted, null);
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
