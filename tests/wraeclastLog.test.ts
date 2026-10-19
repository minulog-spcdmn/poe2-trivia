import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';
import { storeKey } from '../src/lib/storage.ts';
import { GRAPH } from '../src/wraeclast/map.ts';
import {
  Run,
  CLUES,
  DEFAULT_TUNING,
  LOOT_KINDS,
  SUPPLIES,
  SYLLABLES,
  gridAdjacency,
  itemOf,
  markLine,
  type ItemLog,
  type LootKind,
  type RunLog,
  type Supply,
  type Tuning,
} from '../src/wraeclast/rules.ts';
import { RUNS_KEPT, keepRun, logText, readRuns } from '../src/wraeclast/runLog.ts';
import { LIMITS, cleanTuning, isDefault, readTuning, writeTuning } from '../src/wraeclast/tuning.ts';
import { arrive, nodeAt, playOn, wrongLine } from '../src/qa/benches/wraeclastSetup.ts';

// The Wraeclast run's log and tuning (src/wraeclast/rules.ts, runLog.ts,
// tuning.ts) against the handoff, docs/handoff/wraeclast/v3.md ("Run log",
// "Tuning panel"). One item is scripted on a fake clock and its log written
// out in full here, from the handoff's rules; whole runs are played and their
// logs checked against what they played. The handoff's numbers are written
// out again here, so rules.ts can't move both.

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);

const HANDOFF: Tuning = {
  life: 100,
  gold: 20,
  flask: 2,
  itemsPerZone: 3,
  zoneShare: 83,
  tiles: { early: 14, mid: 20, late: 26, boss: 32 },
  missCost: { early: [20, 30], mid: [30, 40], late: [40, 50], boss: [55, 65] },
  price: { flare: 6, wisdom: 6, lore: 6, category: 6, base: 6, decoy: 6, lengths: 4, first: 6 },
  stack: { flare: 3, wisdom: 3, lore: 2, category: 2, base: 1, decoy: 3, lengths: 3, first: 2 },
  burnIn: { flare: 12, blight: 4, boss: 4 },
  seeds: 9,
  loot: {
    cards: { plain: 2, incursion: 2, essence: 1, ritual: 2, expedition: 1, blight: 2 },
    weights: { gold: 10, supply: 8, flask: 2, jackpot: 1 },
    gold: { early: [4, 8], mid: [6, 10], late: [8, 12] },
    jackpot: 25,
    supplies: 2,
  },
  corruption: { seeds: 3, creep: 2, weights: { blood: 2, sealed: 2, swarming: 2, dark: 2, bounty: 1 }, multiplier: 2 },
  marks: 'both',
  freeClue: { plain: true, incursion: true, essence: true, ritual: true, expedition: true, blight: true },
};

/** Every field the handoff's "Run log" lists, per item and per run. */
const ITEM_FIELDS = ['itemId', 'category', 'step', 'zoneType', 'corruption', 'boss', 'tiles', 'freeClue', 'supplies', 'burnIns', 'submits', 'lifeBefore', 'lifeAfter', 'drank', 'loot'] as const;
const RUN_FIELDS = ['route', 'travel', 'met', 'fronts', 'bossMods', 'bought', 'found', 'used', 'loot', 'goldEarned', 'goldSpent', 'ms', 'result', 'tuning', 'viewport'] as const;

const T0 = Date.UTC(2026, 9, 19, 12);
const iso = (ms: number) => new Date(ms).toISOString();
const count = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

/** A run on a fake clock that `tick` moves on. */
function ticking(seed: number, tuning: Tuning = DEFAULT_TUNING, viewport = 0) {
  const clock = { t: T0 };
  const run = new Run({ seed, tuning, viewport, now: () => clock.t });
  return { run, tick: () => (clock.t += 50) };
}

/** A whole run played: vendors and Wells left, the leftmost node picked, wrong first now and then, a drink after. */
function played(seed: number, { misses = true, tuning = DEFAULT_TUNING } = {}) {
  const { run, tick } = ticking(seed, tuning, 375);
  // Something bought at the camp, for the log's purchases.
  run.buy(run.state.stock.indexOf('lengths'));
  run.buy(run.state.stock.indexOf('flare'));
  const s = run.state;
  // Supplies used on every item they work on, for the log's uses.
  playOn(
    run,
    () => {
      tick();
      if (s.phase === 'item' && s.item!.openedAt !== null && !s.item!.log.supplies.length) for (const sup of ['flare', 'lengths'] as const) run.use(sup);
      return false;
    },
    { misses },
  );
  return run;
}

const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);
const byKind = (cards: { kind: LootKind }[]) => {
  const out = count(LOOT_KINDS);
  for (const c of cards) out[c.kind]++;
  return out;
};

/** What a played run's log must say of itself: each total the sum of its items', the route the travel's picks. */
function consistent(run: Run) {
  const s = run.state;
  const log = s.log;
  assert.equal(log.v, 3);
  // The route: the camp, then each travel step's pick, among the nodes linked ahead.
  assert.deepEqual(log.route, [GRAPH.camp.id, ...log.travel.map((t) => t.picked)]);
  log.travel.forEach((t, k) => {
    assert.deepEqual(t.offered, GRAPH.next[log.route[k]]);
    assert.ok(t.offered.includes(t.picked));
  });
  // What each node was, met in the order of the route.
  assert.deepEqual(
    log.met.map((m) => m.node),
    log.route.slice(1),
  );
  for (const m of log.met) {
    const p = s.places[m.node];
    assert.equal(m.kind, p.kind);
    assert.equal(m.zoneType, p.kind === 'zone' ? p.type : null);
    if (m.corruption) assert.equal(m.corruption, s.corrupt[m.node].hidden);
  }
  for (const it of log.items) {
    const m = log.met.find((x) => x.node === it.node)!;
    assert.equal(it.corruption, m.corruption, `${it.itemId} at ${it.node}`);
    assert.equal(it.zoneType, m.zoneType ?? 'boss');
    assert.equal(it.boss, m.kind === 'boss');
    assert.equal(it.step, GRAPH.byId.get(it.node)!.step);
    assert.equal(it.category, itemOf(it.itemId).category);
    assert.deepEqual(it.tiles.answer, SYLLABLES[it.itemId].flat());
    assert.ok(it.tiles.decoys.every((d) => !it.tiles.answer.includes(d)));
  }
  // The fronts.
  assert.equal(log.fronts.seeded, s.fronts.length);
  assert.equal(log.fronts.stopped, s.fronts.filter((f) => !f.alive).length);
  if (log.route.at(-1) === GRAPH.boss.id) {
    assert.equal(log.fronts.aliveAtBoss, s.fronts.filter((f) => f.alive).length);
    assert.deepEqual(log.bossMods, s.bossMods);
    assert.equal(log.bossMods.length, Math.min(3, log.fronts.aliveAtBoss!));
  } else assert.deepEqual([log.fronts.aliveAtBoss, log.bossMods], [null, []]);
  // Supplies used and found, and the loot dealt and taken.
  const used = count(SUPPLIES);
  const dealt = count(SUPPLIES);
  for (const it of log.items) {
    for (const u of it.supplies) used[u.type]++;
    for (const c of it.loot) if (c.supply) dealt[c.supply] += c.n;
  }
  assert.deepEqual(log.used, used);
  // Found only once in the pack: a card left behind isn't.
  for (const k of SUPPLIES) assert.ok(log.found[k] <= dealt[k], k);
  assert.deepEqual(log.loot.dealt, byKind(log.items.flatMap((it) => it.loot)));
  for (const k of LOOT_KINDS) assert.ok(log.loot.taken[k] <= log.loot.dealt[k], k);
  for (const k of ['gold', 'jackpot', 'flask'] as const) assert.equal(log.loot.taken[k], log.loot.dealt[k], k);
  // Gold, misses, drinks, life.
  assert.equal(log.goldEarned, sum(log.items, (it) => it.gold));
  assert.equal(s.gold, s.tuning.gold - log.goldSpent + log.goldEarned);
  assert.equal(log.misses, sum(log.items, (it) => it.misses));
  assert.equal(log.drinks, sum(log.items, (it) => it.drank.length));
  assert.equal(log.lifeEnd, s.life);
  // Each item's submits: the last right (in a won run), every miss marked as Wordle does and its cost logged.
  for (const it of log.items) {
    assert.equal(it.misses, it.submits.filter((x) => !x.right).length);
    for (const x of it.submits) {
      if (x.right) assert.deepEqual([x.marks, x.lost], [[], 0]);
      else {
        assert.deepEqual(x.marks, markLine(x.tiles, it.tiles.answer));
        assert.ok(x.lost > 0);
      }
    }
    // Life: what the toll and the misses took, and back no more than the drinks heal (capped at the most as they come in).
    const lost = it.lifeBefore - it.toll - sum(it.submits, (x) => x.lost);
    assert.ok(it.lifeAfter >= lost && it.lifeAfter <= Math.min(100, lost + 10 * it.drank.length + it.healed), `${it.itemId}: life ${it.lifeBefore} to ${it.lifeAfter}`);
  }
  // Between items life only rises (a town's heal).
  log.items.forEach((it, k) => k && assert.ok(it.lifeBefore >= log.items[k - 1].lifeAfter));
  // The run's times.
  if (log.end) assert.equal(log.ms, Date.parse(log.end) - Date.parse(log.start));
}

// ---- The tuning a run plays with ----

test("the default tuning is the handoff's numbers, and a run starts with them", () => {
  assert.deepEqual(DEFAULT_TUNING, HANDOFF);
  const s = new Run({ seed: 9, now: () => T0 }).state;
  assert.deepEqual([s.life, s.gold, s.flask.charges, s.pack.length], [100, 20, 2, 0]);
  assert.deepEqual(s.log.tuning, HANDOFF);
});

test("the log keeps its own copy of the tuning: later changes to the tuning given, or to the run's, don't alter it", () => {
  const tuning = tuned((t) => (t.gold = 33));
  const kept = structuredClone(tuning);
  const run = new Run({ seed: 7, now: () => T0, tuning });
  tuning.life = 1;
  tuning.missCost.early[0] = 99;
  tuning.corruption.weights.dark = 99;
  tuning.freeClue.plain = false;
  assert.deepEqual(run.state.log.tuning, kept);
  assert.deepEqual(run.state.tuning, kept);
  run.state.tuning.price.wisdom = 1;
  run.state.tuning.loot.gold.early[1] = 1;
  assert.deepEqual(run.state.log.tuning, kept);
});

// ---- A fresh log ----

test('a fresh log is v3: its start, the camp, the fronts seeded, nothing played', () => {
  const s = new Run({ seed: 3, now: () => T0, viewport: 412 }).state;
  assert.deepEqual({ ...s.log, tuning: null }, {
    v: 3,
    seed: 3,
    start: iso(T0),
    end: null,
    ms: 0,
    result: null,
    endedOn: null,
    route: [GRAPH.camp.id],
    travel: [],
    met: [],
    fronts: { seeded: 3, stopped: 0, aliveAtBoss: null },
    bossMods: [],
    misses: 0,
    bought: count(SUPPLIES),
    found: count(SUPPLIES),
    used: count(SUPPLIES),
    loot: { dealt: count(LOOT_KINDS), taken: count(LOOT_KINDS) },
    goldEarned: 0,
    goldSpent: 0,
    drinks: 0,
    lifeEnd: 100,
    tuning: null,
    viewport: 412,
    items: [],
  });
});

// ---- One item, in full ----

test("an item's log, in full: its tiles, free clue, supplies, burn-ins, submits with their marks and cost, toll, life, drink and loot", () => {
  const clock = { t: T0 };
  const run = new Run({ seed: 2, now: () => clock.t, viewport: 375 });
  const s = run.state;
  assert.ok(run.buy(s.stock.indexOf('flare')));
  const id = nodeAt(2);
  arrive(run, id, { place: { kind: 'zone', type: 'plain' }, hidden: 'blood' });
  clock.t += 1000;
  run.enter();
  const it = s.item!;
  clock.t += 2500;
  run.open(gridAdjacency(9));
  clock.t += 1000;
  assert.ok(run.use('flare'));
  clock.t += 1000;
  const line = wrongLine(it, 0);
  it.build = line;
  assert.equal(run.submit(), false);
  const lost = it.log.submits[0].lost;
  assert.ok(lost >= 20 && lost <= 30);
  clock.t += 500;
  assert.ok(run.drink());
  clock.t += 1500;
  run.clear();
  for (const t of it.answer) run.place(t);
  assert.equal(run.submit(), true);
  run.next();
  const cards = structuredClone(s.loot!.cards);
  run.collect();
  while (s.loot!.pending.length) run.keep(null);
  run.next();
  const c = CLUES[it.itemId];
  const want: ItemLog = {
    itemId: it.itemId,
    name: itemOf(it.itemId).name,
    category: itemOf(it.itemId).category,
    step: 2,
    node: id,
    zoneType: 'plain',
    corruption: 'blood',
    boss: false,
    tiles: { answer: SYLLABLES[it.itemId].flat(), decoys: [...it.decoys] },
    freeClue: c.mods.length ? 'mod' : 'lengths',
    supplies: [{ type: 'flare', order: 1, ms: 1000 }],
    burnIns: [{ by: 'flare', patches: 12, ms: 1000 }],
    patches: 81,
    submits: [
      { tiles: line, right: false, marks: markLine(line, it.answer), lost, ms: 2000 },
      { tiles: [...it.answer], right: true, marks: [], lost: 0, ms: 4000 },
    ],
    lifeBefore: 100,
    lifeAfter: 100 - 10 - lost + 10 + 10,
    toll: 10,
    healed: 10,
    drank: [2500],
    loot: cards,
    misses: 1,
    gold: sum(cards, (x) => x.gold),
  };
  assert.deepEqual(s.log.items[0], want);
  // A blood-tolled zone corrupted: twice the plain zone's 2 cards, one lost to the miss.
  assert.equal(cards.length, 3);
  assert.deepEqual(s.log.met.at(-1), { node: id, kind: 'zone', zoneType: 'plain', corruption: 'blood' });
  assert.deepEqual([s.log.bought.flare, s.log.used.flare, s.log.goldSpent, s.log.misses, s.log.drinks], [3, 1, 6, 1, 1]);
  assert.deepEqual(s.log.loot.dealt, byKind(cards));
});

test("a free burn-in is logged as the zone's, and a gold-only miss logs 'none' for the marks it hides", () => {
  const run = new Run({ seed: 4, now: () => T0, tuning: tuned((t) => (t.marks = 'gold')) });
  arrive(run, nodeAt(2), { place: { kind: 'zone', type: 'blight' } });
  run.enter();
  run.open(gridAdjacency(9));
  const it = run.state.item!;
  assert.deepEqual([it.log.freeClue, it.log.burnIns], ['burn', [{ by: 'zone', patches: 4, ms: 0 }]]);
  it.build = wrongLine(it, 0);
  run.submit();
  const sub = it.log.submits[0];
  assert.deepEqual(
    sub.marks,
    markLine(sub.tiles, it.answer).map((m) => (m === 'gold' ? m : 'none')),
  );
});

// ---- Whole runs ----

test('every field the handoff lists is in the log, per item and per run', () => {
  const log = played(1).state.log;
  const missing = log.items.flatMap((it, n) => ITEM_FIELDS.filter((f) => !Object.hasOwn(it, f)).map((f) => `item ${n}: ${f}`));
  missing.push(...RUN_FIELDS.filter((f) => !Object.hasOwn(log, f)));
  assert.deepEqual(missing, []);
});

test('a played run logs what it played: route, travel, nodes met, fronts, boss modifiers, supplies, loot, gold, misses and life', () => {
  for (const seed of [1, 2, 3, 5, 8]) {
    const run = played(seed);
    const log = run.state.log;
    consistent(run);
    if (log.result === 'win') {
      assert.equal(log.route.at(-1), GRAPH.boss.id);
      assert.deepEqual(log.endedOn, { n: log.items.length - 1, itemId: log.items.at(-1)!.itemId, name: log.items.at(-1)!.name, node: GRAPH.boss.id });
    }
    assert.ok(log.result !== null);
    assert.deepEqual([log.bought.lengths, log.bought.flare, log.goldSpent, log.viewport], [3, 3, 10, 375]);
    assert.ok(log.used.flare > 0 && log.misses > 0 && log.drinks > 0, `seed ${seed}`);
  }
});

test('the run logs each travel step: the nodes offered and the one picked', () => {
  const log = played(6, { misses: false }).state.log;
  assert.equal(log.travel.length, log.route.length - 1);
  assert.equal(log.travel.length, GRAPH.steps.length - 1);
  assert.deepEqual(log.travel[0].offered, GRAPH.next[GRAPH.camp.id]);
  // The leftmost each time, as the play picks.
  assert.ok(log.travel.every((t) => t.picked === t.offered[0]));
});

test('a lost run logs the item it ended on, at 0 life, its last miss cut to the life left', () => {
  const { run, tick } = ticking(10, DEFAULT_TUNING, 390);
  const s = run.state;
  playOn(run, () => tick() > 0 && s.log.items.length === 1 && s.phase === 'item' && s.item!.openedAt !== null);
  const it = s.item!;
  while (s.phase !== 'end') {
    tick();
    it.build = wrongLine(it, it.misses);
    it.lineMarks = null;
    run.submit();
  }
  const log = s.log;
  consistent(run);
  assert.deepEqual([log.result, log.lifeEnd, log.items.length, log.viewport], ['loss', 0, 2, 390]);
  assert.deepEqual(log.endedOn, { n: 1, itemId: it.itemId, name: it.log.name, node: it.node });
  const last = log.items[1];
  assert.equal(last.lifeAfter, 0);
  assert.equal(sum(last.submits, (x) => x.lost), last.lifeBefore - last.toll);
  assert.deepEqual(last.loot, []);
  assert.ok(log.end && log.ms > 0);
});

test('a Blood toll at low life logs what it took, leaving 1, and the item plays on', () => {
  const run = new Run({ seed: 11, now: () => T0 });
  arrive(run, nodeAt(3), { place: { kind: 'zone', type: 'ritual' }, hidden: 'blood' });
  run.state.life = 6;
  run.enter();
  run.open(gridAdjacency(9));
  const it = run.state.item!;
  assert.deepEqual([run.state.phase, run.state.life, it.log.toll, it.log.lifeAfter, it.log.corruption], ['item', 1, 5, 1, 'blood']);
  assert.equal(run.state.log.result, null);
});

test('a supply card left with the pack full is dealt, but neither taken nor found', () => {
  const run = new Run({ seed: 12, now: () => T0, tuning: tuned((t) => (t.loot.weights = { gold: 0, supply: 1, flask: 0, jackpot: 0 })) });
  const s = run.state;
  s.pack = Array.from({ length: 8 }, () => ({ supply: 'base' as Supply, n: 5 }));
  arrive(run, nodeAt(2), { place: { kind: 'zone', type: 'plain' } });
  run.enter();
  run.open(gridAdjacency(9));
  s.item!.build = [...s.item!.answer];
  run.submit();
  run.next();
  run.collect();
  run.keep(0);
  run.keep(null);
  assert.deepEqual([s.log.loot.dealt.supply, s.log.loot.taken.supply], [2, 1]);
  assert.equal(sum(Object.values(s.log.found), (n) => n), 2);
});

test('the log is plain JSON: fresh, and played to its end', () => {
  const fresh = new Run({ seed: 3, now: () => T0 }).state.log;
  for (const log of [fresh, played(1).state.log, played(6, { tuning: tuned((t) => (t.missCost.early = [60, 60])) }).state.log]) assert.deepEqual(JSON.parse(JSON.stringify(log)), log);
});

// ---- Kept runs ----

const RUNS = storeKey('wraeclastRuns3');
const fakeLog = (seed: number, start = iso(T0)): RunLog => ({ ...structuredClone(new Run({ seed, now: () => T0 }).state.log), start });

test('a kept run reads back, as the log text the tester sends', () => {
  store.clear();
  const log = played(2).state.log;
  assert.deepEqual(readRuns(), []);
  assert.deepEqual(keepRun(log), [log]);
  assert.deepEqual(readRuns(), [log]);
  assert.deepEqual(JSON.parse(logText(readRuns())), { wraeclastRuns: [log] });
  assert.ok(store.has(RUNS));
});

test('the same run kept again replaces itself', () => {
  store.clear();
  const a = fakeLog(1);
  const b = fakeLog(2);
  keepRun(a);
  keepRun(b);
  const later = { ...a, result: 'win' as const };
  assert.deepEqual(keepRun(later), [b, later]);
  // Same seed, another start: another run.
  assert.equal(keepRun(fakeLog(1, iso(T0 + 1))).length, 3);
});

test(`only the last ${RUNS_KEPT} runs are kept, newest last`, () => {
  store.clear();
  assert.equal(RUNS_KEPT, 20);
  const logs = Array.from({ length: 25 }, (_, k) => fakeLog(k + 1));
  for (const log of logs) keepRun(log);
  assert.deepEqual(
    readRuns().map((r) => r.seed),
    logs.slice(5).map((r) => r.seed),
  );
});

test('only v3 logs are read: v2 logs, junk and a broken store read as nothing', () => {
  store.clear();
  const v3 = fakeLog(4);
  store.set(RUNS, JSON.stringify([{ v: 2, seed: 1 }, { seed: 2 }, null, 7, 'x', v3]));
  assert.deepEqual(readRuns(), [v3]);
  assert.deepEqual(
    keepRun(fakeLog(5)).map((r) => r.seed),
    [4, 5],
  );
  store.set(RUNS, '{"v":3}');
  assert.deepEqual(readRuns(), []);
  store.set(RUNS, 'not json');
  assert.deepEqual(readRuns(), []);
  // v2's key is never read.
  store.clear();
  store.set(storeKey('wraeclastRuns2'), JSON.stringify([v3]));
  assert.deepEqual(readRuns(), []);
});

// ---- The tuning panel's numbers ----

test("cleanTuning gives the handoff's tuning for nothing, and round-trips a right one as it is", () => {
  for (const raw of [null, undefined, 7, 'x', [], {}]) assert.deepEqual(cleanTuning(raw), HANDOFF);
  assert.deepEqual(cleanTuning(structuredClone(DEFAULT_TUNING)), HANDOFF);
  assert.deepEqual(cleanTuning(JSON.parse(JSON.stringify(DEFAULT_TUNING))), HANDOFF);
  const own = tuned((t) => {
    t.life = 250;
    t.itemsPerZone = 1;
    t.zoneShare = 100;
    t.tiles = { early: 8, mid: 36, late: 20, boss: 30 };
    t.missCost.late = [0, 999];
    t.price.first = 0;
    t.stack = { flare: 5, wisdom: 1, lore: 1, category: 1, base: 5, decoy: 2, lengths: 1, first: 1 };
    t.burnIn = { flare: 1, blight: 99, boss: 2 };
    t.seeds = 15;
    t.loot = { cards: { plain: 0, incursion: 9, essence: 1, ritual: 2, expedition: 3, blight: 4 }, weights: { gold: 0, supply: 99, flask: 2, jackpot: 3 }, gold: { early: [0, 0], mid: [1, 2], late: [5, 999] }, jackpot: 0, supplies: 5 };
    t.corruption = { seeds: 0, creep: 3, weights: { blood: 0, sealed: 99, swarming: 1, dark: 0, bounty: 5 }, multiplier: 5 };
    t.marks = 'gold';
    t.freeClue = { plain: false, incursion: true, essence: false, ritual: false, expedition: true, blight: true };
  });
  assert.deepEqual(cleanTuning(structuredClone(own)), own);
  assert.deepEqual(cleanTuning(JSON.parse(JSON.stringify(own))), own);
});

test('cleanTuning repairs field by field: a range with its low end above its high end', () => {
  const t = cleanTuning({ ...HANDOFF, missCost: { early: [30, 20], mid: [31, 39], late: [50, 40], boss: [65, 55] }, loot: { ...HANDOFF.loot, gold: { early: [9, 1], mid: [7, 7], late: [8] } } });
  assert.deepEqual(t.missCost, { early: [20, 30], mid: [31, 39], late: [40, 50], boss: [55, 65] });
  assert.deepEqual(t.loot.gold, { early: [4, 8], mid: [7, 7], late: [8, 12] });
});

test('cleanTuning repairs field by field: numbers out of their limits, or not whole', () => {
  const bad = {
    life: 0,
    gold: 1000,
    flask: 10,
    itemsPerZone: 4,
    zoneShare: 101,
    tiles: { early: 7, mid: 37, late: 20.5, boss: 30 },
    missCost: { early: [-1, 5], mid: [30, 1000], late: [40.5, 50], boss: [55, 60] },
    price: { flare: -1, wisdom: 1000, lore: 2.5, category: 3 },
    stack: { flare: 0, wisdom: 6, lore: 4 },
    burnIn: { flare: 0, blight: 100, boss: 0 },
    seeds: 2,
    loot: { cards: { plain: 10, essence: -1, ritual: 3 }, weights: { gold: -1, supply: 100, flask: 2.5, jackpot: 1 }, jackpot: 1000, supplies: 6 },
    corruption: { seeds: 6, creep: 0, weights: { blood: 100, dark: 3 }, multiplier: 0 },
    marks: 'silver',
  };
  const t = cleanTuning(bad);
  assert.deepEqual(t, {
    ...HANDOFF,
    tiles: { ...HANDOFF.tiles, boss: 30 },
    missCost: { ...HANDOFF.missCost, boss: [55, 60] },
    price: { ...HANDOFF.price, category: 3 },
    stack: { ...HANDOFF.stack, lore: 4 },
    loot: { ...HANDOFF.loot, cards: { ...HANDOFF.loot.cards, ritual: 3 }, weights: { ...HANDOFF.loot.weights, jackpot: 1 } },
    corruption: { ...HANDOFF.corruption, weights: { ...HANDOFF.corruption.weights, dark: 3 } },
  });
  assert.deepEqual([LIMITS.tiles, LIMITS.itemsPerZone, LIMITS.fronts, LIMITS.creep, LIMITS.stack], [[8, 36], [1, 3], [0, 5], [1, 3], [1, 5]]);
});

test('cleanTuning repairs field by field: wrong types', () => {
  const t = cleanTuning({
    life: '100',
    gold: true,
    flask: null,
    tiles: 'many',
    missCost: { early: '20-30', mid: [30], late: [40, 45, 50] },
    price: [1, 2, 3],
    burnIn: 12,
    seeds: {},
    loot: { cards: null, weights: 'x', gold: { early: { 0: 4, 1: 8 }, mid: [6, '10'] }, jackpot: false },
    corruption: 'all',
    marks: true,
    freeClue: { plain: 'no', incursion: 0, ritual: false, blight: null },
  });
  assert.deepEqual(t, { ...HANDOFF, freeClue: { ...HANDOFF.freeClue, ritual: false } });
});

test("cleanTuning's ranges are copies, never the handoff's own arrays", () => {
  const t = cleanTuning(null);
  t.missCost.early[0] = 1;
  t.loot.gold.late[1] = 1;
  t.price.flare = 1;
  assert.deepEqual(cleanTuning(null), HANDOFF);
  assert.deepEqual(DEFAULT_TUNING, HANDOFF);
});

test('the tuning panel keeps its numbers in storage and reads them back cleaned', () => {
  store.clear();
  assert.deepEqual(readTuning(), HANDOFF);
  assert.ok(isDefault(readTuning()));
  const own = tuned((t) => ((t.itemsPerZone = 1), (t.marks = 'gold'), (t.corruption.seeds = 5)));
  writeTuning(own);
  assert.deepEqual(readTuning(), own);
  assert.equal(isDefault(own), false);
  const key = storeKey('wraeclastTuning3');
  assert.ok(store.has(key));
  store.set(key, JSON.stringify({ ...own, life: -5 }));
  assert.deepEqual(readTuning(), { ...own, life: 100 });
  store.set(key, '{not json');
  assert.deepEqual(readTuning(), HANDOFF);
  // v2's kept tuning is never read.
  store.clear();
  store.set(storeKey('wraeclastTuning2'), JSON.stringify(own));
  assert.deepEqual(readTuning(), HANDOFF);
});
