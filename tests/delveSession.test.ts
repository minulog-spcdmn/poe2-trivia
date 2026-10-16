import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_REASKS,
  CLOCK_CAP_MAX_MS,
  CLOCK_CAP_MIN_MS,
  COOP_DRAW_MS,
  DELVE_CLOCK_CAP_MS,
  artFirst,
  blastedAway,
  clockCap,
  clockStart,
  clockWaitsFor,
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
  pausedNow,
  reaskDelay,
} from '../src/lib/delveSession.ts';
import { DELVE_RULESET, VOTE_WINDOW_MS, questionTimer } from '../src/lib/delve.ts';
import { DEFAULT_SETTINGS, createGame, type GameState, type Question } from '../src/lib/game.ts';

function run(over: Partial<GameState> = {}): GameState {
  const s = createGame('a');
  s.players = ['a', 'b'].map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: ['a', 'b'], losses: {}, ruleset: DELVE_RULESET, startedAt: 5, excused: [], graceUntil: 0, votes: {}, voteFrom: null, missed: {}, revives: [] };
  return { ...s, ...over };
}

/** A question asked at 100 whose clock runs out at `deadline` (started at 0), or (null) hasn't started. */
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
  ...(deadline === null ? {} : { clockAt: 0 }),
  misses: [],
});

test('the clock starts when the queue drains, at most a few seconds in, plus half a round trip', () => {
  assert.equal(clockStart(1200, 1000, 100), 1250);
  assert.equal(clockStart(null, 1000, 100), 1000 + DELVE_CLOCK_CAP_MS + 50);
  assert.equal(clockStart(9000, 1000, 100), 1000 + DELVE_CLOCK_CAP_MS + 50);
  assert.equal(clockStart(1200, 1000, 4000), 1700, 'half a round trip is capped at 500 ms');
  assert.equal(clockStart(1200, 1000, -50), 1200);
  assert.equal(clockStart(null, 1000, 100, 2500), 1000 + 2500 + 50, 'a cap of its own (clockCap)');
});

test("the most the host waits for the art is a fifth of the question's time, 2 to 4 seconds", () => {
  const room = (mode: 'turns' | 'race', timer: number) => ({ ...createGame('a', { ...DEFAULT_SETTINGS, mode, timer }), phase: 'question' as const });
  assert.equal(clockCap(room('turns', 16)), 3200);
  assert.equal(clockCap(room('turns', 8)), CLOCK_CAP_MIN_MS, 'at least 2 s on a short clock');
  assert.equal(clockCap(room('turns', 32)), CLOCK_CAP_MAX_MS, 'at most 4 s on a long one');
  assert.equal(clockCap(room('turns', 0)), CLOCK_CAP_MAX_MS, 'untimed turns: the most');
  assert.equal(clockCap(room('race', 0)), 3200, "a race without a timer runs on the default's");
  assert.equal(clockCap(room('race', 64)), CLOCK_CAP_MAX_MS);
  // Delve: the depth's clock (or a find's), whatever the room's timer says.
  const s = run({ phase: 'question', question: question(null) });
  assert.equal(clockCap(s), Math.min(CLOCK_CAP_MAX_MS, Math.max(CLOCK_CAP_MIN_MS, Math.round(questionTimer(s) * 200))));
  assert.ok(clockCap(s) >= CLOCK_CAP_MIN_MS && clockCap(s) <= CLOCK_CAP_MAX_MS);
});

test('art that keeps failing is asked again a few times: at once, then after 2, 5 and 10 seconds, then no more by itself', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(reaskDelay), [0, 2000, 5000, 10_000, null, null]);
  assert.equal(AUTO_REASKS, 4);
  assert.equal(reaskDelay(AUTO_REASKS), null, 'an offline device does not spin through questions forever');
});

test('the clock waits for the art to reach those who answer: the player on turn, every racer, or as Delve has it', () => {
  const s = run({ phase: 'question', question: question(null) });
  assert.deepEqual(clockWaitsFor(s), ['a', 'b'], 'Delve together: everyone standing');
  assert.deepEqual(clockWaitsFor({ ...s, delve: null, turn: 1 }), ['b'], 'turns: the player on turn');
  assert.deepEqual(clockWaitsFor({ ...s, delve: null, settings: { ...s.settings, mode: 'race' } }), ['a', 'b'], 'race: everyone seated');
});

test('only a question whose clock has not started is asked again by itself, in every mode', () => {
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null) }), 100), true);
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(5000) }), 100), false, 'on the clock');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null) }), 99), false, 'another question');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(null), delve: null }), 100), true, 'outside Delve too');
  assert.equal(mayAutoReask(run({ phase: 'question', question: question(5000), delve: null }), 100), false, 'outside Delve, on the clock');
  // Untimed turns: the clock runs with no deadline.
  assert.equal(mayAutoReask(run({ phase: 'question', question: { ...question(null), clockAt: 0 }, delve: null }), 100), false, 'untimed, started');
  // Held still by the host's reload: not started again yet.
  assert.equal(mayAutoReask(run({ phase: 'question', question: { ...question(null), paused: { clockAt: 0, at: 50, left: 4000 } } }), 100), true, 'paused');
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

test('notices: a clock the reload holds still (a life given, the board and the game screen say)', () => {
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

  // The host's reload holds the clock still: a toast says so, together and alone.
  const asking = run({ phase: 'question', question: question(5000) });
  const held = run({ phase: 'question', question: { ...question(null), paused: { clockAt: 1000, at: 2000, left: 3000 } } });
  assert.deepEqual(delveNotices(asking, held), [{ kind: 'paused' }]);
  assert.deepEqual(delveNotices(held, structuredClone(held)), [], 'once, as it stops');
  const alone = (o: Partial<GameState>) => {
    const s = run(o);
    s.delve!.entrants = ['a'];
    return s;
  };
  assert.deepEqual(delveNotices(alone({ phase: 'question', question: question(5000) }), alone({ phase: 'question', question: held.question })), [{ kind: 'paused' }]);
  assert.deepEqual(delveNotices(asking, run({ phase: 'question', question: question(null) })), [], 'nothing held still');

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

test("a clock the host's reload holds still is told by its question, the same one on the screen", () => {
  const asking = run({ phase: 'question', question: question(5000) });
  const held = run({ phase: 'question', question: { ...question(null), paused: { clockAt: 1000, at: 2000, left: 3000 } } });
  assert.equal(pausedNow(asking, held), true);
  assert.equal(pausedNow(null, held), false, "the host's own reload: nothing was on its screen");
  assert.equal(pausedNow(asking, { ...held, question: { ...held.question!, askedAt: 200 } }), false, 'another question');
  assert.equal(pausedNow(held, run({ phase: 'question', question: question(9000) })), false, 'carrying on');
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

test("a run's start is only told on a screen that saw it start, never after a reload or a rejoin", () => {
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
