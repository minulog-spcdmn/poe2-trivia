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
  BLAST_PAUSE_MS,
  FLARE_MS,
  SHARDS_PER_WARD,
  blastAt,
  blastCount,
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
    assert.ok(r.options <= 8, `at most 8 options at ${d}`);
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
  ]);
  assert.deepEqual(FAKES_FROM, [
    { from: 1, fakes: 0 },
    { from: 5, fakes: 1 },
    { from: 17, fakes: 2 },
    { from: 45, fakes: 3 },
  ]);
  assert.deepEqual([1, 10, 11, 30, 31, 300].map((d) => delveRules(d).options), [4, 4, 6, 6, 8, 8]);
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
  // (Delve isn't released yet, so the new curve kept both and only moved the pin; so did dynamite going off by itself, look-alike pictures, the flare burning at 0 and the blast holding the clock, co-op, dynamite taking half of all the options with two finds side by side, pinning the lives, the clock going down to 5 s with the art burning in faster on it, the smooth rise in place of the steps, and each find's own risk: the Flare Cache's shorter clock and the Dynamite Cache's blast.)
  const table: unknown[] = DEPTHS.map((d) => [delveRules(d), delveTimer(d), delveTileVeil(d)]);
  // The finds too: where and how often they turn up, what they ask and cost, and what their items do.
  const clocks = Array.from({ length: 12 }, (_, i) => i + 5);
  table.push([FINDS, SECOND_FIND, MAX_FINDS, SHARDS_PER_WARD, FLARE_MS, BLAST_PAUSE_MS, clocks.map(blastAt), [2, 3, 4, 6, 8, 10].map(blastCount)]);
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
  assert.deepEqual([DELVE_RULESET, PROTOCOL_VERSION, hash], [1, 11, PINNED_HASH]);
});

const PINNED_HASH = '3bac4df50070d8ea';

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

test('however few patches a picture is cut into, half of it is in with 3 s left: whole art and pictures, clocks of 3 to 16 s', async () => {
  const { FIRST_PATCH_MS, veilPaceFor } = await import('../src/lib/patches.ts');
  let checked = 0;
  for (let secs = 3; secs <= 16; secs += 0.5)
    for (const share of [0.55, 0.7, 0.8])
      for (let whole = 4; whole <= 9; whole += 0.25)
        for (const tiles of [false, true]) {
          const size = tiles ? tileVeilSize(whole) : whole;
          const ms = veilSeconds(secs, share, size, tiles) * 1000;
          if (!ms) continue;
          // cutPatches makes about size × size patches over a whole picture (never more than that, rounded), fewer over a small item.
          for (let count = 1; count <= Math.round(size * size); count++) {
            const { gap, burn } = veilPaceFor(ms, size, count);
            // The last picture starts up to half a step late (session.svelte.ts burnVeil).
            const late = tiles ? gap / 2 : 0;
            const halfIn = FIRST_PATCH_MS + late + (count / 2) * gap + burn;
            const at = `${count} of ${size} × ${size} patches, ${tiles ? 'pictures' : 'whole'}, ${secs} s at ${share}`;
            assert.ok(secs * 1000 - halfIn >= VEIL_LEFT_MS - 1e-6, `${at}: ${Math.round(secs * 1000 - halfIn)} ms left with half in`);
            // Never later than the veil's time either: fewer patches burn out sooner.
            assert.ok((count - 1) * gap + burn <= ms + 1e-6, `${at}: done after ${ms} ms`);
            checked++;
          }
        }
  assert.ok(checked > 10_000, `${checked} checked`);
});

test('"find the art" pictures burn in too from depth 25, one percent more of them each depth', () => {
  assert.equal(delveTileVeil(24), 0);
  assert.equal(delveTileVeil(25), 0.01);
  assert.equal(delveTileVeil(74), 0.5);
  assert.equal(delveTileVeil(124), 1);
  assert.equal(delveTileVeil(500), 1);
  // Cut coarser than a whole item: at most 4 × 4 per picture, so eight pictures stay 128 patches.
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
