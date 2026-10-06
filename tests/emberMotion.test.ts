import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import { descent, hallTurn, lookOf, magmaCooling, STRATA } from '../src/lib/descent.ts';
import { EMBERS, Embers, GLINTS, PALETTE, SIZE_STRIDE, SLOTS, SPARKS, TILES } from '../src/lib/backdropEmbers.ts';
import { cooling, MOTIONS, motionFor, motionOf, SURFACE_MOTION, tweakOf, ZONE_MOTION, zoneMotionOf } from '../src/lib/emberMotion.ts';
import { endgameAt, zones } from '../src/lib/backdrops.ts';

const W = 1200;
const H = 800;
const DT = 1 / 60;

/** Embers all burning in stratum k (-1: the surface), settled in for a few seconds. */
function zone(k: number, seconds = 4) {
  const e = new Embers();
  if (k < 0) e.descend(descent(0));
  else e.descend({ ...descent(0), look: lookOf(k) }, { stratum: k + 1, turn: 0 });
  e.step(0, W, H);
  for (let s = 0; s < seconds / DT; s++) e.step(DT, W, H);
  return e;
}

type Move = { i: number; x: number; y: number; dx: number; dy: number; motion: number; entry: number };

/** Each visible ember's move over every frame for `frames` frames (none that started a new life or came round again). */
function moves(e: Embers, frames: number, each: (e: Embers, f: number) => void = (e) => e.step(DT, W, H)): Move[] {
  const out: Move[] = [];
  for (let f = 0; f < frames; f++) {
    const before = e.pos.slice(0, EMBERS * 4);
    const lives = e.lives.slice();
    each(e, f);
    for (let i = 0; i < EMBERS; i++) {
      const o = i * 4;
      if (e.lives[i] !== lives[i] || before[o + 3] <= 0 || e.pos[o + 3] <= 0) continue;
      const dx = e.pos[o] - before[o];
      const dy = e.pos[o + 1] - before[o + 1];
      if (Math.abs(dx) > W / 2 || Math.abs(dy) > H / 2) continue;
      out.push({ i, x: e.pos[o], y: e.pos[o + 1], dx, dy, motion: e.motion[i], entry: Math.floor(e.pos[o + 2] / SIZE_STRIDE) });
    }
  }
  return out;
}

const main = (k: number) => motionFor(k, 1);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Which way each zone's embers go: -1 up, 1 down, 0 neither (drawn into the eddies). */
const WAY: Record<number, -1 | 0 | 1> = { [-1]: -1, 0: 1, 1: -1, 2: 1, 3: -1, 4: 1, 5: 0, 6: 1, 7: -1, 8: 1, 9: -1 };

test('every stratum has a motion: each zone its profile as tweaked in backdrops.json, and past the last each its generated one', () => {
  assert.equal(ZONE_MOTION.length, STRATA.length);
  for (let k = 0; k < STRATA.length; k++) {
    // As shipped, each zone's tweak leaves its profile as it is, field for field.
    assert.deepEqual(zones[k].motion, tweakOf(ZONE_MOTION[k]), STRATA[k].name);
    assert.deepEqual(motionOf(zones[k].motion), ZONE_MOTION[k], STRATA[k].name);
    assert.deepEqual(zoneMotionOf(k), ZONE_MOTION[k], STRATA[k].name);
  }
  assert.deepEqual(zoneMotionOf(-1), SURFACE_MOTION);
  for (let k = STRATA.length; k < 60; k++) {
    const own = motionOf(endgameAt(k).motion);
    assert.deepEqual(zoneMotionOf(k).main, own.main, `stratum ${k}`);
    assert.equal(motionFor(k, 1), motionFor(k, 1));
    assert.ok(MOTIONS[motionFor(k, 1)].name === own.main.name);
  }
  // And they move so: one past 100 goes the way its motion has it.
  for (const k of [10, 13, 23, 31]) {
    const m = zoneMotionOf(k).main;
    if (m.swirl > 0 || m.puff > 0 || Math.abs(m.rise) < 0.05) continue;
    const way = m.rise > 0 ? -1 : 1;
    const own = moves(zone(k), 120).filter((v) => v.motion === main(k));
    assert.ok(own.length > 300 && own.every((v) => Math.sign(v.dy) === way || Math.abs(v.dy) < 1e-6), `stratum ${k}: ${m.name}`);
  }
});

test("within a zone every ember goes one way: none rises where they fall, or falls where they rise", () => {
  for (const [k, way] of Object.entries(WAY).map(([k, w]) => [Number(k), w] as const)) {
    if (way === 0) continue;
    const m = k < 0 ? SURFACE_MOTION.main : ZONE_MOTION[k].main;
    assert.equal(Math.sign(m.rise), -way, `${m.name}: its rise`);
    const own = moves(zone(k), 240).filter((v) => v.motion === main(k));
    assert.ok(own.length > 1000, `${m.name}: ${own.length} moves`);
    const wrong = own.filter((v) => Math.sign(v.dy) !== way);
    assert.equal(wrong.length, 0, `${m.name}: ${wrong.length} of ${own.length} went the other way, e.g. ${JSON.stringify(wrong[0])}`);
    assert.ok(own.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)), `${m.name}: NaN`);
  }
});

test('the two kinds in one zone are a different sort of ember, rarer, smaller and brighter; only the Mines have two', () => {
  assert.deepEqual(ZONE_MOTION.flatMap((z, k) => (z.accent ? [k] : [])), [0]);
  for (const z of ZONE_MOTION) {
    if (!z.accent) continue;
    assert.ok(z.share > 0 && z.share <= 0.1, `${z.accent.name}: ${z.share}`);
    assert.ok(z.accent.size < z.main.size && z.accent.bright > z.main.bright, z.accent.name);
    assert.ok(z.accent.rest[1] > 0, `${z.accent.name}: now and then, not all the time`);
  }
  // In the Mines the dust sifts down and the lamp sparks rise.
  const sparks = moves(zone(0, 10), 900).filter((v) => v.motion === motionFor(0, 0));
  assert.ok(sparks.length > 20 && sparks.every((v) => v.dy < 0), `${sparks.length} spark moves`);
  assert.ok(sparks.every((v) => v.y > H * 0.55), 'they only rise a little way off the floor');
});

test('the fires fling theirs up fastest and ever faster; spores, motes and the city\'s lights hang nearly still; snow and stone dust fall steadily', () => {
  const speed = (k: number) => mean(moves(zone(k), 180).filter((v) => v.motion === main(k)).map((v) => -v.dy / DT));
  // The Magma Fissure's and the Primeval Ruins' white-hot fire's.
  const fire = Math.min(speed(1), speed(9));
  const all = [-1, 0, 2, 3, 4, 6, 7, 8].map((k) => [k, speed(k)] as const);
  for (const [k, v] of all) assert.ok(Math.abs(v) < fire, `stratum ${k} (${v.toFixed(1)} px/s) is no quicker than the fire's ${fire.toFixed(1)}`);
  assert.ok(fire > 110, `fire: ${fire.toFixed(1)} px/s`);
  const fungal = speed(3);
  assert.ok(fungal > 0 && fungal < 20, `spores: ${fungal.toFixed(1)} px/s`);
  const vaal = speed(4);
  assert.ok(vaal < 0 && vaal > -15, `motes: ${vaal.toFixed(1)} px/s`);
  const city = speed(8);
  assert.ok(city < 0 && city > -12, `the city's motes: ${city.toFixed(1)} px/s`);
  // Heat lifts them ever faster: higher up, they are quicker.
  for (const k of [1, 9]) {
    const own = moves(zone(k), 240).filter((v) => v.motion === main(k));
    const low = mean(own.filter((v) => v.y > H * 0.7).map((v) => -v.dy));
    const high = mean(own.filter((v) => v.y < H * 0.3).map((v) => -v.dy));
    assert.ok(high > low * 1.2, `${STRATA[k].name}: higher ${high.toFixed(2)} vs lower ${low.toFixed(2)} px a frame`);
  }
  // Petrified dust falls nearly straight down; the city's motes drift sideways as they sink.
  const sideways = (k: number) => Math.abs(mean(moves(zone(k), 180).filter((v) => v.motion === main(k)).map((v) => v.dx / v.dy)));
  assert.ok(sideways(6) < 0.1, `petrified: ${sideways(6)}`);
  assert.ok(sideways(8) > 0.3, `city: ${sideways(8)}`);
});

test('the sulphur vents carry them up in gusts, then they linger, never sinking', () => {
  const e = zone(7);
  const by: number[][] = Array.from({ length: EMBERS }, () => []);
  for (const v of moves(e, 600)) if (v.motion === main(7)) by[v.i].push(-v.dy / DT);
  const gusty = by.filter((s) => s.length > 300);
  assert.ok(gusty.length > 10);
  for (const s of gusty) {
    assert.ok(Math.min(...s) > 0, 'never sinking');
    assert.ok(Math.max(...s) > 4 * Math.min(...s), `gusts: ${Math.min(...s).toFixed(1)} to ${Math.max(...s).toFixed(1)} px/s`);
  }
});

test("the sparks the magma's bursts throw up only ever rise, as its embers do", () => {
  const e = zone(1);
  const at = (EMBERS + GLINTS) * 4;
  let up = 0;
  let down = 0;
  for (let f = 0; f < 900; f++) {
    const before = e.pos.slice(at);
    e.step(DT, W, H);
    for (let j = 0; j < SPARKS; j++) {
      if (before[j * 4 + 3] <= 0 || e.pos[at + j * 4 + 3] <= 0) continue;
      e.pos[at + j * 4 + 1] < before[j * 4 + 1] ? up++ : down++;
    }
  }
  assert.ok(up > 100 && down === 0, `up ${up}, down ${down}`);
});

test("a burst's sparks burn in the colour of the zone it belongs to, through its handover too (the Magma Fissure's red, never the Frozen Hollow's blue)", () => {
  // The zone with bursts handing over to one without (in backdrops.json as it stands, the Magma Fissure to the Frozen Hollow).
  const k = STRATA.findIndex((_, i) => lookOf(i).burst > 0.1 && i + 1 < STRATA.length && lookOf(i + 1).burst === 0);
  assert.equal(STRATA[k].name, 'Magma Fissure');
  const at = (EMBERS + GLINTS) * 4;
  const near = (a: ArrayLike<number>, b: readonly number[]) => b.every((v, c) => Math.abs(a[c] - v) < 1e-6);
  // At its first depth, and all through its handover (the scene already turning into the next zone).
  for (const d of [10 * k + 1, 10 * k + 5, 10 * k + 8, 10 * k + 10]) {
    const e = new Embers();
    e.descend(descent(d));
    e.step(0, W, H);
    let seen = 0;
    for (let f = 0; f < 1500; f++) {
      e.step(DT, W, H);
      for (let j = 0; j < SPARKS; j++) {
        if (e.pos[at + j * 4 + 3] <= 0) continue;
        const entry = Math.floor(e.pos[at + j * 4 + 2] / SIZE_STRIDE);
        const halo = e.halo.slice(entry * 4, entry * 4 + 3);
        assert.ok(near(halo, lookOf(k).ember), `depth ${d}: a spark in ${Array.from(halo, (v) => v.toFixed(2))}, not its zone's ${lookOf(k).ember}`);
        seen++;
      }
    }
    assert.ok(seen > 100, `depth ${d}: ${seen} sparks seen`);
  }
});

/** Steps `e` for `frames` frames, calling `see` with each visible ember's place before and after (none that started a new life or came round again). */
function watch(e: Embers, frames: number, see: (i: number, x: number, y: number, dx: number, dy: number, size: number, grow: number) => void) {
  for (let f = 0; f < frames; f++) {
    const before = e.pos.slice(0, EMBERS * 4);
    const lives = e.lives.slice();
    e.step(DT, W, H);
    for (let i = 0; i < EMBERS; i++) {
      const o = i * 4;
      if (e.lives[i] !== lives[i] || before[o + 3] <= 0 || e.pos[o + 3] <= 0) continue;
      const dx = e.pos[o] - before[o];
      const dy = e.pos[o + 1] - before[o + 1];
      if (Math.abs(dx) > W / 2 || Math.abs(dy) > H / 2) continue;
      const size = e.pos[o + 2] % SIZE_STRIDE;
      see(i, before[o], before[o + 1], dx, dy, size, size - (before[o + 2] % SIZE_STRIDE));
    }
  }
}

test("in the Abyssal Depths every ember spirals into one of the void's eddies", () => {
  const e = zone(5);
  const reach = 0.34 * Math.min(W, H);
  let n = 0;
  let inward = 0;
  let round = 0;
  watch(e, 240, (i, x, y, dx, dy) => {
    const k = i & 1;
    const rx = x - e.eddies[k * 2] * W;
    const ry = y - e.eddies[k * 2 + 1] * H;
    if (Math.hypot(rx, ry) < 0.1 * reach) return;
    n++;
    if (dx * rx + dy * ry < 0) inward++;
    // Round the way their eddy turns (the second the other way).
    if ((rx * dy - ry * dx) * (k ? -1 : 1) > 0) round++;
  });
  assert.ok(n > 1000);
  assert.ok(inward / n > 0.99, `inward ${inward}/${n}`);
  assert.ok(round / n > 0.99, `round ${round}/${n}`);
});

test('the spores turn in small lazy curls, the near half of each larger', () => {
  const e = zone(3, 10);
  // Each one's size and sideways move over a while: larger (the near half of
  // its curl), it moves one way across, smaller (the far half) the other.
  const sizes: number[][] = Array.from({ length: EMBERS }, () => []);
  const across: number[][] = Array.from({ length: EMBERS }, () => []);
  const life = new Uint32Array(EMBERS);
  watch(e, 900, (i, x, y, dx, dy, size) => {
    if (e.motion[i] !== main(3)) return;
    if (life[i] !== e.lives[i]) {
      life[i] = e.lives[i];
      sizes[i] = [];
      across[i] = [];
    }
    sizes[i].push(size);
    across[i].push(dx);
  });
  let curling = 0;
  let other = 0;
  for (let i = 0; i < EMBERS; i++) {
    if (sizes[i].length < 300) continue;
    const s = mean(sizes[i]);
    const c = sizes[i].reduce((a, v, j) => a + (v - s) * across[i][j], 0);
    c < 0 ? curling++ : other++;
  }
  assert.ok(curling > 10 && other === 0, `${curling} curling one way, ${other} the other`);
});

test("as a zone hands over, each ember moves as the zone it burns in, and the magma's cool and slow", () => {
  // Half way through the Magma Fissure: half the embers are the Frozen Hollow's already.
  const e = new Embers();
  e.descend({ ...descent(15), look: lookOf(1) }, { stratum: 2, turn: 0.5 });
  e.step(0, W, H);
  for (let s = 0; s < 240; s++) e.step(DT, W, H);
  const all = moves(e, 240);
  const magma = all.filter((v) => v.entry === 2);
  const snow = all.filter((v) => v.entry === 3);
  assert.ok(magma.length > 300 && snow.length > 300, `${magma.length} magma, ${snow.length} snow`);
  assert.ok(magma.every((v) => v.motion === main(1) && v.dy < 0), 'the magma rises');
  assert.ok(snow.every((v) => v.motion === main(2) && v.dy > 0), 'the snow falls');
  // Cooling comes in over the zone's later depths, with its hall (as the magma itself cools), for its own embers only, and stays once past.
  assert.equal(cooling(1, 2, 0.15), 0);
  for (const t of [0.3, 0.5, 0.7, 0.95]) {
    assert.equal(cooling(1, 2, t), hallTurn(t));
    assert.equal(cooling(1, 2, t), magmaCooling(2, t), `in step with the magma at ${t}`);
  }
  assert.ok(cooling(1, 2, 0.99) > 0.98 && cooling(1, 3, 0) === 1, 'cooled as the Frozen Hollow arrives, and stays so');
  assert.equal(cooling(2, 2, 0.9), 0, 'the next zone is not cooling');
  // The same magma embers, the zone still warm and then near its end.
  const cooled = new Embers();
  const warm = { ...descent(12), look: lookOf(1) };
  cooled.descend(warm, { stratum: 2, turn: 0.15 });
  cooled.step(0, W, H);
  for (let s = 0; s < 120; s++) cooled.step(DT, W, H);
  const speeds = () => {
    const by = new Map<number, number[]>();
    for (const v of moves(cooled, 20)) if (v.entry === 2) by.set(v.i, [...(by.get(v.i) ?? []), -v.dy]);
    return new Map([...by].map(([i, s]) => [i, mean(s)]));
  };
  const before = speeds();
  cooled.descend({ ...descent(20.9), look: lookOf(1) }, { stratum: 2, turn: 0.95 });
  const after = speeds();
  const both = [...after.keys()].filter((i) => before.has(i));
  assert.ok(both.length > 10, `${both.length} embers`);
  const slowed = mean(both.map((i) => after.get(i)! / before.get(i)!));
  assert.ok(slowed > 0.3 && slowed < 0.75, `cooled to ${slowed.toFixed(2)} of their speed`);
});

test('turning to a new motion in mid-life (a recolor), no ember jumps', () => {
  const e = zone(-1);
  // Straight from the surface to the Primeval Ruins (a rejoin): every ember turns to flying up.
  e.descend({ ...descent(0), look: lookOf(9) }, { stratum: 10, turn: 0 });
  e.recolor();
  const all = moves(e, 180);
  const most = Math.max(...all.map((v) => Math.hypot(v.dx, v.dy)));
  assert.ok(most < 16, `the biggest step: ${most.toFixed(1)} px`);
  assert.ok(e.motion.every((m) => m === main(9) || m === motionFor(9, 0)), 'all of them turned');
});

test('nothing goes wrong anywhere: plunges, swarms, flares, calm, a resize, snaps; nothing overflows, no NaN', () => {
  const e = new Embers();
  for (const k of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 23, 127]) {
    e.descend({ ...descent(0), look: lookOf(k) }, { stratum: k + 1, turn: 0.5 });
    e.swarm(k % 2 ? 1 : 0);
    e.stoke(k % 3 ? 0 : 1);
    e.flare(0.8, 0.5);
    for (let i = 0; i < 300; i++) {
      const w = i < 150 ? 1200 : 375;
      const h = i < 150 ? 800 : 812;
      if (i % 40 < 8) e.rise(30, h);
      e.streak = i % 40 < 8 ? 1.5 : 0;
      e.step(i % 50 === 7 ? 0 : 0.05, w, h, i % 90 > 70, i % 97 === 3);
      for (let j = 0; j < e.pos.length; j++) assert.ok(Number.isFinite(e.pos[j]), `NaN at ${k}, step ${i}`);
    }
    assert.ok(e.usedMax <= SLOTS);
    for (let t = 0; t < TILES * SLOTS * 4; t += 4) {
      if (e.data[t + 3] <= 0) continue;
      const entry = Math.floor(e.data[t + 2] / SIZE_STRIDE);
      assert.ok(entry >= 0 && entry < PALETTE && e.data[t + 2] % SIZE_STRIDE > 0, `slot ${t}`);
    }
  }
  // With effects off they still move their stratum's way, only calmer.
  const calm = zone(2);
  const still = moves(calm, 120, (e) => e.step(DT, W, H, true)).filter((v) => v.motion === main(2));
  assert.ok(still.length > 500 && still.every((v) => v.dy > 0));
  assert.equal(calm.level, 0);
});

test('a step allocates nothing once settled', async () => {
  const session = new Session();
  session.connect();
  for (const k of [-1, 0, 1, 5, 7, 8, 9, 23]) {
    const e = zone(k);
    e.swarm(1);
    for (let i = 0; i < 3000; i++) e.step(DT, W, H);
    await session.post('HeapProfiler.startSampling', { samplingInterval: 64 });
    for (let i = 0; i < 20000; i++) e.step(DT, W, H);
    const { profile } = await session.post('HeapProfiler.stopSampling');
    // What the embers' own code allocated (sampled: about every 64 bytes).
    let bytes = 0;
    const walk = (n: (typeof profile)['head']) => {
      if (/backdropEmbers|emberMotion/.test(n.callFrame.url)) bytes += n.selfSize;
      n.children.forEach(walk);
    };
    walk(profile.head);
    // Less than one small object every few steps: one a step, even, would be 320 kB.
    assert.ok(bytes < 100_000, `stratum ${k}: ${bytes} bytes over 20000 steps`);
  }
  session.disconnect();
});
