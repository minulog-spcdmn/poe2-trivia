import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ActionError, BRICK, Engine, HOLD, createGame, publicView, revengeFor, vaalCap, vaalStart, type Difficulty, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { favourText, revengeNote, revengeText } from '../src/lib/difficultyText.ts';
import { MOMENTS } from '../src/lib/soundDesign.ts';

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

test('a skipped corrupted question bricks like a time-out; a skipped pick costs nothing', () => {
  let { engine, s } = started(['Ash', 'Bram']);
  // The guest corrupts their pick, then drops out: the host's skip (as the
  // automatic one after a disconnect) is no way out of the brick.
  if (activeOf(s).id !== 'p1') s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(activeOf(s).id, 'p1');
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, 'p1');
  assert.equal(playerOf(s, 'p1').vaal, 1);
  s = engine.apply(s, { type: 'connection', playerId: 'p1', connected: false }, null);
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(s.phase, 'choosing');
  assert.equal(playerOf(s, 'p1').vaal, 1, 'the orb stays spent');
  assert.equal(playerOf(s, 'p1').score, -BRICK);
  assert.equal(s.altar, BRICK, 'the point lies on the Altar');
  assert.equal(playerOf(s, 'p1').ledger!.bricked, 1);
  // Still here but idle with no clock, skipped by hand: the same.
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Bram' }, 'p1');
  const me = activeOf(s).id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0], vaal: true }, me);
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.equal(playerOf(s, me).vaal, 1);
  assert.equal(playerOf(s, me).score, -BRICK);
  assert.equal(s.altar, 2 * BRICK);
  // Skipped while choosing, or on a plain question: nothing spent, nothing lost.
  const other = activeOf(s).id;
  const before = { vaal: playerOf(s, other).vaal, score: playerOf(s, other).score };
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.deepEqual({ vaal: playerOf(s, other).vaal, score: playerOf(s, other).score }, before);
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, activeOf(s).id);
  const plain = activeOf(s).id;
  const was = { vaal: playerOf(s, plain).vaal, score: playerOf(s, plain).score };
  s = engine.apply(s, { type: 'skip' }, 'p0');
  assert.deepEqual({ vaal: playerOf(s, plain).vaal, score: playerOf(s, plain).score }, was);
  assert.equal(s.altar, 2 * BRICK);
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

// ---- 3. Vaal favour and revenge orbs ---------------------------------------

/** Plays plain turns until round `round` begins (or the game is over), each player answering as `answer` says. */
function playTo(engine: Engine, s: GameState, round: number, answer: (id: string, round: number) => 'right' | 'wrong'): GameState {
  let guard = 0;
  while (s.round < round && s.phase !== 'over' && !s.deathmatch && guard++ < 200) s = turn(engine, s, { answer: answer(activeOf(s).id, s.round) });
  return s;
}

test("favour at a round's end", () => {
  let { engine, s } = started(['Ash', 'Bram'], 10);
  const start = vaalStart(s.settings);
  const answer = (id: string) => (id === 'p0' ? 'right' : 'wrong');
  // Two behind after rounds 1 and 2: nothing.
  s = playTo(engine, s, 3, answer);
  assert.equal(playerOf(s, 'p1').vaal, start);
  assert.equal(s.favour, undefined);
  // Three behind after round 3: an orb, said on the turn that comes next.
  s = playTo(engine, s, 4, answer);
  assert.equal(s.phase, 'choosing');
  assert.equal(playerOf(s, 'p0').score - playerOf(s, 'p1').score, 3);
  assert.equal(playerOf(s, 'p1').vaal, start + 1);
  assert.equal(playerOf(s, 'p0').vaal, start, 'the leader never gains');
  assert.deepEqual(s.favour, { turn: s.turnCount, ids: ['p1'] });
  // That is the most favour brings: after round 4, none more.
  assert.equal(start + 1, vaalCap(s.settings));
  s = playTo(engine, s, 5, answer);
  assert.equal(playerOf(s, 'p1').vaal, start + 1);
  assert.equal(s.favour, undefined);
  // Spent, the orb can come back at the next round's end.
  s = playTo(engine, s, 5, answer);
  if (activeOf(s).id !== 'p1') s = turn(engine, s, { answer: 'right' });
  s = turn(engine, s, { vaal: true, answer: 'wrong' });
  assert.equal(playerOf(s, 'p1').vaal, start);
  s = playTo(engine, s, 6, answer);
  assert.equal(playerOf(s, 'p1').vaal, start + 1);
  assert.deepEqual(s.favour, { turn: s.turnCount, ids: ['p1'] });
});

test('no favour for a gap of 2, for the leader, or for a disconnected player', () => {
  let { engine, s } = started(['Ash', 'Bram', 'Cora'], 10);
  const start = vaalStart(s.settings);
  // p0 always right, p1 right in round 1 only, p2 never.
  const answer = (id: string, round: number) => (id === 'p0' || (id === 'p1' && round === 1) ? 'right' : 'wrong');
  s = playTo(engine, s, 3, answer);
  // Round 3: p2 answers, then drops before the round ends.
  let guard = 0;
  while (s.round === 3 && guard++ < 10) {
    const me = activeOf(s).id;
    s = turn(engine, s, { answer: answer(me, s.round), next: false });
    if (me === 'p2') s = engine.apply(s, { type: 'connection', playerId: 'p2', connected: false }, null);
    s = engine.apply(s, { type: 'next' }, null);
  }
  assert.equal(s.round, 4);
  assert.deepEqual(
    s.players.map((p) => [p.id, p.score]).sort(),
    [
      ['p0', 3],
      ['p1', 1],
      ['p2', 0],
    ],
  );
  for (const p of s.players) assert.equal(p.vaal, start, `${p.id}: a gap of 2, the leader, or away`);
  assert.equal(s.favour, undefined);
  // Back for round 4's end: both of them are 3 or more behind and gain one.
  s = engine.apply(s, { type: 'connection', playerId: 'p2', connected: true }, null);
  s = playTo(engine, s, 5, answer);
  assert.equal(playerOf(s, 'p0').vaal, start);
  assert.equal(playerOf(s, 'p1').vaal, start + 1);
  assert.equal(playerOf(s, 'p2').vaal, start + 1);
  assert.deepEqual([...s.favour!.ids].sort(), ['p1', 'p2']);
  assert.equal(s.favour!.turn, s.turnCount);
  assert.equal(s.favour!.revenge, undefined);
});

test('no favour at the wrap that finishes or starts a deathmatch', () => {
  // Finishes: p0 reaches 3 on round 3, p1 is 3 behind.
  let { engine, s } = setup(['Ash', 'Bram'], 3);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = playTo(engine, s, 99, (id) => (id === 'p0' ? 'right' : 'wrong'));
  assert.equal(s.phase, 'over');
  assert.equal(playerOf(s, 'p1').vaal, vaalStart(s.settings));
  assert.equal(s.favour, undefined);
  // Starts a deathmatch: p0 and p1 tie at 3, p2 is 3 behind.
  ({ engine, s } = setup(['Ash', 'Bram', 'Cora'], 3));
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = playTo(engine, s, 99, (id) => (id === 'p2' ? 'wrong' : 'right'));
  assert.ok(s.deathmatch);
  assert.equal(playerOf(s, 'p2').vaal, vaalStart(s.settings));
  assert.equal(s.favour, undefined);
  // Nor inside the deathmatch, round after round.
  for (let i = 0; i < 4 && s.phase !== 'over'; i++) s = turn(engine, s, { answer: 'right' });
  assert.equal(playerOf(s, 'p2').vaal, vaalStart(s.settings));
  assert.equal(s.favour, undefined);
});

test('revenge orbs', () => {
  // A finished 2-player game: p0 wins.
  let { engine, s } = started(['Ash', 'Bram'], 3);
  const start = vaalStart(s.settings);
  s = playTo(engine, s, 99, (id) => (id === 'p0' ? 'right' : 'wrong'));
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, ['p0']);
  assert.deepEqual(revengeFor(s), ['p1']);
  const over = s;

  // Play again: one more orb for the loser, said on the first turn.
  let again = engine.apply(over, { type: 'restart', play: true }, 'p0');
  assert.equal(playerOf(again, 'p1').vaal, start + 1);
  assert.equal(playerOf(again, 'p0').vaal, start);
  assert.deepEqual(again.favour, { turn: 0, ids: ['p1'], revenge: true });
  assert.equal(again.turnCount, 0);
  assert.equal(again.revenge, undefined, 'used up by the game it was for');

  // Change settings, then Begin: the same. The lobby holds the revenge orb.
  const lobby = engine.apply(over, { type: 'restart' }, 'p0');
  assert.deepEqual(lobby.revenge, ['p1']);
  assert.equal(lobby.favour, undefined);
  again = engine.apply(lobby, { type: 'start' }, 'p0');
  assert.equal(playerOf(again, 'p1').vaal, start + 1);
  assert.equal(playerOf(again, 'p0').vaal, start);
  assert.deepEqual(again.favour, { turn: 0, ids: ['p1'], revenge: true });
  // The game after that one, with nobody losing in between, gives none.
  assert.deepEqual(engine.apply(again, { type: 'restart', play: true }, 'p0').favour, undefined);

  // A guest whose connection drops in the lobby (the session removes them,
  // with no sender) and who comes back keeps theirs.
  let blip = engine.apply(lobby, { type: 'remove', playerId: 'p1' }, null);
  assert.ok(!blip.players.some((p) => p.id === 'p1'));
  blip = engine.apply(blip, { type: 'join', playerId: 'p1', name: 'Bram', returning: true }, 'p1');
  blip = engine.apply(blip, { type: 'start' }, 'p0');
  assert.equal(playerOf(blip, 'p1').vaal, start + 1);
  assert.deepEqual(blip.favour, { turn: 0, ids: ['p1'], revenge: true });
  // One removed by the host loses theirs (coming back, they are someone new).
  let left = engine.apply(lobby, { type: 'remove', playerId: 'p1' }, 'p0');
  assert.equal(left.revenge, undefined);
  left = engine.apply(left, { type: 'join', playerId: 'p1', name: 'Bram' }, 'p1');
  left = engine.apply(left, { type: 'start' }, 'p0');
  assert.equal(playerOf(left, 'p1').vaal, start);
  assert.equal(left.favour, undefined);
  // So does one who is away when the host restarts.
  const away = engine.apply(over, { type: 'connection', playerId: 'p1', connected: false }, null);
  assert.deepEqual(revengeFor(away), []);
  assert.equal(engine.apply(away, { type: 'restart' }, 'p0').revenge, undefined);

  // A seat filled from the spectators gets the normal count.
  let watched = started(['Ash', 'Bram'], 3);
  ({ engine, s } = watched);
  s = engine.apply(s, { type: 'join', playerId: 'p9', name: 'Vex' }, 'p9');
  assert.deepEqual(s.spectators!.map((o) => o.id), ['p9']);
  s = playTo(engine, s, 99, (id) => (id === 'p0' ? 'right' : 'wrong'));
  assert.deepEqual(revengeFor(s), ['p1'], 'spectators have nothing to avenge');
  again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(playerOf(again, 'p9').vaal, start);
  assert.equal(playerOf(again, 'p1').vaal, start + 1);

  // A 1-player game gives none.
  watched = started(['Ash'], 1);
  ({ engine, s } = watched);
  s = turn(engine, s, { answer: 'wrong' });
  s = playTo(engine, s, 99, () => 'right');
  assert.equal(s.phase, 'over');
  assert.deepEqual(revengeFor(s), []);
  again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(again.players[0].vaal, vaalStart(again.settings));
  assert.equal(again.favour, undefined);

  // A restart in the middle of a game gives none.
  ({ engine, s } = started(['Ash', 'Bram'], 10));
  s = playTo(engine, s, 3, (id) => (id === 'p0' ? 'right' : 'wrong'));
  assert.deepEqual(revengeFor(s), []);
  again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  for (const p of again.players) assert.equal(p.vaal, vaalStart(again.settings));
  assert.equal(again.favour, undefined);

  // Nor does race (no orbs at all).
  ({ engine, s } = setup(['Ash', 'Bram'], 1));
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, 'p0');
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.equal(s.phase, 'over');
  assert.deepEqual(revengeFor(s), []);
  again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(again.favour, undefined);
  assert.ok(!again.players.some((p) => p.vaal !== undefined));
  assert.equal(again.revenge, undefined);
});

test('favour and revenge are said by name, and to you online', () => {
  const names: Record<string, string> = { a: 'Mira', b: 'Ash', c: 'Bea' };
  const nameOf = (id: string) => names[id];
  assert.equal(favourText(['a'], nameOf, null), 'The Vaal favour the desperate: Mira gains a Vaal Orb.');
  assert.equal(favourText(['a', 'b'], nameOf, null), 'The Vaal favour the desperate: Mira and Ash each gain a Vaal Orb.');
  assert.equal(favourText(['a'], nameOf, 'a'), 'The Vaal favour the desperate: you gain a Vaal Orb.');
  assert.equal(favourText(['b', 'a'], nameOf, 'a'), 'The Vaal favour the desperate: you and Ash each gain a Vaal Orb.');
  assert.equal(favourText([], nameOf, null), '');
  assert.equal(revengeText(['a', 'b'], nameOf, null), 'Revenge orbs: Mira and Ash start with one more.');
  assert.equal(revengeText(['b'], nameOf, null), 'Revenge orbs: Ash starts with one more.');
  assert.equal(revengeText(['b'], nameOf, 'b'), 'Revenge orbs: you start with one more.');
  assert.equal(revengeNote(['b'], nameOf, null), 'Ash starts the next game with a revenge orb.');
  assert.equal(revengeNote(['a', 'b', 'c'], nameOf, null), 'Mira, Ash and Bea start the next game with a revenge orb.');
  assert.equal(revengeNote(['a', 'b'], nameOf, 'c'), 'Mira and Ash start the next game with a revenge orb.');
  assert.equal(revengeNote(['a', 'b'], nameOf, 'b'), 'Play again and you start with a revenge orb.');
  // A guest who lost has no Play again button.
  assert.equal(revengeNote(['a', 'b'], nameOf, 'b', false), 'You and Mira start the next game with a revenge orb.');
  assert.equal(revengeNote(['b'], nameOf, 'b', false), 'You start the next game with a revenge orb.');
  assert.equal(revengeNote([], nameOf, 'b'), '');
});

test('a corruption sounds like one: a low crackle of its own, not the usual reveal', () => {
  const { corrupt, reveal } = MOMENTS;
  assert.deepEqual(
    corrupt.layers.map((l) => l.file),
    ['burn-crackle', 'burn-fuse', 'layer-sub-3', 'deathmatch-4'],
  );
  assert.ok(!corrupt.layers.some((l) => reveal.layers.some((r) => r.file === l.file)), 'none of the reveal in it');
  // Low: every layer slowed down but the toll, a little higher, far back in the hall.
  assert.ok(corrupt.layers.every((l) => l.rate < 1 || l.file === 'deathmatch-4'));
});
