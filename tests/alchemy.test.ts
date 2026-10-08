import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEMINI, RETORT } from '../src/lib/alchemy.ts';

/** The arcs of a path: radius, the large-arc and sweep flags, and where each starts and ends. */
function arcs(d: string) {
  const out: { r: number; large: number; from: number[]; to: number[] }[] = [];
  let at = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MLVHAZ])([^MLVHAZ]*)/g)) {
    const n = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'L') at = [n[0], n[1]];
    else if (cmd === 'V') at = [at[0], n[0]];
    else if (cmd === 'H') at = [n[0], at[1]];
    else if (cmd === 'A') {
      out.push({ r: n[0], large: n[3], from: at, to: [n[5], n[6]] });
      at = [n[5], n[6]];
    }
  }
  return out;
}

test("the retort's neck bends the short way round, from the belly up over to the spout", () => {
  // Its two walls are the arcs of radius 1.77 and 0.93 (lib/alchemy.ts RETORT: 1.35 ± 0.42).
  const walls = arcs(RETORT).filter((a) => a.r === 1.77 || a.r === 0.93);
  assert.equal(walls.length, 2);
  for (const w of walls) {
    assert.equal(w.large, 0, 'less than half a turn');
    assert.ok(w.from[0] < w.to[0], 'from the belly on the left to the spout on the right');
  }
});

test("Gemini's pillars meet its lintel and sill", () => {
  const pillars = [...GEMINI.matchAll(/M(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));
  const bars = arcs(GEMINI);
  assert.equal(pillars.length, 2);
  for (const [x, top, foot] of pillars)
    for (const [y, bar] of [
      [top, bars[0]],
      [foot, bars[1]],
    ] as const) {
      // The bar's circle passes through its ends and its middle; the pillar's end lies on it.
      const [ax, ay] = bar.from;
      const mid = y < 0 ? ay + 1 : ay - 1;
      const cy = (ax * ax + ay * ay - mid * mid) / (2 * (ay - mid));
      assert.ok(Math.abs(Math.hypot(x, y - cy) - bar.r) < 0.02, `pillar at ${x} meets the bar at ${y}`);
    }
});
