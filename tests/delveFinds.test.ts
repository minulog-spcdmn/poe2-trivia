import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLAST_OPTIONS,
  BLAST_TIMER,
  DELVE_LIVES,
  DELVE_MAX_DYNAMITE,
  DELVE_MAX_FLARES,
  DELVE_MAX_WARDS,
  DELVE_MIN_TIMER,
  FINDS,
  FINDS_FROM,
  FIND_DEEPER,
  FLARE_AT_MS,
  FLARE_MS,
  ITEM_KINDS,
  SHARDS_PER_WARD,
  blastRules,
  blastedOffer,
  delveLockout,
  delveRules,
  delveTileVeil,
  delveTimer,
  dynamiteOf,
  findDepth,
  findOffer,
  findReward,
  findRules,
  findTileVeil,
  findTimer,
  flaresOf,
  hasRoom,
  inventoryOf,
  livesOf,
  questionTimer,
  shardsOf,
  tileVeilSize,
  veinWindow,
  veinWindowMs,
  wardsOf,
  type FindKind,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, Engine, KNOB_STEPS, activeRules, createGame, isFake, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
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

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
const FULL: Inventory = { wards: DELVE_MAX_WARDS, flares: DELVE_MAX_FLARES, dynamite: DELVE_MAX_DYNAMITE, shards: 0 };

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
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { ...NONE, ...inv }));
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

const KNOBS = ['options', 'similarNames', 'fakes', 'grayscale', 'mirror'] as const;
const order = (k: (typeof KNOBS)[number], v: unknown) => (KNOB_STEPS[k] as readonly unknown[]).indexOf(v);

test("a find asks the question of fifteen depths deeper: its rules, its clock and its pictures' veil", () => {
  assert.equal(FIND_DEEPER, 15);
  for (const d of [FINDS_FROM, 8, 12, 13, 20, 40, 59, 60, 75, 300]) {
    const [r, deep] = [findRules(d), delveRules(d + FIND_DEEPER)];
    assert.equal(findDepth(d), d + FIND_DEEPER);
    for (const k of KNOBS) assert.equal(r[k], deep[k], `${k} at ${d}`);
    assert.deepEqual(r.veil, deep.veil, `veil at ${d}`);
    assert.equal(findTimer(d), delveTimer(d + FIND_DEEPER));
    assert.equal(findTileVeil(d), delveTileVeil(d + FIND_DEEPER));
    // Neither the art/name mix nor the lockout makes a question harder: they stay the depth's.
    assert.equal(r.artChance, delveRules(d).artChance);
    assert.equal(r.lockout, delveLockout(d));
  }
});

test('a find is never easier than its depth, nearly always harder, and the hardest there is only from depth 60', () => {
  const deepest = delveRules(1000);
  for (let d = FINDS_FROM; d <= 200; d++) {
    const [r, here] = [findRules(d), delveRules(d)];
    for (const k of KNOBS) assert.ok(order(k, r[k]) >= order(k, here[k]), `${k} eases at ${d}`);
    assert.ok(findTimer(d) <= delveTimer(d), `more time at ${d}`);
    const harder = KNOBS.some((k) => r[k] !== here[k]) || JSON.stringify(r.veil) !== JSON.stringify(here.veil) || findTimer(d) < delveTimer(d);
    // Harder wherever the curve has anything harder within fifteen depths (from 50 to 59 it has nothing until 75).
    if (d < 50 || (d >= 60 && d < 75)) assert.ok(harder, `nothing harder at ${d}`);
    const hardest = KNOBS.every((k) => r[k] === deepest[k]) && JSON.stringify(r.veil) === JSON.stringify(deepest.veil) && findTimer(d) === DELVE_MIN_TIMER;
    assert.equal(hardest, d >= 60, `the hardest question at ${d}`);
  }
});

test("a find's clock is fair: never the shortest near the top, and never shorter than any depth's", () => {
  // At the first finds, a find gets 13 s, not the 7 of depth 55.
  assert.equal(findTimer(FINDS_FROM), 13);
  assert.equal(findTimer(8), 13);
  assert.equal(findTimer(12), 12);
  assert.equal(findTimer(40), DELVE_MIN_TIMER);
  for (let d = 1; d <= 200; d++) assert.ok(findTimer(d) >= DELVE_MIN_TIMER && findTimer(d) <= 16);
});

test('even a find has half its art in with over 3 s left, and an Azurite Vein half of it in before its window closes', () => {
  for (let d = FINDS_FROM; d <= 200; d++) {
    const secs = findTimer(d);
    const ms = secs * 1000;
    const veil = findRules(d).veil;
    if (!veil) continue;
    // The art of a name question (see tests/delve.test.ts for where these timings come from).
    const whole = veilPace(ms * veil.share, veil.size ** 2);
    const halfArt = 400 + (veil.size ** 2 / 2) * whole.gap + whole.burn;
    // A "find the art" picture, the last of which starts up to half a step late.
    const count = tileVeilSize(veil.size) ** 2;
    const tile = veilPace(ms * veil.share, count);
    const halfTile = 400 + tile.gap / 2 + (count / 2) * tile.gap + tile.burn;
    for (const half of [halfArt, halfTile]) {
      assert.ok(ms - half >= 3000, `depth ${d}: ${Math.round(ms - half)} ms left with half the art in`);
      assert.ok(half <= veinWindow(secs), `depth ${d}: half the art in at ${Math.round(half)} ms, the window closes at ${veinWindow(secs)}`);
    }
  }
});

test("the Azurite Vein's window is the first half of the clock, in whole seconds", () => {
  for (let secs = DELVE_MIN_TIMER; secs <= 16; secs++) {
    const w = veinWindow(secs);
    assert.equal(w % 1000, 0, `${secs} s`);
    assert.ok(w >= (secs * 1000) / 2 && w < (secs * 1000) / 2 + 1000, `${secs} s: ${w}`);
  }
  assert.equal(veinWindow(13), 7000);
  assert.equal(veinWindow(7), 4000);
  assert.equal(veinWindow(BLAST_TIMER), 8000);
});

test('a blasted card is a safe question at any depth: as at the surface, on the longest clock', () => {
  const surface = delveRules(1);
  assert.equal(BLAST_TIMER, delveTimer(1));
  assert.equal(BLAST_TIMER, 16);
  assert.equal(BLAST_OPTIONS, 4);
  for (const d of [1, 13, 20, 40, 75, 300]) {
    const r = blastRules(d);
    assert.deepEqual(
      { options: r.options, similarNames: r.similarNames, fakes: r.fakes, grayscale: r.grayscale, mirror: r.mirror, veil: r.veil },
      { options: 4, similarNames: 0, fakes: 0, grayscale: 'off', mirror: 0, veil: null },
    );
    for (const k of KNOBS) assert.equal(r[k], surface[k]);
    assert.equal(r.artChance, delveRules(d).artChance);
    assert.equal(r.lockout, delveLockout(d));
  }
});

// ---- rewards ---------------------------------------------------------------

test('a right answer to a find always earns something, unless the player carries all they can of everything', () => {
  // Its own item first.
  assert.equal(findReward('azurite', NONE, true), 'wards');
  assert.equal(findReward('azurite', NONE, false), 'shards');
  assert.equal(findReward('flare', NONE, false), 'flares');
  assert.equal(findReward('dynamite', NONE, false), 'dynamite');
  assert.equal(findReward('flare', NONE, true), 'flares', 'speed only matters to a vein');
  // Full of it: a flare, dynamite or a shard instead, the first there is room for.
  const wards3 = { ...NONE, wards: 3 };
  assert.equal(findReward('azurite', wards3, true), 'flares');
  assert.equal(findReward('azurite', wards3, false), 'flares');
  assert.equal(findReward('azurite', { ...wards3, flares: 3 }, true), 'dynamite');
  assert.equal(findReward('flare', { ...NONE, flares: 3 }, false), 'dynamite');
  assert.equal(findReward('flare', { ...NONE, flares: 3, dynamite: 3 }, false), 'shards');
  assert.equal(findReward('dynamite', { ...NONE, dynamite: 3 }, false), 'flares');
  assert.equal(findReward('dynamite', { ...NONE, dynamite: 3, flares: 3 }, false), 'shards');
  // A shard only toward a ward there is room for.
  assert.equal(hasRoom({ ...NONE, wards: 2, shards: 1 }, 'shards'), true);
  assert.equal(hasRoom({ ...NONE, wards: 3 }, 'shards'), false);
  for (const kind of ['azurite', 'flare', 'dynamite'] as const) for (const fast of [true, false]) assert.equal(findReward(kind, FULL, fast), null);
  // Anything short of full earns something.
  for (const item of ITEM_KINDS.filter((k) => k !== 'shards')) {
    const inv = { ...FULL, [item]: FULL[item] - 1 };
    for (const kind of ['azurite', 'flare', 'dynamite'] as const) assert.notEqual(findReward(kind, inv, false), null, `${kind} short of ${item}`);
  }
});

// ---- the offer -------------------------------------------------------------

test('finds turn up from fixed depths, with fixed chances: one offer in ten from 5, one in five from 8, one in three from 12', () => {
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.item, f.from, f.max]),
    [
      ['flare', 'flares', 5, DELVE_MAX_FLARES],
      ['azurite', 'wards', 8, DELVE_MAX_WARDS],
      ['dynamite', 'dynamite', 12, DELVE_MAX_DYNAMITE],
    ],
  );
  assert.deepEqual([DELVE_MAX_WARDS, DELVE_MAX_FLARES, DELVE_MAX_DYNAMITE, SHARDS_PER_WARD], [3, 3, 3, 2]);
  const total = (d: number) => FINDS.filter((f) => d >= f.from).reduce((sum, f) => sum + f.chance, 0);
  assert.equal(total(4), 0);
  assert.ok(Math.abs(total(5) - 0.1) < 1e-9);
  assert.ok(total(8) >= 0.2 && total(8) <= 0.25, `${total(8)} at 8`);
  assert.ok(total(12) >= 0.3 && total(12) <= 0.35, `${total(12)} by 12`);
  assert.equal(total(200), total(12), 'no more often deeper down');
});

test('one roll per offer: at most one find, each from its depth, about as often as its chance', () => {
  const h = delve(['Ash'], { seed: 3 });
  const seen: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
  const turns: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
  for (let i = 0; i < 900; i++) {
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
    // Never answering a find keeps the player empty-handed, so every find stays on offer.
    h.plainTurn();
  }
  for (const x of FINDS) {
    const share = seen[x.kind] / turns[x.kind];
    assert.ok(Math.abs(share - x.chance) < 0.04, `${x.kind}: ${seen[x.kind]} of ${turns[x.kind]}`);
  }
});

test('a find turns up even for someone full of its item, but never for someone full of everything', () => {
  const h = delve(['Ash'], { seed: 5 });
  at(h, 30);
  const id = h.active().id;
  h.give(id, { wards: DELVE_MAX_WARDS });
  let veins = 0;
  for (let i = 0; i < 200; i++) {
    if (h.s.delve!.find?.kind === 'azurite') veins++;
    h.plainTurn();
  }
  assert.ok(veins > 10, `${veins} veins`);

  const full = delve(['Ash'], { seed: 5 });
  at(full, 30);
  full.give(full.active().id, FULL);
  for (let i = 0; i < 150; i++) {
    assert.equal(full.s.delve!.find, null, `depth ${full.s.round}`);
    full.plainTurn();
  }
});

// ---- a find's question -----------------------------------------------------

test('picking a find asks the question of fifteen depths deeper, on its clock', () => {
  let names = 0;
  let arts = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const kind = (['azurite', 'flare', 'dynamite'] as const)[seed % 3];
    const depth = [FINDS_FROM, 15, 60][seed % 3];
    const h = delve(['Ash'], { seed });
    at(h, depth);
    h.edit((c) => (c.offered = h.engine.offerCategories(c, c.players[0])));
    const card = h.plant(kind);
    h.act({ type: 'pick', category: card });
    const q = h.s.question!;
    const rules = findRules(depth);
    assert.equal(q.find, kind);
    assert.equal(q.blasted, undefined);
    assert.deepEqual(activeRules(h.s), rules);
    assert.equal(q.options.length, rules.options);
    if (q.mode === 'name') {
      names++;
      assert.equal(q.options.filter(isFake).length, rules.fakes, 'its made-up names');
      if (rules.mirror === 1) assert.deepEqual(q.mirrored, [true]);
      if (rules.veil) assert.equal(q.veil!.size, rules.veil.size);
      else assert.equal(q.veil, null);
    } else {
      arts++;
      if (rules.mirror === 1) assert.ok(q.mirrored!.every(Boolean), 'every picture mirrored');
      if (q.veil) assert.equal(q.veil.size, tileVeilSize(rules.veil!.size), 'a "find the art" picture burns in, cut coarser');
    }
    if (q.veil) assert.equal(q.veil.seconds, findTimer(depth) * rules.veil!.share);
    h.clockIn();
    assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, findTimer(depth) * 1000);
    assert.equal(questionTimer(h.s), findTimer(depth));
    assert.equal(veinWindowMs(h.s), kind === 'azurite' ? veinWindow(findTimer(depth)) : 0);
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
  assert.equal(veinWindowMs(h.s), 0);
});

/** A run at depth 20 with a find picked and its clock started. */
function found(kind: FindKind, opts: { host?: string | null; inv?: Partial<Inventory> } = { host: null }) {
  const h = delve(['Ash'], opts);
  at(h, 20);
  if (opts.inv) h.give(h.active().id, opts.inv);
  h.act({ type: 'pick', category: h.plant(kind) });
  h.clockIn();
  return h;
}

/** The fast window of a vein at depth 20. */
const WINDOW = veinWindow(findTimer(20));

test('a right answer to a Flare or Dynamite Cache earns its item at any speed', () => {
  for (const kind of ['flare', 'dynamite'] as const) {
    const h = found(kind);
    const id = h.active().id;
    h.clock.now += findTimer(20) * 1000 - 100;
    h.answer(true);
    assert.equal(h.s.reveal!.gained, kind === 'flare' ? 'flares' : 'dynamite');
    assert.deepEqual(inventoryOf(h.s, id), { ...NONE, flares: kind === 'flare' ? 1 : 0, dynamite: kind === 'dynamite' ? 1 : 0 });
  }
});

test('an Azurite Vein mines a ward for a fast right answer, and a shard for a slow one; two shards forge a ward', () => {
  const fast = found('azurite');
  const id = fast.active().id;
  fast.clock.now += WINDOW;
  fast.answer(true);
  assert.equal(wardsOf(fast.s, id), 1);
  assert.equal(fast.s.reveal!.gained, 'wards');
  assert.equal(fast.s.reveal!.forged, undefined);

  const slow = found('azurite');
  slow.clock.now += WINDOW + 1;
  let prev = slow.s;
  slow.answer(true);
  assert.deepEqual(inventoryOf(slow.s, id), { ...NONE, shards: 1 });
  assert.equal(slow.s.reveal!.correct, true);
  assert.equal(slow.s.reveal!.gained, 'shards');
  assert.equal(livesOf(slow.s, id), DELVE_LIVES);
  assert.deepEqual(inventoryChanges(prev, slow.s), [{ playerId: id, item: 'shards', change: 'gained', left: 1 }]);

  // A second slow one forges the ward.
  const again = found('azurite', { host: null, inv: { shards: 1 } });
  again.clock.now += findTimer(20) * 1000 - 50;
  prev = again.s;
  again.answer(true);
  assert.deepEqual(inventoryOf(again.s, id), { ...NONE, wards: 1 });
  assert.equal(again.s.reveal!.gained, 'wards');
  assert.equal(again.s.reveal!.forged, true);
  assert.deepEqual(inventoryChanges(prev, again.s), [
    { playerId: id, item: 'wards', change: 'gained', left: 1 },
    { playerId: id, item: 'shards', change: 'used', left: 0 },
  ]);

  // A fast one leaves a shard held for the next.
  const kept = found('azurite', { host: null, inv: { shards: 1 } });
  kept.answer(true);
  assert.deepEqual(inventoryOf(kept.s, id), { ...NONE, wards: 1, shards: 1 });
});

test('a find whose item the player is full of earns something else', () => {
  const vein = found('azurite', { host: null, inv: { wards: 3 } });
  const id = vein.active().id;
  vein.answer(true);
  assert.equal(vein.s.reveal!.gained, 'flares');
  assert.deepEqual(inventoryOf(vein.s, id), { ...NONE, wards: 3, flares: 1 });

  const flare = found('flare', { host: null, inv: { flares: 3 } });
  flare.answer(true);
  assert.equal(flare.s.reveal!.gained, 'dynamite');

  const dyn = found('dynamite', { host: null, inv: { dynamite: 3, flares: 3, wards: 1, shards: 1 } });
  dyn.answer(true);
  assert.equal(dyn.s.reveal!.gained, 'wards');
  assert.equal(dyn.s.reveal!.forged, true);
  assert.deepEqual(inventoryOf(dyn.s, id), { ...NONE, dynamite: 3, flares: 3, wards: 2 });

  // Full of everything (a find planted by hand: none is offered then): a right answer stands, with nothing to carry.
  const full = found('flare', { host: null, inv: FULL });
  full.answer(true);
  assert.equal(full.s.reveal!.correct, true);
  assert.equal(full.s.reveal!.gained, undefined);
  assert.deepEqual(inventoryOf(full.s, id), FULL);
});

test('wrong or out of time on a find costs a life like any other', () => {
  for (const kind of ['azurite', 'flare', 'dynamite'] as const) {
    const wrong = found(kind);
    const id = wrong.active().id;
    wrong.answer(false);
    assert.equal(livesOf(wrong.s, id), DELVE_LIVES - 1);
    assert.deepEqual(inventoryOf(wrong.s, id), NONE);
    assert.equal(wrong.s.reveal!.gained, undefined);
    const late = found(kind);
    late.clock.now += findTimer(20) * 1000 + ANSWER_GRACE_MS + 1;
    late.act({ type: 'answer', index: null, askedAt: late.s.question!.askedAt });
    assert.equal(livesOf(late.s, id), DELVE_LIVES - 1);
    assert.deepEqual(inventoryOf(late.s, id), NONE);
  }
});

test("a guest's answer to a vein gets the same network allowance as at the deadline; the host's own needs none", () => {
  const guest = online('guest');
  guest.h.act({ type: 'pick', category: guest.h.plant() }, guest.id);
  guest.h.clockIn();
  guest.h.clock.now += WINDOW + ANSWER_GRACE_MS;
  const inTime = guest.h.s;
  guest.h.answer(true, guest.id);
  assert.equal(guest.h.s.reveal!.gained, 'wards');
  guest.h.s = inTime;
  guest.h.clock.now += 1;
  guest.h.answer(true, guest.id);
  assert.equal(guest.h.s.reveal!.gained, 'shards');

  const host = online('host');
  host.h.act({ type: 'pick', category: host.h.plant() }, host.id);
  host.h.clockIn();
  host.h.clock.now += WINDOW;
  const fast = host.h.s;
  host.h.answer(true, host.id);
  assert.equal(host.h.s.reveal!.gained, 'wards');
  host.h.s = fast;
  host.h.clock.now += 1;
  host.h.answer(true, host.id);
  assert.equal(host.h.s.reveal!.gained, 'shards');
});

test('items stop at three each, and a shard held never makes two', () => {
  // Nonsense in a save reads as something sane.
  const h = delve(['Ash']);
  const id = h.active().id;
  h.give(id, { wards: 99, flares: NaN, dynamite: -2, shards: 5 });
  assert.deepEqual(inventoryOf(h.s, id), { wards: 3, flares: 0, dynamite: 0, shards: SHARDS_PER_WARD - 1 });
  assert.equal(shardsOf(h.s, id), 1);
  h.edit((c) => delete c.delve!.inventory);
  assert.deepEqual(inventoryOf(h.s, id), NONE);
  // An older save without shards.
  h.edit((c) => (c.delve!.inventory = { [id]: { wards: 1, flares: 2, dynamite: 0 } as Inventory }));
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: 1, flares: 2 });
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

test('a card picked for a player who hesitated is never the find, even one blasted open', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const h = delve(['Ash', 'Brea'], { seed });
    at(h, 20);
    const card = h.plant(seed % 2 ? 'azurite' : 'flare');
    if (seed % 3 === 0) {
      h.give(h.active().id, { dynamite: 1 });
      h.act({ type: 'blast', category: card });
    }
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

test('a flare on an Azurite Vein gives more time, not a longer fast window: a shard, not a ward', () => {
  const h = found('azurite');
  const id = h.active().id;
  h.give(id, { flares: 1 });
  const q = h.s.question!;
  h.clock.now = q.deadline! - FLARE_AT_MS;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(veinWindowMs(h.s), WINDOW, 'the window stays where it was');
  h.answer(true);
  assert.equal(h.s.reveal!.correct, true);
  assert.equal(h.s.reveal!.gained, 'shards');
  assert.equal(questionTimer(h.s), findTimer(20), "the question still started with the find's clock");
});

// ---- dynamite --------------------------------------------------------------

/** A category not on offer that isn't locked, and one that is (made the player's last pick). */
function lockedAndFree(h: ReturnType<typeof delve>) {
  const spare = h.engine.categories.filter((x) => !h.s.offered.includes(x));
  h.edit((c) => (c.players[c.turn].recent = [spare[0]]));
  return { locked: spare[0], free: spare[1] };
}

test('dynamite blasts open a fourth card, even a locked one, once a turn', () => {
  const h = delve(['Ash'], { host: null });
  at(h, 20);
  const id = h.active().id;
  h.give(id, { dynamite: 2 });
  const { locked } = lockedAndFree(h);
  const prev = h.s;
  h.act({ type: 'blast', category: locked });
  assert.deepEqual(h.s.offered.slice(3), [locked]);
  assert.equal(blastedOffer(h.s), locked);
  assert.equal(dynamiteOf(h.s, id), 1);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'dynamite', change: 'used', left: 1 }]);
  assert.throws(() => h.act({ type: 'blast', category: h.engine.categories.find((x) => !h.s.offered.includes(x))! }), /Only one/);
  h.act({ type: 'pick', category: locked });
  h.clockIn();
  h.answer(true);
  h.act({ type: 'next' });
  assert.equal(h.s.offered.length, 3);
  assert.equal(h.s.delve!.blasted, null);
  // A new turn, a new blast.
  h.act({ type: 'blast', category: h.engine.categories.find((x) => !h.s.offered.includes(x))! });
  assert.equal(dynamiteOf(h.s, id), 0);
});

test('a card blasted open asks a safe question at any depth: four options, nothing made up, plain art, the longest clock', () => {
  let names = 0;
  let arts = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const depth = [20, 60, 120][seed % 3];
    const h = delve(['Ash'], { host: null, seed });
    at(h, depth);
    h.give(h.active().id, { dynamite: 1 });
    const cat = h.engine.categories.find((x) => !h.s.offered.includes(x))!;
    h.act({ type: 'blast', category: cat });
    h.act({ type: 'pick', category: cat });
    const q = h.s.question!;
    assert.equal(q.blasted, true);
    assert.equal(q.find, undefined);
    assert.deepEqual(activeRules(h.s), blastRules(depth));
    assert.equal(q.options.length, BLAST_OPTIONS);
    assert.equal(q.options.filter(isFake).length, 0, 'nothing made up');
    assert.equal(q.veil, null, 'nothing burns in');
    assert.ok(q.mirrored!.every((m) => !m), 'nothing mirrored');
    if (q.mode === 'name') names++;
    else arts++;
    h.clockIn();
    assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, BLAST_TIMER * 1000);
    assert.equal(questionTimer(h.s), BLAST_TIMER);
    assert.equal(veinWindowMs(h.s), 0);
    h.answer(true);
    assert.equal(h.s.reveal!.gained, undefined, 'nothing to find');
  }
  assert.ok(names > 0 && arts > 0, `${names} name and ${arts} art questions`);
});

test('dynamite can blast the find on offer open: its question made safe, its reward kept', () => {
  for (const kind of ['azurite', 'flare', 'dynamite'] as const) {
    const h = delve(['Ash'], { host: null, seed: 7 });
    at(h, 40);
    const id = h.active().id;
    h.give(id, { dynamite: 2 });
    const card = h.plant(kind);
    const offered = [...h.s.offered];
    h.act({ type: 'blast', category: card });
    assert.deepEqual(h.s.offered, offered, 'no fourth card');
    assert.equal(blastedOffer(h.s), card);
    assert.deepEqual(findOffer(h.s), { category: card, kind });
    assert.equal(dynamiteOf(h.s, id), 1);
    assert.throws(() => h.act({ type: 'blast', category: h.engine.categories.find((x) => !h.s.offered.includes(x))! }), /Only one/);
    h.act({ type: 'pick', category: card });
    const q = h.s.question!;
    assert.equal(q.find, kind);
    assert.equal(q.blasted, true);
    assert.deepEqual(activeRules(h.s), blastRules(40));
    assert.equal(q.options.length, BLAST_OPTIONS);
    h.clockIn();
    assert.equal(questionTimer(h.s), BLAST_TIMER);
    // A vein's window is half the safe question's clock.
    assert.equal(veinWindowMs(h.s), kind === 'azurite' ? veinWindow(BLAST_TIMER) : 0);
    h.clock.now += veinWindow(BLAST_TIMER);
    h.answer(true);
    assert.equal(h.s.reveal!.gained, kind === 'azurite' ? 'wards' : kind === 'flare' ? 'flares' : 'dynamite');
  }
});

test('dynamite can\'t be blasted without any, off turn, outside choosing, or at a plain card already on offer', () => {
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
  // Not even the card that was a find, once it isn't.
  h.plant('flare');
  h.edit((c) => (c.delve!.find = { category: 'Socks', kind: 'flare' }));
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
  assert.deepEqual(inventoryOf(h.s, id), NONE);
});

test('guests see the find, the question it asked and everyone\'s items, but never the answer', () => {
  const h = delve(['Ash', 'Brea']);
  at(h, 20);
  const id = h.active().id;
  h.give(id, { wards: 2, flares: 1, dynamite: 3, shards: 1 });
  const card = h.plant();
  assert.deepEqual(findOffer(publicView(h.s)), { category: card, kind: 'azurite' });
  h.act({ type: 'pick', category: card }, null);
  let view = publicView(h.s);
  assert.equal(view.question!.find, 'azurite');
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.deepEqual(inventoryOf(view, id), { wards: 2, flares: 1, dynamite: 3, shards: 1 });
  h.clockIn();
  view = publicView(h.s);
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.equal(view.question!.clockAt, h.s.question!.clockAt, 'guests can draw the fast window');
  assert.equal(questionTimer(view), findTimer(20));
  assert.equal(veinWindowMs(view), veinWindow(findTimer(20)), 'guests can draw the fast window');
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
