import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import { descent, emberStratumOf, lookOf, STRATA } from '../src/lib/descent.ts';
import { EMBERS, Embers, PALETTE, SIZE_STRIDE, SLOTS, TILES } from '../src/lib/backdropEmbers.ts';
import { cooling, MOTIONS, motionFor, SURFACE_MOTION, ZONE_MOTION, zoneOf } from '../src/lib/emberMotion.ts';

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

test('every stratum has a motion, and past the last each takes the motion of the stratum its embers come from', () => {
  assert.equal(ZONE_MOTION.length, STRATA.length);
  for (let k = 0; k < STRATA.length; k++) assert.equal(zoneOf(k), k);
  assert.equal(zoneOf(-1), -1);
  for (let k = STRATA.length; k < 60; k++) {
    const z = zoneOf(k);
    assert.ok(z >= 1 && z < STRATA.length && z === emberStratumOf(k), `stratum ${k}: ${z}`);
    assert.equal(motionFor(k, 1), main(z));
  }
  // And they move so: one past 100 goes the way of the zone its embers are from.
  for (const k of [10, 13, 23, 31]) {
    const z = zoneOf(k);
    if (WAY[z] === 0) continue;
    const own = moves(zone(k), 120).filter((v) => v.motion === main(z));
    assert.ok(own.length > 300 && own.every((v) => Math.sign(v.dy) === WAY[z]), `stratum ${k} as ${STRATA[z].name}`);
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

test('the two kinds in one zone are a different sort of ember, rarer, smaller and brighter', () => {
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

test('magma rises fastest and ever faster; spores and motes hang nearly still; snow and stone dust fall steadily', () => {
  const speed = (k: number) => mean(moves(zone(k), 180).filter((v) => v.motion === main(k)).map((v) => -v.dy / DT));
  const magma = speed(1);
  const all = [-1, 0, 2, 3, 4, 6, 7, 8, 9].map((k) => [k, speed(k)] as const);
  for (const [k, v] of all) assert.ok(Math.abs(v) < magma, `stratum ${k} (${v.toFixed(1)} px/s) is no quicker than the magma's ${magma.toFixed(1)}`);
  assert.ok(magma > 120, `magma: ${magma.toFixed(1)} px/s`);
  const fungal = speed(3);
  assert.ok(fungal > 0 && fungal < 20, `spores: ${fungal.toFixed(1)} px/s`);
  const vaal = speed(4);
  assert.ok(vaal < 0 && vaal > -15, `motes: ${vaal.toFixed(1)} px/s`);
  // Heat lifts them ever faster: higher up, they are quicker.
  const own = moves(zone(1), 240).filter((v) => v.motion === main(1));
  const low = mean(own.filter((v) => v.y > H * 0.7).map((v) => -v.dy));
  const high = mean(own.filter((v) => v.y < H * 0.3).map((v) => -v.dy));
  assert.ok(high > low * 1.3, `higher ${high.toFixed(2)} vs lower ${low.toFixed(2)} px a frame`);
  // Petrified dust falls nearly straight down; the city's ash drifts sideways as it falls.
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

test('the Primeval motes rise, all circling the same way', () => {
  const e = zone(9, 20);
  // Each one's size and sideways move over a while: larger (the near half of
  // its circle), it moves one way across, smaller (the far half) the other.
  const sizes: number[][] = Array.from({ length: EMBERS }, () => []);
  const across: number[][] = Array.from({ length: EMBERS }, () => []);
  let up = 0;
  let down = 0;
  const life = new Uint32Array(EMBERS);
  watch(e, 600, (i, x, y, dx, dy, size) => {
    if (e.motion[i] !== main(9)) return;
    dy < 0 ? up++ : down++;
    // One life's circle at a time.
    if (life[i] !== e.lives[i]) {
      life[i] = e.lives[i];
      sizes[i] = [];
      across[i] = [];
    }
    sizes[i].push(size);
    across[i].push(dx);
  });
  assert.ok(up > 1000 && down === 0, `up ${up}, down ${down}`);
  let left = 0;
  let right = 0;
  for (let i = 0; i < EMBERS; i++) {
    if (sizes[i].length < 120) continue;
    const s = mean(sizes[i]);
    const c = sizes[i].reduce((a, v, j) => a + (v - s) * across[i][j], 0);
    c < 0 ? left++ : right++;
  }
  assert.ok(left > 10 && right === 0, `near half moving left: ${left}, right: ${right}`);
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
  // Cooling comes in over the zone's later depths, with its hall, for its own embers only.
  assert.equal(cooling(1, 2, 0.15), 0);
  assert.ok(cooling(1, 2, 0.5) > 0.4 && cooling(1, 2, 0.5) < 0.7);
  assert.equal(cooling(1, 2, 0.8), 1);
  assert.equal(cooling(2, 2, 0.9), 0, 'the next zone is not cooling');
  // The same magma embers, the zone still warm and then near its end.
  const cooled = new Embers();
  const warm = { ...descent(18), look: lookOf(1) };
  cooled.descend(warm, { stratum: 2, turn: 0.15 });
  cooled.step(0, W, H);
  for (let s = 0; s < 120; s++) cooled.step(DT, W, H);
  const speeds = () => {
    const by = new Map<number, number[]>();
    for (const v of moves(cooled, 20)) if (v.entry === 2) by.set(v.i, [...(by.get(v.i) ?? []), -v.dy]);
    return new Map([...by].map(([i, s]) => [i, mean(s)]));
  };
  const before = speeds();
  cooled.descend(warm, { stratum: 2, turn: 0.95 });
  const after = speeds();
  const both = [...after.keys()].filter((i) => before.has(i));
  assert.ok(both.length > 10, `${both.length} embers`);
  const slowed = mean(both.map((i) => after.get(i)! / before.get(i)!));
  assert.ok(slowed > 0.3 && slowed < 0.75, `cooled to ${slowed.toFixed(2)} of their speed`);
});

test('turning to a new motion in mid-life (a recolor), no ember jumps', () => {
  const e = zone(-1);
  // Straight from the surface to the Primeval Ruins (a rejoin): every ember turns to circling.
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
