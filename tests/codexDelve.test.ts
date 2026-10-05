import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { emptyCodex, parseCodex, record, serializeCodex, type Codex, type Encounter } from '../src/lib/codex.ts';
import { ATLAS_DEPTH, delveItemStats, delveSummary, depthBands, lostTo, nextZone, zoneAtlas, zoneOf } from '../src/lib/codexStats.ts';
import { addRun, emptyRecords, type DelveRun } from '../src/lib/delveRecord.ts';
import { milestoneAt } from '../src/lib/descent.ts';

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

// The named depths come from descent.ts, which may name other depths; nothing
// here assumes which, only what milestoneAt says.
const named = (to: number) => Array.from({ length: to }, (_, i) => i + 1).filter((d) => milestoneAt(d));

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

test('the items that cost lives, the deepest answers, and which items each run lost to', () => {
  const x = codexOf(
    dv(1, a.id, 4, false, 1),
    dv(2, a.id, 12, false, 2),
    dv(3, b.id, 20, false, 2),
    dv(4, c.id, 30, true, 2),
    dv(5, b.id, 25, true, 2),
    dv(6, c.id, 31, false, 2),
  );
  const st = delveItemStats(x, items);
  assert.deepEqual([st.answers.n, st.answers.ok], [6, 2]);
  assert.deepEqual(
    st.costly.map((r) => [r.item.id, r.lives, r.at]),
    [
      [a.id, 2, 12],
      [c.id, 1, 31],
      [b.id, 1, 20],
    ],
  );
  assert.deepEqual(
    st.deepest.map((r) => [r.item.id, r.depth]),
    [
      [c.id, 30],
      [b.id, 25],
    ],
  );
  const lost = lostTo(x, items);
  assert.deepEqual(lost.get(1)!.map((l) => [l.item.id, l.depth]), [[a.id, 4]]);
  assert.deepEqual(
    lost.get(2)!.map((l) => [l.item.id, l.depth]),
    [
      [a.id, 12],
      [b.id, 20],
      [c.id, 31],
    ],
  );
});

test('the named depths: where a depth lies, what comes next, and the atlas', () => {
  const zones = named(ATLAS_DEPTH);
  assert.ok(zones.length > 0, 'descent.ts names some depths');
  const [first, second] = zones;
  assert.equal(zoneOf(first - 1), null);
  assert.deepEqual(zoneOf(first), { depth: first, name: milestoneAt(first) });
  if (second) assert.deepEqual(zoneOf(second - 1), { depth: first, name: milestoneAt(first) });
  assert.deepEqual(nextZone(first - 1), { depth: first, name: milestoneAt(first) });
  assert.equal(nextZone(first)!.depth > first, true);

  // Nothing reached: every named depth to ATLAS_DEPTH, all undiscovered.
  const blank = zoneAtlas([]);
  assert.deepEqual(
    blank.map((z) => z.depth),
    zones,
  );
  assert.ok(blank.every((z) => z.at === null && z.name === milestoneAt(z.depth)));

  // Reached past the second: those two dated by the run that first went that deep.
  if (second) {
    const atlas = zoneAtlas([
      { depth: first, at: 10 },
      { depth: second + 1, at: 20 },
    ]);
    assert.deepEqual(
      atlas.slice(0, 2).map((z) => z.at),
      [10, 20],
    );
    assert.ok(atlas.slice(2).every((z) => z.at === null));
  }

  // Deeper than the atlas goes: everything reached is shown, and the next one to find.
  const deep = named(ATLAS_DEPTH * 3).at(-1)!;
  const far = zoneAtlas([{ depth: deep, at: 5 }]);
  assert.ok(far.filter((z) => z.at !== null).length === named(deep).length);
  assert.equal(far.at(-1)!.at, null);
  assert.equal(far.at(-1)!.depth, nextZone(deep)!.depth);
});

test('accuracy by named depth: one band from each to the next', () => {
  const zones = named(ATLAS_DEPTH);
  const deep = zones[1] ?? zones[0];
  const x = codexOf(dv(1, a.id, 1, true), dv(2, a.id, 1, false), dv(3, b.id, deep, true));
  const bands = depthBands(x, deep);
  assert.equal(bands[0].from, 1);
  assert.equal(bands[0].name, milestoneAt(1));
  assert.deepEqual(bands[0].tally, { n: 2, ok: 1 });
  for (let i = 1; i < bands.length; i++) {
    assert.equal(bands[i].from, bands[i - 1].to! + 1, 'bands meet');
    assert.equal(bands[i].name, milestoneAt(bands[i].from));
  }
  const last = bands.at(-1)!;
  assert.ok(last.from <= deep && (last.to === null || last.to >= deep));
  assert.deepEqual(last.tally, { n: 1, ok: 1 });
});

test('the summary: runs alone and together, median and mean, and lives by depth', () => {
  const run = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, won: false, ruleset: 1, mixed: false, ...o });
  let rec = emptyRecords();
  rec = addRun(rec, run({ id: 1, at: 1, depth: 4, losses: [1, 2, 4] })).records;
  rec = addRun(rec, run({ id: 2, at: 2, depth: 10, losses: [2, 10, 10] })).records;
  rec = addRun(rec, run({ id: 3, at: 3, depth: 6, players: 3, won: true, losses: [3, 5, 6] })).records;
  const all = delveSummary(rec);
  assert.deepEqual([all.runs, all.solo, all.group, all.wins, all.median, all.mean], [3, 2, 1, 1, 6, 20 / 3]);
  assert.equal(all.depths.length, 10);
  assert.deepEqual(all.depths[1], { depth: 2, ends: 0, lost: 2 });
  assert.deepEqual(all.depths[9], { depth: 10, ends: 1, lost: 1 });
  const solo = delveSummary(rec, 'solo');
  assert.deepEqual([solo.runs, solo.median], [2, 7]);
  assert.equal(delveSummary(emptyRecords()).median, null);
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
    lostTo(x, items).get(100)?.map((l) => l.depth),
    [6],
  );
  assert.deepEqual(
    delveItemStats(x, items).costly.map((c) => [c.item.id, c.lives, c.at]),
    [[a.id, 1, 6]],
  );
  // Round trip, and an answer only a ward took is no cost at all.
  assert.deepEqual(parseCodex(serializeCodex(x)), x);
  const only = codexOf(with_(dv(5, b.id, 3, false), { depth: 3, run: 100, warded: true }));
  assert.deepEqual(only.items[b.id].delve, { n: 1, ok: 0, deepest: 0, lostAt: 0, warded: 1 });
  assert.deepEqual(delveItemStats(only, items).costly, []);
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
  s.delve!.find = { category: s.offered[0], kind: 'azurite' };
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
