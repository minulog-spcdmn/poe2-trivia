// Delve's dynamite: a stick blasts the question in play away for a new one at
// the same depth, from a card on the depth's offer not asked yet, at most
// twice a depth (as many as the offer's other cards). By hand while the
// question is open (the player's own; together a holder standing who hasn't
// answered), or by itself as the clock hits 0 with no flare to burn, right at
// 0 (the host's time-out; together a random standing holder's). Its fuse warns
// of that over the clock's last DELVE_FUSE_MS, worked out on every
// screen from the deadline (fuseLeft): the question stays open meanwhile.
// Never on a find's question, and a blast's question is never a find. See
// delve.ts (DELVE_MAX_BLASTS, DELVE_FUSE_MS, blastsLeft, blastProblem,
// fuseDue, fuseLeft) and game.ts ('blast', Engine.blast).

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
    /** The clock set to `ms` before the question's 0 (host clock). */
    before0(ms: number) {
      h.clock.now = s.question!.deadline! - ms;
      return h.clock.now;
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

test('at 0 a flare burns first; only with none to burn does the dynamite go off by itself, right at 0, and the time-out costs nothing', () => {
  const h = solo({ dynamite: 1, flares: 1 });
  const q = h.s.question!;
  // A flare to burn at this 0: no fuse before it.
  h.before0(DELVE_FUSE_MS / 2);
  assert.equal(fuseLeft(h.s, h.clock.now), null);
  h.timeOut();
  // The flare: the same question, 5 s more (from now, as its own timer came late here).
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.deadline, q.deadline! + ANSWER_GRACE_MS + FLARE_MS);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
  // The dynamite will go off at the new 0: its fuse burns over the last seconds before it.
  h.before0(DELVE_FUSE_MS + 1);
  assert.equal(fuseLeft(h.s, h.clock.now), null);
  h.before0(DELVE_FUSE_MS);
  assert.equal(fuseLeft(h.s, h.clock.now), 1);
  // Then, in place of the time-out, the dynamite goes off at once: a new question, nobody hit.
  h.timeOut();
  const b = h.s.question!;
  assert.equal(h.s.phase, 'question');
  assert.notEqual(b.askedAt, q.askedAt);
  assert.deepEqual(b.blast!.by, undefined, 'it went off by itself');
  assert.equal(b.blast!.stick, 'p0');
  assert.deepEqual([dynamiteOf(h.s, 'p0'), flaresOf(h.s, 'p0'), livesOf(h.s, 'p0')], [0, 0, DELVE_LIVES]);
  assert.equal(h.s.reveal, null);
  // The new question on the full clock; with nothing left, no fuse, and its time-out costs the life.
  const c = h.clockOn();
  assert.equal(fuseDue(h.s), false);
  assert.equal(fuseLeft(h.s, h.before0(100)), null);
  assert.equal(c.deadline! - c.clockAt!, delveTimer(h.s.round) * 1000);
  h.timeOut();
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES - 1);
});

test("a player's answer later than 0 and its allowance finds the dynamite gone off in place of the time-out", () => {
  const h = solo({ dynamite: 1 }, { host: 'p0' });
  const q = h.s.question!;
  h.clock.now = q.deadline! + ANSWER_GRACE_MS + 50;
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0');
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.blast?.was.at, q.askedAt);
  assert.equal(h.s.players[0].score, 0);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES);
  assert.equal(dynamiteOf(h.s, 'p0'), 0);
  // Within the allowance it still counts, and the stick is kept.
  const in_ = solo({ dynamite: 1 }, { host: 'p0' });
  const q2 = in_.s.question!;
  in_.clock.now = q2.deadline! + ANSWER_GRACE_MS - 10;
  in_.act({ type: 'answer', index: right(q2), askedAt: q2.askedAt }, 'p0');
  assert.equal(in_.s.reveal!.correct, true);
  assert.equal(dynamiteOf(in_.s, 'p0'), 1);
});

// ---- the fuse -------------------------------------------------------------------

test("the fuse burns only over the last DELVE_FUSE_MS before a 0 where the dynamite will go off, from the deadline alone", () => {
  // With dynamite and nothing before it: from 1 at DELVE_FUSE_MS before 0 down to 0 at 0, and 0 until the time-out.
  const h = solo({ dynamite: 1 });
  assert.equal(fuseDue(h.s), true);
  const q = h.s.question!;
  assert.equal(fuseLeft(h.s, q.clockAt!), null, 'not as the clock starts');
  assert.equal(fuseLeft(h.s, q.deadline! - DELVE_FUSE_MS - 1), null);
  assert.equal(fuseLeft(h.s, q.deadline! - DELVE_FUSE_MS), 1);
  assert.equal(fuseLeft(h.s, q.deadline! - DELVE_FUSE_MS / 2), 0.5);
  assert.equal(fuseLeft(h.s, q.deadline!), 0);
  assert.equal(fuseLeft(h.s, q.deadline! + ANSWER_GRACE_MS), 0);
  // Nothing in the state lights it: the host sets no fuse, the question is as it was.
  h.before0(DELVE_FUSE_MS / 2);
  assert.equal('fuse' in h.s.question!, false);
  // Protocol 14's host-only 'fuse' lights nothing now.
  h.act({ type: 'fuse', askedAt: q.askedAt } as unknown as Action);
  assert.equal('fuse' in h.s.question!, false);
  // A flare to burn at that 0: it burns first, and no fuse before it.
  const f = solo({ dynamite: 1, flares: 1 });
  assert.equal(fuseDue(f.s), false);
  assert.equal(fuseLeft(f.s, f.before0(500)), null);
  // Without a stick, or on a find: nothing goes off, no fuse.
  const none = solo({ flares: 0 });
  assert.equal(fuseLeft(none.s, none.before0(500)), null);
  none.timeOut();
  assert.equal(none.s.reveal!.timedOut, true);
  for (const find of ['azurite', 'flare', 'dynamite'] as const) {
    const g = solo({ dynamite: 1 }, { find, depth: 20 });
    assert.equal(fuseDue(g.s), false, find);
    assert.equal(fuseLeft(g.s, g.before0(500)), null, find);
    g.timeOut();
    assert.equal(g.s.reveal!.timedOut, true, find);
    // (A Dynamite Cache missed blows something of the pack up: maybe that stick.)
    if (find !== 'dynamite') assert.equal(dynamiteOf(g.s, 'p0'), 1, find);
  }
  // Two blasts made at this depth: no third, by hand or at 0, and no fuse.
  const two = solo({ dynamite: 3 });
  two.blast();
  two.clockOn();
  assert.equal(fuseLeft(two.s, two.before0(500)), 500 / DELVE_FUSE_MS, 'one blast left: it burns');
  two.blast();
  two.clockOn();
  assert.equal(blastsLeft(two.s), 0);
  assert.equal(fuseDue(two.s), false);
  assert.equal(fuseLeft(two.s, two.before0(500)), null);
  two.timeOut();
  assert.equal(two.s.reveal!.timedOut, true);
  assert.equal(dynamiteOf(two.s, 'p0'), 1);
  // Alone and away: nothing goes off, no fuse.
  const away = solo({ dynamite: 1 }, { host: 'p0' });
  away.act({ type: 'connection', playerId: 'p0', connected: false });
  assert.equal(fuseLeft(away.s, away.before0(500)), null);
  // Together: the stick of someone still to answer, with nobody's flare to burn first.
  const t = delve(3, { depth: 20 });
  t.give('p2', { dynamite: 1 });
  t.ask();
  assert.equal(fuseLeft(t.s, t.before0(DELVE_FUSE_MS)), 1);
  t.give('p1', { flares: 1 });
  assert.equal(fuseLeft(t.s, t.before0(DELVE_FUSE_MS)), null, "a teammate's flare burns first");
  // The holder answering wrong, or going away, as it burns stops nothing: their stick still goes off.
  for (const gone of ['answered', 'away'] as const) {
    const g = delve(3, { depth: 20 });
    g.give('p2', { dynamite: 1 });
    const q = g.ask();
    g.before0(500);
    if (gone === 'answered') g.act({ type: 'answer', index: wrongs(q)[0], askedAt: q.askedAt }, 'p2');
    else g.act({ type: 'connection', playerId: 'p2', connected: false });
    assert.equal(fuseLeft(g.s, g.clock.now), 500 / DELVE_FUSE_MS, gone);
    g.timeOut();
    assert.deepEqual([g.s.question!.blast!.by, g.s.question!.blast!.stick], [undefined, 'p2'], gone);
  }
  // With two holders, whose goes off is drawn (the host's roll).
  const drawn = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const g = delve(3, { seed, depth: 20 });
    g.give('p0', { dynamite: 1 });
    g.give('p2', { dynamite: 1 });
    g.ask();
    g.timeOut();
    drawn.add(g.s.question!.blast!.stick);
    assert.equal(dynamiteOf(g.s, 'p0') + dynamiteOf(g.s, 'p2'), 1);
  }
  assert.deepEqual([...drawn].sort(), ['p0', 'p2']);
});

test('the dynamite goes off at 0 with no delay: with the time-out, at 0 and the allowance for answers in flight', () => {
  const h = solo({ dynamite: 2 }, { host: 'p0' });
  const q = h.s.question!;
  // Through the fuse, nothing happens by itself: the host's only timer is the time-out.
  h.before0(DELVE_FUSE_MS / 2);
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(dynamiteOf(h.s, 'p0'), 2);
  // At 0 and the allowance (no DELVE_FUSE_MS later), it goes off by itself: one stick, one blast.
  h.timeOut();
  assert.equal(h.clock.now, q.deadline! + ANSWER_GRACE_MS);
  const b = h.s.question!;
  assert.equal(b.blast!.was.at, q.askedAt);
  assert.equal(b.blast!.by, undefined);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
  assert.equal(h.s.delve!.blasts, 1);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES);
  assert.equal(h.s.reveal, null);
  // An answer to the old question after that is dropped quietly.
  silently(() => h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0'), /late/);
  // Together the same: nobody is hit as it goes off, whoever hadn't answered.
  const t = delve(3, { depth: 20 });
  t.give('p0', { dynamite: 1 });
  const qt = t.ask();
  t.before0(DELVE_FUSE_MS / 3);
  t.timeOut();
  assert.equal(t.clock.now, qt.deadline! + ANSWER_GRACE_MS);
  assert.equal(t.s.question!.blast!.was.at, qt.askedAt);
  assert.equal(t.s.question!.blast!.by, undefined);
  assert.deepEqual(['p0', 'p1', 'p2'].map((id) => livesOf(t.s, id)), [DELVE_LIVES, DELVE_LIVES, DELVE_LIVES]);
  assert.equal(t.s.reveal, null);
});

test('the question is still answerable while the fuse burns: a right answer wins and spends no stick, a wrong one costs its life', () => {
  // Alone, online and on one device: right during the fuse.
  for (const host of ['p0', null] as const) {
    const h = solo({ dynamite: 1 }, { host });
    const q = h.s.question!;
    h.before0(DELVE_FUSE_MS / 2);
    assert.equal(fuseLeft(h.s, h.clock.now), 0.5);
    h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, host);
    assert.equal(h.s.reveal!.correct, true);
    assert.equal(h.s.players[0].score, 1);
    assert.equal(dynamiteOf(h.s, 'p0'), 1, 'the stick is kept');
    assert.equal(h.s.delve!.blasts, undefined);
    // The fuse stops with the question.
    assert.equal(fuseLeft(h.s, h.clock.now), null);
  }
  // Wrong during the fuse: its life, as on any question; the stick stays.
  const w = solo({ dynamite: 1 }, { host: 'p0' });
  const qw = w.s.question!;
  w.before0(300);
  w.act({ type: 'answer', index: wrongs(qw)[0], askedAt: qw.askedAt }, 'p0');
  assert.equal(w.s.reveal!.correct, false);
  assert.equal(livesOf(w.s, 'p0'), DELVE_LIVES - 1);
  assert.equal(dynamiteOf(w.s, 'p0'), 1);
  assert.equal(fuseLeft(w.s, w.clock.now), null);
  // A guest's right answer given just before 0, arriving within the allowance, still wins.
  const g = solo({ dynamite: 1 }, { host: 'p0' });
  const qg = g.s.question!;
  g.clock.now = qg.deadline! + ANSWER_GRACE_MS - 10;
  g.act({ type: 'answer', index: right(qg), askedAt: qg.askedAt }, 'p0');
  assert.equal(g.s.reveal!.correct, true);
  assert.equal(dynamiteOf(g.s, 'p0'), 1);
  // Together: a wrong answer during the fuse is paid and the fuse burns on for the rest; a right one clears the depth.
  const t = delve(3, { depth: 20 });
  t.give('p2', { dynamite: 1 });
  const qt = t.ask();
  t.before0(DELVE_FUSE_MS * 0.75);
  t.act({ type: 'answer', index: wrongs(qt)[0], askedAt: qt.askedAt }, 'p1');
  assert.equal(livesOf(t.s, 'p1'), DELVE_LIVES - 1);
  assert.equal(fuseLeft(t.s, t.clock.now), 0.75);
  t.before0(DELVE_FUSE_MS / 4);
  t.act({ type: 'answer', index: right(qt), askedAt: qt.askedAt }, 'p0');
  assert.equal(t.s.reveal!.winnerId, 'p0');
  assert.equal(dynamiteOf(t.s, 'p2'), 1, 'no stick spent');
  assert.equal(fuseLeft(t.s, t.clock.now), null);
});

test('Detonate pressed while the fuse burns blasts at once', () => {
  // Alone, online and on one device.
  for (const host of ['p0', null] as const) {
    const h = solo({ dynamite: 1 }, { host });
    const q = h.s.question!;
    h.before0(700);
    assert.equal(blastProblem(h.s, host), null);
    h.blast(host);
    const b = h.s.question!;
    assert.equal(b.blast!.was.at, q.askedAt);
    assert.equal(b.blast!.by, 'p0');
    assert.equal(dynamiteOf(h.s, 'p0'), 0);
    // The new question's clock has not started: no fuse, no time-out, no second blast.
    assert.equal(h.s.question!.deadline, null);
    assert.equal(fuseDue(h.s), false);
    assert.equal(fuseLeft(h.s, h.clock.now), null);
  }
  // Together, the holder, who hasn't answered.
  const t = delve(3, { depth: 20 });
  t.give('p2', { dynamite: 1 });
  t.ask();
  t.before0(400);
  t.blast('p2');
  assert.equal(t.s.question!.blast!.by, 'p2');
  assert.equal(dynamiteOf(t.s, 'p2'), 0);
});

test("guests work out the same fuse from what they see, on the host's clock", () => {
  const h = delve(2, { depth: 20 });
  h.give('p1', { dynamite: 1 });
  h.ask();
  const seen = publicView(h.s);
  for (const ms of [DELVE_FUSE_MS + 50, DELVE_FUSE_MS, 900, 0]) {
    const now = h.before0(ms);
    assert.equal(fuseLeft(seen, now), fuseLeft(h.s, now), String(ms));
  }
  assert.equal(fuseLeft(seen, h.before0(900)), 0.5);
});

test('a host reload while the fuse burns neither loses the stick nor spends it twice', () => {
  // On one device, the run picks up where it was: the fuse still burns, and it goes off once, at the time-out.
  const h = solo({ dynamite: 2 });
  const q = h.s.question!;
  h.before0(DELVE_FUSE_MS / 2);
  const saved: GameState = JSON.parse(JSON.stringify(h.s));
  h.edit((c) => Object.assign(c, saved));
  h.act({ type: 'resumed' });
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(fuseLeft(h.s, h.clock.now), 0.5);
  assert.equal(dynamiteOf(h.s, 'p0'), 2, 'nothing spent before 0');
  h.clock.now = q.deadline! + ANSWER_GRACE_MS + 4000;
  h.act({ type: 'answer', index: null });
  assert.equal(h.s.question!.blast!.was.at, q.askedAt);
  h.act({ type: 'answer', index: null });
  assert.equal(dynamiteOf(h.s, 'p0'), 1, 'one stick for one blast');
  assert.equal(h.s.delve!.blasts, 1);
  // A save from protocol 14 with a fuse lit on its question still loads, and goes off once at its time-out.
  const old = solo({ dynamite: 1 });
  const qo = old.s.question!;
  old.edit((c) => Object.assign(c.question!, { fuse: { lit: qo.deadline, ends: qo.deadline! + DELVE_FUSE_MS } }));
  old.act({ type: 'resumed' });
  old.timeOut();
  assert.equal(old.s.question!.blast!.was.at, qo.askedAt);
  assert.equal(dynamiteOf(old.s, 'p0'), 0);
  // Together, with someone cut off: the question is set aside mid-fuse; the stick stays in the pack.
  const t = delve(3, { depth: 20 });
  t.give('p1', { dynamite: 1 });
  t.ask();
  t.before0(DELVE_FUSE_MS / 2);
  t.act({ type: 'connection', playerId: 'p2', connected: false });
  t.act({ type: 'resumed' });
  assert.equal(t.s.phase, 'choosing');
  assert.equal(t.s.question, null);
  assert.equal(fuseLeft(t.s, t.clock.now), null);
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

test("together, only a holder who hasn't answered sets it off, from their own pack; a wrong answer stays paid and locks nobody else out", () => {
  for (let seed = 1; seed <= 16; seed++) {
    const h = delve(4, { seed, depth: 31 });
    h.give('p0', { dynamite: 1 });
    h.give('p1', { dynamite: 1 });
    h.give('p3', { dynamite: 1 });
    h.edit((c) => (c.delve!.losses.p3 = [1, 2, 3]));
    const q = h.ask();
    // p1 answers wrong: it costs them a life, and they're out of this question, their stick too.
    h.act({ type: 'answer', index: wrongs(q)[0], askedAt: q.askedAt }, 'p1');
    assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
    assert.match(blastProblem(h.s, 'p1')!, /already answered/);
    silently(() => h.blast('p1'), /already answered/);
    // One who perished holds nothing and sets nothing off.
    assert.match(blastProblem(h.s, 'p3')!, /standing/);
    // p2 holds none, and can't set a teammate's off.
    assert.match(blastProblem(h.s, 'p2')!, /no dynamite/);
    silently(() => h.blast('p2'), /no dynamite/);
    assert.equal(h.s.question!.askedAt, q.askedAt);
    assert.deepEqual(['p0', 'p1'].map((id) => dynamiteOf(h.s, id)), [1, 1]);
    // p0 holds one, and sets it off.
    assert.equal(blastProblem(h.s, 'p0'), null);
    h.blast('p0');
    const b = h.s.question!;
    assert.equal(b.blast!.by, 'p0');
    assert.equal(b.blast!.stick, 'p0', 'their own');
    assert.deepEqual(['p0', 'p1'].map((id) => dynamiteOf(h.s, id)), [0, 1]);
    // Paid stays paid; everyone standing answers the new one, p1 too.
    assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
    assert.deepEqual(b.struck ?? [], []);
    assert.deepEqual([...waitingIds(h.s)].sort(), ['p0', 'p1', 'p2']);
    h.clockOn();
    h.act({ type: 'answer', index: right(b), askedAt: b.askedAt }, 'p1');
    assert.equal(h.s.reveal!.winnerId, 'p1');
  }
  // The host's own tooling: a random standing holder's stick, as at 0.
  const payers = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const h = delve(3, { seed, depth: 20 });
    h.give('p1', { dynamite: 1 });
    h.give('p2', { dynamite: 1 });
    h.ask();
    h.blast();
    assert.equal(h.s.question!.blast!.by, undefined);
    payers.add(h.s.question!.blast!.stick);
    assert.equal(dynamiteOf(h.s, 'p1') + dynamiteOf(h.s, 'p2'), 1);
  }
  assert.deepEqual([...payers].sort(), ['p1', 'p2']);
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
    h.blast('p0');
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
  assert.equal(fuseLeft(h.s, h.before0(500)), null, 'the flare burns at this 0: no fuse before it');
  h.timeOut();
  assert.equal(h.s.question!.flared, true, 'the flare first');
  assert.equal(h.s.question!.askedAt, q.askedAt);
  // Then the fuse burns before the 0 the flare moved the clock to, and the dynamite goes off right then.
  assert.equal(fuseLeft(h.s, h.before0(DELVE_FUSE_MS)), 1);
  h.timeOut();
  const b = h.s.question!;
  assert.equal(h.s.phase, 'question');
  assert.equal(b.blast!.was.at, q.askedAt);
  assert.equal(b.blast!.by, undefined);
  assert.equal(b.blast!.stick, 'p1');
  assert.deepEqual(['p0', 'p1', 'p2'].map((id) => livesOf(h.s, id)), [DELVE_LIVES - 1, DELVE_LIVES, DELVE_LIVES], 'only the wrong answer was paid');
  assert.deepEqual([...waitingIds(h.s)].sort(), ['p0', 'p1', 'p2']);
  // With neither, no fuse, and the time-out hits those who never answered.
  h.clockOn();
  assert.equal(fuseLeft(h.s, h.before0(500)), null);
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
  c.give('p1', { dynamite: 1 });
  c.give('p2', { dynamite: 1 });
  const qc = c.ask();
  c.act({ type: 'blast', askedAt: qc.askedAt }, 'p1');
  silently(() => c.act({ type: 'blast', askedAt: qc.askedAt }, 'p2'), /late/);
  assert.deepEqual(['p1', 'p2'].map((id) => dynamiteOf(c.s, id)), [0, 1]);
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
  h.blast('p0');
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

test('together, a wrong answer given before a teammate blasts the question away is logged as a miss, at what it cost', () => {
  const h = delve(3, { depth: 31 });
  h.give('p0', { dynamite: 1 });
  h.give('p1', { wards: 1 });
  const q = h.ask();
  // p1's wrong answer breaks their ward, p2's costs a life; then p0 sets the dynamite off.
  const [i1, i2] = wrongs(q);
  h.act({ type: 'answer', index: i1, askedAt: q.askedAt }, 'p1');
  h.act({ type: 'answer', index: i2, askedAt: q.askedAt }, 'p2');
  assert.deepEqual([livesOf(h.s, 'p1'), livesOf(h.s, 'p2')], [DELVE_LIVES, DELVE_LIVES - 1]);
  h.blast('p0');
  const blast = h.s.question!.blast!;
  const struck = [
    { by: 'p1', index: i1, lives: 0, wards: 1 },
    { by: 'p2', index: i2, lives: 1, wards: 0 },
  ];
  assert.deepEqual(blast.was.struck, struck);
  // Public: every screen logs its own (no answer to the new question in it).
  assert.deepEqual(publicView(h.s).question!.blast!.was.struck, struck);
  const depth = h.s.round;
  // p1: a miss a ward took.
  const e1 = blastedEncounter(h.s, blast, 'p1', false);
  assert.deepEqual(e1.answer, { ok: false, pickedId: null, pickedLabel: null });
  assert.deepEqual(e1.delve!.lost, { lives: 0, wards: 1 });
  const c1 = record(emptyCodex(), e1);
  assert.deepEqual(c1.items[q.itemId].delve, { n: 1, ok: 0, deepest: 0, lostAt: 0, warded: 1 });
  assert.deepEqual(c1.log, [{ t: q.askedAt, id: q.itemId, mode: q.mode, ok: false, difficulty: e1.difficulty, race: false, depth, run: h.s.delve!.startedAt, warded: true, lives: 0, wards: 1, team: true, who: 'p1' }]);
  assert.equal(c1.streak, 0);
  // p2: a miss that cost a life.
  const c2 = record(emptyCodex(), blastedEncounter(h.s, blast, 'p2', false));
  assert.deepEqual(c2.items[q.itemId].delve, { n: 1, ok: 0, deepest: 0, lostAt: depth });
  assert.deepEqual([c2.log[0].lives, c2.log[0].wards], [1, 0]);
  // p0 never answered it, and hot-seat can't tell its players apart: seen only.
  for (const e of [blastedEncounter(h.s, blast, 'p0', false), blastedEncounter(h.s, blast, 'p1', true)]) {
    assert.equal(e.answer, undefined);
    assert.equal(e.delve!.lost, undefined);
    assert.deepEqual(record(emptyCodex(), e).log, []);
  }
  // Asked again in its place (its art failed), the blast keeps what it remembers.
  h.act({ type: 'reask' });
  assert.deepEqual(h.s.question!.blast!.was.struck, struck);
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
