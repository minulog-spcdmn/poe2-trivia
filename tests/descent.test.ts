import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLUE_FIRST, BLUE_FROM, BLUE_FULL, currentDescent, descent, setDescent, shownDepth, snapDescent, stepDescent } from '../src/lib/descent.ts';
import { CALM_EMBERS, COLUMNS, EMBERS, Embers, MAX_VEINS, SLOTS } from '../src/lib/backdropEmbers.ts';
import { DELVE_BLUE_FROM } from '../src/lib/fx/streaks.ts';

const KEYS = ['deep', 'agit', 'red', 'blue', 'veins', 'abyss'] as const;

test('outside Delve the scene is the usual one', () => {
  for (const k of KEYS) assert.equal(descent(0)[k], 0, k);
});

test('every part of the descent only grows deeper, stays finite and levels off', () => {
  let prev = descent(0);
  for (let d = 0.25; d <= 300; d += 0.25) {
    const now = descent(d);
    for (const k of KEYS) {
      assert.ok(Number.isFinite(now[k]) && now[k] >= 0 && now[k] <= 1, `${k} at ${d}`);
      assert.ok(now[k] >= prev[k] - 1e-12, `${k} falls at ${d}`);
    }
    prev = now;
  }
  for (const d of [1e3, 1e6, NaN, -5, Infinity]) for (const k of KEYS) assert.ok(Number.isFinite(descent(d)[k]), `${k} at ${d}`);
  assert.ok(descent(1000).deep - descent(100).deep < 0.02);
});

test('the embers turn blue from depth 21, where a streak can first burn blue, all of them by 50', () => {
  assert.equal(BLUE_FROM, DELVE_BLUE_FROM);
  assert.equal(descent(BLUE_FROM - 1).blue, 0);
  assert.equal(descent(BLUE_FROM).blue, BLUE_FIRST);
  assert.equal(descent(BLUE_FULL).blue, 1);
});

test('the shown depth eases to the game depth: about two seconds a depth, never a jump', () => {
  setDescent(0);
  snapDescent();
  setDescent(1);
  let t = 0;
  while (stepDescent(0.05)) t += 0.05;
  assert.ok(t > 1 && t < 3, `one depth took ${t.toFixed(2)} s`);
  setDescent(41);
  t = 0;
  let last = shownDepth();
  while (stepDescent(1 / 60)) {
    t += 1 / 60;
    assert.ok(shownDepth() - last < 1, 'a jump of a whole depth in one frame');
    last = shownDepth();
  }
  assert.ok(t < 10, `0 to 40 took ${t.toFixed(1)} s`);
  assert.equal(currentDescent().blue, descent(41).blue);
  setDescent(0);
  assert.equal(snapDescent(), true);
  assert.equal(snapDescent(), false);
});

/** The embers written for the shader: (x, y, size, brightness) per slot. */
function slots(e: Embers) {
  const out: number[][] = [];
  for (let c = 0; c < COLUMNS; c++)
    for (let s = 0; s < SLOTS; s++) {
      const k = (c * SLOTS + s) * 4;
      if (e.data[k + 3] > 0) out.push([...e.data.slice(k, k + 4)]);
    }
  return out;
}

const SURFACE = { agit: 0, red: 0, blue: 0, veins: 0, abyss: 0 };

test('at the surface no ember is blue and no glint shows', () => {
  const e = new Embers();
  e.descend(SURFACE);
  for (let i = 0; i < 300; i++) e.step(0.1, 1200, 800);
  assert.ok(slots(e).every(([, , size]) => size > 0));
});

test('blue spreads ember by ember as they start a new rise, or all at once on recolor', () => {
  const e = new Embers();
  e.step(0.05, 1200, 800);
  e.descend({ ...SURFACE, blue: 0.5 });
  e.step(0.05, 1200, 800);
  const coldNow = slots(e).filter(([, , size]) => size < 0).length;
  assert.ok(coldNow < 5, 'the colour should not flip at once');
  e.recolor();
  e.step(0.01, 1200, 800);
  const cold = slots(e).filter(([, , size]) => size < 0).length;
  const all = slots(e).length;
  assert.ok(cold / all > 0.3 && cold / all < 0.7, `about half blue after recolor: ${cold}/${all}`);
});

test('glints of azurite show with the veins, in the side walls, fewer on a phone', () => {
  const e = new Embers();
  e.descend({ ...SURFACE, veins: 1 });
  e.step(0.01, 1200, 800);
  const glints = (w: number) => {
    e.step(0.01, w, 800);
    // A glint takes a slot in every column its glow reaches: count each once.
    return new Set(slots(e).filter(([x, y, size]) => size < 0 && (x < 0.25 * w || x > 0.75 * w) && y > 0).map(([x, y]) => `${x}:${y}`)).size;
  };
  assert.equal(glints(1200), MAX_VEINS);
  assert.equal(glints(375), 9);
});

test('deep down nothing overflows and no column holds more than its slots', () => {
  const e = new Embers();
  e.descend({ agit: 1, red: 1, blue: 1, veins: 1, abyss: 1 });
  for (let i = 0; i < 2000; i++) e.step(0.05, 1200, 800);
  for (const [x, y, size, b] of slots(e)) assert.ok([x, y, size, b].every(Number.isFinite));
  assert.ok(slots(e).length <= COLUMNS * SLOTS);
  assert.ok(EMBERS > CALM_EMBERS);
});

test('with effects off the depth still colours the embers, but they stay calm', () => {
  const e = new Embers();
  e.descend({ agit: 1, red: 1, blue: 0, veins: 0, abyss: 0 });
  for (let i = 0; i < 200; i++) e.step(0.05, 1200, 800, true);
  assert.equal(e.level, 0, 'not stoked');
  assert.ok(e.color[1] < 0.4, `reddened: ${e.color.map((c) => c.toFixed(2))}`);
});
