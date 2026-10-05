import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  AZURITE_FAST_MS,
  BLAST_OPTIONS,
  DELVE_LIVES,
  FINDS,
  FIND_TILE_VEIL,
  FIND_TIMER,
  FLARE_AT_MS,
  FLARE_MS,
  blastRules,
  findRules,
  DELVE_MAX_LOCKOUT,
  DELVE_RULESET,
  compareDelvers,
  delveLockout,
  delveRules,
  delveStandings,
  delveChangeAt,
  delveTileVeil,
  DELVE_STEPS,
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

test('every depth plays knob values that exist', () => {
  for (const d of DEPTHS) {
    const r = delveRules(d);
    assert.ok((KNOB_STEPS.options as readonly number[]).includes(r.options), `options at ${d}`);
    assert.ok((KNOB_STEPS.similarNames as readonly number[]).includes(r.similarNames), `look-alikes at ${d}`);
    assert.ok((KNOB_STEPS.fakes as readonly number[]).includes(r.fakes), `fakes at ${d}`);
    assert.ok((KNOB_STEPS.artChance as readonly number[]).includes(r.artChance), `art at ${d}`);
    assert.ok((KNOB_STEPS.grayscale as readonly string[]).includes(r.grayscale), `grayscale at ${d}`);
    assert.ok((KNOB_STEPS.mirror as readonly number[]).includes(r.mirror), `mirror at ${d}`);
    assert.ok(r.fakes <= maxFakes(r.options), `fakes fit at ${d}`);
    assert.ok(r.options <= 8, `at most 8 options at ${d}`);
  }
});

test('the curve only ever gets harder', () => {
  const order = (k: keyof typeof KNOB_STEPS, v: unknown) => (KNOB_STEPS[k] as readonly unknown[]).indexOf(v);
  for (const d of DEPTHS.slice(1)) {
    const [a, b] = [delveRules(d - 1), delveRules(d)];
    for (const k of ['options', 'similarNames', 'fakes', 'artChance', 'grayscale', 'mirror'] as const) {
      assert.ok(order(k, b[k]) >= order(k, a[k]), `${k} eases at ${d}`);
    }
    assert.ok(delveTimer(d) <= delveTimer(d - 1), `timer grows at ${d}`);
    assert.ok(delveLockout(d) >= delveLockout(d - 1), `lockout shrinks at ${d}`);
  }
});

test('timer and lockout stay within bounds', () => {
  for (const d of DEPTHS) {
    assert.ok(Number.isInteger(delveTimer(d)) && delveTimer(d) >= 7 && delveTimer(d) <= 16);
    assert.ok(delveLockout(d) >= 2 && delveLockout(d) <= DELVE_MAX_LOCKOUT);
  }
  assert.equal(delveTimer(1), 16);
  assert.equal(delveTimer(55), 7);
  assert.equal(delveTimer(54), 8);
  assert.equal(delveTimer(1000), 7);
  assert.equal(delveLockout(1), 2);
  assert.equal(delveLockout(37), DELVE_MAX_LOCKOUT);
});

test('something gets harder every few depths until the floor', () => {
  // Never more than six depths without a change, until the timer stops at depth 55.
  let last = 1;
  for (const d of DEPTHS.slice(1, 55)) {
    const change = delveChangeAt(d);
    const same = JSON.stringify([delveRules(d), delveTimer(d)]) === JSON.stringify([delveRules(d - 1), delveTimer(d - 1)]);
    assert.equal(change === null, same, `delveChangeAt disagrees at ${d}`);
    if (change) last = d;
    assert.ok(d - last <= 6, `nothing changes from ${last} to ${d}`);
  }
  // Past that, only the veil slows down once more.
  for (const d of DEPTHS.slice(55)) assert.equal(delveChangeAt(d), d === 75 ? 'knobs' : null, `depth ${d}`);
  assert.equal(delveChangeAt(1), null);
  assert.deepEqual(
    DELVE_STEPS.map((s) => s.from),
    [...DELVE_STEPS.map((s) => s.from)].sort((a, b) => a - b),
  );
  assert.equal(DELVE_STEPS[0].from, 1);
});

test('depths are filed under the preset they play like', () => {
  assert.deepEqual([1, 4, 5, 12, 13, 100].map(delveTier), ['cruel', 'cruel', 'merciless', 'merciless', 'eternal', 'eternal']);
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
  const table: unknown[] = DEPTHS.slice(0, 100).map((d) => [delveRules(d), delveTimer(d), delveTileVeil(d)]);
  // The finds too: where and how often they turn up, what they ask, and what their items do.
  table.push([FINDS, FIND_TIMER, FIND_TILE_VEIL, AZURITE_FAST_MS, FLARE_AT_MS, FLARE_MS, BLAST_OPTIONS, findRules(13), blastRules(40)]);
  const hash = createHash('sha256').update(JSON.stringify(table)).digest('hex').slice(0, 16);
  assert.deepEqual([DELVE_RULESET, PROTOCOL_VERSION, hash], [1, 10, PINNED_HASH]);
});

const PINNED_HASH = 'bfe320bd6647f89f';

function run(losses: Record<string, number[]>, round = 10, seats = Object.keys(losses)): GameState {
  const s = createGame('a');
  s.players = seats.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.round = round;
  s.delve = { entrants: seats, losses, lastStanding: null, ruleset: 1, startedAt: 0, pickBy: null, pickExtended: false, excused: [], graceUntil: 0 };
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

test('standings: deeper falls first, then later earlier losses, equal runs share a rank', () => {
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

test('even under the slowest veil, half the art is in with about 3 s left at the shortest timer', async () => {
  const { veilPace } = await import('../src/lib/patches.ts');
  for (const d of [25, 50, 75, 200]) {
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

test('a veiled picture also has half its patches in with over 3 s left', async () => {
  const { veilPace } = await import('../src/lib/patches.ts');
  for (const d of [25, 50, 75, 200]) {
    const ms = delveTimer(d) * 1000;
    const count = tileVeilSize(delveRules(d).veil!.size) ** 2;
    const { gap, burn } = veilPace(ms * delveRules(d).veil!.share, count);
    // The last picture starts up to half a step late (session.svelte.ts burnVeil).
    const halfIn = 400 + gap / 2 + (count / 2) * gap + burn;
    assert.ok(ms - halfIn >= 3000, `depth ${d}: ${Math.round(ms - halfIn)} ms left with half a picture in`);
  }
});
