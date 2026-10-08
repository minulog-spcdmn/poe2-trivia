import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  delveLockout,
  delveRules,
  delveTimer,
  fellAt,
  findOn,
  findRules,
  livesOf,
  veilSeconds,
} from '../src/lib/delve.ts';
import { ActionError, Engine, RARE_GROUPS, RARE_MAX_OPTIONS, activeRules, createGame, isFake, lastPicks, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';

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
    /** Together: the host's time-out, which costs everyone standing who hasn't answered. */
    timeOut() {
      h.pick();
      h.clockIn();
      h.act({ type: 'answer', index: null });
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
  h.timeOut();
  for (const p of h.s.players) assert.equal(livesOf(h.s, p.id), DELVE_LIVES - 1);
});

test('questions take their shape from the depth', () => {
  for (const depth of [1, 13, 25, 61, 100]) {
    const h = delve(['Ash']);
    h.s = { ...h.s, round: depth };
    h.pick();
    const q = h.s.question!;
    assert.equal(q.options.length, delveRules(depth).options, `options at ${depth}`);
    // From depth 25 the art of a name question burns in, paced by Delve's own timer.
    const veil = delveRules(depth).veil;
    if (veil && q.mode === 'name') {
      assert.equal(q.veil!.size, veil.size);
      assert.equal(q.veil!.seconds, veilSeconds(delveTimer(depth), veil.share, veil.size));
      // On the shortest clocks it burns in faster than its share.
      if (depth === 100) assert.ok(q.veil!.seconds < delveTimer(depth) * veil.share);
    } else assert.equal(q.veil, null);
    const madeUp = q.options.filter(isFake).length;
    assert.ok(madeUp <= delveRules(depth).fakes);
  }
});

test('the clock starts when the host says the art has arrived', () => {
  const h = delve(['Ash']);
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
  const h = delve(['Ash']);
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

  // Answering after the deadline from their own device.
  const id = h.active().id;
  h.pick(id);
  h.clockIn();
  const q = h.s.question!;
  h.clock.now = q.deadline! + 2000;
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, id);
  assert.equal(livesOf(h.s, id), 1);
  assert.ok(h.s.reveal!.timedOut);
});

test('alone, the run ends with the third life, at the depth where it went', () => {
  const h = delve(['Ash'], { host: null });
  h.playOut({ p0: [true, false, true, false, true, true, false] });
  assert.deepEqual(h.s.winners, []);
  assert.equal(fellAt(h.s, 'p0'), 7);
  assert.equal(h.s.round, 7);
  assert.deepEqual(h.s.delve!.losses.p0, [2, 4, 7]);
});

test('no deathmatch and no target: a run only ends when the lives do', () => {
  const h = delve(['Ash']);
  for (let i = 0; i < 20; i++) h.turn(true);
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.deathmatch, null);
  assert.equal(h.s.round, 21);
});

test('nobody skips a turn in Delve, the host included', () => {
  const h = delve(['Ash', 'Brea']);
  for (const from of ['p0', 'p1', null]) assert.throws(() => h.act({ type: 'skip' }, from), /can't be skipped/);
});

test('nothing is ever picked for anyone: the cards wait for as long as it takes', () => {
  const h = delve(['Ash']);
  const offered = h.s.offered;
  h.clock.now += 3_600_000;
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual(h.s.offered, offered);
  assert.throws(() => h.act({ type: 'expire' }, 'p0'));
  // Away all that while costs nothing either.
  h.act({ type: 'connection', playerId: 'p0', connected: false });
  h.act({ type: 'expire' });
  assert.equal(livesOf(h.s, 'p0'), DELVE_LIVES);
  assert.equal(h.s.phase, 'choosing');
});

test('on one device, Delve is a run alone: a run together is refused', () => {
  assert.throws(() => delve(['Ash', 'Brea'], { host: null }), /online/);
  assert.equal(delve(['Ash'], { host: null }).s.phase, 'choosing');
  // Online, two make a co-op run.
  assert.equal(delve(['Ash', 'Brea']).s.phase, 'choosing');
});

test("alone, the host's own question keeps its clock through a reload", () => {
  const h = delve(['Ash']);
  h.pick();
  h.clockIn();
  const q = h.s.question!;
  h.act({ type: 'resumed' });
  assert.equal(h.s.phase, 'question');
  assert.deepEqual(h.s.question, q);
});

test('three different categories every turn, locked out as long as the depth says', () => {
  const h = delve(['Ash'], { host: null, seed: 3 });
  for (let i = 0; i < 200; i++) {
    const offered = h.s.offered;
    assert.equal(new Set(offered).size, 3, `three cards at depth ${h.s.round}`);
    const locked = lastPicks(h.active().recent, delveLockout(h.s.round));
    assert.ok(offered.every((c) => !locked.includes(c)), `a locked category on offer at depth ${h.s.round}`);
    // A find's card asks under its deeper depth's rules.
    const find = findOn(h.s, offered[i % 3]);
    h.act({ type: 'pick', category: offered[i % 3] });
    // (A tablet, too few to fill ten, is asked with fewer: RARE_MAX_OPTIONS.)
    const asked = (find ? findRules(find, h.s.round) : delveRules(h.s.round)).options;
    const tablet = h.engine.byId.get(h.s.question!.itemId)!.group in RARE_GROUPS;
    assert.equal(h.s.question!.options.length, tablet ? Math.min(asked, RARE_MAX_OPTIONS) : asked);
    h.clockIn();
    h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt });
    h.act({ type: 'next' });
  }
  assert.equal(h.s.round, 201);
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
  for (let i = 0; i < DELVE_LIVES; i++) h.timeOut();
  assert.equal(h.s.phase, 'over');
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
  h.timeOut();
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

test('deep down, "find the art" pictures burn in too, more often the deeper', async () => {
  const { delveTileVeil, tileVeilSize } = await import('../src/lib/delve.ts');
  const share = (depth: number) => {
    let art = 0;
    let veiled = 0;
    for (let seed = 1; art < 300 && seed < 4000; seed++) {
      const h = delve(['Ash'], { seed });
      h.s = { ...h.s, round: depth };
      h.pick();
      const q = h.s.question!;
      if (q.mode !== 'art') continue;
      art++;
      if (q.veil) {
        veiled++;
        assert.equal(q.veil.size, tileVeilSize(delveRules(depth).veil!.size));
        assert.equal(q.veil.seconds, veilSeconds(delveTimer(depth), delveRules(depth).veil!.share, q.veil.size, true));
      }
    }
    return veiled / art;
  };
  assert.equal(share(24), 0);
  assert.equal(share(200), 1);
  const mid = share(74);
  assert.ok(Math.abs(mid - delveTileVeil(74)) < 0.1, `about half at depth 74, got ${mid}`);
});

test('grayscale is rolled for each question, as often as the depth says, and the art is prepared that way', async () => {
  const { grayscaleFor } = await import('../src/lib/game.ts');
  const share = (depth: number) => {
    let gray = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const h = delve(['Ash'], { seed });
      h.s = { ...h.s, round: depth };
      h.pick();
      const q = h.s.question!;
      assert.equal(grayscaleFor(h.s), q.gray ? 'all' : 'off');
      if (!delveRules(depth).grayChance) assert.equal(q.gray, undefined, `no roll at ${depth}`);
      if (q.gray) gray++;
    }
    return gray / n;
  };
  assert.equal(share(40), 0);
  const mid = share(65);
  assert.ok(Math.abs(mid - delveRules(65).grayChance!) < 0.1, `about half at depth 65, got ${mid}`);
  assert.equal(share(100), 1);
});
