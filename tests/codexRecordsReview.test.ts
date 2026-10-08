// Regression tests from the review of the Delve records and the codex: whose
// answers a run is told back from, the codex's own name for the Delve reader,
// a run left without its losses, a tie with the best, and the median's words.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GameState, Item } from '../src/lib/game.ts';
import { CODEX_KEY, emptyCodex, record, serializeCodex, type Encounter } from '../src/lib/codex.ts';
import { answersByRun, answersFor, delveSummary, medianOfCounts, runStory } from '../src/lib/codexStats.ts';
import { CODEX_NAMES, addRun, emptyRecords, measure, runEvent, runKey, type DelveRun } from '../src/lib/delveRecord.ts';
import { createGame } from '../src/lib/game.ts';
import { storeKey } from '../src/lib/storage.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
beforeEach(() => store.clear());

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const [a, b, c] = items;
const byId = new Map(items.map((it) => [it.id, it]));
const run = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, ruleset: 1, mixed: false, ...o });
const wrong = (at: number, itemId: string, depth: number, who?: string, more: Partial<NonNullable<Encounter['delve']>> = {}): Encounter => ({
  at,
  itemId,
  mode: 'name',
  difficulty: 'merciless',
  race: false,
  delve: { depth, run: 500, team: true, ...(who ? { who } : {}), ...more },
  answer: { ok: false, pickedId: null, pickedLabel: null },
});

test('the Delve reader looks for the codex where the codex keeps it', () => {
  assert.equal(storeKey(CODEX_NAMES[0]), CODEX_KEY);
  assert.equal(CODEX_NAMES[1], 'codex', 'and, before it first writes there, under the old name');
});

test('two players of one browser in one room: a run is told back from its own player\'s answers', () => {
  const x = [wrong(1, a.id, 3, 'p0'), wrong(2, b.id, 3, 'p1'), wrong(3, c.id, 5)].reduce(record, emptyCodex());
  const by = answersByRun(x);
  assert.deepEqual(answersFor(by, run({ id: 500, who: 'p0' })).map((l) => l.id), [a.id, c.id], 'its own, and the one that doesn\'t say whose');
  assert.deepEqual(answersFor(by, run({ id: 500, who: 'p1' })).map((l) => l.id), [b.id, c.id]);
  assert.deepEqual(answersFor(by, run({ id: 500 })).map((l) => l.id), [a.id, b.id, c.id], 'one device: all of them');
  const p0 = run({ id: 500, who: 'p0', players: 2, depth: 5, losses: [3], perished: [] });
  assert.deepEqual(runStory(p0, answersFor(by, p0), byId).lives.map((l) => l.item?.id), [a.id], 'not the teammate\'s item');
});

test('wards in a run are its own player\'s, not the other tab\'s', () => {
  const log = [wrong(1, a.id, 3, 'a', { lost: { lives: 0, wards: 1 } }), wrong(2, b.id, 4, 'b', { lost: { lives: 0, wards: 1 } }), wrong(3, c.id, 5, undefined, { lost: { lives: 0, wards: 1 } })].reduce(
    record,
    emptyCodex(),
  );
  store.set(CODEX_KEY, serializeCodex(log));
  const s = createGame('a');
  s.players = ['a', 'b'].map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: ['a'], losses: { a: [2, 6] }, ruleset: 1, startedAt: 500, excused: [], graceUntil: 0 };
  const fell: GameState = { ...structuredClone(s), delve: { ...s.delve, losses: { a: [2, 6, 9] } } };
  assert.equal(runEvent(s, fell, 'a')!.wards, 2, 'a\'s and the one that doesn\'t say whose, not b\'s');
});

test('a run together whose losses couldn\'t be read is told by where its player perished, not the team\'s depth', () => {
  const lost = runStory(run({ players: 2, depth: 30, perished: [12, 25] }), [], byId).lives.map((l) => l.depth);
  assert.deepEqual(lost, [12, 25]);
  assert.deepEqual(runStory(run({ players: 2, depth: 30, perished: [] }), [], byId).lives, []);
  assert.deepEqual(runStory(run({ depth: 9 }), [], byId).lives.map((l) => l.depth), [9], 'alone, a fall still at its depth');
});

test('a tie with the best: only the best run itself is the best, by its key', () => {
  const first = addRun(emptyRecords(), run({ id: 1, at: 1, depth: 12, losses: [3, 4, 12] }));
  const second = addRun(first.records, run({ id: 2, at: 2, depth: 12, losses: [5, 6, 12] }));
  assert.deepEqual([second.best, second.previousBest], [false, 12], 'the end screen: not deeper than ever');
  const best = delveSummary(second.records, 'solo').best!;
  const last = second.records.runs.at(-1)!;
  assert.equal(best.depth, last.depth);
  assert.notEqual(runKey(best), runKey(last), 'so the codex never calls the second "your deepest"');
  assert.equal(measure(second.records, second.records.runs[0]).best, true);
});

test('the usual depth: at least half the ends that deep or deeper (ties too), and only ends count toward it', () => {
  const atLeastHalf = (ends: Record<number, number>) => {
    const m = medianOfCounts(ends)!;
    const all = Object.values(ends).reduce((x, y) => x + y, 0);
    const deeper = Object.entries(ends).reduce((n, [d, k]) => n + (Number(d) >= m ? k : 0), 0);
    const shallower = Object.entries(ends).reduce((n, [d, k]) => n + (Number(d) <= m ? k : 0), 0);
    return 2 * deeper >= all && 2 * shallower >= all;
  };
  for (const ends of [{ 5: 3 }, { 3: 2, 9: 2 }, { 4: 1, 5: 5, 9: 1 }, { 2: 1, 7: 2 }]) assert.ok(atLeastHalf(ends), JSON.stringify(ends));
  // "Half end deeper" would be false here: none does.
  assert.equal(medianOfCounts({ 5: 3 }), 5);
  let x = emptyRecords();
  for (let i = 0; i < 5; i++) x = addRun(x, run({ id: 10 + i, at: 10 + i, depth: 8, losses: [2], left: true })).records;
  x = addRun(x, run({ id: 20, at: 20, depth: 9, losses: [1, 2, 9] })).records;
  const s = delveSummary(x, 'solo');
  assert.deepEqual([s.runs, s.fell, s.median], [6, 1, null], 'six runs, but one ended: no usual depth yet');
});

test('the Delve page says what its numbers are', () => {
  const page = readFileSync(new URL('../src/components/CodexDelve.svelte', import.meta.url), 'utf8');
  assert.ok(!/half your runs[^'"<]* end deeper/.test(page), 'never "half your runs end deeper"');
  assert.match(page, /at least half your runs/);
  assert.match(page, /runs \{kindWord\} have ended/, 'the wait counts runs that end, not runs left');
  assert.match(page, /'not perished yet'/, 'together, runs perish');
  assert.equal((page.match(/, under any rules[;.]/g) ?? []).length, 3, 'what kills you, the deadliest items, finds and wards: every rules version, and they say so');
  const last = readFileSync(new URL('../src/components/codex/DelveLastRun.svelte', import.meta.url), 'utf8');
  assert.match(last, /runKey\(best\) === runKey\(run\)/);
});

test('records with only group runs from before co-op read as nothing at all: no "runs below" with none below', async () => {
  const { parseRecords } = await import('../src/lib/delveRecord.ts');
  const { otherRules } = await import('../src/lib/codexStats.ts');
  const rec = parseRecords(
    JSON.stringify({
      v: 1,
      runs: [{ ...run({ id: 6, at: 60, depth: 11, players: 2 }), won: true }, { ...run({ id: 8, at: 80, depth: 13, players: 3 }), hot: true }],
      bests: { '1:group': { ...run({ id: 6, at: 60, depth: 11, players: 2 }), won: true } },
      frontier: [{ depth: 11, at: 60 }, { depth: 13, at: 80 }],
    }),
  )!;
  assert.deepEqual([rec.runs, rec.bests, rec.frontier, otherRules(rec)], [[], {}, [], []]);
});
