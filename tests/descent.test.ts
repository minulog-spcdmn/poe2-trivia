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
  plunge,
  sinking,
  stepPlunge,
  estimateLuminance,
  hallTurn,
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

test('the first ten depths already change, a little with every depth', () => {
  assert.ok(difference(descent(1).look, descent(4).look) > 0.08, 'depth 4 looks like depth 1');
  assert.ok(difference(descent(4).look, descent(7).look) > 0.15, 'depth 7 looks like depth 4');
  assert.ok(difference(descent(7).look, descent(12).look) > 0.4, 'depth 12 looks like depth 7');
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
  assert.ok(max < 1.8 * mean, `the largest step ${max.toFixed(3)} is ${(max / mean).toFixed(2)} times the usual ${mean.toFixed(3)}`);
  // Nor does the light the hall is drawn at swing from one depth to the next.
  for (let d = 2; d <= 600; d++) {
    const step = Math.abs(Math.log(descent(d).light / descent(d - 1).light));
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

test("through each stratum the next creeps in: its embers a tenth more each depth, its light and features from the fourth depth on", () => {
  for (let k = 1; k <= 40; k++) {
    const first = 10 * k + 1;
    const turn = (d: number) => strataAt(d).turn;
    // Through stratum k - 1 (depths first - 10 to first - 1) the scene turns into stratum k.
    for (let d = first - 10; d < first; d++) assert.equal(strataAt(d).stratum, k, `turning into ${k} at ${d}`);
    assert.ok(Math.abs(turn(first - 9) - 0.1) < 1e-9, `a tenth of the embers at ${first - 9}`);
    assert.ok(Math.abs(turn(first - 1) - 0.9) < 1e-9, `nine tenths at ${first - 1}`);
    assert.equal(hallTurn(turn(first - 8)), 0, `the hall still its own at ${first - 8}`);
    assert.ok(hallTurn(turn(first - 6)) > 0.05, `the next hall creeping in at ${first - 6}`);
    // At its card it is all there.
    assert.deepEqual(descent(first).look.env, lookOf(k).env, `all there at ${first}`);
    assert.deepEqual(descent(first).look.ember, lookOf(k).ember);
    assert.equal(stratumName(strataAt(first).stratum - 1), stratumName(k));
  }
  // The azure stratum's blue embers come in through the ten depths before it is announced.
  assert.equal(BLUE_FROM, DELVE_BLUE_FROM);
  assert.equal(strataAt(BLUE_FROM - 9).stratum, 2);
  assert.ok(Math.abs(strataAt(BLUE_FROM - 9).turn - 0.1) < 1e-9);
  assert.equal(strataAt(BLUE_FROM).stratum - 1, 2);
});

test('one place turns into the next steadily: its features recede as the next ones come, never back and forth', () => {
  for (let k = 1; k <= 30; k++) {
    const a = lookOf(k - 1);
    const b = lookOf(k);
    let last = descent(10 * k - 9).look.env;
    for (let d = 10 * k - 8.75; d <= 10 * k + 1; d += 0.25) {
      const env = descent(d).look.env;
      for (let i = 0; i < ENV; i++) {
        if (b.env[i] > a.env[i]) assert.ok(env[i] >= last[i] - 1e-9, `environment ${i} recedes at ${d}`);
        if (b.env[i] < a.env[i]) assert.ok(env[i] <= last[i] + 1e-9, `environment ${i} comes back at ${d}`);
      }
      last = env;
    }
  }
});

test("a magma that goes out cools over its zone's last depths, and has cooled as the next arrives; the light makes way for it", () => {
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
    // Hot through its first depths, cooling steadily from its fourth, all but cooled as the next arrives.
    for (let d = first; d <= first + 2.5; d += 0.25) assert.equal(at(d), 0, `cooling at ${d}`);
    let last = 0;
    for (let d = first + 2.75; d < first + 10; d += 0.25) {
      assert.ok(at(d) > last && at(d) - last < 0.05, `cooling at ${d}: ${at(d)} after ${last}`);
      last = at(d);
    }
    assert.ok(last > 0.95, 'all but cooled as the next zone arrives');
    const x = descent(first + 6);
    const hot = estimateLuminance(x.look, x.close, x.features, 1);
    const cooled = estimateLuminance(x.look, x.close, x.features, magmaHeat(at(first + 6)));
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
  assert.match(shader, /gl!\.uniform4fv\(uFx, packFx\(fx, fxK, scene, /, 'the backdrop sends packFx as it is');
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
    let prevVoid = toneOf(descent(41).look, 5).colors[1][0];
    for (let d = 41; d <= 51; d += 0.25) {
      const look = descent(d).look;
      // The magma keeps its own colours as it goes, the fire its own as it comes (two stops: the middle half way).
      if (look.env[1] > 0) assert.deepEqual(toneOf(look, 1).colors, stopsOf(a.tones.magma!), `magma at ${d}`);
      if (look.env[9] > 0) assert.deepEqual(toneOf(look, 9).colors, b.tones.heat!.colors, `fire at ${d}`);
      // The void turns from blue to red steadily, never back.
      const v = toneOf(look, 5).colors[1][0];
      assert.ok(v >= prevVoid - 1e-9, `the void turns back at ${d}`);
      prevVoid = v;
    }
    assert.deepEqual(toneOf(descent(41).look, 5), a.tones.void);
    assert.deepEqual(toneOf(descent(51).look, 5), b.tones.void);
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

test("the deeper, the darker: the scene's average brightness never rises, however bright a stratum", () => {
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
  assert.equal(MEASURED.length, 91, 'measured from the frames, to the last depth whose look is the zones\' alone');
  // Depth by depth (held still, the scene shows only whole depths).
  let prev = lum(1);
  for (let d = 2; d <= 600; d++) {
    const now = lum(d);
    // (Where a stratum's features come in faster than the light may ease
    // down, a trace brighter: under 1%, where a frame drawn varies by more.)
    assert.ok(now <= prev * 1.008, `brighter at ${d}: ${now.toFixed(5)} after ${prev.toFixed(5)}`);
    prev = now;
  }
  // And while a depth eases in, never more than a trace brighter than the depth it left.
  for (let d = 1.25; d <= 600; d += 0.25) {
    if (d % 1 === 0) continue;
    const before = lum(Math.floor(d));
    assert.ok(lum(d) <= before * 1.008, `brighter at ${d}: ${lum(d).toFixed(5)} after ${before.toFixed(5)}`);
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

test("what the features add, which the light can't take back, changes a little with every depth", () => {
  // Through a stratum the next one's features come in and its own go: what
  // they add to the brightness (measured, ENV_ADD) never jumps from one
  // depth to the next, so the light has the room to make way for it.
  let prev = 0;
  for (let d = 1; d <= 400; d++) {
    const x = descent(d);
    const rest = estimateLuminance(x.look, x.close, x.features, heat(x)).rest * measuredAt(d)[1];
    if (d > 1) assert.ok(Math.abs(rest - prev) < 0.08 * luminanceAt(d), `the features jump by ${(rest - prev).toFixed(4)} at ${d}`);
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
  // The card's name matches the stratum the scene has turned into there.
  assert.equal(strataAt(21).stratum - 1, 2);
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
  e.descend(descent(11));
  e.recolor();
  for (let i = 0; i < 5; i++) e.step(0.05, 1200, 800);
  const blue = () => slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR && close(halo(e, entry), STRATA[2].look.ember)).length;
  assert.equal(blue(), 0, 'no blue at depth 11');
  // Heading for depth 16, half way into the azure stratum's embers.
  const aim = descent(16);
  e.descend(descent(11), aim);
  e.step(0.05, 1200, 800);
  assert.ok(blue() < 5, 'the colour should not flip at once');
  e.recolor();
  e.step(0.01, 1200, 800);
  const embers = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR).length;
  assert.ok(blue() / embers > aim.turn - 0.25 && blue() / embers < aim.turn + 0.25, `about ${aim.turn.toFixed(2)} blue after recolor: ${blue()}/${embers}`);
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
  e.descend(descent(11), descent(11));
  e.recolor();
  for (let i = 0; i < 200; i++) e.step(0.05, 1200, 800, true);
  assert.equal(e.level, 0, 'not stoked');
  const embers = slots(e).filter(([, , , , entry]) => entry !== GLINT_COLOR);
  assert.ok(embers.length > 0 && embers.every(([, , , , entry]) => close(halo(e, entry), STRATA[1].look.ember)), 'blood red');
});

test("a moment's tint covers the stratum's colours while it lasts, and gives them back", () => {
  const e = new Embers();
  e.descend(descent(21), descent(21));
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
  // Shown: still the surface. Heading for: the azure stratum.
  const aim = descent(21);
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

test('each new depth sinks the scene a little further, smoothly, and then it holds still; never while holding still', () => {
  const start = sinking.sink;
  assert.equal(stepPlunge(0, true), false, 'nothing to do');
  plunge();
  let last = start;
  let moving = 0;
  for (let t = 0; t <= PLUNGE_MS + 100; t += 16) {
    if (stepPlunge(t, true)) moving++;
    assert.ok(sinking.sink >= last - 1e-9 && sinking.sink - last < 0.02, `a jump at ${t} ms`);
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
