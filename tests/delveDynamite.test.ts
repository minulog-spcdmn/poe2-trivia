// Delve's dynamite: a stick blasts the question in play away for a new one at
// the same depth, from a card on the depth's offer not asked yet, at most
// twice a depth (as many as the offer's other cards). By hand while the
// question is open (alone the player's own; together anyone standing who
// hasn't answered, from a random holder's pack), or by itself as the clock
// hits 0 with no flare to burn: its fuse is lit then, and it goes off as the
// fuse burns down (DELVE_FUSE_MS), unless Skip sets it off sooner. Never on a
// find's question, and a blast's question is never a find. See delve.ts
// (DELVE_MAX_BLASTS, DELVE_FUSE_MS, blastsLeft, blastProblem, fuseDue) and
// game.ts ('blast', 'fuse', Engine.blast).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_FUSE_MS,
  DELVE_LIVES,
  DELVE_MAX_BLASTS,
  FLARE_MS,
  askedCards,
  blastProblem,
  blastsLeft,
  delveRules,
  delveTimer,
  dynamiteOf,
  findOn,
  flaresOf,
  fuseDue,
  fuseLeft,
  livesOf,
  questionTimer,
  teamItemReady,
  unaskedCards,
  waitingIds,
  type FindKind,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, ActionError, Engine, OFFER_COUNT, createGame, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { COOP_DRAW_MS, blastedAway, drawHoldUntil, inventoryChanges } from '../src/lib/delveSession.ts';
import { momentOf } from '../src/lib/inventoryArt.ts';
import { blastedEncounter, emptyCodex, record } from '../src/lib/codex.ts';
import { addRun, emptyRecords, leftEvent, parseRecords, serializeRecords } from '../src/lib/delveRecord.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };
const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongs = (q: Question) => q.options.flatMap((id, i) => (id === q.itemId ? [] : [i]));

function seeded(seed: number) {
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A Delve run on a controllable clock; `host` null for hot-seat. Helpers act as the trusted host unless told otherwise. */
function delve(n: number, opts: { host?: string | null; seed?: number; depth?: number } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 11), now: () => clock.now, fakes });
  const host = opts.host === undefined ? 'p0' : opts.host;
  let s: GameState = createGame(host, SETTINGS);
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name: `P${i}` }, host === null ? null : `p${i}`);
  s = engine.apply(s, { type: 'start' }, host);
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
    /** Picks a card (the find planted on it, if `find`; co-op: the host's own pick settles the vote) and starts the clock. */
    ask(find?: FindKind, card?: string) {
      if (find) h.edit((c) => (c.delve!.finds = [{ category: c.offered[0], kind: find }]));
      h.act({ type: 'pick', category: card ?? (find ? s.offered[0] : s.offered.find((c) => !findOn(s, c))!) });
      return h.clockOn();
    },
    /** The clock of the question in play starts (its art is out). */
    clockOn() {
      h.act({ type: 'clock', askedAt: s.question!.askedAt });
      return s.question!;
    },
    /** A blast set off by `by` (null: the host's own tooling, alone the player). */
    blast(by: string | null = null) {
      return h.act({ type: 'blast', askedAt: s.question!.askedAt }, by);
    },
    /** The host's time-out, as its timer fires at 0 and the allowance for answers in flight. */
    timeOut() {
      h.clock.now = s.question!.deadline! + ANSWER_GRACE_MS;
      return h.act({ type: 'answer', index: null });
    },
    /** The host lights the fuse as the clock hits 0 (its 'fuse' timer). */
    light() {
      h.clock.now = s.question!.deadline!;
      return h.act({ type: 'fuse', askedAt: s.question!.askedAt });
    },
    /** The host's time-out, set for when the lit fuse has burnt down. */
    fuseOut() {
      h.clock.now = s.question!.fuse!.ends;
      return h.act({ type: 'answer', index: null });
    },
    /** On to the next depth, after a reveal. */
    next() {
      h.act({ type: 'next' });
    },
  };
  if (opts.depth) h.edit((c) => (c.round = opts.depth!));
  return h;
}

/** Alone (hot-seat), at `depth`, holding `inv`, a question on the clock. */
function solo(inv: Partial<Inventory>, opts: { depth?: number; seed?: number; find?: FindKind; host?: string | null } = {}) {
  const h = delve(1, { host: opts.host === undefined ? null : opts.host, seed: opts.seed, depth: opts.depth ?? 30 });
  h.give('p0', inv);
  h.ask(opts.find);
  return h;
}

function loudly(fn: () => void, msg: RegExp) {
  assert.throws(fn, (e: unknown) => e instanceof ActionError && msg.test(e.message));
}
function silently(fn: () => void, msg: RegExp) {
  assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent && msg.test(e.message));
}

// ---- the rules -----------------------------------------------------------------

test("two blasts a depth at most, in step with the offer's other cards", () => {
  assert.equal(DELVE_MAX_BLASTS, OFFER_COUNT - 1);
  assert.equal(DELVE_MAX_BLASTS, 2);
});

// ---- by hand, alone ------------------------------------------------------------

test('alone, a blast asks a new question at the same depth from a card not asked yet, on the full clock and the depth\'s rules', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const h = solo({ dynamite: 2 }, { seed, depth: 40 });
    const before = h.s;
    const q = before.question!;
    // Half the clock gone already: the new one starts over.
    h.clock.now = q.clockAt! + 4000;
    assert.equal(blastsLeft(h.s), 2);
    assert.equal(blastProblem(h.s, null), null);
    h.blast();
    const b = h.s.question!;
    assert.equal(h.s.phase, 'question');
    assert.notEqual(b.askedAt, q.askedAt);
    // The same depth and turn: no depth reached, no cards dealt.
    assert.deepEqual([h.s.round, h.s.turnCount, h.s.offered], [before.round, before.turnCount, before.offered]);
    assert.ok(unaskedCards(before).includes(b.category), 'a card on the offer not asked yet');
    assert.notEqual(b.category, q.category);
    assert.deepEqual(askedCards(h.s), [q.category, b.category]);
    assert.equal(h.s.delve!.blasts, 1);
    // A fresh question: no clock until its art is out, then the depth's whole clock.
    assert.equal(b.deadline, null);
    assert.equal(b.find, undefined);
    assert.equal(b.options.length, delveRules(40).options);
    // On one device, the player set it off.
    assert.deepEqual(b.blast, { by: 'p0', stick: 'p0', side: before.offered.indexOf(b.category) < before.offered.indexOf(q.category) ? -1 : 1, was: { at: q.askedAt, itemId: q.itemId, mode: q.mode } });
    h.clock.now += 300;
    const c = h.clockOn();
    assert.equal(c.deadline! - c.clockAt!, delveTimer(40) * 1000);
    assert.equal(questionTimer(h.s), delveTimer(40));
    // The stick is spent, nothing else: no life, no streak broken.
    assert.deepEqual([dynamiteOf(h.s, 'p0'), livesOf(h.s, 'p0')], [1, DELVE_LIVES]);
    // Its card is locked out like a pick; the blasted question's answer stays asked.
    assert.deepEqual(h.s.players[0].recent.slice(-2), [q.category, b.category]);
    assert.ok(h.s.used.includes(q.itemId) && h.s.used.includes(b.itemId));
    // It is answered as any other, and the run goes one depth deeper.
    h.act({ type: 'answer', index: right(b), askedAt: b.askedAt });
    assert.equal(h.s.reveal!.correct, true);
    h.next();
    assert.equal(h.s.round, 41);
  }
});

test('the side the stage swings to is where the new card lay on the offer, from the blasted one', () => {
  const sides = new Set<number>();
  for (let seed = 1; seed <= 30; seed++) {
    const h = delve(1, { host: null, seed, depth: 20 });
    h.give('p0', { dynamite: 1 });
    const offer = [...h.s.offered];
    // The middle card: a blast swings either way.
    h.ask(undefined, offer[1]);
    h.blast();
    const b = h.s.question!.blast!;
    assert.equal(b.side, offer.indexOf(h.s.question!.category) === 0 ? -1 : 1);
    sides.add(b.side);
  }
  assert.deepEqual([...sides].sort(), [-1, 1]);
});

test('at most two blasts a depth, never more than the cards left; the next depth has its two again', () => {
  const h = solo({ dynamite: 3 }, { depth: 25 });
  const first = h.s.question!.category;
  h.blast();
  h.clockOn();
  assert.equal(blastsLeft(h.s), 1);
  h.blast();
  h.clockOn();
  assert.equal(blastsLeft(h.s), 0);
  assert.equal(new Set(askedCards(h.s)).size, 3, 'every card on the offer, each once');
  assert.equal(askedCards(h.s)[0], first);
  assert.equal(h.s.delve!.blasts, 2);
  assert.match(blastProblem(h.s, null)!, /No more blasts/);
  silently(() => h.blast(), /No more blasts/);
  assert.equal(dynamiteOf(h.s, 'p0'), 1, 'the third stick is kept');
  // Nothing goes off by itself at 0 either: the time-out costs the life.
  h.timeOut();
  assert.equal(h.s.phase, 'reveal');
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES - 1);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
  h.next();
  h.ask();
  assert.equal(blastsLeft(h.s), 2);
  assert.equal(h.s.delve!.asked!.length, 1);
  // An offer of two cards (a hand-made state) leaves one blast.
  const two = solo({ dynamite: 2 });
  two.edit((c) => (c.offered = [c.question!.category, c.offered.find((x) => x !== c.question!.category)!]));
  assert.equal(blastsLeft(two.s), 1);
});

test("a blast's question is never a find, even from a find's card: dynamite is no way to fish for finds", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const h = delve(1, { host: null, seed, depth: 40 });
    h.give('p0', { dynamite: 2 });
    const [picked, ...rest] = h.s.offered;
    h.edit((c) => (c.delve!.finds = rest.map((category, i) => ({ category, kind: (['flare', 'dynamite'] as const)[i] }))));
    h.ask(undefined, picked);
    assert.equal(h.s.question!.find, undefined);
    h.blast();
    h.clockOn();
    h.blast();
    const b = h.s.question!;
    assert.equal(b.find, undefined, `seed ${seed}`);
    assert.equal(b.options.length, delveRules(40).options, "the depth's rules, not a deeper one's");
    h.clockOn();
    assert.equal(b.deadline, null);
    assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, delveTimer(40) * 1000, "the depth's clock");
  }
});

test("neither flares nor dynamite work on a find's question: no blast by hand, none at 0, and both are kept", () => {
  for (const find of ['azurite', 'flare', 'dynamite'] as const) {
    const h = solo({ dynamite: 2, flares: 1 }, { find, depth: 20 });
    assert.equal(h.s.question!.find, find);
    assert.match(blastProblem(h.s, null)!, /find/);
    silently(() => h.blast(), /find/);
    h.timeOut();
    assert.equal(h.s.phase, 'reveal', find);
    assert.equal(h.s.reveal!.timedOut, true);
    assert.deepEqual([dynamiteOf(h.s, 'p0'), h.s.question!.flared], [2, undefined]);
  }
});

test('never before the clock starts, after the answer or the time-out, without dynamite, or for anyone but the player', () => {
  // Before the clock: the question can't be seen yet.
  const h = delve(1, { host: null, depth: 20 });
  h.give('p0', { dynamite: 1 });
  h.act({ type: 'pick', category: h.s.offered[0] });
  assert.equal(blastProblem(h.s, null), 'Not yet.');
  silently(() => h.blast(), /Not yet/);
  // After the answer: the question is gone.
  const a = solo({ dynamite: 1 });
  const q = a.s.question!;
  a.act({ type: 'answer', index: right(q), askedAt: q.askedAt });
  silently(() => a.act({ type: 'blast', askedAt: q.askedAt }), /late/);
  assert.equal(dynamiteOf(a.s, 'p0'), 1);
  // Past 0 and the allowance for answers in flight: the time-out deals with it.
  const late = solo({ dynamite: 1 });
  late.clock.now = late.s.question!.deadline! + ANSWER_GRACE_MS + 1;
  silently(() => late.blast(), /late/);
  // Without dynamite.
  const none = solo({});
  assert.match(blastProblem(none.s, null)!, /no dynamite/);
  silently(() => none.blast(), /no dynamite/);
  // Online alone, only the player sets it off, not someone watching.
  const online = solo({ dynamite: 1 }, { host: 'p0' });
  online.act({ type: 'join', playerId: 'w', name: 'Watcher' }, 'w');
  silently(() => online.blast('w'), /not your turn/);
  online.blast('p0');
  assert.equal(online.s.question!.blast?.by, 'p0');
});

test('an answer to the question blasted away is dropped quietly: too late, and it costs nothing', () => {
  const h = solo({ dynamite: 1 }, { host: 'p0' });
  const q = h.s.question!;
  h.blast('p0');
  h.clockOn();
  silently(() => h.act({ type: 'answer', index: wrongs(q)[0], askedAt: q.askedAt }, 'p0'), /late/);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES);
  assert.equal(h.s.phase, 'question');
});

// ---- by itself, at 0 -------------------------------------------------------------

test('at 0 a flare burns first; only with none to burn does the dynamite go off by itself, and the time-out costs nothing', () => {
  const h = solo({ dynamite: 1, flares: 1 });
  const q = h.s.question!;
  h.timeOut();
  // The flare: the same question, 5 s more (from now, as its own timer came late here).
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.deadline, q.deadline! + ANSWER_GRACE_MS + FLARE_MS);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
  // Then, in place of the time-out, the dynamite's fuse is lit (its own
  // timer came late here: from now, so it burns its whole length)…
  h.timeOut();
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.deepEqual(h.s.question!.fuse, { lit: h.clock.now, ends: h.clock.now + DELVE_FUSE_MS });
  assert.equal(dynamiteOf(h.s, 'p0'), 1, 'nothing spent while it burns');
  // …and as it burns down, it goes off: a new question, nobody hit.
  h.fuseOut();
  const b = h.s.question!;
  assert.equal(h.s.phase, 'question');
  assert.notEqual(b.askedAt, q.askedAt);
  assert.deepEqual(b.blast!.by, undefined, 'it went off by itself');
  assert.equal(b.blast!.stick, 'p0');
  assert.deepEqual([dynamiteOf(h.s, 'p0'), flaresOf(h.s, 'p0'), livesOf(h.s, 'p0')], [0, 0, DELVE_LIVES]);
  assert.equal(h.s.reveal, null);
  assert.equal(b.fuse, undefined);
  // The new question on the full clock; with nothing left, its time-out costs the life.
  const c = h.clockOn();
  assert.equal(fuseDue(h.s), false);
  assert.equal(c.deadline! - c.clockAt!, delveTimer(h.s.round) * 1000);
  h.timeOut();
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES - 1);
});

test("a player's answer later than 0 and its allowance finds the fuse lit in place of the time-out, and counts for nothing", () => {
  const h = solo({ dynamite: 1 }, { host: 'p0' });
  const q = h.s.question!;
  h.clock.now = q.deadline! + ANSWER_GRACE_MS + 50;
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0');
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(h.s.question!.fuse!.lit, h.clock.now);
  assert.equal(h.s.players[0].score, 0);
  h.fuseOut();
  assert.equal(h.s.question!.blast?.was.at, q.askedAt);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES);
  // Within the allowance it still counts, and the stick is kept.
  const in_ = solo({ dynamite: 1 }, { host: 'p0' });
  const q2 = in_.s.question!;
  in_.clock.now = q2.deadline! + ANSWER_GRACE_MS - 10;
  in_.act({ type: 'answer', index: right(q2), askedAt: q2.askedAt }, 'p0');
  assert.equal(in_.s.reveal!.correct, true);
  assert.equal(dynamiteOf(in_.s, 'p0'), 1);
});

// ---- the fuse -------------------------------------------------------------------

test('at 0 the fuse is lit only when the dynamite would go off: a flare first, never on a find, never past two blasts, never without a stick', () => {
  // With dynamite and nothing before it: lit at 0, on the host's clock, for DELVE_FUSE_MS.
  const h = solo({ dynamite: 1 });
  assert.equal(fuseDue(h.s), true);
  // Not much before 0 (a timer a moment early still counts).
  h.clock.now = h.s.question!.deadline! - 1000;
  h.act({ type: 'fuse', askedAt: h.s.question!.askedAt });
  assert.equal(h.s.question!.fuse, undefined);
  h.light();
  const q = h.s.question!;
  assert.deepEqual(q.fuse, { lit: q.deadline, ends: q.deadline! + DELVE_FUSE_MS });
  assert.equal(fuseLeft(q, q.deadline!), 1);
  assert.equal(fuseLeft(q, q.deadline! + DELVE_FUSE_MS / 2), 0.5);
  assert.equal(fuseLeft(q, q.deadline! + DELVE_FUSE_MS + 9), 0);
  // Lit once: a second 'fuse' changes nothing.
  h.act({ type: 'fuse', askedAt: q.askedAt });
  assert.deepEqual(h.s.question!.fuse, q.fuse);
  // Only the host lights it.
  loudly(() => h.act({ type: 'fuse', askedAt: q.askedAt }, 'p0'), /Not allowed/);
  // A flare to burn: it burns first, and no fuse is lit.
  const f = solo({ dynamite: 1, flares: 1 });
  assert.equal(fuseDue(f.s), false);
  f.light();
  assert.equal(f.s.question!.fuse, undefined);
  // Without a stick, or on a find: nothing to light.
  const none = solo({ flares: 0 });
  none.light();
  assert.equal(none.s.question!.fuse, undefined);
  none.timeOut();
  assert.equal(none.s.reveal!.timedOut, true);
  for (const find of ['azurite', 'flare', 'dynamite'] as const) {
    const g = solo({ dynamite: 1 }, { find, depth: 20 });
    assert.equal(fuseDue(g.s), false, find);
    g.light();
    assert.equal(g.s.question!.fuse, undefined, find);
    g.timeOut();
    assert.equal(g.s.reveal!.timedOut, true, find);
    // (A Dynamite Cache missed blows something of the pack up: maybe that stick.)
    if (find !== 'dynamite') assert.equal(dynamiteOf(g.s, 'p0'), 1, find);
  }
  // Two blasts made at this depth: no third, by hand or by its fuse.
  const two = solo({ dynamite: 2 });
  two.blast();
  two.clockOn();
  two.blast();
  two.clockOn();
  assert.equal(blastsLeft(two.s), 0);
  assert.equal(fuseDue(two.s), false);
  two.light();
  assert.equal(two.s.question!.fuse, undefined);
  two.timeOut();
  assert.equal(two.s.reveal!.timedOut, true);
  assert.equal(dynamiteOf(two.s, 'p0'), 0);
});

test('the fuse burns down and the dynamite goes off: the time-out waits for it, and nothing is spent before', () => {
  const h = solo({ dynamite: 2 }, { host: 'p0' });
  const q = h.s.question!;
  h.light();
  // The time-out at 0 and the allowance finds it burning: nothing yet.
  h.timeOut();
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(h.s.phase, 'question');
  assert.equal(dynamiteOf(h.s, 'p0'), 2);
  // A moment before its end, still nothing.
  h.clock.now = q.deadline! + DELVE_FUSE_MS - 1;
  h.act({ type: 'answer', index: null });
  assert.equal(h.s.question!.askedAt, q.askedAt);
  // At its end it goes off, by itself: one stick, one blast.
  h.fuseOut();
  const b = h.s.question!;
  assert.equal(b.blast!.was.at, q.askedAt);
  assert.equal(b.blast!.by, undefined);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
  assert.equal(h.s.delve!.blasts, 1);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES);
  // Once gone off, a time-out for the old question finds nothing to do.
  silently(() => h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0'), /late/);
});

test('Skip pressed while the fuse burns blasts at once; the fuse is gone with the question', () => {
  // Alone, online and on one device.
  for (const host of ['p0', null] as const) {
    const h = solo({ dynamite: 1 }, { host });
    h.light();
    const q = h.s.question!;
    h.clock.now = q.fuse!.lit + 700;
    assert.equal(blastProblem(h.s, host), null);
    h.blast(host);
    const b = h.s.question!;
    assert.equal(b.blast!.was.at, q.askedAt);
    assert.equal(b.blast!.by, 'p0');
    assert.equal(b.fuse, undefined);
    assert.equal(dynamiteOf(h.s, 'p0'), 0);
    // The new question's clock has not started: no time-out, no second blast.
    assert.equal(h.s.question!.deadline, null);
    assert.equal(fuseDue(h.s), false);
  }
  // Together, anyone standing who hasn't answered.
  const t = delve(3, { depth: 20 });
  t.give('p2', { dynamite: 1 });
  t.ask();
  t.light();
  t.clock.now = t.s.question!.fuse!.lit + 1200;
  t.blast('p1');
  assert.equal(t.s.question!.blast!.by, 'p1');
  assert.equal(dynamiteOf(t.s, 'p2'), 0);
});

test('no answer counts while the fuse burns, but one given before 0 (a guest\'s within the allowance for answers in flight)', () => {
  // Alone online: a guest's right answer that crossed 0 on its way still counts, and keeps the stick.
  const a = solo({ dynamite: 1 }, { host: 'p0' });
  const qa = a.s.question!;
  a.light();
  a.clock.now = qa.deadline! + ANSWER_GRACE_MS - 10;
  a.act({ type: 'answer', index: right(qa), askedAt: qa.askedAt }, 'p0');
  assert.equal(a.s.reveal!.correct, true);
  assert.equal(dynamiteOf(a.s, 'p0'), 1);
  // Later than that it is dropped, right or wrong, and the fuse burns on.
  const b = solo({ dynamite: 1 }, { host: 'p0' });
  const qb = b.s.question!;
  b.light();
  b.clock.now = qb.deadline! + ANSWER_GRACE_MS + 10;
  silently(() => b.act({ type: 'answer', index: right(qb), askedAt: qb.askedAt }, 'p0'), /late/);
  silently(() => b.act({ type: 'answer', index: wrongs(qb)[0], askedAt: qb.askedAt }, 'p0'), /late/);
  assert.deepEqual([b.s.phase, b.s.players[0].score, livesOf(b.s, 'p0')], ['question', 0, DELVE_LIVES]);
  b.fuseOut();
  assert.equal(b.s.question!.blast!.was.at, qb.askedAt);
  // On one device an answer is never in flight: past 0 it is dropped.
  const c = solo({ dynamite: 1 });
  const qc = c.s.question!;
  c.light();
  c.clock.now = qc.deadline! + 100;
  silently(() => c.act({ type: 'answer', index: wrongs(qc)[0], askedAt: qc.askedAt }), /late/);
  assert.equal(livesOf(c.s, 'p0'), DELVE_LIVES);
  // Together: past the allowance nobody's answer counts; nobody is hit as it goes off.
  const t = delve(3, { depth: 20 });
  t.give('p0', { dynamite: 1 });
  const qt = t.ask();
  t.light();
  t.clock.now = qt.deadline! + ANSWER_GRACE_MS + 10;
  silently(() => t.act({ type: 'answer', index: right(qt), askedAt: qt.askedAt }, 'p1'), /late/);
  silently(() => t.act({ type: 'answer', index: wrongs(qt)[0], askedAt: qt.askedAt }, 'p2'), /late/);
  t.fuseOut();
  assert.equal(t.s.question!.blast!.was.at, qt.askedAt);
  assert.deepEqual(['p0', 'p1', 'p2'].map((id) => livesOf(t.s, id)), [DELVE_LIVES, DELVE_LIVES, DELVE_LIVES]);
  assert.equal(t.s.players.find((p) => p.id === 'p1')!.score, 0);
});

test('guests see the fuse: it is public, on the host\'s clock', () => {
  const h = delve(2, { depth: 20 });
  h.give('p1', { dynamite: 1 });
  h.ask();
  h.light();
  const seen = publicView(h.s).question!;
  assert.deepEqual(seen.fuse, h.s.question!.fuse);
});

test('a host reload while the fuse burns neither loses the stick nor spends it twice', () => {
  // On one device, the run picks up where it was: the fuse still burns, and goes off once.
  const h = solo({ dynamite: 2 });
  h.light();
  const q = h.s.question!;
  const saved: GameState = JSON.parse(JSON.stringify(h.s));
  h.edit((c) => Object.assign(c, saved));
  h.act({ type: 'resumed' });
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.deepEqual(h.s.question!.fuse, q.fuse);
  // Its time-out, set again for the fuse's end (or at once, should that be past).
  h.clock.now = q.fuse!.ends + 4000;
  h.act({ type: 'answer', index: null });
  assert.equal(h.s.question!.blast!.was.at, q.askedAt);
  h.act({ type: 'answer', index: null });
  assert.equal(dynamiteOf(h.s, 'p0'), 1, 'one stick for one blast');
  assert.equal(h.s.delve!.blasts, 1);
  // Together, with someone cut off: the question is set aside with its fuse; the stick stays in the pack.
  const t = delve(3, { depth: 20 });
  t.give('p1', { dynamite: 1 });
  t.ask();
  t.light();
  t.act({ type: 'connection', playerId: 'p2', connected: false });
  t.act({ type: 'resumed' });
  assert.equal(t.s.phase, 'choosing');
  assert.equal(t.s.question, null);
  assert.equal(dynamiteOf(t.s, 'p1'), 1);
  assert.equal(t.s.delve!.blasts, undefined);
});

test('alone and away, nothing goes off by itself: the time-out takes the life', () => {
  const h = solo({ dynamite: 1 }, { host: 'p0' });
  h.act({ type: 'connection', playerId: 'p0', connected: false });
  h.timeOut();
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
});

// ---- together --------------------------------------------------------------------

test("together, anyone standing who hasn't answered sets it off, from a random holder's pack; a wrong answer stays paid and locks nobody else out", () => {
  const spent = new Set<string>();
  for (let seed = 1; seed <= 16; seed++) {
    const h = delve(4, { seed, depth: 31 });
    h.give('p0', { dynamite: 1 });
    h.give('p3', { dynamite: 1 });
    h.edit((c) => (c.delve!.losses.p3 = [1, 2, 3]));
    const q = h.ask();
    // p1 answers wrong: it costs them a life, and they're out of this question.
    h.act({ type: 'answer', index: wrongs(q)[0], askedAt: q.askedAt }, 'p1');
    assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
    assert.match(blastProblem(h.s, 'p1')!, /already answered/);
    silently(() => h.blast('p1'), /already answered/);
    // One who perished holds nothing and sets nothing off.
    assert.match(blastProblem(h.s, 'p3')!, /standing/);
    // p2 holds none, and sets the team's off all the same.
    assert.equal(blastProblem(h.s, 'p2'), null);
    h.blast('p2');
    const b = h.s.question!;
    assert.equal(b.blast!.by, 'p2');
    assert.equal(b.blast!.stick, 'p0', "the only standing holder's (p3 perished, their pack with them)");
    spent.add(b.blast!.stick);
    // Paid stays paid; everyone standing answers the new one, p1 too.
    assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
    assert.deepEqual(b.struck ?? [], []);
    assert.deepEqual([...waitingIds(h.s)].sort(), ['p0', 'p1', 'p2']);
    h.clockOn();
    h.act({ type: 'answer', index: right(b), askedAt: b.askedAt }, 'p1');
    assert.equal(h.s.reveal!.winnerId, 'p1');
  }
  assert.deepEqual([...spent], ['p0']);
  // With two holders standing, either may pay for it (the host's roll).
  const payers = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const h = delve(3, { seed, depth: 20 });
    h.give('p0', { dynamite: 1 });
    h.give('p2', { dynamite: 1 });
    h.ask();
    h.blast('p1');
    payers.add(h.s.question!.blast!.stick);
    assert.equal(dynamiteOf(h.s, 'p0') + dynamiteOf(h.s, 'p2'), 1);
  }
  assert.deepEqual([...payers].sort(), ['p0', 'p2']);
});

test('together, the cards that got votes but lost come first (most votes first, ties drawn), then the rest, drawn', () => {
  // Votes: A one (picked), B two, C one: B, then C.
  for (let seed = 1; seed <= 8; seed++) {
    const h = delve(4, { seed, depth: 20 });
    h.give('p0', { dynamite: 2 });
    const [A, B, C] = h.s.offered;
    h.edit((c) => (c.delve!.votes = { p0: A, p1: B, p2: B, p3: C }));
    h.ask(undefined, A);
    h.blast('p0');
    assert.equal(h.s.question!.category, B, `seed ${seed}`);
    h.clockOn();
    h.blast('p0');
    assert.equal(h.s.question!.category, C);
  }
  // A card nobody voted for comes after one somebody did.
  for (let seed = 1; seed <= 8; seed++) {
    const h = delve(3, { seed, depth: 20 });
    h.give('p0', { dynamite: 1 });
    const [A, B, C] = h.s.offered;
    h.edit((c) => (c.delve!.votes = { p0: A, p1: A, p2: C }));
    h.ask(undefined, A);
    h.blast('p1');
    assert.equal(h.s.question!.category, C, `seed ${seed}`);
    assert.notEqual(h.s.question!.category, B);
  }
  // A tie is drawn, by the host's roll.
  const drawn = new Set<string>();
  for (let seed = 1; seed <= 24; seed++) {
    const h = delve(3, { seed, depth: 20 });
    h.give('p0', { dynamite: 1 });
    const [A, B, C] = h.s.offered;
    h.edit((c) => (c.delve!.votes = { p0: A, p1: B, p2: C }));
    h.ask(undefined, A);
    h.blast('p0');
    drawn.add(h.s.question!.category === B ? 'B' : 'C');
  }
  assert.deepEqual([...drawn].sort(), ['B', 'C']);
  // Alone, one of the others, drawn.
  const alone = new Set<string>();
  for (let seed = 1; seed <= 24; seed++) {
    const h = delve(1, { host: null, seed, depth: 20 });
    h.give('p0', { dynamite: 1 });
    const [A, B] = h.s.offered;
    h.ask(undefined, A);
    h.blast();
    alone.add(h.s.question!.category === B ? 'B' : 'C');
  }
  assert.deepEqual([...alone].sort(), ['B', 'C']);
});

test('together, at 0 a flare burns first, then the dynamite goes off: nobody is hit by that time-out and the whole team gets the new question', () => {
  const h = delve(3, { depth: 20 });
  h.give('p1', { dynamite: 1 });
  h.give('p2', { flares: 1 });
  const q = h.ask();
  h.act({ type: 'answer', index: wrongs(q)[0], askedAt: q.askedAt }, 'p0');
  assert.equal(teamItemReady(h.s, 'dynamite'), true);
  h.timeOut();
  assert.equal(h.s.question!.flared, true, 'the flare first');
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(h.s.question!.fuse, undefined);
  // Then the fuse is lit at 0 (the host's timer), and goes off as it burns down.
  h.light();
  assert.deepEqual(h.s.question!.fuse, { lit: h.s.question!.deadline, ends: h.s.question!.deadline! + DELVE_FUSE_MS });
  h.timeOut();
  assert.equal(h.s.question!.askedAt, q.askedAt, 'the time-out finds it still burning, and waits');
  assert.equal(h.s.reveal, null);
  h.fuseOut();
  const b = h.s.question!;
  assert.equal(h.s.phase, 'question');
  assert.equal(b.blast!.was.at, q.askedAt);
  assert.equal(b.blast!.by, undefined);
  assert.equal(b.blast!.stick, 'p1');
  assert.deepEqual(['p0', 'p1', 'p2'].map((id) => livesOf(h.s, id)), [DELVE_LIVES - 1, DELVE_LIVES, DELVE_LIVES], 'only the wrong answer was paid');
  assert.deepEqual([...waitingIds(h.s)].sort(), ['p0', 'p1', 'p2']);
  // With neither, the time-out hits those who never answered.
  h.clockOn();
  h.timeOut();
  assert.equal(h.s.reveal!.timedOut, true);
  assert.deepEqual(h.s.reveal!.hits!.map((x) => x.playerId).sort(), ['p0', 'p1', 'p2']);
});

test('a right answer and a blast crossing: whichever the host takes first wins, the other is dropped', () => {
  // The right answer first: it clears the depth for everyone; the blast finds it over.
  const a = delve(3, { depth: 20 });
  a.give('p2', { dynamite: 1 });
  const qa = a.ask();
  a.act({ type: 'answer', index: right(qa), askedAt: qa.askedAt }, 'p1');
  silently(() => a.act({ type: 'blast', askedAt: qa.askedAt }, 'p2'), /late/);
  assert.equal(a.s.reveal!.winnerId, 'p1');
  assert.equal(dynamiteOf(a.s, 'p2'), 1, 'no stick spent');
  // The blast first: the right answer was for the question blasted away.
  const b = delve(3, { depth: 20 });
  b.give('p2', { dynamite: 1 });
  const qb = b.ask();
  b.act({ type: 'blast', askedAt: qb.askedAt }, 'p2');
  silently(() => b.act({ type: 'answer', index: right(qb), askedAt: qb.askedAt }, 'p1'), /late/);
  assert.equal(b.s.phase, 'question');
  assert.equal(b.s.reveal, null);
  assert.equal(b.s.players.find((p) => p.id === 'p1')!.score, 0);
  // Two blasts at once: the second was for the question the first blasted away.
  const c = delve(3, { depth: 20 });
  c.give('p0', { dynamite: 2 });
  const qc = c.ask();
  c.act({ type: 'blast', askedAt: qc.askedAt }, 'p1');
  silently(() => c.act({ type: 'blast', askedAt: qc.askedAt }, 'p2'), /late/);
  assert.equal(dynamiteOf(c.s, 'p0'), 1);
  assert.equal(c.s.delve!.blasts, 1);
});

test("guests send a blast for their question; the new question's blasted one is public, its own answer not", () => {
  const h = delve(2, { depth: 20 });
  h.give('p1', { dynamite: 1 });
  const q = h.ask();
  h.blast('p1');
  const shown = publicView(h.s).question!;
  assert.deepEqual(shown.blast!.was, { at: q.askedAt, itemId: q.itemId, mode: q.mode });
  assert.equal(shown.itemId, '');
  assert.deepEqual(shown.options, []);
  // Someone not in the game sets nothing off.
  h.clockOn();
  loudly(() => h.act({ type: 'join', playerId: 'x', name: 'X' }, 'y'), /Not allowed/);
  silently(() => h.act({ type: 'blast', askedAt: h.s.question!.askedAt }, 'nobody'), /not in this game/);
});

// ---- what every screen makes of it -------------------------------------------------

test('every screen tells a blast from a question asked again, and sees the stick spent', () => {
  const h = solo({ dynamite: 2 });
  const prev = h.s;
  h.blast();
  assert.deepEqual(blastedAway(prev, h.s), h.s.question!.blast);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: 'p0', item: 'dynamite', change: 'used', left: 1 }]);
  assert.equal(momentOf(inventoryChanges(prev, h.s)), 'blast');
  // Its art failed and it was asked again: the same blast, no new one.
  const blasted = h.s;
  h.act({ type: 'reask' });
  assert.deepEqual(h.s.question!.blast, blasted.question!.blast);
  assert.equal(blastedAway(blasted, h.s), null);
  assert.equal(h.s.question!.find, undefined);
});

test("together, a blast's question waits for no draw: the vote's hold stays with the question it drew", () => {
  const h = delve(3, { depth: 20 });
  h.give('p0', { dynamite: 1 });
  const voting = h.s;
  h.act({ type: 'pick', category: h.s.offered.find((c) => !findOn(h.s, c))! });
  const asked = h.s;
  const until = drawHoldUntil(voting, asked)!;
  assert.equal(until, asked.question!.askedAt + COOP_DRAW_MS);
  // Asked again in its place (its art failed): the hold stays.
  h.act({ type: 'reask' });
  assert.equal(drawHoldUntil(asked, h.s, { qid: asked.question!.askedAt, until }), until);
  h.clockOn();
  const running = h.s;
  h.blast('p1');
  assert.equal(drawHoldUntil(running, h.s, { qid: running.question!.askedAt, until }), null);
});

test("a blasted question's item counts as seen in the codex, never missed, and costs nothing", () => {
  const h = solo({ dynamite: 1 }, { host: 'p0' });
  const q = h.s.question!;
  h.blast('p0');
  const e = blastedEncounter(h.s, h.s.question!.blast!, 'p0', false);
  assert.equal(e.answer, undefined);
  assert.deepEqual([e.at, e.itemId, e.mode], [q.askedAt, q.itemId, q.mode]);
  const c = record(emptyCodex(), e);
  assert.equal(c.items[q.itemId].seen, 1);
  assert.deepEqual([c.items[q.itemId].name, c.items[q.itemId].art, c.items[q.itemId].delve], [{ n: 0, ok: 0 }, { n: 0, ok: 0 }, undefined]);
  assert.deepEqual(c.log, []);
  assert.equal(c.streak, 0);
  // Seen once, however often it is told (a rejoin).
  assert.equal(record(c, e), c);
});

test("a run's blasts go into its record, and records from before them still read", () => {
  const h = solo({ dynamite: 2 }, { host: 'p0' });
  h.blast('p0');
  h.clockOn();
  h.blast('p0');
  const run = leftEvent(h.s, 'p0')!;
  assert.equal(run.blasts, 2);
  const back = parseRecords(serializeRecords(addRun(emptyRecords(), run).records))!;
  assert.equal(back.runs[0].blasts, 2);
  const old = { ...run };
  delete old.blasts;
  assert.equal(parseRecords(serializeRecords(addRun(emptyRecords(), old).records))!.runs[0].blasts, undefined);
  // A save from before blasts (no list of asked cards) reads the question's own card as asked.
  const older = solo({ dynamite: 1 });
  older.edit((c) => delete c.delve!.asked);
  assert.deepEqual(askedCards(older.s), [older.s.question!.category]);
  assert.equal(blastsLeft(older.s), 2);
  older.blast();
  assert.equal(older.s.delve!.asked!.length, 2);
});
