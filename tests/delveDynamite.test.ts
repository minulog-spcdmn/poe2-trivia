// Delve's dynamite: a stick goes off by itself once half the answering
// player's clock has run out, laying the art bare and blowing half the wrong
// answers away (see delve.ts blastAt, blastCount and game.ts 'dynamite').

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  FLARE_AT_MS,
  FLARE_MS,
  blastAt,
  blastAtMs,
  blastClears,
  blastCount,
  dynamiteOf,
  flaresOf,
  livesOf,
  questionTimer,
  veinWindow,
  type FindKind,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, Engine, createGame, isFake, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { dynamiteIn, flareIn, inventoryChanges } from '../src/lib/delveSession.ts';
import { parseClientMsg, parseHostMsg } from '../src/lib/protocol.ts';
import { momentOf } from '../src/lib/inventoryArt.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };
const right = (q: Question) => q.options.indexOf(q.itemId);

function seeded(seed: number) {
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A Delve run on a controllable clock; `host` null for hot-seat. Helpers act as the trusted host. */
function delve(names: string[], opts: { host?: string | null; seed?: number; depth?: number } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 11), now: () => clock.now, fakes });
  const host = opts.host === undefined ? 'p0' : opts.host;
  let s: GameState = createGame(host, SETTINGS);
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, host === null ? null : `p${i}`)));
  s = engine.apply(s, { type: 'start' }, host);
  const h = {
    engine,
    clock,
    get s() {
      return s;
    },
    act(a: Action, from: string | null = null) {
      s = engine.apply(s, a, from);
      return s;
    },
    active: () => s.players[s.turn],
    edit(fn: (s: GameState) => void) {
      const c = structuredClone(s);
      fn(c);
      s = c;
    },
    give(id: string, inv: Partial<Inventory>) {
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { ...NONE, ...inv }));
    },
    /** Picks a card (the find planted on it, if `find`) and starts the clock. */
    ask(find?: FindKind) {
      if (find) h.edit((c) => (c.delve!.find = { category: c.offered[0], kind: find }));
      h.act({ type: 'pick', category: find ? s.offered[0] : s.offered.find((c) => c !== s.delve!.find?.category)! });
      h.act({ type: 'clock', askedAt: s.question!.askedAt });
      return s.question!;
    },
    /** The host's clock at the moment the dynamite is due. */
    due: () => s.question!.clockAt! + blastAtMs(s),
    blast: (from: string | null = null) => h.act({ type: 'dynamite', askedAt: s.question!.askedAt }, from),
  };
  if (opts.depth) h.edit((c) => (c.round = opts.depth!));
  return h;
}

/** A question on the clock at `depth` for a player holding `inv`. */
function holding(inv: Partial<Inventory>, opts: { depth?: number; seed?: number; host?: string | null; find?: FindKind } = {}) {
  const h = delve(['Ash'], { host: opts.host === undefined ? null : opts.host, seed: opts.seed, depth: opts.depth ?? 30 });
  h.give(h.active().id, inv);
  h.ask(opts.find);
  return h;
}

// ---- the rules ---------------------------------------------------------------

test('dynamite goes off at half the clock, rounded up to a whole second: where the Azurite Vein\'s fast window closes', () => {
  for (let secs = 7; secs <= 16; secs++) {
    assert.equal(blastAt(secs), veinWindow(secs));
    assert.ok(blastAt(secs) >= (secs * 1000) / 2 && blastAt(secs) < (secs * 1000) / 2 + 1000);
  }
  assert.deepEqual([blastAt(16), blastAt(13), blastAt(7)], [8000, 7000, 4000]);
});

test('it blows away half the wrong answers, rounded down, never leaving fewer than two', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 8, 10].map(blastCount), [0, 1, 1, 2, 2, 3, 4]);
  for (let n = 2; n <= 16; n++) {
    assert.equal(blastCount(n), Math.floor((n - 1) / 2));
    assert.ok(n - blastCount(n) >= 2, `${n} options`);
  }
});

test('it has art to clear when the art burns in, is mirrored or has no colour', () => {
  const q = { mode: 'name' as const, veil: null, mirrored: [false] };
  assert.equal(blastClears(q, 'off'), false);
  assert.equal(blastClears(q, 'art'), false, 'grayscale "art" only takes the pictures');
  assert.equal(blastClears(q, 'all'), true);
  assert.equal(blastClears({ ...q, mirrored: [true] }, 'off'), true);
  assert.equal(blastClears({ ...q, veil: { size: 5, seconds: 5, seed: 1 } }, 'off'), true);
  assert.equal(blastClears({ mode: 'art', veil: null, mirrored: [false, false, false, false] }, 'art'), true);
  assert.equal(blastClears({ mode: 'art', veil: null, mirrored: [false, false, false, false] }, 'off'), false);
});

// ---- when it goes off ----------------------------------------------------------

test('a stick goes off by itself at half the clock, once a question, and is used up', () => {
  const h = holding({ dynamite: 2 });
  const id = h.active().id;
  const q = h.s.question!;
  assert.equal(h.due(), q.clockAt! + blastAt(questionTimer(h.s)));
  assert.equal(dynamiteIn(h.s, h.clock.now), h.due() - h.clock.now);
  // Too early: nothing.
  h.clock.now = h.due() - 300;
  h.blast();
  assert.equal(h.s.question!.blasted, undefined);
  assert.equal(dynamiteOf(h.s, id), 2);
  // At half the clock (a timer a little early still counts).
  h.clock.now = h.due() - 200;
  const prev = h.s;
  h.blast();
  assert.equal(h.s.question!.blasted, true);
  assert.equal(dynamiteOf(h.s, id), 1);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'dynamite', change: 'used', left: 1 }]);
  assert.equal(momentOf(inventoryChanges(prev, h.s)), 'blast');
  // The clock runs on as it was.
  assert.equal(h.s.question!.deadline, q.deadline);
  // Once a question.
  assert.equal(dynamiteIn(h.s, h.clock.now), null);
  const removed = h.s.question!.blownAway;
  h.blast();
  assert.equal(dynamiteOf(h.s, id), 1);
  assert.deepEqual(h.s.question!.blownAway, removed);
  // The next question can have its own.
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: q.askedAt });
  h.act({ type: 'next' });
  h.ask();
  assert.equal(h.s.question!.blasted, undefined);
  assert.notEqual(dynamiteIn(h.s, h.clock.now), null);
  h.clock.now = h.due();
  h.blast();
  assert.equal(h.s.question!.blasted, true);
  assert.equal(dynamiteOf(h.s, id), 0);
});

test('never after an answer, the time-out or the reveal, before the clock starts, without dynamite, or for someone away', () => {
  // Answered first.
  const answered = holding({ dynamite: 1 });
  const askedAt = answered.s.question!.askedAt;
  answered.clock.now = answered.due() - 400;
  answered.act({ type: 'answer', index: right(answered.s.question!), askedAt });
  assert.equal(answered.s.phase, 'reveal');
  answered.clock.now += 400;
  answered.act({ type: 'dynamite', askedAt });
  assert.equal(answered.s.question!.blasted, undefined);
  assert.equal(dynamiteOf(answered.s, answered.active().id), 1);
  assert.equal(dynamiteIn(answered.s, answered.clock.now), null);

  // Timed out (the host's timer answers null).
  const late = holding({ dynamite: 1 });
  late.clock.now = late.s.question!.deadline! + ANSWER_GRACE_MS + 1;
  late.blast();
  assert.equal(late.s.question!.blasted, undefined);
  late.act({ type: 'answer', index: null }, null);
  assert.equal(late.s.reveal!.timedOut, true);
  late.act({ type: 'dynamite', askedAt: late.s.question!.askedAt });
  assert.equal(dynamiteOf(late.s, late.active().id), 1);

  // Before the clock starts.
  const early = delve(['Ash'], { host: null, depth: 30 });
  early.give(early.active().id, { dynamite: 1 });
  early.act({ type: 'pick', category: early.s.offered[0] });
  assert.equal(dynamiteIn(early.s, early.clock.now), null);
  early.clock.now += 60_000;
  early.blast();
  assert.equal(early.s.question!.blasted, undefined);

  // Without any.
  const none = holding({});
  assert.equal(dynamiteIn(none.s, none.clock.now), null);
  none.clock.now = none.due();
  none.blast();
  assert.equal(none.s.question!.blasted, undefined);

  // A stale question.
  const stale = holding({ dynamite: 1 });
  stale.clock.now = stale.due();
  stale.act({ type: 'dynamite', askedAt: stale.s.question!.askedAt - 1 });
  assert.equal(stale.s.question!.blasted, undefined);

  // Away: a guest whose connection dropped.
  const away = delve(['Ash', 'Brea'], { depth: 30 });
  const guest = away.s.players.find((p) => p.id !== 'p0')!.id;
  while (away.active().id !== guest) {
    away.ask();
    away.act({ type: 'answer', index: right(away.s.question!), askedAt: away.s.question!.askedAt });
    away.act({ type: 'next' });
  }
  away.give(guest, { dynamite: 1 });
  away.ask();
  away.act({ type: 'connection', playerId: guest, connected: false });
  assert.equal(dynamiteIn(away.s, away.clock.now), null);
  away.clock.now = away.due();
  away.blast();
  assert.equal(away.s.question!.blasted, undefined);
  assert.equal(dynamiteOf(away.s, guest), 1);
  // Back in time, it goes off.
  away.act({ type: 'connection', playerId: guest, connected: true });
  away.blast();
  assert.equal(away.s.question!.blasted, true);
});

test("nobody but the host sets it off: a guest's or the host's own word is refused, and guests can't send one", () => {
  const h = delve(['Ash', 'Brea'], { depth: 30 });
  const id = h.active().id;
  h.give(id, { dynamite: 1 });
  h.ask();
  h.clock.now = h.due();
  assert.throws(() => h.blast(id), /Not allowed/);
  assert.throws(() => h.blast('p0'), /Not allowed/);
  assert.equal(h.s.question!.blasted, undefined);
  assert.equal(dynamiteOf(h.s, id), 1);
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'dynamite', askedAt: h.s.question!.askedAt } }), null);
  // The old dynamite action, blasting a card open, is gone.
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'blast', category: 'Rings' } }), null);
  assert.equal(h.engine.apply(h.s, { type: 'blast', category: 'Rings' } as never, null).question!.blasted, undefined);
});

// ---- what it does --------------------------------------------------------------

test('it blows away half the wrong answers: never the answer, made-up names first, two or more left', () => {
  let fakesSeen = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const depth = [12, 30, 60, 120][seed % 4];
    const h = holding({ dynamite: 1 }, { seed, depth });
    const q0 = h.s.question!;
    h.clock.now = h.due();
    h.blast();
    const q = h.s.question!;
    const gone = q.blownAway!;
    const wrong = q.options.filter((id) => id !== q.itemId);
    assert.equal(gone.length, Math.floor(wrong.length / 2), `seed ${seed}`);
    assert.ok(q.options.length - gone.length >= 2);
    assert.ok(!gone.includes(right(q)), 'never the answer');
    assert.deepEqual([...gone].sort((a, b) => a - b), gone, 'in order');
    assert.equal(new Set(gone).size, gone.length);
    // The options themselves stay where they were.
    assert.deepEqual(q.options, q0.options);
    assert.deepEqual(q.labels, q0.labels);
    // Made-up names go before any real decoy.
    const fakeIdx = q.options.flatMap((id, i) => (isFake(id) ? [i] : []));
    fakesSeen += fakeIdx.length;
    const goneFakes = gone.filter((i) => fakeIdx.includes(i)).length;
    assert.equal(goneFakes, Math.min(fakeIdx.length, gone.length), `seed ${seed}: fakes first`);
  }
  assert.ok(fakesSeen > 0, 'some questions had made-up names');
});

test('which real decoys go is left to chance, so what stays says nothing about the answer', () => {
  // Over many blasts of the same four-option question, each wrong option goes about as often.
  const counts = new Map<number, number>();
  let q: Question | null = null;
  for (let seed = 1; seed <= 300; seed++) {
    const h = holding({ dynamite: 1 }, { seed: 7, depth: 4 });
    // Same question, a different roll for the blast.
    (h.engine as unknown as { rng: () => number }).rng = seeded(seed);
    q = h.s.question!;
    h.clock.now = h.due();
    h.blast();
    for (const i of h.s.question!.blownAway!) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  const wrong = q!.options.flatMap((id, i) => (id === q!.itemId ? [] : [i]));
  assert.equal(wrong.length, 3);
  for (const i of wrong) assert.ok((counts.get(i) ?? 0) > 60, `option ${i}: ${counts.get(i)}`);
});

test('picking an answer it blew away is a wrong answer, like any other', () => {
  const h = holding({ dynamite: 1 }, { depth: 30 });
  const id = h.active().id;
  h.clock.now = h.due();
  h.blast();
  const q = h.s.question!;
  h.act({ type: 'answer', index: q.blownAway![0], askedAt: q.askedAt });
  assert.equal(h.s.reveal!.correct, false);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
});

test('guests learn that it went off and what it blew away, never the answer, the items or the pictures behind it', () => {
  const h = delve(['Ash', 'Brea'], { depth: 70 });
  const id = h.active().id;
  h.give(id, { dynamite: 1 });
  h.ask();
  let view = publicView(h.s).question!;
  assert.equal(view.blasted, undefined);
  assert.equal(view.blownAway, undefined);
  h.clock.now = h.due();
  h.blast();
  const q = h.s.question!;
  view = publicView(h.s).question!;
  assert.equal(view.blasted, true);
  assert.deepEqual(view.blownAway, q.blownAway);
  assert.equal(view.itemId, '');
  assert.deepEqual(view.options, []);
  assert.deepEqual(view.mirrored, [], 'nor which pictures were mirrored');
  assert.equal(JSON.stringify(publicView(h.s)).includes(q.itemId), false);
  // At the reveal, what it blew away stays anonymous like any untouched decoy.
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt });
  const shown = publicView(h.s).question!;
  for (const i of q.blownAway!) assert.equal(shown.options[i], '');
  assert.equal(shown.options[right(q)], q.itemId);
});

test('a question where it went off is recorded as such, its art left as asked for the record', () => {
  const h = holding({ dynamite: 1 }, { depth: 90, seed: 3 });
  const before = h.s.question!;
  h.clock.now = h.due();
  h.blast();
  const q = h.s.question!;
  assert.equal(q.blasted, true);
  // How it was asked stays on the record (the host sends the plain art; the screens show it).
  assert.deepEqual(q.mirrored, before.mirrored);
  assert.deepEqual(q.veil, before.veil);
  assert.equal(blastClears(q, 'all'), true, 'at depth 90 there is always art to clear');
});

// ---- with flares and finds ----------------------------------------------------

test('with a flare too: the dynamite goes off at half the clock, the flare near its end, both used', () => {
  const h = holding({ dynamite: 1, flares: 1 });
  const id = h.active().id;
  const q = h.s.question!;
  // The dynamite is due first.
  assert.ok(dynamiteIn(h.s, h.clock.now)! < flareIn(h.s, h.clock.now)!);
  h.clock.now = h.due();
  h.blast();
  assert.equal(h.s.question!.blasted, true);
  assert.equal(h.s.question!.deadline, q.deadline, 'the blast gives no time');
  assert.equal(flareIn(h.s, h.clock.now), q.deadline! - FLARE_AT_MS - h.clock.now, 'the flare still burns as the clock runs out');
  h.clock.now = q.deadline! - FLARE_AT_MS;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS);
  assert.deepEqual([dynamiteOf(h.s, id), flaresOf(h.s, id)], [0, 0]);
  // The answer still counts in the flare's time.
  h.clock.now = q.deadline! + FLARE_MS - 10;
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt }, null);
  assert.equal(h.s.reveal!.correct, true);
});

test("a flare's extra time never moves the blast, nor does one burning first", () => {
  const h = holding({ dynamite: 1, flares: 1 });
  const due = h.due();
  // Should a flare burn first (a deadline moved by hand), the blast still comes at half the question's own clock.
  h.edit((c) => {
    c.question!.flared = true;
    c.question!.deadline! += FLARE_MS;
  });
  assert.equal(h.due(), due);
  assert.equal(dynamiteIn(h.s, h.clock.now), due - h.clock.now);
});

test("on an Azurite Vein it goes off as the fast window closes: it never helps mine a ward, and the cave-in stays", () => {
  const h = holding({ dynamite: 1 }, { depth: 20, find: 'azurite' });
  const q = h.s.question!;
  assert.equal(h.due(), q.clockAt! + veinWindow(questionTimer(h.s)));
  h.clock.now = h.due();
  h.blast();
  assert.equal(h.s.question!.blasted, true);
  h.clock.now += 1;
  h.act({ type: 'answer', index: right(q), askedAt: q.askedAt });
  assert.equal(h.s.reveal!.gained, 'shards', 'after the blast, only a shard');

  for (const find of ['flare', 'dynamite'] as const) {
    const c = holding({ dynamite: 1 }, { depth: 20, find });
    c.clock.now = c.due();
    c.blast();
    assert.equal(c.s.question!.find, find);
    assert.equal(c.s.question!.blasted, true);
    c.act({ type: 'answer', index: right(c.s.question!), askedAt: c.s.question!.askedAt });
    assert.equal(c.s.reveal!.gained, find === 'flare' ? 'flares' : 'dynamite', "a cache's reward still comes");
  }
});

// ---- the wire -------------------------------------------------------------------

test('the plain art travels as its own message, checked like the others', () => {
  const art = { t: 'clean', qid: 5, w: 120, h: 160, data: new ArrayBuffer(8) };
  assert.ok(parseHostMsg(art));
  assert.ok(parseHostMsg({ ...art, tile: 3 }));
  assert.ok(parseHostMsg({ ...art, data: new Uint8Array(4) }), 'a view of the bytes is fine');
  assert.equal(parseHostMsg({ ...art, tile: 17 }), null);
  assert.equal(parseHostMsg({ ...art, tile: '1' }), null);
  assert.equal(parseHostMsg({ ...art, data: 'x' }), null);
  assert.equal(parseHostMsg({ ...art, w: 0 }), null);
  assert.equal(parseHostMsg({ ...art, h: 5000 }), null);
  assert.equal(parseHostMsg({ ...art, qid: -1 }), null);
  // A guest never sends media.
  assert.equal(parseClientMsg(art), null);
});
