import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENVIRONMENTS, ENV_TONES, lookErrors, motionErrors, stopsOf, type Look } from '../src/lib/backdropData.ts';
import { ARCHETYPES, composedNames, EFFECT_CEILING, EFFECT_FLOOR, MIST_CEILING, NAME_MOST } from '../src/lib/archetypes.ts';
import { archetypeAt, endgameAt, endgameName, SHIPPED, setBackdrops, signatureAt, SPREAD } from '../src/lib/backdrops.ts';
import { cloneData } from '../src/lib/backdropData.ts';
import { lookOf, STRATA, stratumName } from '../src/lib/descent.ts';
import { PROFILE_NAMES } from '../src/lib/emberProfiles.ts';
import { lchOf } from '../src/lib/likeness.ts';

const FIRST = STRATA.length;
/** Strata 11 to 1010 past the zones: depths 101 to 10100. */
const LAST = FIRST + 1000;
const MIST = ENVIRONMENTS.indexOf('mist');
const ZONE_NAMES = SHIPPED.zones.map((z) => z.name);

test('the archetypes: at least ten, each a coherent recipe within the rules', () => {
  assert.ok(ARCHETYPES.length >= 10);
  assert.equal(new Set(ARCHETYPES.map((a) => a.kind)).size, ARCHETYPES.length);
  for (const a of ARCHETYPES) {
    assert.ok(a.fx[0].env !== a.fx[1].env, a.kind);
    assert.ok(a.fx[0].env !== 'mist', `${a.kind}: the mist is never the effect that must be there`);
    for (const e of a.fx) {
      const most = e.env === 'mist' ? MIST_CEILING : EFFECT_CEILING;
      assert.ok(e.strength[0] >= EFFECT_FLOOR && e.strength[0] <= e.strength[1] && e.strength[1] <= most, `${a.kind}: ${e.env} ${e.strength}`);
    }
    assert.ok(a.variants.length >= 2, `${a.kind}: variations within it`);
    for (const m of a.motion) assert.ok(PROFILE_NAMES.includes(m), `${a.kind}: ${m}`);
    assert.ok(ZONE_NAMES.includes(a.emblem), `${a.kind}: ${a.emblem}`);
  }
  // Effect sets of their own: no two archetypes draw the same pair.
  const pairs = ARCHETYPES.map((a) => [a.fx[0].env, a.fx[1].env].sort().join('+'));
  assert.equal(new Set(pairs).size, pairs.length);
  // Every effect the endgame can draw but the city's lamps comes up as one archetype's first.
  const firsts = new Set(ARCHETYPES.map((a) => a.fx[0].env));
  for (const name of ENVIRONMENTS) if (name !== 'lamps' && name !== 'mist') assert.ok(firsts.has(name), name);
});

test(`every stratum past the zones, ${FIRST + 1} to ${LAST}, features one or two effects, clearly there but quiet`, () => {
  let pairs = 0;
  for (let k = FIRST; k < LAST; k++) {
    const env = endgameAt(k).look.env;
    const on = env.flatMap((e, i) => (e > 0 ? [i] : []));
    assert.ok(on.length >= 1 && on.length <= 2, `stratum ${k + 1}: ${on.length} effects`);
    for (const i of on) {
      assert.ok(env[i] >= EFFECT_FLOOR, `stratum ${k + 1}: ${ENVIRONMENTS[i]} at ${env[i]}, under the floor`);
      assert.ok(env[i] <= (i === MIST ? MIST_CEILING : EFFECT_CEILING), `stratum ${k + 1}: ${ENVIRONMENTS[i]} at ${env[i]}, over the ceiling`);
    }
    // Never only a barely-there mist.
    assert.ok(on.some((i) => i !== MIST), `stratum ${k + 1}: only mist`);
    if (on.length === 2) pairs++;
  }
  assert.ok(pairs > 0.7 * (LAST - FIRST), `${pairs} of ${LAST - FIRST} with two effects`);
});

/** The hues (OKLCh, degrees) a look shows in colour: its smoke, light, haze, glow and its effects' main colours, each coloured enough to read as a hue. */
function huesOf(look: Look): number[] {
  const cs: number[][] = [look.smoke, look.smokeB, look.smokeHi, look.smokeHiB, look.floor, look.haze, look.glow];
  look.env.forEach((e, i) => {
    if (!(e > 0)) return;
    const name = ENVIRONMENTS[i];
    const w = ENV_TONES[name].weight;
    cs.push(stopsOf(look.tones[name]!)[w.indexOf(Math.max(...w))]);
  });
  return cs.map((c) => lchOf(c)).filter((c) => c[1] >= 0.04).map((c) => ((c[2] * 180) / Math.PI + 360) % 360);
}
const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test('every palette spans more than one hue family: an accent at least 60 degrees from the base, not one shade', (t) => {
  let total = 0;
  for (let k = FIRST; k < LAST; k++) {
    const look = endgameAt(k).look;
    const hues = huesOf(look);
    const base = ((lchOf(look.smoke)[2] * 180) / Math.PI + 360) % 360;
    const far = Math.max(...hues.map((h) => apart(h, base)));
    assert.ok(far >= 60, `stratum ${k + 1}: its colours keep within ${far.toFixed(0)} degrees of its smoke`);
    total += far;
  }
  t.diagnostic(`the furthest accent from the smoke's hue: ${(total / (LAST - FIRST)).toFixed(0)} degrees on average`);
});

test('the archetypes are dealt out: never the same twice in a row, nor sharing an effect with the one before, each soon again only after SPREAD others (all but always), all of them alike often', () => {
  const last = new Map<number, number>();
  const count = new Map<number, number>();
  let soon = 0;
  for (let k = FIRST; k < LAST; k++) {
    const a = archetypeAt(k);
    assert.equal(endgameAt(k).kind, ARCHETYPES[a].kind);
    if (k > FIRST) {
      const b = archetypeAt(k - 1);
      assert.notEqual(a, b, `stratum ${k + 1}: ${ARCHETYPES[a].kind} twice`);
      const shared = ARCHETYPES[a].fx.filter((x) => ARCHETYPES[b].fx.some((y) => y.env === x.env));
      assert.equal(shared.length, 0, `stratum ${k + 1}: ${ARCHETYPES[a].kind} after ${ARCHETYPES[b].kind}`);
      // (So the effects drawn differ too.)
      const now = endgameAt(k).look.env;
      const before = endgameAt(k - 1).look.env;
      assert.ok(now.every((e, i) => !(e > 0 && before[i] > 0)), `stratum ${k + 1} draws an effect the one before does`);
    }
    if (last.has(a) && k - last.get(a)! <= SPREAD) soon++;
    last.set(a, k);
    count.set(a, (count.get(a) ?? 0) + 1);
  }
  assert.ok(soon <= (LAST - FIRST) / 200, `${soon} come round again within ${SPREAD}`);
  assert.equal(count.size, ARCHETYPES.length);
  const n = [...count.values()];
  assert.ok(Math.max(...n) - Math.min(...n) <= 1, `dealt ${n.join(', ')}`);
  // Far down as well.
  for (const k of [1e5, 1e8 + 3]) assert.notEqual(archetypeAt(k), archetypeAt(k + 1));
});

test("whatever the endgame's seed, the first stratum past the zones shares no effect with the last zone, and the deal keeps its rules", () => {
  const lastZone = SHIPPED.zones[FIRST - 1].look.env;
  const zoneFx = ENVIRONMENTS.filter((_, i) => lastZone[i] > 0);
  const D = ARCHETYPES.length;
  try {
    for (let seed = 0; seed < 200; seed++) {
      const data = cloneData(SHIPPED);
      data.endgame.seed = seed;
      setBackdrops(data);
      // (Asked for from the far end of the round first: the same deal whichever comes first.)
      const late = archetypeAt(FIRST + D + 3);
      const a = archetypeAt(FIRST);
      assert.ok(!ARCHETYPES[a].fx.some((x) => zoneFx.includes(x.env)), `seed ${seed}: ${ARCHETYPES[a].kind} after the last zone`);
      assert.ok(endgameAt(FIRST).look.env.every((e, i) => !(e > 0 && lastZone[i] > 0)), `seed ${seed}: the first stratum draws an effect the last zone does`);
      const round = Array.from({ length: D }, (_, i) => archetypeAt(FIRST + i));
      assert.equal(new Set(round).size, D, `seed ${seed}: every archetype once in the first round`);
      for (let k = FIRST + 1; k < FIRST + 2 * D; k++) {
        const [x, y] = [archetypeAt(k - 1), archetypeAt(k)];
        assert.ok(!ARCHETYPES[y].fx.some((f) => ARCHETYPES[x].fx.some((g) => g.env === f.env)), `seed ${seed}: stratum ${k + 1} shares an effect with the one before`);
      }
      setBackdrops(data);
      assert.equal(archetypeAt(FIRST + D + 3), late, `seed ${seed}: the same deal whichever comes first`);
    }
  } finally {
    setBackdrops(SHIPPED);
  }
});

test("the endgame's names: their own, never a zone's, none twice in the first fifty past 100, never twice in a row, short enough", () => {
  const all = ARCHETYPES.flatMap((a) => [...a.names, ...composedNames(a)]);
  assert.equal(new Set(all).size, all.length, 'no two archetypes share a name');
  for (const name of all) {
    assert.ok(!ZONE_NAMES.includes(name), name);
    assert.ok(name.length >= 8 && name.length <= NAME_MOST, `${name}: ${name.length} characters`);
    assert.match(name, /^[A-Z][A-Za-z' -]+$/, name);
    assert.ok(!/  |^ | $/.test(name), name);
  }
  const names = Array.from({ length: 50 }, (_, i) => stratumName(FIRST + i));
  assert.equal(new Set(names).size, 50, `a name twice in the first fifty: ${names.join(', ')}`);
  // Each its archetype's.
  for (let k = FIRST; k < FIRST + 50; k++) {
    const a = ARCHETYPES[archetypeAt(k)];
    assert.ok([...a.names, ...composedNames(a)].includes(stratumName(k)), `${stratumName(k)} is not ${a.kind}'s`);
  }
  // The curated ones first: past them only once the archetype's own are taken.
  for (let k = FIRST; k < FIRST + 7 * ARCHETYPES.length; k++) assert.ok(ARCHETYPES[archetypeAt(k)].names.includes(stratumName(k)), `stratum ${k + 1}`);
  // Never twice in a row, for ever; and none again until its archetype's have all been taken.
  const seen = new Map<string, number>();
  for (let k = FIRST; k < FIRST + 3000; k++) {
    const name = endgameName(k);
    assert.notEqual(name, endgameName(k + 1), `stratum ${k + 1}`);
    const a = ARCHETYPES[archetypeAt(k)];
    if (seen.has(name)) assert.ok(k - seen.get(name)! >= ARCHETYPES.length * (a.names.length + composedNames(a).length) - ARCHETYPES.length, `${name} again after ${k - seen.get(name)!}`);
    seen.set(name, k);
  }
});

test("the names and the deal are the same for everyone, whichever stratum is asked for first, and another endgame seed deals otherwise", () => {
  setBackdrops(SHIPPED);
  const ks = [5000, 77, 12, 13, 400, 11, 10];
  const first = ks.map((k) => [stratumName(k), archetypeAt(k)]);
  setBackdrops(SHIPPED);
  const again = [...ks].reverse().map((k) => [stratumName(k), archetypeAt(k)]).reverse();
  assert.deepEqual(first, again);
  const other = cloneData(SHIPPED);
  other.endgame.seed = 98765;
  setBackdrops(other);
  try {
    const deal = Array.from({ length: 24 }, (_, i) => archetypeAt(FIRST + i));
    setBackdrops(SHIPPED);
    assert.notDeepEqual(deal, Array.from({ length: 24 }, (_, i) => archetypeAt(FIRST + i)));
  } finally {
    setBackdrops(SHIPPED);
  }
});

test("each stratum is whole: no NaN in its look, motion or signature, and its embers' motion one of its archetype's", () => {
  for (let k = FIRST; k < LAST; k += 3) {
    const g = endgameAt(k);
    assert.deepEqual(lookErrors(g.look), [], `stratum ${k + 1}`);
    assert.deepEqual(motionErrors(g.motion, PROFILE_NAMES), [], `stratum ${k + 1}`);
    assert.deepEqual(lookErrors(lookOf(k)), []);
    assert.ok(ARCHETYPES[archetypeAt(k)].motion.includes(g.motion.profile));
    const sig = signatureAt(g);
    for (const v of [...sig.dominant, ...sig.palette.flat(), ...sig.fx, ...sig.ember, ...sig.motion, sig.bright]) assert.ok(Number.isFinite(v), `stratum ${k + 1}`);
    for (const v of [...g.look.floor, ...g.look.ember, g.look.lightK, lookOf(k).lightK]) assert.ok(Number.isFinite(v), `stratum ${k + 1}`);
  }
});
