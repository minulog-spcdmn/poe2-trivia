import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Run,
  DEFAULT_TUNING,
  ITEMS,
  LOOT_KINDS,
  PACK_SLOTS,
  SUPPLIES,
  WARES,
  ZONE_TYPES,
  answerOf,
  type ItemPlay,
  type LootKind,
  type Tuning,
  type Ware,
  type ZoneType,
} from '../src/wraeclast/rules.ts';

// The Wraeclast run's flow and economy (src/wraeclast/rules.ts) held to its
// handoff, docs/handoff/wraeclast/v2.md ("A run", "Life and the flask",
// "Loot", the vendor in "Look"). Every run is seeded and its clock fake, so
// each plays the same every time. The handoff's numbers are written out again
// here, so rules.ts can't move both.

const T0 = Date.UTC(2026, 9, 19, 12);
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

function start(seed: number, tuning: Tuning = DEFAULT_TUNING) {
  const clock = { t: T0 };
  const run = new Run({ seed, tuning, now: () => clock.t });
  return { run, clock };
}

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

/** Loot weights with every kind but `kind` at 0. */
const only = (kind: LootKind) => Object.fromEntries(LOOT_KINDS.map((k) => [k, k === kind ? 1 : 0])) as Record<LootKind, number>;

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

/** Takes loot card `card` (the first if there's no such card), leaving a ware the full pack can't hold. */
function takeLoot(run: Run, card = 0) {
  const loot = run.state.loot!;
  assert.ok(run.take(card < loot.cards.length ? card : 0));
  if (loot.pending !== null) assert.ok(run.keep(null));
}

/** On to the next item, opened: through the camp or town, the threshold, the solved screen and the loot (card 0). */
function toItem(run: Run): ItemPlay {
  const s = run.state;
  for (;;) {
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'travel') assert.ok(run.enter());
    else if (s.phase === 'solved') assert.ok(run.next());
    else if (s.phase === 'loot') {
      if (s.loot!.taken === null) takeLoot(run);
      else if (s.loot!.pending !== null) assert.ok(run.keep(null));
      assert.ok(run.next());
    } else if (s.phase === 'item') {
      if (s.item!.openedAt === null) assert.ok(run.open(grid()));
      return s.item!;
    } else assert.fail(`no item to go to in phase ${s.phase}`);
  }
}

/** Puts syllables on the answer line after its locked start. */
function build(run: Run, syllables: string[]) {
  const it = run.state.item!;
  run.clear();
  for (const syl of syllables.slice(it.locked)) assert.ok(run.place(syl), `placing ${syl}`);
}

/** Builds the open item's answer and submits it. */
function answer(run: Run) {
  build(run, answerOf(run.state.item!).words.flat());
  assert.equal(run.submit(), true);
}

/** A miss with a build that is no name: the answer and its first syllable once more per miss so far (a build is sent once). */
function miss(run: Run) {
  const it = run.state.item!;
  const syl = answerOf(it).words.flat();
  build(run, [...syl, ...Array<string>(it.misses + 1).fill(syl[0])]);
  assert.equal(run.submit(), false);
}

/** Plays every item right, at once, until item n is open. */
function reach(run: Run, n: number): ItemPlay {
  for (;;) {
    const it = toItem(run);
    if (it.n === n) return it;
    answer(run);
  }
}

/** Plays on to the end, every item answered at once; `each` gets each item as it opens. */
function playOn(run: Run, each: (it: ItemPlay) => void = () => {}) {
  while (run.state.phase !== 'end') {
    const it = toItem(run);
    each(it);
    if (run.state.phase === 'item') answer(run);
    // The boss's last: on to the end.
    if (run.state.phase === 'solved' && it.n === 14) assert.ok(run.next());
  }
  return run.state.log;
}

// ---- A run ----

test('the camp: 100 life, a flask of 2 charges, 20 gold, an empty pack of 8, and the vendor deals every ware once', () => {
  const { run } = start(1);
  const s = run.state;
  assert.deepEqual([s.phase, s.life, s.maxLife, s.flask.charges, s.gold, s.pack, PACK_SLOTS], ['camp', 100, 100, 2, 20, [], 8]);
  assert.deepEqual([...s.stock].sort(), [...WARES].sort());
  assert.equal(new Set(s.stock).size, s.stock.length);
  assert.deepEqual([...WARES].sort(), [...SUPPLIES, 'vaal'].sort());
  assert.deepEqual([s.done, s.item, s.loot], [0, null, null]);
});

test('leave goes to the threshold, enter lays out the first item, and it opens with its Veil cut', () => {
  const { run, clock } = start(2);
  const s = run.state;
  assert.equal(run.enter(), false);
  assert.ok(run.leave());
  assert.deepEqual([s.phase, s.stock], ['travel', []]);
  assert.equal(run.leave(), false);
  assert.ok(run.enter());
  assert.equal(s.phase, 'item');
  const it = s.item!;
  assert.deepEqual([it.n, it.zoneNo, it.zoneType, it.boss, it.openedAt, it.patches], [0, 1, s.zones[0], null, null, 0]);
  // Laid out, not open: nothing can be placed yet, and an empty cut opens nothing.
  assert.equal(run.place(it.tiles[0]), false);
  assert.equal(run.open([]), false);
  clock.t += 1500;
  assert.ok(run.open(grid()));
  assert.deepEqual([it.openedAt, it.patches, it.log.patches], [T0 + 1500, 81, 81]);
  assert.equal(run.open(grid()), false);
  assert.ok(run.place(answerOf(it).words[0][0]));
});

test('the four zones are of four different types, and each item is of its zone', () => {
  const firsts = new Set<ZoneType>();
  for (let seed = 1; seed <= 200; seed++) {
    const zones = new Run({ seed, now: () => T0 }).state.zones;
    assert.deepEqual([...zones].sort(), [...ZONE_TYPES].sort(), `seed ${seed}`);
    firsts.add(zones[0]);
  }
  assert.equal(firsts.size, 4);
  const { run } = start(3);
  const log = playOn(run);
  assert.deepEqual(
    log.items.map((it) => [it.zone, it.zoneType]),
    log.items.map((_, n) => (n < 12 ? [Math.floor(n / 3) + 1, run.state.zones[Math.floor(n / 3)]] : [5, 'boss'])),
  );
  assert.deepEqual(log.zones, run.state.zones);
});

test('zone 1 ends on the threshold of zone 2, not the town', () => {
  const { run } = start(4);
  reach(run, 2);
  answer(run);
  assert.ok(run.next());
  takeLoot(run);
  assert.ok(run.next());
  assert.equal(run.state.phase, 'travel');
  assert.equal(run.state.done, 3);
});

test('the town after zone 2 heals 20 on arrival and deals every ware again', () => {
  const { run } = start(5, tuned((t) => (t.missCost.early = [25, 25])));
  const s = run.state;
  assert.ok(run.buy(s.stock.indexOf('flare')));
  assert.ok(!s.stock.includes('flare'));
  reach(run, 1);
  miss(run);
  miss(run);
  assert.equal(s.life, 50);
  answer(run);
  reach(run, 5);
  answer(run);
  assert.ok(run.next());
  takeLoot(run);
  assert.ok(run.next());
  assert.deepEqual([s.phase, s.done, s.life, s.arrivalHeal], ['town', 6, 70, 20]);
  assert.deepEqual([...s.stock].sort(), [...WARES].sort());
  // The next item starts at the healed life.
  assert.equal(toItem(run).log.lifeBefore, 70);
});

test("the town's heal never takes life above the most", () => {
  const { run } = start(6, tuned((t) => (t.missCost.early = [5, 5])));
  reach(run, 5);
  miss(run);
  assert.equal(run.state.life, 95);
  answer(run);
  run.next();
  takeLoot(run);
  run.next();
  assert.deepEqual([run.state.phase, run.state.life, run.state.arrivalHeal], ['town', 100, 5]);
});

test('the boss: three items of 10 names each in zone 5, with no zone type', () => {
  for (const seed of [7, 8, 9]) {
    const { run } = start(seed);
    for (const n of [12, 13, 14]) {
      const it = reach(run, n);
      assert.deepEqual([it.boss, it.zoneNo, it.zoneType, it.names.length, run.boardSize(n)], [n - 12, 5, null, 10, 10], `seed ${seed}, item ${n}`);
      assert.deepEqual([it.log.boss, it.log.zoneType, it.log.zone], [true, 'boss', 5]);
      answer(run);
    }
  }
});

test('a run is won after the boss: the end, its result and the item it ended on', () => {
  const { run, clock } = start(10);
  clock.t += 60_000;
  const log = playOn(run);
  const s = run.state;
  assert.deepEqual([s.phase, s.done, s.item, s.loot], ['end', 15, null, null]);
  assert.deepEqual([log.result, log.items.length, log.lifeEnd, log.end], ['win', 15, 100, new Date(T0 + 60_000).toISOString()]);
  assert.deepEqual(log.endedOn, { n: 14, itemId: log.items[14].itemId, name: log.items[14].name });
  assert.deepEqual([run.leave(), run.enter(), run.next(), run.drink()], [false, false, false, false]);
});

test('a run is lost at 0 life, on the item still open', () => {
  const { run } = start(11, tuned((t) => (t.missCost.late = [40, 40])));
  const s = run.state;
  const it = reach(run, 7);
  const before = s.life;
  assert.equal(before, 100);
  for (let k = 0; k < 2; k++) miss(run);
  assert.equal(s.life, 20);
  miss(run);
  assert.deepEqual([s.phase, s.life, s.item, s.loot], ['end', 0, null, null]);
  const log = s.log;
  assert.deepEqual([log.result, log.lifeEnd, log.items.length, log.misses], ['loss', 0, 8, 3]);
  assert.deepEqual(log.endedOn, { n: 7, itemId: it.itemId, name: BY_ID.get(it.itemId)!.name });
  assert.deepEqual([log.items[7].lifeBefore, log.items[7].lifeAfter, log.items[7].misses], [100, 0, 3]);
  assert.ok(log.end !== null);
  assert.deepEqual([run.submit(), run.next(), run.drink()], [null, false, false]);
});

test('no item comes up twice in a run', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const ids = playOn(start(seed).run).items.map((it) => it.itemId);
    assert.equal(new Set(ids).size, 15, `seed ${seed}`);
  }
});

test('a run plays the same for the same seed, and differently for another', () => {
  const play = (seed: number) => {
    const { run, clock } = start(seed);
    run.buy(0);
    return playOn(run, (it) => {
      clock.t += 1000 + it.n * 10;
      if (it.n % 4 === 1) miss(run);
      if (it.n === 3) run.drink();
    });
  };
  assert.deepEqual(play(12), play(12));
  assert.notDeepEqual(play(12).items, play(13).items);
});

test("each item's category differs from the last item's", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cats = playOn(start(seed).run).items.map((it) => it.category);
    cats.forEach((c, n) => n && assert.notEqual(c, cats[n - 1], `seed ${seed}, item ${n}`));
  }
});

// ---- The vendor ----

test('buying takes the card off the table: a ware is bought once a visit, and goes in the pack for its price', () => {
  const { run } = start(13, tuned((t) => (t.gold = 999)));
  const s = run.state;
  const wares: Ware[] = [];
  while (s.stock.length) {
    const ware = s.stock[0];
    const gold = s.gold;
    assert.ok(run.buy(0));
    assert.equal(gold - s.gold, DEFAULT_TUNING.price[ware]);
    wares.push(ware);
  }
  assert.deepEqual([...wares].sort(), [...WARES].sort());
  assert.deepEqual(s.pack, wares);
  assert.equal(run.buy(0), false);
  assert.equal(s.log.goldSpent, 5 + 5 + 6 + 4 + 8 + 6 + 4);
  assert.deepEqual(s.log.bought, Object.fromEntries(WARES.map((w) => [w, 1])));
});

test("the vendor's prices are the handoff's, and the tuning's when changed", () => {
  const prices = { flare: 5, wisdom: 5, strike: 6, lengths: 4, first: 8, decoy: 6, vaal: 4 };
  assert.deepEqual(DEFAULT_TUNING.price, prices);
  const own = { flare: 1, wisdom: 2, strike: 3, lengths: 4, first: 5, decoy: 6, vaal: 7 };
  const { run } = start(14, tuned((t) => ((t.price = { ...own }), (t.gold = 999))));
  const paid: Record<string, number> = {};
  while (run.state.stock.length) {
    const ware = run.state.stock[0];
    const gold = run.state.gold;
    assert.ok(run.buy(0));
    paid[ware] = gold - run.state.gold;
  }
  assert.deepEqual(paid, own);
});

test('buying needs the gold', () => {
  const { run } = start(15, tuned((t) => (t.gold = 9)));
  const s = run.state;
  assert.ok(run.buy(s.stock.indexOf('flare')));
  assert.equal(s.gold, 4);
  assert.equal(run.buy(s.stock.indexOf('first')), false);
  assert.equal(run.buy(s.stock.indexOf('wisdom')), false);
  assert.ok(run.buy(s.stock.indexOf('vaal')));
  assert.deepEqual([s.gold, s.pack], [0, ['flare', 'vaal']]);
  assert.ok(s.stock.every((_, i) => !run.canBuy(i)));
});

test('buying needs a free slot in the pack', () => {
  const { run } = start(16, tuned((t) => (t.gold = 999)));
  const s = run.state;
  s.pack = Array<Ware>(PACK_SLOTS - 1).fill('flare');
  assert.ok(run.buy(0));
  assert.equal(s.pack.length, PACK_SLOTS);
  assert.ok(s.stock.every((_, i) => !run.canBuy(i)));
  assert.equal(run.buy(0), false);
});

test('nothing is bought away from a vendor, and the town deals again what the camp sold', () => {
  const { run } = start(17, tuned((t) => (t.gold = 999)));
  const s = run.state;
  while (s.stock.length) run.buy(0);
  assert.ok(run.leave());
  assert.equal(run.buy(0), false);
  reach(run, 0);
  assert.equal(run.buy(0), false);
  reach(run, 5);
  answer(run);
  run.next();
  takeLoot(run);
  run.next();
  assert.equal(s.phase, 'town');
  assert.deepEqual([...s.stock].sort(), [...WARES].sort());
  assert.equal(run.buy(s.stock.length), false);
});

// ---- Life and the flask ----

test("a miss costs a random 20 to 30 in zones 1 and 2, 30 to 40 in 3 and 4, 55 to 65 at the boss, as missRange shows", () => {
  const want = { early: [20, 30], late: [30, 40], boss: [55, 65] };
  assert.deepEqual(DEFAULT_TUNING.missCost, want);
  const seen = { early: new Set<number>(), late: new Set<number>(), boss: new Set<number>() };
  for (let seed = 1; seed <= 60; seed++) {
    const { run } = start(seed, tuned((t) => (t.life = 999)));
    for (const [n, section] of [[1, 'early'], [8, 'late'], [13, 'boss']] as const) {
      reach(run, n);
      assert.deepEqual(run.missRange(), want[section]);
      for (let k = 0; k < 3; k++) {
        const before = run.state.life;
        miss(run);
        seen[section].add(before - run.state.life);
      }
      answer(run);
    }
  }
  for (const section of ['early', 'late', 'boss'] as const) {
    const [lo, hi] = want[section];
    const costs = [...seen[section]].sort((a, b) => a - b);
    assert.ok(costs.every((c) => c >= lo && c <= hi), `${section}: ${costs}`);
    assert.deepEqual([costs[0], costs.at(-1)], [lo, hi], `${section}: both ends come up`);
  }
});

test("a miss costs the tuning's range", () => {
  const { run } = start(18, tuned((t) => (t.missCost = { early: [3, 3], late: [7, 7], boss: [11, 11] })));
  const drops: number[] = [];
  for (const n of [0, 6, 12]) {
    reach(run, n);
    const before = run.state.life;
    miss(run);
    drops.push(before - run.state.life);
    answer(run);
  }
  assert.deepEqual(drops, [3, 7, 11]);
});

test('the flask is drunk only during an open item', () => {
  const { run } = start(19);
  const s = run.state;
  assert.equal(run.drink(), false);
  run.leave();
  assert.equal(run.drink(), false);
  run.enter();
  assert.equal(run.drink(), false, 'laid out, not open');
  run.open(grid());
  assert.ok(run.drink());
  answer(run);
  assert.equal(s.phase, 'solved');
  assert.equal(run.drink(), false);
  run.next();
  assert.equal(s.phase, 'loot');
  assert.equal(run.drink(), false);
  assert.equal(s.flask.charges, 1);
});

test('a drink heals 10 at once and 10 as each of the next 2 items ends, the item drunk in counting as the first', () => {
  const { run } = start(20, tuned((t) => (t.missCost.early = [40, 40])));
  const s = run.state;
  reach(run, 0);
  miss(run);
  assert.equal(s.life, 60);
  assert.ok(run.drink());
  assert.deepEqual([s.life, s.flask.charges, s.log.drinks], [70, 1, 1]);
  answer(run);
  assert.deepEqual([s.life, s.item!.log.healed], [80, 10]);
  reach(run, 1);
  answer(run);
  assert.deepEqual([s.life, s.item!.log.healed], [90, 10]);
  reach(run, 2);
  answer(run);
  assert.deepEqual([s.life, s.item!.log.healed], [90, 0]);
  assert.deepEqual(
    s.log.items.map((it) => [it.lifeBefore, it.lifeAfter]),
    [
      [100, 80],
      [80, 90],
    ],
  );
});

test('drinking again restarts the heal: the rest of the old one is lost, and the charges run out', () => {
  const { run } = start(21, tuned((t) => (t.missCost.early = [30, 30])));
  const s = run.state;
  reach(run, 0);
  miss(run);
  miss(run);
  assert.equal(s.life, 40);
  assert.ok(run.drink());
  answer(run);
  assert.equal(s.life, 60);
  reach(run, 1);
  assert.ok(run.drink());
  assert.equal(s.life, 70);
  assert.equal(run.drink(), false, 'no charge left');
  answer(run);
  assert.equal(s.life, 80);
  reach(run, 2);
  answer(run);
  assert.equal(s.life, 90);
  reach(run, 3);
  answer(run);
  assert.equal(s.life, 90);
  assert.deepEqual([s.flask.charges, s.log.drinks], [0, 2]);
});

test('the flask never heals above the most life', () => {
  const { run } = start(22, tuned((t) => (t.missCost.early = [5, 5])));
  const s = run.state;
  reach(run, 0);
  assert.ok(run.drink());
  assert.equal(s.life, 100);
  miss(run);
  answer(run);
  assert.deepEqual([s.life, s.item!.log.healed], [100, 5]);
});

test('the flask still works on a corrupted item and at the boss', () => {
  const { run } = start(23, tuned((t) => (t.loot.weights = only('gold'))));
  const s = run.state;
  reach(run, 0);
  s.pack.push('vaal');
  assert.ok(run.corrupt());
  assert.ok(run.drink());
  answer(run);
  reach(run, 13);
  assert.ok(run.drink());
  assert.equal(s.flask.charges, 0);
});

// ---- Loot ----

/** Plays items right with `misses` misses each on item n, and returns the deal its loot drew. */
function dealAfter(run: Run, n: number, misses: number) {
  reach(run, n);
  for (let k = 0; k < misses; k++) miss(run);
  answer(run);
  assert.ok(run.next());
  assert.equal(run.state.phase, 'loot');
  return run.state.loot!;
}

test('a right answer deals 3 cards, one fewer per miss, never fewer than 1', () => {
  assert.equal(DEFAULT_TUNING.loot.deal, 3);
  const { run } = start(24, tuned((t) => ((t.missCost.early = [1, 1]), (t.missCost.late = [1, 1]))));
  const sizes = [0, 1, 2, 3, 5].map((misses, n) => {
    const loot = dealAfter(run, n, misses);
    const size = loot.cards.length;
    takeLoot(run);
    return size;
  });
  assert.deepEqual(sizes, [3, 2, 1, 1, 1]);
});

test("the deal's size is the tuning's", () => {
  const { run } = start(25, tuned((t) => (t.loot.deal = 5)));
  assert.equal(dealAfter(run, 0, 0).cards.length, 5);
  takeLoot(run);
  assert.equal(dealAfter(run, 1, 1).cards.length, 4);
});

test('a corrupted item deals its bonus: Gilded 2 more cards, Unveiled 1, Twisted 2, after the misses', () => {
  for (const [outcome, bonus] of [['gilded', 2], ['unveiled', 1], ['twisted', 2]] as const) {
    const { run } = start(26, tuned((t) => ((t.corruption = { gilded: 0, unveiled: 0, twisted: 0, bricked: 0, [outcome]: 1 }), (t.missCost.early = [1, 1]))));
    for (const misses of [0, 1, 3]) {
      const it = reach(run, misses);
      run.state.pack.push('vaal');
      assert.equal(run.corrupt(), outcome);
      for (let k = 0; k < misses; k++) miss(run);
      answer(run);
      assert.ok(run.next());
      assert.equal(run.state.loot!.cards.length, Math.max(1, 3 - misses) + bonus, `${outcome}, ${misses} misses`);
      assert.equal(it.log.deal.length, Math.max(1, 3 - misses) + bonus);
      takeLoot(run);
      run.next();
    }
  }
});

test('a Bricked item deals nothing: its right answer goes on to the next item', () => {
  const { run } = start(27, tuned((t) => (t.corruption = { gilded: 0, unveiled: 0, twisted: 0, bricked: 1 })));
  const s = run.state;
  const it = reach(run, 0);
  s.pack.push('vaal');
  assert.equal(run.corrupt(), 'bricked');
  answer(run);
  assert.ok(run.next());
  assert.deepEqual([s.phase, s.done, s.loot, s.item!.n], ['item', 1, null, 1]);
  assert.deepEqual([it.log.deal, it.log.took, s.log.unid.offered], [[], null, 0]);
});

test('every deal has exactly one unidentified card', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { run } = start(seed, tuned((t) => (t.missCost = { early: [1, 1], late: [1, 1], boss: [1, 1] })));
    playOn(run, (it) => {
      if (it.n % 3 === 1) miss(run);
    });
    assert.equal(run.state.log.result, 'win');
    for (const it of run.state.log.items.slice(0, 12)) assert.equal(it.deal.filter((c) => c.unid).length, 1, `seed ${seed}, item ${it.itemId}`);
    assert.equal(run.state.log.unid.offered, 12);
  }
});

test('an unidentified card rolls the uncommon and rare cards twice as often', () => {
  // Gold and Vaal Orbs at 1 each: a face-up card is a Vaal Orb half the time, a face-down one two thirds.
  const weights = { ...only('gold'), vaal: 1 };
  const shown = { vaal: 0, all: 0 };
  const hidden = { vaal: 0, all: 0 };
  for (let seed = 1; seed <= 50; seed++) {
    const { run } = start(seed, tuned((t) => ((t.loot.weights = weights), (t.loot.deal = 6))));
    playOn(run);
    for (const it of run.state.log.items)
      for (const c of it.deal) {
        const side = c.unid ? hidden : shown;
        side.all++;
        if (c.kind === 'vaal') side.vaal++;
      }
  }
  const up = shown.vaal / shown.all;
  const down = hidden.vaal / hidden.all;
  assert.ok(Math.abs(up - 1 / 2) < 0.05, `face up: ${up}`);
  assert.ok(Math.abs(down - 2 / 3) < 0.07, `face down: ${down}`);
});

test("gold cards give 4 to 8 in zones 1 and 2, 6 to 10 in zones 3 and 4, and taking one adds it", () => {
  assert.deepEqual(DEFAULT_TUNING.loot.gold, { early: [4, 8], late: [6, 10] });
  const seen = { early: new Set<number>(), late: new Set<number>() };
  for (let seed = 1; seed <= 20; seed++) {
    const { run } = start(seed, tuned((t) => (t.loot.weights = only('gold'))));
    const s = run.state;
    let earned = 0;
    playOn(run);
    for (const [n, it] of s.log.items.slice(0, 12).entries()) {
      assert.ok(it.deal.every((c) => c.kind === 'gold' && c.supply === null));
      for (const c of it.deal) seen[n < 6 ? 'early' : 'late'].add(c.gold);
      assert.equal(it.gold, it.deal[it.took!.index].gold);
      earned += it.gold;
    }
    assert.deepEqual([s.log.goldEarned, s.gold], [earned, 20 + earned]);
  }
  assert.deepEqual([...seen.early].sort((a, b) => a - b), [4, 5, 6, 7, 8]);
  assert.deepEqual([...seen.late].sort((a, b) => a - b), [6, 7, 8, 9, 10]);
});

test('a jackpot gives 25 gold', () => {
  const { run } = start(28, tuned((t) => (t.loot.weights = only('jackpot'))));
  const loot = dealAfter(run, 0, 0);
  assert.ok(loot.cards.every((c) => c.kind === 'jackpot' && c.gold === 25));
  assert.ok(run.take(1));
  assert.deepEqual([run.state.gold, run.state.log.goldEarned, run.state.item!.log.gold], [45, 25, 25]);
});

test('a flask card comes only while a charge is empty, and refills one', () => {
  const { run } = start(29, tuned((t) => (t.loot.weights = only('flask'))));
  const s = run.state;
  // Both charges full: the flask card is rolled again (gold, when nothing else can come).
  assert.ok(dealAfter(run, 0, 0).cards.every((c) => c.kind === 'gold'));
  takeLoot(run);
  reach(run, 1);
  assert.ok(run.drink());
  answer(run);
  run.next();
  assert.ok(s.loot!.cards.every((c) => c.kind === 'flask' && c.gold === 0));
  assert.ok(run.take(0));
  assert.equal(s.flask.charges, 2);
});

test('a supply card puts its supply in the pack, and a Vaal Orb card a Vaal Orb', () => {
  const { run } = start(30, tuned((t) => (t.loot.weights = only('supply'))));
  const s = run.state;
  const loot = dealAfter(run, 0, 0);
  assert.ok(loot.cards.every((c) => c.kind === 'supply' && SUPPLIES.includes(c.supply!) && c.gold === 0));
  const supply = loot.cards[2].supply!;
  assert.ok(run.take(2));
  assert.deepEqual([s.pack, s.log.found[supply], s.item!.log.took], [[supply], 1, { index: 2, kept: true }]);

  const v = start(31, tuned((t) => (t.loot.weights = only('vaal')))).run;
  assert.ok(dealAfter(v, 0, 0).cards.every((c) => c.kind === 'vaal'));
  assert.ok(v.take(0));
  assert.deepEqual([v.state.pack, v.state.log.found.vaal], [['vaal'], 1]);
});

test('every supply comes up on supply cards', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 5; seed++) {
    const { run } = start(seed, tuned((t) => (t.loot.weights = only('supply'))));
    for (const it of playOn(run).items) for (const c of it.deal) seen.add(c.supply!);
  }
  assert.deepEqual([...seen].sort(), [...SUPPLIES].sort());
});

test('with the pack full, a ware taken replaces the slot kept for it', () => {
  const { run } = start(32, tuned((t) => (t.loot.weights = only('vaal'))));
  const s = run.state;
  s.pack = Array<Ware>(PACK_SLOTS).fill('flare');
  dealAfter(run, 0, 0);
  assert.ok(run.take(0));
  assert.deepEqual([s.loot!.pending, s.pack.length], ['vaal', 8]);
  assert.equal(run.next(), false, 'not before the ware is kept or left');
  assert.equal(run.keep(8), false);
  assert.equal(run.keep(-1), false);
  assert.ok(run.keep(3));
  assert.deepEqual([s.pack[3], s.pack.length, s.loot!.pending, s.item!.log.took], ['vaal', 8, null, { index: 0, kept: true }]);
  assert.equal(run.keep(3), false);
  assert.ok(run.next());
});

test('with the pack full, a ware taken can be left', () => {
  const { run } = start(33, tuned((t) => (t.loot.weights = only('supply'))));
  const s = run.state;
  s.pack = Array<Ware>(PACK_SLOTS).fill('vaal');
  dealAfter(run, 0, 0);
  assert.ok(run.take(1));
  assert.ok(run.keep(null));
  assert.deepEqual([s.pack, s.item!.log.took], [Array(8).fill('vaal'), { index: 1, kept: false }]);
  assert.ok(run.next());
});

test('the loot moves on only once a card is taken, and only one is', () => {
  const { run } = start(34);
  const s = run.state;
  dealAfter(run, 0, 0);
  assert.equal(run.next(), false);
  assert.equal(run.take(3), false);
  assert.equal(run.keep(null), false, 'nothing waits to be kept');
  assert.ok(run.take(0));
  assert.equal(run.take(1), false);
  if (s.loot!.pending !== null) run.keep(null);
  assert.ok(run.next());
  assert.equal(s.item!.n, 1);
});

test('the boss deals no loot', () => {
  const { run } = start(35);
  const s = run.state;
  for (const n of [12, 13]) {
    const it = reach(run, n);
    answer(run);
    assert.equal(s.phase, 'solved');
    assert.ok(run.next());
    assert.deepEqual([s.phase, s.loot, s.item!.n], ['item', null, n + 1]);
    assert.deepEqual([it.log.deal, it.log.took, it.log.gold], [[], null, 0]);
  }
  reach(run, 14);
  answer(run);
  assert.ok(run.next());
  assert.equal(s.phase, 'end');
  assert.equal(s.log.unid.offered, 12);
});

test('an unidentified card taken is counted', () => {
  const { run } = start(36);
  const s = run.state;
  let taken = 0;
  for (let n = 0; n < 6; n++) {
    dealAfter(run, n, 0);
    const pick = n % 2 ? s.loot!.cards.findIndex((c) => c.unid) : s.loot!.cards.findIndex((c) => !c.unid);
    if (s.loot!.cards[pick].unid) taken++;
    takeLoot(run, pick);
  }
  assert.deepEqual(s.log.unid, { offered: 6, taken });
  assert.equal(taken, 3);
});
