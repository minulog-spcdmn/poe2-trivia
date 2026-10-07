import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAGE_HALF,
  CAPTION,
  ENDLESS_FROM,
  LEVELS,
  SEAMS,
  bandTop,
  depthY,
  driftOf,
  endlessFor,
  frontierY,
  inEndlessRow,
  layoutFor,
  levelOf,
  levelsFor,
} from '../src/lib/descentPlateA.ts';
import { FINDS, shownDepth } from '../src/lib/delve.ts';
import { stratumName } from '../src/lib/descent.ts';

const WIDTHS = [281, 329, 450];
const SAMPLES = [0, 1, 4, 9, 10, 11, 19, 20, 36, 37, 89, 90, 98, 99, 100, 101, 109, 110, 149, 150, 998, 999, 9998, 9999];

test('the plate keeps to its height at every card width', () => {
  for (const w of WIDTHS) {
    const L = layoutFor(w);
    assert.ok(L.dh <= (L.wide ? 300 : 280), `section at ${w} is ${L.dh} px`);
    assert.equal(L.wide, w >= 440);
    assert.ok(L.dw <= w);
  }
});

test('before any run the cage waits at the collar, above the ground', () => {
  for (const w of WIDTHS) {
    const L = layoutFor(w);
    assert.ok(depthY(L, null) + CAGE_HALF < L.ground);
    assert.equal(frontierY(L, null), L.ground);
  }
});

test('in the levels the cage hangs wholly inside its own level, a zone\'s first depth included', () => {
  for (const w of WIDTHS) {
    const L = layoutFor(w);
    for (let s = 0; s < ENDLESS_FROM; s++) {
      const k = Math.floor(s / 10);
      const y = depthY(L, s);
      assert.ok(y - CAGE_HALF >= bandTop(L, k), `depth ${s} at ${w}: top in level ${k}`);
      assert.ok(y + CAGE_HALF <= bandTop(L, k) + L.band, `depth ${s} at ${w}: bottom in level ${k}`);
      assert.equal(levelOf(s), k);
    }
  }
});

test('the cage goes deeper with every depth and never leaves the plate', () => {
  for (const w of WIDTHS) {
    const L = layoutFor(w);
    let last = -Infinity;
    for (const s of SAMPLES) {
      const y = depthY(L, s);
      assert.ok(y > last, `depth ${s} at ${w} below the one before`);
      last = y;
      assert.ok(y + CAGE_HALF <= L.dh, `depth ${s} at ${w} inside the plate`);
    }
    // Past the levels: in the endless deep, under the last level.
    assert.ok(depthY(L, ENDLESS_FROM) - CAGE_HALF >= L.deep);
    assert.ok(inEndlessRow(L, ENDLESS_FROM));
    assert.ok(!inEndlessRow(L, 9999));
    assert.equal(levelOf(9999), LEVELS);
  }
});

test('the known rock ends under the deepest level reached', () => {
  const L = layoutFor(281);
  assert.equal(frontierY(L, 0), bandTop(L, 1));
  assert.equal(frontierY(L, 9), bandTop(L, 1));
  assert.equal(frontierY(L, 10), bandTop(L, 2));
  assert.equal(frontierY(L, 99), L.deep);
  assert.ok(frontierY(L, 150) > depthY(L, 150));
});

test('nothing the player has not reached is named or coloured', () => {
  for (const s of [null, ...SAMPLES]) {
    for (const l of levelsFor(s)) {
      const reached = s !== null && s >= l.from;
      assert.equal(l.reached, reached, `level ${l.from} at ${s}`);
      if (!reached) {
        assert.equal(l.name, null);
        assert.equal(l.color, null);
      } else {
        assert.equal(l.name, stratumName(l.k));
        assert.ok(l.color);
      }
    }
    const e = endlessFor(s);
    if (s === null || s < ENDLESS_FROM) {
      assert.equal(e.reached, false);
      assert.equal(e.name, null);
      assert.equal(e.color, null);
    } else {
      // The stratum the deepest lies in, and no other.
      assert.equal(e.name, stratumName(Math.floor(s / 10)));
    }
  }
});

test('levels start at the depths players see: 0, 10, 20 ...', () => {
  assert.deepEqual(
    levelsFor(null).map((l) => l.from),
    Array.from({ length: LEVELS }, (_, k) => 10 * k),
  );
  assert.equal(ENDLESS_FROM, 10 * LEVELS);
});

test('the seams start where each find first turns up, in that order', () => {
  const finds = FINDS.filter((f) => f.cap > 0);
  assert.equal(SEAMS.length, finds.length);
  for (const seam of SEAMS) assert.equal(seam.from, shownDepth(finds.find((f) => f.kind === seam.kind)!.from));
  assert.deepEqual(
    SEAMS.map((s) => s.from),
    [...SEAMS.map((s) => s.from)].sort((a, b) => a - b),
  );
});

test('the drifts stay clear of the seams and of each other', () => {
  for (const w of WIDTHS) {
    const L = layoutFor(w);
    for (let k = 0; k <= LEVELS; k++) {
      const d = driftOf(L, k);
      assert.ok(d.face < L.lanes[0] - 5, `level ${k} at ${w}`);
      assert.ok(d.x0 > L.nameX + 80, `room for a name at level ${k}, ${w}`);
      assert.ok(d.top >= bandTop(L, k) && d.floor <= bandTop(L, k) + L.band);
    }
  }
});

test('the caption is plain text without em dashes', () => {
  const all = [CAPTION.lead, CAPTION.after, ...Object.values(CAPTION.finds).flatMap((f) => [f.name, f.text])];
  for (const t of all) assert.ok(!t.includes(String.fromCharCode(0x2014)), t);
});
