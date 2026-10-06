import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLUE_FROM,
  ENV,
  ENVIRONMENTS,
  MILESTONES,
  STRATA,
  SURFACE,
  accentAt,
  currentDescent,
  descent,
  lookOf,
  milestoneAt,
  setDescent,
  shownDepth,
  snapDescent,
  stepDescent,
  strataAt,
  stratumName,
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
  assert.ok(difference(descent(1).look, descent(4).look) > 0.15, 'depth 4 looks like depth 1');
  assert.ok(difference(descent(4).look, descent(7).look) > 0.1, 'depth 7 looks like depth 4');
  assert.ok(difference(descent(7).look, descent(12).look) > 0.5, 'depth 12 looks like depth 7');
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
    // A stratum turns in over five depths, the first over nine; its colour
    // turns quickest, over the two depths where the light is dimmest.
    const whole = difference(lookOf(stratum - 1), lookOf(stratum));
    assert.ok(difference(prev, now) <= 0.26 * whole + 0.02, `a jump at ${d}`);
    prev = now;
  }
});

test('each stratum creeps in over the last three depths before it and is mostly there when its card shows', () => {
  for (let k = 1; k <= 40; k++) {
    const first = 10 * k + 1;
    assert.deepEqual(descent(first - 4).look.env, lookOf(k - 1).env, `the one before still whole at ${first - 4}`);
    for (const d of [first - 3, first - 2, first - 1]) assert.equal(strataAt(d).stratum, k, `creeping in at ${d}`);
    assert.ok(strataAt(first - 3).turn > 0.05 && strataAt(first - 3).turn < 0.2, `a hint at ${first - 3}`);
    assert.ok(strataAt(first - 1).turn > 0.5, `half there the depth before its card (${first - 1})`);
    assert.ok(strataAt(first).turn > 0.85, `mostly there at its card (${first})`);
    assert.equal(strataAt(first + 1).turn, 1, `settled at ${first + 1}`);
    if (k > 1) assert.equal(stratumName(strataAt(first).stratum), milestoneAt(first));
  }
  // The blue embers are the azure stratum's, announced where a streak can first burn blue.
  assert.equal(BLUE_FROM, DELVE_BLUE_FROM);
  const blue = (k: number) => lookOf(k).ember[2] > 0.9 && lookOf(k).ember[0] < 0.5;
  assert.ok(blue(strataAt(BLUE_FROM).stratum));
  for (let d = 0; d <= BLUE_FROM - 4; d++) {
    const { stratum, turn } = strataAt(d);
    assert.ok((!blue(stratum) || turn === 0) && !blue(stratum - 1), `blue embers at ${d}`);
  }
  // Blue is one stratum among many, not the last.
  assert.ok(!blue(STRATA.length - 1));
});

test('one place gives way to the next: the old recedes before the new arrives, and the light is dimmest between', () => {
  const light = (l: Look) => l.floorK + l.hazeK * 0.3;
  for (let k = 1; k <= 30; k++) {
    const a = lookOf(k - 1);
    const b = lookOf(k);
    const mine = (env: number[], own: number[], other: number[]) => env.reduce((m, v, i) => (own[i] > other[i] ? Math.max(m, v) : m), 0);
    for (let d = 10 * k - 3; d <= 10 * k + 2; d += 0.25) {
      const l = descent(d).look;
      const old = mine(l.env, a.env, b.env);
      const next = mine(l.env, b.env, a.env);
      assert.ok(Math.min(old, next) < 0.35, `both places half there at ${d} (${old.toFixed(2)}, ${next.toFixed(2)})`);
    }
    // The depth before the card: the old place mostly gone, the new one coming in.
    const before = descent(10 * k).look;
    assert.ok(mine(before.env, a.env, b.env) < 0.2 && mine(before.env, b.env, a.env) > 0.3, `turn at ${10 * k}`);
    const mid = descent(10 * k - 0.5).look;
    assert.ok(light(mid) < 0.75 * (light(a) + light(b)) / 2, `no dimming between strata ${k - 1} and ${k}`);
  }
});

test('each stratum through 100 is an environment of its own; past 100 they pair up, never the same twice in a row', () => {
  assert.equal(SURFACE.env.length, ENV);
  assert.ok(SURFACE.env.every((v) => v === 0));
  STRATA.forEach((s, k) => assert.deepEqual(s.look.env, ENVIRONMENTS.map((_, i) => (i === k ? 1 : 0)), s.name));
  let prev = lookOf(STRATA.length - 1).env;
  for (let k = STRATA.length; k < 400; k++) {
    const env = lookOf(k).env;
    assert.equal(env.length, ENV);
    assert.ok(env.every((v) => v >= 0 && v <= 1), `stratum ${k}`);
    assert.ok(env.filter((v) => v > 0).length === 2, `two environments in stratum ${k}`);
    assert.ok(env.some((v, i) => Math.abs(v - prev[i]) > 0.4), `stratum ${k} like the one before`);
    assert.equal(lookOf(k), lookOf(k), 'made once');
    prev = env;
  }
});

test('the depth on the header takes the colour of its stratum', () => {
  assert.equal(accentAt(10), accentAt(1));
  assert.notEqual(accentAt(11), accentAt(10));
  assert.equal(accentAt(11), accentAt(20));
  assert.equal(accentAt(21), `rgb(${STRATA[2].look.accent.join(', ')})`);
  for (let d = 1; d < 400; d++) {
    const [r, g, b] = accentAt(d).match(/\d+/g)!.map(Number);
    // Light enough to read on the dark header.
    assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b > 120, `too dark at ${d}: ${accentAt(d)}`);
  }
});

test('the dark closes in a little with every depth of a stratum, most as it gives way, opens out into the next, and is closer the deeper', () => {
  for (let k = 0; k < 30; k++) {
    for (let d = 10 * k + 2; d < 10 * k + 9; d++)
      assert.ok(descent(d + 1).close > descent(d).close + 0.03, `no closer at ${d + 1}`);
    assert.ok(descent(10 * k + 11).close < descent(10 * k + 9).close - 0.2, `no opening out at ${10 * k + 11}`);
    // It turns from closing in to opening out smoothly.
    for (let d = 10 * k + 2; d < 10 * k + 12; d += 0.25)
      assert.ok(Math.abs(descent(d + 0.25).close - descent(d).close) < 0.1, `a jump at ${d}`);
  }
  assert.ok(descent(61).close > descent(11).close + 0.1);
  for (let d = 0; d <= 1000; d += 0.25) {
    const c = descent(d).close;
    assert.ok(c >= 0 && c <= 1, `${c} at ${d}`);
  }
  assert.equal(descent(0).close, 0);
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

test('the shown depth eases to the game depth: about a second a depth, never a jump', () => {
  setDescent(0);
  snapDescent();
  for (let d = 1; d <= 25; d++) {
    setDescent(d);
    let t = 0;
    let last = shownDepth();
    while (stepDescent(1 / 60)) {
      t += 1 / 60;
      assert.ok(shownDepth() > last && shownDepth() - last < 0.05, `a jump at ${shownDepth()}`);
      last = shownDepth();
    }
    assert.ok(t > 0.5 && t < 1.5, `depth ${d} took ${t.toFixed(2)} s`);
    assert.deepEqual(currentDescent().look, descent(d).look);
  }
  setDescent(0);
  assert.equal(snapDescent(), true);
  assert.equal(snapDescent(), false);
});

test('leaving a run, or a rejoin deep down, cross-fades straight there instead of walking through every stratum', () => {
  /** The environments showing, by index. */
  const showing = () => new Set(currentDescent().look.env.flatMap((v, i) => (v > 1e-9 ? [i] : [])));
  for (const [a, b] of [
    [64, 0],
    [0, 64],
    [87, 3],
    [120, 0],
  ]) {
    setDescent(a);
    snapDescent();
    const before = showing();
    const after = new Set(descent(b).look.env.flatMap((v, i) => (v > 0 ? [i] : [])));
    setDescent(b);
    let t = 0;
    let lastDark = currentDescent().look.dark;
    while (stepDescent(1 / 60)) {
      t += 1 / 60;
      for (const i of showing()) assert.ok(before.has(i) || after.has(i), `${a} to ${b}: stratum ${i} on the way`);
      const dark = currentDescent().look.dark;
      assert.ok(Math.abs(dark - lastDark) < 0.05, `${a} to ${b}: a jump`);
      lastDark = dark;
    }
    assert.ok(t > 1 && t < 2.5, `${a} to ${b} took ${t.toFixed(2)} s`);
    assert.deepEqual(currentDescent().look, descent(b).look);
  }
  setDescent(0);
  snapDescent();
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
  e.descend(descent(16));
  e.recolor();
  for (let i = 0; i < 5; i++) e.step(0.05, 1200, 800);
  const blue = () => slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR && close(halo(e, entry), STRATA[2].look.ember)).length;
  assert.equal(blue(), 0, 'no blue at depth 16');
  // Heading for depth 20, about half way into the azure stratum.
  const aim = descent(20);
  e.descend(descent(16), aim);
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

test('in the frozen stratum the motes drift down instead of rising', () => {
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
  assert.equal(STRATA[2].look.fall, 1);
  const rising = moves(0);
  const sinking = moves(2);
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
