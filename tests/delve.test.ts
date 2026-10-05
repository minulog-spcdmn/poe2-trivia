import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  DELVE_MAX_LOCKOUT,
  DELVE_RULESET,
  compareDelvers,
  delveLockout,
  delveRules,
  delveStandings,
  delveStratum,
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
    assert.equal(r.veil, null);
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
    assert.ok(Number.isInteger(delveTimer(d)) && delveTimer(d) >= 5 && delveTimer(d) <= 20);
    assert.ok(delveLockout(d) >= 2 && delveLockout(d) <= DELVE_MAX_LOCKOUT);
  }
  assert.equal(delveTimer(1), 20);
  assert.equal(delveTimer(61), 5);
  assert.equal(delveTimer(1000), 5);
  assert.equal(delveLockout(41), DELVE_MAX_LOCKOUT);
});

test('the rules change at the first depth of each stratum, every four depths', () => {
  const same = (a: number, b: number) => JSON.stringify(delveRules(a)) === JSON.stringify(delveRules(b)) && delveTimer(a) === delveTimer(b);
  for (const d of DEPTHS.slice(1)) {
    if ((d - 1) % 4 === 0 && d <= 61) assert.ok(!same(d - 1, d), `nothing changes at ${d}`);
    if ((d - 1) % 4 !== 0) assert.ok(same(d - 1, d), `rules change mid-stratum at ${d}`);
  }
  assert.deepEqual([1, 4, 5, 8, 9].map(delveStratum), [1, 1, 2, 2, 3]);
});

test('depths are filed under the preset they play like', () => {
  assert.deepEqual([1, 12, 13, 24, 25, 100].map(delveTier), ['cruel', 'cruel', 'merciless', 'merciless', 'eternal', 'eternal']);
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
  const table = DEPTHS.slice(0, 100).map((d) => [delveRules(d), delveTimer(d)]);
  const hash = createHash('sha256').update(JSON.stringify(table)).digest('hex').slice(0, 16);
  assert.deepEqual([DELVE_RULESET, PROTOCOL_VERSION, hash], [1, 10, PINNED_HASH]);
});

const PINNED_HASH = '11e513ec71a9e5e0';

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
