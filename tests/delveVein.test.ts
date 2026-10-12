// The Azurite Vein's dig (delve.ts, the dig): a strike at a time on one lamp,
// the wards in hand until the way out, buried by a cave-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  DELVE_MAX_WARDS,
  FIND_MIN_TIMER,
  LAMP_START,
  VEIN_MAX_STRIKES,
  WAY_OUT,
  clockLeft,
  delveLockout,
  delveTimer,
  digOf,
  digRunsOn,
  findDepth,
  findOn,
  findRules,
  findTimer,
  haulOf,
  inventoryOf,
  lampAfter,
  livesOf,
  questionTimer,
  veinDeeper,
  wardRoom,
  wardsOf,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, Engine, activeRules, createGame, lastPicks, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };
const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0 };

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrong = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A run of `n` players (one: alone, hot-seat; more: co-op online, p0 hosting) at `depth`. */
function run(n = 1, depth = 30, seed = 7) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(seed), now: () => clock.now, fakes });
  const host = n === 1 ? null : 'p0';
  let s: GameState = createGame(host, SETTINGS);
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name: `Delver ${'ABCD'[i]}` }, host === null ? null : `p${i}`);
  s = engine.apply(s, { type: 'start' }, host);
  s = { ...s, players: [...s.players].sort((a, b) => a.id.localeCompare(b.id)), round: depth };
  const h = {
    engine,
    clock,
    get s() {
      return s;
    },
    act(a: Action, from: string | null = null) {
      s = engine.apply(s, a, from);
      return s;
    },
    edit(fn: (s: GameState) => void) {
      const c = structuredClone(s);
      fn(c);
      s = c;
    },
    give(id: string, inv: Partial<Inventory>) {
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { ...NONE, ...inv }));
    },
    id: () => s.players[s.turn].id,
    /** Picks `category` (the trusted host's pick, which settles a co-op vote) and starts its clock. */
    pick(category: string) {
      h.act({ type: 'pick', category });
      if (s.phase === 'question') h.act({ type: 'clock', askedAt: s.question!.askedAt });
      return s;
    },
    /** A vein on the first card, picked: strike 1 on the clock. */
    vein() {
      h.edit((c) => (c.delve!.finds = [{ category: c.offered[0], kind: 'azurite' }]));
      return h.pick(s.offered[0]).question!;
    },
    /** Answers the question in play (alone the player's; together as `by`), `after` ms into its clock. */
    answer(ok: boolean, after = 1000, by: string | null = null) {
      const q = s.question!;
      h.clock.now = q.clockAt! + after;
      return h.act({ type: 'answer', index: ok ? right(q) : wrong(q), askedAt: q.askedAt }, by);
    },
    timeOut() {
      h.clock.now = s.question!.deadline! + ANSWER_GRACE_MS + 1;
      return h.act({ type: 'answer', index: null });
    },
    next: () => h.act({ type: 'next' }),
    /** The vein on the cards of a dig (the card that isn't the way out). */
    veinCard: () => s.offered.find((c) => c !== WAY_OUT)!,
  };
  return h;
}

test('a right strike puts a ward in hand, and the vein runs on: two cards at the same depth, the vein and the way out', () => {
  const h = run();
  const id = h.id();
  const q = h.vein();
  assert.equal(q.strike, undefined, 'strike 1');
  assert.equal(questionTimer(h.s), findTimer('azurite', 30));
  h.answer(true, 2000);
  const r = h.s.reveal!;
  assert.deepEqual([r.correct, r.gained, r.dug, r.strike], [true, 'wards', true, 1]);
  assert.deepEqual(inventoryOf(h.s, id), NONE, 'not in the pack yet');
  assert.equal(haulOf(h.s, id), 1);
  const dig = digOf(h.s)!;
  assert.deepEqual([dig.strikes, dig.haul, dig.struck], [1, [id], [q.category]]);
  // The lamp: what was left of strike 1's light, never fed.
  assert.equal(dig.light, lampAfter(30, 2, findTimer('azurite', 30) - 2));
  const recent = [...h.s.players[0].recent];
  h.next();
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.round, 30, 'the dig stays at the vein\'s depth');
  assert.equal(h.s.offered.length, 2);
  assert.equal(h.s.offered[1], WAY_OUT);
  const card = h.veinCard();
  assert.equal(findOn(h.s, card), 'azurite');
  assert.equal(findOn(h.s, WAY_OUT), null);
  assert.notEqual(card, q.category, 'never the category just struck');
  assert.ok(!lastPicks(recent, delveLockout(30)).includes(card), 'never a locked one');
});

test('the way out puts the haul into the pack and takes the run a depth deeper; nothing is locked by it', () => {
  const h = run();
  const id = h.id();
  h.vein();
  h.answer(true);
  h.next();
  const recent = [...h.s.players[0].recent];
  h.pick(WAY_OUT);
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: 1 });
  assert.equal(h.s.round, 31);
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.offered.length, 3);
  assert.ok(!h.s.offered.includes(WAY_OUT));
  assert.equal(digOf(h.s), null);
  assert.equal(h.s.delve!.banked!.wards, 1);
  assert.deepEqual(h.s.players[0].recent, recent);
  // Gone with the next pick.
  h.pick(h.s.offered[0]);
  assert.equal(h.s.delve!.banked, undefined);
});

test('a later strike asks from further down, on the lamp\'s light, in a category it locks nothing with', () => {
  const h = run();
  h.vein();
  h.answer(true, 3000);
  const light = digOf(h.s)!.light;
  h.next();
  const recent = [...h.s.players[0].recent];
  const card = h.veinCard();
  h.pick(card);
  const q = h.s.question!;
  assert.deepEqual([q.category, q.find, q.strike, q.light], [card, 'azurite', 2, light]);
  assert.equal(questionTimer(h.s), light);
  assert.equal(q.deadline! - q.clockAt!, light * 1000);
  assert.deepEqual(activeRules(h.s), findRules('azurite', 30, 2));
  assert.equal(findDepth('azurite', 30, 2), 30 + veinDeeper(2));
  assert.deepEqual(h.s.players[0].recent, recent, 'a later strike locks nothing');
  h.answer(true, 1000);
  assert.deepEqual([h.s.reveal!.strike, digOf(h.s)!.strikes, digOf(h.s)!.haul.length], [2, 2, 2]);
  assert.equal(digOf(h.s)!.light, lampAfter(30, 3, light - 1));
});

test('a cave-in on a later strike costs two losses and buries the haul; the run asks again at the same depth', () => {
  const h = run();
  const id = h.id();
  h.vein();
  h.answer(true);
  h.next();
  h.pick(h.veinCard());
  h.answer(false);
  const r = h.s.reveal!;
  assert.deepEqual([r.caveIn, r.buried, r.strike, r.dug], [true, 1, 2, undefined]);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 2);
  assert.equal(digOf(h.s), null);
  h.next();
  assert.equal(h.s.round, 30);
  assert.equal(h.s.offered.length, 3);
  assert.deepEqual(inventoryOf(h.s, id), NONE, 'the haul is gone');
});

test('a ward already in the pack takes a cave-in\'s loss as ever; the haul in hand never does', () => {
  const h = run();
  const id = h.id();
  h.give(id, { wards: 1 });
  h.vein();
  h.answer(true);
  h.next();
  h.pick(h.veinCard());
  h.answer(false);
  assert.deepEqual(h.s.reveal!.lost, { lives: 1, wards: 1 });
  assert.equal(h.s.reveal!.buried, 1);
  assert.deepEqual([livesOf(h.s, id), wardsOf(h.s, id)], [DELVE_LIVES - 1, 0]);
});

test('running out of light on a strike is a cave-in too', () => {
  const h = run();
  const id = h.id();
  h.vein();
  h.answer(true);
  h.next();
  h.pick(h.veinCard());
  h.timeOut();
  assert.deepEqual([h.s.reveal!.timedOut, h.s.reveal!.caveIn, h.s.reveal!.buried], [true, true, 1]);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 2);
});

test('three strikes at most: the third right one puts the whole haul into the pack by itself', () => {
  const h = run();
  const id = h.id();
  h.vein();
  for (let k = 1; k <= VEIN_MAX_STRIKES; k++) {
    h.answer(true, 500);
    assert.equal(h.s.reveal!.strike, k);
    h.next();
    if (k < VEIN_MAX_STRIKES) h.pick(h.veinCard());
  }
  assert.equal(h.s.round, 31);
  assert.equal(h.s.offered.length, 3);
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: 3 });
  assert.equal(h.s.delve!.banked!.wards, 3);
});

test('the dig goes no further than the pack has room: holding two wards, one strike', () => {
  const h = run();
  const id = h.id();
  h.give(id, { wards: DELVE_MAX_WARDS - 2 });
  h.vein();
  h.answer(true);
  assert.equal(wardRoom(h.s, id), true);
  assert.equal(digRunsOn(h.s), true);
  h.next();
  h.pick(h.veinCard());
  h.answer(true);
  assert.equal(wardRoom(h.s, id), false);
  assert.equal(digRunsOn(h.s), false);
  h.next();
  assert.equal(h.s.round, 31);
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: DELVE_MAX_WARDS });
});

test('the lamp: a quick answer carries its light on, a slow one deep down leaves too little to dig', () => {
  assert.deepEqual([LAMP_START, FIND_MIN_TIMER], [1, 4]);
  // Never more than the strike's whole deeper clock.
  assert.equal(lampAfter(30, 2, 100), delveTimer(findDepth('azurite', 30, 2)));
  assert.equal(lampAfter(30, 2, 0), 0);
  assert.equal(lampAfter(30, 2, 3.47), 3.4);
  // Deep down the feed alone is under FIND_MIN_TIMER: a slow strike 1 ends the dig.
  const h = run(1, 90);
  const id = h.id();
  h.vein();
  h.answer(true, findTimer('azurite', 90) * 1000 - 100);
  assert.ok(digOf(h.s)!.light < FIND_MIN_TIMER);
  h.next();
  assert.equal(h.s.round, 91);
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: 1 });
  // A quick one leaves enough.
  const q = run(1, 90);
  q.vein();
  q.answer(true, 500);
  assert.ok(digOf(q.s)!.light >= FIND_MIN_TIMER);
  q.next();
  assert.equal(q.s.offered.length, 2);
});

test('a later strike is never the category of an earlier one, and the dig is public', () => {
  const h = run(1, 30, 3);
  h.vein();
  const seen = [h.s.question!.category];
  for (let k = 2; k <= VEIN_MAX_STRIKES; k++) {
    h.answer(true, 500);
    h.next();
    const card = h.veinCard();
    assert.ok(!seen.includes(card), `strike ${k}`);
    seen.push(card);
    h.pick(card);
  }
  assert.deepEqual(publicView(h.s).delve!.dig, h.s.delve!.dig);
});

test('a reask keeps a strike its strike and its light', () => {
  const h = run();
  h.vein();
  h.answer(true);
  h.next();
  h.act({ type: 'pick', category: h.veinCard() });
  const first = h.s.question!;
  h.act({ type: 'reask' });
  assert.deepEqual([h.s.question!.strike, h.s.question!.light], [first.strike, first.light]);
  assert.notEqual(h.s.question!.askedAt, first.askedAt);
});

// ---- together ---------------------------------------------------------------

test('together: the team votes between the vein and the way out; the way out banks each ward to whoever dug it', () => {
  const h = run(2);
  h.vein();
  h.answer(true, 1000, 'p1');
  assert.deepEqual([h.s.reveal!.gainedBy, h.s.reveal!.dug], ['p1', true]);
  assert.equal(haulOf(h.s, 'p1'), 1);
  h.next();
  assert.deepEqual(h.s.offered.length, 2);
  h.act({ type: 'vote', category: WAY_OUT }, 'p0');
  h.act({ type: 'vote', category: WAY_OUT }, 'p1');
  assert.equal(h.s.round, 31);
  assert.deepEqual([wardsOf(h.s, 'p0'), wardsOf(h.s, 'p1')], [0, 1]);
});

test('together: a strike anyone gets right goes on; with nobody right it caves in, the haul buried and each wrong pick two losses', () => {
  const h = run(2);
  h.vein();
  h.answer(true, 1000, 'p0');
  h.next();
  h.act({ type: 'vote', category: h.veinCard() }, 'p0');
  h.act({ type: 'vote', category: h.veinCard() }, 'p1');
  assert.equal(h.s.question!.strike, 2);
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  const q = h.s.question!;
  const [w1, w2] = q.options.flatMap((o, i) => (o === q.itemId ? [] : [i]));
  h.clock.now = q.clockAt! + 500;
  h.act({ type: 'answer', index: w1, askedAt: q.askedAt }, 'p0');
  h.act({ type: 'answer', index: w2, askedAt: q.askedAt }, 'p1');
  const r = h.s.reveal!;
  assert.deepEqual([r.correct, r.caveIn, r.buried], [false, true, 1]);
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1')], [DELVE_LIVES - 2, DELVE_LIVES - 2]);
  assert.equal(digOf(h.s), null);
  assert.deepEqual([wardsOf(h.s, 'p0'), haulOf(h.s, 'p0')], [0, 0]);
});

test('together: the team\'s streak counts a vein once, however many strikes it takes', () => {
  const h = run(2);
  h.vein();
  h.answer(true, 500, 'p0');
  assert.equal(h.s.reveal!.teamStreak, 1);
  h.next();
  h.act({ type: 'pick', category: h.veinCard() });
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true, 500, 'p1');
  assert.equal(h.s.reveal!.teamStreak, 1);
});

test('the lamp left on a strike is measured from its clock, held still or not', () => {
  const h = run();
  const q = h.vein();
  h.clock.now = q.clockAt! + 1500;
  assert.equal(clockLeft(h.s.question!, h.clock.now), findTimer('azurite', 30) * 1000 - 1500);
});

test('the codex counts a vein once however deep it was dug, and what a cave-in buried as never carried out', async () => {
  const { findStats } = await import('../src/lib/codexStats.ts');
  const base = { mode: 'name' as const, difficulty: 'eternal' as const, race: false, depth: 30, run: 1, find: 'azurite' as const };
  const log = [
    // Dug twice and got out with two wards.
    { ...base, t: 1, id: 'a', ok: true, gained: 'wards' as const },
    { ...base, t: 2, id: 'b', ok: true, gained: 'wards' as const, strike: 2 },
    // Dug once, then caved in on strike 2: the ward in hand buried.
    { ...base, t: 3, id: 'c', ok: true, gained: 'wards' as const },
    { ...base, t: 4, id: 'd', ok: false, strike: 2, buried: 1, lives: 2, wards: 0 },
  ];
  const f = findStats(log).finds.azurite;
  assert.deepEqual([f.taken, f.ok, f.gained.wards, f.lives], [2, 2, 2, 2]);
});

test('the vein\'s scene: on from strike 1 through its cards and strikes, off with the way out; it eases in and out', async () => {
  const { inVein, setVein, veinLevel, VEIN_IN_S } = await import('../src/lib/vein.ts');
  const h = run();
  assert.equal(inVein(h.s), false, 'ordinary cards');
  h.vein();
  assert.equal(inVein(h.s), true, 'strike 1');
  h.answer(true);
  assert.equal(inVein(h.s), true, 'its reveal');
  h.next();
  assert.equal(inVein(h.s), true, 'the two cards');
  h.pick(WAY_OUT);
  assert.equal(inVein(h.s), false, 'out of it');
  // Eased in over VEIN_IN_S, smooth at both ends; at once when held still.
  veinLevel(0);
  setVein(true);
  const half = veinLevel((VEIN_IN_S * 1000) / 2);
  assert.ok(half > 0 && half < 1, String(half));
  setVein(false);
  assert.equal(veinLevel(VEIN_IN_S * 1000, true), 0);
});
