import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_REASKS,
  COOP_DRAW_MS,
  DELVE_CLOCK_CAP_MS,
  artFirst,
  blastedAway,
  clockStart,
  delveNotices,
  drained,
  drawClockFrom,
  drawHoldUntil,
  expireIn,
  fuseHeard,
  runSeenStarting,
  underRuleset,
  inventoryChanges,
  livesLost,
  mayAutoReask,
  reaskDelay,
  setAside,
} from '../src/lib/delveSession.ts';
import { DELVE_RULESET, VOTE_WINDOW_MS } from '../src/lib/delve.ts';
import { createGame, type GameState, type Question } from '../src/lib/game.ts';

function run(over: Partial<GameState> = {}): GameState {
  const s = createGame('a');
  s.players = ['a', 'b'].map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: ['a', 'b'], losses: {}, ruleset: 1, startedAt: 5, excused: [], graceUntil: 0, votes: {}, voteFrom: null, missed: {}, revives: [] };
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

test('art that keeps failing is asked again a few times: at once, then after 2, 5 and 10 seconds, then no more by itself', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(reaskDelay), [0, 2000, 5000, 10_000, null, null]);
  assert.equal(AUTO_REASKS, 4);
  assert.equal(reaskDelay(AUTO_REASKS), null, 'an offline device does not spin through questions forever');
});

test('only a Delve question whose clock has not started is asked again by itself', () => {
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null) }), 100), true);
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(5000) }), 100), false, 'on the clock');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null) }), 99), false, 'another question');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null), delve: null }), 100), false, 'not Delve');
  assert.equal(mayAutoReask(null, 100), false);
});

test('nothing counts down until the first vote, then the vote window does', () => {
  const s = run();
  assert.equal(expireIn(s, 0), null, 'nobody voted: the vote waits as long as it takes');
  s.delve!.votes = { a: 'Rings' };
  s.delve!.voteFrom = 5000;
  assert.equal(expireIn(s, 6000), VOTE_WINDOW_MS - 1000);
  assert.equal(expireIn(s, 99_000), 0);
  assert.equal(expireIn({ ...s, phase: 'question' }, 6000), null);
  // Everyone it waits for has voted: due at once, whatever the window says.
  const all = structuredClone(s);
  all.delve!.votes = { a: 'Rings', b: 'Belts' };
  assert.equal(expireIn(all, 6000), 0);
  // Someone gone isn't waited for.
  const gone = structuredClone(s);
  gone.players[1].connected = false;
  assert.equal(expireIn(gone, 6000), 0);
  // Alone there is no vote, and nothing is ever picked for anyone.
  const solo = run();
  solo.delve!.entrants = ['a'];
  solo.delve!.voteFrom = 5000;
  assert.equal(expireIn(solo, 6000), null);
});

test('a send queue is empty only when PeerJS and the channel both are', () => {
  assert.equal(drained({ bufferSize: 0, dataChannel: { bufferedAmount: 0 } }), true);
  assert.equal(drained({ bufferSize: 2, dataChannel: { bufferedAmount: 0 } }), false);
  assert.equal(drained({ bufferSize: 0, dataChannel: { bufferedAmount: 4096 } }), false);
  assert.equal(drained({}), true);
});

test('notices: a question set aside by a reload (a life given, the board and the game screen say)', () => {
  const prev = run();
  const lost = run();
  lost.delve!.losses = { b: [3] };
  assert.deepEqual(delveNotices(prev, lost), [], 'a life lost speaks for itself');
  assert.deepEqual(livesLost(prev, lost), [{ playerId: 'b', left: 2, lost: 1 }]);
  const caved = run();
  caved.delve!.losses = { b: [3, 3] };
  assert.deepEqual(livesLost(prev, caved), [{ playerId: 'b', left: 1, lost: 2 }], 'a cave-in takes two at once');

  // A revive: the giver's life is given, not lost; the screen says who brought whom back, no notice.
  const down = run();
  down.delve!.losses = { b: [1, 2, 3] };
  const back = structuredClone(down);
  back.delve!.revives = [{ by: 'a', to: 'b', depth: 3, fell: 3, at: 9 }];
  assert.deepEqual(delveNotices(down, back), []);
  assert.deepEqual(livesLost(down, back), []);

  const asking = run({ phase: 'question', question: question(null), turnCount: 4 });
  assert.deepEqual(delveNotices(asking, run({ turnCount: 4 })), [{ kind: 'setAside', playerId: '' }], "together, it was the team's question");
  assert.deepEqual(delveNotices(asking, run({ turnCount: 5 })), [], 'the next turn is not a rewind');
  const alone = (o: Partial<GameState>) => {
    const s = run(o);
    s.delve!.entrants = ['a'];
    return s;
  };
  assert.deepEqual(delveNotices(alone({ phase: 'question', question: question(null), turnCount: 4 }), alone({ turnCount: 4 })), [{ kind: 'setAside', playerId: 'a' }]);

  const nextRun = run();
  nextRun.delve = { ...nextRun.delve!, startedAt: 6, losses: {} };
  assert.deepEqual(livesLost(lost, nextRun), [], 'a new run is not a change of lives');
  assert.deepEqual(delveNotices(back, { ...nextRun, delve: { ...nextRun.delve, revives: [] } }), []);
});

test('the art goes first to whoever answers: the player alone, everyone standing together', () => {
  const s = run();
  assert.deepEqual(artFirst(s), ['a', 'b']);
  s.delve!.losses = { b: [1, 2, 3] };
  assert.deepEqual(artFirst(s), ['a'], 'one who perished watches, like a spectator');
  const solo = run({ turn: 1 });
  solo.delve!.entrants = ['b'];
  assert.deepEqual(artFirst(solo), ['b']);
  assert.deepEqual(artFirst(run({ delve: null })), []);
});

test('a blast is told apart from a question asked again: the new question names the one the change had in play', () => {
  const prev = run({ phase: 'question', question: question(5000), turnCount: 3 });
  const was = { at: 100, itemId: 'x', mode: 'name' as const };
  const next = run({ phase: 'question', question: { ...question(null), askedAt: 200, blast: { by: 'a', stick: 'b', side: -1, was } }, turnCount: 3 });
  assert.deepEqual(blastedAway(prev, next), next.question!.blast);
  // Its art failed and it was asked again: the blast it keeps is no new one.
  const again = { ...next, question: { ...next.question!, askedAt: 300 } };
  assert.equal(blastedAway(next, again), null);
  // Nor without one, from the cards, in another run, or once revealed.
  assert.equal(blastedAway(prev, run({ phase: 'question', question: { ...question(null), askedAt: 200 } })), null);
  assert.equal(blastedAway(run(), next), null);
  assert.equal(blastedAway(prev, { ...next, delve: { ...next.delve!, startedAt: 6 } }), null);
  assert.equal(blastedAway(prev, { ...next, phase: 'reveal' }), null);
  assert.equal(blastedAway(null, next), null);
});

test('co-op notices: only a perish (a wrong pick and a flare the question says itself, and dynamite)', () => {
  const q = question(5000);
  const prev = run({ phase: 'question', question: q });
  prev.delve!.losses = { b: [1, 2] };
  const next = structuredClone(prev);
  next.question!.struck = [
    { index: 1, by: 'a', at: 1, lives: 0, wards: 1 },
    { index: 0, by: 'b', at: 2, lives: 1, wards: 0 },
  ];
  next.delve!.losses = { b: [1, 2, 7] };
  next.round = 7;
  next.question!.flared = true;
  next.question!.flaredBy = 'a';
  assert.deepEqual(delveNotices(prev, next), [{ kind: 'perished', playerId: 'b', depth: 7 }]);
  // Alone the player's own screen says all of it.
  const [soloPrev, soloNext] = [structuredClone(prev), structuredClone(next)];
  soloPrev.delve!.entrants = soloNext.delve!.entrants = ['a'];
  assert.deepEqual(delveNotices(soloPrev, soloNext), []);
});

test('a question set aside is quiet: what it cost comes back without a word but the notice', () => {
  const asking = run({ phase: 'question', question: question(5000), turnCount: 4 });
  asking.delve!.inventory = { a: { wards: 0, flares: 0, dynamite: 0, shards: 0 } };
  const back = run({ turnCount: 4 });
  back.delve!.inventory = { a: { wards: 0, flares: 1, dynamite: 1, shards: 0 } };
  assert.equal(setAside(asking, back), true);
  assert.deepEqual(inventoryChanges(asking, back), [], 'a refunded flare is not a flare found');
  assert.deepEqual(delveNotices(asking, back), [{ kind: 'setAside', playerId: '' }]);
  assert.equal(setAside(asking, run({ turnCount: 5 })), false, 'the next depth is no rewind');
  assert.deepEqual(
    inventoryChanges(run(), back).map((c) => c.change),
    ['gained', 'gained'],
  );
});


test("together, a question the vote drew holds its clock until the draw has played out on the cards", () => {
  const voting = run();
  const asked = run({ phase: 'question', question: question(null) });
  assert.equal(drawHoldUntil(voting, asked), 100 + COOP_DRAW_MS);
  assert.ok(COOP_DRAW_MS >= 1950, 'the draw takes about two seconds');
  // Re-asked (question to question), or alone: no hold.
  assert.equal(drawHoldUntil(asked, structuredClone(asked)), null);
  const solo = structuredClone(asked);
  solo.delve!.entrants = ['a'];
  const soloPrev = structuredClone(voting);
  soloPrev.delve!.entrants = ['a'];
  assert.equal(drawHoldUntil(soloPrev, solo), null);
});

test('a question asked again in place of the one the vote drew keeps its draw hold', () => {
  const voting = run();
  const asked = run({ phase: 'question', question: question(null) });
  const until = drawHoldUntil(voting, asked)!;
  const again = run({ phase: 'question', question: { ...question(null), askedAt: 200 } });
  assert.equal(drawHoldUntil(asked, again, { qid: 100, until }), until, 'its art failed while the draw played');
  assert.equal(drawHoldUntil(asked, again, null), null, 'nothing held, nothing kept');
  assert.equal(drawHoldUntil(asked, again, { qid: 50, until }), null, 'a hold for another question');
  assert.equal(drawHoldUntil(asked, { ...again, turnCount: 1 }, { qid: 100, until }), null, 'the next depth');
});

test("together, the clock after a draw waits half the slowest standing guest's round trip more, at most 500 ms", () => {
  assert.equal(drawClockFrom(1000, 200), 1100);
  assert.equal(drawClockFrom(1000, 5000), 1500);
  assert.equal(drawClockFrom(1000, -20), 1000);
});

test('a run picked up under other rules is marked mixed, unless it was decided already', () => {
  const old = (over: Partial<GameState> = {}) => {
    const s = run(over);
    s.delve!.ruleset = DELVE_RULESET - 1;
    return s;
  };
  assert.equal(underRuleset(old()).delve!.mixed, true);
  assert.equal(underRuleset(run()).delve!.mixed, undefined, 'the same rules');
  assert.equal(underRuleset(old({ phase: 'over' })).delve!.mixed, undefined, 'over');
  // Together, nobody standing: the end is a step away.
  const fallen = old({ phase: 'reveal' });
  fallen.delve!.losses = { a: [3, 3, 3], b: [2, 2, 2] };
  assert.equal(underRuleset(fallen).delve!.mixed, undefined);
  // Alone, the player perished.
  const solo = old({ phase: 'reveal' });
  solo.players = solo.players.slice(0, 1);
  solo.delve!.entrants = ['a'];
  solo.delve!.losses = { a: [4, 4, 4] };
  assert.equal(underRuleset(solo).delve!.mixed, undefined);
  solo.delve!.losses = { a: [4, 4] };
  assert.equal(underRuleset(solo).delve!.mixed, true, 'still standing');
});

test("the fuse sounds again once a Detonate's sound the host turned down has ended", () => {
  const detonate = { qid: 100, until: 1500 };
  assert.equal(fuseHeard(detonate, 100, 1000), true, 'still sounding: never heard twice over');
  // Over: the clock's own fuse, or a second press, sounds afresh.
  assert.equal(fuseHeard(detonate, 100, 1500), false);
  assert.equal(fuseHeard(detonate, 200, 1000), false, 'another question');
  assert.equal(fuseHeard(null, 100, 1000), false);
});

test('a run only opens with its gate on a screen that saw it start, never after a reload or a rejoin', () => {
  const lobby = run({ phase: 'lobby' });
  const choosing = run();
  assert.equal(runSeenStarting(lobby, choosing), 5);
  assert.equal(runSeenStarting(run({ phase: 'over' }), run({ phase: 'question', question: question(null) })), 5, 'again after a run ended');
  // Came in on it under way: no state before, or one already choosing.
  assert.equal(runSeenStarting(null, choosing), null);
  assert.equal(runSeenStarting(choosing, run({ turnCount: 1 })), null);
  // Not a Delve run.
  assert.equal(runSeenStarting(createGame('a'), { ...createGame('a'), phase: 'choosing' }), null);
});
