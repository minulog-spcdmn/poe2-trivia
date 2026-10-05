import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AZURITE_FAST_MS,
  BLAST_OPTIONS,
  DELVE_LIVES,
  DELVE_MAX_DYNAMITE,
  DELVE_MAX_FLARES,
  DELVE_MAX_WARDS,
  DELVE_MIN_TIMER,
  DELVE_STEPS,
  FINDS,
  FINDS_FROM,
  FIND_TIMER,
  FLARE_AT_MS,
  FLARE_MS,
  blastRules,
  blastedOffer,
  delveLockout,
  delveRules,
  delveTimer,
  dynamiteOf,
  findOffer,
  findRules,
  flaresOf,
  inventoryOf,
  livesOf,
  questionTimer,
  tileVeilSize,
  wardsOf,
  type FindKind,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, Engine, activeRules, createGame, isFake, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { delveNotices, flareIn, inventoryChanges } from '../src/lib/delveSession.ts';
import { veilPace } from '../src/lib/patches.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  // Spread small seeds apart, or their first rolls (who sits first) all come out alike.
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };

/** A Delve run with a controllable clock; `host` null for hot-seat. Helpers act as the trusted host. */
function delve(names: string[], opts: { host?: string | null; seed?: number } = {}) {
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
    set s(v: GameState) {
      s = v;
    },
    act(a: Action, from: string | null = null) {
      s = engine.apply(s, a, from);
      return s;
    },
    active: () => s.players[s.turn],
    /** Changes the host's state by hand (a depth, an inventory, a find on offer). */
    edit(fn: (s: GameState) => void) {
      const c = structuredClone(s);
      fn(c);
      s = c;
    },
    /** Makes the first card on offer a find, as a lucky roll would. */
    plant(kind: FindKind = 'azurite') {
      h.edit((c) => (c.delve!.find = { category: c.offered[0], kind }));
      return s.offered[0];
    },
    give(id: string, inv: Partial<Inventory>) {
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { wards: 0, flares: 0, dynamite: 0, ...inv }));
    },
    clockIn: () => h.act({ type: 'clock', askedAt: s.question!.askedAt }),
    answer(ok: boolean, from: string | null = null) {
      const q = s.question!;
      return h.act({ type: 'answer', index: ok ? right(q) : wrongIdx(q), askedAt: q.askedAt }, from);
    },
    /** A whole turn on an ordinary card (never the find), answered right. */
    plainTurn() {
      h.act({ type: 'pick', category: s.offered.find((c) => c !== s.delve!.find?.category)! });
      h.clockIn();
      h.answer(true);
      h.act({ type: 'next' });
    },
  };
  return h;
}

const at = (h: ReturnType<typeof delve>, depth: number) => h.edit((c) => (c.round = depth));

/** A two-player online run at `depth` whose first turn is the guest's or the host's. */
function online(who: 'guest' | 'host', depth = 20) {
  for (let seed = 1; seed < 60; seed++) {
    const h = delve(['Ash', 'Brea'], { seed });
    if ((h.active().id === 'p0') !== (who === 'host')) continue;
    at(h, depth);
    return { h, id: h.active().id };
  }
  throw new Error(`no seed put the ${who} on turn first`);
}

// ---- the rules -------------------------------------------------------------

test('a find asks under the deepest step of the curve at any depth, with the shortest clock', () => {
  const deepest = DELVE_STEPS.at(-1)!;
  for (const d of [FINDS_FROM, 13, 20, 40, 75, 300]) {
    const r = findRules(d);
    assert.deepEqual(
      { options: r.options, similarNames: r.similarNames, fakes: r.fakes, grayscale: r.grayscale, mirror: r.mirror },
      { options: deepest.options, similarNames: deepest.similarNames, fakes: deepest.fakes, grayscale: deepest.grayscale, mirror: deepest.mirror },
    );
    assert.deepEqual(r.veil, delveRules(1000).veil, 'the slowest veil');
    // Neither the art/name mix nor the lockout makes a question harder: they stay the depth's.
    assert.equal(r.artChance, delveRules(d).artChance);
    assert.equal(r.lockout, delveLockout(d));
  }
  assert.deepEqual({ ...findRules(1000) }, { ...delveRules(1000) });
  assert.equal(FIND_TIMER, DELVE_MIN_TIMER);
  assert.equal(FIND_TIMER, delveTimer(1000));
});

test('finds turn up from fixed depths, with fixed chances that leave most offers plain', () => {
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.item, f.max]),
    [
      ['flare', 'flares', DELVE_MAX_FLARES],
      ['azurite', 'wards', DELVE_MAX_WARDS],
      ['dynamite', 'dynamite', DELVE_MAX_DYNAMITE],
    ],
  );
  assert.deepEqual([DELVE_MAX_WARDS, DELVE_MAX_FLARES, DELVE_MAX_DYNAMITE], [3, 3, 3]);
  assert.ok(FINDS.every((f) => f.from >= 5 && f.chance > 0 && f.chance <= 0.2));
  assert.ok(FINDS.reduce((sum, f) => sum + f.chance, 0) <= 0.4);
  assert.equal(FINDS.find((f) => f.kind === 'azurite')!.from, 13, 'azurite where Eternal starts');
});

test('the Azurite Vein\'s fast window lets half the art burn in first, and still leaves 3 s', () => {
  const ms = FIND_TIMER * 1000;
  const veil = findRules(13).veil!;
  // The art of a name question (see tests/delve.test.ts for where these timings come from).
  const whole = veilPace(ms * veil.share, veil.size ** 2);
  const halfArt = 400 + (veil.size ** 2 / 2) * whole.gap + whole.burn;
  // A "find the art" picture, the last of which starts up to half a step late.
  const count = tileVeilSize(veil.size) ** 2;
  const tile = veilPace(ms * veil.share, count);
  const halfTile = 400 + tile.gap / 2 + (count / 2) * tile.gap + tile.burn;
  assert.ok(halfArt <= AZURITE_FAST_MS, `half the art in at ${Math.round(halfArt)} ms`);
  assert.ok(halfTile <= AZURITE_FAST_MS, `half a picture in at ${Math.round(halfTile)} ms`);
  assert.equal(ms - AZURITE_FAST_MS, 3000, 'the window closes as the clock shows 3');
});

test('a blasted card plays the depth with four options and no more made-up names than fit', () => {
  for (const d of [1, 13, 20, 40, 100]) {
    const r = blastRules(d);
    assert.equal(r.options, BLAST_OPTIONS);
    assert.ok(r.fakes <= BLAST_OPTIONS / 2);
    assert.deepEqual({ ...r, options: 0, fakes: 0 }, { ...delveRules(d), options: 0, fakes: 0 });
  }
});

// ---- the offer -------------------------------------------------------------

test('one roll per offer: at most one find, each from its depth, about as often as its chance', () => {
  const h = delve(['Ash'], { seed: 3 });
  const seen: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
  const turns: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
  for (let i = 0; i < 700; i++) {
    const s = h.s;
    assert.equal(s.phase, 'choosing');
    const f = s.delve!.find ?? null;
    assert.deepEqual(findOffer(s), f);
    if (f) {
      assert.ok(s.offered.includes(f.category), 'the find is one of the cards on offer');
      assert.ok(s.round >= FINDS.find((x) => x.kind === f.kind)!.from, `${f.kind} at depth ${s.round}`);
      seen[f.kind]++;
    }
    for (const x of FINDS) if (s.round >= x.from) turns[x.kind]++;
    h.plainTurn();
  }
  for (const x of FINDS) {
    const share = seen[x.kind] / turns[x.kind];
    assert.ok(Math.abs(share - x.chance) < 0.05, `${x.kind}: ${seen[x.kind]} of ${turns[x.kind]}`);
  }
});

test('nobody finds what they already hold all they can of; the other finds keep their chances', () => {
  const h = delve(['Ash'], { seed: 5 });
  at(h, 30);
  const id = h.active().id;
  h.give(id, { wards: DELVE_MAX_WARDS });
  let others = 0;
  for (let i = 0; i < 150; i++) {
    assert.notEqual(h.s.delve!.find?.kind, 'azurite', `depth ${h.s.round}`);
    if (h.s.delve!.find) others++;
    h.plainTurn();
  }
  assert.ok(others > 15, `${others} other finds`);
});

// ---- a find's question -----------------------------------------------------

test('picking a find asks the hardest question there is, whatever the depth', () => {
  let names = 0;
  let arts = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const kind = (['azurite', 'flare', 'dynamite'] as const)[seed % 3];
    const h = delve(['Ash'], { seed });
    at(h, FINDS_FROM);
    h.edit((c) => (c.offered = h.engine.offerCategories(c, c.players[0])));
    const card = h.plant(kind);
    h.act({ type: 'pick', category: card });
    const q = h.s.question!;
    assert.equal(q.find, kind);
    assert.deepEqual(activeRules(h.s), findRules(FINDS_FROM));
    assert.equal(q.options.length, 8);
    const veil = findRules(FINDS_FROM).veil!;
    if (q.mode === 'name') {
      names++;
      assert.equal(q.options.filter(isFake).length, 3, 'three made-up names');
      assert.deepEqual(q.mirrored, [true]);
      assert.equal(q.veil!.size, veil.size);
    } else {
      arts++;
      assert.ok(q.mirrored!.every(Boolean), 'every picture mirrored');
      assert.equal(q.veil!.size, tileVeilSize(veil.size), 'every "find the art" picture burns in');
    }
    assert.equal(q.veil!.seconds, FIND_TIMER * veil.share);
    h.clockIn();
    assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, FIND_TIMER * 1000);
    assert.equal(questionTimer(h.s), FIND_TIMER);
    assert.equal(h.active().recent.at(-1), card, 'locked like any pick');
  }
  assert.ok(names > 0 && arts > 0, `${names} name and ${arts} art questions`);
});

test('the other cards beside a find ask questions of the depth', () => {
  const h = delve(['Ash']);
  at(h, 13);
  h.plant();
  h.act({ type: 'pick', category: h.s.offered[1] });
  assert.equal(h.s.question!.find, undefined);
  assert.deepEqual(activeRules(h.s), delveRules(13));
  h.clockIn();
  assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, delveTimer(13) * 1000);
});

/** A run at depth 20 with a find picked and its clock started. */
function found(kind: FindKind, opts: { host?: string | null } = { host: null }) {
  const h = delve(['Ash'], opts);
  at(h, 20);
  h.act({ type: 'pick', category: h.plant(kind) });
  h.clockIn();
  return h;
}

test('a right answer to a Flare or Dynamite Cache earns its item at any speed', () => {
  for (const kind of ['flare', 'dynamite'] as const) {
    const h = found(kind);
    const id = h.active().id;
    h.clock.now += FIND_TIMER * 1000 - 100;
    h.answer(true);
    assert.equal(h.s.reveal!.gained, kind === 'flare' ? 'flares' : 'dynamite');
    assert.deepEqual(inventoryOf(h.s, id), { wards: 0, flares: kind === 'flare' ? 1 : 0, dynamite: kind === 'dynamite' ? 1 : 0 });
  }
});

test('an Azurite Vein needs a fast right answer for its ward; a slow one earns nothing and costs nothing', () => {
  const fast = found('azurite');
  const id = fast.active().id;
  fast.clock.now += AZURITE_FAST_MS;
  fast.answer(true);
  assert.equal(wardsOf(fast.s, id), 1);
  assert.equal(fast.s.reveal!.gained, 'wards');

  const slow = found('azurite');
  slow.clock.now += AZURITE_FAST_MS + 1;
  slow.answer(true);
  assert.equal(wardsOf(slow.s, id), 0);
  assert.equal(slow.s.reveal!.correct, true);
  assert.equal(slow.s.reveal!.gained, undefined);
  assert.equal(livesOf(slow.s, id), DELVE_LIVES);
});

test('wrong or out of time on a find costs a life like any other', () => {
  for (const kind of ['azurite', 'flare', 'dynamite'] as const) {
    const wrong = found(kind);
    const id = wrong.active().id;
    wrong.answer(false);
    assert.equal(livesOf(wrong.s, id), DELVE_LIVES - 1);
    assert.deepEqual(inventoryOf(wrong.s, id), { wards: 0, flares: 0, dynamite: 0 });
    const late = found(kind);
    late.clock.now += FIND_TIMER * 1000 + ANSWER_GRACE_MS + 1;
    late.act({ type: 'answer', index: null, askedAt: late.s.question!.askedAt });
    assert.equal(livesOf(late.s, id), DELVE_LIVES - 1);
  }
});

test("a guest's answer to a vein gets the same network allowance as at the deadline; the host's own needs none", () => {
  const guest = online('guest');
  guest.h.act({ type: 'pick', category: guest.h.plant() }, guest.id);
  guest.h.clockIn();
  guest.h.clock.now += AZURITE_FAST_MS + ANSWER_GRACE_MS;
  const inTime = guest.h.s;
  guest.h.answer(true, guest.id);
  assert.equal(guest.h.s.reveal!.gained, 'wards');
  guest.h.s = inTime;
  guest.h.clock.now += 1;
  guest.h.answer(true, guest.id);
  assert.equal(guest.h.s.reveal!.gained, undefined);

  const host = online('host');
  host.h.act({ type: 'pick', category: host.h.plant() }, host.id);
  host.h.clockIn();
  host.h.clock.now += AZURITE_FAST_MS;
  const fast = host.h.s;
  host.h.answer(true, host.id);
  assert.equal(host.h.s.reveal!.gained, 'wards');
  host.h.s = fast;
  host.h.clock.now += 1;
  host.h.answer(true, host.id);
  assert.equal(host.h.s.reveal!.gained, undefined);
});

test('items stop at three each', () => {
  for (const [kind, item] of [['azurite', 'wards'], ['flare', 'flares'], ['dynamite', 'dynamite']] as const) {
    const h = found(kind);
    const id = h.active().id;
    h.give(id, { [item]: 3 });
    h.answer(true);
    assert.equal(inventoryOf(h.s, id)[item], 3);
    assert.equal(h.s.reveal!.gained, undefined);
  }
  // Nonsense in a save reads as something sane.
  const h = delve(['Ash']);
  const id = h.active().id;
  h.give(id, { wards: 99, flares: NaN, dynamite: -2 });
  assert.deepEqual(inventoryOf(h.s, id), { wards: 3, flares: 0, dynamite: 0 });
  h.edit((c) => delete c.delve!.inventory);
  assert.deepEqual(inventoryOf(h.s, id), { wards: 0, flares: 0, dynamite: 0 });
});

// ---- wards -----------------------------------------------------------------

test('a loss takes an Azurite Ward before a life, and the streak ends either way', () => {
  const h = delve(['Ash'], { host: null });
  const id = h.active().id;
  h.give(id, { wards: 2 });
  h.edit((c) => (c.players[0].streak = 4));
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.answer(false);
  assert.equal(h.s.reveal!.warded, true);
  assert.equal(wardsOf(h.s, id), 1);
  assert.equal(livesOf(h.s, id), DELVE_LIVES);
  assert.deepEqual(h.s.delve!.losses[id] ?? [], []);
  assert.equal(h.s.players[0].streak, 0);
  h.act({ type: 'next' });
  // Out of time with the last ward.
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.act({ type: 'answer', index: null });
  assert.equal(h.s.reveal!.warded, true);
  assert.equal(wardsOf(h.s, id), 0);
  h.act({ type: 'next' });
  // No ward left: a life.
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.answer(false);
  assert.equal(h.s.reveal!.warded, undefined);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
});

test('a player who runs out of time to pick while away loses a ward first', () => {
  const h = delve(['Ash', 'Brea']);
  const id = h.active().id;
  h.give(id, { wards: 1 });
  const prev = h.s;
  h.act({ type: 'connection', playerId: id, connected: false });
  h.clock.now = h.s.delve!.pickBy!;
  h.act({ type: 'expire' });
  assert.equal(wardsOf(h.s, id), 0);
  assert.equal(livesOf(h.s, id), DELVE_LIVES);
  assert.deepEqual(delveNotices(prev, h.s), [{ kind: 'missed', playerId: id, warded: true }]);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'wards', change: 'used', left: 0 }]);
});

test('a card picked for a player who hesitated is never the find', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const h = delve(['Ash', 'Brea'], { seed });
    at(h, 20);
    const card = h.plant(seed % 2 ? 'azurite' : 'flare');
    h.clock.now = h.s.delve!.pickBy!;
    h.act({ type: 'expire' });
    assert.notEqual(h.s.question!.category, card);
    assert.equal(h.s.question!.find, undefined);
  }
});

// ---- flares ----------------------------------------------------------------

/** A question on the clock for a player holding `flares`. */
function flaring(flares = 1, opts: { host?: string | null } = { host: null }) {
  const h = delve(['Ash'], opts);
  at(h, 20);
  h.give(h.active().id, { flares });
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  return h;
}

test('a flare burns by itself as the clock nears its end, once a question, and moves the deadline', () => {
  const h = flaring(2);
  const id = h.active().id;
  const q = h.s.question!;
  assert.equal(flareIn(h.s, h.clock.now), q.deadline! - FLARE_AT_MS - h.clock.now);
  // Too early: nothing burns.
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(flaresOf(h.s, id), 2);
  assert.equal(h.s.question!.flared, undefined);
  h.clock.now = q.deadline! - FLARE_AT_MS;
  const prev = h.s;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(flaresOf(h.s, id), 1);
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'flares', change: 'used', left: 1 }]);
  assert.equal(flareIn(h.s, h.clock.now), null, 'once a question');
  // A second burn does nothing.
  h.clock.now = h.s.question!.deadline! - FLARE_AT_MS;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(flaresOf(h.s, id), 1);
  // Guests see the new deadline, and the answer counts until it.
  assert.equal(publicView(h.s).question!.deadline, q.deadline! + FLARE_MS);
  h.clock.now = q.deadline! + FLARE_MS - 10;
  h.answer(true, 'p0');
  assert.equal(h.s.reveal!.correct, true);
});

test('a flare that fires late still saves the player, and never after the time-out or an answer', () => {
  const late = flaring();
  const q = late.s.question!;
  late.clock.now = q.deadline! + ANSWER_GRACE_MS;
  late.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(late.s.question!.deadline, late.clock.now + FLARE_MS);

  const tooLate = flaring();
  tooLate.clock.now = tooLate.s.question!.deadline! + ANSWER_GRACE_MS + 1;
  tooLate.act({ type: 'flare', askedAt: tooLate.s.question!.askedAt });
  assert.equal(tooLate.s.question!.flared, undefined);

  const answered = flaring();
  const askedAt = answered.s.question!.askedAt;
  answered.clock.now = answered.s.question!.deadline! - FLARE_AT_MS;
  answered.answer(true);
  answered.act({ type: 'flare', askedAt });
  assert.equal(flaresOf(answered.s, answered.active().id), 1);
  assert.equal(answered.s.phase, 'reveal');

  const stale = flaring();
  stale.clock.now = stale.s.question!.deadline! - FLARE_AT_MS;
  stale.act({ type: 'flare', askedAt: stale.s.question!.askedAt - 1 });
  assert.equal(stale.s.question!.flared, undefined);
});

test('no flare burns before the clock starts, without one, for someone away, or on a guest\'s word', () => {
  const h = delve(['Ash', 'Brea']);
  at(h, 20);
  const id = h.active().id;
  h.give(id, { flares: 1 });
  h.act({ type: 'pick', category: h.s.offered[0] });
  assert.equal(flareIn(h.s, h.clock.now), null, 'not before the clock starts');
  h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
  assert.equal(h.s.question!.flared, undefined);
  h.clockIn();
  h.clock.now = h.s.question!.deadline! - FLARE_AT_MS;
  assert.throws(() => h.act({ type: 'flare', askedAt: h.s.question!.askedAt }, id));
  assert.throws(() => h.act({ type: 'flare', askedAt: h.s.question!.askedAt }, 'p0'));
  h.act({ type: 'connection', playerId: id, connected: false });
  assert.equal(flareIn(h.s, h.clock.now), null, 'not for someone away');
  h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
  assert.equal(flaresOf(h.s, id), 1);

  const none = flaring(0);
  assert.equal(flareIn(none.s, none.clock.now), null);
  none.clock.now = none.s.question!.deadline! - FLARE_AT_MS;
  none.act({ type: 'flare', askedAt: none.s.question!.askedAt });
  assert.equal(none.s.question!.flared, undefined);
});

test('a flare on an Azurite Vein gives more time, not a longer fast window', () => {
  const h = found('azurite');
  const id = h.active().id;
  h.give(id, { flares: 1 });
  const q = h.s.question!;
  h.clock.now = q.deadline! - FLARE_AT_MS;
  h.act({ type: 'flare', askedAt: q.askedAt });
  h.answer(true);
  assert.equal(h.s.reveal!.correct, true);
  assert.equal(h.s.reveal!.gained, undefined);
  assert.equal(questionTimer(h.s), FIND_TIMER, 'the question still started with the find\'s clock');
});

// ---- dynamite --------------------------------------------------------------

test('dynamite blasts open a fourth card, even a locked one, once a turn', () => {
  const h = delve(['Ash'], { host: null });
  at(h, 20);
  const id = h.active().id;
  h.give(id, { dynamite: 2 });
  h.edit((c) => (c.players[0].recent = [h.engine.categories.find((x) => !c.offered.includes(x))!]));
  const locked = h.s.players[0].recent[0];
  const prev = h.s;
  h.act({ type: 'blast', category: locked });
  assert.deepEqual(h.s.offered.slice(3), [locked]);
  assert.equal(blastedOffer(h.s), locked);
  assert.equal(dynamiteOf(h.s, id), 1);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'dynamite', change: 'used', left: 1 }]);
  assert.throws(() => h.act({ type: 'blast', category: h.engine.categories.find((x) => !h.s.offered.includes(x))! }), /Only one/);
  h.act({ type: 'pick', category: locked });
  const q = h.s.question!;
  assert.equal(q.blasted, true);
  assert.equal(q.find, undefined);
  assert.equal(q.options.length, BLAST_OPTIONS);
  assert.deepEqual(activeRules(h.s), blastRules(20));
  h.clockIn();
  assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, delveTimer(20) * 1000);
  h.answer(true);
  assert.equal(h.s.reveal!.gained, undefined, 'nothing to find');
  h.act({ type: 'next' });
  assert.equal(h.s.offered.length, 3);
  assert.equal(h.s.delve!.blasted, null);
  // A new turn, a new blast.
  h.act({ type: 'blast', category: h.engine.categories.find((x) => !h.s.offered.includes(x))! });
  assert.equal(dynamiteOf(h.s, id), 0);
});

test('dynamite can\'t be blasted without any, off turn, outside choosing, or at a card already on offer', () => {
  const h = delve(['Ash', 'Brea']);
  at(h, 20);
  const on = h.active().id;
  const off = h.s.players.find((p) => p.id !== on)!.id;
  const fresh = () => h.engine.categories.find((x) => !h.s.offered.includes(x))!;
  assert.throws(() => h.act({ type: 'blast', category: fresh() }, on), /no dynamite/);
  h.give(on, { dynamite: 1 });
  h.give(off, { dynamite: 1 });
  assert.throws(() => h.act({ type: 'blast', category: fresh() }, off), /not your turn/);
  assert.throws(() => h.act({ type: 'blast', category: h.s.offered[0] }, on), /already on offer/);
  assert.throws(() => h.act({ type: 'blast', category: 'Socks' }, on), /no such/);
  assert.throws(() => h.act({ type: 'blast', category: 42 } as never, on), /no such/);
  assert.equal(dynamiteOf(h.s, on), 1);
  h.act({ type: 'pick', category: h.s.offered[0] }, on);
  assert.throws(() => h.act({ type: 'blast', category: fresh() }, on));
  assert.equal(dynamiteOf(h.s, on), 1);
  // Not in another mode either.
  const engine = new Engine(items);
  let t = createGame('p0', { ...SETTINGS, mode: 'turns' });
  t = engine.apply(t, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  t = engine.apply(t, { type: 'start' }, 'p0');
  assert.throws(() => engine.apply(t, { type: 'blast', category: engine.categories[0] }, 'p0'));
});

test('a guest blasts with their own dynamite on their own turn, and the host can\'t spend it for them', () => {
  const { h, id } = online('guest');
  h.give(id, { dynamite: 1 });
  h.give('p0', { dynamite: 1 });
  const cat = h.engine.categories.find((x) => !h.s.offered.includes(x))!;
  h.act({ type: 'blast', category: cat }, id);
  assert.equal(dynamiteOf(h.s, id), 0);
  assert.equal(dynamiteOf(h.s, 'p0'), 1);
  assert.equal(blastedOffer(publicView(h.s)), cat);
});

// ---- trust, views and lifetimes --------------------------------------------

test("guests can't make up a find or award themselves items", () => {
  const { h, id } = online('guest');
  h.edit((c) => (c.delve!.find = null));
  h.act({ type: 'pick', category: h.s.offered[0], find: 'azurite' } as never, id);
  assert.equal(h.s.question!.find, undefined);
  assert.throws(() => h.act({ type: 'clock', askedAt: h.s.question!.askedAt }, id));
  h.clockIn();
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt, gained: 'wards' } as never, id);
  assert.deepEqual(inventoryOf(h.s, id), { wards: 0, flares: 0, dynamite: 0 });
});

test('guests see the find, the question it asked and everyone\'s items, but never the answer', () => {
  const h = delve(['Ash', 'Brea']);
  at(h, 20);
  const id = h.active().id;
  h.give(id, { wards: 2, flares: 1, dynamite: 3 });
  const card = h.plant();
  assert.deepEqual(findOffer(publicView(h.s)), { category: card, kind: 'azurite' });
  h.act({ type: 'pick', category: card }, null);
  let view = publicView(h.s);
  assert.equal(view.question!.find, 'azurite');
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.deepEqual(inventoryOf(view, id), { wards: 2, flares: 1, dynamite: 3 });
  h.clockIn();
  view = publicView(h.s);
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.equal(view.question!.clockAt, h.s.question!.clockAt, 'guests can draw the fast window');
  assert.equal(questionTimer(view), FIND_TIMER);
});

test('leaving or being kicked takes your items with you, and a new run starts with none', () => {
  const h = delve(['Ash', 'Brea', 'Cyd']);
  const [a, b] = h.s.players.map((p) => p.id).filter((id) => id !== 'p0');
  h.give(a, { wards: 2 });
  h.give(b, { flares: 1 });
  h.give('p0', { dynamite: 3 });
  h.act({ type: 'remove', playerId: a }, 'p0');
  assert.equal(h.s.delve!.inventory![a], undefined);
  h.act({ type: 'remove', playerId: b }, b);
  assert.equal(h.s.delve!.inventory![b], undefined);
  assert.equal(dynamiteOf(h.s, 'p0'), 3);
  h.act({ type: 'restart', play: true }, 'p0');
  assert.deepEqual(h.s.delve!.inventory, {});
  assert.equal(h.s.delve!.find, null);
  assert.equal(h.s.delve!.blasted, null);
});

test('a question asked again, or set aside by a host reload, keeps what it was', () => {
  const h = delve(['Ash']);
  at(h, 20);
  const card = h.plant('flare');
  h.act({ type: 'pick', category: card });
  h.act({ type: 'reask' });
  assert.equal(h.s.question!.find, 'flare');
  assert.equal(h.s.question!.category, card);

  const b = delve(['Ash'], { host: null });
  at(b, 20);
  b.give(b.active().id, { dynamite: 1 });
  const blasted = b.engine.categories.find((x) => !b.s.offered.includes(x))!;
  b.act({ type: 'blast', category: blasted });
  b.act({ type: 'pick', category: blasted });
  b.act({ type: 'reask' });
  assert.equal(b.s.question!.blasted, true);
  assert.equal(b.s.question!.options.length, BLAST_OPTIONS);

  // A guest's question is set aside after a host reload, and the same cards come back.
  const { h: g, id } = online('guest');
  const infused = g.plant();
  g.act({ type: 'pick', category: infused }, id);
  g.act({ type: 'connection', playerId: id, connected: false });
  g.act({ type: 'resumed' });
  assert.equal(g.s.phase, 'choosing');
  assert.deepEqual(findOffer(g.s), { category: infused, kind: 'azurite' });
});

test('item changes are reported for the phial and its sounds', () => {
  const h = found('azurite');
  const id = h.active().id;
  const prev = h.s;
  h.answer(true);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'wards', change: 'gained', left: 1 }]);
  assert.deepEqual(delveNotices(prev, h.s), []);
  assert.deepEqual(inventoryChanges(null, h.s), []);
});

test('a game saved before finds plays on without them', () => {
  const h = delve(['Ash'], { host: null });
  const id = h.active().id;
  h.edit((c) => {
    delete c.delve!.inventory;
    delete c.delve!.find;
    delete c.delve!.blasted;
  });
  assert.equal(findOffer(h.s), null);
  assert.equal(blastedOffer(h.s), null);
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.answer(false);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
  h.act({ type: 'next' });
  assert.equal(h.s.phase, 'choosing');
});
