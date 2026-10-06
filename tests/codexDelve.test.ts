import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { emptyCodex, parseCodex, record, serializeCodex, type Codex, type Encounter } from '../src/lib/codex.ts';
import {
  answersByRun,
  delveDeaths,
  delveSummary,
  findStats,
  livesLost,
  medianOfCounts,
  mergeClimbs,
  mergeTallies,
  milestones,
  otherRules,
  runStory,
  toward,
  zone,
  zoneOf,
  zoneRisks,
  zonesReached,
} from '../src/lib/codexStats.ts';
import { MAX_COUNT, MAX_DEPTH, addRun, emptyRecords, parseRecords, tallyOf, type DelveRun } from '../src/lib/delveRecord.ts';
import { milestoneAt, stratumName } from '../src/lib/descent.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const [a, b, c] = items;

/** A Delve answer at `depth` in run `run`. */
const dv = (at: number, itemId: string, depth: number, ok: boolean, run = 100): Encounter => ({
  at,
  itemId,
  mode: 'name',
  difficulty: 'merciless',
  race: false,
  delve: { depth, run },
  answer: { ok, pickedId: ok ? itemId : null, pickedLabel: null },
});

function codexOf(...es: Encounter[]): Codex {
  return es.reduce(record, emptyCodex());
}

const byId = new Map(items.map((it) => [it.id, it]));
const run = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, won: false, ruleset: 1, mixed: false, ...o });

test('Delve answers keep their depth: per item, per depth and in the log', () => {
  const x = codexOf(dv(1, a.id, 3, true), dv(2, a.id, 9, false), dv(3, a.id, 7, true), dv(4, a.id, 5, false), dv(5, b.id, 2, true, 200));
  assert.deepEqual(x.items[a.id].delve, { n: 4, ok: 2, deepest: 7, lostAt: 9 });
  assert.deepEqual(x.items[a.id].name, { n: 4, ok: 2 }, 'still counted as any answer');
  assert.deepEqual(x.byDepth, { 2: { n: 1, ok: 1 }, 3: { n: 1, ok: 1 }, 5: { n: 1, ok: 0 }, 7: { n: 1, ok: 1 }, 9: { n: 1, ok: 0 } });
  assert.deepEqual(
    x.log.map((l) => [l.depth, l.run]),
    [
      [3, 100],
      [9, 100],
      [7, 100],
      [5, 100],
      [2, 200],
    ],
  );
  // Outside Delve nothing of it is kept.
  const plain = record(emptyCodex(), { ...dv(9, c.id, 4, true), delve: undefined });
  assert.equal(plain.items[c.id].delve, undefined);
  assert.equal(plain.log[0].depth, undefined);
  assert.deepEqual(plain.byDepth, {});
});

test('Delve fields round-trip, a codex from before them reads as it was, and nonsense is dropped', () => {
  const x = codexOf(dv(1, a.id, 3, true), dv(2, b.id, 4, false));
  assert.deepEqual(parseCodex(serializeCodex(x)), x);

  const old = parseCodex(JSON.stringify({ v: 1, items: { [a.id]: { seen: 1, first: 1, last: 1, name: { n: 1, ok: 1 }, art: {}, mixed: {} } } }))!;
  assert.deepEqual(old.byDepth, {});
  assert.equal(old.items[a.id].delve, undefined);

  const messy = parseCodex(
    JSON.stringify({
      v: 1,
      items: {
        [a.id]: { seen: 1, first: 1, last: 1, name: {}, art: {}, mixed: {}, delve: { n: 2, ok: 1, deepest: 'deep', lostAt: 4.5 } },
        [b.id]: { seen: 1, first: 1, last: 1, name: {}, art: {}, mixed: {}, delve: { n: 0, ok: 0, deepest: 3 } },
      },
      log: [
        { t: 1, id: a.id, mode: 'name', ok: true, difficulty: 'cruel', depth: 3, run: 7 },
        { t: 2, id: a.id, mode: 'name', ok: true, difficulty: 'cruel', depth: 0, run: 7 },
        { t: 3, id: a.id, mode: 'name', ok: true, difficulty: 'cruel', depth: 3 },
      ],
      byDepth: { 3: { n: 2, ok: 5 }, x: { n: 1, ok: 1 }, 0: { n: 1, ok: 1 }, 4: { n: 0, ok: 0 } },
    }),
  )!;
  assert.deepEqual(messy.items[a.id].delve, { n: 2, ok: 1, deepest: 0, lostAt: 0 });
  assert.equal(messy.items[b.id].delve, undefined);
  assert.deepEqual(
    messy.log.map((l) => [l.depth, l.run]),
    [
      [3, 7],
      [undefined, undefined],
      [undefined, undefined],
    ],
  );
  assert.deepEqual(messy.byDepth, { 3: { n: 2, ok: 2 } });
});

test('which items each run lost its lives to, a cave-in taking two', () => {
  const caveIn: Encounter = { ...dv(4, b.id, 9, false, 2), delve: { depth: 9, run: 2, find: 'azurite', lost: { lives: 2, wards: 0 } } };
  const x = codexOf(dv(1, a.id, 4, false, 1), dv(2, a.id, 3, false, 2), dv(3, c.id, 5, true, 2), caveIn);
  const story = runStory(run({ id: 2, depth: 9, losses: [3, 9, 9] }), answersByRun(x).get(2)!, byId);
  assert.deepEqual(
    story.lives.map((l) => [l.depth, l.item?.id, l.caveIn, l.zone.name]),
    [
      [3, a.id, false, zoneOf(3).name],
      [9, b.id, true, zoneOf(9).name],
      [9, b.id, true, zoneOf(9).name],
    ],
  );
  assert.equal(story.finds.finds.azurite.taken, 1);
  assert.equal(story.finds.finds.azurite.lives, 2);
  // A life with no answer logged (a pick that ran out) is still there, without an item.
  const bare = runStory(run({ id: 7, depth: 12, losses: [2, 5, 12] }), [], byId);
  assert.deepEqual(
    bare.lives.map((l) => [l.depth, l.item]),
    [
      [2, null],
      [5, null],
      [12, null],
    ],
  );
  // A run left standing shows only the lives it lost.
  assert.equal(runStory(run({ id: 8, depth: 30, losses: [4], left: true }), [], byId).lives.length, 1);
});

test('zones: ten depths each, named as the descent names its strata, numbered when a biome comes round again', () => {
  assert.equal(zoneOf(1).name, stratumName(0), 'depths 1 to 10 are the first stratum (The Mines), not "the surface"');
  assert.deepEqual([zoneOf(10).k, zoneOf(11).k, zoneOf(20).k, zoneOf(21).k], [0, 1, 1, 2]);
  for (let d = 11; d <= 91; d += 10) assert.equal(zoneOf(d).name, milestoneAt(d), `named as the card names depth ${d}`);
  // Past 100 names come round again: never twice the same, a second time numbered.
  const names = Array.from({ length: 60 }, (_, k) => zone(k).name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.slice(10).some((n) => / [IVXL]+$/.test(n)));
  assert.deepEqual([zone(4).depth, zone(4).to], [41, 50]);
  assert.equal(zone(1e9).to, Math.ceil(MAX_DEPTH / 10) * 10, 'bounded');
  // The arc from a best to the next zone.
  const t = toward(44);
  assert.deepEqual([t.here.depth, t.next.depth, t.left], [41, 51, 7]);
  assert.ok(t.share > 0 && t.share < 1);
  assert.ok(toward(50).share < 1, 'never quite there');
});

test('zones reached: dated by the climb, distinct biomes, one teaser', () => {
  assert.deepEqual(zonesReached([]), { reached: [], biomes: 0, next: null });
  const z = zonesReached([
    { depth: 8, at: 10 },
    { depth: 23, at: 20 },
    { depth: 44, at: 30 },
  ]);
  assert.deepEqual(
    z.reached.map((r) => [r.depth, r.at]),
    [
      [1, 10],
      [11, 20],
      [21, 20],
      [31, 30],
      [41, 30],
    ],
  );
  assert.equal(z.biomes, 5);
  assert.equal(z.next?.depth, 51);
  // As deep as the records go: a hundred zones at most, no teaser past the last.
  const deep = zonesReached([{ depth: MAX_DEPTH, at: 1 }]);
  assert.equal(deep.reached.length, 100);
  assert.ok(deep.biomes <= 10);
});

test('the summary counts from tallies: falls and runs left, a median from MIN_RUNS falls, alone and together apart', () => {
  let rec = emptyRecords();
  rec = addRun(rec, run({ id: 1, at: 1, depth: 4, losses: [1, 2, 4] })).records;
  rec = addRun(rec, run({ id: 2, at: 2, depth: 10, losses: [2, 10, 10] })).records;
  const two = delveSummary(rec, 'solo');
  assert.deepEqual([two.runs, two.median], [2, null], 'no typical depth from two runs');
  rec = addRun(rec, run({ id: 3, at: 3, depth: 7, losses: [3, 5, 7] })).records;
  rec = addRun(rec, run({ id: 4, at: 4, depth: 30, losses: [5], left: true })).records;
  rec = addRun(rec, run({ id: 5, at: 5, depth: 60, players: 3, won: true, losses: [3, 5, 60] })).records;
  const solo = delveSummary(rec, 'solo');
  assert.deepEqual([solo.runs, solo.fell, solo.left, solo.median, solo.best?.depth], [4, 3, 1, 7, 10]);
  const group = delveSummary(rec, 'group');
  assert.deepEqual([group.runs, group.wins, group.median, group.best?.depth], [1, 1, null, 60]);
});

test('medians come from counts, so a huge tally costs nothing', () => {
  assert.equal(medianOfCounts({}), null);
  assert.equal(medianOfCounts({ 7: 1, 8: 1 }), 7.5);
  assert.equal(medianOfCounts({ 3: 2, 9: 1 }), 3);
  assert.equal(medianOfCounts({ 1: 1, 5: 2, 100: 1 }), 5);
  const raw = JSON.stringify({ v: 1, runs: [], bests: {}, tallies: { '1:solo': { wins: 0, ends: { 5: 3e15, 6: 2 }, lost: {} } }, frontier: [] });
  const started = Date.now();
  const s = delveSummary(parseRecords(raw)!, 'solo');
  assert.ok(Date.now() - started < 200);
  assert.deepEqual([s.runs, s.median], [MAX_COUNT + 2, 5]);
});

test('where you fall: lives lost in a zone per run that reached it, from ZONE_MIN_RUNS runs', () => {
  let rec = emptyRecords();
  // Five runs: all lose a life in the Mines, three get past depth 10.
  const runs = [
    [2, 4, 8],
    [3, 9, 9],
    [5, 12, 15],
    [7, 18, 25],
    [1, 2, 33],
  ];
  runs.forEach((losses, i) => (rec = addRun(rec, run({ id: i + 1, at: i + 1, depth: losses[2], losses })).records));
  const risks = zoneRisks(tallyOf(rec, true));
  assert.deepEqual(
    risks.map((z) => [z.depth, z.reached, z.lives]),
    [[1, 5, 10]],
    'zones only once five runs reach them',
  );
  assert.equal(risks[0].rate, 10 / 5);
  const loose = zoneRisks(tallyOf(rec, true), 1);
  assert.deepEqual(
    loose.map((z) => [z.depth, z.reached, z.lives]),
    [
      [1, 5, 10],
      [11, 3, 3],
      [21, 2, 1],
      [31, 1, 1],
    ],
  );
  // A run left standing got as deep as it was, and its lives count where they went.
  rec = addRun(rec, run({ id: 9, at: 9, depth: 14, losses: [12], left: true })).records;
  assert.deepEqual(
    zoneRisks(tallyOf(rec, true), 1).map((z) => [z.depth, z.reached, z.lives]).slice(0, 2),
    [
      [1, 6, 10],
      [11, 4, 4],
    ],
  );
});

test('what kills you: death rates from two answers, categories from five, a cave-in two lives', () => {
  const cave = (at: number, id: string): Encounter => ({ ...dv(at, id, 9, false), delve: { depth: 9, run: 1, find: 'azurite', lost: { lives: 2, wards: 0 } } });
  // a: 2 lives in 2 answers (one cave-in, one right). b: 1 in 1 (too few). c: 1 in 4.
  const x = codexOf(cave(1, a.id), dv(2, a.id, 3, true), dv(3, b.id, 3, false), dv(4, c.id, 1, false), dv(5, c.id, 2, true), dv(6, c.id, 3, true), dv(7, c.id, 4, true));
  const d = delveDeaths(x, items);
  assert.deepEqual(
    d.items.map((r) => [r.item.id, r.lives, r.n]),
    [
      [a.id, 2, 2],
      [c.id, 1, 4],
    ],
  );
  assert.equal(d.lives, 4);
  assert.ok(d.categories.every((k) => k.n >= 5));
  const cat = d.categories.find((k) => k.category === c.category);
  if (cat) assert.ok(cat.rate > 0);
});

test('finds and wards from the log: veins and caches taken and how they ended, wards and flares', () => {
  const find = (at: number, ok: boolean, more: NonNullable<Encounter['delve']>): Encounter => ({ ...dv(at, a.id, 20, ok), delve: { ...more } });
  const x = codexOf(
    find(1, true, { depth: 20, run: 1, find: 'azurite', gained: 'wards' }),
    find(2, true, { depth: 20, run: 1, find: 'azurite', gained: 'shards' }),
    find(3, false, { depth: 20, run: 1, find: 'azurite', warded: true, lost: { lives: 0, wards: 2 } }),
    find(4, true, { depth: 20, run: 1, find: 'flare', gained: 'flares', flared: true }),
    find(5, false, { depth: 20, run: 1, find: 'flare', warded: true }),
  );
  const f = findStats(x.log);
  assert.deepEqual(f.finds.azurite, { taken: 3, ok: 2, gained: { wards: 1, shards: 1 }, lives: 0, wards: 2 });
  assert.deepEqual(f.finds.flare, { taken: 2, ok: 1, gained: { flares: 1 }, lives: 0, wards: 1 });
  assert.equal(f.wardsBroke, 3);
  assert.equal(f.flaresBurnt, 1);
  // The new log fields round-trip, and nonsense in them is dropped.
  const { parseCodex: parse, serializeCodex: ser } = { parseCodex, serializeCodex };
  assert.deepEqual(parse(ser(x)), x);
  const odd = parse(JSON.stringify({ v: 1, items: {}, log: [{ t: 1, id: a.id, mode: 'name', ok: false, difficulty: 'cruel', depth: 3, run: 1, find: 'gold', gained: 'wards', lives: 7, wards: 1 }] }))!;
  assert.deepEqual(odd.log[0], { t: 1, id: a.id, mode: 'name', ok: false, difficulty: 'cruel', race: false, depth: 3, run: 1 });
});

test('runs under other rules or resumed across a change are grouped apart, with their own bests', () => {
  let rec = emptyRecords();
  rec = addRun(rec, run({ id: 1, at: 1, depth: 12 })).records;
  rec = addRun(rec, run({ id: 2, at: 2, depth: 40, ruleset: 7 })).records;
  rec = addRun(rec, run({ id: 3, at: 3, depth: 25, ruleset: 7, players: 2 })).records;
  rec = addRun(rec, run({ id: 4, at: 4, depth: 60, mixed: true })).records;
  const groups = otherRules(rec, 1);
  assert.deepEqual(
    groups.map((g) => [g.ruleset, g.runs.map((r) => r.id), g.solo, g.group]),
    [
      [7, [3, 2], 40, 25],
      [null, [4], null, null],
    ],
  );
  assert.equal(delveSummary(rec, 'solo').runs, 1, 'only runs under these rules count');
});

test('Delve answers note finds, blasted cards and wards, and a warded answer costs no life', async () => {
  const { livesCost } = await import('../src/lib/codex.ts');
  const with_ = (e: Encounter, more: NonNullable<Encounter['delve']>): Encounter => ({ ...e, delve: { ...e.delve!, ...more } });
  const x = codexOf(
    with_(dv(1, a.id, 9, true), { depth: 9, run: 100, find: 'azurite' }),
    with_(dv(2, a.id, 12, false), { depth: 12, run: 100, find: 'flare', warded: true }),
    with_(dv(3, a.id, 6, false), { depth: 6, run: 100, blasted: true }),
    dv(4, a.id, 4, true),
  );
  const d = x.items[a.id].delve!;
  assert.deepEqual(d, { n: 4, ok: 2, deepest: 9, lostAt: 6, finds: 2, blasted: 1, warded: 1 });
  assert.equal(livesCost(d), 1);
  assert.deepEqual(
    x.log.map((l) => l.warded ?? false),
    [false, true, false, false],
  );
  // The ward's answer took no life from the run.
  assert.deepEqual(
    runStory(run({ id: 100, depth: 6, losses: [6] }), answersByRun(x).get(100)!, byId).lives.map((l) => [l.depth, l.item?.id]),
    [[6, a.id]],
  );
  assert.deepEqual(
    delveDeaths(x, items).items.map((c) => [c.item.id, c.lives, c.n]),
    [[a.id, 1, 4]],
  );
  // Round trip, and an answer only a ward took is no cost at all.
  assert.deepEqual(parseCodex(serializeCodex(x)), x);
  const only = codexOf(with_(dv(5, b.id, 3, false), { depth: 3, run: 100, warded: true }));
  assert.deepEqual(only.items[b.id].delve, { n: 1, ok: 0, deepest: 0, lostAt: 0, warded: 1 });
  assert.deepEqual(delveDeaths(only, items).items, []);
  // Nonsense counts are capped to the answers they could be.
  const messy = parseCodex(
    JSON.stringify({ v: 1, items: { [c.id]: { seen: 1, first: 1, last: 1, name: {}, art: {}, mixed: {}, delve: { n: 2, ok: 1, deepest: 3, lostAt: 4, finds: 9, blasted: -1, warded: 5 } } } }),
  )!;
  assert.deepEqual(messy.items[c.id].delve, { n: 2, ok: 1, deepest: 3, lostAt: 0, finds: 2, warded: 2 });
  // Codexes from before lives were counted: one a wrong answer, but for those a ward took.
  const old = parseCodex(
    JSON.stringify({ v: 1, items: { [c.id]: { seen: 1, first: 1, last: 1, name: {}, art: {}, mixed: {}, delve: { n: 3, ok: 0, deepest: 0, lostAt: 4, warded: 1 } } } }),
  )!;
  assert.equal(livesCost(old.items[c.id].delve!), 2);
  assert.equal(old.items[c.id].delve!.lostAt, 4);
});

test('a cave-in costs the lives it took, and the wards that broke in their place', async () => {
  const { livesCost } = await import('../src/lib/codex.ts');
  const cave = (at: number, depth: number, lives: number, wards: number): Encounter => ({
    ...dv(at, a.id, depth, false),
    delve: { depth, run: 100, find: 'azurite', ...(lives ? {} : { warded: true as const }), lost: { lives, wards } },
  });
  const x = codexOf(cave(1, 8, 2, 0), cave(2, 12, 1, 1), cave(3, 15, 0, 2), dv(4, a.id, 3, false));
  const d = x.items[a.id].delve!;
  assert.deepEqual(d, { n: 4, ok: 0, deepest: 0, lostAt: 12, finds: 3, warded: 3, lives: 4 });
  assert.equal(livesCost(d), 4);
  assert.equal(x.log.filter((l) => l.warded).length, 1, 'only the answer the wards took whole cost no life');
  assert.deepEqual(parseCodex(serializeCodex(x)), x);
});

test('a Delve reveal says what the question came from and whether a ward took its loss', async () => {
  const { Engine, createGame, isFake } = await import('../src/lib/game.ts');
  const { encounterAt } = await import('../src/lib/codex.ts');
  const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
  let seed = 11;
  const engine = new Engine(items, { rng: () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32), now: () => 1_000_000, fakes });
  let s = createGame(null, { targetScore: 1, timer: 0, difficulty: 'eternal', mode: 'delve', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, null);
  s = engine.apply(s, { type: 'start' }, null);
  // A find among the cards, and two wards to take its cave-in.
  s = structuredClone(s);
  s.delve!.finds = [{ category: s.offered[0], kind: 'azurite' }];
  s.delve!.inventory = { p0: { wards: 2, flares: 0, dynamite: 0, shards: 0 } };
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: q.options.findIndex((o) => o !== q.itemId && !isFake(o)), askedAt: q.askedAt }, null);
  assert.equal(s.reveal?.warded, true);
  const e = encounterAt(s, null, true)!;
  assert.deepEqual(e.delve, { depth: 1, run: s.delve!.startedAt, find: 'azurite', warded: true, lost: { lives: 0, wards: 2 } });
  assert.equal(e.answer?.ok, false);
});

test('alone and together as one: tallies summed, climbs merged into one frontier, lives lost counted', () => {
  let rec = emptyRecords();
  rec = addRun(rec, run({ id: 1, at: 1, depth: 9, losses: [2, 5, 9] })).records;
  rec = addRun(rec, run({ id: 2, at: 2, depth: 14, players: 3, won: true, losses: [3, 14, 14] })).records;
  rec = addRun(rec, run({ id: 3, at: 3, depth: 12, losses: [4, 12, 12] })).records;
  rec = addRun(rec, run({ id: 4, at: 4, depth: 6, losses: [6], left: true })).records;
  const both = mergeTallies(tallyOf(rec, true), tallyOf(rec, false));
  assert.deepEqual(both.ends, { 9: 1, 12: 1, 14: 1 });
  assert.deepEqual(both.lost, { 2: 1, 5: 1, 3: 1, 14: 1, 4: 1, 12: 1, 6: 1 });
  assert.deepEqual(both.left, { 6: 1 });
  assert.equal(both.wins, 1);
  assert.equal(livesLost(both), 10, 'three falls of three lives, and the one life of the run left');
  assert.deepEqual(zoneRisks(both, 1)[0], { ...zone(0), reached: 4, lives: 6, rate: 6 / 4 });

  const climb = mergeClimbs(
    [
      { depth: 9, at: 1 },
      { depth: 12, at: 3 },
    ],
    [{ depth: 14, at: 2 }],
  );
  assert.deepEqual(
    climb.map((f) => f.depth),
    [9, 14],
    'a step only where it went deeper than every one before it',
  );
});

test('milestones keep the first best and the latest few, with a gap between', () => {
  const at = (...ds: number[]) => ds.map((depth, i) => ({ depth, at: i }));
  assert.deepEqual(milestones(at(3, 8, 12)), [3, 8, 12]);
  assert.deepEqual(milestones(at(3, 8, 12, 20, 26, 35, 43)), [3, null, 20, 26, 35, 43]);
  assert.deepEqual(milestones([]), []);
});

test('what kills you also counts the wards that broke in a life\'s place and the dynamite that went off', () => {
  const warded = (at: number): Encounter => ({ ...dv(at, a.id, 12, false), delve: { depth: 12, run: 1, warded: true } });
  const blast = (at: number, ok: boolean): Encounter => ({ ...dv(at, b.id, 14, ok), delve: { depth: 14, run: 1, blasted: true } });
  const d = delveDeaths(codexOf(warded(1), warded(2), blast(3, true), blast(4, false), dv(5, c.id, 3, false)), items);
  assert.equal(d.warded, 2);
  assert.equal(d.blasted, 2);
  assert.equal(d.lives, 2, 'a warded answer costs no life');
});
