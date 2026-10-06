// Regressions from a review of the Delve engine: a guest's late answer with a
// flare still to burn, the items spent on a question set aside after a host
// reload, the lockout that setting a question aside gives back, and the
// lives, wards, packs and streaks it gives back (it costs nobody anything).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELVE_LIVES, DELVE_MAX_LOCKOUT, FLARE_MS, blastAtMs, delveLockout, dynamiteOf, findOn, flaresOf, inventoryOf, livesOf, wardsOf, type Inventory } from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, ActionError, Engine, createGame, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };
const right = (q: Question) => q.options.indexOf(q.itemId);
const wrong = (q: Question) => q.options.findIndex((id) => id !== q.itemId);
/** The wrong options of a question, by index (co-op: each can be struck once). */
const wrongs = (q: Question) => q.options.flatMap((id, i) => (id === q.itemId ? [] : [i]));

function seeded(seed: number) {
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const silently = (fn: () => unknown, message?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent && (!message || message.test(e.message)));

/**
 * An online Delve run on a clock the test moves, hosted by `host`, for
 * players p0 to p(n-1): one makes a solo run, more a co-op one. Helpers act
 * as the trusted host.
 */
function run(n: number, opts: { host?: string; seed?: number; depth?: number } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 3), now: () => clock.now, fakes });
  const host = opts.host ?? 'p0';
  let s: GameState = createGame(host, SETTINGS);
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name: `Delver ${'ABCDEFGH'[i]}` }, `p${i}`);
  s = engine.apply(s, { type: 'start' }, host);
  s = { ...s, players: [...s.players].sort((a, b) => a.id.localeCompare(b.id)) };
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
    /** A card picked (no find) and the clock started. */
    ask() {
      h.act({ type: 'pick', category: s.offered.find((c) => !findOn(s, c))! });
      h.act({ type: 'clock', askedAt: s.question!.askedAt });
      return s.question!;
    },
    answer: (id: string, index: number) => h.act({ type: 'answer', index, askedAt: s.question!.askedAt }, id),
  };
  if (opts.depth) h.edit((c) => (c.round = opts.depth!));
  return h;
}

/** A solo run played by guest p0 (the host isn't seated). */
const solo = (opts: { seed?: number; depth?: number } = {}) => run(1, { host: 'host', depth: 30, ...opts });

// ---- 1. a late answer with a flare still to burn ------------------------------

test('alone: an answer within the allowance as the clock hits 0 counts and keeps the flare, as before', () => {
  const h = solo();
  h.give('p0', { flares: 1 });
  const q = h.ask();
  h.clock.now = q.deadline! + ANSWER_GRACE_MS;
  h.answer('p0', right(q));
  assert.equal(h.s.reveal!.correct, true);
  assert.equal(flaresOf(h.s, 'p0'), 1);
});

test("alone: a guest's answer past the allowance burns the flare at 0 and is judged by the flare's clock", () => {
  const h = solo();
  h.give('p0', { flares: 1 });
  const q = h.ask();
  // Within the flare's time, had it burnt at 0: it counts, and the flare is used.
  h.clock.now = q.deadline! + ANSWER_GRACE_MS + 1;
  h.answer('p0', right(q));
  assert.equal(h.s.reveal!.correct, true);
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.flaredAt, q.deadline, 'as if it burnt at 0');
  assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS, "the flare's time counted from 0");
  assert.equal(flaresOf(h.s, 'p0'), 0, 'the flare is not given back');
});

test("alone: a guest's answer long after 0 is late even with the flare's time, which is used up", () => {
  const h = solo();
  h.give('p0', { flares: 1 });
  const q = h.ask();
  h.clock.now = q.deadline! + FLARE_MS + ANSWER_GRACE_MS + 60_000;
  h.answer('p0', right(q));
  assert.equal(h.s.reveal!.correct, false);
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES - 1);
  assert.equal(flaresOf(h.s, 'p0'), 0);
  assert.equal(h.s.question!.flaredAt, q.deadline);
});

test("together: an answer past the allowance burns a holder's flare at 0 and counts within the flare's time", () => {
  const h = run(3);
  h.give('p2', { flares: 1 });
  const q = h.ask();
  h.clock.now = q.deadline! + ANSWER_GRACE_MS + 1;
  h.answer('p1', wrong(q));
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.flaredBy, 'p2');
  assert.equal(h.s.question!.flaredAt, q.deadline);
  assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1, 'the wrong answer counted');
  h.answer('p0', right(q));
  assert.equal(h.s.reveal!.correct, true);
  assert.equal(flaresOf(h.s, 'p2'), 0, 'the flare is not given back');
});

test('together: an answer long after 0 is dropped, and the flare stays burnt at 0', () => {
  const h = run(3);
  h.give('p2', { flares: 1 });
  const q = h.ask();
  h.clock.now = q.deadline! + FLARE_MS + ANSWER_GRACE_MS + 60_000;
  h.answer('p1', right(q));
  assert.equal(h.s.phase, 'question', 'the right answer came too late to clear it');
  assert.equal(h.s.reveal, null);
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.flaredAt, q.deadline);
  assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS);
  assert.equal(flaresOf(h.s, 'p2'), 0);
  assert.deepEqual(h.s.question!.struck ?? [], []);
  // Another try is just late, and the host's time-out costs everyone.
  silently(() => h.answer('p1', right(q)), /late/);
  h.act({ type: 'answer', index: null });
  assert.equal(h.s.reveal!.timedOut, true);
  for (const id of ['p0', 'p1', 'p2']) assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
});

// ---- 2. items spent on a question set aside -----------------------------------

test('alone: a question set aside after a reload gives back the flare and the dynamite spent on it', () => {
  const h = solo();
  h.give('p0', { flares: 1, dynamite: 1 });
  const q = h.ask();
  h.clock.now = q.clockAt! + blastAtMs(h.s);
  h.act({ type: 'dynamite', askedAt: q.askedAt });
  assert.equal(h.s.question!.blasted, true);
  h.clock.now = h.s.question!.deadline!;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(h.s.question!.flared, true);
  assert.deepEqual([flaresOf(h.s, 'p0'), dynamiteOf(h.s, 'p0')], [0, 0]);
  h.act({ type: 'connection', playerId: 'p0', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual([flaresOf(h.s, 'p0'), dynamiteOf(h.s, 'p0'), livesOf(h.s, 'p0')], [1, 1, DELVE_LIVES]);
});

test('together: a question set aside after a reload gives each item back to whoever spent it', () => {
  const h = run(3, { depth: 30 });
  h.give('p1', { dynamite: 1 });
  h.give('p2', { flares: 1 });
  const q = h.ask();
  h.clock.now = q.clockAt! + blastAtMs(h.s);
  h.act({ type: 'dynamite', askedAt: q.askedAt });
  assert.equal(h.s.question!.blastedBy, 'p1');
  h.clock.now = h.s.question!.deadline!;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(h.s.question!.flaredBy, 'p2');
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.equal(dynamiteOf(h.s, 'p1'), 1);
  assert.equal(flaresOf(h.s, 'p2'), 1);
  assert.equal(flaresOf(h.s, 'p1') + dynamiteOf(h.s, 'p2') + flaresOf(h.s, 'p0') + dynamiteOf(h.s, 'p0'), 0, 'nobody else gains one');
});

test('a question set aside with nothing spent on it gives nothing', () => {
  const h = solo();
  h.ask();
  h.act({ type: 'connection', playerId: 'p0', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual([flaresOf(h.s, 'p0'), dynamiteOf(h.s, 'p0')], [0, 0]);
});

// ---- 3. the lockout a question set aside gives back ----------------------------

/** DELVE_MAX_LOCKOUT categories nobody is offered right now, oldest first. */
const fullLockout = (h: ReturnType<typeof run>) => h.engine.categories.filter((c) => !h.s.offered.includes(c)).slice(0, DELVE_MAX_LOCKOUT);

test('alone: setting a question aside at the longest lockout restores the lockout as it was', () => {
  const h = solo({ depth: 95 });
  assert.equal(delveLockout(95), DELVE_MAX_LOCKOUT);
  const before = fullLockout(h);
  h.edit((c) => (c.players[0].recent = [...before]));
  h.ask();
  assert.notDeepEqual(h.s.players[0].recent, before);
  h.act({ type: 'connection', playerId: 'p0', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual(h.s.players[0].recent, before);
});

test("together: setting a question aside at the longest lockout restores the team's lockout as it was", () => {
  const h = run(3, { depth: 95 });
  const before = fullLockout(h);
  h.edit((c) => (c.recentCategories = [...before]));
  h.ask();
  assert.notDeepEqual(h.s.recentCategories, before);
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual(h.s.recentCategories, before);
});

test('a save from before the lockout was kept still takes back just the pick', () => {
  const h = run(3);
  h.ask();
  const picked = h.s.recentCategories;
  h.edit((c) => {
    delete c.delve!.snapshot;
    delete c.delve!.picksBefore;
  });
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  h.act({ type: 'resumed' });
  assert.deepEqual(h.s.recentCategories, picked.slice(0, -1));
});

// ---- 4. what a question set aside gives back to everyone ----------------------

/** The host's reload cuts off p2, so the open question is set aside. */
const reload = (h: ReturnType<typeof run>, cut = ['p2']) => {
  for (const id of cut) h.act({ type: 'connection', playerId: id, connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.delve!.snapshot, undefined, 'the snapshot goes with the question');
};

test('together: a wrong pick on a question set aside gives the life back', () => {
  const h = run(3);
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  h.answer('p0', wrongs(q)[1]);
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1')], [DELVE_LIVES - 1, DELVE_LIVES - 1]);
  reload(h);
  for (const id of ['p0', 'p1', 'p2']) assert.equal(livesOf(h.s, id), DELVE_LIVES);
  assert.deepEqual(h.s.delve!.losses.p1 ?? [], []);
});

test('together: a ward a wrong pick broke on a question set aside comes back', () => {
  const h = run(3);
  h.give('p1', { wards: 1, flares: 1 });
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  assert.deepEqual(h.s.question!.struck!.map((x) => [x.by, x.lives, x.wards]), [['p1', 0, 1]]);
  assert.deepEqual([wardsOf(h.s, 'p1'), livesOf(h.s, 'p1')], [0, DELVE_LIVES]);
  reload(h);
  assert.deepEqual(inventoryOf(h.s, 'p1'), { ...NONE, wards: 1, flares: 1 });
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES);
});

test('together: a player who perished on a question set aside is back on their feet, pack and all', () => {
  const h = run(3);
  h.edit((c) => (c.delve!.losses.p1 = Array(DELVE_LIVES - 1).fill(1)));
  h.give('p1', { flares: 2, dynamite: 1, shards: 1 });
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  assert.equal(livesOf(h.s, 'p1'), 0);
  assert.deepEqual(inventoryOf(h.s, 'p1'), NONE);
  // They were cut off too: back on their feet, they get the grace as well.
  reload(h, ['p1', 'p2']);
  assert.equal(livesOf(h.s, 'p1'), 1);
  assert.deepEqual(inventoryOf(h.s, 'p1'), { ...NONE, flares: 2, dynamite: 1, shards: 1 });
  assert.deepEqual([...h.s.delve!.excused].sort(), ['p1', 'p2']);
});

test('together: the streaks a question set aside ended come back', () => {
  const h = run(3);
  h.edit((c) => c.players.forEach((p, i) => (p.streak = [2, 4, 1][i])));
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  assert.equal(h.s.players[1].streak, 0);
  reload(h);
  assert.deepEqual(h.s.players.map((p) => p.streak), [2, 4, 1]);
});

test('together: a player who left during a question set aside stays gone', () => {
  const h = run(3);
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  h.act({ type: 'remove', playerId: 'p1' });
  reload(h);
  assert.equal(h.s.delve!.losses.p1, undefined);
  assert.equal(h.s.delve!.inventory!.p1, undefined);
});

test('a reask keeps the snapshot its pick took, and an answered question lets it go', () => {
  const h = run(3);
  h.edit((c) => (c.players[1].streak = 3));
  h.act({ type: 'pick', category: h.s.offered.find((c) => !findOn(h.s, c))! });
  const snap = structuredClone(h.s.delve!.snapshot);
  assert.deepEqual(snap!.picks, []);
  h.act({ type: 'reask' });
  assert.deepEqual(h.s.delve!.snapshot, snap);
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  const q = h.s.question!;
  h.answer('p1', wrongs(q)[0]);
  h.answer('p0', right(q));
  assert.equal(h.s.phase, 'reveal');
  assert.equal(h.s.delve!.snapshot, undefined);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1, 'an answered question costs what it cost');
  assert.equal(h.s.players[1].streak, 0);
});

test('alone: a wrong answer still costs a life, and the question lets its snapshot go', () => {
  const h = solo();
  const q = h.ask();
  assert.ok(h.s.delve!.snapshot);
  h.answer('p0', wrong(q));
  assert.equal(h.s.reveal!.correct, false);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES - 1);
  assert.equal(h.s.delve!.snapshot, undefined);
  h.act({ type: 'next' }, 'p0');
  assert.equal(h.s.phase, 'choosing');
});

test('an older save without a snapshot sets a question aside as before: items back, losses stay', () => {
  const h = run(3);
  h.give('p2', { flares: 1 });
  const q = h.ask();
  const picked = h.s.recentCategories;
  h.clock.now = q.deadline!;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(h.s.question!.flaredBy, 'p2');
  h.answer('p1', wrongs(q)[0]);
  h.edit((c) => {
    delete c.delve!.snapshot;
    c.delve!.picksBefore = [];
  });
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.notDeepEqual(picked, []);
  assert.deepEqual(h.s.recentCategories, []);
  assert.equal(flaresOf(h.s, 'p2'), 1);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
  assert.equal(h.s.delve!.picksBefore, undefined);
});

test('together: the vote a question set aside is held again does not count as let pass twice', () => {
  const h = run(3);
  h.edit((c) => (c.delve!.missed = { p0: 0, p1: 0, p2: 1 }));
  // p0 votes, p1 and p2 let it pass: the vote closes when its window runs out.
  h.act({ type: 'vote', category: h.s.offered[0] }, 'p0');
  h.clock.now += 60_000;
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'question');
  assert.deepEqual(h.s.delve!.missed, { p0: 0, p1: 1, p2: 2 });
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  reload(h);
  assert.deepEqual(h.s.delve!.missed, { p0: 0, p1: 0, p2: 1 }, 'as before that vote');
});
