import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { Run, DEFAULT_TUNING, ITEMS, PACK_SLOTS, SUPPLIES, ZONE_TYPES, type Card, type Supply, type Tuning } from '../src/wraeclast/rules.ts';
import { RARE_GROUPS } from '../src/lib/game.ts';

// The run's flow and economy as docs/handoff/wraeclast/README.md has them: the
// camp, the vendor, the zones, the town, the boss, the deal and the board.

const SEEDS = 200;
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
const MULTIPLIER_SHARES: [number, number][] = [
  [1, 0.4],
  [1.25, 0.3],
  [1.5, 0.2],
  [2, 0.1],
];

const clocks = new WeakMap<Run, { t: number }>();

/** A run on a fake clock of its own (wait moves it). */
function newRun(seed: number, tuning?: Tuning) {
  const clock = { t: Date.UTC(2026, 9, 19) };
  const run = new Run({ seed, tuning, now: () => clock.t });
  clocks.set(run, clock);
  return run;
}

const wait = (run: Run, ms: number) => void (clocks.get(run)!.t += ms);

const withTuning = (change: Partial<Tuning>): Tuning => ({ ...structuredClone(DEFAULT_TUNING), ...change });

const answerOf = (run: Run) => {
  const it = run.state.item!;
  return it.names.find((nm) => nm.id === it.itemId)!;
};

function build(run: Run, syllables: string[]) {
  for (const syl of syllables) assert.ok(run.place(syl), `placing ${syl}`);
}

/** Builds the answer and submits it. */
function answer(run: Run) {
  wait(run, 4000);
  build(run, answerOf(run).words.flat());
  return run.submit();
}

/** Builds the answer with its first syllable once more (no name), submits it and clears the line. */
function miss(run: Run) {
  const syllables = answerOf(run).words.flat();
  wait(run, 4000);
  build(run, [...syllables, syllables[0]]);
  const right = run.submit();
  run.clear();
  return right;
}

/** On to the next item, opened: the camp or town left, card `card` picked (the boss's own at the boss). */
function toItem(run: Run, card = 0) {
  const s = run.state;
  if (s.phase === 'between') assert.ok(run.next());
  if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
  assert.equal(s.phase, 'deal');
  assert.ok(run.pick(s.offer.length === 1 ? 0 : card));
  wait(run, 1000);
  assert.ok(run.open());
  return s.item!;
}

/** Answers every item right until `done` items are done. */
function playTo(run: Run, done: number) {
  while (run.state.done < done) {
    toItem(run);
    assert.equal(answer(run), true);
  }
}

interface Deal {
  n: number;
  offer: Card[];
  pick: number;
  /** boardSize(n) and the names the board got. */
  size: number;
  names: number;
  /** Whether the answer is of a rare group (Tablets). */
  rare: boolean;
}

interface Played {
  seed: number;
  run: Run;
  deals: Deal[];
  phases: string[];
}

/** A run won by answering every item at once; the card picked turns with the seed. */
function playWin(seed: number): Played {
  const run = newRun(seed);
  const s = run.state;
  const deals: Deal[] = [];
  const phases: string[] = [s.phase];
  while (s.phase !== 'end') {
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'between') assert.ok(run.next());
    else {
      assert.equal(s.phase, 'deal');
      const n = s.done;
      const offer = structuredClone(s.offer);
      const pick = offer.length === 1 ? 0 : (seed + n) % offer.length;
      assert.ok(run.pick(pick));
      phases.push(s.phase);
      const it = s.item!;
      deals.push({ n, offer, pick, size: run.boardSize(n), names: it.names.length, rare: Object.hasOwn(RARE_GROUPS, BY_ID.get(it.itemId)!.group) });
      wait(run, 1000);
      assert.ok(run.open());
      assert.equal(answer(run), true);
    }
    phases.push(s.phase);
  }
  return { seed, run, deals, phases };
}

let played: Played[] | undefined;
const plays = () => (played ??= Array.from({ length: SEEDS }, (_, i) => playWin(i + 1)));

test('a run starts at the camp with 100 life, a flask of 2 charges, 20 gold and an empty pack of 8 slots', () => {
  const s = newRun(1).state;
  assert.equal(s.phase, 'camp');
  assert.equal(s.life, 100);
  assert.equal(s.maxLife, 100);
  assert.deepEqual(s.flask, { charges: 2, recovering: 0 });
  assert.equal(s.gold, 20);
  assert.deepEqual(s.pack, []);
  assert.equal(PACK_SLOTS, 8);
  assert.equal(s.done, 0);
  assert.equal(s.item, null);
  assert.deepEqual(s.offer, []);
});

test('the camp vendor sells every supply at its price, for gold the player has', () => {
  assert.deepEqual(DEFAULT_TUNING.price, { flare: 4, requirement: 3, wisdom: 6, strike: 6, lore: 8 });
  for (const supply of SUPPLIES) {
    const run = newRun(2);
    assert.ok(run.canBuy(supply));
    assert.ok(run.buy(supply));
    assert.equal(run.state.gold, 20 - DEFAULT_TUNING.price[supply]);
    assert.deepEqual(run.state.pack, [supply]);
    assert.equal(run.state.log.bought[supply], 1);
    assert.equal(run.state.log.goldSpent, DEFAULT_TUNING.price[supply]);
  }
  // 20 gold: two Lore reveals leave 4, enough for a Flare and then nothing.
  const run = newRun(2);
  const s = run.state;
  assert.ok(run.buy('lore'));
  assert.ok(run.buy('lore'));
  assert.equal(s.gold, 4);
  const before = JSON.stringify(s);
  assert.equal(run.canBuy('lore'), false);
  assert.equal(run.buy('lore'), false);
  assert.equal(JSON.stringify(s), before);
  assert.ok(run.buy('flare'));
  assert.equal(s.gold, 0);
  assert.deepEqual(
    SUPPLIES.filter((supply) => run.canBuy(supply) || run.buy(supply)),
    [],
  );
  assert.deepEqual(s.pack, ['lore', 'lore', 'flare']);
});

test('the pack holds 8 supplies and no more', () => {
  const run = newRun(3, withTuning({ gold: 1000 }));
  for (let i = 0; i < PACK_SLOTS; i++) assert.ok(run.buy('requirement'));
  const before = JSON.stringify(run.state);
  assert.deepEqual(
    SUPPLIES.filter((supply) => run.canBuy(supply) || run.buy(supply)),
    [],
  );
  assert.equal(JSON.stringify(run.state), before);
  assert.equal(run.state.pack.length, 8);
  assert.equal(run.state.gold, 1000 - 8 * 3);
});

test('nothing can be bought at a deal, during an item or between items, only at the camp and the town', () => {
  const run = newRun(4, withTuning({ gold: 1000 }));
  const s = run.state;
  const bad: string[] = [];
  const check = (where: string, open: boolean) => {
    for (const supply of SUPPLIES) {
      const before = JSON.stringify(s);
      if (run.canBuy(supply) !== open) bad.push(`${where}: ${supply}`);
      else if (!open && (run.buy(supply) || JSON.stringify(s) !== before)) bad.push(`${where}: bought ${supply}`);
    }
  };
  let vendors = 0;
  while (s.phase !== 'end') {
    if (s.phase === 'camp' || s.phase === 'town') {
      check(s.phase, true);
      vendors++;
      assert.ok(run.leave());
    }
    check(`deal ${s.done}`, false);
    assert.ok(run.pick(0));
    check(`item ${s.done} laid out`, false);
    assert.ok(run.open());
    check(`item ${s.done}`, false);
    assert.equal(answer(run), true);
    check(`after item ${s.done}`, false);
    if (s.phase === 'between') assert.ok(run.next());
  }
  assert.deepEqual(bad, []);
  assert.equal(vendors, 2);
});

test('the four zones are each of a different type, rolled anew for each run', () => {
  const orders = new Set<string>();
  const seen = new Set<string>();
  const bad: string[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = newRun(seed).state;
    if (!isDeepStrictEqual([...s.zones].sort(), [...ZONE_TYPES].sort())) bad.push(`seed ${seed}: ${s.zones}`);
    if (!isDeepStrictEqual(s.log.zones, s.zones)) bad.push(`seed ${seed}: logged ${s.log.zones}`);
    orders.add(s.zones.join());
    s.zones.forEach((z, i) => seen.add(`${z} ${i}`));
  }
  assert.deepEqual(bad, []);
  assert.ok(orders.size >= 20, `${orders.size} of the 24 orders`);
  assert.equal(seen.size, 16, 'every type in every zone');
});

test('each of the 4 zones has 3 items of its type, the boss 3 more, and beating the boss wins the run', () => {
  const phases = ['camp'];
  for (let n = 0; n < 15; n++) phases.push('deal', 'item', n === 14 ? 'end' : 'between', ...(n === 5 ? ['town'] : []));
  const bad: string[] = [];
  for (const p of plays()) {
    const s = p.run.state;
    const got = {
      zoneNos: s.log.items.map((it) => it.zoneNo),
      zones: s.log.items.map((it) => it.zone),
      boss: s.log.items.map((it) => it.boss),
      result: s.log.result,
      endedOn: s.log.endedOn?.n,
      done: s.done,
      phases: p.phases,
    };
    const want = {
      zoneNos: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5],
      zones: [...s.zones.flatMap((z) => [z, z, z]), 'boss', 'boss', 'boss'],
      boss: [...Array(12).fill(false), true, true, true],
      result: 'win',
      endedOn: 14,
      done: 15,
      phases,
    };
    if (!isDeepStrictEqual(got, want)) bad.push(`seed ${p.seed}: ${JSON.stringify(got)}`);
  }
  assert.deepEqual(bad, []);
});

test('the town comes after zone 2, heals 20 life without passing 100, and its vendor sells again', () => {
  // One miss in zone 1: 75 life, 95 in town.
  let run = newRun(5);
  let s = run.state;
  toItem(run);
  assert.equal(miss(run), false);
  assert.equal(answer(run), true);
  playTo(run, 6);
  assert.equal(s.phase, 'between');
  assert.equal(s.life, 75);
  assert.equal(run.canBuy('flare'), false);
  assert.ok(run.next());
  assert.equal(s.phase, 'town');
  assert.equal(s.life, 95);
  assert.equal(s.arrivalHeal, 20);
  assert.deepEqual(
    SUPPLIES.filter((supply) => !run.canBuy(supply)),
    [],
  );
  const gold = s.gold;
  assert.ok(run.buy('lore'));
  assert.equal(s.gold, gold - 8);
  assert.deepEqual(s.pack, ['lore']);
  assert.ok(run.leave());
  assert.equal(s.phase, 'deal');
  assert.equal(s.offer.length, 3);
  assert.equal(toItem(run).zoneNo, 3);

  // No miss: 100 stays 100.
  run = newRun(5);
  s = run.state;
  playTo(run, 6);
  assert.ok(run.next());
  assert.equal(s.phase, 'town');
  assert.equal(s.life, 100);
  assert.equal(s.arrivalHeal, 0);

  // A miss of 10: 90 life heals only 10.
  run = newRun(5, withTuning({ missCost: { early: 10, late: 35, boss: 60 } }));
  s = run.state;
  toItem(run);
  miss(run);
  answer(run);
  playTo(run, 6);
  assert.equal(s.life, 90);
  assert.ok(run.next());
  assert.equal(s.life, 100);
  assert.equal(s.arrivalHeal, 10);
});

test('a miss costs 25 life in zones 1 and 2, 35 in zones 3 and 4 and 60 at the boss', () => {
  const run = newRun(6);
  const s = run.state;
  toItem(run);
  miss(run);
  assert.equal(s.life, 75);
  answer(run);
  playTo(run, 6);
  assert.ok(run.next());
  assert.equal(s.life, 95);
  toItem(run);
  miss(run);
  assert.equal(s.life, 60);
  answer(run);
  assert.deepEqual(
    s.log.items.map((it) => [it.lifeBefore, it.lifeAfter]).filter(([before, after]) => before !== after),
    [
      [100, 75],
      [95, 60],
    ],
  );

  const boss = newRun(6);
  playTo(boss, 12);
  assert.equal(toItem(boss).boss, 0);
  assert.equal(miss(boss), false);
  assert.equal(boss.state.life, 40);
  assert.equal(boss.state.phase, 'item');
});

test('the run is lost at 0 life, ending on the item it was lost on', () => {
  const run = newRun(7);
  const s = run.state;
  playTo(run, 1);
  const it = toItem(run);
  const lost = { n: it.n, itemId: it.itemId, name: answerOf(run).name };
  for (const life of [75, 50, 25]) {
    assert.equal(miss(run), false);
    assert.equal(s.life, life);
    assert.equal(s.phase, 'item');
  }
  assert.equal(miss(run), false);
  assert.equal(s.life, 0);
  assert.equal(s.phase, 'end');
  assert.equal(s.item, null);
  assert.equal(s.log.result, 'loss');
  assert.deepEqual(s.log.endedOn, lost);
  assert.notEqual(s.log.end, null);
  assert.equal(s.log.lifeEnd, 0);
  assert.equal(s.log.items.length, 2);
  assert.deepEqual(
    s.log.items[1].submits.map((sub) => sub.right),
    [false, false, false, false],
  );
  assert.equal(s.log.items[1].lifeAfter, 0);
  const bad: string[] = [];
  tryWrong(run, bad);
  assert.deepEqual(bad, []);

  // Life never goes below 0.
  const deep = newRun(7, withTuning({ missCost: { early: 30, late: 35, boss: 60 } }));
  toItem(deep);
  for (let i = 0; i < 4; i++) miss(deep);
  assert.equal(deep.state.life, 0);
  assert.equal(deep.state.log.lifeEnd, 0);
  assert.equal(deep.state.log.result, 'loss');

  // At the boss: two misses.
  const boss = newRun(7);
  playTo(boss, 13);
  toItem(boss);
  miss(boss);
  miss(boss);
  assert.equal(boss.state.life, 0);
  assert.equal(boss.state.log.result, 'loss');
  assert.equal(boss.state.log.endedOn?.n, 13);
});

test('a right answer pays the base reward times the card, halved per miss and rounded down, and the boss pays nothing', () => {
  const bad: string[] = [];
  for (const { seed, run } of plays()) {
    const s = run.state;
    for (const it of s.log.items) {
      const want = it.boss ? 0 : Math.floor((it.zoneNo <= 2 ? 5 : 7) * it.multiplier);
      if (it.gold !== want) bad.push(`seed ${seed}, item ${it.itemId}: ${it.gold} gold, not ${want}`);
    }
    const earned = s.log.items.reduce((t, it) => t + it.gold, 0);
    if (s.log.goldEarned !== earned || s.gold !== 20 + earned) bad.push(`seed ${seed}: ${s.gold} gold, ${s.log.goldEarned} earned of ${earned}`);
  }
  assert.deepEqual(bad, []);

  const run = newRun(8);
  const s = run.state;
  const paid = (misses: number) => {
    const it = toItem(run, 1);
    for (let i = 0; i < misses; i++) miss(run);
    const gold = s.gold;
    assert.equal(answer(run), true);
    return [s.gold - gold, Math.floor(((it.zoneNo <= 2 ? 5 : 7) * it.multiplier) / 2 ** misses)];
  };
  const [one, oneWant] = paid(1);
  assert.equal(one, oneWant);
  const [two, twoWant] = paid(2);
  assert.equal(two, twoWant);
  playTo(run, 6);
  const [late, lateWant] = paid(1);
  assert.equal(late, lateWant);
});

test('no item comes up twice in a run', () => {
  const bad: string[] = [];
  for (const { seed, run } of plays()) {
    const ids = run.state.log.items.map((it) => it.itemId);
    if (new Set(ids).size !== ids.length) bad.push(`seed ${seed}: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  }
  assert.deepEqual(bad, []);
});

test('the board holds 4 names in zones 1 and 2, 6 in zones 3 and 4 and 10 at the boss, 2 more in Blight', () => {
  // The engine asks a Tablet (a rare group) with 8 names at most, as in Delve.
  const bad: string[] = [];
  for (const { seed, run, deals } of plays()) {
    for (const d of deals) {
      const it = run.state.log.items[d.n];
      const want = (it.zoneNo <= 2 ? 4 : it.zoneNo <= 4 ? 6 : 10) + (it.zone === 'blight' ? 2 : 0);
      const names = d.rare ? Math.min(want, 8) : want;
      if (d.size !== want || d.names !== names || it.names !== names) bad.push(`seed ${seed}, item ${d.n} (${it.zone}): boardSize ${d.size}, ${d.names} names, not ${want}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('Blight never takes a board past 10 names', () => {
  const tuning = withTuning({ board: { early: 10, late: 10, boss: 10 } });
  const seed = Array.from({ length: 50 }, (_, i) => i + 1).find((sd) => newRun(sd).state.zones[0] === 'blight')!;
  const run = newRun(seed, tuning);
  assert.equal(run.state.zones[0], 'blight');
  assert.deepEqual(
    Array.from({ length: 15 }, (_, n) => run.boardSize(n)),
    Array(15).fill(10),
  );
  const it = toItem(run);
  const rare = Object.hasOwn(RARE_GROUPS, BY_ID.get(it.itemId)!.group);
  assert.equal(it.names.length, rare ? 8 : 10);
  assert.equal(new Set(it.names.map((nm) => nm.id)).size, it.names.length);
});

test('a deal is 3 different cards from the 10 categories, and the item is of the card picked', () => {
  const categories = [...new Set(ITEMS.map((it) => it.category))].sort();
  assert.equal(categories.length, 10);
  const bad: string[] = [];
  for (const { seed, run, deals } of plays()) {
    assert.deepEqual(run.engine.categories, categories);
    for (const d of deals.filter((dl) => dl.n < 12)) {
      const cats = d.offer.map((c) => c.category);
      if (cats.length !== 3 || new Set(cats).size !== 3 || cats.some((c) => !categories.includes(c))) bad.push(`seed ${seed}, item ${d.n}: ${cats}`);
      const it = run.state.log.items[d.n];
      if (it.category !== cats[d.pick] || it.multiplier !== d.offer[d.pick].multiplier) bad.push(`seed ${seed}, item ${d.n}: ${it.category} x${it.multiplier} for the card ${JSON.stringify(d.offer[d.pick])}`);
      if (BY_ID.get(it.itemId)!.category !== it.category) bad.push(`seed ${seed}, item ${d.n}: ${it.itemId} isn't in ${it.category}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a category picked is locked for the next 3 picks, and comes back after', () => {
  const bad: string[] = [];
  let chances = 0;
  let back = 0;
  for (const { seed, deals } of plays()) {
    const zone = deals.filter((d) => d.n < 12);
    for (const d of zone) {
      const cat = d.offer[d.pick].category;
      for (const later of zone.filter((l) => l.n > d.n && l.n <= d.n + 3)) if (later.offer.some((c) => c.category === cat)) bad.push(`seed ${seed}: ${cat}, picked for item ${d.n}, dealt again for item ${later.n}`);
      const fourth = zone.find((l) => l.n === d.n + 4);
      if (!fourth) continue;
      chances++;
      if (fourth.offer.some((c) => c.category === cat)) back++;
    }
  }
  assert.deepEqual(bad, []);
  // Free again, it's one of the 7 categories not locked, so about 3 deals in 7 have it.
  assert.ok(back / chances > 0.3, `back in ${back} of ${chances} fourth deals`);
});

test('a card multiplies by 1, 1.25, 1.5 or 2, weighted 4 : 3 : 2 : 1', () => {
  const counts = new Map<number, number>();
  for (const { deals } of plays()) for (const d of deals.filter((dl) => dl.n < 12)) for (const c of d.offer) counts.set(c.multiplier, (counts.get(c.multiplier) ?? 0) + 1);
  assert.deepEqual(
    [...counts.keys()].filter((m) => !MULTIPLIER_SHARES.some(([x]) => x === m)),
    [],
  );
  const total = [...counts.values()].reduce((t, c) => t + c, 0);
  assert.equal(total, SEEDS * 12 * 3);
  // 7200 cards: a share's standard error is under 0.006.
  assert.deepEqual(
    MULTIPLIER_SHARES.filter(([m, share]) => Math.abs((counts.get(m) ?? 0) / total - share) > 0.03).map(([m]) => `x${m}: ${(counts.get(m) ?? 0) / total}`),
    [],
  );
});

test('the boss picks its own category from the 10, never the same twice in its chain', () => {
  const bad: string[] = [];
  const firsts = new Set<string>();
  for (const { seed, run, deals } of plays()) {
    const boss = deals.filter((d) => d.n >= 12);
    const cats = boss.map((d) => d.offer.map((c) => c.category));
    if (boss.length !== 3 || cats.some((c) => c.length !== 1) || new Set(cats.flat()).size !== 3) bad.push(`seed ${seed}: ${JSON.stringify(cats)}`);
    if (!isDeepStrictEqual(run.state.bossCats, cats.flat())) bad.push(`seed ${seed}: bossCats ${run.state.bossCats}`);
    if (cats.flat().some((c) => !run.engine.categories.includes(c))) bad.push(`seed ${seed}: ${cats}`);
    firsts.add(cats[0][0]);
  }
  assert.deepEqual(bad, []);
  assert.equal(firsts.size, 10, 'any of the 10 can be the first');

  // The player can't pick a card the boss didn't deal.
  const run = newRun(9);
  playTo(run, 12);
  assert.ok(run.next());
  assert.equal(run.state.phase, 'deal');
  assert.equal(run.state.offer.length, 1);
  const before = JSON.stringify(run.state);
  assert.equal(run.pick(1), false);
  assert.equal(run.pick(2), false);
  assert.equal(JSON.stringify(run.state), before);
  assert.ok(run.pick(0));
  assert.equal(run.state.item!.boss, 0);
});

// ---- Actions in the wrong phase ----

type Action = [string, (run: Run) => boolean | null];
const ACTIONS: Action[] = [
  ...SUPPLIES.map((supply: Supply): Action => [`buy ${supply}`, (run) => run.buy(supply)]),
  ['drink', (run) => run.drink()],
  ['leave', (run) => run.leave()],
  ['next', (run) => run.next()],
  ...[0, 1, 2].map((i): Action => [`pick ${i}`, (run) => run.pick(i)]),
  ['open', (run) => run.open()],
  ...SUPPLIES.map((supply: Supply): Action => [`use ${supply}`, (run) => run.use(supply)]),
  ['lift', (run) => run.lift(0)],
  ['place', (run) => run.place(run.state.item?.tiles[0] ?? 'of')],
  ['unplace', (run) => run.unplace(0)],
  ['clear', (run) => run.clear()],
  ['submit', (run) => run.submit()],
];

/** What each place in a run allows (prefixes of ACTIONS' names); everything else is the wrong phase. */
const ALLOWED: Record<string, string[]> = {
  camp: ['buy', 'drink', 'leave'],
  deal: ['pick'],
  'boss deal': ['pick 0'],
  'item laid out': ['open'],
  'item open': ['use', 'lift', 'place', 'unplace', 'clear', 'submit'],
  between: ['drink', 'next'],
  town: ['buy', 'drink', 'leave'],
  end: [],
};

const placeOf = (run: Run) => {
  const s = run.state;
  if (s.phase === 'item') return s.item!.openedAt === null ? 'item laid out' : 'item open';
  if (s.phase === 'deal' && s.done >= 12) return 'boss deal';
  return s.phase;
};

/** Tries every action the run's place doesn't allow: each must refuse (submit with null) and change nothing. */
function tryWrong(run: Run, bad: string[]) {
  const where = placeOf(run);
  for (const [name, act] of ACTIONS) {
    if (ALLOWED[where].some((ok) => name.startsWith(ok))) continue;
    const before = JSON.stringify(run.state);
    const result = act(run);
    if (result !== (name === 'submit' ? null : false)) bad.push(`${where}: ${name} gave ${result}`);
    if (JSON.stringify(run.state) !== before) bad.push(`${where}: ${name} changed the state`);
  }
  return where;
}

test('an action in the wrong phase is refused, changes nothing and draws nothing from the seed', () => {
  const tuning = withTuning({ gold: 1000 });
  const plain = newRun(10, tuning);
  const tried = newRun(10, tuning);
  for (const run of [plain, tried]) for (const supply of SUPPLIES) assert.ok(run.buy(supply));
  const bad: string[] = [];
  const places = new Set<string>();
  const step = (run: Run) => {
    const s = run.state;
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'between') assert.ok(run.next());
    else if (s.phase === 'deal') assert.ok(run.pick(0));
    else if (s.item!.openedAt === null) {
      wait(run, 1000);
      assert.ok(run.open());
    } else assert.equal(answer(run), true);
  };
  places.add(tryWrong(tried, bad));
  while (plain.state.phase !== 'end') {
    step(plain);
    step(tried);
    places.add(tryWrong(tried, bad));
  }
  assert.deepEqual(bad, []);
  assert.deepEqual([...places].sort(), Object.keys(ALLOWED).sort());
  assert.deepEqual(tried.state, plain.state);
});
