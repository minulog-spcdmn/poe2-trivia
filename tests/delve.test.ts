import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  DELVE_IDLE_ROUNDS,
  DELVE_RESUME_GRACE_MS,
  REVIVE_FROM,
  VOTE_WINDOW_MS,
  FINDS,
  findChance,
  DELVE_FUSE_MS,
  DELVE_MAX_BLASTS,
  FLARE_MS,
  SHARDS_PER_WARD,
  MAX_FINDS,
  SECOND_FIND,
  findRules,
  findTileVeil,
  findTimer,
  veinWindow,
  DELVE_MAX_LOCKOUT,
  DELVE_RULESET,
  FIND_MIN_TIMER,
  blastVictim,
  compareDelvers,
  delveLockout,
  delveRules,
  delveStandings,
  delveTileVeil,
  DELVE_CURVES,
  FAKES_FROM,
  OPTIONS_FROM,
  VEIL_FROM,
  veilLate,
  veilPlan,
  VEIL_TAIL_MS,
  delveCurve,
  LOOKALIKES_TO,
  MORE_FAKES_FROM,
  delveMoreFakes,
  LOOKALIKES_FROM,
  LOOKALIKES_ASKED_FROM,
  delveLookalikes,
  tileVeilSize,
  veilSeconds,
  VEIL_LEFT_MS,
  DELVE_MIN_TIMER,
  delveTier,
  delveTimer,
  fellAt,
  livesOf,
  standingIds,
} from '../src/lib/delve.ts';
import { Engine, KNOB_STEPS, OFFER_COUNT, createGame, maxFakes, type GameState, type Item } from '../src/lib/game.ts';
import { PROTOCOL_VERSION } from '../src/lib/protocol.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const DEPTHS = Array.from({ length: 200 }, (_, i) => i + 1);

test('every depth plays sane knob values, and the Custom steps stay as they were', () => {
  for (const d of DEPTHS) {
    const r = delveRules(d);
    assert.ok((KNOB_STEPS.options as readonly number[]).includes(r.options), `options at ${d}`);
    assert.ok((KNOB_STEPS.fakes as readonly number[]).includes(r.fakes), `fakes at ${d}`);
    for (const k of ['similarNames', 'artChance', 'mirror'] as const) assert.ok(r[k] >= 0 && r[k] <= 1, `${k} at ${d}`);
    assert.ok(r.artChance >= 0 && r.artChance <= 0.6, `art at ${d}`);
    // Grayscale is rolled for each question instead.
    assert.equal(r.grayscale, 'off', `grayscale at ${d}`);
    assert.ok(r.grayChance === undefined || (r.grayChance > 0 && r.grayChance <= 1), `grayscale chance at ${d}`);
    if (r.veil) assert.ok(r.veil.size >= 4 && r.veil.size <= 9 && r.veil.share >= 0.3 && r.veil.share <= 0.8, `the veil at ${d}`);
    assert.ok(r.fakes <= maxFakes(r.options), `fakes fit at ${d}`);
    assert.ok(r.fakes + (r.moreFakes ? 1 : 0) <= maxFakes(r.options), `a fourth fake fits at ${d}`);
    assert.ok(r.options <= 10, `at most 10 options at ${d}`);
  }
  assert.deepEqual([KNOB_STEPS.similarNames, KNOB_STEPS.mirror, KNOB_STEPS.fakes], [
    [0, 0.5, 1],
    [0, 0.3, 0.5, 1],
    [0, 1, 2, 3],
  ]);
});

test('the approved curve: steps for options, made-up names, the timer and the lockout, a smooth rise for the rest', () => {
  assert.deepEqual(OPTIONS_FROM, [
    { from: 1, options: 4 },
    { from: 11, options: 6 },
    { from: 31, options: 8 },
    { from: 70, options: 10 },
  ]);
  assert.deepEqual(FAKES_FROM, [
    { from: 1, fakes: 0 },
    { from: 5, fakes: 1 },
    { from: 17, fakes: 2 },
    { from: 45, fakes: 3 },
  ]);
  assert.deepEqual([1, 10, 11, 30, 31, 69, 70, 300].map((d) => delveRules(d).options), [4, 4, 6, 6, 8, 8, 10, 10]);
  assert.deepEqual([4, 5, 16, 17, 44, 45, 300].map((d) => delveRules(d).fakes), [0, 1, 1, 2, 2, 3, 3]);
  // The smooth knobs, at a few depths: [look-alike names, find the art, mirrored, veil share, veil size, grayscale].
  const row = (d: number) => {
    const r = delveRules(d);
    return [r.similarNames, r.artChance, r.mirror, r.veil?.share ?? 0, r.veil?.size ?? 0, r.grayChance ?? 0].map((x) => Math.round(x * 100) / 100);
  };
  assert.deepEqual([1, 10, 25, 50, 75, 90, 100].map(row), [
    [0, 0, 0, 0, 0, 0],
    [0.21, 0.09, 0, 0, 0, 0],
    [0.52, 0.24, 0.15, 0.31, 4.08, 0],
    [0.86, 0.5, 0.51, 0.5, 5.97, 0.2],
    [1, 0.6, 0.86, 0.69, 7.86, 0.7],
    [1, 0.6, 1, 0.8, 9, 1],
    [1, 0.6, 1, 0.8, 9, 1],
  ]);
  const timers = [1, 12, 13, 18, 19, 26, 27, 33, 34, 38, 39, 43, 44, 47, 48, 52, 53, 57, 58, 77, 78, 95, 96, 300].map(delveTimer);
  assert.deepEqual(timers, [16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5]);
  const lockouts = [1, 8, 9, 22, 23, 36, 37, 65, 66, 90, 91, 300].map(delveLockout);
  assert.deepEqual(lockouts, [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
});

test('the curve only ever gets harder', () => {
  for (const d of Array.from({ length: 299 }, (_, i) => i + 2)) {
    const [a, b] = [delveRules(d - 1), delveRules(d)];
    for (const k of ['options', 'similarNames', 'fakes', 'artChance', 'mirror'] as const) assert.ok(b[k] >= a[k], `${k} eases at ${d}`);
    assert.ok((b.grayChance ?? 0) >= (a.grayChance ?? 0), `less grayscale at ${d}`);
    assert.ok((b.veil?.size ?? 0) >= (a.veil?.size ?? 0), `the veil coarsens at ${d}`);
    assert.ok((b.veil?.share ?? 0) >= (a.veil?.share ?? 0), `the veil speeds up at ${d}`);
    assert.ok((b.moreFakes ?? 0) >= (a.moreFakes ?? 0), `fewer fourth fakes at ${d}`);
    assert.ok((b.lookalikes ?? 0) >= (a.lookalikes ?? 0), `fewer look-alike pictures at ${d}`);
    assert.ok(delveTileVeil(d) >= delveTileVeil(d - 1), `fewer veiled pictures at ${d}`);
    assert.ok(delveTimer(d) <= delveTimer(d - 1), `timer grows at ${d}`);
    assert.ok(delveLockout(d) >= delveLockout(d - 1), `lockout shrinks at ${d}`);
  }
});

test('the smooth knobs rise a little at every depth, never in a jump, and top out by depth 90', () => {
  // No depth moves a knob by more than 3% of its whole rise (the eased look-alikes rise fastest, at first).
  const knobs = Object.keys(DELVE_CURVES) as (keyof typeof DELVE_CURVES)[];
  for (const k of knobs) {
    const { lo, hi, from, to } = DELVE_CURVES[k];
    assert.ok(to <= 90, `${k} tops out by 90`);
    assert.equal(delveCurve(k, from), lo);
    assert.equal(delveCurve(k, to), hi);
    assert.equal(delveCurve(k, 500), hi);
    for (let d = 2; d <= 300; d++) {
      const step = delveCurve(k, d) - delveCurve(k, d - 1);
      assert.ok(step >= 0 && step <= 0.03 * (hi - lo), `${k} jumps by ${step} at ${d}`);
    }
  }
  // The same for the shares that rise past the run: look-alike pictures, burning pictures, a fourth made-up name.
  for (const f of [delveLookalikes, delveTileVeil, delveMoreFakes])
    for (let d = 2; d <= 300; d++) assert.ok(f(d) - f(d - 1) <= 0.03, `${f.name} jumps at ${d}`);
  // Each starts about where its step used to: look-alike names at 2 (where nothing else changes yet), mirroring at 15, the unveil at 25, grayscale at 41; "find the art" from 2, none at depth 1.
  const first = (f: (d: number) => number) => DEPTHS.find((d) => f(d) > f(1))!;
  assert.deepEqual(
    [(d: number) => delveRules(d).similarNames, (d: number) => delveRules(d).mirror, (d: number) => delveRules(d).veil?.share ?? 0, (d: number) => delveRules(d).artChance, (d: number) => delveRules(d).grayChance ?? 0].map(first),
    [2, 15, VEIL_FROM, 2, 41],
  );
  // The unveil comes in gently: fast and coarse at first, a third of the clock in big patches.
  assert.ok(delveRules(VEIL_FROM).veil!.share < 0.32 && delveRules(VEIL_FROM).veil!.size < 4.1);
});

test('past depth 100 a growing share of name questions gets a fourth made-up name, all of them from 150', () => {
  assert.equal(MORE_FAKES_FROM, 101);
  assert.deepEqual([1, 81, 100, 101, 102, 125, 149, 150, 300].map(delveMoreFakes), [0, 0, 0, 0.02, 0.04, 0.5, 0.98, 1, 1]);
  assert.equal(delveRules(100).moreFakes, undefined, 'nothing to say before it starts');
  assert.equal(delveRules(150).moreFakes, 1);
  assert.equal(maxFakes(8), 4);
});

test('from depth 50 a growing share of questions picks its look-alikes by their art, every question from 120', () => {
  assert.deepEqual([LOOKALIKES_FROM, LOOKALIKES_TO], [50, 120]);
  assert.deepEqual([1, 49, 50, 51, 85, 119, 120, 300].map(delveLookalikes), [0, 0, 0.0141, 0.0282, 0.507, 0.9859, 1, 1]);
  assert.equal(delveRules(49).lookalikes, undefined, 'nothing to say before it starts');
  assert.equal(delveRules(50).lookalikes, 0.0141);
  assert.equal(delveRules(120).lookalikes, 1);
  // It only makes look-alikes pick differently, so it comes once most of them are look-alikes.
  assert.ok(delveRules(LOOKALIKES_FROM).similarNames > 0.8);
  // Finds ask from up to twenty depths deeper, so a flare at 30 already gets it.
  assert.equal(LOOKALIKES_ASKED_FROM, 30);
  assert.equal(findRules('flare', 29).lookalikes, undefined);
  assert.equal(findRules('flare', 30).lookalikes, 0.0141);
  assert.equal(findRules('azurite', 35).lookalikes, 0.0141);
});

test('timer and lockout stay within bounds', () => {
  for (const d of DEPTHS) {
    assert.ok(Number.isInteger(delveTimer(d)) && delveTimer(d) >= 5 && delveTimer(d) <= 16);
    assert.ok(delveLockout(d) >= 2 && delveLockout(d) <= DELVE_MAX_LOCKOUT);
  }
  assert.equal(delveTimer(1), 16);
  assert.equal(delveTimer(58), 7);
  assert.equal(delveTimer(57), 8);
  assert.equal(delveTimer(78), 6);
  assert.equal(delveTimer(96), DELVE_MIN_TIMER);
  assert.equal(delveTimer(95), DELVE_MIN_TIMER + 1);
  assert.equal(DELVE_MIN_TIMER, 5);
  assert.equal(delveTimer(1000), DELVE_MIN_TIMER);
  assert.equal(delveLockout(1), 2);
  assert.equal(delveLockout(91), DELVE_MAX_LOCKOUT);
  assert.equal(delveLockout(90), DELVE_MAX_LOCKOUT - 1);
});

test('something gets harder at every depth to 150, and the steps never come together', () => {
  const at = (d: number) => JSON.stringify([delveRules(d), delveTimer(d), delveTileVeil(d)]);
  for (let d = 2; d <= 150; d++) assert.notEqual(at(d), at(d - 1), `nothing harder at ${d}`);
  // Options, made-up names, the timer and the lockout each change on a depth of their own.
  for (let d = 2; d <= 300; d++) {
    const moved = [
      delveRules(d).options !== delveRules(d - 1).options,
      delveRules(d).fakes !== delveRules(d - 1).fakes,
      delveTimer(d) !== delveTimer(d - 1),
      delveLockout(d) !== delveLockout(d - 1),
    ];
    assert.ok(moved.filter(Boolean).length <= 1, `two steps at ${d}`);
  }
});

test('depths are filed under the preset they play like', () => {
  assert.deepEqual([1, 10, 11, 30, 31, 100].map(delveTier), ['cruel', 'cruel', 'merciless', 'merciless', 'eternal', 'eternal']);
});

test('odd depths still give rules', () => {
  for (const d of [0, -3, 1e6, NaN, Infinity, 2.7]) {
    const r = delveRules(d);
    assert.ok(Number.isFinite(r.options) && Number.isFinite(delveTimer(d)) && Number.isFinite(delveLockout(d)), String(d));
  }
  assert.deepEqual(delveRules(NaN), delveRules(1));
});

test('there are always three categories left to offer at the longest lockout', () => {
  const engine = new Engine(items);
  assert.ok(engine.categories.length - OFFER_COUNT >= DELVE_MAX_LOCKOUT);
});

test('the ruleset is pinned to the curve and the protocol', () => {
  // Changing the curve changes this hash: bump DELVE_RULESET and PROTOCOL_VERSION with it, then update the pin.
  // (Ruleset 1 is frozen as the rules Delve opens with, at protocol 12; dynamite blasting a question away for a new one, in place of going off at half the clock, kept it at 1 at protocol 13, as Delve isn't public yet, and so did its fuse burning at 0 before it goes off by itself, at protocol 14, and the fuse burning over the clock's last seconds instead, the dynamite going off right at 0, at protocol 15 (DELVE_FUSE_MS kept its 1.8 s). The finds starting later, one at a time (the Dynamite Cache from shown depth 10, the Flare Cache from 30, the Azurite Vein from 40, each reaching its cap 20 depths on), kept it at 1 at protocol 14 too. The Flare Cache coming from shown depth 25 in place of 30 (its cap by 45) kept it at 1 at protocol 15. A flare giving six seconds in place of five, and a Flare Cache's clock two thirds of its deeper depth's in place of three seconds short, never under four in place of three, kept it at 1 at protocol 16. A blasted question remembering the wrong answers given to it (no rules change) kept it at 1 at protocol 17. The upscaled item art going out at twice the pixels (no rules change) kept it at 1 at protocol 18. Before that, while Delve was unreleased, every change kept the ruleset and only moved the pin; so did dynamite going off by itself, look-alike pictures, the flare burning at 0 and the blast holding the clock, co-op, dynamite taking half of all the options with two finds side by side, pinning the lives, the clock going down to 5 s with the art burning in faster on it, the smooth rise in place of the steps, and each find's own risk: the Flare Cache's shorter clock and the Dynamite Cache's blast.)
  const table: unknown[] = DEPTHS.map((d) => [delveRules(d), delveTimer(d), delveTileVeil(d)]);
  // The finds too: where and how often they turn up, what they ask and cost, and what their items do.
  const clocks = Array.from({ length: 12 }, (_, i) => i + 5);
  table.push([FINDS, SECOND_FIND, MAX_FINDS, SHARDS_PER_WARD, FLARE_MS, ['blasts', DELVE_MAX_BLASTS], ['fuse', DELVE_FUSE_MS]]);
  table.push(DEPTHS.slice(0, 100).map((d) => FINDS.map((f) => findChance(f.kind, d))));
  table.push(
    DEPTHS.slice(0, 100).map((d) => FINDS.map((f) => [findRules(f.kind, d), findTimer(f.kind, d), findTileVeil(f.kind, d), veinWindow(findTimer(f.kind, d))])),
  );
  // The shortest a find's clock gets, and what a Dynamite Cache's blast takes of a full pack at a few rolls.
  table.push(['risk', FIND_MIN_TIMER, [0, 0.2, 0.4, 0.6, 0.8, 0.95].map((r) => blastVictim({ wards: 2, flares: 1, dynamite: 1, shards: 1 }, r))]);
  // How long the art takes to burn in on each clock, whole and as pictures (veilSeconds).
  table.push([3, 4, ...clocks].map((secs) => [0.55, 0.7, 0.8].flatMap((share) => [5, 7, 9].flatMap((size) => [veilSeconds(secs, share, size), veilSeconds(secs, share, tileVeilSize(size), true)]))));
  // Co-op: how long a vote stays open after the first vote, when a player counts as idle, and what a life given takes.
  table.push(['coop', VOTE_WINDOW_MS, DELVE_IDLE_ROUNDS, REVIVE_FROM, DELVE_RESUME_GRACE_MS]);
  // The lives everyone sets out with.
  table.push(['lives', DELVE_LIVES]);
  const hash = createHash('sha256').update(JSON.stringify(table)).digest('hex').slice(0, 16);
  assert.deepEqual([DELVE_RULESET, PROTOCOL_VERSION, hash], [1, 18, PINNED_HASH]);
});

const PINNED_HASH = 'f02382ccfa6646ee';

function run(losses: Record<string, number[]>, round = 10, seats = Object.keys(losses)): GameState {
  const s = createGame('a');
  s.players = seats.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.round = round;
  s.delve = { entrants: seats, losses, ruleset: 1, startedAt: 0, excused: [], graceUntil: 0 };
  return s;
}

test('lives count down from three, and only seated players have any', () => {
  const s = run({}, 1, ['a', 'b']);
  assert.equal(livesOf(s, 'a'), DELVE_LIVES);
  s.delve!.losses.a = [1];
  assert.equal(livesOf(s, 'a'), 2);
  assert.equal(livesOf(s, 'ghost'), 0);
  assert.equal(livesOf({ ...s, delve: null }, 'b'), 0);
  assert.deepEqual(standingIds(s), ['a', 'b']);
  s.delve!.losses.a = [1, 2, 3];
  assert.equal(fellAt(s, 'a'), 3);
  assert.equal(fellAt(s, 'b'), null);
  assert.deepEqual(standingIds(s), ['b']);
});

test('the result: those standing first, then deeper perishes, then later earlier losses; equal runs share a place', () => {
  const s = run({ a: [1, 2, 5], b: [3, 4, 5], c: [1, 2, 9], d: [3, 4, 5], e: [] }, 9);
  assert.ok(compareDelvers(s, 'b', 'a') > 0);
  assert.equal(compareDelvers(s, 'b', 'd'), 0);
  assert.ok(compareDelvers(s, 'e', 'c') > 0, 'standing beats fallen');
  const rows = delveStandings(s);
  assert.deepEqual(
    rows.map((r) => [r.id, r.rank, r.depth]),
    [
      ['e', 1, 9],
      ['c', 2, 9],
      ['b', 3, 5],
      ['d', 3, 5],
      ['a', 5, 5],
    ],
  );
  const standing = run({ a: [4], b: [2], c: [] }, 6);
  assert.deepEqual(
    delveStandings(standing).map((r) => r.id),
    ['c', 'a', 'b'],
  );
  assert.equal(delveStandings(run({ a: [1, 2, 1000] }, 1000))[0].depth, 1000);
});

test('the art burns into view from depth 25, a little slower and finer every depth, to the slowest the presets pace by 90', async () => {
  const { rulesFor } = await import('../src/lib/game.ts');
  const slowest = rulesFor({ difficulty: 'custom', mode: 'turns', custom: { ...delveRules(1), veil: 'slowest', lockout: 2 } as never }).veil;
  assert.equal(VEIL_FROM, 25);
  assert.equal(delveRules(24).veil, null);
  assert.ok(delveRules(25).veil);
  assert.ok(delveRules(50).veil!.share < delveRules(51).veil!.share);
  assert.deepEqual(delveRules(90).veil, slowest);
  assert.deepEqual(delveRules(500).veil, slowest);
});

test('at every depth to 300, even under the slowest veil, half the art is in with 3 s left at least', async () => {
  const { veilPace } = await import('../src/lib/patches.ts');
  for (let d = 1; d <= 300; d++) {
    const veil = delveRules(d).veil;
    if (!veil) continue;
    const ms = delveTimer(d) * 1000;
    const secs = veilSeconds(delveTimer(d), veil.share, veil.size);
    const veilMs = secs * 1000;
    // Its share of the clock where that leaves the time, faster only where it wouldn't: on the 6 s and 5 s clocks.
    const capped = secs !== delveTimer(d) * veil.share;
    if (capped) assert.ok(secs < delveTimer(d) * veil.share && delveTimer(d) < 7, `depth ${d}: faster on ${delveTimer(d)} s`);
    if (d >= 96) assert.ok(capped, `depth ${d}: no faster on ${delveTimer(d)} s`);
    // The veil is cut into about size × size patches; the first starts 400 ms in (media.svelte.ts patchDelays).
    const count = veil.size ** 2;
    const { gap, burn } = veilPace(veilMs, count);
    const halfIn = 400 + (count / 2) * gap + burn;
    assert.ok(ms - halfIn >= 3000, `depth ${d}: ${Math.round(ms - halfIn)} ms left with half the art in`);
    // And no faster than it takes: capped, half of it is in just as the 3 s begin.
    if (capped) assert.ok(ms - halfIn < VEIL_LEFT_MS + 5, `depth ${d}: burns in faster than it needs to`);
  }
});

/** Patch areas for a picture cut into `n` (in reveal order): all alike, smoothly uneven, or at random from `seed`. */
async function areaProfiles(n: number, seed: number): Promise<Record<string, number[]>> {
  const { seededRandom } = await import('../src/lib/patches.ts');
  const rand = seededRandom(seed);
  return {
    even: Array(n).fill(100),
    uneven: Array.from({ length: n }, (_, r) => 100 + 60 * Math.sin((6 * Math.PI * r) / n)),
    random: Array.from({ length: n }, () => 20 + 200 * rand()),
  };
}

test('however a picture is cut, half of its area is in with 3 s left, exactly then where its share would allow more, and the rest lands about 1 s before the end: whole art and pictures, clocks of 3 to 16 s', async () => {
  const { FIRST_PATCH_MS, areaTime, veilPace, veilSchedule } = await import('../src/lib/patches.ts');
  let [checked, capped, tails] = [0, 0, 0];
  for (let secs = 3; secs <= 16; secs += 0.5)
    for (const share of [0.3, 0.55, 0.8])
      for (let whole = 4; whole <= 9; whole += 0.5)
        for (const tiles of [false, true]) {
          const size = tiles ? tileVeilSize(whole) : whole;
          // A clock too short for any veil shows the art plain (veilSeconds).
          if (!veilSeconds(secs, share, size, tiles)) continue;
          const plan = veilPlan(secs, share, tiles);
          const late = veilLate(tiles);
          // cutPatches makes about size × size patches over a whole picture (never more than that, rounded), fewer over a small item.
          for (let count = 1; count <= Math.round(size * size); count++)
            for (const [kind, areas] of Object.entries(await areaProfiles(count, count * 31 + secs))) {
              const at = `${kind} ${count} of ${size} × ${size}, ${tiles ? 'pictures' : 'whole'}, ${secs} s at ${share}`;
              const s = veilSchedule(areas, plan);
              const end = s.delays.at(-1)! + s.burn;
              // The half as the patches really go out, the last picture half a step late (session.svelte.ts burnVeil).
              const half = areaTime(s.delays, s.burn, areas) + late * s.gap;
              assert.ok(Math.abs(half - s.half) < 1e-3, `${at}: half at ${half}, not ${s.half}`);
              assert.ok(secs * 1000 - half >= VEIL_LEFT_MS - 1e-3, `${at}: ${Math.round(secs * 1000 - half)} ms left with half in`);
              // Where the whole share would bring half in later, it comes in just as the 3 s begin (to the ms its pace is fitted to).
              const { gap, burn } = veilPace(plan.ms, count);
              const steady = Array.from({ length: count }, (_, r) => FIRST_PATCH_MS + r * gap);
              if (areaTime(steady, burn, areas) + late * gap > plan.halfBy + 1e-6 && plan.ms - late * gap > 0) {
                // (Unless the last picture, starting late, would otherwise run past the share: then it is paced to end with it.)
                const span = count > 1 ? (count - 1) * s.gap + s.burn : s.burn;
                const lateBound = Math.abs(span + late * s.gap - plan.ms) < 2;
                assert.ok(secs * 1000 - half < VEIL_LEFT_MS + 3 || lateBound, `${at}: half in with ${Math.round(secs * 1000 - half)} ms left, sooner than it needs`);
                capped++;
              }
              // The last picture's last patch: at the share's end or about 1 s before the clock's, whichever is sooner.
              const lastEnd = end + late * s.gap;
              const due = Math.min(FIRST_PATCH_MS + plan.ms, secs * 1000 - VEIL_TAIL_MS);
              // And right then, whenever some patches are still to start once half is in, unless (a few big
              // ones) they can't come in that soon without starting before the half and moving it.
              const ownHalf = s.half - late * s.gap;
              const rest = s.delays.findIndex((d) => d >= ownHalf - 1e-6);
              if (rest > 0) {
                const forced = Math.abs(s.delays[rest] - ownHalf) < 1e-6;
                assert.ok(Math.abs(lastEnd - due) < 1e-3 || (forced && lastEnd > due), `${at}: last in at ${Math.round(lastEnd)}, not ${due}`);
                if (!forced) tails++;
              }
              // The patches go out in order, none before the first.
              assert.ok(s.delays.every((d, r) => d >= FIRST_PATCH_MS && (r === 0 || d >= s.delays[r - 1])), at);
              checked++;
            }
        }
  assert.ok(checked > 20_000 && capped > 2_000 && tails > 10_000, `${checked} checked, ${capped} capped, ${tails} tails`);
});

test('at shown depths 24 to 199, deeper never leaves more time once half the art is in, nor once all of it is', async () => {
  const { veilSchedule } = await import('../src/lib/patches.ts');
  for (const tiles of [false, true])
    for (const fill of [0.2, 0.35, 0.5, 0.65, 0.8, 1])
      for (const kind of ['even', 'uneven']) {
        let prev: { d: number; half: number; end: number } | null = null;
        for (let d = VEIL_FROM; d <= 200; d++) {
          const veil = delveRules(d).veil!;
          const secs = delveTimer(d);
          const size = tiles ? tileVeilSize(veil.size) : veil.size;
          // The same item at every depth: it fills `fill` of its picture, cut finer deeper down.
          const count = Math.max(1, Math.round(size * size * fill));
          const areas = (await areaProfiles(count, 1))[kind];
          const s = veilSchedule(areas, veilPlan(secs, veil.share, tiles));
          // Time left once half of it is in and once all of it is, the last picture half a step late.
          const half = secs * 1000 - s.half;
          const end = secs * 1000 - (s.delays.at(-1)! + s.burn + veilLate(tiles) * s.gap);
          const at = `${tiles ? 'pictures' : 'whole'} ${kind} at ${fill}, depth ${d} (${count} patches, ${secs} s)`;
          // All alike, the half comes no later deeper down; uneven, which patches hold the half shifts with the count.
          if (prev && kind === 'even') assert.ok(half <= prev.half + 0.5, `${at}: ${Math.round(half)} ms left with half in, ${Math.round(prev.half)} at ${prev.d}`);
          if (prev) assert.ok(end <= prev.end + 0.5, `${at}: ${Math.round(end)} ms left with all in, ${Math.round(prev.end)} at ${prev.d}`);
          prev = { d, half, end };
        }
        // Deepest, on the 5 s clock: half in with 3 s left, the last patch with 1 s left.
        assert.ok(Math.abs(prev!.half - VEIL_LEFT_MS) < 3 && Math.abs(prev!.end - VEIL_TAIL_MS) < 1e-3, `${tiles} ${fill} ${kind}: ${JSON.stringify(prev)}`);
      }
});

test('at shown depths 24, 39, 59, 89 and 99, a picture of 4 patches or a whole one has half its area in with 3 s left at least, the rest after', async () => {
  const { veilSchedule } = await import('../src/lib/patches.ts');
  // Shown depths are one less than the run's (depth 90 is shown as 89, a 6 s clock).
  for (const d of [25, 40, 60, 90, 100]) {
    const veil = delveRules(d).veil!;
    const secs = delveTimer(d);
    for (const tiles of [false, true]) {
      const size = tiles ? tileVeilSize(veil.size) : veil.size;
      for (let count = 4; count <= Math.round(size * size); count++)
        for (const [kind, areas] of Object.entries(await areaProfiles(count, d))) {
          const at = `depth ${d}, ${kind} ${count} of ${size} × ${size}, ${tiles ? 'pictures' : 'whole'}`;
          const s = veilSchedule(areas, veilPlan(secs, veil.share, tiles));
          const left = secs * 1000 - s.half;
          const lastLeft = secs * 1000 - (s.delays.at(-1)! + s.burn + veilLate(tiles) * s.gap);
          assert.ok(left >= VEIL_LEFT_MS - 1e-3, `${at}: ${Math.round(left)} ms left with half in`);
          // From the 6 s clock down, the last patch lands 1 s before the end; on the longer clocks, at the end of the share.
          if (secs <= 6) assert.ok(Math.abs(lastLeft - VEIL_TAIL_MS) < 1e-3, `${at}: ${Math.round(lastLeft)} ms left with all in`);
          else assert.ok(Math.abs(lastLeft - (secs * 1000 * (1 - veil.share) - 400)) < 1e-3, `${at}: ${Math.round(lastLeft)} ms left with all in`);
          // The 5 s clocks: half the art just as the last 3 s begin.
          if (secs === 5) assert.ok(left < VEIL_LEFT_MS + 3, `${at}: ${Math.round(left)} ms left with half in`);
        }
    }
  }
  // The playtest: shown depth 89, a 6 s clock, an item cut into 22 to 52 of its 81 patches had it all in with about
  // 3 to 4 s still left. Now its last patch lands with 1 s left, as it does on the 5 s clocks below.
  const veil = delveRules(90).veil!;
  for (const count of [22, 40, 52]) {
    const s = veilSchedule(Array(count).fill(100), veilPlan(6, veil.share, false));
    assert.ok(6000 - s.half >= VEIL_LEFT_MS && Math.abs(6000 - s.delays.at(-1)! - s.burn - VEIL_TAIL_MS) < 1e-3, `${count} patches`);
  }
});

test('"find the art" pictures burn in too from depth 25, one percent more of them each depth', () => {
  assert.equal(delveTileVeil(24), 0);
  assert.equal(delveTileVeil(25), 0.01);
  assert.equal(delveTileVeil(74), 0.5);
  assert.equal(delveTileVeil(124), 1);
  assert.equal(delveTileVeil(500), 1);
  // Cut coarser than a whole item: at most 4 × 4 per picture, so ten pictures stay 160 patches.
  assert.deepEqual([5, 7, 9].map(tileVeilSize), [3, 4, 4]);
});

test('the first art to burn in is in colour', () => {
  const first = DEPTHS.find((d) => delveRules(d).veil)!;
  assert.equal(delveRules(first).grayChance, undefined);
  assert.ok(DEPTHS.find((d) => delveRules(d).grayChance)! > first);
});

test('at every depth to 300, a veiled picture also has half its patches in with 3 s left at least', async () => {
  const { veilPace } = await import('../src/lib/patches.ts');
  for (let d = 1; d <= 300; d++) {
    const veil = delveRules(d).veil;
    if (!veil) continue;
    const ms = delveTimer(d) * 1000;
    const size = tileVeilSize(veil.size);
    const secs = veilSeconds(delveTimer(d), veil.share, size, true);
    const veilMs = secs * 1000;
    const capped = secs !== delveTimer(d) * veil.share;
    assert.ok(!capped || secs < delveTimer(d) * veil.share, `depth ${d}: slower than its share`);
    const count = size ** 2;
    const { gap, burn } = veilPace(veilMs, count);
    // The last picture starts up to half a step late (session.svelte.ts burnVeil).
    const halfIn = 400 + gap / 2 + (count / 2) * gap + burn;
    assert.ok(ms - halfIn >= 3000, `depth ${d}: ${Math.round(ms - halfIn)} ms left with half a picture in`);
    if (capped) assert.ok(ms - halfIn < VEIL_LEFT_MS + 5, `depth ${d}: burns in faster than it needs to`);
  }
});
