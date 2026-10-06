// Delve together is co-op: the team votes for a card, everyone standing
// answers one shared question per depth (a wrong pick strikes its option for
// everyone, at a life), items stay each player's but go off for the team, and
// a player with lives to spare can bring back a teammate who perished. The run
// ends when nobody stands; the team's depth is where the last of them perished.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLAST_PAUSE_MS,
  DELVE_IDLE_ROUNDS,
  DELVE_LIVES,
  DELVE_RESUME_GRACE_MS,
  FLARE_MS,
  REVIVE_FROM,
  VOTE_WINDOW_MS,
  blastAtMs,
  delveStandings,
  delveTeam,
  expectedVoters,
  fellAt,
  findTimer,
  flaresOf,
  dynamiteOf,
  findOffers,
  findOn,
  inventoryOf,
  isIdle,
  livesOf,
  perishesOf,
  reviveProblem,
  standingIds,
  teamDepth,
  veinWindow,
  voteClosesAt,
  voteDone,
  wardsOf,
  type FindKind,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, ActionError, Engine, createGame, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { delveNotices, dynamiteIn, expireIn, flareIn, inventoryChanges, livesLost } from '../src/lib/delveSession.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };
const right = (q: Question) => q.options.indexOf(q.itemId);
/** The wrong options of a question, by index. */
const wrongs = (q: Question) => q.options.flatMap((id, i) => (id === q.itemId ? [] : [i]));

function seeded(seed: number) {
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const silently = (fn: () => unknown, message?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent && (!message || message.test(e.message)));
const loudly = (fn: () => unknown, message?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && !e.silent && (!message || message.test(e.message)));

/** An online co-op run of `n` players p0 (the host) to p(n-1), on a clock the test moves. */
function team(n = 3, opts: { seed?: number; depth?: number } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 5), now: () => clock.now, fakes });
  let s: GameState = createGame('p0', SETTINGS);
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name: `Delver ${'ABCDEFGH'[i]}` }, `p${i}`);
  s = engine.apply(s, { type: 'start' }, 'p0');
  // Seats in name order, so lists in seat order read plainly (the start shuffles them).
  s = { ...s, players: [...s.players].sort((a, b) => a.id.localeCompare(b.id)) };
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
    edit(fn: (s: GameState) => void) {
      const c = structuredClone(s);
      fn(c);
      s = c;
    },
    give(id: string, inv: Partial<Inventory>) {
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { ...NONE, ...inv }));
    },
    vote: (id: string, category = s.offered[0]) => h.act({ type: 'vote', category }, id),
    /** The vote settled by the host's own tooling (a trusted pick), on a card that is no find unless `find`. */
    ask(find?: FindKind) {
      if (find) h.edit((c) => (c.delve!.finds = [{ category: c.offered[0], kind: find }]));
      h.act({ type: 'pick', category: find ? s.offered[0] : s.offered.find((c) => !findOn(s, c))! });
      h.act({ type: 'clock', askedAt: s.question!.askedAt });
      return s.question!;
    },
    pickAs: (id: string, index: number) => h.act({ type: 'answer', index, askedAt: s.question!.askedAt }, id),
    timeOut() {
      h.clock.now = s.question!.deadline! + ANSWER_GRACE_MS;
      return h.act({ type: 'answer', index: null });
    },
    next: () => h.act({ type: 'next' }),
    /** Everyone's losses set by hand: `lives` left each. */
    lives(byId: Record<string, number>) {
      h.edit((c) => {
        for (const [id, n] of Object.entries(byId)) c.delve!.losses[id] = Array(DELVE_LIVES - n).fill(1);
      });
    },
  };
  if (opts.depth) h.edit((c) => (c.round = opts.depth!));
  return h;
}

// ---- the vote ---------------------------------------------------------------

test('a run of two or more online is co-op: everyone standing votes, nobody has a turn', () => {
  const h = team(3);
  const d = h.s.delve!;
  assert.deepEqual([d.votes, d.voteFrom, d.missed, d.revives], [{}, null, {}, []]);
  assert.equal(h.s.offered.length, 3);
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1', 'p2']);
  // Nobody picks alone, the host included; the trusted pick is the host's own tooling.
  loudly(() => h.act({ type: 'pick', category: h.s.offered[0] }, 'p1'), /Vote/);
  loudly(() => h.act({ type: 'pick', category: h.s.offered[0] }, 'p0'), /Vote/);
});

test('the vote closes the moment everyone it waits for has voted, and votes can change until then', () => {
  const h = team(3);
  const [a, b] = h.s.offered;
  h.vote('p0', a);
  assert.equal(h.s.delve!.voteFrom, h.clock.now);
  assert.equal(voteClosesAt(h.s), h.clock.now + VOTE_WINDOW_MS);
  assert.equal(expireIn(h.s, h.clock.now), VOTE_WINDOW_MS);
  h.clock.now += 1000;
  h.vote('p0', b);
  assert.deepEqual(h.s.delve!.votes, { p0: b });
  assert.equal(h.s.delve!.voteFrom, h.clock.now - 1000, 'the window runs from the first vote');
  h.vote('p1', b);
  assert.equal(h.s.phase, 'choosing');
  assert.equal(voteDone(h.s, h.clock.now), false);
  h.vote('p2', b);
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.category, b);
  // The votes stay to show how it went, until the next vote opens.
  assert.deepEqual(h.s.delve!.votes, { p0: b, p1: b, p2: b });
  assert.equal(voteClosesAt(h.s), null);
  // Too late to vote now: dropped quietly.
  silently(() => h.vote('p1', a), /late/);
});

test('otherwise the vote closes six seconds after the first vote', () => {
  const h = team(3);
  const card = h.s.offered[2];
  h.clock.now += 60_000;
  h.vote('p1', card);
  h.clock.now += VOTE_WINDOW_MS - 300;
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'choosing', 'not before the window ends');
  loudly(() => h.act({ type: 'expire' }, 'p1'), /Not allowed/);
  h.clock.now += 300;
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.category, card);
  assert.deepEqual(h.s.delve!.missed, { p0: 1, p1: 0, p2: 1 });
});

test('nobody votes, nothing is picked: the cards wait for as long as it takes', () => {
  const h = team(3);
  const offered = h.s.offered;
  assert.equal(voteClosesAt(h.s), null);
  assert.equal(expireIn(h.s, h.clock.now), null);
  h.clock.now += 3_600_000;
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual(h.s.offered, offered);
  // Away all that while costs nobody anything.
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  h.act({ type: 'expire' });
  assert.equal(livesOf(h.s, 'p2'), DELVE_LIVES);
  assert.equal(h.s.phase, 'choosing');
});

test('a player who lets three votes in a row pass is idle, and waited for again once they vote', () => {
  const h = team(3);
  const round = () => {
    h.vote('p0');
    h.vote('p1');
    assert.equal(h.s.phase, 'choosing', 'waiting for p2');
    h.clock.now += VOTE_WINDOW_MS;
    h.act({ type: 'expire' });
    h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
    h.pickAs('p0', right(h.s.question!));
    h.next();
  };
  for (let i = 0; i < DELVE_IDLE_ROUNDS; i++) {
    assert.equal(isIdle(h.s, 'p2'), false);
    round();
  }
  assert.equal(h.s.delve!.missed!.p2, DELVE_IDLE_ROUNDS);
  assert.equal(isIdle(h.s, 'p2'), true);
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1']);
  // Idle: not waited for once the others have voted.
  h.vote('p0');
  h.vote('p1');
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.delve!.missed!.p2, DELVE_IDLE_ROUNDS + 1);
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.pickAs('p1', right(h.s.question!));
  h.next();
  // An idle player still may vote, and is waited for again from then on.
  h.vote('p2');
  assert.equal(isIdle(h.s, 'p2'), false);
  h.vote('p0');
  h.vote('p1');
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.delve!.missed!.p2, 0);
});

test('a vote never waits for someone away, and someone going away can close it', () => {
  const h = team(3);
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1']);
  h.vote('p0');
  h.vote('p1');
  assert.equal(h.s.phase, 'question');

  const g = team(3);
  g.vote('p0');
  g.vote('p1');
  g.act({ type: 'connection', playerId: 'p2', connected: false });
  assert.equal(g.s.phase, 'question');

  // Kicked or gone: their vote goes with them.
  const k = team(3);
  k.vote('p2');
  k.act({ type: 'remove', playerId: 'p2' }, 'p0');
  assert.deepEqual(k.s.delve!.votes, {});
  assert.equal(k.s.delve!.voteFrom, null);
});

test('the raffle: one ticket per vote, drawn with the engine\'s roll, so two votes are twice the chance', () => {
  const tally = new Map<string, number>();
  let offered: string[] = [];
  for (let seed = 1; seed <= 600; seed++) {
    const h = team(3, { seed: 3 });
    // The same cards each time, a different roll for the draw.
    (h.engine as unknown as { rng: () => number }).rng = seeded(seed);
    offered = h.s.offered;
    h.vote('p0', offered[0]);
    h.vote('p1', offered[0]);
    h.vote('p2', offered[1]);
    tally.set(h.s.question!.category, (tally.get(h.s.question!.category) ?? 0) + 1);
  }
  const share = (tally.get(offered[0]) ?? 0) / 600;
  assert.ok(Math.abs(share - 2 / 3) < 0.07, `two votes of three won ${share}`);
  assert.equal(tally.get(offered[2]) ?? 0, 0, 'a card nobody voted for never comes up');
  // The same roll draws the same card.
  const draw = () => {
    const h = team(4, { seed: 9 });
    h.s.offered.forEach((c, i) => h.vote(`p${i}`, c));
    h.vote('p3', h.s.offered[0]);
    return h.s.question!.category;
  };
  assert.equal(draw(), draw());
});

test('only those standing vote, for a card on offer, as themselves', () => {
  const h = team(3);
  h.lives({ p2: 0 });
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1']);
  loudly(() => h.vote('p2'), /standing/);
  loudly(() => h.vote('p0', 'Not a category'), /not on offer/);
  loudly(() => h.act({ type: 'vote', category: h.s.offered[0] }, null), /not in this game/);
  loudly(() => h.vote('ghost'), /not in this game/);
  assert.deepEqual(h.s.delve!.votes, {});
  // Alone there is nothing to vote on.
  const solo = team(1);
  loudly(() => solo.vote('p0'), /nothing to vote/);
});

test('after a host reload, a vote waits through the grace for those it cut off, and a question is set aside', () => {
  const h = team(3);
  const offered = h.s.offered;
  const q = h.ask();
  h.pickAs('p1', wrongs(q)[0]);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
  for (const id of ['p1', 'p2']) h.act({ type: 'connection', playerId: id, connected: false });
  h.act({ type: 'resumed' });
  // The question someone cut off may have answered is set aside; the same cards come back.
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.question, null);
  assert.deepEqual(h.s.offered, offered);
  assert.deepEqual(h.s.recentCategories, [], 'its pick is taken back');
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES, 'a wrong answer given on it costs nothing');
  assert.equal(h.s.delve!.snapshot, undefined, 'its snapshot is gone with it');
  assert.deepEqual(delveNotices({ ...h.s, phase: 'question', question: q }, h.s), [{ kind: 'setAside', playerId: '' }]);
  silently(() => h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0'), /late/);
  // The vote waits for those cut off until the grace ends.
  assert.deepEqual([...h.s.delve!.excused].sort(), ['p1', 'p2']);
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1', 'p2']);
  h.vote('p0');
  assert.equal(h.s.phase, 'choosing');
  assert.equal(voteClosesAt(h.s), h.clock.now + DELVE_RESUME_GRACE_MS);
  // One comes back and votes; the other never does, and the grace runs out.
  h.act({ type: 'join', playerId: 'p1', name: 'back', returning: true }, 'p1');
  assert.deepEqual(h.s.delve!.excused, ['p2']);
  h.vote('p1');
  assert.equal(h.s.phase, 'choosing');
  h.clock.now += DELVE_RESUME_GRACE_MS;
  assert.equal(voteDone(h.s, h.clock.now), true);
  h.act({ type: 'expire' });
  assert.equal(h.s.phase, 'question');
});

// ---- the question ------------------------------------------------------------

test('everyone standing answers the one question: a wrong pick strikes its option for all, at a life', () => {
  const h = team(3);
  const q = h.ask();
  const [w1, w2] = wrongs(q);
  silently(() => h.act({ type: 'answer', index: w1, askedAt: q.askedAt + 1 }, 'p1'), /late/);
  h.pickAs('p1', w1);
  assert.equal(h.s.phase, 'question');
  assert.deepEqual(h.s.question!.struck, [{ index: w1, by: 'p1', at: h.clock.now, lives: 1, wards: 0 }]);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);
  // Once a question each, and a struck option is not there to pick: both dropped at no cost.
  silently(() => h.pickAs('p1', w2), /already answered/);
  silently(() => h.pickAs('p2', w1), /already picked/);
  assert.equal(livesOf(h.s, 'p2'), DELVE_LIVES);
  assert.equal(h.s.question!.struck!.length, 1);
  // Nobody gives up together; the time-out is the host's.
  silently(() => h.act({ type: 'answer', index: null, askedAt: q.askedAt }, 'p2'), /Pick an answer/);
  loudly(() => h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, null), /Only players/);
  // The first right pick clears the depth.
  h.pickAs('p2', right(q));
  const r = h.s.reveal!;
  assert.equal(h.s.phase, 'reveal');
  assert.deepEqual([r.correct, r.winnerId, r.chosenIndex, r.correctIndex, r.timedOut], [true, 'p2', right(q), right(q), false]);
  assert.deepEqual(r.hits, [{ playerId: 'p1', lives: 1, wards: 0, timedOut: false }]);
  assert.equal(h.s.players.find((p) => p.id === 'p2')!.score, 1);
  assert.equal(h.s.players.find((p) => p.id === 'p2')!.streak, 1);
  // A pick on its way as it closed is dropped quietly.
  silently(() => h.pickAs('p0', w2), /late/);
  // One depth deeper, for everyone at once.
  silently(() => h.act({ type: 'next' }, 'p1'), /host/);
  h.next();
  assert.equal(h.s.round, 2);
  assert.equal(h.s.phase, 'choosing');
  assert.deepEqual(h.s.delve!.votes, {});
});

test('no answer before the clock, none after it, none from the perished', () => {
  const h = team(3);
  h.lives({ p2: 0 });
  h.act({ type: 'pick', category: h.s.offered[0] });
  const q = h.s.question!;
  silently(() => h.pickAs('p1', right(q)), /early/);
  h.act({ type: 'clock', askedAt: q.askedAt });
  loudly(() => h.pickAs('p2', right(q)), /standing/);
  loudly(() => h.pickAs('ghost', right(q)), /not in this game/);
  h.clock.now = h.s.question!.deadline! + ANSWER_GRACE_MS + 1;
  silently(() => h.pickAs('p1', right(q)), /late/);
  assert.equal(h.s.phase, 'question');
});

test('everyone standing wrong ends the question, with nobody right', () => {
  const h = team(3);
  const q = h.ask();
  const w = wrongs(q);
  h.pickAs('p0', w[0]);
  h.pickAs('p2', w[1]);
  assert.equal(h.s.phase, 'question');
  h.pickAs('p1', w[2]);
  const r = h.s.reveal!;
  assert.deepEqual([h.s.phase, r.correct, r.timedOut, r.winnerId, r.chosenIndex], ['reveal', false, false, null, null]);
  assert.deepEqual(
    r.hits!.map((x) => x.playerId),
    ['p0', 'p2', 'p1'],
  );
  for (const id of ['p0', 'p1', 'p2']) assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
  // Someone perishing on their wrong pick has answered too.
  const g = team(2);
  g.lives({ p1: 1 });
  const q2 = g.ask();
  g.pickAs('p0', wrongs(q2)[0]);
  g.pickAs('p1', wrongs(q2)[1]);
  assert.equal(g.s.phase, 'reveal');
  assert.equal(fellAt(g.s, 'p1'), 1);
});

test('the time-out costs everyone standing who never answered, the away included, and nobody else', () => {
  const h = team(4);
  h.lives({ p3: 0 });
  const q = h.ask();
  h.pickAs('p1', wrongs(q)[0]);
  h.act({ type: 'connection', playerId: 'p2', connected: false });
  // Away: still waited for, so the question runs on.
  assert.equal(h.s.phase, 'question');
  const before = h.s;
  h.timeOut();
  const r = h.s.reveal!;
  assert.equal(r.timedOut, true);
  assert.deepEqual(
    r.hits,
    [
      { playerId: 'p1', lives: 1, wards: 0, timedOut: false },
      { playerId: 'p0', lives: 1, wards: 0, timedOut: true },
      { playerId: 'p2', lives: 1, wards: 0, timedOut: true },
    ],
  );
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1'), livesOf(h.s, 'p2'), livesOf(h.s, 'p3')], [2, 2, 2, 0]);
  assert.deepEqual(
    livesLost(before, h.s).map((x) => x.playerId),
    ['p0', 'p2'],
  );
});

test('an Azurite Vein: the first right pick mines the ward (fast) or a shard, and a wrong one caves in for two, wards first', () => {
  const h = team(3, { depth: 20 });
  h.give('p1', { wards: 2 });
  h.give('p2', { wards: 1 });
  const q = h.ask('azurite');
  const [w1, w2] = wrongs(q);
  h.pickAs('p1', w1);
  assert.deepEqual([livesOf(h.s, 'p1'), wardsOf(h.s, 'p1')], [DELVE_LIVES, 0], 'both losses warded');
  h.pickAs('p2', w2);
  assert.deepEqual([livesOf(h.s, 'p2'), wardsOf(h.s, 'p2')], [DELVE_LIVES - 1, 0], 'one warded, one a life');
  h.clock.now = q.clockAt! + veinWindow(findTimer('azurite', 20));
  h.pickAs('p0', right(q));
  const r = h.s.reveal!;
  assert.equal(r.winnerId, 'p0');
  assert.equal(r.gained, 'wards');
  assert.equal(r.caveIn, true);
  assert.deepEqual(r.hits, [
    { playerId: 'p1', lives: 0, wards: 2, timedOut: false },
    { playerId: 'p2', lives: 1, wards: 1, timedOut: false },
  ]);
  assert.equal(wardsOf(h.s, 'p0'), 1);

  // Slower: a shard. Timed out: a cave-in for each who never answered.
  const slow = team(2, { depth: 20 });
  const sq = slow.ask('azurite');
  slow.clock.now = sq.clockAt! + veinWindow(findTimer('azurite', 20)) + 1;
  slow.pickAs('p0', right(sq));
  assert.equal(slow.s.reveal!.gained, 'shards');
  const late = team(2, { depth: 20 });
  late.ask('azurite');
  late.timeOut();
  assert.deepEqual([livesOf(late.s, 'p0'), livesOf(late.s, 'p1')], [1, 1]);
  assert.equal(late.s.reveal!.caveIn, true);
});

test("a find is offered while anyone standing has room for its item, and pays whoever clears it", () => {
  const h = team(2, { depth: 20 });
  h.give('p1', { flares: 1 });
  const q = h.ask('flare');
  h.pickAs('p1', right(q));
  assert.equal(flaresOf(h.s, 'p1'), 2);
  assert.equal(flaresOf(h.s, 'p0'), 0, 'only the one who cleared it');
  // Nobody with room: never offered.
  let veins = 0;
  const full = team(2, { depth: 50, seed: 2 });
  full.give('p0', { wards: 3 });
  full.give('p1', { wards: 3 });
  for (let i = 0; i < 200; i++) {
    if (findOffers(full.s).some((f) => f.kind === 'azurite')) veins++;
    full.edit((c) => (c.round = 50));
    const fq = full.ask();
    full.pickAs('p0', right(fq));
    full.next();
  }
  assert.equal(veins, 0);
});

test('dynamite counts from the options still in play, as if the struck were gone already, and leaves two or more', () => {
  for (const [strikes, gone] of [
    [0, 4],
    [2, 3],
    [3, 2],
  ] as const) {
    const h = team(4, { seed: 5, depth: 31 });
    h.give('p0', { dynamite: 1 });
    const q = h.ask();
    assert.equal(q.options.length, 8);
    for (let i = 0; i < strikes; i++) h.pickAs(`p${i + 1}`, wrongs(q)[i]);
    h.clock.now = q.clockAt! + blastAtMs(h.s);
    h.act({ type: 'dynamite', askedAt: q.askedAt });
    const b = h.s.question!;
    // Eight, six or five in play: half of them, rounded down, every one wrong.
    assert.equal(b.blownAway!.length, gone, `${strikes} struck`);
    assert.ok(!b.blownAway!.includes(right(q)));
    assert.ok(wrongs(q).slice(0, strikes).every((i) => !b.blownAway!.includes(i)), 'never a struck one');
    assert.ok(8 - strikes - gone >= 2, 'the answer and a wrong one stay');
  }
});

test('perishing drops everything a player carries, for good', () => {
  const h = team(2);
  h.lives({ p1: 1 });
  h.give('p1', { flares: 2, dynamite: 1, shards: 1 });
  const before = h.s;
  const q = h.ask();
  h.pickAs('p1', wrongs(q)[0]);
  assert.equal(livesOf(h.s, 'p1'), 0);
  assert.deepEqual(inventoryOf(h.s, 'p1'), NONE);
  assert.deepEqual(
    inventoryChanges(before, h.s).map((c) => [c.item, c.change, c.left]),
    [
      ['flares', 'used', 0],
      ['dynamite', 'used', 0],
      ['shards', 'used', 0],
    ],
  );
  // Brought back, they start over with nothing.
  h.pickAs('p0', right(q));
  h.act({ type: 'revive', target: 'p1' }, 'p0');
  assert.equal(livesOf(h.s, 'p1'), 1);
  assert.deepEqual(inventoryOf(h.s, 'p1'), NONE);
  // Alone it changes nothing: the run is over anyway.
  const solo = team(1);
  solo.lives({ p0: 1 });
  solo.give('p0', { flares: 1 });
  const sq = solo.ask();
  solo.pickAs('p0', wrongs(sq)[0]);
  assert.deepEqual(inventoryOf(solo.s, 'p0'), NONE);
});

// ---- items -------------------------------------------------------------------

test("a flare burns at 0 from a random holder's pack, and gives everyone five seconds more", () => {
  const spent = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const h = team(3, { seed, depth: 20 });
    h.give('p1', { flares: 1 });
    h.give('p2', { flares: 2 });
    const q = h.ask();
    assert.equal(flareIn(h.s, h.clock.now), q.deadline! - h.clock.now);
    h.clock.now = q.deadline! - 1000;
    h.act({ type: 'flare', askedAt: q.askedAt });
    assert.equal(h.s.question!.flared, undefined, 'not before 0');
    h.clock.now = q.deadline!;
    h.act({ type: 'flare', askedAt: q.askedAt });
    const by = h.s.question!.flaredBy!;
    assert.ok(by === 'p1' || by === 'p2', by);
    spent.add(by);
    assert.equal(flaresOf(h.s, 'p1') + flaresOf(h.s, 'p2'), 2);
    assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS);
    assert.equal(flareIn(h.s, h.clock.now), null, 'once a question');
    // Everyone answers in the flare's time.
    h.clock.now += FLARE_MS - 10;
    h.pickAs('p0', right(q));
    assert.equal(h.s.reveal!.correct, true);
  }
  assert.deepEqual([...spent].sort(), ['p1', 'p2'], 'either holder');
  // The same roll spends the same one.
  const who = () => {
    const h = team(3, { seed: 4, depth: 20 });
    h.give('p0', { flares: 1 });
    h.give('p2', { flares: 1 });
    h.ask();
    h.clock.now = h.s.question!.deadline!;
    h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
    return h.s.question!.flaredBy;
  };
  assert.equal(who(), who());
});

test('the time-out finds a flare due and burns it instead; a holder who answered (or perished) still counts, an empty team does not', () => {
  const h = team(2, { depth: 20 });
  h.give('p0', { flares: 1 });
  const q = h.ask();
  h.pickAs('p0', wrongs(q)[0]);
  // Only p1 still to answer; p0's flare burns for them.
  h.timeOut();
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.flaredBy, 'p0');
  assert.equal(h.s.question!.deadline, h.clock.now + FLARE_MS);
  h.timeOut();
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(livesOf(h.s, 'p1'), DELVE_LIVES - 1);

  // Nobody here left to answer: no flare (it helps nobody).
  const g = team(2, { depth: 20 });
  g.give('p1', { flares: 1 });
  const gq = g.ask();
  g.pickAs('p0', wrongs(gq)[0]);
  g.act({ type: 'connection', playerId: 'p1', connected: false });
  assert.equal(flareIn(g.s, g.clock.now), null);
  g.timeOut();
  assert.equal(g.s.reveal!.timedOut, true);
  assert.equal(flaresOf(g.s, 'p1'), 1);
});

test("a guest's right answer on its way as the flare burnt gives it back; the host's own in the flare's time does not", () => {
  for (const [who, after, kept] of [
    ['p1', ANSWER_GRACE_MS, true],
    ['p1', ANSWER_GRACE_MS + 1, false],
    ['p0', 10, false],
  ] as const) {
    const h = team(2, { depth: 20 });
    h.give('p0', { flares: 1 });
    const q = h.ask();
    h.clock.now = q.deadline!;
    h.act({ type: 'flare', askedAt: q.askedAt });
    h.clock.now += after;
    h.pickAs(who, right(q));
    assert.equal(h.s.reveal!.correct, true);
    assert.equal(flaresOf(h.s, 'p0'), kept ? 1 : 0, `${who} ${after} ms after`);
    assert.equal(h.s.question!.flared, kept ? undefined : true);
  }
});

test("dynamite goes off at half the clock from a random holder's pack: half the options still in play, all wrong, and the pause", () => {
  const spent = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const h = team(3, { seed, depth: 31 });
    h.give('p0', { dynamite: 1 });
    h.give('p2', { dynamite: 1 });
    const q = h.ask();
    assert.equal(q.options.length, 8);
    h.pickAs('p1', wrongs(q)[0]);
    const due = q.clockAt! + blastAtMs(h.s);
    assert.equal(dynamiteIn(h.s, h.clock.now), due - h.clock.now);
    h.clock.now = due;
    h.act({ type: 'dynamite', askedAt: q.askedAt });
    const b = h.s.question!;
    assert.equal(b.blasted, true);
    spent.add(b.blastedBy!);
    assert.equal(dynamiteOf(h.s, 'p0') + dynamiteOf(h.s, 'p2'), 1);
    // Seven wrong, one struck: seven still in play (the answer and six wrong), so three go.
    assert.equal(b.blownAway!.length, 3);
    assert.ok(!b.blownAway!.includes(wrongs(q)[0]), 'never the struck one');
    assert.ok(!b.blownAway!.includes(right(q)), 'never the answer');
    assert.equal(b.deadline, q.deadline! + BLAST_PAUSE_MS);
    assert.deepEqual(b.held, { from: due, until: due + BLAST_PAUSE_MS });
    // Picking one it blew away is still a wrong pick (a click may cross the blast).
    h.pickAs('p2', b.blownAway![0]);
    assert.equal(livesOf(h.s, 'p2'), DELVE_LIVES - 1);
  }
  assert.deepEqual([...spent].sort(), ['p0', 'p2']);
  // Never on a find's question.
  const f = team(2, { depth: 20 });
  f.give('p1', { dynamite: 1, flares: 1 });
  const fq = f.ask('flare');
  assert.equal(dynamiteIn(f.s, f.clock.now), null);
  assert.equal(flareIn(f.s, f.clock.now), null);
  f.clock.now = fq.clockAt! + blastAtMs(f.s);
  f.act({ type: 'dynamite', askedAt: fq.askedAt });
  assert.equal(f.s.question!.blasted, undefined);
  assert.equal(dynamiteOf(f.s, 'p1'), 1);
});

// ---- revives -----------------------------------------------------------------

test('a standing player with two lives or more can bring back a perished teammate, between questions', () => {
  const h = team(3);
  h.lives({ p1: 0, p2: 1 });
  h.edit((c) => (c.delve!.losses.p1 = [1, 1, 1]));
  assert.deepEqual(standingIds(h.s), ['p0', 'p2']);
  loudly(() => h.act({ type: 'revive', target: 'p1' }, 'p2'), new RegExp(`${REVIVE_FROM} lives`));
  loudly(() => h.act({ type: 'revive', target: 'p0' }, 'p2'), /still standing/);
  loudly(() => h.act({ type: 'revive', target: 'p1' }, 'p1'), /teammate/);
  loudly(() => h.act({ type: 'revive', target: 'p1' }, null), /player/);
  loudly(() => h.act({ type: 'revive', target: 'ghost' }, 'p0'), /not in this run/);
  const before = h.s;
  h.clock.now += 500;
  h.act({ type: 'revive', target: 'p1' }, 'p0');
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1')], [DELVE_LIVES - 1, 1]);
  assert.deepEqual(h.s.delve!.revives, [{ by: 'p0', to: 'p1', depth: 1, fell: 1, at: h.clock.now }]);
  assert.equal(fellAt(h.s, 'p1'), null);
  assert.deepEqual(perishesOf(h.s, 'p1'), [1], 'where they perished is kept');
  assert.deepEqual(delveNotices(before, h.s), [{ kind: 'revived', playerId: 'p1', by: 'p0' }]);
  assert.deepEqual(livesLost(before, h.s), [], 'a life given is not a life lost');
  assert.deepEqual(h.s.delve!.losses.p0 ?? [], [], 'nor is it in the losses');
  // Back in the vote at once.
  assert.deepEqual(expectedVoters(h.s, h.clock.now), ['p0', 'p1', 'p2']);
  // Never during a question.
  h.lives({ p2: 0 });
  h.ask();
  loudly(() => h.act({ type: 'revive', target: 'p2' }, 'p0'), /question/);
  // In the reveal, yes; the one brought back answers the next depth.
  h.pickAs('p0', right(h.s.question!));
  h.act({ type: 'revive', target: 'p2' }, 'p0');
  assert.equal(livesOf(h.s, 'p0'), 1);
  h.next();
  const q = h.ask();
  h.pickAs('p2', right(q));
  assert.equal(h.s.reveal!.winnerId, 'p2');
  // Alone there is nobody to revive.
  assert.equal(reviveProblem(team(1).s, 'p0', 'p0'), 'Only a run together has revives.');
});

test('lives stay consistent through revives: lost, given and received, and a second perish', () => {
  const h = team(2, { depth: 4 });
  h.lives({ p1: 1 });
  h.edit((c) => (c.delve!.losses.p1 = [2, 3]));
  const q = h.ask();
  h.pickAs('p1', wrongs(q)[0]);
  assert.equal(fellAt(h.s, 'p1'), 4);
  h.pickAs('p0', right(q));
  h.act({ type: 'revive', target: 'p1' }, 'p0');
  h.next();
  // Depth 5: the time-out takes p1's one life and one of p0's two.
  h.ask();
  h.timeOut();
  assert.deepEqual(h.s.delve!.losses, { p0: [5], p1: [2, 3, 4, 5] });
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1')], [1, 0]);
  assert.equal(fellAt(h.s, 'p1'), 5);
  assert.deepEqual(perishesOf(h.s, 'p1'), [4, 5]);
  // p0 has a single life: nothing more to give.
  assert.match(reviveProblem(h.s, 'p0', 'p1')!, /lives/);
  const rows = delveStandings(h.s);
  assert.deepEqual(
    rows.map((r) => [r.id, r.lives, r.losses, r.perished, r.given, r.revived]),
    [
      ['p0', 1, [5], [], 1, 0],
      ['p1', 0, [2, 3, 4, 5], [4, 5], 0, 1],
    ],
  );
});

// ---- the end -----------------------------------------------------------------

test('the run ends when nobody stands: no winner, one depth for the team, where the last of them perished', () => {
  const h = team(3);
  h.lives({ p0: 1, p1: 2, p2: 3 });
  for (let depth = 1; depth <= 3; depth++) {
    h.ask();
    h.timeOut();
    h.next();
  }
  assert.equal(h.s.phase, 'over');
  assert.deepEqual(h.s.winners, []);
  assert.deepEqual([fellAt(h.s, 'p0'), fellAt(h.s, 'p1'), fellAt(h.s, 'p2')], [1, 2, 3]);
  assert.equal(teamDepth(h.s), 3);
  const t = delveTeam(h.s);
  assert.equal(t.depth, 3);
  assert.equal(t.perished, true);
  assert.deepEqual(
    t.players.map((r) => [r.id, r.depth, r.rank]),
    [
      ['p2', 3, 1],
      ['p1', 2, 2],
      ['p0', 1, 3],
    ],
  );
  assert.equal('lastStanding' in h.s.delve!, false, 'no last one standing');

  // While anyone stands, the team is at the depth in play.
  const g = team(2, { depth: 7 });
  g.lives({ p1: 0 });
  assert.equal(teamDepth(g.s), 7);
  assert.equal(delveTeam(g.s).perished, false);
});

test('the last one standing leaving ends the run; a question with nobody left to answer ends at once', () => {
  // Kicked between questions: over at once.
  const h = team(3);
  h.lives({ p0: 0, p1: 0 });
  h.act({ type: 'remove', playerId: 'p1' }, 'p1');
  assert.equal(h.s.phase, 'choosing', 'p2 still stands');
  h.act({ type: 'remove', playerId: 'p2' }, 'p0');
  assert.equal(h.s.phase, 'over');
  assert.deepEqual(h.s.winners, []);

  // Kicked during a question: it ends with nobody right, and the run with the reveal.
  const g = team(3);
  g.lives({ p0: 0, p1: 0 });
  const q = g.ask();
  g.act({ type: 'remove', playerId: 'p2' }, 'p0');
  assert.equal(g.s.phase, 'reveal');
  assert.equal(g.s.reveal!.correct, false);
  assert.equal(g.s.question!.askedAt, q.askedAt);
  g.next();
  assert.equal(g.s.phase, 'over');
  assert.equal(teamDepth(g.s), 1);
});

// ---- what guests see and send ------------------------------------------------

test('guests see the votes and the struck options with who struck them, never the answer before the reveal', () => {
  const h = team(3);
  h.vote('p1', h.s.offered[1]);
  assert.deepEqual(publicView(h.s).delve!.votes, { p1: h.s.offered[1] });
  h.vote('p0', h.s.offered[1]);
  h.vote('p2', h.s.offered[1]);
  let view = publicView(h.s).question!;
  // Before the clock, as alone: nothing to read.
  assert.ok(view.labels.every((l) => l === null));
  assert.deepEqual(view.options, []);
  assert.equal(view.itemId, '');
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  const q = h.s.question!;
  h.pickAs('p2', wrongs(q)[1]);
  view = publicView(h.s).question!;
  assert.deepEqual(
    view.struck!.map((x) => [x.index, x.by]),
    [[wrongs(q)[1], 'p2']],
  );
  assert.equal(view.itemId, '');
  assert.deepEqual(view.options, []);
  assert.equal(JSON.stringify(publicView(h.s)).includes(q.itemId), false);
  // At the reveal, the answer and the struck options are named; untouched decoys stay anonymous.
  h.pickAs('p0', right(q));
  const shown = publicView(h.s).question!;
  assert.equal(shown.options[right(q)], q.itemId);
  assert.equal(shown.options[wrongs(q)[1]], q.options[wrongs(q)[1]]);
  assert.equal(shown.options[wrongs(q)[0]], '');
});

test('guests can only vote, answer and give their own lives: everything else is the host\'s', () => {
  const h = team(3);
  for (const a of [
    { type: 'expire' },
    { type: 'resumed' },
    { type: 'clock', askedAt: 1 },
    { type: 'flare', askedAt: 1 },
    { type: 'dynamite', askedAt: 1 },
  ] as Action[]) {
    loudly(() => h.act(a, 'p1'), /Not allowed/);
    assert.equal(parseClientMsg({ t: 'action', action: a }), null, a.type);
  }
  // A vote or a revive is the sender's own: the message names nobody else.
  const vote = parseClientMsg({ t: 'action', action: { type: 'vote', category: h.s.offered[0], playerId: 'p2' } });
  assert.deepEqual(vote, { t: 'action', action: { type: 'vote', category: h.s.offered[0] } });
  h.act((vote as { action: Action }).action, 'p1');
  assert.deepEqual(h.s.delve!.votes, { p1: h.s.offered[0] });
  h.lives({ p2: 0 });
  const revive = parseClientMsg({ t: 'action', action: { type: 'revive', target: 'p2', by: 'p0' } });
  h.act((revive as { action: Action }).action, 'p1');
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1')], [DELVE_LIVES, DELVE_LIVES - 1]);
  // An answer can't claim a find or another player.
  h.vote('p0');
  h.vote('p2');
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt, playerId: 'p0', gained: 'wards' } as never, 'p1');
  assert.equal(h.s.reveal!.winnerId, 'p1');
  assert.equal(h.s.reveal!.gained, undefined);
  silently(() => h.act({ type: 'next' }, 'p2'));
});

test('on one device a run together is refused; online, one player still delves alone in turns', () => {
  const clock = { now: 1 };
  const engine = new Engine(items, { rng: seeded(1), now: () => clock.now, fakes });
  let s = createGame(null, SETTINGS);
  s = engine.apply(s, { type: 'join', playerId: 'a', name: 'Ash' }, null);
  s = engine.apply(s, { type: 'join', playerId: 'b', name: 'Brea' }, null);
  const two = s;
  loudly(() => engine.apply(two, { type: 'start' }, null), /online/);
  const solo = team(1);
  assert.equal(solo.s.delve!.votes, undefined);
  assert.equal(solo.s.delve!.revives, undefined);
  solo.act({ type: 'pick', category: solo.s.offered[0] }, 'p0');
  assert.equal(solo.s.phase, 'question');
  assert.equal(solo.s.delve!.losses.p0, undefined);
  assert.equal(livesOf(solo.s, 'p0'), DELVE_LIVES);
});
