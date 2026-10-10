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
  LIGHT_MAX,
  LIGHT_MIN,
  PLUNGE_MS,
  PLUNGE_SINK,
  ZONE_PLUNGE_MS,
  ZONE_PLUNGE_SINK,
  plunge,
  sinking,
  stepPlunge,
  estimateLuminance,
  hallTurn,
  emberTurn,
  HALL_FROM,
  settledAt,
  TURN_FROM,
  TURN_DEPTHS,
  dealtDeeper,
  magmaCooling,
  magmaCoolingOf,
  magmaGoesOut,
  magmaHeat,
  packFx,
  FX_SLOTS,
  FX_UNIFORM,
  NO_SLOT,
  toneOf,
  measuredAt,
  lightAt,
  luminanceAt,
  featuresAt,
  ENV_ADD,
  ENV_HALL,
  ENV_STEPS,
  LIGHT_STEP,
  MEASURED,
  ZONES_DARKEN_TO,
  brighterAt,
  lightSwing,
  type Look,
} from '../src/lib/descent.ts';
import { CALM_EMBERS, COLUMNS, EMBERS, Embers, GLINT_COLOR, GLINTS, PALETTE, ROWS, SIZE_STRIDE, SLOTS, TILES, WALL_GLINTS } from '../src/lib/backdropEmbers.ts';
import { DELVE_BLUE_FROM } from '../src/lib/fx/streaks.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHIPPED, setBackdrops } from '../src/lib/backdrops.ts';
import { cloneData, ENV_TONES, lookErrors, stopsOf, type Tones } from '../src/lib/backdropData.ts';

/** Every number in a look, in a fixed order. */
const numbers = (l: Look) =>
  Object.entries(l).flatMap(([k, v]) => (k === 'tones' ? Object.values(v as Tones).flatMap((t) => [...t!.colors.flat(), t!.vary]) : Array.isArray(v) ? v : [v]));

/** How different two looks are where it shows: the light from below, the smoke, the embers' colour, the dark. */
function difference(a: Look, b: Look) {
  const rgb = (x: number[], y: number[], k: number) => Math.hypot(...x.map((v, i) => (v - y[i]) * k));
  return (
    rgb(a.floor, b.floor, 1 / 255) +
    rgb(a.smoke, b.smoke, 1 / 255) +
    rgb(a.ember, b.ember, 1) +
    Math.abs(a.dark - b.dark) +
    Math.abs(a.fall - b.fall) +
    Math.abs(a.spread - b.spread) * a.glints
  );
}

test('outside Delve the scene is the usual one; depth 1 is the Mines as they begin, at the usual light', () => {
  for (const d of [0, 0.5, 1]) {
    assert.equal(descent(d).deep, 0);
    assert.equal(descent(d).abyss, 0);
  }
  // (Its colours aside: a look worked out carries every environment's, the ones it draws as the file has them.)
  const plain = (l: Look) => ({ ...l, tones: {} });
  assert.deepEqual(plain(descent(0).look), plain(SURFACE));
  assert.deepEqual(plain(descent(1).look), plain(STRATA[0].look));
  for (let i = 0; i < ENV; i++) if (STRATA[0].look.env[i] > 0) assert.deepEqual(toneOf(descent(1).look, i).colors, stopsOf(toneOf(STRATA[0].look, i)));
  assert.equal(descent(0).light, 1);
  assert.ok(Math.abs(descent(1).light - 1) < 1e-9);
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
    for (const t of Object.values(l.tones)) assert.ok(t!.colors.flat().every((v) => v <= 255) && t!.vary <= 1, `an environment's colours at ${d}`);
    assert.ok(l.dark < 0.9, `too dark at ${d}`);
    assert.ok(l.floorK <= 0.5, `the light from below too bright behind the UI at ${d}`);
  }
});

test('the Mines hold for their first depths, but for the dark closing in; then the next zone creeps in, a little with every depth, and holds in turn', () => {
  const diff = (a: number, b: number) => difference(descent(a).look, descent(b).look);
  assert.ok(diff(1, 5) > 0 && diff(1, 5) < 0.05, `depth 5 already turning (${diff(1, 5).toFixed(3)})`);
  assert.ok(diff(5, 8) > 0.08, 'depth 8 looks like depth 5');
  assert.ok(diff(8, 10) > 0.25, 'depth 10 looks like depth 8');
  assert.ok(diff(10, 12) > 0.1, 'depth 12 looks like depth 10');
  for (let d = 6; d <= 12; d++) assert.ok(diff(d - 1, d) > 0.01, `depth ${d} looks like depth ${d - 1}`);
  // The Magma Fissure, settled once its first question is answered, holds until its own turn begins at its 5th.
  assert.ok(diff(12, 15) > 0 && diff(12, 15) < 0.05, `depth 15 already turning (${diff(12, 15).toFixed(3)})`);
});

test('past the zones, each ten depths look clearly unlike the ten before', () => {
  // (The zones look as the file has them, whatever that is; the endgame's are generated to differ.)
  for (let d = 10 * STRATA.length + 15; d <= 1005; d += 10) {
    const diff = difference(descent(d - 10).look, descent(d).look);
    assert.ok(diff > 0.5, `depth ${d} looks like depth ${d - 10} (${diff.toFixed(2)})`);
  }
});

/** How much the scene changes between two looks: its light, smoke, glow, the embers' colour and the features. */
function change(a: Look, b: Look) {
  const rgb = (x: number[], y: number[]) => Math.hypot(...x.map((v, i) => (v - y[i]) / 255));
  return (
    rgb(a.floor.map((v) => v * a.floorK), b.floor.map((v) => v * b.floorK)) +
    rgb(a.haze.map((v) => v * a.hazeK), b.haze.map((v) => v * b.hazeK)) +
    (rgb(a.smoke, b.smoke) + rgb(a.smokeB, b.smokeB) + rgb(a.smokeHi, b.smokeHi) + rgb(a.smokeHiB, b.smokeHiB)) / 4 +
    Math.hypot(...a.ember.map((v, i) => v - b.ember[i])) +
    a.env.reduce((s, v, i) => s + Math.abs(v - b.env[i]), 0) / 2 +
    Math.abs(a.dark - b.dark)
  );
}

test('the look changes steadily: every depth a small step, none much bigger than the usual', () => {
  // Past the first stratum (which kindles from the surface's light), to far
  // down; the usual step is the zones' (the endgame's generated strata,
  // quieter, change by less).
  const steps: number[] = [];
  for (let d = 2; d <= 300; d++) steps.push(change(descent(d - 1).look, descent(d).look));
  const zoneSteps = steps.slice(0, 99);
  const mean = zoneSteps.reduce((a, b) => a + b, 0) / zoneSteps.length;
  const max = Math.max(...steps);
  // (The handovers are eased: half way through one a step is half as big
  // again as its average. The hall turns over six depths of every ten and
  // holds still through the other four, so the largest comes to about 3.1
  // times the usual; over nine, as it did, it came to 2.1 (a straight ramp's
  // to 1.7). A handover squeezed into four depths would come to 4.7.)
  assert.ok(max < 3.375 * mean, `the largest step ${max.toFixed(3)} is ${(max / mean).toFixed(2)} times the usual ${mean.toFixed(3)}`);
  // Nor does the light the hall is drawn at swing from one depth to the next.
  // (Beyond what makes way for a stratum's own light, lightK, as it changes.)
  for (let d = 2; d <= 600; d++) {
    const step = lightSwing(descent(d - 1), descent(d));
    assert.ok(step <= LIGHT_STEP + 1e-9, `the light swings by ${step.toFixed(3)} from ${d - 1} to ${d}`);
  }
  // Within a depth too: no jump between whole depths.
  let prev = descent(1).look;
  for (let d = 1.25; d <= 300; d += 0.25) {
    const now = descent(d).look;
    assert.ok(change(prev, now) < 0.5 * max + 1e-9, `a jump at ${d}`);
    prev = now;
  }
});

test("each zone hands over to the next from its 5th depth to the next one's 2nd, eased: its embers from the 6th, its light and features from the 7th, done once the next zone's first question is answered", () => {
  assert.equal(TURN_FROM, 4);
  assert.equal(TURN_DEPTHS, 7);
  for (let k = 1; k <= 40; k++) {
    // Stratum k is announced at its first depth; the scene turns into it from the 5th depth of the one before to its own 2nd,
    // the depth its first question (asked at its first) takes you to.
    const first = 10 * k + 1;
    const from = first - 10 + TURN_FROM;
    const to = from + TURN_DEPTHS;
    assert.equal(to, first + 1);
    assert.equal(settledAt(k), to);
    const turn = (d: number) => strataAt(d).turn;
    for (let d = from; d < to; d += 0.25) assert.equal(strataAt(d).stratum, k, `turning into ${k} at ${d}`);
    assert.equal(turn(from), 0);
    // Then stratum k alone, from its 2nd depth to its 5th, where its own turn begins: the turn into k + 1 not yet begun.
    for (let d = to; d <= first + TURN_FROM; d += 0.25) assert.deepEqual(strataAt(d), { stratum: k + 1, turn: 0 }, `settled at ${d}`);
    assert.ok(turn(first + TURN_FROM + 0.25) > 0);
    // The embers: none yet at the 5th depth, one in twenty at the 6th, two in five at the 8th, half by the 9th (three in five at it),
    // nineteen in twenty as the next zone is announced.
    const embers = (d: number) => emberTurn(turn(d));
    assert.equal(embers(from), 0);
    assert.ok(Math.abs(embers(first - 5) - 0.05) < 0.01, `one in twenty of the embers at ${first - 5}: ${embers(first - 5)}`);
    assert.ok(Math.abs(embers(first - 3) - 0.4) < 0.01, `two in five at ${first - 3}: ${embers(first - 3)}`);
    assert.ok(Math.abs(embers(first - 2.5) - 0.5) < 1e-9, `half at ${first - 2.5}`);
    assert.ok(Math.abs(embers(first - 2) - 0.6) < 0.01, `three in five at ${first - 2}: ${embers(first - 2)}`);
    assert.ok(Math.abs(embers(first) - 0.95) < 0.01, `nineteen in twenty at ${first}: ${embers(first)}`);
    // The light, smoke and features: nothing yet at the 5th and 6th depths, barely at the 7th, half way at the 9th,
    // nine tenths as the next is announced, there at its 2nd.
    const hall = (d: number) => hallTurn(turn(d));
    for (let d = from; d <= first - 5; d += 0.25) assert.equal(hall(d), 0, `the hall still its own at ${d}`);
    assert.ok(hall(first - 4) > 0 && hall(first - 4) < 0.1, `barely creeping in at ${first - 4}: ${hall(first - 4)}`);
    assert.ok(Math.abs(hall(first - 2) - 0.5) < 1e-9, `half way at ${first - 2}: ${hall(first - 2)}`);
    assert.ok(hall(first) > 0.9 && hall(first) < 0.95, `nine tenths at ${first}: ${hall(first)}`);
    assert.deepEqual(descent(to).look.env, lookOf(k).env, `all there at ${to}`);
    assert.deepEqual(descent(to).look.ember, lookOf(k).ember);
    assert.deepEqual(descent(first + TURN_FROM).look.env, lookOf(k).env, `still all there at ${first + TURN_FROM}`);
    // Announced at its first depth, the scene turning into it and nearly there.
    assert.equal(milestoneAt(first), stratumName(k));
    assert.equal(strataAt(first).stratum, k);
  }
  // Eased, not a straight ramp: slow to start, fastest half way, slow to settle, never a jump or a step back.
  for (const [curve, start] of [
    [hallTurn, HALL_FROM],
    [emberTurn, 0],
  ] as const) {
    const span = 40;
    const dt = (1 - start) / span;
    const steps: number[] = [];
    for (let i = 0; i < span; i++) steps.push(curve(start + (i + 1) * dt) - curve(start + i * dt));
    const even = 1 / span;
    assert.ok(steps.every((v) => v >= 0), 'never back');
    assert.ok(Math.max(...steps) <= 1.5 * even + 1e-9, 'never faster than half as fast again as a straight ramp');
    assert.ok(steps[0] < 0.15 * even && steps[span - 1] < 0.15 * even, 'slow at either end');
    assert.ok(steps[Math.floor(span / 2)] > 1.4 * even, 'fastest half way');
    for (let i = 1; i < span / 2; i++) assert.ok(steps[i] > steps[i - 1], 'quickening to half way');
    for (let i = Math.ceil(span / 2); i < span; i++) assert.ok(steps[i] < steps[i - 1] + 1e-12, 'slowing after');
    assert.equal(curve(start), 0);
    assert.equal(curve(1), 1);
  }
  // The hall a depth behind the embers.
  assert.equal(HALL_FROM, 1 / TURN_DEPTHS);
  // The azure stratum's blue embers come in through the depths around its announcement, from five before to the one after.
  assert.equal(BLUE_FROM, DELVE_BLUE_FROM);
  assert.deepEqual(strataAt(BLUE_FROM - 6), { stratum: 2, turn: 0 });
  assert.ok(emberTurn(strataAt(BLUE_FROM - 5).turn) > 0);
  assert.equal(strataAt(BLUE_FROM).stratum, 2);
  assert.ok(emberTurn(strataAt(BLUE_FROM).turn) > 0.9);
  assert.deepEqual(strataAt(BLUE_FROM + 1), { stratum: 3, turn: 0 });
  // The Mines' first depths are the Mines alone.
  for (let d = 1; d <= 5; d += 0.25) assert.deepEqual(strataAt(d), { stratum: 1, turn: 0 });
  assert.equal(settledAt(0), 1);
});

test('one place turns into the next steadily: its features recede as the next ones come, never back and forth', () => {
  for (let k = 1; k <= 30; k++) {
    const a = lookOf(k - 1);
    const b = lookOf(k);
    // (From the 5th depth of stratum k - 1 to the 2nd of k, and on to its 5th.)
    let last = descent(10 * k - 5).look.env;
    for (let d = 10 * k - 4.75; d <= 10 * k + 5; d += 0.25) {
      const env = descent(d).look.env;
      for (let i = 0; i < ENV; i++) {
        if (b.env[i] > a.env[i]) assert.ok(env[i] >= last[i] - 1e-9, `environment ${i} recedes at ${d}`);
        if (b.env[i] < a.env[i]) assert.ok(env[i] <= last[i] + 1e-9, `environment ${i} comes back at ${d}`);
      }
      last = env;
    }
  }
});

test("a magma that goes out cools through its handover, in step with the hall and never behind the frost, and has cooled and gone by the next zone's 2nd depth; the light makes way for it", () => {
  const at = (d: number) => {
    const { stratum, turn } = strataAt(d);
    return magmaCooling(stratum, turn);
  };
  // Cooled, it glows no more; it glows less the cooler, as the backdrop draws it (crusting over); the estimate has it so.
  assert.equal(magmaHeat(0), 1);
  assert.equal(magmaHeat(1), 0);
  for (let c = 0.05; c <= 1; c += 0.05) assert.ok(magmaHeat(c) < magmaHeat(c - 0.05), `hotter at ${c.toFixed(2)}`);
  // Whichever zones the file gives a magma that goes out (the one it hands over to has none).
  const out = STRATA.flatMap((_, k) => (magmaGoesOut(k) ? [k] : []));
  for (let d = 0; d <= 10 * STRATA.length; d += 0.25) {
    const { stratum } = strataAt(d);
    if (!out.includes(stratum - 1)) assert.equal(at(d), 0, `cooling at ${d}`);
  }
  for (const z of out) {
    const first = 10 * z + 1;
    // Hot through its first six depths; from the 6th cooling slowly, then
    // faster, then slowly again, never back, never by a jump (at its
    // steepest the hall, over six depths, turns 1.5 / 6 of the way a depth,
    // a sixteenth a quarter depth); nine tenths cooled as the next zone is
    // announced, cooled and gone at its 2nd depth, and so through it.
    for (let d = first; d <= first + 5; d += 0.25) assert.equal(at(d), 0, `cooling at ${d}`);
    let last = 0;
    for (let d = first + 5.25; d < first + 11; d += 0.25) {
      assert.ok(at(d) > last && at(d) - last < 0.075, `cooling at ${d}: ${at(d)} after ${last}`);
      last = at(d);
    }
    assert.ok(at(first + 6) < 0.08 && at(first + 10) > 0.92, 'slow at either end');
    assert.ok(at(first + 10) > 0.9 && at(first + 10) < 0.95, 'nine tenths cooled as the next zone is announced');
    for (let d = first + 11; d <= first + 20; d += 0.25) {
      const x = strataAt(d);
      assert.equal(magmaCoolingOf(z, x.stratum, x.turn), 1, `cooled at ${d}`);
      assert.equal(descent(d).look.env[ENVIRONMENTS.indexOf('magma')], 0, `and gone at ${d}`);
    }
    // In step with the hall, which brings the next zone's features in: none
    // of them (the frost, say) comes in further than the magma has cooled.
    const a = lookOf(z);
    const b = lookOf(z + 1);
    for (let d = first + 4; d < first + 11; d += 0.25) {
      assert.equal(at(d), hallTurn(strataAt(d).turn), `in step with the hall at ${d}`);
      const env = descent(d).look.env;
      for (let i = 0; i < ENV; i++) if (b.env[i] > 0 && !(a.env[i] > 0)) assert.ok(env[i] <= b.env[i] * at(d) + 1e-9, `${ENVIRONMENTS[i]} ahead of the cooling at ${d}`);
    }
    const x = descent(first + 8);
    const hot = estimateLuminance(x.look, x.close, x.features, 1);
    const cooled = estimateLuminance(x.look, x.close, x.features, magmaHeat(at(first + 8)));
    assert.equal(cooled.hall, hot.hall);
    assert.ok(cooled.rest < hot.rest, 'the cooling magma adds less');
  }
  // Past 100, a stratum whose magma goes out cools it the same way; one whose magma stays doesn't.
  const magma = ENVIRONMENTS.indexOf('magma');
  for (let k = STRATA.length + 1; k < 200; k++) {
    const goes = lookOf(k - 1).env[magma] > 0 && lookOf(k).env[magma] === 0;
    assert.equal(magmaCooling(k, 0.9), goes ? hallTurn(0.9) : 0, `stratum ${k}`);
  }
});

/** The shader's slots as packFx fills them for a scene: per environment showing, its strength, colours (0 to 1) and vary, and the cooling and clock. */
function slotsOf(scene: Parameters<typeof packFx>[2], clock = 42) {
  const fx = new Float32Array(FX_UNIFORM);
  const k = new Float32Array(4);
  packFx(fx, k, scene, clock);
  const map = (i: number) => Math.floor((i < 5 ? k[2] : k[3]) / 16 ** (i < 5 ? i : i - 5)) % 16;
  const slots = new Map<number, { e: number; stops: number[][]; vary: number; slot: number }>();
  for (let s = 0; s < FX_SLOTS; s++) {
    const o = s * 12;
    if (fx[o + 3] <= 0) {
      for (let j = o; j < FX_UNIFORM; j++) assert.equal(fx[j], 0, 'the slots after the last empty');
      break;
    }
    const id = fx[o + 11];
    assert.equal(map(id), s, `environment ${id} found in its slot`);
    slots.set(id, { e: fx[o + 3], stops: [0, 4, 8].map((j) => Array.from(fx.slice(o + j, o + j + 3))), vary: fx[o + 7], slot: s });
  }
  for (let i = 0; i < ENV; i++) if (!slots.has(i)) assert.equal(map(i), NO_SLOT);
  return { slots, cool: k[0], clock: k[1] };
}

test("the shader gets the environments showing, a slot each with its strength and colours, and the magma's cooling and clock", () => {
  const shader = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'backdrop.ts'), 'utf8');
  const effects = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'shaders', 'effects.ts'), 'utf8');
  assert.match(shader, /uniform vec4 uFx\[\$\{FX_SLOTS \* 3\}\];\s*uniform vec4 uFxK;/);
  // (Its strengths scaled only while Delve's parts come in after the lean programs stood in for them: see delveIn there.)
  assert.match(shader, /packFx\(fx, fxK, scene, still \? 0 : magmaClock\);\s*if \(k < 1\) for \(let i = 0; i < FX_SLOTS; i\+\+\) fx\[i \* 12 \+ 3\] \*= k;\s*gl!\.uniform4fv\(uFx, fx\);/, 'the backdrop sends packFx as it is');
  assert.match(effects, /float cool = uFxK\.x;\s*float ft = uFxK\.y;/, 'the magma reads its cooling and clock');
  // Every environment has its effect in the shader, called from its slot.
  for (const name of ENVIRONMENTS) assert.ok(new RegExp(`(env|fx)_${name}\\(`).test(effects + readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'shaders', 'newEffects.ts'), 'utf8')), name);
  // At every depth: each environment showing in a slot of its own, in their order, its strength and colours as the look has them.
  for (let d = 0; d <= 400; d += 0.5) {
    const x = descent(d);
    const { slots, cool, clock } = slotsOf(x);
    assert.equal(clock, 42);
    assert.ok(Math.abs(cool - magmaCooling(x.stratum, x.turn)) < 1e-6, `cooling at ${d}`);
    const showing = x.look.env.flatMap((v, i) => (v >= 0.002 ? [i] : []));
    assert.ok(slots.size === Math.min(FX_SLOTS, showing.length), `slots at ${d}`);
    let prev = -1;
    for (const [i, s] of slots) {
      assert.ok(s.slot > prev || prev < 0, `in order at ${d}`);
      prev = s.slot;
      assert.ok(Math.abs(s.e - x.look.env[i]) < 1e-6);
      const want = stopsOf(toneOf(x.look, i));
      s.stops.forEach((c, j) => c.forEach((v, ch) => assert.ok(Math.abs(v - want[j][ch] / 255) < 1e-5, `colour of ${ENVIRONMENTS[i]} at ${d}`)));
      assert.ok(Math.abs(s.vary - toneOf(x.look, i).vary) < 1e-6);
    }
  }
  // More showing than there are slots: the strongest, in their order.
  const crowded = { ...descent(1), look: { ...descent(1).look, env: ENVIRONMENTS.map((_, i) => 0.1 + 0.05 * ((i * 7) % 10)) } };
  const { slots } = slotsOf(crowded);
  assert.equal(slots.size, FX_SLOTS);
  const kept = [...slots.keys()];
  const weakest = Math.min(...kept.map((i) => crowded.look.env[i]));
  assert.ok(crowded.look.env.every((v, i) => kept.includes(i) || v <= weakest), 'the faintest left out');
  assert.deepEqual(kept, [...kept].sort((a, b) => a - b));
});

test('through a handover an environment both zones draw turns from the one\'s colours to the other\'s; one only one draws keeps its own', () => {
  const draft = cloneData(SHIPPED);
  const a = draft.zones[4].look;
  const b = draft.zones[5].look;
  a.env = ENVIRONMENTS.map((_, i) => (i === 1 || i === 5 ? 0.6 : 0));
  b.env = ENVIRONMENTS.map((_, i) => (i === 5 || i === 9 ? 0.6 : 0));
  a.tones = { magma: { colors: [[250, 220, 160], [240, 90, 20]], vary: 0.2 }, void: { colors: [[200, 200, 255], [40, 40, 220], [10, 10, 90]], vary: 0.2 } };
  b.tones = { void: { colors: [[255, 200, 200], [220, 40, 40], [90, 10, 10]], vary: 0.8 }, heat: { colors: [[255, 255, 255], [255, 120, 40], [120, 20, 10]], vary: 0.4 } };
  draft.zones[4].measured = draft.zones[5].measured = false;
  setBackdrops(draft);
  try {
    // (Their handover runs from depth 45 to 52.)
    let prevVoid = toneOf(descent(45).look, 5).colors[1][0];
    for (let d = 45; d <= 52; d += 0.25) {
      const look = descent(d).look;
      // The magma keeps its own colours as it goes, the fire its own as it comes (two stops: the middle half way).
      if (look.env[1] > 0) assert.deepEqual(toneOf(look, 1).colors, stopsOf(a.tones.magma!), `magma at ${d}`);
      if (look.env[9] > 0) assert.deepEqual(toneOf(look, 9).colors, b.tones.heat!.colors, `fire at ${d}`);
      // The void turns from blue to red steadily, never back.
      const v = toneOf(look, 5).colors[1][0];
      assert.ok(v >= prevVoid - 1e-9, `the void turns back at ${d}`);
      prevVoid = v;
    }
    assert.deepEqual(toneOf(descent(45).look, 5), a.tones.void);
    assert.deepEqual(toneOf(descent(52).look, 5), b.tones.void);
    for (let d = 0; d <= 120; d += 0.25) assert.deepEqual(lookErrors({ ...descent(d).look, lightK: 1 }).filter((e) => e.includes('tones')), [], `tones at ${d}`);
  } finally {
    setBackdrops(SHIPPED);
  }
});

test("a colour range counts for the brightness as bright as it is: darker colours add less, brighter more", () => {
  const look = { ...lookOf(1) };
  const own = estimateLuminance(look, 0.2, 0.9, 1);
  const tone = ENV_TONES.magma.tone;
  const darker = estimateLuminance({ ...look, tones: { magma: { ...tone, colors: tone.colors.map((c) => c.map((v) => v * 0.5)) as typeof tone.colors } } }, 0.2, 0.9, 1);
  const brighter = estimateLuminance({ ...look, tones: { magma: { ...tone, colors: tone.colors.map((c) => c.map((v) => Math.min(255, v * 1.5))) as typeof tone.colors } } }, 0.2, 0.9, 1);
  if (look.env[1] > 0) {
    assert.ok(darker.rest < own.rest && brighter.rest > own.rest);
  }
  // A look in its environments' own colours counts as the tables were measured.
  const plain = { ...look, tones: {} };
  assert.deepEqual(estimateLuminance(plain, 0.2, 0.9, 1), estimateLuminance({ ...look, tones: Object.fromEntries(ENVIRONMENTS.map((n) => [n, ENV_TONES[n].tone])) }, 0.2, 0.9, 1));
});

test("each environment's features come in steadily: what they add to the brightness grows with every step, never mostly at the end", () => {
  assert.equal(ENV_ADD.length, ENV);
  assert.equal(ENV_HALL.length, ENV);
  for (let i = 0; i < ENV; i++) {
    const add = ENV_ADD[i];
    const hall = ENV_HALL[i];
    assert.equal(add.length, ENV_STEPS.length);
    assert.equal(add[0], 0);
    assert.equal(hall[0], 1);
    const total = add[add.length - 1];
    for (let k = 1; k < add.length; k++) {
      assert.ok(add[k] >= add[k - 1], `${ENVIRONMENTS[i]} dims as it comes in, at ${ENV_STEPS[k]}`);
      // No quarter of the way brings in more than about half of it (a fire
      // flaring up a depth before its stratum, as it did, brought in 80%).
      assert.ok(add[k] - add[k - 1] <= 0.5 * total + 1e-4, `${ENVIRONMENTS[i]} comes in all at once at ${ENV_STEPS[k]}`);
      assert.ok(Math.abs(hall[k] - hall[k - 1]) < 0.12, `${ENVIRONMENTS[i]} changes the hall all at once at ${ENV_STEPS[k]}`);
    }
  }
});

/** How hot the magma glows in a scene (1, but as it cools: see magmaCooling). */
const heat = (x: { stratum: number; turn: number }) => magmaHeat(magmaCooling(x.stratum, x.turn));

test("the deeper, the darker: through the zones the scene's average brightness never rises; past them it may, gently", () => {
  /**
   * The average brightness drawn (light scales the hall, not its features or
   * embers; MEASURED says how the frames drawn come out against the
   * estimate). The light is eased so it never swings, so this comes apart
   * from luminanceAt wherever the strata would have it change faster.
   */
  const lum = (d: number) => {
    const x = descent(d);
    const e = estimateLuminance(x.look, x.close, x.features, heat(x));
    const [hall, rest] = measuredAt(d);
    return e.hall * hall * x.light + e.rest * rest;
  };
  // (Measured to where the last zone settles; see the test below.)
  assert.equal(MEASURED.length, settledAt(STRATA.length - 1), 'measured from the frames, to where the last zone settles');
  // Through the zones the descent only ever darkens. From the endgame's
  // arrival on (its look creeps in from the last zone's 7th depth, the
  // embers a depth before) the scene may grow brighter and more colourful,
  // to lift the excitement, but never by a jump.
  assert.equal(ZONES_DARKEN_TO, 10 * STRATA.length - 3);
  const rise = brighterAt;
  assert.equal(rise(ZONES_DARKEN_TO), 1.008);
  assert.equal(rise(ZONES_DARKEN_TO + 1), 1.08);
  // Depth by depth (held still, the scene shows only whole depths).
  let prev = lum(1);
  for (let d = 2; d <= 600; d++) {
    const now = lum(d);
    // (Where a stratum's features come in faster than the light may ease
    // down, a trace brighter: under 1%, where a frame drawn varies by more.)
    assert.ok(now <= prev * rise(d), `brighter at ${d}: ${now.toFixed(5)} after ${prev.toFixed(5)}`);
    prev = now;
  }
  // And while a depth eases in, never more than a trace brighter than the depth it left.
  for (let d = 1.25; d <= 600; d += 0.25) {
    if (d % 1 === 0) continue;
    const before = lum(Math.floor(d));
    assert.ok(lum(d) <= before * rise(Math.ceil(d)), `brighter at ${d}: ${lum(d).toFixed(5)} after ${before.toFixed(5)}`);
  }
  for (const d of [1e4 + 0.5, 1e6 + 3]) assert.ok(lum(d) <= lum(600) * 1.008, `brighter at ${d}`);
  // Never far from the curve it keeps to, and never brighter than it by much.
  for (let d = 1; d <= 600; d += 0.5) {
    const r = lum(d) / luminanceAt(d);
    assert.ok(r > 0.85 && r < 1.02, `${(100 * r).toFixed(1)}% of the curve at ${d}`);
  }
  // The hall is never drawn far from its own light to manage it, nor held at the ends of its range.
  for (let d = 1; d <= 600; d += 0.5) {
    const { light } = descent(d);
    assert.ok(light > LIGHT_MIN * 1.05 && light < LIGHT_MAX / 1.05, `light ${light.toFixed(2)} at ${d}`);
  }
  assert.ok(lum(100) < 0.75 * lum(1) && lum(300) < 0.66 * lum(1));
  // (The start page's hall, like the Mines', comes out about 5% over the estimate.)
  const surface = estimateLuminance(SURFACE, 0);
  assert.ok(lum(1) <= 1.05 * (surface.hall + surface.rest), 'the first depth no brighter than the start page');
});

test("whatever the endgame's seed, the zones only darken and the endgame's strata brighten the scene by 8% a depth at most, its own light (lightK) and all", () => {
  // The endgame's first stratum may be lit far brighter than the last zone
  // (its lightK two or three times the Primeval Ruins'): the light makes way
  // for it as it comes in, so what is drawn never jumps (as it did, by 10%
  // from depth 100 to 101 for some seeds).
  const lum = (d: number) => {
    const x = descent(d);
    const e = estimateLuminance(x.look, x.close, x.features, heat(x));
    const [hall, rest] = measuredAt(d);
    return e.hall * hall * x.light + e.rest * rest;
  };
  try {
    for (const seed of [0, 3, 7, 10, 22, 25, 29, 34]) {
      setBackdrops({ zones: SHIPPED.zones, endgame: { ...SHIPPED.endgame, seed } });
      let prev = lum(1);
      let before = descent(1);
      for (let d = 2; d <= 260; d++) {
        const now = lum(d);
        assert.ok(now <= prev * brighterAt(d), `seed ${seed}: brighter at ${d}: ${now.toFixed(5)} after ${prev.toFixed(5)}`);
        // (And while it eases in.)
        for (const f of [0.25, 0.5, 0.75]) assert.ok(lum(d - 1 + f) <= prev * brighterAt(d), `seed ${seed}: brighter at ${d - 1 + f}`);
        const r = now / luminanceAt(d);
        assert.ok(r > 0.85 && r < 1.02, `seed ${seed}: ${(100 * r).toFixed(1)}% of the curve at ${d}`);
        const x = descent(d);
        assert.ok(lightSwing(before, x) <= LIGHT_STEP + 1e-9, `seed ${seed}: the light swings at ${d}`);
        assert.ok(x.light > LIGHT_MIN * 1.05 && x.light < LIGHT_MAX / 1.05, `seed ${seed}: light ${x.light.toFixed(2)} at ${d}`);
        before = x;
        prev = now;
      }
    }
  } finally {
    setBackdrops(SHIPPED);
  }
});

test("the measured corrections, with the zones' looks as measured, hold at every depth to where the last zone settles, and its own until the endgame's turn begins", () => {
  const last = settledAt(STRATA.length - 1);
  const draft = cloneData(SHIPPED);
  for (const z of draft.zones) z.measured = true;
  setBackdrops(draft);
  try {
    for (let d = 1; d <= last; d++) assert.deepEqual(measuredAt(d), [...MEASURED[d - 1]], `depth ${d}`);
    // (From its 2nd depth to its 5th, the last zone alone.)
    for (let d = last; d <= last + 3; d += 0.5) assert.deepEqual(measuredAt(d), [...MEASURED[last - 1]], `the last zone's own at ${d}`);
    assert.notDeepEqual(measuredAt(last + 6), [...MEASURED[last - 1]], 'the endgame coming in');
  } finally {
    setBackdrops(SHIPPED);
  }
});

test("what the features add, which the light can't take back, changes a little with every depth", () => {
  // Through a stratum the next one's features come in and its own go: what
  // they add to the brightness (measured, ENV_ADD) never jumps from one
  // depth to the next, so the light has the room to make way for it.
  let prev = 0;
  for (let d = 1; d <= 400; d++) {
    const x = descent(d);
    const rest = estimateLuminance(x.look, x.close, x.features, heat(x)).rest * measuredAt(d)[1];
    // (Coming in, the light must make way for them, so they come in gently;
    // going out, they only leave the scene a little darker for a while. The
    // hall turns over six depths, so at its steepest they come and go half
    // as fast again as over nine, as they did: by up to 0.11 and 0.17 of the
    // curve a depth where they came to 0.077 and 0.12.)
    const step = rest - prev;
    if (d > 1) assert.ok(step < 0.12 * luminanceAt(d) && -step < 0.225 * luminanceAt(d), `the features jump by ${step.toFixed(4)} at ${d}`);
    prev = rest;
  }
  // And they burn a little less the deeper.
  for (let d = 1; d < 400; d++) assert.ok(featuresAt(d + 1) <= featuresAt(d));
  assert.equal(lightAt(0.5), 1);
});

test('every zone draws its environments as the file has them, in colours of their own; past 100 at most two, quietly, never like the one before', () => {
  assert.equal(SURFACE.env.length, ENV);
  assert.ok(SURFACE.env.every((v) => v === 0));
  STRATA.forEach((s) => {
    assert.equal(s.look.env.length, ENV, s.name);
    assert.ok(s.look.env.every((v) => v >= 0 && v <= 1), s.name);
    assert.deepEqual(lookErrors(s.look), [], s.name);
  });
  const mist = ENVIRONMENTS.indexOf('mist');
  let prev = lookOf(STRATA.length - 1);
  for (let k = STRATA.length; k < 400; k++) {
    const look = lookOf(k);
    const env = look.env;
    assert.equal(env.length, ENV);
    assert.ok(env.every((v) => v >= 0 && v <= 0.65), `stratum ${k}: ${env}`);
    assert.ok(env.filter((v) => v > 0).length <= 2, `at most two details in stratum ${k}`);
    // Each in colours of its own, picked within its kind's range.
    for (let i = 0; i < ENV; i++) if (env[i] > 0) assert.ok(look.tones[ENVIRONMENTS[i]], `stratum ${k}: colours for ${ENVIRONMENTS[i]}`);
    assert.deepEqual(lookErrors(look), [], `stratum ${k}`);
    // (The petrified mist brings stone trunks in from 0.45: never past the zones.)
    assert.ok(env[mist] < 0.45, `trunks in stratum ${k}`);
    assert.ok(difference(prev, look) > 0.5, `stratum ${k} like the one before`);
    assert.equal(lookOf(k), lookOf(k), 'made once');
    prev = look;
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

test('the dark closes in a little with every depth, and never opens out again', () => {
  let prev = 0;
  for (let d = 0; d <= 1000; d += 0.25) {
    const c = descent(d).close;
    assert.ok(c >= 0 && c <= 1, `${c} at ${d}`);
    assert.ok(c >= prev, `opens out at ${d}`);
    prev = c;
  }
  assert.ok(descent(61).close > descent(11).close + 0.1);
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
  const past100: string[] = [];
  for (let d = 11; d <= 3001; d++) {
    const name = milestoneAt(d);
    if (d % 10 !== 1) {
      assert.equal(name, null, `depth ${d}`);
      continue;
    }
    // Through 100 the zones' biomes; past it each generated stratum's own name, never a zone's.
    assert.ok(name, `depth ${d}`);
    assert.equal(biomes.has(name), d <= 100, `depth ${d}: ${name}`);
    assert.notEqual(name, last, `${name} twice in a row at ${d}`);
    if (d > 100) past100.push(name);
    last = name;
  }
  assert.equal(new Set(past100.slice(0, 50)).size, 50, 'no name twice in the first fifty past 100');
  assert.ok(!milestoneAt(1e6 + 1)?.includes('undefined'));
  assert.equal(milestoneAt(Number.NaN), null);
  // The card's name matches the stratum the scene is turning into there, most of the way.
  assert.equal(stratumName(strataAt(21).stratum), milestoneAt(21));
  assert.ok(hallTurn(strataAt(21).turn) > 0.9);
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

test('a rejoin deep down never stalls a frame: its light is worked out a little a frame, the old scene shown meanwhile, then it fades in with the same light as ever', () => {
  // (The light table worked out afresh.)
  setBackdrops(SHIPPED);
  setDescent(0);
  snapDescent();
  setDescent(3);
  snapDescent();
  const before = { ...currentDescent() };
  // What only reads the rest (the ambience: how deep, the abyss) doesn't wait on the light.
  const far = descent(1900);
  assert.ok(Object.getOwnPropertyDescriptor(far, 'light')?.get, 'its light worked out only when read');
  assert.ok(far.deep > 0.99 && far.abyss === 1);
  setDescent(1900);
  let waited = 0;
  let longest = 0;
  while (true) {
    const t = performance.now();
    stepDescent(1 / 60);
    const x = currentDescent();
    longest = Math.max(longest, performance.now() - t);
    if (x.stratum !== before.stratum) break;
    // Meanwhile the scene as it was.
    assert.equal(x.light, before.light);
    assert.equal(x.look.dark, before.look.dark);
    waited++;
    assert.ok(waited < 600, 'it never arrives');
  }
  assert.ok(waited > 3, `worked out over ${waited} frames`);
  // (A frame's piece is a few milliseconds; far under what the whole took, a few hundred on a phone.)
  assert.ok(longest < 60, `a frame took ${longest.toFixed(1)} ms`);
  while (stepDescent(1 / 60));
  const lightThere = currentDescent().light;
  setBackdrops(SHIPPED);
  assert.equal(lightThere, lightAt(1900), 'the same light as worked out at once');
  assert.equal(far.light, lightAt(1900));
  setDescent(0);
  snapDescent();
});

test("a cooling magma left behind by a cross-fade stays as cooled as it was, never flaring up again as it fades", () => {
  const fx = new Float32Array(FX_UNIFORM);
  const k = new Float32Array(4);
  const magma = ENVIRONMENTS.indexOf('magma');
  for (const [a, b] of [
    [19, 0],
    [20, 64],
    [0, 19],
    [64, 19],
  ]) {
    setDescent(a);
    snapDescent();
    const was = currentDescent().cool;
    const will = descent(b).cool;
    assert.equal(was, descent(a).cool);
    setDescent(b);
    let last = descent(a).look.env[magma] > 0 ? was : NaN;
    while (stepDescent(1 / 60)) {
      const x = currentDescent();
      packFx(fx, k, x, 0);
      assert.equal(k[0], Math.fround(x.cool), 'the shader gets the scene\'s cooling');
      // (No magma showing, its cooling shows nowhere.)
      if (!(x.look.env[magma] > 0)) continue;
      // Only the scenes' own coolings, eased from the one to the other as their magma fades.
      assert.ok(x.cool >= Math.min(was, will) - 1e-9 && x.cool <= Math.max(was, will) + 1e-9, `${a} to ${b}: cooling ${x.cool}`);
      if (!(descent(b).look.env[magma] > 0)) assert.ok(Math.abs(x.cool - was) < 1e-9, `${a} to ${b}: the magma fading out keeps its cooling`);
      if (!(descent(a).look.env[magma] > 0)) assert.ok(Math.abs(x.cool - will) < 1e-9, `${a} to ${b}: the magma fading in has its own`);
      assert.ok(!(Math.abs(x.cool - last) >= 0.05), `${a} to ${b}: the cooling jumps`);
      last = x.cool;
    }
    assert.ok(Math.abs(currentDescent().cool - will) < 1e-9);
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
  // The Magma Fissure, settled.
  e.descend(descent(settledAt(1)));
  e.recolor();
  for (let i = 0; i < 5; i++) e.step(0.05, 1200, 800);
  const blue = () => slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR && close(halo(e, entry), STRATA[2].look.ember)).length;
  assert.equal(blue(), 0, `no blue at depth ${settledAt(1)}`);
  // Heading for depth 18.5, half way into the azure stratum's embers.
  const aim = descent(18.5);
  const share = emberTurn(aim.turn);
  assert.equal(share, 0.5);
  e.descend(descent(settledAt(1)), aim);
  e.step(0.05, 1200, 800);
  assert.ok(blue() < 5, 'the colour should not flip at once');
  e.recolor();
  e.step(0.01, 1200, 800);
  const embers = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR).length;
  assert.ok(blue() / embers > share - 0.25 && blue() / embers < share + 0.25, `about ${share.toFixed(2)} blue after recolor: ${blue()}/${embers}`);
});

test('glints show as a look has them: in the side walls, or all over; fewer on a phone; none without', () => {
  const e = new Embers();
  const at = (glints: number, spread: number) => ({ ...descent(0), look: { ...lookOf(0), glints, spread } });
  const glints = (w: number) => {
    e.step(0.01, w, 800);
    // A glint takes a slot in every tile its glow reaches: count each once.
    return [...new Map(slots(e).filter(([, , , , entry]) => entry === GLINT_COLOR).map((s) => [`${s[0]}:${s[1]}`, s])).values()];
  };
  e.descend(at(1, 0)); // in the walls
  const walls = glints(1200);
  assert.ok(walls.length >= WALL_GLINTS - 1 && walls.every(([x]) => x < 0.25 * 1200 || x > 0.75 * 1200), `${walls.length} glints in the walls`);
  assert.ok(glints(375).length < walls.length, 'as many on a phone');
  e.descend(at(1, 1)); // stars all over
  const stars = glints(1200);
  assert.ok(stars.length > WALL_GLINTS && stars.some(([x]) => x > 0.3 * 1200 && x < 0.7 * 1200), `${stars.length} stars`);
  assert.ok(stars.length <= GLINTS);
  e.descend(at(0, 0.5)); // none
  assert.equal(glints(1200).length, 0);
});

test('in the frozen stratum the motes drift down instead of rising', () => {
  /** How many embers burning in stratum k move down and up over a moment. */
  const moves = (k: number) => {
    const e = new Embers();
    e.descend({ ...descent(0), look: lookOf(k) }, { stratum: k + 1, turn: 0 });
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
  const rising = moves(1);
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
  e.descend(descent(settledAt(1)), descent(settledAt(1)));
  e.recolor();
  for (let i = 0; i < 200; i++) e.step(0.05, 1200, 800, true);
  assert.equal(e.level, 0, 'not stoked');
  const embers = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR);
  assert.ok(embers.length > 0 && embers.every(([, , , , entry]) => close(halo(e, entry), STRATA[1].look.ember)), 'blood red');
});

test("a moment's tint covers the stratum's colours while it lasts, and gives them back", () => {
  const e = new Embers();
  e.descend(descent(settledAt(2)), descent(settledAt(2)));
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
  // Shown: still the surface. Heading for: the azure stratum, settled.
  const aim = descent(settledAt(2));
  e.descend(descent(0), aim);
  e.recolor();
  e.step(0.01, 1200, 800);
  const blue = () => slots(e).filter(([, , , , k]) => k !== GLINT_COLOR && !close(halo(e, k), STRATA[2].look.ember)).length;
  assert.ok(blue() < 5, 'a recolor goes by where the scene heads');
  for (let i = 0; i < 300; i++) e.step(0.1, 1200, 800);
  assert.equal(blue(), 0, 'some turned back on a new rise');
});

test('a new depth sinks the scene as its cards are dealt: not the first of a run, nor the same depth dealt again', () => {
  assert.equal(dealtDeeper(undefined, { run: 1, depth: 1 }), false, 'the first cards of a run');
  assert.equal(dealtDeeper(undefined, { run: 1, depth: 7 }), false, 'the first seen after a reload');
  assert.equal(dealtDeeper({ run: 1, depth: 1 }, { run: 1, depth: 2 }), true);
  assert.equal(dealtDeeper({ run: 1, depth: 4 }, { run: 1, depth: 4 }), false, 'a question set aside');
  assert.equal(dealtDeeper({ run: 1, depth: 30 }, { run: 2, depth: 1 }), false, 'a new run');
  // A plunge lasts about two seconds and travels further than half a screen.
  assert.ok(PLUNGE_MS >= 1800 && PLUNGE_MS <= 2000 && PLUNGE_SINK >= 0.5);
});

test('the plunge gathers speed quickly and comes to rest slowly', () => {
  const start = sinking.sink;
  plunge();
  const speeds: number[] = [];
  for (let t = 0; t <= PLUNGE_MS + 32; t += 16) {
    stepPlunge(10_000 + t, true);
    speeds.push(sinking.speed);
  }
  const peak = speeds.indexOf(Math.max(...speeds));
  assert.ok(peak * 16 < 0.45 * PLUNGE_MS && peak * 16 > 0.3 * PLUNGE_MS, `fastest at ${peak * 16} ms`);
  assert.ok(Math.abs(sinking.sink - start - PLUNGE_SINK) < 1e-9);
});

test('into a new zone the plunge goes deeper and longer, as smoothly', () => {
  assert.ok(ZONE_PLUNGE_MS > PLUNGE_MS && ZONE_PLUNGE_MS <= 3200 && ZONE_PLUNGE_SINK > PLUNGE_SINK);
  const start = sinking.sink;
  plunge(true);
  let last = start;
  let moving = 0;
  for (let t = 0; t <= ZONE_PLUNGE_MS + 100; t += 16) {
    if (stepPlunge(20_000 + t, true)) moving++;
    assert.ok(sinking.sink >= last - 1e-9 && sinking.sink - last < ZONE_PLUNGE_SINK / 30, `a jump at ${t} ms`);
    last = sinking.sink;
  }
  assert.ok(Math.abs(sinking.sink - start - ZONE_PLUNGE_SINK) < 1e-9, `sank ${sinking.sink - start}`);
  assert.ok(moving * 16 >= ZONE_PLUNGE_MS - 20 && moving * 16 <= ZONE_PLUNGE_MS + 40, `moved for ${moving * 16} ms`);
  // The next depth's plunge is the usual one again.
  plunge();
  for (let t = 0; t <= PLUNGE_MS + 32; t += 16) stepPlunge(30_000 + t, true);
  assert.ok(Math.abs(sinking.sink - start - ZONE_PLUNGE_SINK - PLUNGE_SINK) < 1e-9);
});

test('each new depth sinks the scene a little further, smoothly, and then it holds still; never while holding still', () => {
  const start = sinking.sink;
  assert.equal(stepPlunge(0, true), false, 'nothing to do');
  plunge();
  let last = start;
  let moving = 0;
  for (let t = 0; t <= PLUNGE_MS + 100; t += 16) {
    if (stepPlunge(t, true)) moving++;
    assert.ok(sinking.sink >= last - 1e-9 && sinking.sink - last < PLUNGE_SINK / 30, `a jump at ${t} ms`);
    assert.ok(sinking.breath >= 0 && sinking.breath <= 1);
    last = sinking.sink;
  }
  assert.ok(Math.abs(sinking.sink - start - PLUNGE_SINK) < 1e-9, `sank ${sinking.sink - start}`);
  assert.ok(moving * 16 >= PLUNGE_MS - 20 && moving * 16 <= PLUNGE_MS + 40, `moved for ${moving * 16} ms`);
  assert.equal(sinking.speed, 0);
  assert.equal(stepPlunge(PLUNGE_MS + 200, true), false, 'then it holds still');
  // Holding still (reduced motion, effects off), a pick moves nothing.
  plunge();
  assert.equal(stepPlunge(5000, false), false);
  assert.equal(stepPlunge(5016, true), false);
  assert.ok(Math.abs(sinking.sink - start - PLUNGE_SINK) < 1e-9);
  // A run starting from the surface starts from the top again (so it never wraps round mid-run).
  setDescent(0);
  snapDescent();
  setDescent(1);
  assert.equal(sinking.sink, 0);
  setDescent(0);
  snapDescent();
});
