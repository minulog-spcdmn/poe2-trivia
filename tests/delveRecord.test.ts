import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELVE_RECORD_KEY,
  RUN_LIMIT,
  addRun,
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
