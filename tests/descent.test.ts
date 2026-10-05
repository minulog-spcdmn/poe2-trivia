import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLUE_FROM,
  MILESTONES,
  STRATA,
  SURFACE,
  currentDescent,
  descent,
  lookOf,
  milestoneAt,
  setDescent,
  shownDepth,
  snapDescent,
  stepDescent,
  strataAt,
  type Look,
} from '../src/lib/descent.ts';
import { CALM_EMBERS, COLUMNS, EMBERS, Embers, GLINT_COLOR, GLINTS, PALETTE, ROWS, SIZE_STRIDE, SLOTS, TILES, WALL_GLINTS } from '../src/lib/backdropEmbers.ts';
import { DELVE_BLUE_FROM } from '../src/lib/fx/streaks.ts';

/** Every number in a look, in a fixed order. */
const numbers = (l: Look) => Object.values(l).flatMap((v) => (Array.isArray(v) ? v : [v]));

/** How different two looks are where it shows: the light from below, the smoke, the embers' colour, the dark. */
function difference(a: Look, b: Look) {
  const rgb = (x: number[], y: number[], k: number) => Math.hypot(...x.map((v, i) => (v - y[i]) * k));
  return (
    rgb(a.floor, b.floor, 1 / 255) +
    rgb(a.smoke, b.smoke, 1 / 255) * a.smokeMix +
    rgb(a.ember, b.ember, 1) +
    Math.abs(a.dark - b.dark) +
    Math.abs(a.fall - b.fall) +
    Math.abs(a.spread - b.spread) * a.glints
  );
}

test('outside Delve and at depth 1 the scene is the usual one', () => {
  for (const d of [0, 0.5, 1]) {
    assert.deepEqual(descent(d).look, SURFACE, `depth ${d}`);
    assert.equal(descent(d).deep, 0);
    assert.equal(descent(d).abyss, 0);
  }
});

test('the depth the ambience follows grows smoothly and levels off; the abyss lies between 50 and 75', () => {
  let prev = descent(0);
  for (let d = 0.25; d <= 300; d += 0.25) {
    const now = descent(d);
    for (const k of ['deep', 'abyss'] as const) {
      assert.ok(Number.isFinite(now[k]) && now[k] >= 0 && now[k] <= 1, `${k} at ${d}`);
      assert.ok(now[k] >= prev[k] - 1e-12, `${k} falls at ${d}`);
    }
    prev = now;
  }
  assert.ok(descent(1000).deep - descent(100).deep < 0.02);
  assert.equal(descent(50).abyss, 0);
  assert.equal(descent(75).abyss, 1);
});

test('every look stays finite and in range, however deep, even for nonsense depths', () => {
  for (const d of [...Array.from({ length: 2400 }, (_, i) => i * 0.5), 1e4 + 3.7, 1e6, 1e9 + 0.5, NaN, -5, Infinity]) {
    const l = descent(d).look;
    for (const v of numbers(l)) assert.ok(Number.isFinite(v) && v >= 0, `${v} at ${d}`);
    for (const c of [l.floor, l.haze, l.smoke, l.smokeHi, l.mist]) assert.ok(c.every((v) => v <= 255), `colour at ${d}`);
    for (const c of [l.ember, l.core, l.glint]) assert.ok(c.every((v) => v <= 1), `ember colour at ${d}`);
    assert.ok(l.dark < 0.9, `too dark at ${d}`);
    assert.ok(l.floorK <= 0.5, `the light from below too bright behind the UI at ${d}`);
  }
});

test('the first ten depths already change, a little with every depth', () => {
  assert.ok(difference(descent(1).look, descent(5).look) > 0.15, 'depth 5 looks like depth 1');
  assert.ok(difference(descent(5).look, descent(10).look) > 0.15, 'depth 10 looks like depth 5');
  assert.ok(difference(descent(10).look, descent(15).look) > 0.5, 'depth 15 looks like depth 10');
});

test('each ten depths, to 100 and far past it, look clearly unlike the ten before', () => {
  for (let d = 15; d <= 1005; d += 10) {
    const diff = difference(descent(d - 10).look, descent(d).look);
    assert.ok(diff > 0.5, `depth ${d} looks like depth ${d - 10} (${diff.toFixed(2)})`);
  }
  // Through 100 no two strata look alike at all.
  for (let a = 0; a < STRATA.length; a++)
    for (let b = a + 1; b < STRATA.length; b++) assert.ok(difference(lookOf(a), lookOf(b)) > 0.4, `strata ${a} and ${b}`);
});

test('the look changes gradually: never much of a stratum from one depth to the next', () => {
  let prev = descent(0).look;
  for (let d = 0.5; d <= 400; d += 0.5) {
    const now = descent(d).look;
    const { stratum } = strataAt(d);
    // A stratum turns in over five depths, the first over nine.
    const whole = difference(lookOf(stratum - 1), lookOf(stratum));
    assert.ok(difference(prev, now) <= 0.17 * whole + 0.02, `a jump at ${d}`);
    prev = now;
  }
});

test('the embers first burn blue at depth 21, where a streak can first burn blue', () => {
  assert.equal(BLUE_FROM, DELVE_BLUE_FROM);
  const blue = (k: number) => lookOf(k).ember[2] > 0.9 && lookOf(k).ember[0] < 0.5;
  const at = strataAt(BLUE_FROM);
  assert.ok(blue(at.stratum) && at.turn > 0, 'turning blue at BLUE_FROM');
  for (let d = 0; d < BLUE_FROM; d++) {
    const { stratum, turn } = strataAt(d);
    assert.ok(!blue(stratum) || turn === 0, `blue embers at ${d}`);
    assert.ok(!blue(stratum - 1), `blue embers at ${d}`);
  }
  // Blue is one stratum among many, not the last.
  assert.ok(!blue(STRATA.length - 1));
});

test('named depths: the Delve biome of each stratum after the first, as it begins, for ever, never the same twice in a row', () => {
  for (let d = 0; d <= 10; d++) assert.equal(milestoneAt(d), null, `depth ${d}`);
  assert.deepEqual(
    MILESTONES.map((m) => `${m.depth} ${m.name}`),
    [
      '11 Magma Fissure',
      '21 Frozen Hollow',
      '31 Fungal Caverns',
      '41 Vaal Outpost',
      '51 Abyssal Depths',
      '61 Petrified Forest',
      '71 Sulphur Vents',
      '81 Abyssal City',
      '91 Primeval Ruins',
    ],
  );
  for (const m of MILESTONES) assert.equal(milestoneAt(m.depth), m.name);
  const biomes = new Set(MILESTONES.map((m) => m.name));
  let last: string | null = null;
  const past100 = new Set<string>();
  for (let d = 11; d <= 3001; d++) {
    const name = milestoneAt(d);
    if (d % 10 !== 1) {
      assert.equal(name, null, `depth ${d}`);
      continue;
    }
    assert.ok(name && biomes.has(name), `depth ${d}: ${name}`);
    assert.notEqual(name, last, `${name} twice in a row at ${d}`);
    if (d > 100) past100.add(name);
    last = name;
  }
  assert.equal(past100.size, biomes.size, 'every biome comes round again past 100');
  assert.ok(!milestoneAt(1e6 + 1)?.includes('undefined'));
  assert.equal(milestoneAt(Number.NaN), null);
  // The card's name matches the stratum the scene turns into there.
  assert.equal(strataAt(21).stratum, 2);
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
  assert.deepEqual(currentDescent().look, descent(41).look);
  setDescent(0);
  assert.equal(snapDescent(), true);
  assert.equal(snapDescent(), false);
});

/** The embers written for the shader: (x, y, size, brightness, palette entry) per slot. */
function slots(e: Embers) {
  const out: number[][] = [];
  for (let t = 0; t < TILES; t++)
    for (let s = 0; s < SLOTS; s++) {
      const k = (t * SLOTS + s) * 4;
      if (e.data[k + 3] > 0) {
        const entry = Math.floor(e.data[k + 2] / SIZE_STRIDE);
        out.push([e.data[k], e.data[k + 1], e.data[k + 2] - entry * SIZE_STRIDE, e.data[k + 3], entry]);
      }
    }
  return out;
}

/** The halo colour of a palette entry. */
const halo = (e: Embers, entry: number) => [...e.halo.slice(entry * 4, entry * 4 + 3)];
const close = (a: number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test('at the surface every ember burns the usual orange and no glint shows', () => {
  const e = new Embers();
  e.descend(descent(0));
  for (let i = 0; i < 300; i++) e.step(0.1, 1200, 800);
  const all = slots(e);
  assert.ok(all.length > 10);
  assert.ok(all.every(([, , , , entry]) => entry !== GLINT_COLOR && close(halo(e, entry), SURFACE.ember)));
});

test('a new stratum spreads ember by ember as they start a new rise, or all at once on recolor', () => {
  const e = new Embers();
  e.descend(descent(20));
  e.recolor();
  for (let i = 0; i < 5; i++) e.step(0.05, 1200, 800);
  const blue = () => slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR && close(halo(e, entry), STRATA[2].look.ember)).length;
  assert.equal(blue(), 0, 'no blue at depth 20');
  // Heading for depth 23, about half way into the azure stratum.
  const aim = descent(23);
  e.descend(descent(20), aim);
  e.step(0.05, 1200, 800);
  assert.ok(blue() < 5, 'the colour should not flip at once');
  e.recolor();
  e.step(0.01, 1200, 800);
  const embers = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR).length;
  assert.ok(blue() / embers > aim.turn - 0.25 && blue() / embers < aim.turn + 0.25, `about ${aim.turn.toFixed(2)} blue after recolor: ${blue()}/${embers}`);
});

test('glints show as a stratum has them: in the side walls, or all over; fewer on a phone', () => {
  const e = new Embers();
  const at = (k: number) => ({ ...descent(0), look: lookOf(k) });
  const glints = (w: number) => {
    e.step(0.01, w, 800);
    // A glint takes a slot in every tile its glow reaches: count each once.
    return [...new Map(slots(e).filter(([, , , , entry]) => entry === GLINT_COLOR).map((s) => [`${s[0]}:${s[1]}`, s])).values()];
  };
  e.descend(at(2)); // azurite in the walls
  const walls = glints(1200);
  assert.ok(walls.length >= WALL_GLINTS - 1 && walls.every(([x]) => x < 0.25 * 1200 || x > 0.75 * 1200), `${walls.length} glints in the walls`);
  assert.ok(glints(375).length < walls.length, 'as many on a phone');
  e.descend(at(8)); // the starless stratum: stars all over
  const stars = glints(1200);
  assert.ok(stars.length > WALL_GLINTS && stars.some(([x]) => x > 0.3 * 1200 && x < 0.7 * 1200), `${stars.length} stars`);
  assert.ok(stars.length <= GLINTS);
  e.descend(at(0)); // the first stratum has none
  assert.equal(glints(1200).length, 0);
});

test('in the drowned stratum the motes sink instead of rising', () => {
  /** How many embers move down and up over a moment. */
  const moves = (k: number) => {
    const e = new Embers();
    e.descend({ ...descent(0), look: lookOf(k) });
    e.step(0, 1200, 800, false, true);
    e.step(1, 1200, 800);
    const before = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR);
    e.step(0.002, 1200, 800);
    const after = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR);
    let down = 0;
    let up = 0;
    for (const [x, y] of before) {
      const next = after.find(([x2, y2]) => Math.abs(x2 - x) < 0.5 && Math.abs(y2 - y) < 2 && y2 !== y);
      if (next) next[1] > y ? down++ : up++;
    }
    return { down, up };
  };
  assert.equal(STRATA[7].look.fall, 1);
  const rising = moves(0);
  const sinking = moves(7);
  assert.ok(rising.up > 10 && rising.down === 0, `rising: ${JSON.stringify(rising)}`);
  assert.ok(sinking.down > 10 && sinking.up === 0, `sinking: ${JSON.stringify(sinking)}`);
});

test('deep down nothing overflows and no tile holds more than its slots', () => {
  const e = new Embers();
  for (const k of [9, 5, 8, 14, 127]) {
    e.descend({ ...descent(0), look: lookOf(k) }, { stratum: k, turn: 0.5 });
    e.swarm(1);
    for (let i = 0; i < 400; i++) e.step(0.05, 1200, 800);
    for (const s of slots(e)) assert.ok(s.every(Number.isFinite));
    for (const [, , size, , entry] of slots(e)) assert.ok(size > 0 && size < SIZE_STRIDE && entry >= 0 && entry < PALETTE);
  }
  assert.ok(slots(e).length <= TILES * SLOTS);
  assert.ok(EMBERS > CALM_EMBERS);
  assert.equal(TILES, COLUMNS * ROWS);
});

test('with effects off the stratum still colours the embers, but they stay calm', () => {
  const e = new Embers();
  e.descend(descent(15), descent(15));
  e.recolor();
  for (let i = 0; i < 200; i++) e.step(0.05, 1200, 800, true);
  assert.equal(e.level, 0, 'not stoked');
  const embers = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR);
  assert.ok(embers.length > 0 && embers.every(([, , , , entry]) => close(halo(e, entry), STRATA[1].look.ember)), 'blood red');
});

test("a moment's tint covers the stratum's colours while it lasts, and gives them back", () => {
  const e = new Embers();
  e.descend(descent(25), descent(25));
  e.recolor();
  e.tint([1, 0.14, 0.06]);
  for (let i = 0; i < 200; i++) e.step(0.05, 1200, 800);
  const entry = slots(e).find(([, , , , k]) => k !== GLINT_COLOR)![4];
  assert.ok(halo(e, entry).every((v, i) => Math.abs(v - [1, 0.14, 0.06][i]) < 0.01), `tinted: ${halo(e, entry)}`);
  e.tint();
  for (let i = 0; i < 200; i++) e.step(0.05, 1200, 800);
  assert.ok(halo(e, entry).every((v, i) => Math.abs(v - STRATA[2].look.ember[i]) < 0.01), 'back to blue');
});

test('while the depth eases in, embers take the colour of the depth it heads for, and none turns back', () => {
  const e = new Embers();
  e.step(0.05, 1200, 800);
  // Shown: still the surface. Heading for: deep in the azure stratum.
  const aim = descent(27);
  e.descend(descent(0), aim);
  e.recolor();
  e.step(0.01, 1200, 800);
  const blue = () => slots(e).filter(([, , , , k]) => k !== GLINT_COLOR && !close(halo(e, k), STRATA[2].look.ember)).length;
  assert.ok(blue() < 5, 'a recolor goes by where the scene heads');
  for (let i = 0; i < 300; i++) e.step(0.1, 1200, 800);
  assert.equal(blue(), 0, 'some turned back on a new rise');
});
