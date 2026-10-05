import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  DELVE_PICK_MS,
  DELVE_REJOIN_MS,
  DELVE_RESUME_GRACE_MS,
  compareDelvers,
  delveLockout,
  delveRules,
  delveTimer,
  fellAt,
  livesOf,
  standingIds,
} from '../src/lib/delve.ts';
import { ActionError, Engine, activeRules, createGame, isFake, lastPicks, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Settings Delve must ignore: a target of 1, no timer, Eternal. */
const LEFTOVERS: Settings = { targetScore: 1, timer: 0, difficulty: 'eternal', mode: 'delve', public: false, locked: false };

/**
 * A Delve run with a controllable clock. `host`: the host's player id online
 * (p0 by default), or null for hot-seat. Every helper acts as the trusted host.
 */
function delve(names: string[], opts: { host?: string | null; seed?: number; start?: boolean } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 7), now: () => clock.now, fakes });
  const host = opts.host === undefined ? 'p0' : opts.host;
  let s: GameState = createGame(host, LEFTOVERS);
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, host === null ? null : `p${i}`)));
  if (opts.start !== false) s = engine.apply(s, { type: 'start' }, host);
  const h = {
    engine,
    clock,
    get s() {
      return s;
    },
    set s(v: GameState) {
      s = v;
    },
    act(a: Action, from: string | null = null) {
      s = engine.apply(s, a, from);
      return s;
    },
    active: () => s.players[s.turn],
    pick: (from: string | null = null) => h.act({ type: 'pick', category: s.offered[0] }, from),
    clockIn: () => h.act({ type: 'clock', askedAt: s.question!.askedAt }),
    /** One whole turn for whoever is on: pick, clock, answer, move on. */
    turn(ok: boolean) {
      h.pick();
      h.clockIn();
      const q = s.question!;
      h.act({ type: 'answer', index: ok ? right(q) : wrongIdx(q), askedAt: q.askedAt });
      h.act({ type: 'next' });
    },
    /** Plays turns from a script per player id (right by default) until the game is over. */
    playOut(plan: Record<string, boolean[]>, limit = 500) {
      for (let i = 0; s.phase !== 'over' && i < limit; i++) h.turn(plan[h.active().id]?.shift() ?? true);
      assert.equal(s.phase, 'over', 'the run should have ended');
    },
  };
  return h;
}

const throwsSilently = (fn: () => unknown, message?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent && (!message || message.test(e.message)));

test('delve is a mode the host can pick, and the other settings are kept for later', () => {
  const engine = new Engine(items);
  let s = createGame('p0', { ...LEFTOVERS, mode: 'turns' });
  s = engine.apply(s, { type: 'settings', settings: { mode: 'delve' } }, 'p0');
  assert.equal(s.settings.mode, 'delve');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns' } }, 'p0');
  assert.deepEqual({ ...s.settings }, { ...LEFTOVERS, mode: 'turns' });
  s = engine.apply(s, { type: 'settings', settings: { mode: 'sprint' as never } }, 'p0');
  assert.equal(s.settings.mode, 'turns');
});

test('a run starts at depth 1 with three lives each and the whole item pool', () => {
  const h = delve(['Ash', 'Brea'], { start: false });
  h.s = { ...h.s, used: ['x', 'y'] };
  h.act({ type: 'start' }, 'p0');
  assert.equal(h.s.round, 1);
  assert.deepEqual(h.s.used, []);
  for (const p of h.s.players) assert.equal(livesOf(h.s, p.id), DELVE_LIVES);
  assert.deepEqual(activeRules(h.s), delveRules(1), 'Eternal is ignored');
  h.turn(false);
  assert.equal(livesOf(h.s, h.s.players[0].id), DELVE_LIVES - 1);
});

test('questions take their shape from the depth', () => {
  for (const depth of [1, 13, 25, 61]) {
    const h = delve(['Ash']);
    h.s = { ...h.s, round: depth };
    h.pick();
    const q = h.s.question!;
    assert.equal(q.options.length, delveRules(depth).options, `options at ${depth}`);
    // From depth 25 the art of a name question burns in, paced by Delve's own timer.
    const veil = delveRules(depth).veil;
    if (veil && q.mode === 'name') {
      assert.equal(q.veil!.size, veil.size);
      assert.equal(q.veil!.seconds, delveTimer(depth) * veil.share);
    } else assert.equal(q.veil, null);
    const madeUp = q.options.filter(isFake).length;
    assert.ok(madeUp <= delveRules(depth).fakes);
  }
});

test('the clock starts when the host says the art has arrived', () => {
  const h = delve(['Ash', 'Brea']);
  const id = h.active().id;
  h.pick(id);
  const q = h.s.question!;
  assert.equal(q.deadline, null);
  const now = h.clock.now;
  throwsSilently(() => h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, id), /early/);
  throwsSilently(() => h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, null), /early/);
  assert.throws(() => h.act({ type: 'clock', askedAt: q.askedAt }, id));
  h.act({ type: 'clock', askedAt: q.askedAt + 1 });
  assert.equal(h.s.question!.deadline, null, 'a stale clock does nothing');
  h.act({ type: 'clock', askedAt: q.askedAt, at: now + 60_000 });
  assert.equal(h.s.question!.clockAt, now + 1000, 'at most a second ahead');
  assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, delveTimer(1) * 1000);
  const deadline = h.s.question!.deadline;
  h.clock.now += 500;
  h.act({ type: 'clock', askedAt: q.askedAt });
  assert.equal(h.s.question!.deadline, deadline, 'a second clock changes nothing');

  const g = delve(['Ash']);
  g.pick();
  g.act({ type: 'clock', askedAt: g.s.question!.askedAt, at: g.clock.now - 5000 });
  assert.equal(g.s.question!.clockAt, g.clock.now, 'never in the past');
});

test('wrong answers, giving up and answering late each cost a life; right ones score', () => {
  const h = delve(['Ash', 'Brea']);
  const lives = () => livesOf(h.s, h.active().id);
  h.pick();
  h.clockIn();
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt });
  assert.equal(lives(), 3);
  assert.equal(h.active().score, 1);
  h.act({ type: 'next' });

  h.pick();
  h.act({ type: 'answer', index: null, askedAt: h.s.question!.askedAt });
  assert.equal(lives(), 2, 'giving up (or running out of time) costs a life, even before the clock');
  h.act({ type: 'next' });

  // Back to the first player, answering after the deadline from their own device.
  const id = h.active().id;
  h.pick(id);
  h.clockIn();
  const q = h.s.question!;
  h.clock.now = q.deadline! + 2000;
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, id);
  assert.equal(livesOf(h.s, id), 2);
  assert.ok(h.s.reveal!.timedOut);
});

test('alone, the run ends with the third life, at the depth where it went', () => {
  const h = delve(['Ash'], { host: null });
  h.playOut({ p0: [true, false, true, false, true, true, false] });
  assert.deepEqual(h.s.winners, []);
  assert.equal(fellAt(h.s, 'p0'), 7);
  assert.equal(h.s.round, 7);
  assert.deepEqual(h.s.delve!.losses.p0, [2, 4, 7]);
  assert.equal(h.s.delve!.lastStanding, null);
});

test('together, the last one standing is named at the end of the round and delves on alone', () => {
  const h = delve(['Ash', 'Brea']);
  h.playOut({ p0: [true, true, true, true, true, false, false, false], p1: [false, false, false] });
  assert.deepEqual(h.s.delve!.lastStanding, { id: 'p0', depth: 3 });
  assert.deepEqual(h.s.delve!.losses.p0, [6, 7, 8]);
  assert.deepEqual(h.s.winners, ['p0']);
});

test('a fall on the same depth goes to whoever lost their earlier lives deeper; equal runs share', () => {
  const tie = delve(['Ash', 'Brea']);
  tie.playOut({ p0: [false, false, true, true, false], p1: [true, true, false, false, false] });
  assert.deepEqual(tie.s.delve!.losses, { p0: [1, 2, 5], p1: [3, 4, 5] });
  assert.deepEqual(tie.s.winners, ['p1']);
  assert.equal(tie.s.delve!.lastStanding, null, 'nobody stood alone');

  const same = delve(['Ash', 'Brea']);
  same.playOut({ p0: [false, false, false], p1: [false, false, false] });
  assert.deepEqual([...same.s.winners].sort(), ['p0', 'p1']);
});

test('no deathmatch and no target: a run only ends when the lives do', () => {
  const h = delve(['Ash', 'Brea']);
  for (let i = 0; i < 20; i++) h.turn(true);
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.deathmatch, null);
  assert.equal(h.s.round, 11);
});

test('nobody skips a turn in Delve, the host included', () => {
  const h = delve(['Ash', 'Brea']);
  for (const from of ['p0', 'p1', null]) assert.throws(() => h.act({ type: 'skip' }, from), /no skipping/);
});

test('the time to pick: a card for those who are here, a life from those who are not', () => {
  const h = delve(['Ash', 'Brea', 'Cyd']);
  assert.equal(h.s.delve!.pickBy, h.clock.now + DELVE_PICK_MS);
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'choosing', 'too early: nothing happens');
  assert.throws(() => h.act({ type: 'expire' }, 'p1'));

  const offered = h.s.offered;
  const first = h.active().id;
  h.clock.now += DELVE_PICK_MS;
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'question');
  assert.ok(offered.includes(h.s.question!.category));
  assert.equal(livesOf(h.s, first), 3, 'hesitating costs nothing');
  assert.equal(h.s.delve!.pickBy, null);
  throwsSilently(() => h.act({ type: 'pick', category: offered[0] }, first), /late/);
  h.clockIn();
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt });
  h.act({ type: 'next' });

  const gone = h.active();
  h.act({ type: 'connection', playerId: gone.id, connected: false });
  h.s.players[h.s.turn].streak = 4;
  h.clock.now = h.s.delve!.pickBy!;
  h.act({ type: 'expire' });
  assert.equal(livesOf(h.s, gone.id), 2);
  assert.equal(h.s.reveal, null);
  assert.equal(h.s.phase, 'choosing');
  assert.notEqual(h.active().id, gone.id);
  assert.equal(h.s.players.find((p) => p.id === gone.id)!.streak, 0);
});

test('nobody waits on a clock to pick alone or on one device', () => {
  assert.equal(delve(['Ash', 'Brea'], { host: null }).s.delve!.pickBy, null);
  assert.equal(delve(['Ash']).s.delve!.pickBy, null);
});

test('coming back late to pick gives a few seconds more, once per turn', () => {
  const h = delve(['Ash', 'Brea']);
  const id = h.active().id;
  h.act({ type: 'connection', playerId: id, connected: false });
  h.clock.now = h.s.delve!.pickBy! - 3000;
  h.act({ type: 'connection', playerId: id, connected: true });
  assert.equal(h.s.delve!.pickBy, h.clock.now + DELVE_REJOIN_MS);
  const extended = h.s.delve!.pickBy;
  h.clock.now += DELVE_REJOIN_MS - 1000;
  h.act({ type: 'connection', playerId: id, connected: false });
  h.act({ type: 'connection', playerId: id, connected: true });
  assert.equal(h.s.delve!.pickBy, extended, 'only once per turn');
});

test('a disconnected player keeps their turns, and a room going quiet ends nothing', () => {
  const h = delve(['Ash', 'Brea']);
  const other = h.s.players.find((p) => p.id !== h.active().id)!.id;
  h.act({ type: 'connection', playerId: other, connected: false });
  h.turn(true);
  assert.equal(h.active().id, other);
  for (const p of h.s.players) h.act({ type: 'connection', playerId: p.id, connected: false });
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.delve!.lastStanding, null);
});

test('after a host reload, a guest question is set aside and the cut-off players get a grace', () => {
  const h = delve(['Ash', 'Brea', 'Cyd']);
  while (h.active().id === 'p0') h.turn(true);
  const guest = h.active();
  const offered = h.s.offered;
  h.pick(guest.id);
  const voided = h.s.question!;
  const lives = livesOf(h.s, guest.id);
  for (const p of h.s.players) if (p.id !== 'p0') h.act({ type: 'connection', playerId: p.id, connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.question, null);
  assert.deepEqual(h.s.offered, offered);
  assert.deepEqual(h.active().recent, guest.recent);
  assert.ok(voided.options.filter((o) => !isFake(o)).every((o) => h.s.used.includes(o)));
  assert.equal(livesOf(h.s, guest.id), lives);
  assert.deepEqual([...h.s.delve!.excused].sort(), ['p1', 'p2']);
  assert.ok(h.s.delve!.pickBy! >= h.clock.now + DELVE_RESUME_GRACE_MS);
  throwsSilently(() => h.act({ type: 'answer', index: right(voided), askedAt: voided.askedAt }, guest.id), /late/);

  const other = guest.id === 'p1' ? 'p2' : 'p1';
  h.act({ type: 'connection', playerId: other, connected: true });
  assert.deepEqual(h.s.delve!.excused, [guest.id]);

  h.clock.now = h.s.delve!.pickBy!;
  h.act({ type: 'expire' });
  assert.equal(livesOf(h.s, guest.id), lives - 1, 'after the grace, a missed turn costs a life');
});

test("the host's own question keeps its clock through a reload", () => {
  const h = delve(['Ash', 'Brea']);
  while (h.active().id !== 'p0') h.turn(true);
  h.pick();
  h.clockIn();
  const q = h.s.question!;
  h.act({ type: 'connection', playerId: 'p1', connected: false });
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'question');
  assert.deepEqual(h.s.question, q);
});

test('a kicked player leaves the run, and whoever is left can stand alone', () => {
  const h = delve(['Ash', 'Brea', 'Cyd']);
  while (h.active().id === 'p0') h.turn(true);
  const kicked = h.active().id;
  h.turn(false);
  assert.ok(h.s.delve!.losses[kicked]);
  h.act({ type: 'remove', playerId: kicked }, 'p0');
  assert.equal(h.s.delve!.losses[kicked], undefined);
  assert.ok(!standingIds(h.s).includes(kicked));

  const two = delve(['Ash', 'Brea'], { host: null });
  const a = two.active().id;
  const b = two.s.players.find((p) => p.id !== a)!.id;
  two.pick();
  two.act({ type: 'remove', playerId: b }, null);
  two.clockIn();
  two.act({ type: 'answer', index: right(two.s.question!), askedAt: two.s.question!.askedAt });
  two.act({ type: 'next' });
  assert.deepEqual(two.s.delve!.lastStanding, { id: a, depth: 1 });

  const solo = delve(['Ash', 'Brea'], { host: null });
  const on = solo.active().id;
  solo.pick();
  solo.act({ type: 'remove', playerId: on }, null);
  assert.equal(solo.s.phase, 'choosing');
  assert.notEqual(solo.active().id, on);
});

test('three different categories every turn, locked out as long as the depth says', () => {
  const h = delve(['Ash'], { host: null, seed: 3 });
  for (let i = 0; i < 200; i++) {
    const offered = h.s.offered;
    assert.equal(new Set(offered).size, 3, `three cards at depth ${h.s.round}`);
    const locked = lastPicks(h.active().recent, delveLockout(h.s.round));
    assert.ok(offered.every((c) => !locked.includes(c)), `a locked category on offer at depth ${h.s.round}`);
    h.act({ type: 'pick', category: offered[i % 3] });
    assert.equal(h.s.question!.options.length, delveRules(h.s.round).options);
    h.clockIn();
    h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt });
    h.act({ type: 'next' });
  }
  assert.equal(h.s.round, 201);
});

test('each depth gives every player still standing exactly one turn', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const names = ['Ash', 'Brea', 'Cyd', 'Dov', 'Eli'].slice(0, (seed % 5) + 1);
    const h = delve(names, { host: null, seed });
    const luck = seeded(seed * 31);
    let round = h.s.round;
    let expected = new Set(standingIds(h.s));
    let played = new Set<string>();
    for (let i = 0; h.s.phase !== 'over' && i < 2000; i++) {
      if (h.s.round !== round) {
        assert.deepEqual([...played].sort(), [...expected].sort(), `depth ${round}, seed ${seed}`);
        round = h.s.round;
        expected = new Set(standingIds(h.s));
        played = new Set();
      }
      const id = h.active().id;
      assert.ok(livesOf(h.s, id) > 0, 'a fallen player never plays');
      assert.ok(!played.has(id), 'two turns in one depth');
      played.add(id);
      h.turn(luck() < 0.85);
    }
    assert.equal(h.s.phase, 'over');
  }
});

test('a question that failed to load can be asked again, but not once its clock runs', () => {
  const h = delve(['Ash', 'Brea']);
  h.pick();
  const first = h.s.question!;
  h.act({ type: 'reask' });
  const second = h.s.question!;
  assert.notEqual(second.askedAt, first.askedAt);
  assert.equal(second.category, first.category);
  assert.equal(second.deadline, null);
  assert.equal(h.s.round, 1);
  throwsSilently(() => h.act({ type: 'answer', index: 0, askedAt: first.askedAt }, h.active().id), /late/);
  h.clockIn();
  throwsSilently(() => h.act({ type: 'reask' }), /clock/);
});

test('play again starts a fresh run for everyone, the fallen and the watchers included', () => {
  const h = delve(['Ash', 'Brea']);
  h.act({ type: 'join', playerId: 'w', name: 'Watcher' }, 'w');
  assert.equal(h.s.spectators!.length, 1);
  h.playOut({ p0: [false, false, false], p1: [false, false, false] });
  h.act({ type: 'restart', play: true }, 'p0');
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.players.length, 3);
  assert.equal(h.s.round, 1);
  assert.deepEqual(h.s.delve!.losses, {});
  assert.deepEqual(h.s.used, []);
  for (const p of h.s.players) assert.equal(livesOf(h.s, p.id), 3);
});

test('guests see nothing of a question until its clock starts', () => {
  const h = delve(['Ash', 'Brea'], { seed: 11 });
  h.turn(false);
  h.pick();
  const before = publicView(h.s).question!;
  assert.equal(before.itemId, '');
  assert.deepEqual(before.options, []);
  assert.ok(before.labels.every((l) => l === null));
  assert.equal(before.labels.length, h.s.question!.options.length);
  assert.equal(before.prompt, null);
  assert.deepEqual(before.groups, []);
  h.clockIn();
  const after = publicView(h.s);
  assert.deepEqual(after.question!.labels, h.s.question!.labels);
  assert.equal(after.question!.prompt, h.s.question!.prompt);
  assert.equal(after.question!.deadline, h.s.question!.deadline);
  assert.deepEqual(after.delve, h.s.delve, 'lives and depths are public');
});

test('a game saved before Delve plays on as before', () => {
  const engine = new Engine(items, { rng: seeded(5) });
  let s = createGame('p0', { ...LEFTOVERS, mode: 'turns', targetScore: 2 });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  delete s.delve;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt }, 'p0');
  assert.equal(s.players[0].score, 1);
  s = engine.apply(s, { type: 'next' }, 'p0');
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(s.phase, 'choosing');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt }, 'p0');
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.equal(s.phase, 'over', 'the target still ends a turns game');
  assert.equal(s.delve ?? null, null);
});

test('hot-seat with several players plays out to a winner by depth', () => {
  const h = delve(['Ash', 'Brea', 'Cyd'], { host: null, seed: 19 });
  const luck = seeded(77);
  for (let i = 0; h.s.phase !== 'over' && i < 2000; i++) h.turn(luck() < 0.8);
  assert.equal(h.s.phase, 'over');
  assert.ok(h.s.winners.length >= 1);
  for (const w of h.s.winners) for (const p of h.s.players) assert.ok(compareDelvers(h.s, w, p.id) >= 0);
});
