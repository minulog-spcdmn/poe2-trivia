import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, type Difficulty, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { finalRound, finalRoundShown, matchPoint, reachedBy, stakesLine, toPlay, turnStakes } from '../src/lib/stakes.ts';
import { reachedText } from '../src/lib/difficultyText.ts';
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

/** A started game: the engine and the state. */
function started(names: string[], target = 10) {
  const { engine, s } = setup(names, target);
  return { engine, s: engine.apply(s, { type: 'start' }, 'p0') };
}

const activeOf = (s: GameState) => s.players[s.turn];
const ids = (s: GameState, seats: number[]) => seats.map((i) => s.players[i].id);

/** Whoever is on turn picks the first card (corrupted or not) and answers; `next: false` stops at the reveal. */
function turn(engine: Engine, s: GameState, how: { vaal?: boolean; answer: 'right' | 'wrong'; next?: boolean }): GameState {
  const me = activeOf(s).id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0], ...(how.vaal ? { vaal: true } : {}) }, me);
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: how.answer === 'right' ? right(q) : wrongIdx(q) }, me);
  return how.next === false ? s : engine.apply(s, { type: 'next' }, me);
}

/**
 * A final round as the seat at `turn` chooses: the first seat has reached
 * 10, the others' scores as given; the player on turn holds `orbs`, the
 * Altar `altar`.
 */
function finalAt(scores: number[], o: { turn?: number; orbs?: number; altar?: number } = {}): GameState {
  const { s } = started(['Ash', 'Bea', 'Cy'], 10);
  const t = structuredClone(s);
  t.players.forEach((p, i) => (p.score = scores[i]));
  t.turn = o.turn ?? 1;
  t.players[t.turn].vaal = o.orbs ?? 1;
  t.altar = o.altar ?? 0;
  return t;
}

test('toPlay lists the seats after the active one, skips disconnected seats, and is empty at the last seat\'s reveal', () => {
  let { engine, s } = started(['Ash', 'Bea', 'Cy']);
  // Choosing: the player on turn still plays, then everyone after them.
  assert.deepEqual(toPlay(s), ids(s, [0, 1, 2]));
  // Revealed: their turn is done.
  s = turn(engine, s, { answer: 'right', next: false });
  assert.deepEqual(toPlay(s), ids(s, [1, 2]));
  // A disconnected seat is passed over, as advance passes it.
  const away = engine.apply(s, { type: 'connection', playerId: s.players[1].id, connected: false }, null);
  assert.deepEqual(toPlay(away), ids(s, [2]));
  // The last seat's reveal: nobody is left this round.
  s = engine.apply(s, { type: 'next' }, activeOf(s).id);
  s = turn(engine, s, { answer: 'wrong' });
  assert.equal(s.turn, 2);
  assert.deepEqual(toPlay(s), ids(s, [2]));
  s = turn(engine, s, { answer: 'wrong', next: false });
  assert.deepEqual(toPlay(s), []);
});

test('finalRound: from the reveal that reaches the target mid-round through the remaining turns, not at the last seat\'s reveal', () => {
  let { engine, s } = started(['Ash', 'Bea', 'Cy'], 2);
  // Round 1: everyone right, everyone one from the target; no final round yet.
  for (let i = 0; i < 3; i++) {
    assert.equal(finalRound(s), false, `round 1, seat ${i}`);
    s = turn(engine, s, { answer: 'right' });
  }
  assert.equal(s.round, 2);
  assert.deepEqual(
    s.players.map((p) => p.score),
    [1, 1, 1],
  );
  // Round 2: the first seat reaches 2 at its reveal.
  s = turn(engine, s, { answer: 'right', next: false });
  assert.equal(finalRound(s), true, 'the reveal that reaches it');
  assert.deepEqual(reachedBy(s), ids(s, [0]));
  s = engine.apply(s, { type: 'next' }, activeOf(s).id);
  assert.equal(finalRound(s), true, 'the next seat chooses');
  assert.equal(turnStakes(s), 'last');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, activeOf(s).id);
  assert.equal(finalRound(s), true, 'its question');
  s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!) }, activeOf(s).id);
  assert.equal(finalRound(s), true, 'its reveal, the last seat still to play');
  s = engine.apply(s, { type: 'next' }, activeOf(s).id);
  assert.equal(finalRound(s), true, 'the last seat chooses');
  s = turn(engine, s, { answer: 'wrong', next: false });
  assert.equal(finalRound(s), false, "the last seat's reveal");
  // The header still says it: the turn was a last chance.
  assert.equal(finalRoundShown(s), true);
  assert.equal(turnStakes(s), 'last');
  s = engine.apply(s, { type: 'next' }, activeOf(s).id);
  assert.equal(s.phase, 'over');
  assert.equal(finalRound(s), false);
  assert.equal(finalRoundShown(s), false);
});

test('a target reached on the last seat of a round gives no final round', () => {
  let { engine, s } = started(['Ash', 'Bea'], 1);
  s = turn(engine, s, { answer: 'wrong' });
  assert.equal(finalRound(s), false);
  s = turn(engine, s, { answer: 'right', next: false });
  assert.equal(activeOf(s).score, 1);
  assert.equal(finalRound(s), false);
  assert.equal(finalRoundShown(s), false);
  // The match-point banner framed it, through the reveal.
  assert.equal(turnStakes(s), 'match');
  s = engine.apply(s, { type: 'next' }, activeOf(s).id);
  assert.equal(s.phase, 'over');
});

test('no final round in a deathmatch, race or Delve', () => {
  // A tie at the target: a deathmatch, and no final round in it.
  let { engine, s } = started(['Ash', 'Bea'], 1);
  s = turn(engine, s, { answer: 'right' });
  assert.equal(finalRound(s), true);
  s = turn(engine, s, { answer: 'right' });
  assert.ok(s.deathmatch);
  assert.equal(s.phase, 'choosing');
  assert.equal(finalRound(s), false);
  assert.equal(finalRoundShown(s), false);
  assert.equal(turnStakes(s), null);
  assert.equal(stakesLine(s, null, true), '');
  // Race and Delve: never, whatever the scores.
  for (const mode of ['race', 'delve'] as const) {
    let { engine, s } = setup(['Ash']);
    s = engine.apply(s, { type: 'settings', settings: { mode } }, 'p0');
    s = engine.apply(s, { type: 'start' }, 'p0');
    const t = structuredClone(s);
    t.players[0].score = 99;
    assert.equal(finalRound(t), false, mode);
    assert.equal(finalRoundShown(t), false, mode);
    assert.equal(turnStakes(t), null, mode);
  }
});

test('the stakes line: 1 behind, with and without an orb', () => {
  assert.equal(stakesLine(finalAt([10, 9, 3], { orbs: 1 }), null, true), 'Answer right to force a deathmatch; a corruption that holds takes the lead.');
  assert.equal(stakesLine(finalAt([10, 9, 3], { orbs: 0 }), null, true), 'Answer right to force a deathmatch.');
  // The Altar changes nothing a step behind.
  assert.equal(stakesLine(finalAt([10, 9, 3], { orbs: 1, altar: 2 }), null, true), 'Answer right to force a deathmatch; a corruption that holds takes the lead.');
});

test('the stakes line: 2 behind with an orb, without and with the Altar', () => {
  assert.equal(stakesLine(finalAt([10, 8, 3]), null, true), 'Only a corruption that holds can force a deathmatch.');
  assert.equal(stakesLine(finalAt([10, 8, 3], { altar: 1 }), null, true), 'Only a corruption that holds, with the Altar, takes the lead.');
  // No orb, no corruption.
  assert.equal(stakesLine(finalAt([10, 8, 3], { orbs: 0, altar: 1 }), null, true), "It's out of reach. Play for pride.");
});

test('the stakes line: 3 behind with an orb, by the Altar', () => {
  assert.equal(stakesLine(finalAt([10, 7, 3], { altar: 1 }), null, true), 'Only a corruption that holds, with the Altar, can force a deathmatch.');
  assert.equal(stakesLine(finalAt([10, 7, 3], { altar: 2 }), null, true), 'Only a corruption that holds, with the Altar, takes the lead.');
  assert.equal(stakesLine(finalAt([10, 7, 3], { altar: 0 }), null, true), "It's out of reach. Play for pride.");
  // Far behind: pride.
  assert.equal(stakesLine(finalAt([10, 3, 7], { altar: 2 }), null, true), "It's out of reach. Play for pride.");
});

test('the stakes line: said to the player, read by everyone else under their name', () => {
  const s = finalAt([10, 9, 3], { orbs: 0 });
  const bea = s.players[1];
  // The player online, and hot-seat (whoever is looking).
  assert.equal(stakesLine(s, bea.id, false), 'Answer right to force a deathmatch.');
  assert.equal(stakesLine(s, s.players[0].id, true), 'Answer right to force a deathmatch.');
  // Another player, or a spectator, online.
  assert.equal(stakesLine(s, s.players[0].id, false), `${bea.name}: answer right to force a deathmatch.`);
  assert.equal(stakesLine(s, null, false), `${bea.name}: answer right to force a deathmatch.`);
  assert.equal(stakesLine(finalAt([10, 3, 7]), null, false), `${bea.name}: it's out of reach. Play for pride.`);
  assert.equal(
    stakesLine(finalAt([10, 7, 3], { altar: 1 }), null, false),
    `${bea.name}: only a corruption that holds, with the Altar, can force a deathmatch.`,
  );
});

test("the stakes line is '' outside a final round and outside the choice", () => {
  // Nobody has reached the target.
  assert.equal(stakesLine(finalAt([9, 8, 3]), null, true), '');
  // The question and the reveal.
  for (const phase of ['question', 'reveal'] as const) {
    const s = finalAt([10, 9, 3]);
    s.phase = phase;
    assert.equal(stakesLine(s, null, true), '', phase);
  }
});

test('match point: one right answer from the target', () => {
  assert.equal(matchPoint(9, 10), true);
  assert.equal(matchPoint(8, 10), false);
  assert.equal(matchPoint(10, 10), false);
  assert.equal(matchPoint(0, 1), true);
});

test("a turn's stakes hold through its reveal", () => {
  let { engine, s } = started(['Ash', 'Bea'], 3);
  assert.equal(turnStakes(s), null);
  // Ash at match point: a corruption that holds lands past the target, the banner keeps "match point".
  const t = structuredClone(s);
  activeOf(t).score = 2;
  assert.equal(turnStakes(t), 'match');
  let r = turn(engine, t, { vaal: true, answer: 'right', next: false });
  assert.equal(activeOf(r).score, 4);
  assert.equal(turnStakes(r), 'match');
  // A brick at match point: still the match point it began as.
  r = turn(engine, t, { vaal: true, answer: 'wrong', next: false });
  assert.equal(activeOf(r).score, 1);
  assert.equal(turnStakes(r), 'match');
  // One short of match point, answered right onto it: not this turn's.
  const u = structuredClone(s);
  activeOf(u).score = 1;
  r = turn(engine, u, { answer: 'right', next: false });
  assert.equal(activeOf(r).score, 2);
  assert.equal(turnStakes(r), null);
  // A last chance that reaches match point is still a last chance.
  const v = finalAt([10, 8, 3]);
  assert.equal(turnStakes(v), 'last');
  v.phase = 'reveal';
  v.players[1].score = 9;
  v.reveal = { correctId: 'a', chosenId: 'a', correctIndex: 0, chosenIndex: 0, correct: true, timedOut: false, winnerId: v.players[1].id } as GameState['reveal'];
  assert.equal(turnStakes(v), 'last');
});

test('the final round overlay names who reached the target', () => {
  const nameOf = (id: string) => ({ p0: 'Ash', p1: 'Bea' })[id] ?? '?';
  assert.equal(reachedText(['p0'], nameOf, null, 10), 'Ash reached 10');
  assert.equal(reachedText(['p0'], nameOf, 'p0', 10), 'You reached 10');
  assert.equal(reachedText(['p0', 'p1'], nameOf, null, 10), 'Ash and Bea reached 10');
  assert.equal(reachedText(['p0', 'p1'], nameOf, 'p1', 10), 'You and Ash reached 10');
  assert.equal(reachedText([], nameOf, null, 10), '');
  // Everyone at or past the target counts.
  const s = finalAt([10, 11, 3]);
  assert.deepEqual(reachedBy(s), ids(s, [0, 1]));
});

test('the final round has a sound of its own', () => {
  assert.deepEqual(
    MOMENTS.finalRound.layers.map((l) => [l.file, l.gain, l.rate, l.delay]),
    [
      ['deathmatch-1', -24, 0.8, 0],
      ['layer-sub-3', -22, 0.7, 0],
      ['layer-air-4', -30, 0.9, 80],
    ],
  );
});
