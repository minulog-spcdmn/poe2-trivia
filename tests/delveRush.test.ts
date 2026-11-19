// Delve's Sulphite rush: one sulphite card in every run on an offer from
// shown depth 3 to 9, then more by the entropy gauge. Taking one asks its
// category's questions one after another, each right answer a few depths
// down; together, the team's questions as any other, with no flare or
// dynamite working on them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELVE_LIVES,
  RUSH_DEFAULTS,
  RUSH_FROM,
  RUSH_TO,
  dynamiteOf,
  findOn,
  flaresOf,
  livesOf,
  rushOf,
  rushTuning,
  shownDepth,
  standingIds,
  sulphiteCard,
  sulphiteOdds,
  teamItemReady,
  type RushTuning,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, AUTO_NEXT_MS, revealPauseMs, type GameState } from '../src/lib/game.ts';
import { right, room, wrong, wrongs } from './helpers.ts';

/** A run of `n` players p0 (the host) to p(n-1), the rush tuned by `tuning` (null: an engine without it), on a clock the test moves. */
function run(n = 1, opts: { seed?: number; tuning?: RushTuning | null } = {}) {
  const h = Object.assign(room({ start: false, players: n, seed: opts.seed ?? 5 }), {
    /** The question's clock started, after any hold for a zone's arrival or a rush's end. */
    clockIn() {
      const at = h.s.delve?.dealAt;
      if (at !== undefined && at > h.clock.now) h.clock.now = at;
      h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
      return h.s.question!;
    },
    /** A plain card on offer (no find, no fossil, not the sulphite card), or any other than the sulphite card. */
    plain(s: GameState = h.s) {
      const card = sulphiteCard(s);
      const ok = s.offered.filter((c) => c !== card);
      return ok.find((c) => !findOn(s, c) && s.delve?.fossil?.category !== c) ?? ok.find((c) => findOn(s, c) !== 'azurite') ?? ok[0];
    },
    /** The sulphite card put on this offer by hand, on a plain card. */
    plant() {
      assert.equal(h.s.phase, 'choosing');
      h.edit((c) => {
        c.delve!.finds = [];
        delete c.delve!.fossil;
        c.delve!.rush!.card = c.offered[0];
      });
      assert.equal(sulphiteCard(h.s), h.s.offered[0]);
      return h.s.offered[0];
    },
    /** The host's trusted pick (alone, the player's; together, the vote settled), its clock started. */
    pick(category: string) {
      h.act({ type: 'pick', category });
      return h.clockIn();
    },
    /** Alone: the player's answer. */
    answer(ok: boolean) {
      const q = h.s.question!;
      h.act({ type: 'answer', index: ok ? right(q) : wrong(q), askedAt: q.askedAt });
    },
    vote: (id: string, category: string) => h.act({ type: 'vote', category }, id),
    pickAs: (id: string, index: number) => h.act({ type: 'answer', index, askedAt: h.s.question!.askedAt }, id),
    timeOut() {
      h.clock.now = h.s.question!.deadline! + ANSWER_GRACE_MS;
      return h.act({ type: 'answer', index: null });
    },
    next: () => h.act({ type: 'next' }),
    /** Everyone's losses set by hand: `lives` left each. */
    lives(byId: Record<string, number>) {
      h.edit((c) => {
        for (const [id, n] of Object.entries(byId)) c.delve!.losses[id] = Array(DELVE_LIVES - n).fill(1);
      });
    },
    /** One depth played right on a plain card (the host's own answer alone, p0's together). */
    walk() {
      const q = h.pick(h.plain());
      if (n > 1) h.pickAs('p0', right(q));
      else h.answer(true);
      h.next();
    },
  });
  if (opts.tuning !== null) h.engine.setRush(opts.tuning ?? RUSH_DEFAULTS);
  h.act({ type: 'start' }, 'p0');
  return h;
}

/** The depth (internal) of the first offer holding a sulphite card in a run walked right from the start, or null within `limit` depths. */
function firstCardAt(h: ReturnType<typeof run>, limit = RUSH_TO + 5) {
  while (h.s.round <= limit) {
    assert.equal(h.s.phase, 'choosing');
    if (sulphiteCard(h.s)) return h.s.round;
    h.walk();
  }
  return null;
}

// ---- on in every run --------------------------------------------------------

test('a run started with the rush tuned has one, alone and together; without it, none', () => {
  for (const n of [1, 2]) {
    const h = run(n);
    assert.deepEqual(h.s.delve!.rush, { ...RUSH_DEFAULTS });
    assert.deepEqual(rushOf(h.s), { ...RUSH_DEFAULTS });
    const off = run(n, { tuning: null });
    assert.equal(off.s.delve!.rush, undefined);
    assert.equal(rushOf(off.s), null);
  }
});

test('a run saved by an older build, with no rush, reads none and plays on without any sulphite card', () => {
  for (const n of [1, 2]) {
    const h = run(n, { seed: 3 });
    h.edit((c) => delete c.delve!.rush);
    assert.equal(rushOf(h.s), null);
    while (h.s.round <= RUSH_TO + 10) {
      assert.equal(sulphiteCard(h.s), null);
      assert.equal(sulphiteOdds(h.s, h.s.round), 0);
      h.walk();
      assert.equal(h.s.delve!.rush, undefined);
    }
  }
});

test("the run's first sulphite card turns up on an offer at shown depth 3 to 9, in every run, alone and together", () => {
  for (const n of [1, 2]) {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const at = firstCardAt(run(n, { seed }));
      assert.ok(at !== null, `no card by shown depth ${shownDepth(RUSH_TO + 5)} (${n} players, seed ${seed})`);
      assert.ok(at >= RUSH_FROM && at <= RUSH_TO, `first card at shown depth ${shownDepth(at)} (${n} players, seed ${seed})`);
      seen.add(at);
    }
    // Each depth as likely: over this many runs, both ends turn up.
    assert.ok(seen.has(RUSH_FROM) && seen.has(RUSH_TO), `depths seen ${[...seen].sort((a, b) => a - b)} (${n} players)`);
  }
});

// ---- alone ------------------------------------------------------------------

test('alone, the sulphite card asks its questions one after another: right goes its step down, a miss costs a life where it is', () => {
  const h = run(1, { seed: 9 });
  h.edit((c) => (c.round = 5));
  const card = h.plant();
  const from = h.s.round;
  const { length, step } = RUSH_DEFAULTS;
  const plan = [true, false, true, true, true, true, true];
  assert.equal(plan.length, length);
  let depth = from;
  let lives = DELVE_LIVES;
  h.pick(card);
  for (let i = 0; i < length; i++) {
    assert.equal(h.s.phase, 'question', `question ${i + 1}`);
    assert.equal(h.s.question!.rush, true);
    assert.equal(h.s.question!.category, card);
    assert.equal(h.s.round, depth);
    assert.equal(rushOf(h.s)!.on!.left, length - i);
    if (i > 0) h.clockIn();
    h.answer(plan[i]);
    if (plan[i]) depth += step;
    else lives--;
    assert.equal(livesOf(h.s, 'p0'), lives);
    h.next();
  }
  // After the last one, the first offer, the rush done.
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.round, depth);
  assert.equal(depth, from + step * 6);
  const r = rushOf(h.s)!;
  assert.equal(r.on, undefined);
  assert.deepEqual({ from: r.done!.from, last: r.done!.last, to: r.done!.to }, { from, last: depth - step, to: depth });
  assert.equal(sulphiteCard(h.s), null, 'none on the first offer after a rush');
});

test('alone, after the first card the next comes 11 to 20 depths played later', () => {
  const gaps = new Set<number>();
  for (let seed = 1; seed <= 60; seed++) {
    const h = run(1, { seed });
    const first = firstCardAt(h)!;
    assert.ok(first !== null, `seed ${seed}`);
    h.walk();
    let second: number | null = null;
    while (h.s.round <= first + 25) {
      if (sulphiteCard(h.s)) {
        second = h.s.round;
        break;
      }
      h.walk();
    }
    assert.ok(second !== null, `no second card within 25 depths of shown ${shownDepth(first)} (seed ${seed})`);
    const gap = second - first;
    assert.ok(gap >= 11 && gap <= 20, `second card ${gap} depths after the first (seed ${seed}, first at shown ${shownDepth(first)})`);
    gaps.add(gap);
  }
  // The gauge starts at random: the gap is not the same in every run.
  assert.ok(gaps.size > 1, `gaps seen ${[...gaps]}`);
});

// ---- together ---------------------------------------------------------------

/** A run of two together at depth 5 with the sulphite card voted for: the rush's first question, its clock running. */
function rushTogether(opts: { seed?: number; tuning?: RushTuning; players?: number } = {}) {
  const h = run(opts.players ?? 2, { seed: opts.seed ?? 11, tuning: opts.tuning });
  h.edit((c) => (c.round = 5));
  const card = h.plant();
  for (const id of standingIds(h.s)) h.vote(id, card);
  assert.equal(h.s.phase, 'question');
  h.clockIn();
  return Object.assign(h, { card, from: 5 });
}

test("together, the team's vote for the sulphite card starts the rush; anyone right takes everyone its step down", () => {
  const h = rushTogether();
  const { length, step } = RUSH_DEFAULTS;
  const q1 = h.s.question!;
  assert.equal(q1.rush, true);
  assert.equal(q1.category, h.card);
  assert.equal(rushOf(h.s)!.on!.left, length);
  // One player wrong: their option struck, a life of theirs, the question still open.
  const miss = wrongs(q1)[0];
  h.pickAs('p1', miss);
  assert.equal(h.s.phase, 'question');
  assert.deepEqual(h.s.question!.struck!.map((x) => [x.by, x.index]), [['p1', miss]]);
  assert.deepEqual([livesOf(h.s, 'p0'), livesOf(h.s, 'p1')], [DELVE_LIVES, DELVE_LIVES - 1]);
  assert.equal(rushOf(h.s)!.on!.left, length);
  // A teammate right clears it.
  h.pickAs('p0', right(q1));
  assert.equal(h.s.reveal!.correct, true);
  h.next();
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.round, h.from + step);
  assert.equal(rushOf(h.s)!.on!.left, length - 1);
  // Nobody right, all wrong: the same depth, one question used.
  const q2 = h.clockIn();
  const [a, b] = wrongs(q2);
  h.pickAs('p0', a);
  h.pickAs('p1', b);
  assert.equal(h.s.phase, 'reveal');
  assert.equal(h.s.reveal!.correct, false);
  h.next();
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.round, h.from + step);
  assert.equal(rushOf(h.s)!.on!.left, length - 2);
  // Nobody right, the time-out: the same.
  h.lives({ p0: DELVE_LIVES, p1: DELVE_LIVES });
  h.clockIn();
  h.timeOut();
  assert.equal(h.s.reveal!.timedOut, true);
  h.next();
  assert.equal(h.s.round, h.from + step);
  assert.equal(rushOf(h.s)!.on!.left, length - 3);
  // The rest right: it ends after its length.
  for (let i = 3; i < length; i++) {
    assert.equal(h.s.phase, 'question', `question ${i + 1}`);
    assert.equal(h.s.question!.rush, true);
    const q = h.clockIn();
    h.pickAs('p0', right(q));
    h.next();
  }
  assert.equal(h.s.phase, 'choosing');
  assert.equal(h.s.round, h.from + step * (length - 2));
  assert.equal(rushOf(h.s)!.on, undefined);
  assert.equal(rushOf(h.s)!.done!.to, h.s.round);
});

test('together, a player perishing in a rush leaves it going for the others; everyone perishing ends the run', () => {
  const h = rushTogether({ players: 3 });
  h.lives({ p2: 1 });
  const q = h.s.question!;
  h.pickAs('p2', wrongs(q)[0]);
  assert.equal(livesOf(h.s, 'p2'), 0);
  h.pickAs('p0', right(q));
  h.next();
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.rush, true);
  assert.deepEqual([...standingIds(h.s)].sort(), ['p0', 'p1']);
  assert.equal(rushOf(h.s)!.on!.left, RUSH_DEFAULTS.length - 1);
  // The two left perish on the next one.
  h.lives({ p0: 1, p1: 1 });
  h.clockIn();
  h.timeOut();
  assert.equal(standingIds(h.s).length, 0);
  h.next();
  assert.equal(h.s.phase, 'over');
});

test('together, a time-out on a rush question burns no flare and sets off no dynamite: everyone waiting takes the hit', () => {
  // (On the rush's first question, whose offer is still up, so dynamite would have cards to blast to.)
  const h = rushTogether();
  h.give('p0', { flares: 1, dynamite: 1 });
  h.give('p1', { flares: 1, dynamite: 1 });
  h.clock.now = h.s.question!.deadline!;
  assert.equal(teamItemReady(h.s, 'flares'), false);
  assert.equal(teamItemReady(h.s, 'dynamite'), false);
  h.timeOut();
  assert.equal(h.s.phase, 'reveal');
  assert.equal(h.s.reveal!.timedOut, true);
  for (const id of ['p0', 'p1']) {
    assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
    assert.equal(flaresOf(h.s, id), 1);
    assert.equal(dynamiteOf(h.s, id), 1);
  }
  // The same packs on a question outside a rush: both are ready.
  const plain = run(2, { seed: 11 });
  plain.give('p0', { flares: 1, dynamite: 1 });
  plain.pick(plain.plain());
  plain.clock.now = plain.s.question!.deadline!;
  assert.equal(teamItemReady(plain.s, 'flares'), true);
  assert.equal(teamItemReady(plain.s, 'dynamite'), true);
});

test('together, the pause after a rush answer is its pace share of the usual while someone stands, the usual once nobody does', () => {
  const tuning = { ...RUSH_DEFAULTS, length: 2 };
  const quick = Math.round(AUTO_NEXT_MS * tuning.pace);
  const h = rushTogether({ tuning });
  h.pickAs('p0', right(h.s.question!));
  assert.equal(revealPauseMs(h.s), quick, 'in the middle of it');
  h.next();
  h.pickAs('p0', right(h.clockIn()));
  assert.ok(rushOf(h.s)!.done);
  assert.equal(revealPauseMs(h.s), quick, 'after its last question');
  // Nobody standing: the usual.
  const end = rushTogether();
  end.lives({ p0: 1, p1: 1 });
  end.timeOut();
  assert.equal(standingIds(end.s).length, 0);
  assert.equal(revealPauseMs(end.s), AUTO_NEXT_MS);
});

test('together, a host reload in the middle of a rush plays the rest of it on', () => {
  const tuning = { ...RUSH_DEFAULTS, length: 5 };
  const h = rushTogether({ tuning });
  h.pickAs('p0', right(h.s.question!));
  h.next();
  const q = h.clockIn();
  h.pickAs('p1', wrongs(q)[0]);
  // The host reloads: a fresh engine (the rush tuned as the live game's) on the state as saved.
  const h2 = run(2, { seed: 23 });
  h2.clock.now = h.clock.now;
  h2.s = JSON.parse(JSON.stringify(h.s));
  h2.act({ type: 'resumed' });
  h2.act({ type: 'clock', askedAt: h2.s.question!.askedAt });
  assert.equal(h2.s.phase, 'question');
  assert.equal(h2.s.question!.rush, true);
  // What was answered on it stands.
  assert.deepEqual(h2.s.question!.struck!.map((x) => x.by), ['p1']);
  assert.equal(livesOf(h2.s, 'p1'), DELVE_LIVES - 1);
  const left = rushOf(h2.s)!.on!.left;
  assert.equal(left, tuning.length - 1, "the run's own length, not the fresh engine's");
  const depth = h2.s.round;
  for (let i = 0; i < left; i++) {
    assert.equal(h2.s.phase, 'question', `question ${i + 1} after the reload`);
    assert.equal(h2.s.question!.category, h.card);
    if (i > 0) h2.clockIn();
    h2.pickAs('p0', right(h2.s.question!));
    h2.next();
  }
  assert.equal(h2.s.phase, 'choosing');
  assert.equal(h2.s.round, depth + tuning.step * left);
  assert.equal(rushOf(h2.s)!.done!.from, h.from);
});

// ---- tuning -----------------------------------------------------------------

test("the tuning from a page's query: the defaults without one, odd values back to them, out of range clamped", () => {
  assert.deepEqual(rushTuning(''), RUSH_DEFAULTS);
  assert.deepEqual(rushTuning('?rushLength=abc&rushPace=&rushDeeper=NaN&rushStep=x&rushZone=&rushChance=?'), RUSH_DEFAULTS);
  assert.deepEqual(rushTuning('?rushLength=200&rushPace=5&rushDeeper=-3&rushStep=9&rushZone=100&rushChance=2'), {
    length: 50,
    pace: 1,
    deeper: 0,
    step: 5,
    zone: 2400,
    chance: 1,
  });
  assert.deepEqual(rushTuning('?rushLength=0&rushPace=0&rushDeeper=99&rushStep=0&rushZone=99999&rushChance=-1'), {
    length: 1,
    pace: 0.05,
    deeper: 30,
    step: 1,
    zone: 7000,
    chance: 0,
  });
  assert.deepEqual(rushTuning('?rushLength=4.6&rushStep=2'), { ...RUSH_DEFAULTS, length: 5, step: 2 });
});
