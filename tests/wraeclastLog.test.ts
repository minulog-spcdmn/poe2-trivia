import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { RARE_GROUPS, RARE_MAX_OPTIONS } from '../src/lib/game.ts';
import { DEFAULT_TUNING, ITEMS, Run, type FreeClue, type ItemLog, type ItemPlay, type RunLog, type Supply, type Tuning, type ZoneType } from '../src/wraeclast/rules.ts';

// The Wraeclast run's log and tuning (src/wraeclast/rules.ts) against the
// handoff (docs/handoff/wraeclast/README.md, "The run log" and "Tuning
// panel"). Its numbers are written out again here, so rules.ts can't move both.
const HANDOFF = {
  life: 100,
  gold: 20,
  flask: 2,
  missCost: { early: 25, late: 35, boss: 60 },
  reward: { early: 5, late: 7 },
  price: { flare: 4, requirement: 3, wisdom: 6, strike: 6, lore: 8 },
  board: { early: 4, late: 6, boss: 10 },
  freeClue: { plain: true, incursion: true, ritual: true, blight: true },
};
const ZONE_TYPES: ZoneType[] = ['plain', 'incursion', 'ritual', 'blight'];
const FREE_CLUE: Record<ZoneType, FreeClue> = { plain: 'patch', incursion: 'flavor', ritual: 'mod', blight: 'patches' };
const FREE_PATCHES: Record<ZoneType, number> = { plain: 1, incursion: 0, ritual: 0, blight: 2 };

const ITEM_FIELDS = ['itemId', 'category', 'zone', 'boss', 'names', 'freeClue', 'multiplier', 'supplies', 'patches', 'submits', 'lifeBefore', 'lifeAfter', 'gold', 'drank'] as const;
const RUN_FIELDS = ['start', 'end', 'result', 'endedOn', 'misses', 'noSupply', 'bought', 'used', 'goldEarned', 'goldSpent', 'lifeEnd', 'tuning', 'viewport'] as const;
type Want = Pick<ItemLog, (typeof ITEM_FIELDS)[number]>;

const T0 = Date.UTC(2026, 9, 19, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

type Section = 'early' | 'late' | 'boss';
const sectionOf = (n: number): Section => (n < 6 ? 'early' : n < 12 ? 'late' : 'boss');
const zoneOf = (run: Run, n: number): ZoneType | 'boss' => (n < 12 ? run.state.zones[Math.floor(n / 3)] : 'boss');
const nameOf = (id: string) => ITEMS.find((it) => it.id === id)!.name;
const tuned = (change: Partial<Tuning>): Tuning => ({ ...structuredClone(DEFAULT_TUNING), ...change });
const itemsOf = (log: RunLog) => log.items.map((it) => Object.fromEntries(ITEM_FIELDS.map((f) => [f, it[f]])));
const summaryOf = (log: RunLog) => Object.fromEntries(RUN_FIELDS.filter((f) => f !== 'endedOn').map((f) => [f, log[f]]));

/** The board the handoff asks for: the section's size, 2 more in Blight, 10 at most (fewer for a rare group's answer, as the engine's questions have it). */
function boardFor(t: Tuning, zone: ZoneType | 'boss', n: number, itemId: string) {
  const size = Math.min(10, t.board[sectionOf(n)] + (zone === 'blight' ? 2 : 0));
  return Object.hasOwn(RARE_GROUPS, ITEMS.find((it) => it.id === itemId)!.group) ? Math.min(size, RARE_MAX_OPTIONS) : size;
}

const answerOf = (run: Run) => {
  const it = run.state.item!;
  return it.names.find((nm) => nm.id === it.itemId)!;
};
const decoyOf = (run: Run) => {
  const it = run.state.item!;
  return it.names.find((nm) => nm.id !== it.itemId && !it.struck.includes(nm.id))!;
};

function place(run: Run, words: string[][]) {
  run.clear();
  for (const syl of words.flat()) assert.ok(run.place(syl), syl);
}

/** A miss with a build that is no real name: the answer twice. */
function missTwice(run: Run) {
  const a = answerOf(run);
  place(run, [...a.words, ...a.words]);
  assert.equal(run.submit(), false);
}

/** Plays on to the end: card 0 each time, every answer built right at once; `each` runs on each item as it opens. */
function playOn(run: Run, each: (it: ItemPlay) => void = () => {}) {
  const s = run.state;
  while (s.phase !== 'end') {
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'between') assert.ok(run.next());
    else {
      assert.ok(run.pick(0));
      assert.ok(run.open());
      each(s.item!);
      place(run, answerOf(run).words);
      assert.equal(run.submit(), true);
    }
  }
  return s.log;
}

/** A scripted run on a fake clock, and what its log should say about each item. */
interface Play {
  run: Run;
  clock: number;
  /** When the open item opened, and its place in the run. */
  opened: number;
  n: number;
  want: Want[];
}

function start(seed: number, opts: { viewport?: number; tuning?: Tuning } = {}): Play {
  const p: Play = { run: null!, clock: T0, opened: T0, n: -1, want: [] };
  p.run = new Run({ ...opts, seed, now: () => p.clock });
  return p;
}

/** Picks card `card` and opens the item 2.5 s later (time on the laid-out item the log doesn't count). */
function openItem(p: Play, card: number, drank: boolean): Want {
  const { run } = p;
  assert.equal(run.state.phase, 'deal');
  const offer = run.state.offer[card];
  assert.ok(run.pick(card));
  const it = run.state.item!;
  const zone = zoneOf(run, it.n);
  p.clock += 2500;
  assert.ok(run.open());
  p.opened = p.clock;
  p.n = it.n;
  const t = run.state.tuning;
  const free = zone !== 'boss' && t.freeClue[zone];
  const w: Want = {
    itemId: it.itemId,
    category: offer.category,
    zone,
    boss: zone === 'boss',
    names: boardFor(t, zone, it.n, it.itemId),
    freeClue: zone === 'boss' ? (it.n === 12 ? 'patch' : 'none') : free ? FREE_CLUE[zone] : 'none',
    multiplier: offer.multiplier,
    supplies: [],
    patches: zone === 'boss' ? (it.n === 12 ? 1 : 0) : free ? FREE_PATCHES[zone] : 0,
    submits: [],
    lifeBefore: 0,
    lifeAfter: 0,
    gold: 0,
    drank,
  };
  p.want.push(w);
  return w;
}

function use(p: Play, w: Want, supply: Supply) {
  assert.ok(p.run.use(supply), `${supply} on ${nameOf(w.itemId)}`);
  w.supplies.push({ type: supply, order: w.supplies.length + 1, ms: p.clock - p.opened });
}

/** Taps two covered patches (the most a Flare lifts); the log should count what the handoff says this Flare lifts. */
function lift(p: Play, w: Want) {
  const it = p.run.state.item!;
  for (let i = 0, tapped = 0; i < 16 && tapped < 2; i++) if (!it.lifted[i] && p.run.lift(i)) tapped++;
  w.patches += p.n === 14 || w.zone === 'incursion' ? 1 : 2;
}

function submit(p: Play, w: Want, words: string[][], text: string, right: boolean) {
  place(p.run, words);
  assert.equal(p.run.submit(), right);
  w.submits.push({ text, right, ms: p.clock - p.opened });
}

function wrongName(p: Play, w: Want) {
  const d = decoyOf(p.run);
  submit(p, w, d.words, d.name, false);
}

function wrongTwice(p: Play, w: Want) {
  const a = answerOf(p.run);
  submit(p, w, [...a.words, ...a.words], `${a.name} ${a.name}`, false);
}

/** The answer, built right: it pays the section's base reward x the card, halved once per miss, rounded down (none at the boss). */
function answer(p: Play, w: Want) {
  const misses = w.submits.filter((sb) => !sb.right).length;
  submit(p, w, answerOf(p.run).words, nameOf(w.itemId), true);
  const section = sectionOf(p.n);
  w.gold = section === 'boss' ? 0 : Math.floor((HANDOFF.reward[section] * w.multiplier) / 2 ** misses);
}

function setLife(p: Play, life: [number, number][]) {
  assert.equal(p.want.length, life.length);
  p.want.forEach((w, i) => ([w.lifeBefore, w.lifeAfter] = life[i]));
}

/** Seed 2 deals Incursion, Blight, Plain, Ritual: a won run with misses in every section, supplies, two drinks and the town. */
function wonRun() {
  const p = start(2, { viewport: 375 });
  const { run } = p;
  assert.deepEqual(run.state.zones, ['incursion', 'blight', 'plain', 'ritual']);
  p.clock += 30_000;
  for (const sup of ['flare', 'requirement', 'strike'] as const) assert.ok(run.buy(sup));
  assert.ok(run.drink());
  assert.ok(run.leave());

  let w = openItem(p, 0, true);
  p.clock += 1200;
  use(p, w, 'requirement');
  p.clock += 800;
  use(p, w, 'flare');
  lift(p, w);
  p.clock += 1500;
  wrongName(p, w);
  p.clock += 2500;
  answer(p, w);

  assert.ok(run.next());
  w = openItem(p, 1, false);
  p.clock += 4000;
  use(p, w, 'strike');
  p.clock += 1000;
  wrongTwice(p, w);
  p.clock += 2000;
  answer(p, w);

  assert.ok(run.next());
  w = openItem(p, 2, false);
  p.clock += 900;
  wrongName(p, w);
  p.clock += 100;
  answer(p, w);

  for (const k of [3, 4, 5]) {
    assert.ok(run.next());
    w = openItem(p, k % 3, false);
    p.clock += 1000 * k;
    answer(p, w);
  }

  // The flask again before the town; two Flares there for the boss.
  assert.ok(run.drink());
  assert.ok(run.next());
  assert.equal(run.state.phase, 'town');
  assert.ok(run.buy('flare'));
  assert.ok(run.buy('flare'));
  assert.ok(run.leave());

  w = openItem(p, 0, true);
  p.clock += 2200;
  wrongName(p, w);
  p.clock += 800;
  answer(p, w);
  for (const k of [7, 8, 9, 10, 11]) {
    assert.ok(run.next());
    w = openItem(p, k % 3, false);
    p.clock += 600;
    answer(p, w);
  }

  assert.ok(run.next());
  w = openItem(p, 0, false);
  p.clock += 1000;
  use(p, w, 'flare');
  lift(p, w);
  p.clock += 1000;
  wrongName(p, w);
  p.clock += 1000;
  answer(p, w);
  assert.ok(run.next());
  w = openItem(p, 0, false);
  p.clock += 5000;
  answer(p, w);
  assert.ok(run.next());
  w = openItem(p, 0, false);
  p.clock += 700;
  use(p, w, 'flare');
  lift(p, w);
  p.clock += 300;
  answer(p, w);
  assert.equal(run.state.phase, 'end');

  // A miss costs 25, 35, 60 by section; a drink gives 10 after each of the next 3 items; the town heals 20.
  setLife(p, [
    [100, 85], [85, 70], [70, 55], [55, 55], [55, 55], [55, 55],
    [75, 50], [50, 60], [60, 70], [70, 70], [70, 70], [70, 70],
    [70, 10], [10, 10], [10, 10],
  ]);
  return p;
}

/** Seed 1 deals Blight first: one item right with no supply, then a Scroll of Wisdom and four misses of 25. */
function lostRun() {
  const p = start(1, { viewport: 390 });
  const { run } = p;
  assert.equal(run.state.zones[0], 'blight');
  p.clock += 12_000;
  assert.ok(run.buy('wisdom'));
  assert.ok(run.leave());

  let w = openItem(p, 2, false);
  p.clock += 4200;
  answer(p, w);

  assert.ok(run.next());
  w = openItem(p, 1, false);
  p.clock += 1500;
  use(p, w, 'wisdom');
  p.clock += 500;
  wrongTwice(p, w);
  p.clock += 1000;
  wrongName(p, w);
  p.clock += 1000;
  wrongName(p, w);
  p.clock += 1000;
  wrongTwice(p, w);
  assert.equal(run.state.phase, 'end');
  setLife(p, [
    [100, 100],
    [100, 0],
  ]);
  return p;
}

test("the default tuning is the handoff's numbers, and a run starts with them", () => {
  const { wordCount, ...numbers } = DEFAULT_TUNING;
  assert.deepEqual(numbers, HANDOFF);
  assert.equal(typeof wordCount, 'boolean');
  const s = new Run({ seed: 9, now: () => T0 }).state;
  assert.deepEqual([s.life, s.gold, s.flask.charges, s.pack.length], [100, 20, 2, 0]);
});

test('every field the handoff lists is in the log, per item and per run', () => {
  const log = wonRun().run.state.log;
  const missing = log.items.flatMap((it, n) => ITEM_FIELDS.filter((f) => !Object.hasOwn(it, f)).map((f) => `item ${n}: ${f}`));
  missing.push(...RUN_FIELDS.filter((f) => !Object.hasOwn(log, f)));
  assert.deepEqual(missing, []);
});

test('a won run logs each item exactly: card, zone, board, free clue, supplies, patches, submits, life, gold and drink', () => {
  const p = wonRun();
  assert.deepEqual(itemsOf(p.run.state.log), p.want);
});

test('a won run logs its times, result, last item, misses, items with no supply, supplies, gold, life, tuning and viewport', () => {
  const p = wonRun();
  const log = p.run.state.log;
  const earned = p.want.reduce((t, w) => t + w.gold, 0);
  assert.ok(earned > 0);
  assert.deepEqual(summaryOf(log), {
    start: iso(T0),
    end: iso(p.clock),
    result: 'win',
    misses: 5,
    noSupply: 11,
    bought: { flare: 3, requirement: 1, wisdom: 0, strike: 1, lore: 0 },
    used: { flare: 3, requirement: 1, wisdom: 0, strike: 1, lore: 0 },
    goldEarned: earned,
    goldSpent: 4 + 3 + 6 + 4 + 4,
    lifeEnd: 10,
    tuning: { ...HANDOFF, wordCount: DEFAULT_TUNING.wordCount },
    viewport: 375,
  });
  assert.deepEqual([log.endedOn?.n, log.endedOn?.itemId], [14, p.want[14].itemId]);
  assert.equal(p.run.state.gold, 20 - 21 + earned);
});

test('a lost run logs each item exactly, the last with no gold and life at 0', () => {
  const p = lostRun();
  assert.deepEqual(itemsOf(p.run.state.log), p.want);
});

test('a lost run logs its times, the loss, the item it ended on, and the rest of its totals', () => {
  const p = lostRun();
  const log = p.run.state.log;
  assert.deepEqual(summaryOf(log), {
    start: iso(T0),
    end: iso(p.clock),
    result: 'loss',
    misses: 4,
    noSupply: 1,
    bought: { flare: 0, requirement: 0, wisdom: 1, strike: 0, lore: 0 },
    used: { flare: 0, requirement: 0, wisdom: 1, strike: 0, lore: 0 },
    goldEarned: p.want[0].gold,
    goldSpent: 6,
    lifeEnd: 0,
    tuning: { ...HANDOFF, wordCount: DEFAULT_TUNING.wordCount },
    viewport: 390,
  });
  assert.deepEqual([log.endedOn?.n, log.endedOn?.itemId], [1, p.want[1].itemId]);
});

test('a submit logs the built text with spaces between words, as the name reads', () => {
  const bad: string[] = [];
  let spaced = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const run = new Run({ seed, now: () => T0 });
    const tried: string[] = [];
    playOn(run, (it) => {
      if (it.n % 5) return;
      const d = decoyOf(run);
      tried.push(d.name);
      place(run, d.words);
      assert.equal(run.submit(), false);
    });
    for (const it of run.state.log.items) {
      const want = it.submits.length > 1 ? [tried.shift(), nameOf(it.itemId)] : [nameOf(it.itemId)];
      const texts = it.submits.map((sb) => sb.text);
      if (!isDeepStrictEqual(texts, want)) bad.push(`seed ${seed}: ${JSON.stringify(texts)}, not ${JSON.stringify(want)}`);
      spaced += texts.filter((t) => t.includes(' ')).length;
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(spaced > 10, `${spaced} names with a space`);
});

test('the log is plain JSON: fresh, won and lost', () => {
  const fresh = new Run({ seed: 3, now: () => T0, viewport: 412 }).state.log;
  for (const log of [fresh, wonRun().run.state.log, lostRun().run.state.log]) assert.deepEqual(JSON.parse(JSON.stringify(log)), log);
  assert.deepEqual([fresh.start, fresh.end, fresh.result, fresh.items.length, fresh.viewport], [iso(T0), null, null, 0, 412]);
});

test("starting life, gold and flask charges are the tuning's", () => {
  const p = start(8, { tuning: tuned({ life: 40, gold: 9, flask: 3 }) });
  const { run } = p;
  const s = run.state;
  assert.deepEqual([s.life, s.gold, s.flask.charges], [40, 9, 3]);
  // 9 gold: a Flare and a Requirement reveal, then not another.
  assert.deepEqual([run.buy('flare'), run.buy('requirement'), run.buy('requirement')], [true, true, false]);
  assert.deepEqual([run.drink(), run.drink(), run.drink(), run.drink()], [true, true, true, false]);
  // 40 life: two misses of 25 end the run on its first item.
  assert.ok(run.leave());
  openItem(p, 0, true);
  missTwice(run);
  assert.equal(s.life, 15);
  missTwice(run);
  assert.deepEqual([s.phase, s.log.result, s.log.lifeEnd, s.log.endedOn?.n], ['end', 'loss', 0, 0]);
  assert.deepEqual([s.log.items[0].lifeBefore, s.log.items[0].lifeAfter, s.log.items[0].drank], [40, 0, true]);
  assert.deepEqual([s.log.tuning.life, s.log.tuning.gold, s.log.tuning.flask], [40, 9, 3]);
});

test("a miss costs the tuning's life for its section", () => {
  const run = new Run({ seed: 3, now: () => T0, tuning: tuned({ missCost: { early: 10, late: 20, boss: 30 } }) });
  const drops: number[] = [];
  const log = playOn(run, (it) => {
    if (![0, 3, 6, 9, 12].includes(it.n)) return;
    const before = run.state.life;
    missTwice(run);
    drops.push(before - run.state.life);
  });
  assert.deepEqual(drops, [10, 10, 20, 20, 30]);
  assert.deepEqual([log.result, log.misses, log.tuning.missCost], ['win', 5, { early: 10, late: 20, boss: 30 }]);
});

test("a right answer pays the tuning's base reward for its section, times the card, halved per miss", () => {
  const reward = { early: 12, late: 40 };
  const run = new Run({ seed: 4, now: () => T0, tuning: tuned({ reward, missCost: { early: 1, late: 1, boss: 1 } }) });
  const missed = [1, 7, 13];
  const log = playOn(run, (it) => {
    if (missed.includes(it.n)) for (let k = 0; k < 2; k++) missTwice(run);
  });
  const bad = log.items.flatMap((it, n) => {
    const section = sectionOf(n);
    const base = section === 'boss' ? 0 : reward[section];
    const want = Math.floor((base * it.multiplier) / (missed.includes(n) ? 4 : 1));
    return it.gold === want ? [] : [`item ${n} (x${it.multiplier}): ${it.gold}, not ${want}`];
  });
  assert.deepEqual(bad, []);
  assert.equal(log.goldEarned, log.items.reduce((t, it) => t + it.gold, 0));
  assert.ok(log.goldEarned >= 6 * 12 + 6 * 40 - 12 - 40);
});

test("each supply costs the tuning's price", () => {
  const run = new Run({ seed: 5, now: () => T0, tuning: tuned({ price: { flare: 1, requirement: 2, wisdom: 3, strike: 4, lore: 5 } }) });
  const paid = (['flare', 'requirement', 'wisdom', 'strike', 'lore'] as const).map((sup) => {
    const before = run.state.gold;
    assert.ok(run.buy(sup), sup);
    return before - run.state.gold;
  });
  assert.deepEqual(paid, [1, 2, 3, 4, 5]);
  assert.deepEqual([run.state.log.goldSpent, run.state.log.bought], [15, { flare: 1, requirement: 1, wisdom: 1, strike: 1, lore: 1 }]);
  // 5 gold left: one more Lore reveal, then not even a Flare.
  assert.deepEqual([run.buy('lore'), run.buy('flare'), run.state.gold], [true, false, 0]);
  const dear = new Run({ seed: 5, now: () => T0, tuning: tuned({ price: { ...DEFAULT_TUNING.price, flare: 21 } }) });
  assert.deepEqual([dear.buy('flare'), dear.buy('requirement'), dear.state.gold], [false, true, 17]);
});

test("each section's board holds the tuning's names, 2 more in Blight but never more than 10", () => {
  const tuning = tuned({ board: { early: 10, late: 4, boss: 8 } });
  const run = new Run({ seed: 1, now: () => T0, tuning });
  assert.deepEqual(run.state.zones, ['blight', 'incursion', 'plain', 'ritual']);
  const shown: number[] = [];
  const log = playOn(run, (it) => shown.push(it.names.length));
  const bad = log.items.flatMap((it, n) => {
    const want = boardFor(tuning, zoneOf(run, n), n, it.itemId);
    return it.names === want && shown[n] === want ? [] : [`item ${n} (${it.zone}): ${it.names} logged, ${shown[n]} shown, not ${want}`];
  });
  assert.deepEqual(bad, []);
  assert.deepEqual(log.tuning.board, { early: 10, late: 4, boss: 8 });
});

test("a zone type's free clue turned off gives its items none, and leaves the other zones and the boss's as they were", () => {
  const bad: string[] = [];
  for (const off of [...ZONE_TYPES.map((z) => [z]), ZONE_TYPES]) {
    const freeClue = Object.fromEntries(ZONE_TYPES.map((z) => [z, !off.includes(z)])) as Tuning['freeClue'];
    const run = new Run({ seed: 2, now: () => T0, tuning: tuned({ freeClue }) });
    const shown: { flavor: boolean; mods: number }[] = [];
    const log = playOn(run, (it) => shown.push({ flavor: it.shown.flavor, mods: it.shown.mods }));
    log.items.forEach((it, n) => {
      const zone = zoneOf(run, n);
      const want =
        zone === 'boss'
          ? { clue: n === 12 ? 'patch' : 'none', patches: n === 12 ? 1 : 0, flavor: false, mods: 0 }
          : freeClue[zone]
            ? { clue: FREE_CLUE[zone], patches: FREE_PATCHES[zone], flavor: zone === 'incursion', mods: zone === 'ritual' ? 1 : 0 }
            : { clue: 'none', patches: 0, flavor: false, mods: 0 };
      const got = { clue: it.freeClue, patches: it.patches, ...shown[n] };
      if (!isDeepStrictEqual(got, want)) bad.push(`${off.join('+')} off, item ${n} (${zone}): ${JSON.stringify(got)}`);
    });
    if (!isDeepStrictEqual(log.tuning.freeClue, freeClue)) bad.push(`${off.join('+')} off: logged ${JSON.stringify(log.tuning.freeClue)}`);
  }
  assert.deepEqual(bad, []);
});

test('the word count flag is recorded in the log, either way', () => {
  for (const wordCount of [true, false]) {
    const run = new Run({ seed: 6, now: () => T0, tuning: tuned({ wordCount }) });
    assert.equal(run.state.log.tuning.wordCount, wordCount);
    assert.equal(playOn(run).tuning.wordCount, wordCount);
  }
});

test("the log keeps its own copy of the tuning: later changes to the tuning given, or to the run's, don't alter it", () => {
  const tuning = tuned({ gold: 33 });
  const kept = structuredClone(tuning);
  const run = new Run({ seed: 7, now: () => T0, tuning });
  tuning.life = 1;
  tuning.gold = 1;
  tuning.flask = 9;
  tuning.missCost.early = 99;
  tuning.reward.early = 99;
  tuning.price.flare = 99;
  tuning.board.early = 10;
  tuning.freeClue.plain = false;
  tuning.wordCount = !kept.wordCount;
  assert.deepEqual(run.state.log.tuning, kept);
  assert.deepEqual(run.state.tuning, kept);
  assert.equal(run.state.gold, 33);
  run.state.tuning.price.wisdom = 1;
  run.state.tuning.board.boss = 4;
  run.state.tuning.wordCount = !kept.wordCount;
  assert.deepEqual(playOn(run).tuning, kept);

  const plain = new Run({ seed: 7, now: () => T0 }).state.log.tuning;
  assert.deepEqual(plain, DEFAULT_TUNING);
  const shared = (['missCost', 'reward', 'price', 'board', 'freeClue'] as const).filter((k) => plain[k] === DEFAULT_TUNING[k]);
  assert.deepEqual(plain === DEFAULT_TUNING ? ['the whole'] : shared, []);
});
