import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ActionError, BRICK, Engine, HOLD, createGame, publicView, vaalStart, type Difficulty, type GameState, type Item, type Question } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function setup(names: string[], target = 3, difficulty: Difficulty = 'cruel') {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame('p0', { targetScore: target, timer: 0, difficulty });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s };
}

/** A started game: the engine, the state and who is on turn. */
function started(names: string[], target = 10) {
  const { engine, s } = setup(names, target);
  const t = engine.apply(s, { type: 'start' }, 'p0');
  return { engine, s: t };
}

const activeOf = (s: GameState) => s.players[s.turn];
const playerOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** One turn for whoever is on: pick the first card (corrupted or not), then answer right, wrong or let the time run out. */
function turn(engine: Engine, s: GameState, how: { vaal?: boolean; answer: 'right' | 'wrong' | 'late'; next?: boolean }): GameState {
  const me = activeOf(s).id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0], ...(how.vaal ? { vaal: true } : {}) }, me);
  const q = s.question!;
  s =
    how.answer === 'late'
      ? engine.apply(s, { type: 'answer', index: null }, null)
      : engine.apply(s, { type: 'answer', index: how.answer === 'right' ? right(q) : wrongIdx(q) }, me);
  return how.next === false ? s : engine.apply(s, { type: 'next' }, me);
}

// ---- 1. Vaal Orbs ----------------------------------------------------------

test('every turns game starts with one orb per 5 points to win', () => {
  for (const [target, orbs] of [
    [1, 1],
    [5, 1],
    [10, 2],
    [15, 3],
    [20, 4],
  ]) {
    assert.equal(vaalStart({ targetScore: target }), orbs);
    const { s } = started(['Ash', 'Bram'], target);
    for (const p of s.players) {
      assert.equal(p.vaal, orbs, `target ${target}`);
      assert.deepEqual(p.ledger, { held: 0, bricked: 0, altar: 0 });
    }
  }
  // Race and Delve hand out none.
  for (const mode of ['race', 'delve'] as const) {
    let { engine, s } = setup(['Ash']);
    s = engine.apply(s, { type: 'settings', settings: { mode } }, 'p0');
    s = engine.apply(s, { type: 'start' }, 'p0');
    assert.equal(s.players[0].vaal, undefined, mode);
    assert.equal(s.players[0].ledger, undefined, mode);
    assert.equal(s.altar, undefined, mode);
  }
});

test('a corrupted pick spends an orb and marks the question', () => {
  let { engine, s } = started(['Ash', 'Bram']);
  const me = activeOf(s).id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, me);
  assert.equal(s.phase, 'question');
  assert.equal(s.question!.vaal, true);
  assert.equal(playerOf(s, me).vaal, 1);
  // The other player keeps theirs.
  assert.equal(s.players.find((p) => p.id !== me)!.vaal, 2);
  // A plain pick spends nothing and marks nothing.
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, me);
  s = engine.apply(s, { type: 'next' }, me);
  const other = activeOf(s).id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, other);
  assert.equal(s.question!.vaal, undefined);
  assert.equal(playerOf(s, other).vaal, 2);
  // vaal: false is a plain pick too.
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, other);
  s = engine.apply(s, { type: 'next' }, other);
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: false }, activeOf(s).id);
  assert.equal(s.question!.vaal, undefined);
});

test('corrupting is refused with no orbs and in a deathmatch', () => {
  // No orbs left: target 5 gives one, spent on the first turn.
  let { engine, s } = started(['Ash'], 5);
  s = turn(engine, s, { vaal: true, answer: 'wrong' });
  assert.equal(s.players[0].vaal, 0);
  const before = structuredClone(s);
  assert.throws(() => engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, 'p0'), (e: unknown) => e instanceof ActionError && /no Vaal Orb/.test(e.message));
  assert.deepEqual(s, before, 'the state before is unchanged');

  // A deathmatch: x and y tie at the target, both still holding orbs.
  ({ engine, s } = setup(['Ash', 'Bram', 'Cora'], 1));
  s = engine.apply(s, { type: 'start' }, 'p0');
  const z = s.players[2].id;
  for (let i = 0; i < 3; i++) s = turn(engine, s, { answer: activeOf(s).id === z ? 'wrong' : 'right' });
  assert.ok(s.deathmatch);
  assert.equal(activeOf(s).vaal, 1);
  const dm = structuredClone(s);
  assert.throws(
    () => engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, activeOf(s).id),
    (e: unknown) => e instanceof ActionError && e.message === 'No corrupting in a deathmatch.',
  );
  assert.deepEqual(s, dm, 'the state before is unchanged');
  // A plain pick still goes.
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, activeOf(s).id);
  assert.equal(s.question!.vaal, undefined);
});

test('a corruption that holds pays +2, a brick costs 1, a time-out bricks', () => {
  let { engine, s } = started(['Ash']);
  // Holds.
  s = turn(engine, s, { vaal: true, answer: 'right', next: false });
  assert.equal(s.players[0].score, HOLD);
  assert.deepEqual(s.reveal!.stake, { delta: HOLD, altar: 0 });
  assert.equal(s.reveal!.correct, true);
  assert.deepEqual(s.players[0].ledger, { held: 1, bricked: 0, altar: 0 });
  assert.equal(s.players[0].streak, 1, 'a hold is a right answer for the streak');
  s = engine.apply(s, { type: 'next' }, 'p0');
  // Bricks.
  s = turn(engine, s, { vaal: true, answer: 'wrong', next: false });
  assert.equal(s.players[0].score, HOLD - BRICK);
  assert.deepEqual(s.reveal!.stake, { delta: -BRICK, altar: 0 });
  assert.deepEqual(s.players[0].ledger, { held: 1, bricked: 1, altar: 0 });
  assert.equal(s.players[0].vaal, 0);
  // A plain question has no stake.
  s = engine.apply(s, { type: 'next' }, 'p0');
  s = turn(engine, s, { answer: 'wrong', next: false });
  assert.equal(s.reveal!.stake, undefined);
  assert.equal(s.players[0].score, HOLD - BRICK);
  s = turn(engine, engine.apply(s, { type: 'next' }, 'p0'), { answer: 'right', next: false });
  assert.equal(s.reveal!.stake, undefined);
  assert.equal(s.players[0].score, HOLD - BRICK + 1);

  // A time-out on a corrupted question bricks.
  ({ engine, s } = started(['Ash']));
  s = turn(engine, s, { vaal: true, answer: 'late', next: false });
  assert.equal(s.reveal!.timedOut, true);
  assert.equal(s.players[0].score, -BRICK);
  assert.deepEqual(s.reveal!.stake, { delta: -BRICK, altar: 0 });
  assert.deepEqual(s.players[0].ledger, { held: 0, bricked: 1, altar: 0 });
});

test('scores may go below zero', () => {
  let { engine, s } = started(['Ash']);
  s = turn(engine, s, { vaal: true, answer: 'wrong' });
  assert.equal(s.players[0].score, -1);
  s = turn(engine, s, { vaal: true, answer: 'late', next: false });
  assert.equal(s.players[0].score, -2);
  assert.equal(s.players[0].vaal, 0);
});

test('a skipped corrupted question gives the orb back; a skipped pick costs nothing', () => {
  let { engine, s } = started(['Ash', 'Bram']);
  const me = activeOf(s).id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, me);
  assert.equal(playerOf(s, me).vaal, 1);
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(s.phase, 'choosing');
  assert.equal(playerOf(s, me).vaal, 2, 'the orb is back');
  assert.equal(playerOf(s, me).score, 0);
  assert.equal(s.altar, 0);
  // Skipped while choosing, or on a plain question: nothing spent, nothing given.
  const other = activeOf(s).id;
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(playerOf(s, other).vaal, 2);
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, activeOf(s).id);
  const plain = activeOf(s).id;
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(playerOf(s, plain).vaal, 2);
});

test('a reask keeps the corruption and spends no second orb', () => {
  let { engine, s } = started(['Ash']);
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, 'p0');
  const first = s.question!.itemId;
  s = engine.apply(s, { type: 'reask' }, 'p0');
  assert.notEqual(s.question!.itemId, first);
  assert.equal(s.question!.vaal, true);
  assert.equal(s.players[0].vaal, 1);
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, 'p0');
  assert.equal(s.players[0].score, HOLD);
});

test('corrupting never changes which items are asked', () => {
  const asked = (corrupt: boolean) => {
    let { engine, s } = setup(['Ash', 'Bram'], 99);
    s = engine.apply(s, { type: 'start' }, 'p0');
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const me = activeOf(s).id;
      s = engine.apply(s, { type: 'pick', category: s.offered[0], ...(corrupt ? { vaal: true } : {}) }, me);
      ids.push(s.question!.itemId);
      s = engine.apply(s, { type: 'answer', index: i % 3 ? right(s.question!) : wrongIdx(s.question!) }, me);
      s = engine.apply(s, { type: 'next' }, me);
    }
    return ids;
  };
  assert.deepEqual(asked(true), asked(false));
});

test("guests never see a corrupted question's answer", () => {
  let { engine, s } = started(['Ash', 'Bram']);
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, activeOf(s).id);
  const q = s.question!;
  const view = publicView(s);
  const text = JSON.stringify(view);
  assert.equal(view.question!.vaal, true, 'everyone sees the corruption');
  assert.equal(view.question!.itemId, '');
  assert.ok(!text.includes(q.itemId), 'answer id not anywhere in the guest copy');
  for (const id of q.options) assert.ok(!text.includes(id), 'no option item ids either');
});

test("a player corrupts their own pick, never another player's", () => {
  let { engine, s } = started(['Ash', 'Bram']);
  const me = activeOf(s).id;
  const other = s.players.find((p) => p.id !== me)!.id;
  assert.throws(() => engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, other));
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, me);
  assert.equal(playerOf(s, me).vaal, 1);
  assert.equal(playerOf(s, other).vaal, 2);
});

test('orbs reset every game and go with it on restart', () => {
  let { engine, s } = started(['Ash'], 5);
  s = turn(engine, s, { vaal: true, answer: 'right' });
  assert.equal(s.players[0].vaal, 0);
  const lobby = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(lobby.players[0].vaal, undefined);
  assert.equal(lobby.players[0].ledger, undefined);
  const again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(again.players[0].vaal, 1);
  assert.deepEqual(again.players[0].ledger, { held: 0, bricked: 0, altar: 0 });
});

// ---- 2. The Altar ----------------------------------------------------------

test('a hold takes the whole Altar', () => {
  let { engine, s } = started(['Ash', 'Bram', 'Cora']);
  const [a, b, c] = s.players.map((p) => p.id);
  s = turn(engine, s, { vaal: true, answer: 'wrong' });
  assert.equal(s.altar, 1);
  s = turn(engine, s, { vaal: true, answer: 'wrong' });
  assert.equal(s.altar, 2);
  assert.equal(playerOf(s, a).score, -1);
  assert.equal(playerOf(s, b).score, -1);
  s = turn(engine, s, { vaal: true, answer: 'right', next: false });
  assert.equal(playerOf(s, c).score, HOLD + 2);
  assert.equal(s.altar, 0);
  assert.deepEqual(s.reveal!.stake, { delta: HOLD + 2, altar: 2 });
  assert.deepEqual(playerOf(s, c).ledger, { held: 1, bricked: 0, altar: 2 });
  // The next hold finds it empty.
  s = engine.apply(s, { type: 'next' }, c);
  s = turn(engine, s, { vaal: true, answer: 'right', next: false });
  assert.deepEqual(s.reveal!.stake, { delta: HOLD, altar: 0 });
  assert.equal(playerOf(s, a).score, -1 + HOLD);
  assert.equal(playerOf(s, a).ledger!.altar, 0);
});

test('time-outs feed the Altar', () => {
  let { engine, s } = started(['Ash', 'Bram']);
  s = turn(engine, s, { vaal: true, answer: 'late' });
  s = turn(engine, s, { vaal: true, answer: 'late' });
  assert.equal(s.altar, 2);
  // A plain time-out doesn't.
  s = turn(engine, s, { answer: 'late' });
  assert.equal(s.altar, 2);
});

test('start and restart reset the Altar', () => {
  let { engine, s } = setup(['Ash', 'Bram'], 10);
  assert.equal(s.altar, undefined, 'none in the lobby');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.altar, 0);
  s = turn(engine, s, { vaal: true, answer: 'wrong' });
  assert.equal(s.altar, 1);
  const lobby = engine.apply(s, { type: 'restart' }, 'p0');
  assert.ok(!('altar' in lobby), 'restart deletes it');
  assert.ok(!('favour' in lobby));
  assert.equal(engine.apply(lobby, { type: 'start' }, 'p0').altar, 0);
  assert.equal(engine.apply(s, { type: 'restart', play: true }, 'p0').altar, 0);
});

test('the Altar stays empty when nobody corrupts', () => {
  let { engine, s } = started(['Ash', 'Bram'], 3);
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 60) {
    s = turn(engine, s, { answer: guard % 3 === 0 ? 'late' : guard % 2 ? 'wrong' : 'right', next: false });
    assert.equal(s.altar, 0);
    assert.equal(s.reveal!.stake, undefined);
    s = engine.apply(s, { type: 'next' }, null);
  }
  assert.equal(s.phase, 'over');
  for (const p of s.players) assert.deepEqual(p.ledger, { held: 0, bricked: 0, altar: 0 });
});
