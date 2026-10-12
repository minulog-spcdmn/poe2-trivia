// Regressions from a review of the Delve engine: a guest's late answer with a
// flare still to burn, and a question the host's reload holds still (its
// clock carries on with the time it had left; what was answered on it
// stands).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_IDLE_ROUNDS,
  DELVE_LIVES,
  DELVE_RESUME_CLOCK_MS,
  DELVE_RESUME_GRACE_MS,
  DELVE_RESUME_MIN_MS,
  FLARE_MS,
  awaitingReturn,
  expectedVoters,
  findOn,
  flaresOf,
  inventoryOf,
  livesOf,
  pausedUsed,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, ActionError, Engine, createGame, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0 };
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

// ---- 2. a question the host's reload holds still ------------------------------

/** The host reloads at `at` (its last moment before it), cutting off `cut`. */
const reload = (h: ReturnType<typeof run>, cut = ['p2'], at?: number) => {
  for (const id of cut) h.act({ type: 'connection', playerId: id, connected: false });
  h.act({ type: 'resumed', ...(at === undefined ? {} : { at }) });
};
/** The art is back on screens, so the clock carries on. */
const carryOn = (h: ReturnType<typeof run>) => h.act({ type: 'clock', askedAt: h.s.question!.askedAt });

test('together: a reload holds the clock still, and nobody can answer meanwhile', () => {
  const h = run(3);
  const q = h.ask();
  h.clock.now += 4000;
  reload(h, ['p2'], h.clock.now);
  const held = h.s.question!;
  assert.equal(h.s.phase, 'question');
  assert.equal(held.askedAt, q.askedAt, 'the same question');
  assert.equal(held.deadline, null);
  assert.equal(held.clockAt, undefined);
  assert.deepEqual(held.paused, { clockAt: q.clockAt, at: h.clock.now, left: q.deadline! - q.clockAt! - 4000 });
  silently(() => h.answer('p0', right(q)), /early/);
  silently(() => h.act({ type: 'answer', index: null, askedAt: q.askedAt }), /early/);
  // Long after its old deadline, it is still there.
  h.clock.now = q.deadline! + 60_000;
  assert.equal(h.s.phase, 'question');
});

test('together: the clock carries on with the time it had left, everything timed on it moved on with it', () => {
  const h = run(3);
  const q = h.ask();
  const span = q.deadline! - q.clockAt!;
  h.clock.now += 3000;
  h.answer('p1', wrongs(q)[0]);
  h.clock.now += 2000;
  reload(h, ['p2'], h.clock.now);
  assert.equal(pausedUsed(h.s.question!.paused!), 5000, 'what had gone of it, for the answer times');
  h.clock.now += 45_000;
  carryOn(h);
  const r = h.s.question!;
  assert.equal(r.paused, undefined);
  assert.equal(r.deadline, h.clock.now + span - 5000);
  assert.equal(r.clockAt, h.clock.now - 5000, '5 s of it had gone');
  assert.equal(r.struck![0].at, r.clockAt! + 3000, 'the wrong answer, 3 s in');
  h.answer('p0', right(q));
  assert.equal(h.s.reveal!.correct, true);
});

test('together: what was answered before the reload stands: lives, wards and streaks', () => {
  const h = run(3);
  h.give('p1', { wards: 1, flares: 1 });
  h.edit((c) => (c.players[0].streak = 3));
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  h.answer('p0', wrongs(q)[1]);
  reload(h);
  carryOn(h);
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1'), livesOf(h.s, 'p2')], [DELVE_LIVES - 1, DELVE_LIVES, DELVE_LIVES]);
  assert.deepEqual(inventoryOf(h.s, 'p1'), { ...NONE, flares: 1 }, 'the ward stays broken');
  assert.equal(h.s.players[0].streak, 0);
  assert.deepEqual(h.s.question!.struck!.map((x) => x.by), ['p1', 'p0']);
  silently(() => h.answer('p1', wrongs(q)[2] ?? right(q)), /already answered/);
});

test('together: a player who perished before the reload stays fallen, and is not waited for', () => {
  const h = run(3);
  h.edit((c) => (c.delve!.losses.p1 = Array(DELVE_LIVES - 1).fill(1)));
  h.give('p1', { flares: 2 });
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  reload(h, ['p1', 'p2']);
  assert.equal(livesOf(h.s, 'p1'), 0);
  assert.deepEqual(inventoryOf(h.s, 'p1'), NONE);
  assert.deepEqual(h.s.delve!.excused, ['p2']);
});

test('a reload late on the clock leaves at least DELVE_RESUME_MIN_MS when it carries on', () => {
  const h = run(3);
  const q = h.ask();
  h.clock.now = q.deadline! - 1000;
  reload(h, ['p2'], h.clock.now);
  assert.equal(h.s.question!.paused!.left, DELVE_RESUME_MIN_MS);
  h.clock.now = q.deadline! + 30_000;
  carryOn(h);
  assert.equal(h.s.question!.deadline, h.clock.now + DELVE_RESUME_MIN_MS);
});

test('the time added to reach DELVE_RESUME_MIN_MS goes on the deadline only: what had gone of the clock stays gone', () => {
  const h = run(3);
  const q = h.ask();
  h.clock.now = q.deadline! - 1500;
  h.answer('p1', wrongs(q)[0]);
  h.clock.now += 1000;
  reload(h, ['p2'], h.clock.now);
  h.clock.now += 30_000;
  carryOn(h);
  const r = h.s.question!;
  assert.equal(r.deadline, h.clock.now + DELVE_RESUME_MIN_MS);
  // An Azurite Vein's fast window, timed from clockAt, doesn't open again.
  assert.equal(h.clock.now - r.clockAt!, q.deadline! - q.clockAt! - 500);
  assert.equal(r.struck![0].at, h.clock.now - 1000, 'the wrong answer stays in the past');
});

test("without the host's last moment, the clock stops as the room reopens; one out of range is kept to the clock's", () => {
  const h = run(3);
  const q = h.ask();
  h.clock.now += 6000;
  reload(h);
  assert.equal(h.s.question!.paused!.left, q.deadline! - h.clock.now);
  const g = run(3);
  const gq = g.ask();
  g.clock.now += 2000;
  reload(g, ['p2'], gq.clockAt! - 50_000);
  assert.equal(g.s.question!.paused!.left, gq.deadline! - gq.clockAt!, 'never before the clock started');
  const k = run(3);
  const kq = k.ask();
  k.clock.now += 2000;
  reload(k, ['p2'], k.clock.now + 50_000);
  assert.equal(k.s.question!.paused!.left, kq.deadline! - k.clock.now, 'never after the room reopened');
});

test('a second reload while the clock is held keeps the time it had left', () => {
  const h = run(3);
  const q = h.ask();
  h.clock.now += 4000;
  reload(h, ['p2'], h.clock.now);
  const paused = structuredClone(h.s.question!.paused);
  h.clock.now += 20_000;
  reload(h, ['p1', 'p2'], h.clock.now);
  assert.deepEqual(h.s.question!.paused, paused);
  assert.equal(h.s.question!.askedAt, q.askedAt);
});

test('a flare burnt before the reload keeps its time, and burns no second time', () => {
  const h = run(3);
  h.give('p2', { flares: 2 });
  const q = h.ask();
  h.clock.now = q.deadline!;
  h.act({ type: 'flare', askedAt: q.askedAt });
  const f = h.s.question!;
  assert.equal(f.deadline, q.deadline! + FLARE_MS);
  h.clock.now += 1000;
  reload(h, ['p2'], h.clock.now);
  assert.equal(h.s.question!.paused!.left, FLARE_MS - 1000);
  h.clock.now += 30_000;
  carryOn(h);
  const r = h.s.question!;
  assert.equal(r.flaredAt, h.clock.now - 1000, 'burnt 1 s before the clock stopped');
  assert.equal(r.deadline, h.clock.now + FLARE_MS - 1000);
  assert.equal(flaresOf(h.s, 'p2'), 1);
});

test('alone: a guest cut off by the reload gets the same question back with its time left, and a miss still costs', () => {
  const h = solo();
  h.give('p0', { flares: 1 });
  const q = h.ask();
  h.clock.now += 5000;
  reload(h, ['p0'], h.clock.now);
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.paused!.left, q.deadline! - q.clockAt! - 5000);
  h.act({ type: 'join', playerId: 'p0', name: 'back', returning: true }, 'p0');
  carryOn(h);
  h.answer('p0', wrong(q));
  assert.equal(h.s.reveal!.correct, false);
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES - 1);
  assert.equal(flaresOf(h.s, 'p0'), 1);
});

test("nobody cut off (the host alone, or everyone else fallen): the clock runs on as it was", () => {
  const h = run(1);
  const q = h.ask();
  h.clock.now += 5000;
  reload(h, [], h.clock.now - 3000);
  assert.equal(h.s.question!.deadline, q.deadline);
  assert.equal(h.s.question!.paused, undefined);
  const g = run(2);
  g.edit((c) => (c.delve!.losses.p1 = Array(DELVE_LIVES).fill(1)));
  const gq = g.ask();
  reload(g, ['p1']);
  assert.equal(g.s.question!.deadline, gq.deadline);
});

test("a question whose clock hadn't started is kept as it was, to start as usual", () => {
  const h = run(3);
  h.act({ type: 'pick', category: h.s.offered.find((c) => !findOn(h.s, c))! });
  const q = h.s.question!;
  reload(h);
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.askedAt, q.askedAt);
  assert.equal(h.s.question!.paused, undefined);
  h.clock.now += 20_000;
  carryOn(h);
  assert.equal(h.s.question!.clockAt, h.clock.now, 'its clock starts now, from the full time');
});

test("a question held still whose art won't load again can be asked again; what it cost stands", () => {
  const h = run(3);
  const q = h.ask();
  h.answer('p1', wrongs(q)[0]);
  reload(h);
  h.act({ type: 'reask' });
  const n = h.s.question!;
  assert.notEqual(n.itemId, q.itemId);
  assert.equal(n.paused, undefined);
  assert.equal(n.struck, undefined);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
});

test('only those cut off who could still answer hold the clock still', () => {
  // Cut off after answering wrong: nothing left for them to give, so the clock runs on.
  const h = run(3);
  const q = h.ask();
  h.answer('p2', wrongs(q)[0]);
  reload(h, ['p2']);
  assert.equal(h.s.question!.deadline, q.deadline);
  assert.equal(h.s.question!.paused, undefined);
  assert.equal(awaitingReturn(h.s, h.clock.now), false);
  // Idle, and cut off: a vote doesn't wait for them, nor does the clock.
  const idle = run(3);
  idle.edit((c) => (c.delve!.missed = { p2: DELVE_IDLE_ROUNDS }));
  const iq = idle.ask();
  reload(idle, ['p2']);
  assert.equal(idle.s.question!.deadline, iq.deadline);
  // One of two cut off still to answer: it holds still, and waits for that one only.
  const g = run(3);
  const gq = g.ask();
  g.answer('p2', wrongs(gq)[0]);
  reload(g, ['p1', 'p2']);
  assert.ok(g.s.question!.paused);
  assert.equal(awaitingReturn(g.s, g.clock.now), true);
  g.act({ type: 'join', playerId: 'p1', name: 'back', returning: true }, 'p1');
  assert.equal(awaitingReturn(g.s, g.clock.now), false, 'p2, still away, has answered');
});

test('the clock waits DELVE_RESUME_CLOCK_MS at most for those cut off, while a vote waits the whole grace', () => {
  const h = run(3);
  h.ask();
  reload(h, ['p2']);
  assert.equal(awaitingReturn(h.s, h.clock.now), true);
  h.clock.now += DELVE_RESUME_CLOCK_MS - 1;
  assert.equal(awaitingReturn(h.s, h.clock.now), true);
  h.clock.now += 1;
  assert.equal(awaitingReturn(h.s, h.clock.now), false);
  assert.ok(DELVE_RESUME_CLOCK_MS < DELVE_RESUME_GRACE_MS);
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1', 'p2'], 'the vote still waits for them');
});
