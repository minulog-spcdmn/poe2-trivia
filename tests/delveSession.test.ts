import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_REASKS,
  COOP_DRAW_MS,
  DELVE_CLOCK_CAP_MS,
  artFirst,
  cleanArtWanted,
  clockStart,
  delveNotices,
  drained,
  drawHoldUntil,
  expireIn,
  inventoryChanges,
  livesLost,
  mayAutoReask,
  reaskDelay,
  setAside,
} from '../src/lib/delveSession.ts';
import { VOTE_WINDOW_MS } from '../src/lib/delve.ts';
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

test('notices: a question set aside by a reload, and a life given to bring someone back', () => {
  const prev = run();
  const lost = run();
  lost.delve!.losses = { b: [3] };
  assert.deepEqual(delveNotices(prev, lost), [], 'a life lost speaks for itself');
  assert.deepEqual(livesLost(prev, lost), [{ playerId: 'b', left: 2, lost: 1 }]);
  const caved = run();
  caved.delve!.losses = { b: [3, 3] };
  assert.deepEqual(livesLost(prev, caved), [{ playerId: 'b', left: 1, lost: 2 }], 'a cave-in takes two at once');

  // A revive: the giver's life is given, not lost; the one brought back gets a notice.
  const down = run();
  down.delve!.losses = { b: [1, 2, 3] };
  const back = structuredClone(down);
  back.delve!.revives = [{ by: 'a', to: 'b', depth: 3, fell: 3, at: 9 }];
  assert.deepEqual(delveNotices(down, back), [{ kind: 'revived', playerId: 'b', by: 'a' }]);
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

test('plain art is made ahead only when a stick of dynamite could go off on the question', () => {
  const veiled = { ...question(5000), veil: { size: 5, seconds: 8, seed: 1 } };
  const s = run({ phase: 'question', question: veiled });
  assert.equal(cleanArtWanted(s, 'off'), false, 'nobody holds dynamite');
  s.delve!.inventory = { b: { wards: 0, flares: 0, dynamite: 1, shards: 0 } };
  assert.equal(cleanArtWanted(s, 'off'), true, 'together: anyone standing who holds some');
  assert.equal(cleanArtWanted({ ...s, question: { ...veiled, find: 'azurite' } }, 'off'), false, "never on a find's question");
  assert.equal(cleanArtWanted({ ...s, question: { ...veiled, blasted: true } }, 'off'), false, 'it went off already');
  assert.equal(cleanArtWanted({ ...s, question: question(5000) }, 'off'), false, 'nothing for a blast to clear');
  assert.equal(cleanArtWanted({ ...s, question: question(5000) }, 'all'), true, 'grayscale art is cleared too');
  const down = structuredClone(s);
  down.delve!.losses = { b: [1, 2, 3] };
  assert.equal(cleanArtWanted(down, 'off'), false, 'a holder who perished holds nothing that goes off');
  const solo = structuredClone(s);
  solo.delve!.entrants = ['a'];
  assert.equal(cleanArtWanted(solo, 'off'), false, "alone, only the player's own dynamite");
  solo.turn = 1;
  assert.equal(cleanArtWanted(solo, 'off'), true);
});

test('co-op notices: a wrong pick, a perish and a flare from a pack (dynamite the question says itself)', () => {
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
  next.question!.blasted = true;
  next.question!.blastedBy = 'b';
  assert.deepEqual(delveNotices(prev, next), [
    { kind: 'struck', playerId: 'a', lives: 0, wards: 1 },
    { kind: 'flare', playerId: 'a' },
    { kind: 'perished', playerId: 'b', depth: 7, revivable: true },
  ]);
  // Alone the player's own screen says all of it.
  const [soloPrev, soloNext] = [structuredClone(prev), structuredClone(next)];
  soloPrev.delve!.entrants = soloNext.delve!.entrants = ['a'];
  assert.deepEqual(delveNotices(soloPrev, soloNext), []);
  // A teammate with one life left can't give it: nobody can bring them back.
  const low = structuredClone(next);
  low.delve!.losses.a = [3, 5];
  assert.deepEqual(delveNotices(prev, low).at(-1), { kind: 'perished', playerId: 'b', depth: 7, revivable: false });
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
