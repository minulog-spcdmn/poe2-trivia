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
  compareDelvers,
  delveLockout,
  delveRules,
  delveStandings,
  delveChangeAt,
  delveTileVeil,
  DELVE_STEPS,
  MORE_FAKES_FROM,
  delveMoreFakes,
  LOOKALIKES_FROM,
  LOOKALIKES_ASKED_FROM,
  delveLookalikes,
  tileVeilSize,
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

/** Delve's own steps between the Custom editor's: look-alikes and mirroring in quarters. */
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];

test('every depth plays knob values that exist, or Delve\'s quarters, and the Custom steps stay as they were', () => {
  for (const d of DEPTHS) {
    const r = delveRules(d);
    assert.ok((KNOB_STEPS.options as readonly number[]).includes(r.options), `options at ${d}`);
    assert.ok(QUARTERS.includes(r.similarNames), `look-alikes at ${d}`);
    assert.ok((KNOB_STEPS.fakes as readonly number[]).includes(r.fakes), `fakes at ${d}`);
    assert.ok((KNOB_STEPS.artChance as readonly number[]).includes(r.artChance), `art at ${d}`);
    assert.ok((KNOB_STEPS.grayscale as readonly string[]).includes(r.grayscale), `grayscale at ${d}`);
    assert.ok(QUARTERS.includes(r.mirror), `mirror at ${d}`);
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

test('the approved curve: one change at a time', () => {
  const row = (d: number) => {
    const r = delveRules(d);
    return [r.options, r.similarNames, r.fakes, r.artChance, r.mirror, r.veil?.size ?? 0, r.grayscale];
  };
  assert.deepEqual(DELVE_STEPS.map((s) => s.from), [1, 3, 5, 7, 11, 15, 17, 21, 25, 29, 31, 41, 45, 50, 55, 61, 71, 75, 81]);
  assert.deepEqual([1, 3, 5, 7, 11, 15, 17, 21, 25, 29, 31, 41, 45, 50, 55, 61, 71, 75, 81].map(row), [
    [4, 0, 0, 0.4, 0, 0, 'off'],
    [4, 0.25, 0, 0.4, 0, 0, 'off'],
    [4, 0.25, 1, 0.4, 0, 0, 'off'],
    [4, 0.5, 1, 0.4, 0, 0, 'off'],
    [6, 0.5, 1, 0.4, 0, 0, 'off'],
    [6, 0.5, 1, 0.4, 0.25, 0, 'off'],
    [6, 0.5, 2, 0.4, 0.25, 0, 'off'],
    [6, 0.75, 2, 0.4, 0.25, 0, 'off'],
    [6, 0.75, 2, 0.4, 0.25, 5, 'off'],
    [6, 0.75, 2, 0.4, 0.5, 5, 'off'],
    [8, 0.75, 2, 0.4, 0.5, 5, 'off'],
    [8, 0.75, 2, 0.5, 0.5, 5, 'art'],
    [8, 0.75, 3, 0.5, 0.5, 5, 'art'],
    [8, 0.75, 3, 0.5, 0.5, 7, 'art'],
    [8, 1, 3, 0.5, 0.5, 7, 'art'],
    [8, 1, 3, 0.5, 0.5, 7, 'all'],
    [8, 1, 3, 0.5, 0.75, 7, 'all'],
    [8, 1, 3, 0.5, 0.75, 9, 'all'],
    [8, 1, 3, 0.5, 1, 9, 'all'],
  ]);
  const timers = [1, 12, 13, 18, 19, 26, 27, 33, 34, 38, 39, 43, 44, 47, 48, 52, 53, 57, 58, 300].map(delveTimer);
  assert.deepEqual(timers, [16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7]);
  const lockouts = [1, 8, 9, 22, 23, 36, 37, 65, 66, 90, 91, 300].map(delveLockout);
  assert.deepEqual(lockouts, [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
});

test('the curve only ever gets harder', () => {
  const gray = (v: string) => (KNOB_STEPS.grayscale as readonly string[]).indexOf(v);
  for (const d of Array.from({ length: 299 }, (_, i) => i + 2)) {
    const [a, b] = [delveRules(d - 1), delveRules(d)];
    for (const k of ['options', 'similarNames', 'fakes', 'artChance', 'mirror'] as const) assert.ok(b[k] >= a[k], `${k} eases at ${d}`);
    assert.ok(gray(b.grayscale) >= gray(a.grayscale), `grayscale eases at ${d}`);
    assert.ok((b.veil?.size ?? 0) >= (a.veil?.size ?? 0), `the veil speeds up at ${d}`);
    assert.ok((b.moreFakes ?? 0) >= (a.moreFakes ?? 0), `fewer fourth fakes at ${d}`);
    assert.ok((b.lookalikes ?? 0) >= (a.lookalikes ?? 0), `fewer look-alike pictures at ${d}`);
    assert.ok(delveTileVeil(d) >= delveTileVeil(d - 1), `fewer veiled pictures at ${d}`);
    assert.ok(delveTimer(d) <= delveTimer(d - 1), `timer grows at ${d}`);
    assert.ok(delveLockout(d) >= delveLockout(d - 1), `lockout shrinks at ${d}`);
  }
});

test('past depth 100 a growing share of name questions gets a fourth made-up name, all of them from 150', () => {
  assert.equal(MORE_FAKES_FROM, 101);
  assert.deepEqual([1, 81, 100, 101, 102, 125, 149, 150, 300].map(delveMoreFakes), [0, 0, 0, 0.02, 0.04, 0.5, 0.98, 1, 1]);
  assert.equal(delveRules(100).moreFakes, undefined, 'nothing to say before it starts');
  assert.equal(delveRules(150).moreFakes, 1);
  assert.equal(maxFakes(8), 4);
});

test('from depth 85 a growing share of questions picks its look-alikes by their art, every question from 134', () => {
  assert.equal(LOOKALIKES_FROM, 85);
  assert.deepEqual([1, 81, 84, 85, 86, 100, 133, 134, 300].map(delveLookalikes), [0, 0, 0, 0.02, 0.04, 0.32, 0.98, 1, 1]);
  assert.equal(delveRules(84).lookalikes, undefined, 'nothing to say before it starts');
  assert.equal(delveRules(85).lookalikes, 0.02);
  assert.equal(delveRules(134).lookalikes, 1);
  // It only makes look-alikes pick differently, so it comes where every question already has them all.
  assert.equal(delveRules(LOOKALIKES_FROM).similarNames, 1);
  // Finds ask from up to twenty depths deeper, so a flare at 65 already gets it.
  assert.equal(LOOKALIKES_ASKED_FROM, 65);
  assert.equal(findRules('flare', 64).lookalikes, undefined);
  assert.equal(findRules('flare', 65).lookalikes, 0.02);
  assert.equal(findRules('azurite', 70).lookalikes, 0.02);
});

test('timer and lockout stay within bounds', () => {
  for (const d of DEPTHS) {
    assert.ok(Number.isInteger(delveTimer(d)) && delveTimer(d) >= 7 && delveTimer(d) <= 16);
    assert.ok(delveLockout(d) >= 2 && delveLockout(d) <= DELVE_MAX_LOCKOUT);
  }
  assert.equal(delveTimer(1), 16);
  assert.equal(delveTimer(58), 7);
  assert.equal(delveTimer(57), 8);
  assert.equal(delveTimer(1000), 7);
  assert.equal(delveLockout(1), 2);
  assert.equal(delveLockout(91), DELVE_MAX_LOCKOUT);
  assert.equal(delveLockout(90), DELVE_MAX_LOCKOUT - 1);
});

test('something gets harder every few depths, one thing at a time', () => {
  // Never more than three depths without a change until the timer stops at 58,
  // then ever further apart: the last step at 81, the first look-alike
  // pictures at 85, the last lockout at 91, the first fourth made-up names at 101.
  const changes: number[] = [];
  for (const d of DEPTHS.slice(1)) {
    const change = delveChangeAt(d);
    const strip = (x: number) => ({ ...delveRules(x), moreFakes: undefined, lookalikes: undefined });
    const same = JSON.stringify([strip(d), delveTimer(d)]) === JSON.stringify([strip(d - 1), delveTimer(d - 1)]);
    if (d !== MORE_FAKES_FROM && d !== LOOKALIKES_FROM) assert.equal(change === null, same, `delveChangeAt disagrees at ${d}`);
    // One change per depth: knobs, timer and lockout never move together.
    const moved = [JSON.stringify(strip(d)) !== JSON.stringify({ ...strip(d - 1), lockout: delveLockout(d) }), delveLockout(d) !== delveLockout(d - 1), delveTimer(d) !== delveTimer(d - 1)];
    assert.ok(moved.filter(Boolean).length <= 1, `two changes at ${d}`);
    if (change) changes.push(d);
  }
  assert.deepEqual(changes, [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 34, 37, 39, 41, 44, 45, 48, 50, 53, 55, 58, 61, 66, 71, 75, 81, 85, 91, 101]);
  assert.equal(delveChangeAt(LOOKALIKES_FROM), 'knobs');
  assert.deepEqual(
    changes.filter((d) => d <= 58).map((d, i, all) => d - (all[i - 1] ?? 1)).filter((gap) => gap > 3),
    [],
  );
  assert.equal(delveChangeAt(1), null);
  assert.deepEqual(
    DELVE_STEPS.map((s) => s.from),
    [...DELVE_STEPS.map((s) => s.from)].sort((a, b) => a - b),
  );
  assert.equal(DELVE_STEPS[0].from, 1);
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
  // (Delve isn't released yet, so the new curve kept both and only moved the pin; so did dynamite going off by itself, look-alike pictures, the flare burning at 0 and the blast holding the clock, co-op, dynamite taking half of all the options with two finds side by side, and pinning the lives.)
  const table: unknown[] = DEPTHS.map((d) => [delveRules(d), delveTimer(d), delveTileVeil(d)]);
  // The finds too: where and how often they turn up, what they ask and cost, and what their items do.
  const clocks = Array.from({ length: 10 }, (_, i) => i + 7);
  table.push([FINDS, SECOND_FIND, MAX_FINDS, SHARDS_PER_WARD, FLARE_MS, BLAST_PAUSE_MS, clocks.map(blastAt), [2, 3, 4, 6, 8, 10].map(blastCount)]);
  table.push(DEPTHS.slice(0, 100).map((d) => FINDS.map((f) => findChance(f.kind, d))));
  table.push(
    DEPTHS.slice(0, 100).map((d) => FINDS.map((f) => [findRules(f.kind, d), findTimer(f.kind, d), findTileVeil(f.kind, d), veinWindow(findTimer(f.kind, d))])),
  );
  // Co-op: how long a vote stays open after the first vote, when a player counts as idle, and what a life given takes.
  table.push(['coop', VOTE_WINDOW_MS, DELVE_IDLE_ROUNDS, REVIVE_FROM, DELVE_RESUME_GRACE_MS]);
  // The lives everyone sets out with.
  table.push(['lives', DELVE_LIVES]);
  const hash = createHash('sha256').update(JSON.stringify(table)).digest('hex').slice(0, 16);
  assert.deepEqual([DELVE_RULESET, PROTOCOL_VERSION, hash], [1, 11, PINNED_HASH]);
});

const PINNED_HASH = '56ce8c1671fca1e6';

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

test('the art burns into view from depth 25, a step slower every 25 depths, as the presets pace it', async () => {
  const { rulesFor } = await import('../src/lib/game.ts');
  const paced = (veil: 'off' | 'fast' | 'slow' | 'slowest') =>
    rulesFor({ difficulty: 'custom', mode: 'turns', custom: { ...delveRules(1), veil, lockout: 2 } as never }).veil;
  assert.equal(delveRules(24).veil, null);
  assert.deepEqual(delveRules(25).veil, paced('fast'));
  assert.deepEqual(delveRules(49).veil, paced('fast'));
  assert.deepEqual(delveRules(50).veil, paced('slow'));
  assert.deepEqual(delveRules(75).veil, paced('slowest'));
  assert.deepEqual(delveRules(500).veil, paced('slowest'));
});

test('at every depth to 300, even under the slowest veil, half the art is in with over 3 s left', async () => {
  const { veilPace } = await import('../src/lib/patches.ts');
  for (let d = 1; d <= 300; d++) {
    if (!delveRules(d).veil) continue;
    const ms = delveTimer(d) * 1000;
    const veilMs = ms * delveRules(d).veil!.share;
    // The veil is cut into about size × size patches; the first starts 400 ms in (media.svelte.ts patchDelays).
    const count = delveRules(d).veil!.size ** 2;
    const { gap, burn } = veilPace(veilMs, count);
    const halfIn = 400 + (count / 2) * gap + burn;
    assert.ok(ms - halfIn >= 3000, `depth ${d}: ${Math.round(ms - halfIn)} ms left with half the art in`);
  }
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
  assert.equal(delveRules(first).grayscale, 'off');
  assert.ok(DEPTHS.find((d) => delveRules(d).grayscale !== 'off')! > first);
});

test('at every depth to 300, a veiled picture also has half its patches in with over 3 s left', async () => {
  const { veilPace } = await import('../src/lib/patches.ts');
  for (let d = 1; d <= 300; d++) {
    if (!delveRules(d).veil) continue;
    const ms = delveTimer(d) * 1000;
    const count = tileVeilSize(delveRules(d).veil!.size) ** 2;
    const { gap, burn } = veilPace(ms * delveRules(d).veil!.share, count);
    // The last picture starts up to half a step late (session.svelte.ts burnVeil).
    const halfIn = 400 + gap / 2 + (count / 2) * gap + burn;
    assert.ok(ms - halfIn >= 3000, `depth ${d}: ${Math.round(ms - halfIn)} ms left with half a picture in`);
  }
});
