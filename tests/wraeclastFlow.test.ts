import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH } from '../src/wraeclast/map.ts';
import {
  Run,
  DEFAULT_TUNING,
  FLASK_ITEMS,
  FLASK_STEP,
  LOOT_KINDS,
  SUPPLIES,
  TOWN_HEAL,
  BLOOD_TOLL,
  gridAdjacency,
  type Hidden,
  type ItemPlay,
  type LootKind,
  type Supply,
  type Tuning,
  type ZoneType,
} from '../src/wraeclast/rules.ts';
import { arrive, nodeAt, playOn, wrongLine } from '../src/qa/benches/wraeclastSetup.ts';

// The Wraeclast run's flow and economy (src/wraeclast/rules.ts) held to its
// handoff, docs/handoff/wraeclast/v3.md ("The travel phase", "Life and the
// flask", "Loot", the zones' and corruption's rules on a visit). Every run is
// seeded and its clock fake, so each plays the same every time. The
// handoff's numbers are written out again here, so rules.ts can't move both.

const T0 = Date.UTC(2026, 9, 19, 12);

function start(seed: number, tuning: Tuning = DEFAULT_TUNING) {
  const clock = { t: T0 };
  const run = new Run({ seed, tuning, now: () => clock.t });
  return { run, clock, s: run.state };
}

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

/** Loot weights with every kind but `kind` at 0. */
const only = (kind: LootKind) => Object.fromEntries(LOOT_KINDS.map((k) => [k, k === kind ? 1 : 0])) as Record<LootKind, number>;

/** A run arrived at a zone of `type` at `step`, corrupted with `hidden`, on the threshold. */
function inZone(seed: number, type: ZoneType = 'plain', { step = 2, hidden = null as Hidden | null, tuning = DEFAULT_TUNING } = {}) {
  const got = start(seed, tuning);
  arrive(got.run, nodeAt(step), { place: { kind: 'zone', type }, hidden });
  return got;
}

/** The next item open: from the threshold, or laid out. */
function openItem(run: Run): ItemPlay {
  const s = run.state;
  if (s.phase === 'zone') assert.ok(run.enter());
  assert.equal(s.phase, 'item');
  if (s.item!.openedAt === null) assert.ok(run.open(gridAdjacency(9)));
  return s.item!;
}

/** Builds the open item's answer and submits it. */
function answer(run: Run) {
  const it = run.state.item!;
  run.clear();
  for (const t of it.answer.slice(it.locked)) assert.ok(run.place(t));
  assert.equal(run.submit(), true);
}

/** A miss: a wrong line never sent before. */
function miss(run: Run) {
  const it = run.state.item!;
  it.build = wrongLine(it, it.misses);
  it.lineMarks = null;
  assert.equal(run.submit(), false);
}

/** Answers the open item and goes on to its loot deal. */
function solve(run: Run) {
  answer(run);
  assert.ok(run.next());
  return run.state.loot;
}

/** Collects the loot (any supply that doesn't fit left) and goes on. */
function onward(run: Run) {
  const s = run.state;
  if (s.phase === 'loot') {
    if (!s.loot!.collected) assert.ok(run.collect());
    while (s.loot!.pending.length) assert.ok(run.keep(null));
  }
  assert.ok(run.next());
}

// ---- The camp and the map ----

test('the camp: 100 life, a flask of 2 charges, 20 gold, an empty pack, and the vendor deals every ware', () => {
  const { s } = start(1);
  assert.deepEqual([s.phase, s.vendor, s.at, s.life, s.maxLife, s.flask.charges, s.gold, s.pack], ['vendor', { at: 'camp', heal: 0 }, GRAPH.camp.id, 100, 100, 2, 20, []]);
  assert.deepEqual(s.stock, [...SUPPLIES]);
  assert.deepEqual([s.done, s.item, s.loot, s.visit, s.steps], [0, null, null, null, 0]);
});

test('from the camp: the map, a node chosen among those linked ahead, its threshold, an item, solved, loot collected and kept, and on', () => {
  const { run, clock, s } = start(2, tuned((t) => (t.zoneShare = 100)));
  assert.deepEqual(run.options(), []);
  assert.ok(run.leave());
  assert.deepEqual([s.phase, s.stock, s.vendor], ['map', [], null]);
  assert.deepEqual(run.options(), GRAPH.next[GRAPH.camp.id]);
  // Only a node offered.
  assert.equal(run.choose('the-cathedral-rooftop'), false);
  const id = run.options()[0];
  s.places[id] = { kind: 'zone', type: 'plain' };
  assert.ok(run.choose(id));
  assert.deepEqual([s.at, s.steps, s.phase, s.visit], [id, 1, 'zone', { node: id, items: 3, done: 0 }]);
  assert.deepEqual(s.log.travel, [{ offered: GRAPH.next[GRAPH.camp.id], picked: id }]);
  assert.deepEqual(s.log.route, [GRAPH.camp.id, id]);
  assert.deepEqual(run.options(), [], 'no travel from a threshold');
  assert.equal(run.choose(GRAPH.next[id][0]), false);
  assert.ok(run.enter());
  assert.deepEqual([s.phase, s.item!.openedAt, s.item!.node, s.item!.n], ['item', null, id, 0]);
  clock.t += 2500;
  assert.ok(run.open(gridAdjacency(9)));
  assert.equal(s.item!.openedAt, T0 + 2500);
  assert.equal(run.open(gridAdjacency(9)), false, 'once');
  answer(run);
  assert.equal(s.phase, 'solved');
  assert.ok(run.next());
  assert.deepEqual([s.phase, s.loot!.collected], ['loot', false]);
  assert.equal(run.next(), false, 'not before the loot is collected');
  assert.ok(run.collect());
  assert.equal(run.collect(), false);
  assert.ok(run.next());
  assert.deepEqual([s.phase, s.item!.n, s.visit!.done, s.done], ['item', 1, 1, 1]);
  openItem(run);
  solve(run);
  onward(run);
  openItem(run);
  solve(run);
  onward(run);
  assert.deepEqual([s.phase, s.visit, s.item, s.done], ['map', null, null, 3]);
  assert.ok(run.options().every((n) => GRAPH.byId.get(n)!.step === GRAPH.byId.get(id)!.step + 1));
});

test("a zone holds the tuning's items, 1 to 3", () => {
  for (const n of [1, 2, 3]) {
    const { run, s } = inZone(3, 'plain', { tuning: tuned((t) => (t.itemsPerZone = n)) });
    assert.equal(s.visit!.items, n);
    playOn(run, () => s.phase === 'map');
    assert.equal(s.log.items.length, n);
  }
});

test('a Well refills every flask charge and heals no life, then the map', () => {
  const { run, s } = start(4);
  s.flask.charges = 0;
  s.life = 40;
  arrive(run, nodeAt(5), { place: { kind: 'well' } });
  assert.deepEqual([s.phase, s.flask.charges, s.life, s.visit], ['well', 2, 40, null]);
  assert.ok(run.leave());
  assert.equal(s.phase, 'map');
});

test('a town heals 20 on arrival, never above the most, and its vendor deals every ware again', () => {
  for (const [life, healed] of [
    [50, 20],
    [95, 5],
    [100, 0],
  ] as const) {
    const { run, s } = start(5);
    run.buy(0);
    s.life = life;
    arrive(run, 'ziggurat-encampment');
    assert.equal(s.places['ziggurat-encampment'].kind, 'town');
    assert.deepEqual([s.phase, s.vendor, s.life, s.stock], ['vendor', { at: 'town', heal: healed }, life + healed, [...SUPPLIES]]);
  }
  assert.equal(TOWN_HEAL, 20);
});

test("an Expedition zone's vendor deals every ware after its last item; other zones go straight to the map", () => {
  const { run, s } = inZone(6, 'expedition');
  playOn(run, () => s.phase === 'vendor');
  assert.deepEqual([s.phase, s.vendor, s.stock, s.log.items.length], ['vendor', { at: 'expedition', heal: 0 }, [...SUPPLIES], 3]);
  assert.ok(run.leave());
  assert.equal(s.phase, 'map');
  const plain = inZone(6, 'plain');
  playOn(plain.run, () => plain.s.phase !== 'zone' && plain.s.phase !== 'item' && plain.s.phase !== 'solved' && plain.s.phase !== 'loot');
  assert.equal(plain.s.phase, 'map');
});

test("the fronts creep after every second step the player takes, or the tuning's interval", () => {
  for (const every of [1, 2, 3]) {
    const { run, s } = start(7, tuned((t) => ((t.itemsPerZone = 1), (t.corruption.creep = every), (t.corruption.seeds = 5))));
    let last = -1;
    let moved = 0;
    let before = s.fronts.map((f) => f.at);
    playOn(run, () => {
      if (s.phase === 'map' && s.steps !== last) {
        last = s.steps;
        const now = s.fronts.map((f) => f.at);
        assert.equal(s.crept, s.steps - (s.steps % every), `every ${every}, at step ${s.steps}`);
        if (s.steps % every) assert.deepEqual(now, before, `no creep after step ${s.steps}`);
        else if (now.join() !== before.join()) moved++;
        before = now;
      }
      return s.steps >= 9;
    });
    assert.ok(moved > 0, `every ${every}: the fronts moved`);
  }
});

// ---- Corruption on a visit ----

test('a Blood toll takes 10 life as each item opens, and logs it', () => {
  const { run, s } = inZone(8, 'plain', { hidden: 'blood' });
  for (let k = 0; k < 3; k++) {
    const life = s.life;
    const it = openItem(run);
    assert.deepEqual([s.life, it.log.toll, it.log.lifeAfter], [life - 10, 10, life - 10]);
    solve(run);
    onward(run);
  }
  assert.equal(s.life, 70);
  assert.equal(BLOOD_TOLL, 10);
});

test('a Blood toll can end the run as the item opens', () => {
  for (const life of [10, 4]) {
    const { run, s } = inZone(9, 'plain', { hidden: 'blood' });
    s.life = life;
    run.enter();
    const it = s.item!;
    assert.ok(run.open(gridAdjacency(9)));
    assert.deepEqual([s.phase, s.life, s.log.result, s.log.lifeEnd, it.log.toll], ['end', 0, 'loss', 0, life]);
    assert.deepEqual(s.log.items, [it.log]);
    assert.deepEqual(s.log.endedOn, { n: 0, itemId: it.itemId, name: it.log.name, node: it.node });
  }
});

// ---- Life and the flask ----

test('a miss costs a random 20 to 30 at steps 1 to 5, 30 to 40 at 6 to 10, 40 to 50 at 11 to 15, and 55 to 65 at the boss, as missRange shows', () => {
  assert.deepEqual(DEFAULT_TUNING.missCost, { early: [20, 30], mid: [30, 40], late: [40, 50], boss: [55, 65] });
  for (const [step, range] of [
    [1, [20, 30]],
    [5, [20, 30]],
    [6, [30, 40]],
    [10, [30, 40]],
    [11, [40, 50]],
    [15, [40, 50]],
    [16, [55, 65]],
  ] as const) {
    const costs = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const { run, s } = start(seed);
      if (step === 16) arrive(run, GRAPH.boss.id);
      else arrive(run, nodeAt(step), { place: { kind: 'zone', type: 'plain' } });
      assert.equal(GRAPH.byId.get(s.at)!.step, step);
      assert.deepEqual(run.missRange(), range, 'before the item');
      openItem(run);
      assert.deepEqual(run.missRange(), range);
      miss(run);
      const lost = s.item!.log.submits[0].lost;
      assert.ok(lost >= range[0] && lost <= range[1], `step ${step}: lost ${lost}`);
      assert.equal(s.life, 100 - lost);
      costs.add(lost);
    }
    assert.ok(costs.size > 3, `random: ${[...costs]}`);
  }
});

test("a miss costs the tuning's range, cut to the life left, and at 0 life the run is lost on the item still open", () => {
  const { run, s } = inZone(10, 'plain', { tuning: tuned((t) => (t.missCost.early = [30, 30])) });
  const it = openItem(run);
  miss(run);
  miss(run);
  miss(run);
  assert.equal(s.life, 10);
  miss(run);
  assert.deepEqual([s.phase, s.life, s.log.result, s.log.lifeEnd], ['end', 0, 'loss', 0]);
  assert.deepEqual(it.log.submits.map((sub) => sub.lost), [30, 30, 30, 10]);
  assert.deepEqual(s.log.endedOn, { n: 0, itemId: it.itemId, name: it.log.name, node: it.node });
  assert.equal(run.submit(), null);
});

test('the flask is drunk only during an open item, with a charge left and life below its most', () => {
  const { run, s } = inZone(11, 'plain', { tuning: tuned((t) => (t.missCost.early = [20, 20])) });
  s.life = 50;
  assert.equal(run.drink(), false, 'on the threshold');
  run.enter();
  assert.equal(run.drink(), false, 'laid out');
  run.open(gridAdjacency(9));
  s.life = 100;
  assert.equal(run.drink(), false, 'at full life');
  s.life = 50;
  assert.ok(run.drink());
  assert.ok(run.drink());
  assert.equal(s.flask.charges, 0);
  assert.equal(run.drink(), false, 'no charge left');
  answer(run);
  s.flask.charges = 1;
  s.life = 50;
  assert.equal(run.drink(), false, 'solved');
});

test('a drink heals 10 at once and 10 as each of the next 2 items ends, the item drunk in counting as the first', () => {
  const { run, s } = inZone(12, 'plain', { tuning: tuned((t) => ((t.missCost.early = [40, 40]), (t.itemsPerZone = 3))) });
  openItem(run);
  miss(run);
  assert.equal(s.life, 60);
  assert.ok(run.drink());
  assert.deepEqual([s.life, s.flask.charges, s.flask.recovering], [70, 1, FLASK_ITEMS]);
  solve(run);
  assert.equal(s.life, 80);
  assert.equal(s.item!.log.healed, 10);
  onward(run);
  openItem(run);
  solve(run);
  assert.equal(s.life, 90);
  onward(run);
  openItem(run);
  solve(run);
  assert.equal(s.life, 90, 'two items, no more');
  assert.equal(s.item!.log.healed, 0);
  assert.deepEqual([FLASK_STEP, FLASK_ITEMS], [10, 2]);
});

test('drinking again restarts the heal, and the flask never heals above the most life', () => {
  const { run, s } = inZone(13, 'plain');
  openItem(run);
  s.life = 95;
  assert.ok(run.drink());
  assert.equal(s.life, 100);
  solve(run);
  assert.equal(s.item!.log.healed, 0);
  onward(run);
  openItem(run);
  s.life = 50;
  assert.ok(run.drink());
  assert.deepEqual([s.life, s.flask.recovering], [60, 2]);
});

// ---- Loot ----

test('a right answer deals the zone type\'s cards: 2, or 1 in Essence and Expedition zones', () => {
  assert.deepEqual(DEFAULT_TUNING.loot.cards, { plain: 2, incursion: 2, essence: 1, ritual: 2, expedition: 1, blight: 2 });
  for (const type of ['plain', 'incursion', 'essence', 'ritual', 'expedition', 'blight'] as const) {
    const { run } = inZone(14, type);
    assert.equal(run.dealHere(), DEFAULT_TUNING.loot.cards[type]);
    openItem(run);
    assert.equal(solve(run)!.cards.length, DEFAULT_TUNING.loot.cards[type], type);
  }
});

test('the deal is the cards times the corruption multiplier, less one a miss, never below 1', () => {
  const cheap = (x: Tuning) => (x.missCost.early = [1, 1]);
  for (const [type, hidden, multiplier, misses, cards] of [
    ['plain', null, 2, 0, 2],
    ['plain', null, 2, 1, 1],
    ['plain', null, 2, 3, 1],
    ['plain', 'bounty', 2, 0, 4],
    ['plain', 'bounty', 2, 1, 3],
    ['plain', 'bounty', 2, 3, 1],
    ['plain', 'bounty', 2, 5, 1],
    ['essence', null, 2, 0, 1],
    ['essence', null, 2, 2, 1],
    ['essence', 'blood', 2, 0, 2],
    ['ritual', 'swarming', 3, 1, 5],
  ] as const) {
    const { run } = inZone(15, type, { hidden, tuning: tuned((x) => (cheap(x), (x.corruption.multiplier = multiplier))) });
    assert.equal(run.dealHere(), DEFAULT_TUNING.loot.cards[type] * (hidden ? multiplier : 1));
    openItem(run);
    for (let k = 0; k < misses; k++) miss(run);
    const loot = solve(run)!;
    assert.equal(loot.cards.length, cards, `${type} ${hidden} x${multiplier}, ${misses} misses`);
    assert.deepEqual(run.state.log.items.length, 0);
  }
});

test('the boss deals no loot: its items go on to the next, and the run is won after the third', () => {
  const { run, s } = start(16);
  arrive(run, GRAPH.boss.id);
  assert.equal(run.dealHere(), 0);
  for (let k = 0; k < 3; k++) {
    const it = openItem(run);
    assert.equal(it.boss, k);
    answer(run);
    assert.ok(run.next());
    assert.equal(s.loot, null);
    assert.equal(it.log.loot.length, 0);
  }
  assert.deepEqual([s.phase, s.log.result, s.log.items.length], ['end', 'win', 3]);
  assert.equal(s.log.endedOn!.n, 2);
});

test('a flask card comes only while a charge is empty, and refills one', () => {
  const t = tuned((x) => (x.loot.weights = only('flask')));
  const full = inZone(17, 'plain', { tuning: t });
  openItem(full.run);
  assert.ok(solve(full.run)!.cards.every((c) => c.kind !== 'flask'), 'full: rolled again');
  const empty = inZone(17, 'plain', { tuning: t });
  empty.s.flask.charges = 0;
  openItem(empty.run);
  const loot = solve(empty.run)!;
  assert.ok(loot.cards.every((c) => c.kind === 'flask'));
  empty.run.collect();
  assert.equal(empty.s.flask.charges, loot.cards.length);
  assert.deepEqual([empty.s.log.loot.dealt.flask, empty.s.log.loot.taken.flask], [2, 2]);
});

test('a deal holds no more flask cards than there are empty charges ("rolled again if none is empty")', () => {
  // rollCard (rules.ts) checks the charges as each card rolls, but nothing is
  // refilled until collect(), so one empty charge can draw every card of a
  // deal as a flask card, and all but one refill nothing.
  const { run, s } = inZone(18, 'plain', { hidden: 'bounty', tuning: tuned((x) => (x.loot.weights = { gold: 1, supply: 0, flask: 50, jackpot: 0 })) });
  s.flask.charges = 1;
  openItem(run);
  const loot = solve(run)!;
  assert.equal(loot.cards.length, 4);
  assert.ok(loot.cards.filter((c) => c.kind === 'flask').length <= 1, `${loot.cards.map((c) => c.kind)}`);
});

test('gold cards give 4 to 8 at steps 1 to 5, 6 to 10 at 6 to 10, 8 to 12 at 11 to 15, and collecting adds them', () => {
  const t = tuned((x) => (x.loot.weights = only('gold')));
  for (const [step, [lo, hi]] of [
    [2, [4, 8]],
    [7, [6, 10]],
    [13, [8, 12]],
  ] as const) {
    const golds = new Set<number>();
    for (let seed = 1; seed <= 15; seed++) {
      const { run, s } = inZone(seed, 'plain', { step, tuning: t });
      openItem(run);
      const loot = solve(run)!;
      for (const c of loot.cards) {
        assert.deepEqual([c.kind, c.supply, c.n], ['gold', null, 0]);
        assert.ok(c.gold >= lo && c.gold <= hi, `step ${step}: ${c.gold}`);
        golds.add(c.gold);
      }
      const gold = s.gold;
      run.collect();
      const sum = loot.cards.reduce((n, c) => n + c.gold, 0);
      assert.deepEqual([s.gold, s.log.goldEarned, s.item!.log.gold], [gold + sum, sum, sum]);
    }
    assert.deepEqual([Math.min(...golds), Math.max(...golds)], [lo, hi]);
  }
});

test('a jackpot gives 25 gold', () => {
  const { run, s } = inZone(19, 'plain', { tuning: tuned((x) => (x.loot.weights = only('jackpot'))) });
  openItem(run);
  const loot = solve(run)!;
  assert.ok(loot.cards.every((c) => c.kind === 'jackpot' && c.gold === 25));
  run.collect();
  assert.equal(s.gold, 20 + 25 * loot.cards.length);
});

test('a supply card puts a stack of 2 of one supply in the pack, and every supply comes up', () => {
  const t = tuned((x) => (x.loot.weights = only('supply')));
  const seen = new Set<Supply>();
  for (let seed = 1; seed <= 25; seed++) {
    const { run, s } = inZone(seed, 'plain', { tuning: t });
    openItem(run);
    const loot = solve(run)!;
    run.collect();
    for (const c of loot.cards) {
      assert.deepEqual([c.kind, c.n, c.gold], ['supply', 2, 0]);
      seen.add(c.supply!);
    }
    const held = Object.fromEntries(SUPPLIES.map((k) => [k, run.held(k)]));
    const want = Object.fromEntries(SUPPLIES.map((k) => [k, loot.cards.filter((c) => c.supply === k).length * 2]));
    assert.deepEqual(held, want);
    assert.deepEqual(s.log.found, want);
  }
  assert.deepEqual([...seen].sort(), [...SUPPLIES].sort());
});

test("with the pack full, a supply card waits: it replaces the stack kept for it, or is left, and the loot moves on once none waits", () => {
  const t = tuned((x) => (x.loot.weights = only('supply')));
  const { run, s } = inZone(20, 'plain', { tuning: t });
  s.pack = Array.from({ length: 8 }, () => ({ supply: 'base' as Supply, n: 5 }));
  openItem(run);
  const loot = solve(run)!;
  // A card of base could top nothing up (every stack is full), so both wait.
  run.collect();
  assert.equal(loot.pending.length, 2);
  assert.equal(run.next(), false);
  assert.equal(run.keep(8), false, 'no such stack');
  assert.ok(run.keep(3));
  assert.deepEqual(s.pack[3], { supply: loot.cards[0].supply, n: 2 });
  assert.equal(run.next(), false);
  assert.ok(run.keep(null));
  assert.equal(s.pack.length, 8);
  assert.deepEqual([s.log.loot.dealt.supply, s.log.loot.taken.supply], [2, 1]);
  assert.equal(run.keep(null), false);
  assert.ok(run.next());
});

// ---- Whole runs ----

test('a full run plays from the camp across the map to the boss and is won', () => {
  const { run, s } = start(21);
  playOn(run, () => false);
  const log = s.log;
  assert.equal(log.result, 'win');
  assert.deepEqual([log.route[0], log.route.at(-1)], [GRAPH.camp.id, GRAPH.boss.id]);
  const steps = log.route.map((id) => GRAPH.byId.get(id)!.step);
  assert.deepEqual(steps, GRAPH.steps);
  const zones = log.met.filter((m) => m.kind === 'zone').length;
  assert.equal(log.items.length, zones * 3 + 3 + (log.bossMods.includes('lingering') ? 1 : 0));
  assert.equal(new Set(log.items.map((it) => it.itemId)).size, log.items.length, 'no item twice');
  log.items.forEach((it, k) => k && assert.notEqual(it.category, log.items[k - 1].category));
  assert.deepEqual([s.item, s.visit, s.phase], [null, null, 'end']);
});

test('a full run with misses enters a corrupted zone and still has a front alive at the boss', () => {
  let found = false;
  for (let seed = 1; seed <= 10 && !found; seed++) {
    const { run, s } = start(seed);
    playOn(run, () => false, { misses: true });
    if (s.log.result === 'win' && s.log.met.some((m) => m.corruption) && s.log.fronts.aliveAtBoss! > 0) found = true;
  }
  assert.ok(found);
});

test('a run is lost when the misses take all its life', () => {
  const { run, s } = start(22);
  playOn(run, () => s.phase === 'item' && s.item!.openedAt !== null);
  while (s.phase !== 'end') miss(run);
  assert.deepEqual([s.log.result, s.life, s.log.lifeEnd, s.log.items.length], ['loss', 0, 0, 1]);
  assert.equal(s.log.items[0].lifeAfter, 0);
});

test('a run plays the same for the same seed, and differently for another', () => {
  const play = (seed: number) => {
    const { run, s } = start(seed);
    playOn(run, () => false, { misses: true });
    return s.log;
  };
  assert.deepEqual(play(23), play(23));
  assert.notDeepEqual(play(23).items.map((it) => it.itemId), play(24).items.map((it) => it.itemId));
});
