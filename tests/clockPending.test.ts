// A question's clock waits, in every mode: it is asked with no deadline, and
// starts only when the host says so ('clock', once the art has reached those
// answering). Until then nobody sees any of it nor answers it, the host
// included (docs/far-links.md, phase 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ActionError, Engine, RACE_DEFAULT_TIMER, clockMs, clockRuns, createGame, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { isGroupRun, questionTimer } from '../src/lib/delve.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const tooEarly = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent && /Too early/.test(e.message));

/** A started game of p0 (the host) and p1 (or `ids`) in `settings`, on a clock the test moves. */
function room(settings: Partial<Settings>, opts: { autoClock?: boolean; seed?: number; ids?: string[] } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 3), now: () => clock.now, fakes, autoClock: opts.autoClock });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 16, difficulty: 'cruel', mode: 'turns', public: false, locked: false, ...settings });
  for (const id of opts.ids ?? ['p0', 'p1']) s = engine.apply(s, { type: 'join', playerId: id, name: id.toUpperCase() }, id);
  s = engine.apply(s, { type: 'start' }, 'p0');
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
    /** Whoever is on picks the first card (the host's own tooling settles a Delve vote). */
    pick() {
      const on = isGroupRun(s) ? null : s.players[s.turn].id;
      return h.act({ type: 'pick', category: s.offered[0] }, on);
    },
    /** The host starts the question's clock. */
    clockIn(at?: number) {
      return h.act({ type: 'clock', askedAt: s.question!.askedAt, ...(at === undefined ? {} : { at }) });
    },
    /** The answer from `from`, the question's id with it. */
    answer(from: string | null, index: number | null) {
      return h.act({ type: 'answer', index, askedAt: s.question!.askedAt }, from);
    },
  };
  return h;
}

test('turns: the question is asked with its clock waiting, and nobody answers it until it starts', () => {
  const h = room({ mode: 'turns', timer: 16 });
  h.clock.now += 5000;
  h.pick();
  const q = h.s.question!;
  assert.equal(q.deadline, null);
  assert.equal(q.clockAt, undefined);
  assert.equal(clockRuns(q), false);
  const on = h.s.players[h.s.turn].id;
  const off = h.s.players.find((p) => p.id !== on)!.id;
  tooEarly(() => h.answer(on, right(q)));
  tooEarly(() => h.answer(null, right(q)));
  tooEarly(() => h.answer(null, null));
  assert.equal(h.s.phase, 'question', 'not even the time-out');
  assert.throws(() => h.act({ type: 'clock', askedAt: q.askedAt }, off), /Not allowed/);
  assert.throws(() => h.act({ type: 'clock', askedAt: q.askedAt }, 'p0'), /Not allowed/, "only the host's own timing, never an action");
  h.act({ type: 'clock', askedAt: q.askedAt - 1 });
  assert.equal(h.s.question!.clockAt, undefined, 'another question: nothing starts');
  h.clock.now += 2000;
  h.clockIn();
  assert.equal(h.s.question!.clockAt, h.clock.now);
  assert.equal(h.s.question!.deadline, h.clock.now + 16_000);
  h.clock.now += 500;
  h.clockIn();
  assert.equal(h.s.question!.deadline, h.clock.now - 500 + 16_000, 'a second clock changes nothing');
  h.answer(on, right(q));
  assert.equal(h.s.reveal!.correct, true);
  // The host's own turn, alone: the same.
  const alone = room({ mode: 'turns', timer: 16 }, { ids: ['p0'] });
  alone.pick();
  tooEarly(() => alone.answer('p0', right(alone.s.question!)));
  alone.clockIn();
  alone.answer('p0', right(alone.s.question!));
  assert.equal(alone.s.reveal!.correct, true);
});

test('untimed turns: the clock starts all the same, with no deadline', () => {
  const h = room({ mode: 'turns', timer: 0 });
  h.pick();
  const q = h.s.question!;
  assert.equal(q.deadline, null);
  tooEarly(() => h.answer(h.s.players[h.s.turn].id, right(q)));
  h.clockIn();
  assert.equal(h.s.question!.clockAt, h.clock.now);
  assert.equal(h.s.question!.deadline, null, 'it never runs out');
  assert.equal(clockRuns(h.s.question), true);
  h.clock.now += 10 * 60_000;
  h.answer(h.s.players[h.s.turn].id, right(q));
  assert.equal(h.s.reveal!.correct, true, 'answered whenever');
});

test("race: the question waits for its clock; every answer before it is too early, the host's own and the time-out too", () => {
  const h = room({ mode: 'race', timer: 0 });
  const q = h.s.question!;
  assert.equal(h.s.phase, 'question');
  assert.equal(q.deadline, null);
  tooEarly(() => h.answer('p1', right(q)));
  tooEarly(() => h.answer('p1', (right(q) + 1) % q.options.length));
  tooEarly(() => h.answer('p0', right(q)));
  tooEarly(() => h.answer(null, null));
  assert.deepEqual(h.s.question!.misses, [], 'a wrong guess before it costs nothing either');
  assert.deepEqual(h.s.players.map((p) => p.score), [0, 0]);
  h.clockIn();
  assert.equal(h.s.question!.deadline, h.clock.now + RACE_DEFAULT_TIMER * 1000, 'no timer: the default');
  h.answer('p1', right(q));
  assert.equal(h.s.reveal!.winnerId, 'p1');
  h.act({ type: 'next' });
  assert.equal(h.s.question!.deadline, null, 'the next one waits again');
  assert.equal(h.s.question!.clockAt, undefined);
});

test("the clock's length in every mode: Delve's depth, a race's timer or its default, a turn's timer or none", () => {
  const cases: [Partial<Settings>, number | null][] = [
    [{ mode: 'turns', timer: 8 }, 8000],
    [{ mode: 'turns', timer: 64 }, 64_000],
    [{ mode: 'turns', timer: 0 }, null],
    [{ mode: 'race', timer: 32 }, 32_000],
    [{ mode: 'race', timer: 0 }, RACE_DEFAULT_TIMER * 1000],
  ];
  for (const [settings, ms] of cases) {
    const h = room(settings);
    if (h.s.phase === 'choosing') h.pick();
    assert.equal(clockMs(h.s), ms, JSON.stringify(settings));
    h.clock.now += 1234;
    h.clockIn(h.clock.now + 300);
    const q = h.s.question!;
    assert.equal(q.clockAt, h.clock.now + 300, 'a little ahead, as the host asks');
    assert.equal(q.deadline, ms === null ? null : q.clockAt! + ms, JSON.stringify(settings));
  }
  // Delve, alone: the depth's (a timer in the settings is the room's, for later).
  const d = room({ mode: 'delve', timer: 64 }, { ids: ['p0'] });
  d.pick();
  d.clockIn();
  assert.equal(d.s.question!.deadline, d.clock.now + questionTimer(d.s) * 1000);
  assert.equal(clockMs(d.s), questionTimer(d.s) * 1000);
  // Never more than a second ahead, nor in the past.
  const t = room({ mode: 'turns', timer: 16 });
  t.pick();
  t.clockIn(t.clock.now + 60_000);
  assert.equal(t.s.question!.clockAt, t.clock.now + 1000);
  const u = room({ mode: 'turns', timer: 16 });
  u.pick();
  u.clockIn(u.clock.now - 5000);
  assert.equal(u.s.question!.clockAt, u.clock.now);
});

test('Delve together: no answer before the clock either', () => {
  const h = room({ mode: 'delve', timer: 16 });
  assert.ok(isGroupRun(h.s));
  h.pick();
  const q = h.s.question!;
  assert.equal(q.deadline, null);
  tooEarly(() => h.answer('p1', right(q)));
  tooEarly(() => h.answer('p0', right(q)));
  h.clockIn();
  assert.equal(h.s.question!.deadline, h.clock.now + questionTimer(h.s) * 1000);
  h.answer('p1', right(q));
  assert.equal(h.s.phase, 'reveal');
});

test('before the clock, guests get nothing of the question to read, in every mode; once it runs, only what they need', () => {
  for (const settings of [{ mode: 'turns', timer: 16 }, { mode: 'turns', timer: 0 }, { mode: 'race', timer: 0 }, { mode: 'delve', timer: 16 }] as Partial<Settings>[]) {
    // Several questions, so both kinds (art and name) come up.
    for (let seed = 1; seed <= 12; seed++) {
      const h = room(settings, { seed });
      if (h.s.phase === 'choosing') h.pick();
      const q = h.s.question!;
      const what = `${JSON.stringify(settings)} seed ${seed} (${q.mode})`;
      const seen = publicView(h.s);
      const sq = seen.question!;
      assert.deepEqual(sq.labels, q.labels.map(() => null), what);
      assert.equal(sq.prompt, null, what);
      assert.deepEqual(sq.groups, [], what);
      assert.deepEqual(sq.options, [], what);
      assert.equal(sq.itemId, '', what);
      assert.deepEqual(sq.mirrored, [], what);
      assert.deepEqual(sq.variant, [], what);
      assert.deepEqual(seen.used, [], what);
      // Nothing that names any of it, anywhere in what goes out.
      const wire = JSON.stringify(seen);
      for (const id of q.options) {
        assert.ok(!wire.includes(`"${id}"`), `${what}: option ${id}`);
        const name = h.engine.byId.get(id)?.name;
        if (name) assert.ok(!wire.includes(`"${name}"`), `${what}: ${name}`);
      }
      for (const label of q.labels) if (label) assert.ok(!wire.includes(`"${label}"`), `${what}: ${label}`);
      // As the clock starts: the names (or the name to find) and the groups, never which is right.
      h.clockIn();
      const on = publicView(h.s).question!;
      assert.deepEqual(on.labels, q.labels, what);
      assert.equal(on.prompt, q.prompt, what);
      assert.deepEqual(on.groups, q.groups, what);
      assert.deepEqual(on.options, [], what);
      assert.equal(on.itemId, '', what);
    }
  }
});

test('an engine played without a session (autoClock) starts every clock as its question is asked', () => {
  const t = room({ mode: 'turns', timer: 16 }, { autoClock: true });
  t.pick();
  const q = t.s.question!;
  assert.equal(q.clockAt, q.askedAt);
  assert.equal(q.deadline, q.askedAt + 16_000);
  t.answer(t.s.players[t.s.turn].id, right(q));
  assert.equal(t.s.reveal!.correct, true);
  const r = room({ mode: 'race', timer: 0 }, { autoClock: true });
  assert.equal(r.s.question!.deadline, r.s.question!.askedAt + RACE_DEFAULT_TIMER * 1000);
  r.act({ type: 'reask' }, 'p0');
  assert.equal(r.s.question!.clockAt, r.s.question!.askedAt, 'one asked again too');
  const u = room({ mode: 'turns', timer: 0 }, { autoClock: true });
  u.pick();
  assert.equal(u.s.question!.clockAt, u.s.question!.askedAt);
  assert.equal(u.s.question!.deadline, null);
  // Delve too, though a clock the host's reload held still waits for 'clock' as ever.
  const d = room({ mode: 'delve', timer: 16 }, { autoClock: true });
  d.pick();
  assert.equal(d.s.question!.deadline, d.s.question!.askedAt + questionTimer(d.s) * 1000);
  d.act({ type: 'connection', playerId: 'p1', connected: false });
  d.act({ type: 'resumed' });
  assert.equal(d.s.question!.clockAt, undefined, 'held still');
  assert.ok(d.s.question!.paused);
  d.clockIn();
  assert.equal(clockRuns(d.s.question), true);
});
