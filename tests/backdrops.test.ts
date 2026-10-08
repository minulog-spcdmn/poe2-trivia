import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { backdropsErrors, cloneData, ENV_TONES, ENVIRONMENTS, formatBackdrops, lookErrors, stopsOf, withTones, type Backdrops, type Look } from '../src/lib/backdropData.ts';
import { DEFAULT_SETTINGS, generate, generateStratum, hsv, hueDistance, hueOf, keepLocked, seedOf, stratumSeed } from '../src/lib/backdropGen.ts';
import { archetypeAt, endgame, endgameAt, SHIPPED, setBackdrops, seedAt, VIVID, zones, zoneSignatures } from '../src/lib/backdrops.ts';
import { brightnessAt, calibrateLight, descent, LIGHT_STEP, lightSwing, lookOf, luminanceAt, measuredAt, MEASURED, settledAt, STRATA, stratumName } from '../src/lib/descent.ts';
import { PROFILE_NAMES, SURFACE_MOTION, ZONE_MOTION } from '../src/lib/emberProfiles.ts';
import { zoneMotionOf } from '../src/lib/emberMotion.ts';

const FILE = join(import.meta.dirname, '..', 'src', 'data', 'backdrops.json');
/**
 * The zone looks and motions as they were hard-coded in lib/descent.ts and
 * lib/emberMotion.ts at 380e372 (the looks MEASURED was measured with), and
 * a hash of descent(d) at every quarter depth from 0 to 91 as it came out
 * then, before the looks moved into src/data/backdrops.json.
 */
const SHIPPED_380E372 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'shipped-backdrops.json'), 'utf8')) as {
  looks: Look[];
  motions: unknown[];
  hashes: Record<string, string>;
};
// (Their environments were drawn in their own colours then: the colours they take as tones now.)
withTones({ zones: SHIPPED_380E372.looks.map((look) => ({ look })) });
const names = SHIPPED.zones.map((z) => z.name);
const hash = (d: number) => createHash('sha256').update(JSON.stringify(descent(d))).digest('hex').slice(0, 16);
const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('backdrops.json is whole and well formed, as the tool writes it', () => {
  const text = readFileSync(FILE, 'utf8');
  const data = JSON.parse(text) as Backdrops;
  assert.deepEqual(backdropsErrors(data, names, PROFILE_NAMES), []);
  assert.equal(formatBackdrops(data), text, 'formatted as formatBackdrops writes it (so a save changes only what changed)');
  assert.deepEqual(names, ['The Mines', 'Magma Fissure', 'Frozen Hollow', 'Fungal Caverns', 'Vaal Outpost', 'Abyssal Depths', 'Petrified Forest', 'Sulphur Vents', 'Abyssal City', 'Primeval Ruins']);
});

test('a zone the corrections were measured with has exactly the look it had hard-coded (380e372); the descent reads them from the file', () => {
  assert.equal(SHIPPED_380E372.looks.length, zones.length);
  zones.forEach((z, k) => {
    assert.equal(STRATA[k].look, z.look, 'STRATA reads the file');
    if (z.measured) assert.deepEqual(z.look, SHIPPED_380E372.looks[k], `${z.name} is marked measured, but its look has changed: set measured to false (or, measured again, put its new look in tests/fixtures/shipped-backdrops.json)`);
  });
  // The motion profiles moved into lib/emberProfiles.ts as they were, but
  // for the snow's and the spores', retuned since with the Frozen Hollow
  // and the Fungal Caverns rebuilt: the snow drifts down slower, the spores
  // hang stiller.
  type Z = { main: { name: string; rise: number } };
  const RETUNED = ['snow falling', 'spores hanging'];
  const now = JSON.parse(JSON.stringify([SURFACE_MOTION, ...ZONE_MOTION])) as Z[];
  const was = SHIPPED_380E372.motions as Z[];
  const kept = (list: Z[]) => list.filter((z) => !RETUNED.includes(z.main.name));
  assert.deepEqual(kept(now), kept(was));
  const rise = (list: Z[], name: string) => list.find((z) => z.main.name === name)!.main.rise;
  assert.ok(rise(now, 'snow falling') < 0 && rise(now, 'snow falling') > rise(was, 'snow falling'), 'the snow falls, slower');
  assert.ok(rise(now, 'spores hanging') > 0 && rise(now, 'spores hanging') < rise(was, 'spores hanging'), 'the spores rise, barely');
});

test('while the zones are as shipped, depths 0 to 91 come out exactly as at 380e372: looks, light, everything', (t) => {
  const asShipped = zones.every((z, k) => z.measured && JSON.stringify(z.look) === JSON.stringify(SHIPPED_380E372.looks[k]));
  if (!asShipped) return t.skip('a zone has a new look (saved from the backdrop tool), so its depths look new');
  const changed: number[] = [];
  for (let d = 0; d <= 91; d += 0.25) if (hash(d) !== SHIPPED_380E372.hashes[d]) changed.push(d);
  assert.deepEqual(changed, []);
  // And each zone's embers move as they did.
  zones.forEach((_, k) => assert.deepEqual(zoneMotionOf(k), ZONE_MOTION[k]));
});

test('the generator is pure and seeded: the same seed, the same backdrop; another seed, another', () => {
  for (const seed of [0, 1, 42, 0xffffffff, seedOf('ember')]) {
    assert.deepEqual(generate(seed, DEFAULT_SETTINGS), generate(seed, DEFAULT_SETTINGS));
    assert.notDeepEqual(generate(seed, DEFAULT_SETTINGS).look, generate((seed + 1) >>> 0, DEFAULT_SETTINGS).look);
  }
  assert.equal(seedOf('123'), 123);
  assert.equal(seedOf('ember'), seedOf(' ember '));
  assert.notEqual(stratumSeed(1, 10), stratumSeed(1, 11));
  assert.notEqual(stratumSeed(1, 10), stratumSeed(2, 10));
});

test("what it generates keeps to the start page's style: harmonious, muted, dark, a quiet detail or two", () => {
  const mist = ENVIRONMENTS.indexOf('mist');
  for (let seed = 0; seed < 600; seed++) {
    const settings = seed % 3 ? DEFAULT_SETTINGS : { hue: [180, 260] as [number, number], sat: [0.2, 0.5] as [number, number], darkness: 1, detail: 1, embers: 1 };
    const g = generate(seed, settings);
    const l = g.look;
    assert.deepEqual(lookErrors(l), [], `seed ${seed}`);
    // The smoke's four drifts: neighbouring hues round the base one.
    for (const c of [l.smoke, l.smokeB, l.smokeHi, l.smokeHiB, l.floor]) {
      const { hue, sat } = hueOf(c);
      if (sat > 0.15) assert.ok(hueDistance(hue, g.hue) <= 45, `seed ${seed}: ${c} is ${hueDistance(hue, g.hue).toFixed(0)} degrees off`);
      assert.ok(sat <= 0.93 && Math.max(...c) <= 190, `seed ${seed}: ${c} too bright or saturated`);
    }
    assert.ok(l.dark >= 0.1 && l.dark <= 0.75 && l.floorK <= 0.5, `seed ${seed}`);
    // At most two details, low to moderate, never the petrified trunks.
    const details = l.env.filter((v) => v > 0);
    assert.ok(details.length <= 2 && details.every((v) => v <= 0.65), `seed ${seed}: ${l.env}`);
    assert.ok(l.env[mist] < 0.45, `seed ${seed}: trunks`);
    // The header's colour reads on the dark header.
    assert.ok(luma(l.accent) > 130, `seed ${seed}: accent ${l.accent}`);
    assert.ok(PROFILE_NAMES.includes(g.motion.profile));
  }
  // Fewer details with less detail asked for, none with none.
  const count = (detail: number) => Array.from({ length: 300 }, (_, s) => generate(s, { ...DEFAULT_SETTINGS, detail }).look.env.filter((v) => v > 0).length).reduce((a, b) => a + b, 0);
  assert.equal(count(0), 0);
  assert.ok(count(0.2) < count(0.5) && count(0.5) < count(1));
});

test('as a soft rule, warm palettes rise and cold ones fall', () => {
  const rising = (lo: number, hi: number) => {
    let up = 0;
    for (let s = 0; s < 300; s++) up += generate(s, { ...DEFAULT_SETTINGS, hue: [lo, hi] }).motion.rise > 0 ? 1 : 0;
    return up / 300;
  };
  assert.ok(rising(0, 25) > 0.6, `warm: ${rising(0, 25)}`);
  assert.ok(rising(190, 240) < 0.25, `cold: ${rising(190, 240)}`);
});

test('locked groups stay as they were when the rest is generated again', () => {
  const a = generate(1, DEFAULT_SETTINGS);
  const b = generate(2, DEFAULT_SETTINGS);
  const kept = keepLocked(b, a, new Set(['smoke', 'motion'] as const));
  assert.deepEqual(kept.look.smoke, a.look.smoke);
  assert.deepEqual(kept.look.smokeHiB, a.look.smokeHiB);
  assert.equal(kept.look.smokeK, a.look.smokeK);
  assert.deepEqual(kept.motion, a.motion);
  assert.deepEqual(kept.look.floor, b.look.floor);
  assert.deepEqual(kept.look.env, b.look.env);
});

test('the endgame: every stratum generated from its own seed (or a re-roll of it) as its archetype, the same for everyone, another archetype each time', () => {
  for (let k = STRATA.length; k < 400; k++) {
    const g = endgameAt(k);
    assert.equal(g.seed, (seedAt(k) + g.rolled) >>> 0);
    const steer = { avoid: zoneSignatures(), vivid: VIVID };
    assert.deepEqual(g, { ...generateStratum(g.seed, endgame.settings, archetypeAt(k), steer), rolled: g.rolled }, `stratum ${k}`);
    if (k > STRATA.length) assert.notEqual(g.kind, endgameAt(k - 1).kind, `stratum ${k}: ${g.kind} twice`);
  }
  // Far down too, never out of the ordinary.
  for (const k of [1e3, 1e5 + 7, 1e8 + 3]) {
    assert.deepEqual(lookErrors(lookOf(k)), []);
    assert.notEqual(endgameAt(k).kind, endgameAt(k - 1).kind);
    assert.ok(stratumName(k) && !names.includes(stratumName(k)) && stratumName(k) !== stratumName(k - 1));
  }
});

test("each generated stratum is lit to keep to the scene's brightness where it settles", () => {
  for (let k = STRATA.length; k < 60; k++) {
    const d = settledAt(k);
    assert.equal(lookOf(k).lightK, calibrateLight(endgameAt(k).look, k));
    const light = descent(d).light;
    assert.ok(light > 0.8 && light < 1.25, `stratum ${k}: light ${light.toFixed(3)}`);
    assert.ok(Math.abs(brightnessAt(d) / luminanceAt(d) - 1) < 0.15, `stratum ${k}`);
  }
});

/** Runs `f` with `data` shown in place of the file's (the tool's hook), then puts the file's back. */
function withBackdrops(data: Backdrops, f: () => void) {
  setBackdrops(data);
  try {
    f();
  } finally {
    setBackdrops(SHIPPED);
  }
}

test("the tool's hook shows a draft at once, and the file's again after; the game never calls it", () => {
  const before = [1, 15, 55.5, 91, 140, 230.25].map(hash);
  const kept = measuredAt(11);
  const draft = cloneData(SHIPPED);
  const look = draft.zones[3].look;
  look.smoke = [10, 20, 30];
  look.env = look.env.map(() => 0);
  draft.zones[3].measured = false;
  draft.endgame.pinned['13'] = 777;
  draft.endgame.settings = { ...draft.endgame.settings, hue: [180, 240] };
  withBackdrops(draft, () => {
    assert.deepEqual(lookOf(3).smoke, [10, 20, 30]);
    assert.deepEqual(descent(settledAt(3)).look.smoke, [10, 20, 30]);
    assert.equal(seedAt(12), 777);
    assert.equal(endgameAt(12).seed, 777);
    for (let k = 10; k < 30; k++) assert.ok(hueOf(endgameAt(k).look.smoke).sat < 0.15 || hueDistance(hueOf(endgameAt(k).look.smoke).hue, 210) <= 75, `stratum ${k} out of its range`);
    // The changed zone's measured corrections are dropped: none while it shows alone.
    assert.deepEqual(measuredAt(settledAt(3)), [1, 1]);
    assert.deepEqual(measuredAt(11), kept, 'the zones not changed keep theirs');
    // The light is worked out again, as steadily.
    for (let d = 2; d <= 300; d++) assert.ok(lightSwing(descent(d - 1), descent(d)) <= LIGHT_STEP + 1e-9, `the light swings at ${d}`);
  });
  assert.deepEqual([1, 15, 55.5, 91, 140, 230.25].map(hash), before);
  assert.notEqual(endgameAt(12).seed, 777);
  // Nothing outside the tool calls it.
  const calls: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (/\.(ts|svelte)$/.test(name.name) && /setBackdrops\(/.test(readFileSync(p, 'utf8'))) calls.push(p.slice(p.indexOf('src')));
    }
  };
  walk(join(import.meta.dirname, '..', 'src'));
  assert.deepEqual(calls.filter((p) => !p.startsWith(join('src', 'backdropTool')) && p !== join('src', 'lib', 'backdrops.ts')), []);
});

test('the check turns away what the game could not show', () => {
  const ok = cloneData(SHIPPED);
  assert.deepEqual(backdropsErrors(ok, names, PROFILE_NAMES), []);
  const bad = (f: (d: Backdrops) => void) => {
    const d = cloneData(SHIPPED);
    f(d);
    return backdropsErrors(d, names, PROFILE_NAMES);
  };
  assert.ok(bad((d) => d.zones.pop()).length);
  assert.ok(bad((d) => (d.zones[1].name = 'Somewhere')).length);
  assert.ok(bad((d) => (d.zones[2].look.dark = 0.95)).length);
  assert.ok(bad((d) => ((d.zones[2].look as unknown as Record<string, unknown>).extra = 1)).length);
  assert.ok(bad((d) => (d.zones[2].look.smoke = [1, 2] as unknown as [number, number, number])).length);
  assert.ok(bad((d) => (d.zones[2].look.env = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0])).length);
  assert.ok(bad((d) => (d.zones[4].motion.profile = 'flying sideways')).length);
  assert.ok(bad((d) => (d.endgame.pinned['5'] = 1)).length);
  assert.ok(bad((d) => (d.endgame.seed = -1)).length);
  assert.ok(bad((d) => (d.endgame.settings.sat = [0.9, 0.1])).length);
  assert.ok(bad((d) => ((d.zones[1].look.tones as Record<string, unknown>).lava = { colors: [[1, 2, 3], [4, 5, 6]], vary: 0.2 })).length);
  assert.ok(bad((d) => (d.zones[1].look.tones.magma = { colors: [[1, 2, 3]], vary: 0.2 })).length);
  assert.ok(bad((d) => (d.zones[1].look.tones.magma = { colors: [[1, 2, 3], [4, 5, 300]], vary: 0.2 })).length);
  assert.ok(bad((d) => (d.zones[1].look.tones.magma = { colors: [[1, 2, 3], [4, 5, 6]], vary: 1.5 })).length);
  assert.ok(bad((d) => delete (d.zones[1].look as Partial<Look>).tones).length);
  assert.deepEqual(bad((d) => (d.zones[1].look.tones.frost = { colors: [[255, 255, 255], [20, 40, 200]], vary: 0 })), [], 'two stops will do');
  assert.deepEqual(hsv(0, 1, 1), [1, 0, 0]);
});

test("the generator picks each detail's colours within its kind's range: magma reds and oranges, frost white to blue, a void any hue", () => {
  const hue = (c: readonly number[]) => hueOf(c).hue;
  const voids = new Set<number>();
  for (let seed = 0; seed < 600; seed++) {
    const { look } = generate(seed, { ...DEFAULT_SETTINGS, detail: 1 });
    look.env.forEach((e, i) => {
      if (!(e > 0)) return;
      const name = ENVIRONMENTS[i];
      const tone = look.tones[name];
      assert.ok(tone && tone.colors.length === 3, `seed ${seed}: ${name} has colours`);
      const rule = ENV_TONES[name];
      assert.ok(tone.vary >= rule.vary[0] - 1e-9 && tone.vary <= rule.vary[1] + 1e-9, `seed ${seed}: ${name} varies ${tone.vary}`);
      // Its main stop's hue turned from its own no further than its rule allows.
      const own = stopsOf(rule.tone);
      assert.ok(hueDistance(hue(tone.colors[1]), hue(own[1])) <= Math.max(-rule.turn[0], rule.turn[1]) + 3, `seed ${seed}: ${name} turned too far`);
      // Each stop as light as its own (white heat stays white hot).
      tone.colors.forEach((c, k) => assert.ok(Math.abs(Math.max(...c) - Math.max(...own[k])) <= 1, `seed ${seed}: ${name} stop ${k}`));
      if (name === 'magma' || name === 'heat') for (const c of tone.colors) assert.ok(hueDistance(hue(c), 15) <= 45, `seed ${seed}: ${name} out of the reds and oranges: ${c}`);
      if (name === 'frost') for (const c of tone.colors) assert.ok(hueOf(c).sat < 0.12 || hueDistance(hue(c), 215) <= 35, `seed ${seed}: frost out of white to blue: ${c}`);
      if (name === 'void') voids.add(Math.round(hue(tone.colors[1]) / 30));
    });
  }
  assert.ok(voids.size >= 4, `the void in ${voids.size} hues`);
});
