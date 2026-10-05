import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELVE_RECORD_KEY,
  MAX_COUNT,
  MAX_DEPTH,
  RUN_LIMIT,
  addRun,
  climbOf,
  leftEvent,
  recordLeft,
  bestOf,
  deepestEver,
  emptyRecords,
  loadRecords,
  parseRecords,
  recordRun,
  resetRecords,
  runEvent,
  serializeRecords,
  tallyOf,
  type DelveRun,
} from '../src/lib/delveRecord.ts';
import { createGame, type GameState } from '../src/lib/game.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
beforeEach(() => store.clear());

function run(losses: Record<string, number[]>, over: Partial<GameState> = {}, seats = Object.keys(losses)): GameState {
  const s = createGame('a');
  s.players = seats.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: seats, losses, lastStanding: null, ruleset: 1, startedAt: 500, pickBy: null, pickExtended: false, excused: [], graceUntil: 0 };
  return { ...s, ...over };
}

const r = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, won: false, ruleset: 1, mixed: false, ...o });

test('a run is recorded when this player falls, not before, and once', () => {
  const standing = run({ a: [2, 5] });
  const fallen = run({ a: [2, 5, 9] });
  assert.equal(runEvent(null, standing, 'a'), null);
  const e = runEvent(standing, fallen, 'a')!;
  assert.deepEqual([e.id, e.depth, e.players, e.won, e.ruleset], [500, 9, 1, false, 1]);
  assert.equal(runEvent(fallen, { ...fallen, version: 9 }, 'a'), null, 'not again for the same fall');
  assert.equal(runEvent(standing, fallen, 'someone else'), null);
  assert.equal(runEvent(standing, fallen, null), null);
});

test('in a group, the winner is recorded again at the end, as having won', () => {
  const prev = run({ a: [1, 2, 7], b: [3, 4, 7] });
  const over = { ...prev, phase: 'over' as const, winners: ['b'] };
  const e = runEvent(prev, over, 'b')!;
  assert.equal(e.won, true);
  assert.equal(e.players, 2);
  assert.equal(runEvent(prev, over, 'a'), null, 'the loser was recorded when they fell');
});

test('bests are kept per ruleset, alone and together apart; older rules and mixed runs never count', () => {
  let rec = emptyRecords();
  let out = addRun(rec, r({ id: 1, depth: 12 }));
  assert.deepEqual([out.previousBest, out.best], [null, true]);
  rec = out.records;
  out = addRun(rec, r({ id: 2, depth: 9 }));
  assert.deepEqual([out.previousBest, out.best], [12, false]);
  rec = out.records;
  out = addRun(rec, r({ id: 3, depth: 20 }));
  assert.deepEqual([out.previousBest, out.best], [12, true]);
  rec = out.records;
  rec = addRun(rec, r({ id: 4, depth: 40, players: 4 })).records;
  rec = addRun(rec, r({ id: 5, depth: 99, mixed: true })).records;
  rec = addRun(rec, r({ id: 6, depth: 70, ruleset: 2 })).records;
  assert.equal(bestOf(rec, true)!.depth, 20);
  assert.equal(bestOf(rec, false)!.depth, 40);
  assert.equal(bestOf(rec, true, 2)!.depth, 70);
  // The same run recorded again (its win) replaces itself.
  rec = addRun(rec, r({ id: 4, depth: 40, players: 4, won: true })).records;
  assert.equal(rec.runs.filter((x) => x.id === 4).length, 1);
  assert.equal(bestOf(rec, false)!.won, true);
});

test('the list keeps the last runs, and the bests outlive it', () => {
  let rec = emptyRecords();
  rec = addRun(rec, r({ id: 0, at: 0, depth: 50 })).records;
  for (let i = 1; i <= RUN_LIMIT + 5; i++) rec = addRun(rec, r({ id: i, at: i, depth: 5 })).records;
  assert.equal(rec.runs.length, RUN_LIMIT);
  assert.ok(!rec.runs.some((x) => x.id === 0));
  assert.equal(bestOf(rec, true)!.depth, 50);
});

test('stored records round-trip, and anything malformed is dropped', () => {
  const rec = addRun(emptyRecords(), r({ id: 7, depth: 33 })).records;
  assert.deepEqual(parseRecords(serializeRecords(rec)), rec);
  assert.equal(parseRecords('not json'), null);
  assert.equal(parseRecords(JSON.stringify({ v: 99, runs: [] })), null);
  const odd = parseRecords(JSON.stringify({ v: 1, runs: [{ id: 'x' }, r({ depth: 0 }), r({ id: 8 })], bests: { nonsense: r({}), '1:solo': r({ mixed: true }) } }))!;
  assert.deepEqual(odd.runs.map((x) => x.id), [8]);
  assert.deepEqual(odd.bests, {});
});

test('recording goes through localStorage, and erasing clears it', () => {
  assert.deepEqual(recordRun(r({ id: 1, depth: 14 })), { previousBest: null, best: true });
  assert.deepEqual(recordRun(r({ id: 2, depth: 11 })), { previousBest: 14, best: false });
  assert.equal(loadRecords().runs.length, 2);
  assert.ok(store.has(DELVE_RECORD_KEY));
  resetRecords();
  assert.deepEqual(loadRecords(), emptyRecords());
});

// ---- the fuller record: tallies, where lives went, the frontier ------------

test('a run keeps where each life was lost', () => {
  const standing = run({ a: [2, 5] });
  const fallen = run({ a: [2, 5, 9] });
  assert.deepEqual(runEvent(standing, fallen, 'a')!.losses, [2, 5, 9]);
});

test('tallies count every run once, however often it is recorded, and outlive the list', () => {
  let rec = emptyRecords();
  rec = addRun(rec, r({ id: 1, at: 1, depth: 9, losses: [2, 5, 9] })).records;
  rec = addRun(rec, r({ id: 2, at: 2, depth: 9, losses: [9, 9, 9] })).records;
  rec = addRun(rec, r({ id: 3, at: 3, depth: 14, players: 3, losses: [4, 14, 14] })).records;
  // The group run again, now won: it replaces what it counted.
  rec = addRun(rec, r({ id: 3, at: 4, depth: 14, players: 3, won: true, losses: [4, 14, 14] })).records;
  // Mixed runs never count, as they never count as bests.
  rec = addRun(rec, r({ id: 4, at: 5, depth: 60, mixed: true })).records;
  assert.deepEqual(tallyOf(rec, true), { wins: 0, ends: { 9: 2 }, lost: { 2: 1, 5: 1, 9: 2 } });
  assert.deepEqual(tallyOf(rec, false), { wins: 1, ends: { 14: 1 }, lost: { 4: 1, 14: 1 } });
  for (let i = 10; i < 10 + RUN_LIMIT; i++) rec = addRun(rec, r({ id: i, at: i, depth: 3 })).records;
  assert.equal(tallyOf(rec, true).ends[9], 2, 'runs gone from the list still count');
  assert.equal(tallyOf(rec, true).ends[3], RUN_LIMIT);
});

test('the frontier marks each new deepest, under any rules', () => {
  let rec = emptyRecords();
  assert.equal(deepestEver(rec), 0);
  for (const [id, depth, mixed] of [[1, 8, false], [2, 5, false], [3, 12, true], [4, 12, false], [5, 20, false]] as const)
    rec = addRun(rec, r({ id, at: id * 10, depth, mixed })).records;
  assert.deepEqual(rec.frontier, [
    { depth: 8, at: 10 },
    { depth: 12, at: 30 },
    { depth: 20, at: 50 },
  ]);
  assert.equal(deepestEver(rec), 20);
});

test('records stored before tallies, losses and the frontier are read whole, bests and all', () => {
  // As a build before them wrote it: a best older than the list, and runs without losses.
  const old = {
    v: 1,
    runs: [r({ id: 5, at: 50, depth: 7 }), r({ id: 6, at: 60, depth: 11, players: 2, won: true }), r({ id: 7, at: 70, depth: 4, mixed: true })],
    bests: { '1:solo': r({ id: 1, at: 10, depth: 23 }), '1:group': r({ id: 6, at: 60, depth: 11, players: 2, won: true }) },
  };
  const rec = parseRecords(JSON.stringify(old))!;
  assert.equal(bestOf(rec, true)!.depth, 23);
  assert.equal(bestOf(rec, false)!.depth, 11);
  assert.deepEqual(tallyOf(rec, true), { wins: 0, ends: { 23: 1, 7: 1 }, lost: {} });
  assert.deepEqual(tallyOf(rec, false), { wins: 1, ends: { 11: 1 }, lost: {} });
  assert.deepEqual(rec.frontier, [{ depth: 23, at: 10 }]);
  assert.equal(rec.runs[0].losses, undefined);
  // Written back, it reads the same; and a new run adds to what was counted.
  assert.deepEqual(parseRecords(serializeRecords(rec)), rec);
  const next = addRun(rec, r({ id: 8, at: 80, depth: 30, losses: [3, 20, 30] })).records;
  assert.deepEqual(tallyOf(next, true).ends, { 7: 1, 23: 1, 30: 1 });
  assert.equal(deepestEver(next), 30);
});

test('a frontier that missed a run (an older build wrote it) is made whole again', () => {
  const rec = parseRecords(JSON.stringify({ v: 1, runs: [r({ id: 2, at: 20, depth: 31 })], bests: {}, tallies: {}, frontier: [{ depth: 12, at: 5 }] }))!;
  assert.deepEqual(rec.frontier, [
    { depth: 12, at: 5 },
    { depth: 31, at: 20 },
  ]);
});

test('new fields that make no sense are dropped, the rest kept', () => {
  const rec = parseRecords(
    JSON.stringify({
      v: 1,
      runs: [
        r({ id: 1, depth: 9, losses: [2, 5, 9] }),
        r({ id: 2, depth: 9, losses: [5, 2, 9] }),
        r({ id: 3, depth: 9, losses: [2, 5, 8] }),
        r({ id: 4, depth: 9, losses: [1, 2, 3, 9] }),
        { ...r({ id: 5, depth: 9 }), losses: 'x' },
      ],
      bests: {},
      tallies: { '1:solo': { wins: 5, ends: { 9: 2, x: 1, 0: 4, 3: -1 }, lost: { 2: 1.5, 4: 1 } }, junk: { wins: 0, ends: {}, lost: {} } },
      frontier: [{ depth: 9, at: 1 }, { depth: 3, at: 2 }, 'x'],
    }),
  )!;
  assert.deepEqual(rec.runs.map((x) => x.losses), [[2, 5, 9], undefined, undefined, undefined, undefined]);
  assert.deepEqual(rec.tallies, { '1:solo': { wins: 2, ends: { 9: 2 }, lost: { 4: 1 } } });
  assert.deepEqual(rec.frontier, [{ depth: 9, at: 1 }]);
});

// ---- whose run, runs left standing, and what can't be true -------------------

test('two players of one browser in the same room keep a run each', () => {
  const fallen = run({ a: [2, 5, 9], b: [3, 4, 6] });
  const ra = runEvent(run({ a: [2, 5], b: [3, 4, 6] }), fallen, 'a')!;
  const rb = runEvent(run({ a: [2, 5], b: [3, 4] }), run({ a: [2, 5], b: [3, 4, 6] }), 'b')!;
  assert.deepEqual([ra.who, rb.who], ['a', 'b']);
  let rec = addRun(emptyRecords(), ra).records;
  rec = addRun(rec, rb).records;
  assert.equal(rec.runs.length, 2);
  assert.deepEqual(tallyOf(rec, false).ends, { 6: 1, 9: 1 });
});

test('a group win is the same run: it keeps when it fell and counts once', () => {
  let rec = addRun(emptyRecords(), r({ id: 3, at: 100, depth: 14, players: 3, who: 'a', losses: [4, 14, 14] })).records;
  rec = addRun(rec, r({ id: 3, at: 900, depth: 14, players: 3, who: 'a', won: true, losses: [4, 14, 14] })).records;
  assert.equal(rec.runs.length, 1);
  assert.equal(rec.runs[0].at, 100);
  assert.equal(rec.runs[0].won, true);
  assert.deepEqual(tallyOf(rec, false), { wins: 1, ends: { 14: 1 }, lost: { 4: 1, 14: 1 } });
});

test('hot-seat with several players: the group run is recorded once, at its end, as deep as its deepest', () => {
  const prev = run({ a: [1, 2, 7], b: [3, 4] });
  const over = { ...run({ a: [1, 2, 7], b: [3, 4, 9] }), phase: 'over' as const, winners: ['b'] };
  assert.equal(runEvent(run({ a: [1, 2], b: [3] }), prev, null, true), null, 'not as one of them falls');
  const e = runEvent(prev, over, null, true)!;
  assert.deepEqual([e.depth, e.players, e.won, e.hot, e.who, e.losses], [9, 2, false, true, undefined, [3, 4, 9]]);
  assert.equal(runEvent(over, { ...over, version: 9 }, null, true), null, 'once');
  // Alone on the device: theirs, at their fall.
  const solo = runEvent(run({ a: [1, 2] }), run({ a: [1, 2, 5] }), null, true)!;
  assert.deepEqual([solo.depth, solo.players, solo.hot], [5, 1, undefined]);
});

test('a run left standing is recorded as left, never a best, and its fall replaces it', () => {
  const standing = run({ a: [3, 8] }, { round: 12 });
  assert.equal(leftEvent(run({ a: [] }, { phase: 'lobby' }), 'a'), null);
  assert.equal(leftEvent(run({ a: [3, 8, 11] }, { round: 12 }), 'a'), null, 'already fell');
  assert.equal(leftEvent(standing, 'someone else'), null);
  const left = leftEvent(standing, 'a')!;
  assert.deepEqual([left.depth, left.left, left.losses, left.who], [12, true, [3, 8], 'a']);
  let out = addRun(emptyRecords(), left);
  assert.equal(out.best, false);
  assert.equal(bestOf(out.records, true), null);
  assert.deepEqual(tallyOf(out.records, true), { wins: 0, ends: {}, lost: { 3: 1, 8: 1 }, left: { 12: 1 } });
  assert.equal(deepestEver(out.records), 12, 'it did get that deep');
  // It goes on after all (a rejoin) and falls: the fall replaces it.
  out = addRun(out.records, { ...left, left: undefined, depth: 15, losses: [3, 8, 15] });
  assert.equal(out.records.runs.length, 1);
  assert.equal(out.best, true);
  assert.deepEqual(tallyOf(out.records, true), { wins: 0, ends: { 15: 1 }, lost: { 3: 1, 8: 1 } });
  // Through storage, and round-tripped.
  recordLeft(standing, 'a');
  assert.equal(loadRecords().runs[0].left, true);
  assert.deepEqual(parseRecords(serializeRecords(loadRecords())), loadRecords());
  // Hot-seat group left mid-run: the group's.
  const hot = leftEvent(run({ a: [1, 2, 4], b: [5] }, { round: 7 }), null, true)!;
  assert.deepEqual([hot.depth, hot.hot, hot.losses], [7, true, [5]]);
});

test('each best is kept as a climb, rebuilt for records written before it was', () => {
  let rec = emptyRecords();
  for (const [id, depth] of [[1, 8], [2, 5], [3, 12], [4, 12], [5, 20]] as const) rec = addRun(rec, r({ id, at: id * 10, depth })).records;
  rec = addRun(rec, r({ id: 6, at: 60, depth: 30, mixed: true })).records;
  assert.deepEqual(climbOf(rec, true), [
    { depth: 8, at: 10 },
    { depth: 12, at: 30 },
    { depth: 20, at: 50 },
  ]);
  const old = parseRecords(JSON.stringify({ v: 1, runs: [r({ id: 5, at: 50, depth: 7 }), r({ id: 6, at: 60, depth: 11 })], bests: { '1:solo': r({ id: 1, at: 10, depth: 23 }) } }))!;
  assert.deepEqual(climbOf(old, true), [{ depth: 23, at: 10 }]);
  // Never past the best, never a step that doesn't go deeper.
  const odd = parseRecords(
    JSON.stringify({ v: 1, runs: [], bests: { '1:solo': r({ id: 1, at: 10, depth: 23 }) }, climbs: { '1:solo': [{ depth: 30, at: 5 }, { depth: 9, at: 1 }, { depth: 4, at: 2 }], nonsense: [] } }),
  )!;
  assert.deepEqual(odd.climbs, { '1:solo': [{ depth: 9, at: 1 }, { depth: 23, at: 10 }] });
});

test('depths and counts no run could reach are dropped or capped, so nothing is endless', () => {
  const rec = parseRecords(
    JSON.stringify({
      v: 1,
      runs: [r({ id: 1, depth: MAX_DEPTH + 1 }), r({ id: 2, depth: 20000, losses: [19990, 19995, 20000] }), r({ id: 3, depth: MAX_DEPTH })],
      bests: { '1:solo': r({ id: 2, depth: 1e6 }) },
      tallies: { '1:solo': { wins: 0, ends: { 5: Number.MAX_SAFE_INTEGER, 20000: 1 }, lost: { 4: 2e9 }, left: { 3: 1e12 } } },
      frontier: [{ depth: 1e6, at: 1 }],
    }),
  )!;
  assert.deepEqual(rec.runs.map((x) => x.id), [3]);
  assert.deepEqual(rec.bests, {});
  assert.deepEqual(rec.tallies['1:solo'], { wins: 0, ends: { 5: MAX_COUNT }, lost: { 4: MAX_COUNT }, left: { 3: MAX_COUNT } });
  assert.equal(deepestEver(rec), MAX_DEPTH);
  // A run from the game deeper than that is held at it.
  assert.equal(runEvent(run({ a: [2, 5] }), run({ a: [2, 5, 5000] }), 'a')!.depth, MAX_DEPTH);
});
