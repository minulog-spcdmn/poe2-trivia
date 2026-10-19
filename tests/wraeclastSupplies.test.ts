import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLUES, DEFAULT_TUNING, ITEMS, MIN_NAMES, PACK_SLOTS, PATCHES, Run, covered, remaining, type ItemPlay, type Supply, type Tuning, type ZoneType } from '../src/wraeclast/rules.ts';

// The Wraeclast run's supplies and flask (src/wraeclast/rules.ts), as the
// handoff (docs/handoff/wraeclast/README.md) has them. Every run is seeded and
// its clock fake, so each plays the same every time.

/** Gold enough for any pack. */
const RICH: Tuning = { ...DEFAULT_TUNING, gold: 1000 };

function start(seed: number, tuning: Tuning = DEFAULT_TUNING) {
  const clock = { t: 1_000_000 };
  return { run: new Run({ seed, tuning, now: () => clock.t }), clock };
}

/** The first seed from `from` on whose zone 1 is of this type. */
function seedFor(zone: ZoneType, from = 1) {
  for (let seed = from; ; seed++) if (new Run({ seed, now: () => 0 }).state.zones[0] === zone) return seed;
}

/** On to the next item, from the camp, the town or the screen between items, and opens it. */
function toItem(run: Run, card = 0): ItemPlay {
  const s = run.state;
  if (s.phase === 'between') run.next();
  if (s.phase === 'camp' || s.phase === 'town') run.leave();
  assert.ok(run.pick(card));
  assert.ok(run.open());
  return s.item!;
}

function build(run: Run, words: string[][]) {
  run.clear();
  for (const syl of words.flat()) assert.ok(run.place(syl), syl);
}

function answer(run: Run) {
  const it = run.state.item!;
  build(run, it.names.find((nm) => nm.id === it.itemId)!.words);
  assert.equal(run.submit(), true);
}

/** Submits a wrong name of the board's (it's struck then), or once none is left a build that is no name. */
function miss(run: Run) {
  const it = run.state.item!;
  const right = it.names.find((nm) => nm.id === it.itemId)!.words;
  const wrong = remaining(it).find((nm) => nm.id !== it.itemId);
  build(run, wrong ? wrong.words : Array<string[][]>(it.misses + 2).fill(right).flat());
  assert.equal(run.submit(), false);
}

/** Plays items right until `done` are done. */
function playTo(run: Run, done: number) {
  while (run.state.done < done) {
    toItem(run);
    answer(run);
  }
}

/** Uses a Flare and taps every covered patch: how many it lifted. */
function flare(run: Run) {
  assert.ok(run.use('flare'));
  const it = run.state.item!;
  let n = 0;
  for (let i = 0; i < PATCHES; i++) if (!it.lifted[i] && run.lift(i)) n++;
  return n;
}

/** A run whose zone 1 is of this type and whose first item fits `want`: these bought at the camp, the item open. */
function find(zone: ZoneType, buys: Supply[], want: (it: ItemPlay) => boolean = () => true, tuning: Tuning = RICH) {
  for (let seed = 1; seed < 20_000; seed++)
    for (let card = 0; card < 3; card++) {
      const { run, clock } = start(seed, tuning);
      if (run.state.zones[0] !== zone) break;
      for (const s of buys) assert.ok(run.buy(s), `buy ${s}`);
      const it = toItem(run, card);
      if (want(it)) return { run, clock, it };
    }
  throw new Error(`no ${zone} item fits`);
}

const mods = (it: ItemPlay) => CLUES[it.itemId].mods.length;

// ---- The pack ----

test('a supply is used only from the pack, and one is used up each time', () => {
  const { run } = start(seedFor('plain'));
  const s = run.state;
  for (const supply of ['flare', 'flare', 'requirement'] as Supply[]) assert.ok(run.buy(supply));
  const it = toItem(run);
  // A Lore reveal has something to show here, but none is in the pack.
  assert.equal(run.works('lore'), true);
  assert.equal(run.canUse('lore'), false);
  assert.equal(run.use('lore'), false);
  assert.ok(run.use('requirement'));
  assert.deepEqual(s.pack, ['flare', 'flare']);
  assert.ok(run.use('flare'));
  assert.deepEqual(s.pack, ['flare']);
  assert.equal(it.shown.req, true);
});

test('supplies are bought at the camp and the town only, never in a deal, an item or between items', () => {
  const { run } = start(1, RICH);
  const s = run.state;
  const at: string[] = [];
  const tryBuy = () => at.push(`${s.phase}: ${run.canBuy('flare')} ${run.buy('flare')}`);
  tryBuy();
  run.leave();
  tryBuy();
  run.pick(0);
  tryBuy();
  run.open();
  tryBuy();
  answer(run);
  tryBuy();
  playTo(run, 6);
  run.next();
  tryBuy();
  assert.deepEqual(at, ['camp: true true', 'deal: false false', 'item: false false', 'item: false false', 'between: false false', 'town: true true']);
  assert.deepEqual(s.pack, ['flare', 'flare']);
});

test('the pack holds 8 supplies', () => {
  const { run } = start(1, RICH);
  for (let i = 0; i < PACK_SLOTS; i++) assert.ok(run.buy('requirement'));
  assert.equal(run.canBuy('flare'), false);
  assert.equal(run.buy('flare'), false);
  assert.equal(run.state.pack.length, 8);
});

// ---- Flare ----

test('a Flare lifts 2 patches the player taps, and 1 in an Incursion zone', () => {
  const lifts: Record<string, number> = {};
  for (const zone of ['plain', 'incursion', 'ritual', 'blight'] as ZoneType[]) {
    const { run } = find(zone, ['flare']);
    lifts[zone] = flare(run);
  }
  // The zone's rule stays when the tuning turns its free clue off.
  const { run } = find('incursion', ['flare'], () => true, { ...RICH, freeClue: { ...RICH.freeClue, incursion: false } });
  lifts['incursion, free clue off'] = flare(run);
  assert.deepEqual(lifts, { plain: 2, incursion: 1, ritual: 2, blight: 2, 'incursion, free clue off': 1 });
});

test('a tap lifts nothing without a Flare in hand, or on a patch already lifted', () => {
  const { run, it } = find('plain', ['flare']);
  const up = it.lifted.indexOf(true);
  const closed = it.lifted.flatMap((u, i) => (u ? [] : [i]));
  assert.equal(it.lifted.filter(Boolean).length, 1);
  assert.equal(run.lift(closed[0]), false);
  assert.ok(run.use('flare'));
  assert.equal(run.lift(up), false);
  assert.equal(run.lift(closed[0]), true);
  assert.equal(run.lift(closed[0]), false);
  assert.equal(run.lift(closed[1]), true);
  assert.equal(run.lift(closed[2]), false);
  answer(run);
  assert.equal(run.state.log.items[0].patches, 3);
});

test('a Flare can\'t be used once the patches still covered are lifted or in its reach already', () => {
  // Blight lifts 2 for free: 14 left, 7 Flares' worth.
  const { run, it } = find('blight', Array(8).fill('flare'));
  assert.equal(covered(it), 14);
  for (let k = 0; k < 6; k++) assert.equal(flare(run), 2);
  assert.ok(run.use('flare'));
  // The Flare in hand reaches both patches left: another has nothing to show.
  assert.equal(run.canUse('flare'), false);
  for (let i = 0; i < PATCHES; i++) if (!it.lifted[i]) run.lift(i);
  assert.equal(covered(it), 0);
  assert.equal(run.works('flare'), false);
  assert.equal(run.use('flare'), false);
  assert.deepEqual(run.state.pack, ['flare']);
});

/** The two side columns, bare as the page's letterbox leaves them on a narrow item. */
const SIDES = Array.from({ length: PATCHES }, (_, i) => i % 4 === 0 || i % 4 === 3);

test("a bare patch (the page's letterbox) covers nothing: it can't be lifted, and a Flare waits only on patches with art under them", () => {
  const middle = (it: ItemPlay) => [1, 2].includes(it.lifted.indexOf(true) % 4);
  const { run, it } = find('plain', Array(5).fill('flare'), middle);
  assert.ok(run.setBare(SIDES));
  assert.deepEqual(it.bare, SIDES);
  assert.equal(covered(it), 7);
  // A tap on a bare patch lifts nothing, the Flare still in hand.
  assert.ok(run.use('flare'));
  assert.equal(run.lift(0), false);
  assert.equal(it.flare, 2);
  let lifted = 0;
  for (let i = 0; i < PATCHES; i++) if (!it.lifted[i] && run.lift(i)) lifted++;
  assert.equal(lifted, 2);
  // Two more Flares lift 4, and the fourth reaches the one left: it isn't left waiting on a bare patch.
  assert.equal(flare(run), 2);
  assert.equal(flare(run), 2);
  assert.equal(covered(it), 1);
  assert.equal(flare(run), 1);
  assert.equal(it.flare, 0);
  // Nothing with art under it is left: the fifth Flare stays in the pack.
  assert.equal(run.works('flare'), false);
  assert.equal(run.use('flare'), false);
  assert.deepEqual(run.state.pack, ['flare']);
  answer(run);
  assert.equal(run.state.log.items[0].patches, 8);
});

test('a Flare in hand never waits on more patches than setBare leaves covered, and a lifted patch stays lifted', () => {
  const { run, it } = find('plain', ['flare']);
  assert.ok(run.use('flare'));
  assert.equal(it.flare, 2);
  assert.ok(run.setBare(Array(PATCHES).fill(true)));
  assert.equal(covered(it), 0);
  assert.equal(it.flare, 0);
  assert.deepEqual(
    it.bare.map((b, i) => b || it.lifted[i]),
    Array(PATCHES).fill(true),
  );
  assert.equal(it.bare.filter(Boolean).length, 15);
  assert.equal(run.setBare([true]), false);
});

test('free patches never land on a bare patch', () => {
  const bad: string[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    const { run } = start(seed);
    run.leave();
    run.pick(0);
    run.setBare(SIDES);
    run.open(null);
    const it = run.state.item!;
    it.lifted.forEach((up, i) => up && SIDES[i] && bad.push(`seed ${seed}: patch ${i}`));
  }
  assert.deepEqual(bad, []);
});

test('at the boss only Flares work, and they lift 2 patches on its first two items and 1 on its third', () => {
  const { run } = start(1, RICH);
  const others: Supply[] = ['requirement', 'wisdom', 'strike', 'lore'];
  for (const s of ['flare', 'flare', 'flare', ...others] as Supply[]) assert.ok(run.buy(s));
  playTo(run, 12);
  const bad: string[] = [];
  const lifts: number[] = [];
  for (let b = 0; b < 3; b++) {
    const it = toItem(run);
    assert.equal(it.boss, b);
    for (const s of others) if (run.works(s) || run.canUse(s) || run.use(s)) bad.push(`boss item ${b + 1}: ${s}`);
    lifts.push(flare(run));
    answer(run);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(lifts, [2, 2, 1]);
  assert.deepEqual(run.state.pack, others);
  assert.equal(run.state.log.result, 'win');
});

// ---- Requirement reveal ----

test('a Requirement reveal shows the requirements, and a second has nothing left to show', () => {
  const { run, it } = find('plain', ['requirement', 'requirement']);
  assert.ok(CLUES[it.itemId].req.length > 0);
  assert.equal(it.shown.req, false);
  assert.ok(run.use('requirement'));
  assert.equal(it.shown.req, true);
  assert.equal(run.canUse('requirement'), false);
  assert.equal(run.use('requirement'), false);
  assert.deepEqual(run.state.pack, ['requirement']);
});

// ---- Scroll of Wisdom ----

test('each Scroll of Wisdom shows one more mod line, in tooltip order, until none is left', () => {
  const bad: string[] = [];
  let ranOut = 0;
  for (let seed = seedFor('plain'), k = 0; k < 20; seed = seedFor('plain', seed + 1), k++) {
    const { run } = start(seed, RICH);
    for (let i = 0; i < PACK_SLOTS; i++) run.buy('wisdom');
    const it = toItem(run);
    const shown: number[] = [];
    while (run.use('wisdom')) shown.push(it.shown.mods);
    const n = Math.min(mods(it), PACK_SLOTS);
    const want = Array.from({ length: n }, (_, i) => i + 1);
    if (shown.join() !== want.join()) bad.push(`seed ${seed}: ${shown} for ${mods(it)} mod lines`);
    if (run.state.pack.length !== PACK_SLOTS - n) bad.push(`seed ${seed}: ${run.state.pack.length} left`);
    if (mods(it) < PACK_SLOTS) ranOut++;
  }
  assert.deepEqual(bad, []);
  assert.ok(ranOut > 0);
});

test('in a Ritual zone the first mod line is free, so a Scroll shows the second, and none on an item with one', () => {
  const two = find('ritual', ['wisdom'], (it) => mods(it) >= 2);
  assert.equal(two.it.freeClue, 'mod');
  assert.equal(two.it.shown.mods, 1);
  assert.ok(two.run.use('wisdom'));
  assert.equal(two.it.shown.mods, 2);

  const one = find('ritual', ['wisdom'], (it) => mods(it) === 1);
  assert.equal(one.it.shown.mods, 1);
  assert.equal(one.run.canUse('wisdom'), false);
  assert.equal(one.run.use('wisdom'), false);

  const off = find('ritual', ['wisdom'], (it) => mods(it) >= 1, { ...RICH, freeClue: { ...RICH.freeClue, ritual: false } });
  assert.equal(off.it.shown.mods, 0);
  assert.ok(off.run.use('wisdom'));
  assert.equal(off.it.shown.mods, 1);
});

test('on a gem, a Requirement reveal shows its requirement lines, and the first Scroll its Category line', () => {
  const { run, it } = find('plain', ['requirement', 'wisdom'], (it) => ITEMS.find((x) => x.id === it.itemId)!.kind === 'gem');
  const clues = CLUES[it.itemId];
  assert.ok(clues.req.length > 0);
  assert.ok(run.use('requirement'));
  assert.equal(it.shown.req, true);
  assert.ok(run.use('wisdom'));
  assert.equal(it.shown.mods, 1);
  assert.match(clues.mods[0][1], /^Category: /);
});

// ---- Name strike ----

test('a Name strike strikes one wrong name, never the answer, and never leaves fewer than 3', () => {
  const bad: string[] = [];
  const sizes = new Set<number>();
  for (const zone of ['plain', 'blight'] as ZoneType[])
    for (let seed = seedFor(zone), k = 0; k < 25; seed = seedFor(zone, seed + 1), k++) {
      const { run } = start(seed, RICH);
      for (let i = 0; i < 4; i++) run.buy('strike');
      const it = toItem(run);
      const size = it.names.length;
      sizes.add(size);
      let used = 0;
      while (run.use('strike')) if (it.struck.length !== ++used) bad.push(`seed ${seed}: ${it.struck.length} struck after ${used}`);
      if (it.struck.includes(it.itemId)) bad.push(`seed ${seed}: the answer struck`);
      if (used !== Math.max(0, size - MIN_NAMES)) bad.push(`seed ${seed}: ${used} strikes on ${size} names`);
      if (remaining(it).length !== Math.min(size, MIN_NAMES)) bad.push(`seed ${seed}: ${remaining(it).length} names left`);
      if (run.state.pack.length !== 4 - used) bad.push(`seed ${seed}: ${run.state.pack.length} strikes left`);
      answer(run);
    }
  assert.deepEqual(bad, []);
  assert.ok(sizes.has(4) && sizes.has(6), `board sizes ${[...sizes]}`);
});

test('a name a miss struck counts too: a Name strike never takes the board below 3', () => {
  const { run, it } = find('plain', ['strike'], (it) => it.names.length === 4);
  miss(run);
  assert.equal(remaining(it).length, 3);
  assert.equal(run.canUse('strike'), false);
  assert.equal(run.use('strike'), false);
  assert.deepEqual(run.state.pack, ['strike']);
});

// ---- Lore reveal ----

test('a Lore reveal shows the flavour text once, and never works in a Ritual zone', () => {
  const offRitual: Tuning = { ...RICH, freeClue: { ...RICH.freeClue, ritual: false } };
  const seen: Record<string, boolean[]> = {};
  for (const [label, zone, tuning] of [
    ['plain', 'plain', RICH],
    ['blight', 'blight', RICH],
    ['ritual', 'ritual', RICH],
    ['ritual, free clue off', 'ritual', offRitual],
  ] as [string, ZoneType, Tuning][]) {
    const { run, it } = find(zone, ['lore', 'lore'], () => true, tuning);
    // Usable before, used, the flavour shown, usable after.
    seen[label] = [run.canUse('lore'), run.use('lore'), it.shown.flavor, run.canUse('lore')];
  }
  assert.deepEqual(seen, {
    plain: [true, true, true, false],
    blight: [true, true, true, false],
    ritual: [false, false, false, false],
    'ritual, free clue off': [false, false, false, false],
  });
});

test('in an Incursion zone the flavour text is free, so a Lore reveal has nothing to show, unless the free clue is off', () => {
  const free = find('incursion', ['lore']);
  assert.equal(free.it.freeClue, 'flavor');
  assert.equal(free.it.shown.flavor, true);
  assert.equal(free.run.canUse('lore'), false);
  assert.equal(free.run.use('lore'), false);
  assert.deepEqual(free.run.state.pack, ['lore']);

  const off = find('incursion', ['lore'], () => true, { ...RICH, freeClue: { ...RICH.freeClue, incursion: false } });
  assert.equal(off.it.shown.flavor, false);
  assert.ok(off.run.use('lore'));
  assert.equal(off.it.shown.flavor, true);
});

// ---- The log ----

test('each item logs the supplies used on it: type, order and ms since it opened', () => {
  const { run, clock } = start(seedFor('plain'), RICH);
  for (const s of ['flare', 'flare', 'requirement', 'lore', 'wisdom'] as Supply[]) assert.ok(run.buy(s));
  run.leave();
  run.pick(0);
  // Laid out but not yet open: its clock hasn't started.
  clock.t += 5000;
  run.open();
  clock.t += 1500;
  assert.ok(run.use('requirement'));
  clock.t += 2000;
  flare(run);
  clock.t += 250;
  assert.ok(run.use('lore'));
  clock.t += 100;
  assert.equal(run.use('requirement'), false);
  answer(run);
  toItem(run);
  clock.t += 700;
  assert.ok(run.use('wisdom'));
  answer(run);
  toItem(run);
  answer(run);
  const log = run.state.log;
  assert.deepEqual(
    log.items.map((i) => i.supplies),
    [
      [
        { type: 'requirement', order: 1, ms: 1500 },
        { type: 'flare', order: 2, ms: 3500 },
        { type: 'lore', order: 3, ms: 3750 },
      ],
      [{ type: 'wisdom', order: 1, ms: 700 }],
      [],
    ],
  );
  assert.deepEqual(log.bought, { flare: 2, requirement: 1, wisdom: 1, strike: 0, lore: 1 });
  assert.deepEqual(log.used, { flare: 1, requirement: 1, wisdom: 1, strike: 0, lore: 1 });
  assert.equal(log.noSupply, 1);
});

// ---- The flask ----

test('the flask has 2 charges, drunk only between items: the camp, the town, the screen between', () => {
  const { run } = start(1);
  const s = run.state;
  const at: string[] = [];
  const check = () => at.push(`${s.phase}: ${run.canDrink()}`);
  check();
  run.leave();
  check();
  assert.equal(run.drink(), false);
  run.pick(0);
  check();
  run.open();
  check();
  assert.equal(run.drink(), false);
  assert.equal(s.flask.charges, 2);
  answer(run);
  check();
  playTo(run, 6);
  run.next();
  check();
  assert.deepEqual(at, ['camp: true', 'deal: false', 'item: false', 'item: false', 'between: true', 'town: true']);

  assert.ok(run.drink());
  assert.ok(run.drink());
  assert.equal(s.flask.charges, 0);
  assert.equal(run.canDrink(), false);
  assert.equal(run.drink(), false);
  assert.equal(s.log.drinks, 2);
});

test('the town doesn\'t refill the flask, and the end screen takes no drink', () => {
  const { run } = start(1);
  const s = run.state;
  assert.ok(run.drink());
  assert.ok(run.drink());
  playTo(run, 6);
  run.next();
  assert.equal(s.phase, 'town');
  assert.equal(s.flask.charges, 0);
  assert.equal(run.canDrink(), false);

  const lost = start(1).run;
  toItem(lost);
  for (let i = 0; i < 4; i++) miss(lost);
  assert.equal(lost.state.phase, 'end');
  assert.equal(lost.state.flask.charges, 2);
  assert.equal(lost.canDrink(), false);
  assert.equal(lost.drink(), false);
});

test('a drink heals 10 after each of the next 3 items, misses on them or not', () => {
  const { run } = start(1);
  assert.ok(run.drink());
  toItem(run);
  miss(run);
  miss(run);
  answer(run);
  playTo(run, 4);
  const items = run.state.log.items;
  assert.deepEqual(
    items.map((i) => [i.lifeBefore, i.healed, i.lifeAfter]),
    [
      [100, 10, 60],
      [60, 10, 70],
      [70, 10, 80],
      [80, 0, 80],
    ],
  );
  assert.equal(run.state.last!.healed, 0);
});

test('the flask never heals above 100 life, and a heal at full life is lost', () => {
  const capped = start(1).run;
  assert.ok(capped.drink());
  toItem(capped);
  miss(capped);
  answer(capped);
  playTo(capped, 3);
  assert.deepEqual(
    capped.state.log.items.map((i) => [i.healed, i.lifeAfter]),
    [
      [10, 85],
      [10, 95],
      [5, 100],
    ],
  );

  const full = start(1).run;
  assert.ok(full.drink());
  playTo(full, 1);
  toItem(full);
  miss(full);
  answer(full);
  playTo(full, 3);
  toItem(full);
  miss(full);
  answer(full);
  assert.deepEqual(
    full.state.log.items.map((i) => [i.healed, i.lifeAfter]),
    [
      [0, 100],
      [10, 85],
      [10, 95],
      [0, 70],
    ],
  );
  assert.equal(full.state.life, 70);
});

test('a second drink while one still heals starts it over, and the rest of the first is lost', () => {
  const { run } = start(1);
  assert.ok(run.drink());
  toItem(run);
  miss(run);
  miss(run);
  answer(run);
  assert.ok(run.drink());
  playTo(run, 5);
  assert.deepEqual(
    run.state.log.items.map((i) => i.healed),
    [10, 10, 10, 10, 0],
  );

  // Both charges at the camp: the second only starts the first over.
  const twice = start(1).run;
  assert.ok(twice.drink());
  assert.ok(twice.drink());
  toItem(twice);
  miss(twice);
  miss(twice);
  answer(twice);
  playTo(twice, 4);
  assert.deepEqual(
    twice.state.log.items.map((i) => i.healed),
    [10, 10, 10, 0],
  );
});

test('the flask heals after the boss\'s items too', () => {
  const { run } = start(1);
  playTo(run, 12);
  assert.equal(run.state.life, 100);
  assert.ok(run.drink());
  toItem(run);
  miss(run);
  answer(run);
  playTo(run, 15);
  const boss = run.state.log.items.slice(12);
  assert.deepEqual(
    boss.map((i) => [i.boss, i.healed, i.lifeAfter]),
    [
      [true, 10, 50],
      [true, 10, 60],
      [true, 10, 70],
    ],
  );
  assert.equal(run.state.log.result, 'win');
  assert.equal(run.state.log.lifeEnd, 70);
});

test('each item logs whether the flask was drunk before it', () => {
  const { run } = start(1, { ...DEFAULT_TUNING, flask: 3 });
  assert.ok(run.drink());
  playTo(run, 2);
  assert.ok(run.drink());
  playTo(run, 6);
  run.next();
  assert.equal(run.state.phase, 'town');
  assert.ok(run.drink());
  playTo(run, 8);
  assert.deepEqual(
    run.state.log.items.map((i) => i.drank),
    [true, false, true, false, false, false, true, false],
  );
});

test('a run lost on an item ends at 0 life, though the flask still had heals to give', () => {
  const { run } = start(1);
  assert.ok(run.drink());
  toItem(run);
  for (let i = 0; i < 4; i++) miss(run);
  const s = run.state;
  assert.equal(s.phase, 'end');
  assert.equal(s.log.result, 'loss');
  assert.equal(s.life, 0);
  assert.equal(s.log.lifeEnd, 0);
  assert.deepEqual([s.log.items[0].healed, s.log.items[0].lifeAfter], [0, 0]);
});
