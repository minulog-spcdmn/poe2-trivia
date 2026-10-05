import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELVE_CLOCK_CAP_MS, clockStart, delveNotices, drained, expireIn, livesLost, mayAutoReask, reaskDelay } from '../src/lib/delveSession.ts';
import { createGame, type GameState, type Question } from '../src/lib/game.ts';

function run(over: Partial<GameState> = {}): GameState {
  const s = createGame('a');
  s.players = ['a', 'b'].map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: ['a', 'b'], losses: {}, lastStanding: null, ruleset: 1, startedAt: 5, pickBy: null, pickExtended: false, excused: [], graceUntil: 0 };
  return { ...s, ...over };
}

const question = (deadline: number | null): Question => ({
  category: 'Rings',
  mode: 'name',
  itemId: 'x',
  options: ['x', 'y'],
  labels: ['X', 'Y'],
  prompt: null,
  veil: null,
  askedAt: 100,
  deadline,
  misses: [],
});

test('the clock starts when the queue drains, at most a few seconds in, plus half a round trip', () => {
  assert.equal(clockStart(1200, 1000, 100), 1250);
  assert.equal(clockStart(null, 1000, 100), 1000 + DELVE_CLOCK_CAP_MS + 50);
  assert.equal(clockStart(9000, 1000, 100), 1000 + DELVE_CLOCK_CAP_MS + 50);
  assert.equal(clockStart(1200, 1000, 4000), 1700, 'half a round trip is capped at 500 ms');
  assert.equal(clockStart(1200, 1000, -50), 1200);
});

test('art that keeps failing is asked again: at once, then after 2, 5 and every 10 seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(reaskDelay), [0, 2000, 5000, 10_000, 10_000, 10_000]);
});

test('only a Delve question whose clock has not started is asked again by itself', () => {
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null) }), 100), true);
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(5000) }), 100), false, 'on the clock');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null) }), 99), false, 'another question');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null), delve: null }), 100), false, 'not Delve');
  assert.equal(mayAutoReask(null, 100), false);
});

test('the time to pick counts down from pickBy', () => {
  const s = run();
  assert.equal(expireIn(s, 0), null);
  s.delve!.pickBy = 5000;
  assert.equal(expireIn(s, 1000), 4000);
  assert.equal(expireIn(s, 9000), 0);
  assert.equal(expireIn({ ...s, phase: 'question' }, 1000), null);
});

test('a send queue is empty only when PeerJS and the channel both are', () => {
  assert.equal(drained({ bufferSize: 0, dataChannel: { bufferedAmount: 0 } }), true);
  assert.equal(drained({ bufferSize: 2, dataChannel: { bufferedAmount: 0 } }), false);
  assert.equal(drained({ bufferSize: 0, dataChannel: { bufferedAmount: 4096 } }), false);
  assert.equal(drained({}), true);
});

test('notices: a life lost without a question, and a question set aside by a reload', () => {
  const prev = run();
  const missed = run();
  missed.delve!.losses = { b: [3] };
  assert.deepEqual(delveNotices(prev, missed), [{ kind: 'missed', playerId: 'b' }]);
  assert.deepEqual(livesLost(prev, missed), [{ playerId: 'b', left: 2 }]);

  const revealed = { ...missed, phase: 'reveal' as const, reveal: { correctId: 'x', chosenId: 'y', correctIndex: 0, chosenIndex: 1, correct: false, timedOut: false, winnerId: null } };
  assert.deepEqual(delveNotices(prev, revealed), [], 'a wrong answer speaks for itself');

  const asking = run({ phase: 'question', question: question(null), turnCount: 4 });
  assert.deepEqual(delveNotices(asking, run({ turnCount: 4 })), [{ kind: 'setAside', playerId: 'a' }]);
  assert.deepEqual(delveNotices(asking, run({ turnCount: 5 })), [], 'the next turn is not a rewind');

  const nextRun = run();
  nextRun.delve = { ...nextRun.delve!, startedAt: 6, losses: {} };
  assert.deepEqual(delveNotices(missed, nextRun), [], 'a new run is not a change of lives');
});
