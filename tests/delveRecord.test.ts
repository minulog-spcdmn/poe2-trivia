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
  measure,
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
import { createGame, type GameState, type Revive } from '../src/lib/game.ts';
import { storeKey } from '../src/lib/storage.ts';

const store = new Map<string, string>();
/** Writes longer than this don't fit (storage nearly full); Infinity for room enough. */
let room = Infinity;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (v.length > room) throw new Error('QuotaExceededError');
    store.set(k, String(v));
  },
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
beforeEach(() => {
  store.clear();
  room = Infinity;
});

function run(losses: Record<string, number[]>, over: Partial<GameState> = {}, seats = Object.keys(losses), revives: Revive[] = []): GameState {
  const s = createGame('a');
  s.players = seats.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: seats, losses, ruleset: 1, startedAt: 500, excused: [], graceUntil: 0, ...(revives.length ? { revives } : {}) };
  return { ...s, ...over };
}

const r = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, ruleset: 1, mixed: false, ...o });
/** A run together, as this player had it. */
const t = (o: Partial<DelveRun>): DelveRun => r({ players: 3, perished: [], ...o });
/** A revive: `by` gave `to`, who perished at `fell`, a life at depth `depth`. */
const rv = (by: string, to: string, fell: number, depth = fell): Revive => ({ by, to, fell, depth, at: depth });

test('alone, a run is recorded when its player falls, not before, and once', () => {
  const standing = run({ a: [2, 5] });
  const fallen = run({ a: [2, 5, 9] });
  assert.equal(runEvent(null, standing, 'a'), null);
  const e = runEvent(standing, fallen, 'a')!;
  assert.deepEqual([e.id, e.depth, e.players, e.ruleset, e.who, e.losses], [500, 9, 1, 1, 'a', [2, 5, 9]]);
  assert.equal('won' in e, false, 'no winners any more');
  assert.equal(runEvent(fallen, { ...fallen, version: 9 }, 'a'), null, 'not again for the same fall');
  assert.equal(runEvent(standing, fallen, 'someone else'), null);
  assert.equal(runEvent(standing, fallen, null), null);
  // On one device: its one player's, without `who`.
  const own = runEvent(standing, fallen, null, true)!;
  assert.deepEqual([own.depth, own.who], [9, undefined]);
});

// ---- together ----------------------------------------------------------------

/**
 * Two delvers: a perishes at 9, b brings them back, a perishes again at 12,
 * then b falls at 15 and nobody stands.
 */
function coop() {
  const back = [rv('b', 'a', 9)];
  return {
    start: run({ a: [2, 5], b: [] }),
    perished: run({ a: [2, 5, 9], b: [] }, { phase: 'reveal', round: 9 }),
    revived: run({ a: [2, 5, 9], b: [] }, { round: 10 }, ['a', 'b'], back),
    again: run({ a: [2, 5, 9, 12], b: [] }, { phase: 'reveal', round: 12 }, ['a', 'b'], back),
    last: run({ a: [2, 5, 9, 12], b: [14, 15] }, { phase: 'reveal', round: 15 }, ['a', 'b'], back),
    over: run({ a: [2, 5, 9, 12], b: [14, 15] }, { phase: 'over', round: 15 }, ['a', 'b'], back),
  };
}

test('together, nothing is recorded as a player perishes, is brought back or perishes again: once, at the end, at the team\'s depth', () => {
  const c = coop();
  const steps = [c.start, c.perished, c.revived, c.again, c.last];
  for (let i = 1; i < steps.length; i++) for (const me of ['a', 'b']) assert.equal(runEvent(steps[i - 1], steps[i], me), null, `step ${i} for ${me}`);
  const a = runEvent(c.last, c.over, 'a')!;
  assert.deepEqual(
    { depth: a.depth, players: a.players, losses: a.losses, perished: a.perished, given: a.given, revived: a.revived, who: a.who, left: a.left },
    { depth: 15, players: 2, losses: [2, 5, 9, 12], perished: [9, 12], given: undefined, revived: 1, who: 'a', left: undefined },
  );
  const b = runEvent(c.last, c.over, 'b')!;
  assert.deepEqual([b.depth, b.perished, b.given, b.revived], [15, [15], 1, undefined]);
  assert.equal(runEvent(c.over, { ...c.over, version: 9 }, 'a'), null, 'once');
  // Recorded once each: a run together, never a best alone.
  let rec = addRun(emptyRecords(), a).records;
  rec = addRun(rec, b).records;
  assert.equal(rec.runs.length, 2);
  assert.equal(bestOf(rec, true), null);
  assert.equal(bestOf(rec, false)!.depth, 15);
  assert.deepEqual(tallyOf(rec, false), {
    ends: { 15: 2 },
    lost: { 2: 1, 5: 1, 9: 1, 12: 1, 14: 1, 15: 1 },
    perished: { 9: 1, 12: 1, 15: 1 },
    given: 1,
    revived: 1,
  });
  // A reload into the end records it again: nothing changes.
  const again = addRun(rec, runEvent(null, c.over, 'a')!);
  assert.equal(again.records, rec);
  assert.deepEqual([again.best, again.previousBest], [true, null]);
});

test('together, leaving before the end is provisional (standing or perished), and the end replaces it', () => {
  const c = coop();
  const standing = leftEvent(c.start, 'a')!;
  assert.deepEqual([standing.left, standing.depth, standing.perished], [true, c.start.round, []]);
  const down = leftEvent(c.perished, 'a')!;
  assert.deepEqual([down.left, down.depth, down.perished], [true, 9, [9]], 'perished, but a teammate may still bring them back');
  // Nobody stands: the run is over, whatever the phase says.
  const end = leftEvent(c.last, 'a')!;
  assert.deepEqual([end.left, end.depth], [undefined, 15]);
  assert.equal(leftEvent(c.over, 'a'), null);

  let out = addRun(emptyRecords(), { ...down, at: 10 });
  assert.equal(out.best, false);
  assert.equal(bestOf(out.records, false), null, 'a run left is never a best');
  assert.deepEqual(tallyOf(out.records, false), { ends: {}, lost: { 2: 1, 5: 1, 9: 1 }, left: { 9: 1 }, perished: { 9: 1 } });
  // The end replaces it, counted once.
  out = addRun(out.records, { ...runEvent(c.last, c.over, 'a')!, at: 20 });
  assert.equal(out.records.runs.length, 1);
  assert.deepEqual([out.best, out.previousBest], [true, null]);
  assert.deepEqual(tallyOf(out.records, false), { ends: { 15: 1 }, lost: { 2: 1, 5: 1, 9: 1, 12: 1 }, perished: { 9: 1, 12: 1 }, revived: 1 });
  // A later leave (the tab closing on the end screen's way out) never replaces the end.
  const late = addRun(out.records, { ...down, at: 30 });
  assert.equal(late.records, out.records);
  // Through storage: pagehide, then the end.
  recordLeft(c.perished, 'a');
  assert.equal(loadRecords().runs[0].left, true);
  assert.deepEqual(recordRun(runEvent(c.last, c.over, 'a')!), { previousBest: null, best: true });
  assert.deepEqual(loadRecords().runs.map((x) => [x.left, x.depth]), [[undefined, 15]]);
  recordLeft(c.over, 'a');
  assert.equal(loadRecords().runs.length, 1);
});

test('two players of one browser in the same run keep a run each', () => {
  const c = coop();
  const ra = runEvent(c.last, c.over, 'a')!;
  const rb = runEvent(c.last, c.over, 'b')!;
  assert.deepEqual([ra.who, rb.who], ['a', 'b']);
  let rec = addRun(emptyRecords(), ra).records;
  rec = addRun(rec, rb).records;
  assert.equal(rec.runs.length, 2);
  assert.deepEqual(tallyOf(rec, false).ends, { 15: 2 });
});

test('a player brought back can lose more than three lives: such runs are read back whole', () => {
  const run7 = t({ id: 7, depth: 30, losses: [3, 8, 8, 12, 20, 25, 30], perished: [8, 20, 30], revived: 2, given: 1 });
  const rec = addRun(emptyRecords(), run7).records;
  const back = parseRecords(serializeRecords(rec))!;
  assert.deepEqual(back, rec);
  assert.deepEqual(back.runs[0].losses, [3, 8, 8, 12, 20, 25, 30]);
  // Still nothing that can't be: alone three at most, together two a depth at most, never deeper than the run.
  const odd = parseRecords(
    JSON.stringify({
      v: 1,
      runs: [
        r({ id: 1, depth: 9, losses: [1, 2, 3, 9] }),
        t({ id: 2, depth: 2, losses: [1, 1, 2, 2, 2] }),
        t({ id: 3, depth: 9, losses: [3, 12] }),
        t({ id: 4, depth: 9, losses: [3, 5], perished: [5, 7, 9], revived: 5 }),
      ],
    }),
  )!;
  assert.deepEqual(
    odd.runs.map((x) => [x.losses, x.perished, x.revived]),
    [
      [undefined, undefined, undefined],
      [undefined, [], undefined],
      [undefined, [], undefined],
      [[3, 5], [], undefined],
    ],
  );
});

test('group runs from before co-op are dropped as the records are read, solo kept', () => {
  const old = {
    v: 1,
    runs: [
      { ...r({ id: 5, at: 50, depth: 7 }), won: false },
      { ...r({ id: 6, at: 60, depth: 11, players: 2 }), won: true },
      { ...r({ id: 8, at: 80, depth: 13, players: 3 }), won: false, hot: true },
      t({ id: 9, at: 90, depth: 20 }),
    ],
    bests: { '1:solo': { ...r({ id: 5, at: 50, depth: 7 }), won: false }, '1:group': { ...r({ id: 6, at: 60, depth: 11, players: 2 }), won: true } },
    climbs: { '1:solo': [{ depth: 7, at: 50 }], '1:group': [{ depth: 11, at: 60 }] },
    tallies: { '1:solo': { wins: 0, ends: { 7: 1 }, lost: {} }, '1:group': { wins: 1, ends: { 11: 1 }, lost: {} } },
    frontier: [{ depth: 7, at: 50 }, { depth: 11, at: 60 }, { depth: 13, at: 80 }, { depth: 20, at: 90 }],
  };
  const rec = parseRecords(JSON.stringify(old))!;
  assert.deepEqual(rec.frontier, [{ depth: 7, at: 50 }, { depth: 20, at: 90 }], 'nor the group runs\' steps deeper');
  assert.deepEqual(rec.runs.map((x) => x.id), [5, 9]);
  assert.deepEqual(Object.keys(rec.bests), ['1:solo']);
  assert.deepEqual(Object.keys(rec.tallies), ['1:solo']);
  assert.deepEqual(rec.tallies['1:solo'], { ends: { 7: 1 }, lost: {} }, 'wins are gone');
  assert.deepEqual(Object.keys(rec.climbs), ['1:solo']);
  // The first run together after them is the first.
  const next = addRun(rec, t({ id: 10, at: 100, depth: 9 }));
  assert.deepEqual([next.best, next.previousBest, bestOf(next.records, false)!.id], [true, null, 10]);
});

test('bests are kept per ruleset, alone and together apart; older rules and mixed runs never count', () => {
  let rec = emptyRecords();
  let out = addRun(rec, r({ id: 1, at: 1, depth: 12 }));
  assert.deepEqual([out.previousBest, out.best], [null, true]);
  rec = out.records;
  out = addRun(rec, r({ id: 2, at: 2, depth: 9 }));
  assert.deepEqual([out.previousBest, out.best], [12, false]);
  rec = out.records;
  out = addRun(rec, r({ id: 3, at: 3, depth: 20 }));
  assert.deepEqual([out.previousBest, out.best], [12, true]);
  rec = out.records;
  out = addRun(rec, t({ id: 4, at: 4, depth: 40 }));
  assert.deepEqual([out.previousBest, out.best], [null, true], 'the first run together is measured against none alone');
  rec = out.records;
  rec = addRun(rec, r({ id: 5, at: 5, depth: 99, mixed: true })).records;
  rec = addRun(rec, r({ id: 6, at: 6, depth: 70, ruleset: 2 })).records;
  assert.equal(bestOf(rec, true)!.depth, 20);
  assert.equal(bestOf(rec, false)!.depth, 40);
  assert.equal(bestOf(rec, true, 2)!.depth, 70);
});

test('reloading the end screen after a new best measures it against the best before it, not itself', () => {
  let rec = addRun(emptyRecords(), r({ id: 1, at: 1, depth: 12 })).records;
  const deeper = r({ id: 2, at: 2, depth: 20 });
  const first = addRun(rec, deeper);
  assert.deepEqual([first.best, first.previousBest], [true, 12]);
  rec = first.records;
  // The reload records it again, with a later time: the same answer.
  const reload = addRun(rec, { ...deeper, at: 99 });
  assert.equal(reload.records, rec);
  assert.deepEqual([reload.best, reload.previousBest], [true, 12]);
  // Through storage too, and after a later run.
  store.set(DELVE_RECORD_KEY, serializeRecords(addRun(rec, r({ id: 3, at: 3, depth: 8 })).records));
  assert.deepEqual(recordRun({ ...deeper, at: 120 }), { previousBest: 12, best: true });
  assert.deepEqual(recordRun(r({ id: 3, at: 130, depth: 8 })), { previousBest: 20, best: false });
  // The very first descent stays the first.
  assert.deepEqual(measure(rec, rec.runs[0]), { previousBest: null, best: true });
});

test('a finished run recorded again after a change of rules (a reload marks it mixed) stays counted', () => {
  let rec = addRun(emptyRecords(), r({ id: 1, at: 1, depth: 14, losses: [3, 9, 14] })).records;
  rec = addRun(rec, r({ id: 2, at: 2, depth: 9, losses: [2, 5, 9] })).records;
  const reload = addRun(rec, r({ id: 2, at: 50, depth: 9, losses: [2, 5, 9], mixed: true }));
  assert.equal(reload.records, rec, 'the run\'s own rules decide');
  assert.deepEqual(tallyOf(reload.records, true).ends, { 9: 1, 14: 1 });
  assert.deepEqual([reload.best, reload.previousBest], [false, 14]);
  // Together too.
  const team = addRun(rec, t({ id: 3, at: 3, depth: 30 })).records;
  assert.equal(addRun(team, t({ id: 3, at: 60, depth: 30, mixed: true })).records, team);
  // But a run left, then finished under newer rules, counts as mixed: never a best.
  const left = addRun(emptyRecords(), r({ id: 4, at: 4, depth: 6, losses: [5], left: true })).records;
  const mixed = addRun(left, r({ id: 4, at: 5, depth: 8, losses: [5, 7, 8], mixed: true })).records;
  assert.deepEqual([bestOf(mixed, true), tallyOf(mixed, true)], [null, { ends: {}, lost: {} }]);
});

test('the list keeps the last runs, and the bests outlive it', () => {
  let rec = emptyRecords();
  rec = addRun(rec, r({ id: 0, at: 0, depth: 50 })).records;
  for (let i = 1; i <= RUN_LIMIT + 5; i++) rec = addRun(rec, r({ id: i, at: i, depth: 5 })).records;
  assert.equal(rec.runs.length, RUN_LIMIT);
  assert.ok(!rec.runs.some((x) => x.id === 0));
  assert.equal(bestOf(rec, true)!.depth, 50);
  // A best gone from the list is still the same run when it comes again.
  assert.equal(addRun(rec, r({ id: 0, at: 500, depth: 50 })).records, rec);
});

test('stored records round-trip, and anything malformed is dropped', () => {
  const rec = addRun(addRun(emptyRecords(), r({ id: 7, depth: 33, wards: 2 })).records, t({ id: 8, at: 2, depth: 20, losses: [4], perished: [], given: 2 })).records;
  assert.deepEqual(parseRecords(serializeRecords(rec)), rec);
  assert.equal(parseRecords('not json'), null);
  assert.equal(parseRecords(JSON.stringify({ v: 99, runs: [] })), null);
  const odd = parseRecords(JSON.stringify({ v: 1, runs: [{ id: 'x' }, r({ depth: 0 }), r({ id: 8 })], bests: { nonsense: r({}), '1:solo': r({ mixed: true }) } }))!;
  assert.deepEqual(odd.runs.map((x) => x.id), [8]);
  assert.deepEqual(odd.bests, {});
});

test('recording goes through localStorage, and erasing clears it', () => {
  assert.deepEqual(recordRun(r({ id: 1, at: 1, depth: 14 })), { previousBest: null, best: true });
  assert.deepEqual(recordRun(r({ id: 2, at: 2, depth: 11 })), { previousBest: 14, best: false });
  assert.equal(loadRecords().runs.length, 2);
  assert.ok(store.has(DELVE_RECORD_KEY));
  resetRecords();
  assert.deepEqual(loadRecords(), emptyRecords());
});

test('records this build can\'t read are never written over: a newer build\'s are left alone, damaged ones kept aside', () => {
  const newer = JSON.stringify({ v: 3, runs: [], shape: 'unknown' });
  store.set(DELVE_RECORD_KEY, newer);
  assert.deepEqual(loadRecords(), emptyRecords(), 'read as nothing');
  assert.equal(recordRun(r({ id: 1, depth: 14 })), null, 'not stored');
  recordLeft(run({ a: [3] }, { round: 5 }), 'a');
  assert.equal(store.get(DELVE_RECORD_KEY), newer, 'untouched');

  store.clear();
  store.set(DELVE_RECORD_KEY, '{"v":1,"runs":[');
  assert.deepEqual(recordRun(r({ id: 1, depth: 14 })), { previousBest: null, best: true });
  const aside = [...store.keys()].filter((k) => k.includes('.unread'));
  assert.deepEqual(aside, [`${DELVE_RECORD_KEY}.unread`]);
  assert.equal(store.get(aside[0]), '{"v":1,"runs":[', 'kept as it was');
  assert.equal(loadRecords().runs.length, 1);
});

// ---- where they are kept ------------------------------------------------------

const LEGACY_KEY = storeKey('delve');
/** Version 1, as builds before the rename kept it (`:together`, under the old name). */
const v1 = (rec: ReturnType<typeof emptyRecords>) => JSON.stringify({ ...JSON.parse(serializeRecords(rec)), v: 1 });

test('the records live under a new name, at version 2: started from the old name\'s version 1, which is never written again', () => {
  assert.notEqual(DELVE_RECORD_KEY, LEGACY_KEY);
  let rec = addRun(emptyRecords(), t({ id: 1, at: 1, depth: 20, losses: [3, 9, 20], perished: [9, 20], revived: 1 })).records;
  rec = addRun(rec, r({ id: 2, at: 2, depth: 6, losses: [1, 2, 6] })).records;
  const old = v1(rec);
  store.set(LEGACY_KEY, old);
  assert.deepEqual(loadRecords(), rec, 'version 1 read as it was');
  recordRun(r({ id: 3, at: 3, depth: 8, losses: [1, 2, 8] }));
  assert.equal(store.get(LEGACY_KEY), old, 'the old name left as it was');
  assert.equal(JSON.parse(store.get(DELVE_RECORD_KEY)!).v, 2);
  // A build from before (no version check of its own) still open in a tab records a run alone:
  // it reads the old name, drops what it doesn't know (`:together`) and writes back there.
  store.set(LEGACY_KEY, JSON.stringify({ v: 1, runs: [{ ...r({ id: 4, at: 4, depth: 5 }), won: false }], bests: {}, tallies: {} }));
  const now = loadRecords();
  assert.deepEqual([now.runs.map((x) => x.id), bestOf(now, false)?.depth, tallyOf(now, false).ends], [[1, 2, 3], 20, { 20: 1 }], 'nothing together lost');
});

test('version 2 under the new name, version 1 too; a newer one is left alone', () => {
  const rec = addRun(emptyRecords(), t({ id: 1, at: 1, depth: 20, perished: [20] })).records;
  assert.deepEqual(parseRecords(serializeRecords(rec)), rec);
  assert.deepEqual(parseRecords(v1(rec)), rec);
  const newer = JSON.stringify({ ...JSON.parse(serializeRecords(rec)), v: 3 });
  assert.equal(parseRecords(newer), null);
  store.set(DELVE_RECORD_KEY, newer);
  assert.equal(recordRun(r({ id: 2, at: 2, depth: 4 })), null);
  assert.equal(store.get(DELVE_RECORD_KEY), newer);
  assert.equal([...store.keys()].some((k) => k.includes('.unread')), false, 'never kept aside: it is whole');
});

test('reset erases the records, the old name\'s and the copies kept aside, and never takes up the old name again', () => {
  recordRun(r({ id: 1, at: 1, depth: 14 }));
  store.set(LEGACY_KEY, v1(addRun(emptyRecords(), r({ id: 2, at: 2, depth: 9 })).records));
  store.set(`${DELVE_RECORD_KEY}.unread`, 'x');
  store.set(`${LEGACY_KEY}.unread.1700000000000`, 'y');
  resetRecords();
  assert.deepEqual([...store.keys()], [DELVE_RECORD_KEY]);
  assert.deepEqual(loadRecords(), emptyRecords());
  store.set(LEGACY_KEY, v1(addRun(emptyRecords(), r({ id: 3, at: 3, depth: 9 })).records));
  assert.deepEqual(loadRecords(), emptyRecords(), 'an older tab writing the old name again changes nothing');
});

test('storage nearly full: the oldest runs of the list go first, the bests, tallies and climbs stay', () => {
  for (let i = 1; i <= RUN_LIMIT; i++) recordRun(r({ id: i, at: i, depth: i === 7 ? 30 : 5, losses: [1, 2, i === 7 ? 30 : 5] }));
  const full = store.get(DELVE_RECORD_KEY)!.length;
  room = full - 1500;
  assert.deepEqual(recordRun(r({ id: 99, at: 99, depth: 6, losses: [1, 2, 6] })), { previousBest: 30, best: false });
  const rec = loadRecords();
  assert.ok(rec.runs.length < RUN_LIMIT && rec.runs.length > 0, `${rec.runs.length} runs kept`);
  assert.equal(rec.runs.at(-1)!.id, 99, 'the newest kept');
  assert.deepEqual([bestOf(rec, true)!.id, climbOf(rec, true).at(-1)!.depth, tallyOf(rec, true).ends], [7, 30, { 5: RUN_LIMIT - 1, 6: 1, 30: 1 }]);
  room = 10;
  assert.equal(recordRun(r({ id: 100, at: 100, depth: 6 })), null, 'nothing fits at all: not stored, nothing thrown');
});

// ---- the fuller record: tallies, where lives went, the frontier ------------

test('tallies count every run once, however often it is recorded, and outlive the list', () => {
  let rec = emptyRecords();
  rec = addRun(rec, r({ id: 1, at: 1, depth: 9, losses: [2, 5, 9], wards: 1 })).records;
  rec = addRun(rec, r({ id: 2, at: 2, depth: 9, losses: [9, 9, 9] })).records;
  rec = addRun(rec, t({ id: 3, at: 3, depth: 14, losses: [4, 14, 14], perished: [14] })).records;
  // The run together again (a reload): counted once.
  rec = addRun(rec, t({ id: 3, at: 4, depth: 14, losses: [4, 14, 14], perished: [14] })).records;
  // Mixed runs never count, as they never count as bests.
  rec = addRun(rec, r({ id: 4, at: 5, depth: 60, mixed: true })).records;
  assert.deepEqual(tallyOf(rec, true), { ends: { 9: 2 }, lost: { 2: 1, 5: 1, 9: 2 }, warded: 1 });
  assert.deepEqual(tallyOf(rec, false), { ends: { 14: 1 }, lost: { 4: 1, 14: 2 }, perished: { 14: 1 } });
  for (let i = 10; i < 10 + RUN_LIMIT; i++) rec = addRun(rec, r({ id: i, at: i, depth: 3 })).records;
  assert.equal(tallyOf(rec, true).ends[9], 2, 'runs gone from the list still count');
  assert.equal(tallyOf(rec, true).ends[3], RUN_LIMIT);
});

test('each run keeps the wards that broke in its player\'s place: logged in the codex, and the question just revealed', () => {
  const log = [
    { t: 1, id: 'x', mode: 'name', ok: false, difficulty: 'cruel', race: false, depth: 3, run: 500, warded: true },
    { t: 2, id: 'x', mode: 'name', ok: false, difficulty: 'cruel', race: false, depth: 6, run: 500, lives: 1, wards: 1 },
    { t: 3, id: 'x', mode: 'name', ok: false, difficulty: 'cruel', race: false, depth: 7, run: 499, warded: true },
    { t: 9, id: 'x', mode: 'name', ok: false, difficulty: 'cruel', race: false, depth: 9, run: 500, lives: 1, wards: 1 },
  ];
  store.set(storeKey('codex'), JSON.stringify({ v: 1, items: {}, log }));
  const fall = run({ a: [2, 6, 9] }, { phase: 'reveal', round: 9 });
  fall.question = { askedAt: 9 } as GameState['question'];
  fall.reveal = { correct: false, caveIn: true, lost: { lives: 1, wards: 1 } } as GameState['reveal'];
  assert.equal(runEvent(run({ a: [2, 6] }), fall, 'a')!.wards, 3, 'the question revealed counted once, logged or not');
  store.delete(storeKey('codex'));
  assert.equal(runEvent(run({ a: [2, 6] }), fall, 'a')!.wards, 1);
  // Together: this player's own hit.
  const c = coop();
  const last = structuredClone(c.last);
  last.question = { askedAt: 15 } as GameState['question'];
  last.reveal = { correct: false, hits: [{ playerId: 'b', lives: 1, wards: 1, timedOut: false }] } as unknown as GameState['reveal'];
  assert.deepEqual([leftEvent(last, 'b')!.wards, leftEvent(last, 'a')!.wards], [1, undefined]);
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
    runs: [r({ id: 5, at: 50, depth: 7 }), r({ id: 7, at: 70, depth: 4, mixed: true })],
    bests: { '1:solo': r({ id: 1, at: 10, depth: 23 }) },
  };
  const rec = parseRecords(JSON.stringify(old))!;
  assert.equal(bestOf(rec, true)!.depth, 23);
  assert.deepEqual(tallyOf(rec, true), { ends: { 23: 1, 7: 1 }, lost: {} });
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
        { ...r({ id: 5, depth: 9 }), losses: 'x', wards: -1 },
      ],
      bests: {},
      tallies: {
        '1:solo': { wins: 5, ends: { 9: 2, x: 1, 0: 4, 3: -1 }, lost: { 2: 1.5, 4: 1 }, warded: 'x' },
        '1:together': { ends: { 9: 1 }, lost: {}, perished: { 9: 1, 0: 2 }, given: 2, revived: -4 },
        junk: { ends: {}, lost: {} },
      },
      frontier: [{ depth: 9, at: 1 }, { depth: 3, at: 2 }, 'x'],
    }),
  )!;
  assert.deepEqual(rec.runs.map((x) => x.losses), [[2, 5, 9], undefined, undefined, undefined, undefined]);
  assert.equal(rec.runs[4].wards, undefined);
  assert.deepEqual(rec.tallies, { '1:solo': { ends: { 9: 2 }, lost: { 4: 1 } }, '1:together': { ends: { 9: 1 }, lost: {}, perished: { 9: 1 }, given: 2 } });
  assert.deepEqual(rec.frontier, [{ depth: 9, at: 1 }]);
});

// ---- runs left standing, and what can't be true -----------------------------

test('alone, a run left standing is recorded as left, never a best, and its fall replaces it', () => {
  const standing = run({ a: [3, 8] }, { round: 12 });
  assert.equal(leftEvent(run({ a: [] }, { phase: 'lobby' }), 'a'), null);
  assert.equal(leftEvent(run({ a: [3, 8, 11] }, { round: 12 }), 'a'), null, 'already fell');
  assert.equal(leftEvent(standing, 'someone else'), null);
  const left = leftEvent(standing, 'a')!;
  assert.deepEqual([left.depth, left.left, left.losses, left.who], [12, true, [3, 8], 'a']);
  let out = addRun(emptyRecords(), left);
  assert.equal(out.best, false);
  assert.equal(bestOf(out.records, true), null);
  assert.deepEqual(tallyOf(out.records, true), { ends: {}, lost: { 3: 1, 8: 1 }, left: { 12: 1 } });
  assert.equal(deepestEver(out.records), 12, 'it did get that deep');
  // It goes on after all (a rejoin) and falls: the fall replaces it.
  out = addRun(out.records, { ...left, at: 2, left: undefined, depth: 15, losses: [3, 8, 15] });
  assert.equal(out.records.runs.length, 1);
  assert.equal(out.best, true);
  assert.deepEqual(tallyOf(out.records, true), { ends: { 15: 1 }, lost: { 3: 1, 8: 1 } });
  // Through storage, and round-tripped.
  recordLeft(standing, 'a');
  assert.equal(loadRecords().runs[0].left, true);
  assert.deepEqual(parseRecords(serializeRecords(loadRecords())), loadRecords());
  // On one device with several players there is no run to record (together is online only).
  assert.equal(leftEvent(run({ a: [1], b: [5] }, { round: 7 }), null, true), null);
  assert.equal(runEvent(run({ a: [1], b: [5] }), { ...run({ a: [1], b: [5] }), phase: 'over' }, null, true), null);
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
      tallies: { '1:solo': { ends: { 5: Number.MAX_SAFE_INTEGER, 20000: 1 }, lost: { 4: 2e9 }, left: { 3: 1e12 }, warded: 1e15 } },
      frontier: [{ depth: 1e6, at: 1 }],
    }),
  )!;
  assert.deepEqual(rec.runs.map((x) => x.id), [3]);
  assert.deepEqual(rec.bests, {});
  assert.deepEqual(rec.tallies['1:solo'], { ends: { 5: MAX_COUNT }, lost: { 4: MAX_COUNT }, left: { 3: MAX_COUNT }, warded: MAX_COUNT });
  assert.equal(deepestEver(rec), MAX_DEPTH);
  // A run from the game deeper than that is held at it.
  assert.equal(runEvent(run({ a: [2, 5] }), run({ a: [2, 5, 5000] }), 'a')!.depth, MAX_DEPTH);
});
