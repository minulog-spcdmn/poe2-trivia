import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';
import { storeKey } from '../src/lib/storage.ts';
import {
  Run,
  CLUES,
  CORRUPTIONS,
  DEFAULT_TUNING,
  ITEMS,
  PACK_SLOTS,
  SUPPLIES,
  WARES,
  answerOf,
  buildText,
  commonLines,
  type Corruption,
  type ItemLog,
  type ItemPlay,
  type LootCard,
  type RunLog,
  type Supply,
  type Tuning,
  type Ware,
  type ZoneType,
} from '../src/wraeclast/rules.ts';
import { RUNS_KEPT, keepRun, logText, readRuns } from '../src/wraeclast/runLog.ts';
import { LIMITS, cleanTuning, isDefault, readTuning, writeTuning } from '../src/wraeclast/tuning.ts';

// The Wraeclast run's log and tuning (src/wraeclast/rules.ts, runLog.ts,
// tuning.ts) against the handoff, docs/handoff/wraeclast/v2.md ("Run log",
// "Tuning panel"). A played run is scripted on a fake clock, and what its log
// should say is worked out here as it plays, from the handoff's rules, then
// compared with the whole log. The handoff's numbers are written out again
// here, so rules.ts can't move both.

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);

const HANDOFF: Tuning = {
  life: 100,
  gold: 20,
  flask: 2,
  missCost: { early: [20, 30], late: [30, 40], boss: [55, 65] },
  price: { flare: 5, wisdom: 5, strike: 6, lengths: 4, first: 8, decoy: 6, vaal: 4 },
  board: { early: 4, late: 6, boss: 10 },
  otherNames: 50,
  burnIn: { flare: 4, blight: 2, unveiled: 12, boss: 4 },
  seeds: 9,
  loot: {
    deal: 3,
    weights: { gold: 10, supply: 8, vaal: 3, flask: 2, jackpot: 1 },
    gold: { early: [4, 8], late: [6, 10] },
    jackpot: 25,
  },
  corruption: { gilded: 2, unveiled: 2, twisted: 2, bricked: 1 },
  freeClue: { plain: true, incursion: true, ritual: true, blight: true },
  spacing: true,
};

/** Every field the handoff's "Run log" lists, per item and per run (v1's and v2's). */
const ITEM_FIELDS = ['itemId', 'category', 'zone', 'zoneType', 'corruption', 'boss', 'names', 'board', 'freeClue', 'supplies', 'burnIns', 'submits', 'lifeBefore', 'lifeAfter', 'deal', 'took', 'drank', 'vaal'] as const;
const RUN_FIELDS = ['start', 'end', 'result', 'endedOn', 'misses', 'noSupply', 'bought', 'used', 'found', 'vaalUsed', 'outcomes', 'unid', 'goldEarned', 'goldSpent', 'drinks', 'lifeEnd', 'spacing', 'tuning', 'viewport'] as const;

const T0 = Date.UTC(2026, 9, 19, 12);
const iso = (ms: number) => new Date(ms).toISOString();
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
const count = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

/** The Veil the page would cut: a side x side grid, each patch touching its 4 neighbours. */
function grid(side = 9): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const nb: number[] = [];
      if (x > 0) nb.push(y * side + x - 1);
      if (x < side - 1) nb.push(y * side + x + 1);
      if (y > 0) nb.push((y - 1) * side + x);
      if (y < side - 1) nb.push((y + 1) * side + x);
      out.push(nb);
    }
  return out;
}

/**
 * A scripted run on a fake clock, and what its log should say: each item's
 * and the run's, worked out from the handoff's rules as the script plays.
 */
class Play {
  run: Run;
  t = T0;
  opened = T0;
  life: number;
  max: number;
  /** Items the last drink still heals after. */
  recovering = 0;
  w: ItemLog | null = null;
  want: RunLog;

  constructor(seed: number, tuning: Tuning = DEFAULT_TUNING, viewport = 0) {
    this.run = new Run({ seed, tuning, viewport, now: () => this.t });
    this.life = this.max = tuning.life;
    this.want = {
      v: 2,
      seed,
      start: iso(T0),
      end: null,
      result: null,
      endedOn: null,
      zones: [...this.run.state.zones],
      misses: 0,
      noSupply: 0,
      bought: count(WARES),
      used: count(SUPPLIES),
      found: count(WARES),
      vaalUsed: 0,
      outcomes: count(CORRUPTIONS),
      unid: { offered: 0, taken: 0 },
      goldEarned: 0,
      goldSpent: 0,
      drinks: 0,
      lifeEnd: tuning.life,
      spacing: tuning.spacing,
      tuning: structuredClone(tuning),
      viewport,
      items: [],
    };
  }

  get it(): ItemPlay {
    return this.run.state.item!;
  }

  wait(ms: number) {
    this.t += ms;
  }

  get ms() {
    return this.t - this.opened;
  }

  buy(ware: Ware) {
    const s = this.run.state;
    assert.ok(this.run.buy(s.stock.indexOf(ware)), `buying ${ware}`);
    this.want.bought[ware]++;
    this.want.goldSpent += s.tuning.price[ware];
  }

  /** On to the next item and opens it 2.5 s after it's laid out (time the log doesn't count). */
  open(): ItemLog {
    const { run } = this;
    const s = run.state;
    for (;;) {
      if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
      else if (s.phase === 'travel') assert.ok(run.enter());
      else if (s.phase === 'item') break;
      else assert.fail(`no item in phase ${s.phase}`);
    }
    const it = this.it;
    const n = it.n;
    this.wait(2500);
    assert.ok(run.open(grid()));
    this.opened = this.t;
    const zoneType: ZoneType | 'boss' = n < 12 ? s.zones[Math.floor(n / 3)] : 'boss';
    const t = s.tuning;
    const common = commonLines(CLUES[it.itemId]).length > 0;
    const freeClue = zoneType === 'boss' ? (n === 12 ? 'burn' : 'none') : !t.freeClue[zoneType] ? 'none' : { plain: common ? 'mod' : 'lengths', incursion: 'flavor', ritual: 'lengths', blight: 'burn' }[zoneType];
    const size = Math.min(10, t.board[n < 6 ? 'early' : n < 12 ? 'late' : 'boss'] + (zoneType === 'blight' ? 2 : 0));
    assert.equal(it.names.length, size);
    this.w = {
      itemId: it.itemId,
      name: BY_ID.get(it.itemId)!.name,
      category: BY_ID.get(it.itemId)!.category,
      zone: n < 12 ? Math.floor(n / 3) + 1 : 5,
      zoneType,
      corruption: null,
      boss: n >= 12,
      names: size,
      board: it.names.map((nm) => (nm.id === it.itemId ? { name: nm.name, answer: true as const } : { name: nm.name })),
      freeClue: freeClue as ItemLog['freeClue'],
      supplies: [],
      burnIns: freeClue === 'burn' ? [{ by: n === 12 ? 'boss' : 'zone', patches: n === 12 ? t.burnIn.boss : t.burnIn.blight, ms: 0 }] : [],
      patches: 81,
      submits: [],
      lifeBefore: this.life,
      lifeAfter: this.life,
      healed: 0,
      deal: [],
      took: null,
      drank: [],
      vaal: null,
      misses: 0,
      gold: 0,
    };
    this.want.items.push(this.w);
    return this.w;
  }

  use(sup: Supply) {
    const w = this.w!;
    const size = this.run.flareBurn();
    const burned = this.it.burned.length;
    assert.ok(this.run.use(sup), `using ${sup}`);
    w.supplies.push({ type: sup, order: w.supplies.length + 1, ms: this.ms });
    if (sup === 'flare') w.burnIns.push({ by: 'flare', patches: Math.min(size, 81 - burned), ms: this.ms });
    this.want.used[sup]++;
  }

  corrupt(): Corruption {
    const w = this.w!;
    const it = this.it;
    const burned = it.burned.length;
    const outcome = this.run.corrupt()!;
    assert.ok(outcome);
    w.corruption = outcome;
    w.vaal = { outcome, suppliesBefore: w.supplies.length, ms: this.ms };
    if (outcome === 'unveiled') w.burnIns.push({ by: 'vaal', patches: Math.min(12, 81 - burned), ms: this.ms });
    if (outcome === 'twisted') {
      w.names = Math.min(10, w.names + 3);
      w.board = it.names.map((nm) => (nm.id === it.itemId ? { name: nm.name, answer: true as const } : { name: nm.name }));
    }
    this.want.vaalUsed++;
    this.want.outcomes[outcome]++;
    return outcome;
  }

  drink() {
    assert.ok(this.run.drink());
    this.life = Math.min(this.max, this.life + 10);
    this.recovering = 2;
    this.w!.drank.push(this.ms);
    this.want.drinks++;
  }

  private send(syllables: string[], right: boolean) {
    const { run } = this;
    const it = this.it;
    const w = this.w!;
    run.clear();
    for (const syl of syllables.slice(it.locked)) assert.ok(run.place(syl), syl);
    const text = buildText(it, run.state.tuning.spacing);
    const range = run.missRange();
    assert.equal(run.submit(), right);
    const lost = right ? 0 : it.log.submits.at(-1)!.lost;
    if (!right) {
      assert.ok(lost === this.life || (lost >= range[0] && lost <= range[1]), `a miss lost ${lost}`);
      this.life -= lost;
      w.misses++;
      this.want.misses++;
    }
    w.submits.push({ text, right, ms: this.ms, lost });
    w.lifeAfter = this.life;
    if (this.life <= 0) this.ended('loss');
  }

  /** A build that is no name: the answer and its first syllable once more per miss so far. */
  miss() {
    const syl = answerOf(this.it).words.flat();
    this.send([...syl, ...Array<string>(this.w!.misses + 1).fill(syl[0])], false);
  }

  /** The answer: the flask heals as the item ends; then the loot deal, or on. */
  answer() {
    const w = this.w!;
    this.send(answerOf(this.it).words.flat(), true);
    if (!w.supplies.length) this.want.noSupply++;
    if (this.recovering > 0) {
      w.healed = Math.min(10, this.max - this.life);
      this.life += w.healed;
      this.recovering--;
    }
    w.lifeAfter = this.life;
    const dealt = !w.boss && w.corruption !== 'bricked';
    assert.ok(this.run.next());
    if (dealt) {
      assert.equal(this.run.state.phase, 'loot');
      w.deal = structuredClone(this.run.state.loot!.cards);
      this.want.unid.offered++;
    } else this.done();
  }

  /** Takes loot card `i`; a ware the full pack can't hold replaces `slot`, or is left. */
  take(i: number, slot: number | null = null) {
    const { run } = this;
    const w = this.w!;
    const card: LootCard = w.deal[i];
    const full = run.state.pack.length >= PACK_SLOTS;
    assert.ok(run.take(i));
    w.took = { index: i, kept: true };
    if (card.unid) this.want.unid.taken++;
    if (card.kind === 'gold' || card.kind === 'jackpot') {
      w.gold = card.gold;
      this.want.goldEarned += card.gold;
    } else if (card.kind === 'supply' || card.kind === 'vaal') {
      this.want.found[card.kind === 'vaal' ? 'vaal' : card.supply!]++;
      if (full) {
        assert.ok(run.keep(slot));
        if (slot === null) w.took.kept = false;
      }
    }
    assert.ok(run.next());
    this.done();
  }

  /** The item done: the town's heal after zone 2, the end after the boss. */
  private done() {
    const n = this.want.items.length;
    if (n === 6) this.life += Math.min(20, this.max - this.life);
    if (n === 15) this.ended('win');
  }

  private ended(result: 'win' | 'loss') {
    const last = this.want.items.at(-1)!;
    Object.assign(this.want, {
      end: iso(this.t),
      result,
      endedOn: { n: this.want.items.length - 1, itemId: last.itemId, name: last.name },
      lifeEnd: this.life,
    });
  }
}

/** A won run: supplies bought at the camp and the town, used, a Vaal Orb, two drinks, misses in every section, every kind of take. */
function wonRun(seed = 2, tuning = tuned((t) => ((t.missCost.boss = [10, 10]), (t.gold = 40)))) {
  const p = new Play(seed, tuning, 375);
  p.wait(30_000);
  for (const ware of ['flare', 'decoy', 'vaal'] as const) p.buy(ware);
  for (let n = 0; n < 15; n++) {
    p.open();
    p.wait(700 + n * 100);
    if (n === 0) {
      p.use('flare');
      p.wait(1500);
      p.miss();
      p.wait(400);
      p.drink();
    }
    if (n === 1 && p.run.canUse('decoy')) p.use('decoy');
    if (n === 2) {
      p.wait(300);
      p.corrupt();
      p.wait(300);
      p.miss();
    }
    if (n === 4) {
      p.miss();
      p.miss();
      p.drink();
    }
    if (n === 7) p.miss();
    if (n === 12) {
      p.use('flare');
      p.miss();
    }
    p.wait(2000);
    p.answer();
    if (p.run.state.phase === 'loot') {
      const cards = p.w!.deal;
      // Turns through: the face-down card, the first, the last.
      const i = n % 3 === 0 ? cards.findIndex((c) => c.unid) : n % 3 === 1 ? 0 : cards.length - 1;
      p.take(i);
    }
    if (n === 5) {
      assert.equal(p.run.state.phase, 'town');
      p.buy('flare');
      p.buy('lengths');
    }
    if (n === 6 && p.run.canUse('lengths')) p.use('lengths');
  }
  assert.equal(p.run.state.phase, 'end');
  return p;
}

/** A lost run: one item right, then misses until life runs out. */
function lostRun() {
  const p = new Play(1, DEFAULT_TUNING, 390);
  p.buy('lengths');
  p.open();
  p.wait(4200);
  p.answer();
  p.take(0);
  p.open();
  p.wait(1000);
  if (p.run.canUse('lengths')) p.use('lengths');
  while (p.run.state.phase !== 'end') {
    p.wait(1000);
    p.miss();
  }
  return p;
}

// ---- The tuning a run plays with ----

test("the default tuning is the handoff's numbers, and a run starts with them", () => {
  assert.deepEqual(DEFAULT_TUNING, HANDOFF);
  const s = new Run({ seed: 9, now: () => T0 }).state;
  assert.deepEqual([s.life, s.gold, s.flask.charges, s.pack.length], [100, 20, 2, 0]);
  assert.deepEqual(s.log.tuning, HANDOFF);
});

test("starting life, gold and flask charges are the tuning's", () => {
  const { state: s } = new Run({ seed: 8, now: () => T0, tuning: tuned((t) => Object.assign(t, { life: 40, gold: 9, flask: 3 })) });
  assert.deepEqual([s.life, s.maxLife, s.gold, s.flask.charges], [40, 40, 9, 3]);
  assert.deepEqual([s.log.tuning.life, s.log.tuning.gold, s.log.tuning.flask, s.log.lifeEnd], [40, 9, 3, 40]);
});

test("the log keeps its own copy of the tuning: later changes to the tuning given, or to the run's, don't alter it", () => {
  const tuning = tuned((t) => (t.gold = 33));
  const kept = structuredClone(tuning);
  const run = new Run({ seed: 7, now: () => T0, tuning });
  tuning.life = 1;
  tuning.missCost.early[0] = 99;
  tuning.price.flare = 99;
  tuning.loot.weights.gold = 0;
  tuning.corruption.bricked = 99;
  tuning.freeClue.plain = false;
  tuning.spacing = false;
  assert.deepEqual(run.state.log.tuning, kept);
  assert.deepEqual(run.state.tuning, kept);
  run.state.tuning.price.wisdom = 1;
  run.state.tuning.loot.gold.early[1] = 1;
  assert.deepEqual(run.state.log.tuning, kept);
  assert.equal(run.state.log.spacing, true);
});

// ---- A played run's log ----

test('every field the handoff lists is in the log, per item and per run', () => {
  const log = wonRun().run.state.log;
  const missing = log.items.flatMap((it, n) => ITEM_FIELDS.filter((f) => !Object.hasOwn(it, f)).map((f) => `item ${n}: ${f}`));
  missing.push(...RUN_FIELDS.filter((f) => !Object.hasOwn(log, f)));
  assert.deepEqual(missing, []);
});

test('a won run logs each item exactly: zone, board, free clue, supplies, burn-ins, submits, life, deal, take, drinks and Vaal Orb', () => {
  const p = wonRun();
  const log = p.run.state.log;
  assert.equal(log.items.length, 15);
  log.items.forEach((it, n) => assert.deepEqual(it, p.want.items[n], `item ${n}`));
});

test("a won run logs the run's totals: times, result, misses, wares bought, used and found, Vaal Orbs, outcomes, unidentified cards, gold, drinks, life, spacing, tuning, viewport", () => {
  const p = wonRun();
  const log = p.run.state.log;
  assert.deepEqual(log, p.want);
  assert.equal(log.result, 'win');
  assert.equal(log.viewport, 375);
  assert.deepEqual(log.endedOn, { n: 14, itemId: log.items[14].itemId, name: log.items[14].name });
  assert.equal(log.vaalUsed, 1);
  assert.equal(log.bought.vaal, 1);
  assert.equal(log.bought.flare, 2);
  assert.equal(log.drinks, 2);
  assert.equal(log.misses, 6);
  assert.ok(log.unid.taken >= 3 && log.unid.taken <= log.unid.offered, JSON.stringify(log.unid));
  assert.equal(p.run.state.gold, 40 - log.goldSpent + log.goldEarned);
});

test('the run logs what it played over many seeds, not one lucky one', () => {
  for (const seed of [3, 4, 5, 6, 11, 12]) {
    const p = wonRun(seed);
    assert.deepEqual(p.run.state.log, p.want, `seed ${seed}`);
  }
});

test('a lost run logs each item exactly, the last with life at 0 and the cost of its last miss cut to the life left', () => {
  const p = lostRun();
  const log = p.run.state.log;
  assert.deepEqual(log, p.want);
  assert.deepEqual([log.result, log.lifeEnd, log.items.length, log.viewport], ['loss', 0, 2, 390]);
  assert.deepEqual(log.endedOn, { n: 1, itemId: log.items[1].itemId, name: log.items[1].name });
  const last = log.items[1];
  assert.equal(last.lifeAfter, 0);
  assert.equal(
    last.submits.reduce((t, s) => t + s.lost, 0),
    last.lifeBefore,
  );
  assert.deepEqual([last.deal, last.took], [[], null]);
});

test('each submit logs what the miss cost, 0 when right', () => {
  const p = wonRun();
  for (const it of p.run.state.log.items)
    for (const s of it.submits) {
      if (s.right) assert.equal(s.lost, 0);
      else assert.ok(s.lost > 0);
    }
  assert.equal(
    p.run.state.log.items.reduce((t, it) => t + it.submits.reduce((u, s) => u + s.lost, 0), 0) > 0,
    true,
  );
});

test('a ware taken with the pack full and left is logged as taken, not kept, and still found', () => {
  const p = new Play(3, tuned((t) => (t.loot.weights = { gold: 0, supply: 1, vaal: 0, flask: 0, jackpot: 0 })));
  p.run.state.pack = Array<Ware>(PACK_SLOTS).fill('vaal');
  p.open();
  p.answer();
  p.take(1, null);
  p.open();
  p.answer();
  p.take(0, 2);
  const log = p.run.state.log;
  assert.deepEqual(log.items.map((it) => it.took), [{ index: 1, kept: false }, { index: 0, kept: true }]);
  assert.deepEqual(log.items, p.want.items);
  assert.deepEqual(log.found, p.want.found);
  assert.equal(Object.values(log.found).reduce((a, b) => a + b, 0), 2);
});

test('spacing is logged on or off, and the submits keep the line as it read', () => {
  for (const spacing of [true, false]) {
    const p = wonRun(5, tuned((t) => ((t.spacing = spacing), (t.missCost.boss = [10, 10]), (t.gold = 40))));
    const log = p.run.state.log;
    assert.deepEqual([log.spacing, log.tuning.spacing], [spacing, spacing]);
    assert.deepEqual(log, p.want);
    const spaced = log.items.flatMap((it) => it.submits).filter((s) => s.text.includes(' ')).length;
    if (spacing) assert.ok(spaced > 5, `${spaced} spaced`);
    else assert.equal(spaced, 0);
  }
});

test('the log is plain JSON: fresh, won and lost', () => {
  const fresh = new Run({ seed: 3, now: () => T0, viewport: 412 }).state.log;
  for (const log of [fresh, wonRun().run.state.log, lostRun().run.state.log]) assert.deepEqual(JSON.parse(JSON.stringify(log)), log);
  assert.deepEqual([fresh.v, fresh.start, fresh.end, fresh.result, fresh.endedOn, fresh.items.length, fresh.viewport], [2, iso(T0), null, null, null, 0, 412]);
});

// ---- Kept runs ----

const RUNS = storeKey('wraeclastRuns2');
const fakeLog = (seed: number, start = iso(T0)): RunLog => ({ ...structuredClone(new Run({ seed, now: () => T0 }).state.log), start });

test('a kept run reads back, as the log text the tester sends', () => {
  store.clear();
  const log = wonRun().run.state.log;
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
  const again = fakeLog(1, iso(T0 + 1));
  assert.deepEqual(keepRun(again).length, 3);
});

test(`only the last ${RUNS_KEPT} runs are kept, newest last`, () => {
  store.clear();
  assert.equal(RUNS_KEPT, 20);
  const logs = Array.from({ length: 25 }, (_, k) => fakeLog(k + 1));
  for (const log of logs) keepRun(log);
  const runs = readRuns();
  assert.equal(runs.length, 20);
  assert.deepEqual(
    runs.map((r) => r.seed),
    logs.slice(5).map((r) => r.seed),
  );
});

test('only v2 logs are read: v1 logs, junk and a broken store read as nothing', () => {
  store.clear();
  const v2 = fakeLog(4);
  store.set(RUNS, JSON.stringify([{ v: 1, seed: 1 }, { seed: 2 }, null, 7, 'x', v2]));
  assert.deepEqual(readRuns(), [v2]);
  assert.deepEqual(keepRun(fakeLog(5)).map((r) => r.seed), [4, 5]);
  store.set(RUNS, '{"v":2}');
  assert.deepEqual(readRuns(), []);
  store.set(RUNS, 'not json');
  assert.deepEqual(readRuns(), []);
  // v1's key is never read.
  store.clear();
  store.set(storeKey('wraeclastRuns'), JSON.stringify([v2]));
  assert.deepEqual(readRuns(), []);
});

// ---- The tuning panel's numbers ----

test('cleanTuning gives the handoff\'s tuning for nothing, and keeps a right one as it is', () => {
  for (const raw of [null, undefined, 7, 'x', [], {}]) assert.deepEqual(cleanTuning(raw), HANDOFF);
  const own = tuned((t) => {
    t.life = 250;
    t.missCost.late = [0, 999];
    t.price.vaal = 0;
    t.board = { early: 2, late: 10, boss: 3 };
    t.otherNames = 0;
    t.burnIn = { flare: 1, blight: 99, unveiled: 5, boss: 2 };
    t.seeds = 15;
    t.loot = { deal: 9, weights: { gold: 0, supply: 99, vaal: 1, flask: 2, jackpot: 3 }, gold: { early: [0, 0], late: [5, 999] }, jackpot: 0 };
    t.corruption = { gilded: 0, unveiled: 99, twisted: 1, bricked: 0 };
    t.freeClue = { plain: false, incursion: true, ritual: false, blight: true };
    t.spacing = false;
  });
  assert.deepEqual(cleanTuning(structuredClone(own)), own);
  assert.deepEqual(cleanTuning(JSON.parse(JSON.stringify(own))), own);
});

test('cleanTuning falls back field by field: a range with its low end above its high end', () => {
  const t = cleanTuning({ ...HANDOFF, missCost: { early: [30, 20], late: [31, 39], boss: [65, 55] }, loot: { ...HANDOFF.loot, gold: { early: [9, 1], late: [7, 7] } } });
  assert.deepEqual(t.missCost, { early: [20, 30], late: [31, 39], boss: [55, 65] });
  assert.deepEqual(t.loot.gold, { early: [4, 8], late: [7, 7] });
});

test('cleanTuning falls back field by field: numbers out of their limits, or not whole', () => {
  const bad = {
    life: 0,
    gold: 1000,
    flask: 10,
    missCost: { early: [-1, 5], late: [30, 1000], boss: [55.5, 60] },
    price: { flare: -1, wisdom: 1000, strike: 2.5, lengths: 3, first: 8, decoy: 6, vaal: 4 },
    board: { early: 1, late: 11, boss: 7 },
    otherNames: 101,
    burnIn: { flare: 0, blight: 100, unveiled: 12, boss: 3 },
    seeds: 2,
    loot: { deal: 0, weights: { gold: -1, supply: 100, vaal: 3, flask: 2.5, jackpot: 1 }, gold: { early: [4, 8], late: [6, 1000] }, jackpot: 1000 },
    corruption: { gilded: 100, unveiled: -2, twisted: 2, bricked: 1 },
  };
  const t = cleanTuning(bad);
  assert.deepEqual(
    { ...t, freeClue: undefined, spacing: undefined },
    {
      ...HANDOFF,
      price: { ...HANDOFF.price, lengths: 3 },
      board: { ...HANDOFF.board, boss: 7 },
      burnIn: { ...HANDOFF.burnIn, boss: 3 },
      freeClue: undefined,
      spacing: undefined,
    },
  );
  assert.deepEqual([cleanTuning({ seeds: 16 }).seeds, cleanTuning({ seeds: 3 }).seeds, cleanTuning({ loot: { deal: 10 } }).loot.deal], [9, 3, 3]);
  assert.deepEqual([LIMITS.board, LIMITS.otherNames, LIMITS.seeds], [[2, 10], [0, 100], [3, 15]]);
});

test('cleanTuning falls back field by field: wrong types', () => {
  const t = cleanTuning({
    life: '100',
    gold: true,
    flask: null,
    missCost: { early: '20-30', late: [30], boss: [55, 60, 65] },
    price: [1, 2, 3],
    board: 'big',
    otherNames: [50],
    burnIn: 4,
    seeds: {},
    loot: { deal: '3', weights: null, gold: { early: { 0: 4, 1: 8 }, late: [6, '10'] }, jackpot: false },
    corruption: 'all',
    freeClue: { plain: 'no', incursion: 0, ritual: false, blight: null },
    spacing: 'off',
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
  const own = tuned((t) => ((t.otherNames = 30), (t.spacing = false), (t.loot.deal = 4)));
  writeTuning(own);
  assert.deepEqual(readTuning(), own);
  assert.equal(isDefault(own), false);
  store.set(storeKey('wraeclastTuning2'), JSON.stringify({ ...own, life: -5 }));
  assert.deepEqual(readTuning(), { ...own, life: 100 });
  store.set(storeKey('wraeclastTuning2'), '{not json');
  assert.deepEqual(readTuning(), HANDOFF);
});
