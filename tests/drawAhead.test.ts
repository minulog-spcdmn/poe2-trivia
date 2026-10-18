// Race draws its next question ahead, as the reveal starts, on a copy of the
// state; at 'next' the copy is taken if nothing changed meanwhile, else
// thrown away (docs/far-links.md, phase 3). The live state never sees any
// of it before then.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ActionError, Engine, clockRuns, createGame, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { drawAhead, mayDrawAhead, takeAhead } from '../src/lib/drawAhead.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A started race of p0 (the host) and p1, on a clock the test moves, the session's way: every clock started by the host. */
function race(settings: Partial<Settings> = {}, seed = 5) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(seed), now: () => clock.now, fakes });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 16, difficulty: 'cruel', mode: 'race', public: false, locked: false, ...settings });
  for (const id of ['p0', 'p1']) s = engine.apply(s, { type: 'join', playerId: id, name: id.toUpperCase() }, id);
  s = engine.apply(s, { type: 'start' }, 'p0');
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
    /** The question's clock starts, and p1 answers it right: the reveal. */
    reveal() {
      h.clock.now += 3000;
      h.act({ type: 'clock', askedAt: s.question!.askedAt });
      h.clock.now += 2000;
      return h.act({ type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt }, 'p1');
    },
    /** The host's step to the next question, as the session takes it (the engine's own 'next'). */
    step: (st: GameState) => engine.apply(st, { type: 'next' }, null),
  };
  return h;
}

/** What the next question's draw changes, as the live state holds it. */
const drawn = (s: GameState) => ({
  phase: s.phase,
  question: s.question,
  used: s.used,
  artLean: s.artLean,
  lastAskedAt: s.lastAskedAt,
  turnCount: s.turnCount,
  round: s.round,
  recentCategories: s.recentCategories,
  version: s.version,
});

test('race: the next question is drawn ahead at the reveal on a copy; the live state is untouched', () => {
  const h = race();
  h.reveal();
  const live = h.s;
  const before = structuredClone(drawn(live));
  assert.equal(mayDrawAhead(live), true);
  const a = drawAhead(live, h.step)!;
  assert.ok(a, 'drawn');
  assert.deepEqual(drawn(live), before, 'nothing of the draw in the live state');
  assert.equal(a.from, live.version);
  assert.equal(a.state.phase, 'question');
  assert.equal(a.qid, a.state.question!.askedAt);
  assert.ok(a.qid > live.lastAskedAt!, 'a new id, later than any asked');
  assert.equal(a.state.lastAskedAt, a.qid);
  assert.equal(a.state.turnCount, live.turnCount + 1);
  assert.ok(a.state.used.includes(a.state.question!.itemId), 'the copy marks its answer used');
  assert.equal(clockRuns(a.state.question), false, 'its clock waits, as any question');
  assert.equal(a.state.question!.deadline, null);
});

test("race: a late answer to the question revealed still reads 'Too late!' while one is drawn ahead", () => {
  const h = race();
  h.reveal();
  const revealed = h.s.question!;
  const a = drawAhead(h.s, h.step)!;
  assert.ok(a);
  for (const from of ['p0', 'p1'])
    assert.throws(
      () => h.act({ type: 'answer', index: 0, askedAt: revealed.askedAt }, from),
      (e: unknown) => e instanceof ActionError && e.silent && e.message === 'Too late!',
    );
  // Taken at 'next': the revealed question's answers are still too late, not about "no open question".
  h.s = takeAhead(h.s, a)!;
  assert.throws(
    () => h.act({ type: 'answer', index: 0, askedAt: revealed.askedAt }, 'p1'),
    (e: unknown) => e instanceof ActionError && e.silent && e.message === 'Too late!',
  );
});

test('race: at next, the question drawn ahead is taken when nothing changed, and plays as any other', () => {
  const h = race();
  h.reveal();
  const live = h.s;
  const a = drawAhead(live, h.step)!;
  h.clock.now += 4000;
  const taken = takeAhead(live, a);
  assert.equal(taken, a.state, 'the copy itself');
  h.s = taken!;
  assert.equal(h.s.version, live.version + 1, 'one step on, as the engine would have taken it');
  assert.equal(h.s.question!.askedAt, a.qid, 'the id its sealed art carries');
  // Its clock starts on the host's word, and then it is answered as usual.
  h.clock.now += 500;
  h.act({ type: 'clock', askedAt: a.qid });
  assert.equal(h.s.question!.clockAt, h.clock.now);
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: a.qid }, 'p0');
  assert.equal(h.s.reveal!.winnerId, 'p0');
  // And the one after is drawn ahead in turn, from the state as it now is.
  const b = drawAhead(h.s, h.step)!;
  assert.ok(b.qid > a.qid);
  assert.equal(b.state.turnCount, a.state.turnCount + 1);
});

test('race: anything that changes the room meanwhile throws the question drawn ahead away', () => {
  const changes: [string, (h: ReturnType<typeof race>) => void][] = [
    ['someone joins to watch', (h) => h.act({ type: 'join', playerId: 'w1', name: 'Watcher' }, 'w1')],
    ['a player drops', (h) => h.act({ type: 'connection', playerId: 'p1', connected: false })],
    ['a player is removed', (h) => h.act({ type: 'remove', playerId: 'p1' }, 'p0')],
    ['the settings change', (h) => h.act({ type: 'settings', settings: { public: true } }, 'p0')],
    ['the game restarts', (h) => h.act({ type: 'restart', play: true }, 'p0')],
    ['the reveal moves on without it', (h) => h.act({ type: 'next' }, 'p0')],
  ];
  for (const [what, change] of changes) {
    const h = race();
    h.reveal();
    const a = drawAhead(h.s, h.step)!;
    assert.ok(a, what);
    change(h);
    assert.equal(takeAhead(h.s, a), null, what);
  }
});

test('no drawing ahead outside a race reveal: a question under way, the race won, turns, Delve', () => {
  const h = race();
  assert.equal(drawAhead(h.s, h.step), null, 'a question under way');
  assert.equal(takeAhead(h.s, null), null);

  const won = race({ targetScore: 1 });
  won.reveal();
  assert.equal(mayDrawAhead(won.s), true);
  assert.equal(drawAhead(won.s, won.step), null, 'the race is over at next: nothing to draw');

  const refused = race();
  refused.reveal();
  assert.equal(
    drawAhead(refused.s, () => {
      throw new ActionError('Nothing to continue.', true);
    }),
    null,
    'a step the engine turns down',
  );

  const turns = race({ mode: 'turns' });
  turns.act({ type: 'pick', category: turns.s.offered[0] }, turns.s.players[turns.s.turn].id);
  turns.act({ type: 'clock', askedAt: turns.s.question!.askedAt });
  turns.act({ type: 'answer', index: 0, askedAt: turns.s.question!.askedAt }, turns.s.players[turns.s.turn].id);
  assert.equal(turns.s.phase, 'reveal');
  assert.equal(mayDrawAhead(turns.s), false, 'taking turns');
  assert.equal(drawAhead(turns.s, turns.step), null);

  const delve = { ...won.s, settings: { ...won.s.settings, mode: 'delve' as const } };
  assert.equal(mayDrawAhead(delve), false, 'Delve');
});
