import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_AURAS, AURAS, BENCHED, CLASS_AURAS, auraMask, cleanAuraMask, holdsAura, type AuraKind } from '../src/lib/auraKinds.ts';
import {
  AURA_DROPS,
  BREACH_MS,
  TABLETS,
  auraForcing,
  auraHolds,
  canTake,
  dealAura,
  type AuraSigns,
  type AuraTaker,
} from '../src/lib/auraDeal.ts';
import { FAST_MS } from '../src/lib/achievements.ts';
import { auraOffer, auraOn, aurasOf, findOn, fossilOffer, isWayOut, livesOf, missedAuras, runAuras, shownDepth, sulphiteCard } from '../src/lib/delve.ts';
import { RECENT_RUNS, emptyRecords, recentBest, type DelveRun } from '../src/lib/delveRecord.ts';
import { DELVE_RULESET } from '../src/lib/delve.ts';
import type { AuraHeld, GameState } from '../src/lib/game.ts';
import { auraEvents } from '../src/lib/count.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';
import type { PlayerClass } from '../src/lib/classSigils.ts';
import { emptyAuras, keepRunAuras, loadAuras, wearAura } from '../src/lib/auraStore.ts';
import { NONE, memoryStorage, right, room, seeded, wrong, wrongs } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);

/** Every aura owned but `kind`: only it can be dealt. */
const onlyLacks = (...kinds: AuraKind[]) => ALL_AURAS & ~auraMask(kinds);

const SIGNS: AuraSigns = { depth: 5, streak: 0, quick: 0, close: false, sealsRolled: false, ritual: false, players: 1, tablets: false };
const TAKER: AuraTaker = { owned: 0, sigil: null, detonated: false, lives: 3 };
const holds = (kind: AuraKind, g: Partial<AuraSigns> = {}, t: Partial<AuraTaker> = {}) => auraHolds(kind, { ...SIGNS, ...g }, { ...TAKER, ...t });

// ---- the table ----------------------------------------------------------------------

test('the table: every aura worn now dealt once, the benched not; rarest tier first; the chances as settled', () => {
  const kinds = AURA_DROPS.map((d) => d.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  assert.deepEqual([...kinds].sort(), AURAS.filter((a) => !BENCHED.includes(a)).sort());
  const tiers = ['mirror', 'deep', 'rare', 'uncommon', 'common'];
  const order = AURA_DROPS.map((d) => tiers.indexOf(d.tier));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'rarest tier first');
  assert.deepEqual(kinds, [
    'mirror',
    'abyss',
    'chayula',
    'ritual',
    'divine',
    'corrupted',
    'twilight',
    'shadow',
    'breach',
    'expedition',
    'ice',
    'delirium',
    'chronomancer',
    'slayer',
    'runeseal',
    'tower',
    'azmeri',
  ]);
  const chance = Object.fromEntries(AURA_DROPS.map((d) => [d.kind, d.chance]));
  assert.deepEqual(chance, {
    mirror: 0.00004242,
    abyss: 0.002924,
    chayula: 0.001502,
    ritual: 0.005494,
    divine: 0.002917,
    corrupted: 0.002009,
    twilight: 0.0007586,
    shadow: 0.0006139,
    breach: 1,
    expedition: 0.002556,
    ice: 0.004236,
    delirium: 0.005391,
    chronomancer: 0.08853,
    slayer: 0.1677,
    runeseal: 0.3,
    tower: 0.1994,
    azmeri: 0.007321,
  });
  assert.equal(BREACH_MS, FAST_MS, 'Breach’s 2 s is the achievements’ fast answer');
});

test('each condition, at its edges (shown depths)', () => {
  assert.ok(holds('mirror'));
  for (const [d, ok] of [[49, false], [50, true], [59, true], [60, false], [79, false], [80, true], [89, true], [90, false]] as const) assert.equal(holds('abyss', { depth: d }), ok, `abyss ${d}`);
  assert.ok(!holds('chayula', { depth: 50 }));
  assert.ok(holds('chayula', { depth: 51 }));
  assert.ok(holds('ritual', { ritual: true }));
  assert.ok(!holds('ritual'));
  assert.ok(holds('divine', { streak: 10, depth: 20 }));
  assert.ok(!holds('divine', { streak: 9, depth: 40 }));
  assert.ok(!holds('divine', { streak: 12, depth: 19 }));
  for (const [d, ok] of [[39, false], [40, true], [49, true], [50, false]] as const) assert.equal(holds('corrupted', { depth: d }), ok, `corrupted ${d}`);
  assert.ok(holds('twilight', { depth: 36 }, { lives: 1, lastLife: 31 }));
  assert.ok(!holds('twilight', { depth: 35 }, { lives: 1, lastLife: 31 }), 'only 4 depths on it');
  assert.ok(!holds('twilight', { depth: 30 }, { lives: 1, lastLife: 20 }), 'not past 30');
  assert.ok(!holds('twilight', { depth: 40 }, { lives: 2, lastLife: 20 }), 'not the last life');
  assert.ok(holds('shadow', { depth: 40 }));
  assert.ok(!holds('shadow', { depth: 39 }));
  assert.ok(holds('breach', { quick: 2 }));
  assert.ok(!holds('breach', { quick: 1 }));
  assert.ok(holds('expedition', {}, { detonated: true }));
  assert.ok(!holds('expedition'));
  for (const [d, ok] of [[19, false], [20, true], [29, true], [30, false]] as const) assert.equal(holds('ice', { depth: d }), ok, `ice ${d}`);
  assert.ok(holds('delirium', { depth: 14 }));
  assert.ok(!holds('delirium', { depth: 13 }));
  assert.ok(holds('chronomancer', { close: true }));
  assert.ok(!holds('chronomancer'));
  assert.ok(holds('slayer', { depth: 23 }, { best: 23 }));
  assert.ok(!holds('slayer', { depth: 22 }, { best: 23 }));
  assert.ok(!holds('slayer', { depth: 0 }), 'no earlier run');
  assert.ok(holds('runeseal', { streak: 3 }));
  assert.ok(!holds('runeseal', { streak: 4 }));
  assert.ok(!holds('runeseal', { streak: 3, sealsRolled: true }), 'once a streak');
  assert.ok(holds('tower', { tablets: true }));
  assert.ok(!holds('tower'));
  assert.ok(holds('azmeri', { players: 3 }));
  assert.ok(!holds('azmeri', { players: 2 }));
  for (const b of BENCHED) assert.ok(!holds(b, { depth: 60, streak: 20, quick: 5, close: true, ritual: true, players: 4, tablets: true }));
});

test('the deal: rolled rarest first, within a tier in order, one draw each; the first hit is the card', () => {
  // Everything holds at once (depth 55 with a long fast streak, all a taker could have).
  const g: AuraSigns = { depth: 55, streak: 3, quick: 3, close: true, sealsRolled: false, ritual: true, players: 3, tablets: true };
  const t: AuraTaker = { owned: 0, sigil: 'monk', detonated: true, best: 55, lives: 1, lastLife: 40 };
  const none = dealAura(g, [t], () => 0.999999);
  // Breach's 100% always hits: nothing past it is rolled.
  assert.deepEqual(none.rolled, ['mirror', 'abyss', 'chayula', 'ritual', 'twilight', 'breach'], 'Shadow wants the Assassin sigil, Divinity 10 in a row');
  assert.equal(none.kind, 'breach');
  assert.equal(dealAura(g, [t], () => 0).kind, 'mirror');
  // Each roll its own draw, in order: a miss on the first few, then a hit.
  const rolls = [0.9, 0.9, 0.001];
  let drawn = 0;
  assert.equal(dealAura(g, [t], () => (drawn++, rolls.shift() ?? 0.9)).kind, 'chayula');
  assert.equal(drawn, 3);
  // Without Breach's: Uncommon then Common after it.
  const slow = dealAura({ ...g, quick: 0 }, [{ ...t, sigil: 'gladiator' }], () => 0.999999);
  assert.deepEqual(slow.rolled, ['mirror', 'abyss', 'ritual', 'twilight', 'expedition', 'delirium', 'slayer', 'runeseal', 'tower', 'azmeri']);
  assert.equal(slow.kind, null);
  // A roll at exactly its chance misses.
  assert.equal(dealAura({ ...SIGNS, depth: 5 }, [TAKER], () => 0.00004242).kind, null);
});

test('only auras the taker lacks are dealt, and a class aura only with its sigil', () => {
  assert.equal(dealAura({ ...SIGNS, depth: 55 }, [{ ...TAKER, owned: ALL_AURAS }], () => 0).kind, null);
  assert.equal(dealAura({ ...SIGNS, depth: 55 }, [{ ...TAKER, owned: onlyLacks('chayula') }], () => 0).kind, null, 'Chayula without the Monk sigil');
  assert.equal(dealAura({ ...SIGNS, depth: 55 }, [{ ...TAKER, owned: onlyLacks('chayula'), sigil: 'monk' }], () => 0).kind, 'chayula');
  for (const [aura, cls] of Object.entries(CLASS_AURAS) as [AuraKind, PlayerClass][]) {
    assert.ok(canTake(aura, { owned: 0, sigil: cls }));
    assert.ok(!canTake(aura, { owned: 0, sigil: null }));
    assert.ok(!canTake(aura, { owned: auraMask([aura]), sigil: cls }));
  }
  assert.ok(canTake('breach', { owned: 0, sigil: 'monk' }));
});

test('together: dealt if anyone standing meets its condition and lacks it', () => {
  const owner: AuraTaker = { ...TAKER, owned: ALL_AURAS };
  const lacker: AuraTaker = { ...TAKER, owned: onlyLacks('expedition'), detonated: false };
  const detonator: AuraTaker = { ...TAKER, owned: onlyLacks('expedition'), detonated: true };
  assert.equal(dealAura(SIGNS, [owner, lacker], () => 0).kind, null);
  assert.equal(dealAura(SIGNS, [owner, lacker, detonator], () => 0).kind, 'expedition');
  // Meeting it and lacking it must be the same player.
  assert.equal(dealAura(SIGNS, [{ ...owner, detonated: true }, lacker], () => 0).kind, null);
});

test('the forcing: Delirium mirrored, Shadow grey, Precursor Engine a tablet, the rest as asked', () => {
  assert.deepEqual(auraForcing('delirium'), { mirror: true });
  assert.deepEqual(auraForcing('shadow'), { gray: true });
  assert.deepEqual(auraForcing('tower'), { group: TABLETS });
  assert.deepEqual(auraForcing('breach'), {});
  assert.deepEqual(auraForcing(undefined), {});
});

// ---- masks and the hello -----------------------------------------------------------

test('masks: a bit an aura in AURAS’ order; a newer build’s further bits left out, the known kept', () => {
  assert.equal(auraMask(AURAS), ALL_AURAS);
  assert.ok(holdsAura(auraMask(['ice']), 'ice'));
  assert.ok(!holdsAura(auraMask(['ice']), 'breach'));
  assert.equal(cleanAuraMask(auraMask(['ice']) | (1 << 28)), auraMask(['ice']));
  for (const bad of [-1, 1.5, '3', null, undefined, 2 ** 40]) assert.equal(cleanAuraMask(bad), null);
});

test('the hello carries the auras a guest owns as a mask and their Slayer best; what isn’t is left out', () => {
  const hello = { t: 'hello', secret: 'a'.repeat(24), name: 'Ash', v: 35 };
  const m = parseClientMsg({ ...hello, auras: auraMask(['breach', 'mirror']) | (1 << 27), slayer: 31 }) as { auras?: number; slayer?: number };
  assert.equal(m.auras, auraMask(['breach', 'mirror']));
  assert.equal(m.slayer, 31);
  const old = parseClientMsg(hello)!;
  assert.ok(!('auras' in old) && !('slayer' in old), 'an older guest’s: none');
  for (const bad of [-1, 'x', 2.5]) assert.ok(!('auras' in parseClientMsg({ ...hello, auras: bad })!), `auras ${bad}`);
  for (const bad of [0, -3, 1000, 2.5, '9']) assert.ok(!('slayer' in parseClientMsg({ ...hello, slayer: bad })!), `slayer ${bad}`);
});

test('Slayer’s best: the deepest of the last 10 ended runs under these rules, alone and together; none without one', () => {
  const r = emptyRecords();
  assert.equal(recentBest(r), undefined);
  const run = (at: number, depth: number, more: Partial<DelveRun> = {}): DelveRun => ({ id: at, at, depth, players: 1, ruleset: DELVE_RULESET, mixed: false, ...more });
  r.runs = [run(1, 80), ...Array.from({ length: RECENT_RUNS }, (_, i) => run(10 + i, 20 + i, i === 3 ? { players: 2 } : {})), run(50, 99, { left: true }), run(51, 98, { mixed: true }), run(52, 97, { ruleset: DELVE_RULESET - 1 })];
  assert.equal(recentBest(r), 29, 'the deep one is 11 runs back; left, mixed and older rules never count');
});

// ---- in the game ------------------------------------------------------------------

interface RunOpts {
  depth?: number;
  players?: string[];
  owned?: (id: string) => number;
  best?: (id: string) => number | undefined;
  sigil?: PlayerClass;
  aura?: () => number;
  seed?: number;
}

/** A run with the aura deal on (the session's hook), its rolls from `aura` (0: the first rolled hits). */
function run(o: RunOpts = {}) {
  const h = room({ players: o.players ?? ['Ash'], seed: o.seed ?? 3, start: false, auraRng: o.aura ?? (() => 0) });
  h.engine.setAurasHeld((ids) => ids.map((id): AuraHeld => {
    const best = o.best?.(id);
    return { owned: o.owned?.(id) ?? 0, ...(best !== undefined ? { best } : {}) };
  }));
  if (o.sigil) h.edit((c) => c.players.forEach((p) => (p.sigil = o.sigil)));
  h.act({ type: 'start' }, 'p0');
  if (o.depth) h.edit((c) => (c.round = o.depth!));
  const x = Object.assign(h, {
    /** Puts `kind` on an ordinary card on offer, as a lucky roll would; its category. */
    plant(kind: AuraKind) {
      let cat = '';
      h.edit((c) => {
        const finds = (c.delve!.finds ?? []).map((f) => f.category);
        cat = c.offered.find((k) => !finds.includes(k) && !isWayOut(k) && c.delve!.fossil?.category !== k && sulphiteCard(c) !== k)!;
        c.delve!.aura = { category: cat, kind };
      });
      return cat;
    },
    /** A card holding nothing (no find, fossil, sulphite or aura). */
    plain() {
      const s = h.s;
      return s.offered.find((c) => !findOn(s, c) && !isWayOut(c) && fossilOffer(s)?.category !== c && sulphiteCard(s) !== c && auraOn(s, c) === null)!;
    },
    pick(category: string) {
      const together = h.s.players.length > 1;
      if (together) {
        for (const p of h.s.players) if (livesOf(h.s, p.id) > 0) h.act({ type: 'vote', category }, p.id);
        if (h.s.phase === 'choosing') h.act({ type: 'expire' }, null);
      } else h.act({ type: 'pick', category });
      h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
    },
    /** Answered (`ms` its time on the device, as a session sends it; a wrong one the first option nobody struck). */
    answer(ok: boolean, from: string | null = null, ms = 800) {
      const q = h.s.question!;
      const struck = new Set((q.struck ?? []).map((x) => x.index));
      const index = ok ? right(q) : wrongs(q).find((i) => !struck.has(i))!;
      return h.act({ type: 'answer', index, askedAt: q.askedAt, ms }, from ?? (h.s.players.length > 1 ? 'p0' : null));
    },
    /** A plain card picked and answered (right or not, at once), then on to the next offer. */
    step(ok = true, from: string | null = null) {
      x.pick(x.plain());
      x.answer(ok, from);
      h.act({ type: 'next' });
    },
    dealt: () => h.s.delve!.aura?.kind ?? null,
    /** None dealt, on an offer that had a card free for one. */
    nothing() {
      assert.ok(x.dealt() || x.plain(), 'a card free for one');
      return x.dealt();
    },
  });
  return x;
}

test('no hook, no auras: an engine nobody told what players own (tests, tools, the bot) deals none, and keeps nothing for them', () => {
  const h = room({ players: ['Ash'], seed: 3, auraRng: () => 0 });
  for (let i = 0; i < 30 && h.s.phase === 'choosing'; i++) {
    assert.equal(h.s.delve!.aura, undefined);
    assert.equal(h.s.delve!.auraFacts, undefined);
    const s = h.s;
    const cat = s.offered.find((c) => !findOn(s, c) && !isWayOut(c))!;
    h.act({ type: 'pick', category: cat });
    h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
    h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt });
    h.act({ type: 'next' });
  }
});

test('dealt in play: never on a find’s card, a fossil’s, the sulphite card or a way out; one an offer at most; none in a dig', () => {
  let dealt = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const h = run({ seed, aura: seeded(seed * 7), depth: 20 });
    for (let turn = 0; turn < 40 && h.s.phase === 'choosing'; turn++) {
      const a = h.s.delve!.aura;
      if (a) {
        dealt++;
        assert.ok(h.s.offered.includes(a.category));
        assert.ok(!isWayOut(a.category));
        assert.ok(!findOn(h.s, a.category), 'on a find’s card');
        assert.notEqual(fossilOffer(h.s)?.category, a.category, 'on a fossil’s');
        assert.notEqual(sulphiteCard(h.s), a.category, 'on the sulphite card');
        assert.deepEqual(auraOffer(h.s), a);
      }
      if (h.s.offered.some(isWayOut)) assert.equal(a, undefined, 'in a dig');
      const cat = h.s.offered.find((c) => !findOn(h.s, c) && !isWayOut(c) && c !== a?.category && sulphiteCard(h.s) !== c);
      if (!cat) break;
      h.pick(cat);
      h.answer(true);
      h.act({ type: 'next' });
    }
  }
  assert.ok(dealt > 20, `${dealt} dealt`);
});

test('no free card, no aura: every card on offer holds something else', () => {
  const h = run({ owned: () => onlyLacks('mirror') });
  h.edit((c) => (c.delve!.finds = c.offered.slice(0, 2).map((category, i) => ({ category, kind: i ? 'flare' : 'dynamite' }))));
  h.edit((c) => (c.delve!.fossil = { category: c.offered[2], tier: 'common' }));
  h.edit((c) => (c.offered = c.offered.slice(0, 3)));
  // The same offer dealt again (a miss at the depth), its cards as they were: hold the deal there by hand.
  const engine = h.engine as unknown as { rollAura(s: GameState, ids: string[]): unknown };
  assert.equal(engine.rollAura(structuredClone(h.s), ['p0']), undefined);
});

test('an aura’s card asks the depth’s own question; right, the aura is the answerer’s, noted in the run', () => {
  const h = run({ depth: 12 });
  const cat = h.plant('breach');
  assert.equal(auraOn(h.s, cat), 'breach');
  h.pick(cat);
  const q = h.s.question!;
  assert.equal(q.aura, 'breach');
  assert.equal(q.find, undefined);
  h.answer(true);
  assert.deepEqual(h.s.reveal!.aura, { kind: 'breach', to: ['p0'] });
  assert.deepEqual(runAuras(h.s).map((a) => [a.kind, a.depth, a.to]), [['breach', 12, ['p0']]]);
  assert.deepEqual(aurasOf(h.s, 'p0'), ['breach']);
  assert.deepEqual(missedAuras(h.s), []);
  // Owned now (the run's gift counted): never dealt to them again this run.
  h.act({ type: 'next' });
  const engine = h.engine as unknown as { auraTakers(s: GameState, ids: string[]): AuraTaker[] };
  assert.ok(holdsAura(engine.auraTakers(h.s, ['p0'])[0].owned, 'breach'));
});

test('a miss on an aura’s card costs a life as any miss, and the aura is gone; noted as missed', () => {
  const h = run({ depth: 12 });
  const cat = h.plant('mirror');
  h.pick(cat);
  h.answer(false);
  assert.equal(livesOf(h.s, 'p0'), 2);
  assert.equal(h.s.reveal!.aura, undefined);
  assert.deepEqual(runAuras(h.s), []);
  assert.deepEqual(missedAuras(h.s), [{ kind: 'mirror', depth: 12, to: ['p0'] }]);
});

test('owned already, or a class aura without its sigil: a right answer gives nothing', () => {
  const owned = run({ depth: 12, owned: () => auraMask(['ice']) });
  owned.pick(owned.plant('ice'));
  owned.answer(true);
  assert.equal(owned.s.reveal!.aura, undefined);
  const bare = run({ depth: 12 });
  bare.pick(bare.plant('chronomancer'));
  bare.answer(true);
  assert.equal(bare.s.reveal!.aura, undefined);
  const sorc = run({ depth: 12, sigil: 'sorceress' });
  sorc.pick(sorc.plant('chronomancer'));
  sorc.answer(true);
  assert.deepEqual(sorc.s.reveal!.aura, { kind: 'chronomancer', to: ['p0'] });
});

test('dynamite never fishes: a blast loses the aura with its card, says which went, and the new question is never one', () => {
  const h = run({ depth: 20 });
  h.give('p0', { ...NONE, dynamite: 1 });
  h.pick(h.plant('corrupted'));
  h.act({ type: 'blast', askedAt: h.s.question!.askedAt });
  assert.equal(h.s.question!.aura, undefined);
  assert.equal(h.s.question!.blast?.was.aura, 'corrupted');
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true);
  assert.equal(h.s.reveal!.aura, undefined);
  assert.deepEqual(runAuras(h.s), []);
});

test('a reask keeps the aura and its forcing', () => {
  const h = run({ depth: 20 });
  const cat = h.plant('delirium');
  h.act({ type: 'pick', category: cat });
  h.act({ type: 'reask' });
  assert.equal(h.s.question!.aura, 'delirium');
  assert.ok(h.s.question!.mirrored!.every(Boolean));
});

test('forced questions: Delirium’s every picture mirrored, Shadow’s art grey, Precursor Engine’s a tablet', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const d = run({ depth: 20, seed });
    d.pick(d.plant('delirium'));
    assert.ok(d.s.question!.mirrored!.length && d.s.question!.mirrored!.every(Boolean), `mirrored, seed ${seed}`);
    const g = run({ depth: 5, seed });
    g.pick(g.plant('shadow'));
    assert.equal(g.s.question!.gray, true, `grey, seed ${seed}`);
    const t = run({ depth: 20, seed });
    const tablets = t.engine.items.find((it) => it.group === TABLETS)!.category;
    t.edit((c) => {
      c.offered[0] = tablets;
      c.delve!.finds = [];
      delete c.delve!.fossil;
      c.delve!.aura = { category: tablets, kind: 'tower' };
    });
    t.pick(tablets);
    assert.equal(t.engine.byId.get(t.s.question!.itemId)!.group, TABLETS, `a tablet, seed ${seed}`);
  }
});

test('Breach: after 2 right answers in a row each within 2 s; a slow one breaks it', () => {
  const h = run({ owned: () => onlyLacks('breach') });
  h.step(); // (answered at once: well within 2 s)
  assert.equal(h.nothing(), null, 'one is not enough');
  h.step();
  assert.equal(h.dealt(), 'breach');
  const slow = run({ owned: () => onlyLacks('breach') });
  slow.step();
  slow.pick(slow.plain());
  slow.clock.now += 3000;
  slow.answer(true, null, 3000);
  slow.act({ type: 'next' });
  assert.equal(slow.nothing(), null);
});

test('Runic Seals: as the streak reaches exactly 3, rolled once a streak', () => {
  const h = run({ owned: () => onlyLacks('runeseal'), aura: () => 0.5 });
  h.step();
  h.step();
  assert.equal(h.s.delve!.auraFacts?.seals, undefined);
  h.step();
  assert.equal(h.s.players[0].streak, 3);
  assert.equal(h.s.delve!.auraFacts?.seals, true, 'rolled (and missed at 0.5)');
  h.step();
  assert.equal(h.s.delve!.auraFacts?.seals, undefined);
  const hit = run({ owned: () => onlyLacks('runeseal') });
  hit.step();
  hit.step();
  hit.step();
  assert.equal(hit.dealt(), 'runeseal');
});

test('Chronomancer: right after a right answer with under 1 s left, and only with the Sorceress sigil', () => {
  for (const [sigil, left, want] of [
    ['sorceress', 500, 'chronomancer'],
    ['sorceress', 1500, null],
    [undefined, 500, null],
  ] as const) {
    const h = run({ owned: () => onlyLacks('chronomancer'), ...(sigil ? { sigil } : {}) });
    h.pick(h.plain());
    h.clock.now = h.s.question!.deadline! - left;
    h.answer(true);
    h.act({ type: 'next' });
    assert.equal(want ? h.dealt() : h.nothing(), want, `${sigil} ${left}`);
  }
});

test('Expedition: not for dynamite going off by itself at 0, only for Detonate pressed', () => {
  const h = run({ owned: () => onlyLacks('expedition') });
  h.give('p0', { ...NONE, dynamite: 1 });
  h.pick(h.plain());
  h.clock.now = h.s.question!.deadline! + 600;
  h.act({ type: 'answer', index: null, askedAt: h.s.question!.askedAt });
  assert.ok(h.s.question!.blast && h.s.question!.blast.by === undefined, 'it went off by itself');
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true);
  h.act({ type: 'next' });
  assert.equal(h.nothing(), null);
});

test('Expedition: after pressing Detonate this run', () => {
  const h = run({ owned: () => onlyLacks('expedition') });
  h.give('p0', { ...NONE, dynamite: 1 });
  h.step();
  assert.equal(h.nothing(), null);
  h.pick(h.plain());
  h.act({ type: 'blast', askedAt: h.s.question!.askedAt });
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true);
  h.act({ type: 'next' });
  assert.equal(h.dealt(), 'expedition');
});

test('the depths: Herald of Ice 20 to 29, Delirium from 14, Corruption 40 to 49, Shadow from 40, Abyss 50s and 80s, Chayula past 50', () => {
  const at = (kind: AuraKind, shown: number, sigil?: PlayerClass) => {
    // (The first seed whose offer there has a card free for an aura.)
    for (let seed = 1; ; seed++) {
      const h = run({ owned: () => onlyLacks(kind), depth: shown, seed, ...(sigil ? { sigil } : {}) });
      h.step(); // one right answer: on to `shown` + 1 internally, `shown` as seen
      assert.equal(shownDepth(h.s.round), shown);
      if (h.dealt() || h.plain()) return h.dealt();
    }
  };
  assert.equal(at('ice', 19), null);
  assert.equal(at('ice', 20), 'ice');
  assert.equal(at('ice', 29), 'ice');
  assert.equal(at('ice', 30), null);
  assert.equal(at('delirium', 13), null);
  assert.equal(at('delirium', 14), 'delirium');
  assert.equal(at('corrupted', 40), 'corrupted');
  assert.equal(at('corrupted', 50), null);
  assert.equal(at('shadow', 40), null, 'without the Assassin sigil');
  assert.equal(at('shadow', 40, 'assassin'), 'shadow');
  assert.equal(at('abyss', 50), 'abyss');
  assert.equal(at('abyss', 70), null);
  assert.equal(at('abyss', 85), 'abyss');
  assert.equal(at('chayula', 50, 'monk'), null);
  assert.equal(at('chayula', 51, 'monk'), 'chayula');
  assert.equal(at('mirror', 1), 'mirror');
});

test('Divinity: 10 right in a row from depth 20', () => {
  const h = run({ owned: () => onlyLacks('divine'), depth: 21 });
  h.edit((c) => (c.players[0].streak = 9));
  h.step();
  assert.equal(h.dealt(), 'divine');
  const shallow = run({ owned: () => onlyLacks('divine'), depth: 15 });
  shallow.edit((c) => (c.players[0].streak = 9));
  shallow.step();
  assert.equal(shallow.nothing(), null);
});

test('Twilight Order: on the last life, past depth 30, at least 5 depths after coming onto it', () => {
  const at = (lastLife: number) => {
    const h = run({ owned: () => onlyLacks('twilight'), depth: 31 });
    h.edit((c) => (c.delve!.losses.p0 = [10, lastLife]));
    h.step();
    return h.dealt();
  };
  // Now at internal 32, shown 31.
  assert.equal(at(27), 'twilight');
  assert.equal(at(28), null);
});

test('Twilight Order together: a life given away to bring a teammate back puts the giver on their last life from then', () => {
  const at = (depth: number) => {
    const h = run({ players: ['Ash', 'Brea'], depth, owned: (id) => (id === 'p1' ? ALL_AURAS : onlyLacks('twilight')) });
    h.edit((c) => {
      c.delve!.losses = { p0: [10], p1: [20, 22, 27] };
      c.delve!.revives = [{ by: 'p0', to: 'p1', depth: 28, fell: 27, at: 1 }];
    });
    assert.equal(livesOf(h.s, 'p0'), 1);
    h.step(true, 'p0');
    assert.ok(h.dealt() || h.plain(), 'a card free for one');
    return h.dealt();
  };
  assert.equal(at(31), null, 'shown 31: only 4 depths after giving it at shown 27');
  assert.equal(at(32), 'twilight');
});

test('Slayer: at the depth of the best of the last runs, so the next right answer beats it; the Gladiator sigil', () => {
  const h = run({ owned: () => onlyLacks('slayer'), depth: 14, best: () => 15, sigil: 'gladiator' });
  h.step();
  assert.equal(h.s.round, 15);
  assert.equal(h.dealt(), 'slayer');
  const none = run({ owned: () => onlyLacks('slayer'), depth: 14, sigil: 'gladiator' });
  none.step();
  assert.equal(none.nothing(), null, 'no earlier run');
});

test('Ritual: a zone’s first offer, the zone before (from 10 on) cleared without a miss; a ward’s miss counts', () => {
  const at = (miss: 'none' | 'wrong' | 'ward', zone: number) => {
    const h = run({ owned: () => onlyLacks('ritual') });
    // Into the zone before (internal 10 * zone + 1 to 10 * zone + 10), an offer dealt there, then on to the next zone's first.
    h.edit((c) => (c.round = zone * 10 + 1));
    h.step();
    if (miss === 'ward') h.give('p0', { ...NONE, wards: 1 });
    if (miss !== 'none') h.step(false);
    h.edit((c) => (c.round = zone * 10 + 10));
    h.step();
    assert.equal(h.s.round, zone * 10 + 11);
    assert.ok(h.dealt() || h.plain(), 'a card free for one');
    return h.dealt();
  };
  assert.equal(at('none', 1), 'ritual');
  assert.equal(at('wrong', 1), null);
  assert.equal(at('ward', 1), null);
  assert.equal(at('none', 0), null, 'the Mines never count');
});

test('Ritual together: a wrong answer on a question blasted away since is a miss of the zone’s too', () => {
  const at = (miss: boolean) => {
    const h = run({ players: ['Ash', 'Brea'], owned: () => onlyLacks('ritual') });
    h.edit((c) => (c.round = 11));
    h.give('p1', { ...NONE, dynamite: 1 });
    h.pick(h.plain());
    if (miss) h.answer(false, 'p0');
    h.act({ type: 'blast', askedAt: h.s.question!.askedAt }, 'p1');
    h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
    h.answer(true, 'p1');
    assert.deepEqual(h.s.reveal!.hits, [], 'the new question’s own: nobody missed it');
    h.act({ type: 'next' });
    h.edit((c) => (c.round = 20));
    h.step(true, 'p0');
    assert.equal(h.s.round, 21);
    assert.ok(h.dealt() || h.plain(), 'a card free for one');
    return h.dealt();
  };
  assert.equal(at(false), 'ritual');
  assert.equal(at(true), null);
});

test('Precursor Engine: on the tablets’ card when it’s free, never elsewhere', () => {
  let on = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const h = run({ owned: () => onlyLacks('tower'), seed });
    for (let i = 0; i < 12 && h.s.phase === 'choosing'; i++) {
      const tablets = h.engine.items.find((it) => it.group === TABLETS)!.category;
      const free = h.s.offered.includes(tablets) && !findOn(h.s, tablets) && fossilOffer(h.s)?.category !== tablets && sulphiteCard(h.s) !== tablets;
      assert.deepEqual(h.s.delve!.aura ?? null, free ? { category: tablets, kind: 'tower' } : null);
      if (free) on++;
      const cat = h.s.offered.find((c) => c !== tablets && !findOn(h.s, c) && !isWayOut(c) && sulphiteCard(h.s) !== c);
      if (!cat) break;
      h.pick(cat);
      h.answer(true);
      h.act({ type: 'next' });
    }
  }
  assert.ok(on > 5, `${on}`);
});

test('together: Azmeri Spirits with 3 or more; the team’s streak; on the right answer everyone standing who lacks it and could find it keeps it', () => {
  const two = run({ players: ['Ash', 'Brea'], owned: () => onlyLacks('azmeri') });
  two.step();
  assert.equal(two.nothing(), null);
  const three = run({ players: ['Ash', 'Brea', 'Cole'], owned: () => onlyLacks('azmeri') });
  three.step();
  assert.equal(three.dealt(), 'azmeri');

  // Chronomancer: Ash wears the Sorceress sigil and lacks it, Brea wears it and owns it, Cole lacks it without the sigil.
  const h = run({ players: ['Ash', 'Brea', 'Cole'], depth: 20, owned: (id) => (id === 'p1' ? auraMask(['chronomancer']) : 0) });
  h.edit((c) => c.players.forEach((p) => p.id !== 'p2' && (p.sigil = 'sorceress')));
  h.pick(h.plant('chronomancer'));
  h.answer(true, 'p2');
  assert.deepEqual(h.s.reveal!.aura, { kind: 'chronomancer', to: ['p0'] });

  // Breach for a team: two right answers within 2 s, the team's.
  const team = run({ players: ['Ash', 'Brea'], owned: () => onlyLacks('breach') });
  team.step(true, 'p1');
  team.step(true, 'p0');
  assert.equal(team.dealt(), 'breach');
  // A team's miss on the offer (someone wrong, then someone right) breaks it.
  const missed = run({ players: ['Ash', 'Brea'], owned: () => onlyLacks('breach') });
  missed.step(true, 'p1');
  missed.pick(missed.plain());
  missed.answer(false, 'p0');
  missed.answer(true, 'p1');
  missed.act({ type: 'next' });
  assert.equal(missed.nothing(), null);
});

test('together: a card nobody standing could take isn’t dealt; a miss by all is noted for those who could', () => {
  const h = run({ players: ['Ash', 'Brea'], owned: () => ALL_AURAS });
  for (let i = 0; i < 5; i++) {
    assert.equal(h.nothing(), null);
    h.step(true, 'p0');
  }
  const m = run({ players: ['Ash', 'Brea'], depth: 20, owned: (id) => (id === 'p0' ? 0 : ALL_AURAS) });
  m.pick(m.plant('ice'));
  m.answer(false, 'p0');
  m.answer(false, 'p1');
  assert.deepEqual(missedAuras(m.s).map((a) => [a.kind, a.to]), [['ice', ['p0']]]);
});

test('its own random source: the same seed deals and asks exactly the same with the aura deal on or off', () => {
  const play = (on: boolean) => {
    const h = room({ players: ['Ash'], seed: 9, start: false, auraRng: seeded(5) });
    if (on) h.engine.setAurasHeld((ids) => ids.map(() => ({ owned: 0 })));
    h.act({ type: 'start' }, 'p0');
    const seen: string[] = [];
    for (let i = 0; i < 40 && h.s.phase === 'choosing'; i++) {
      const s = h.s;
      seen.push(s.offered.join('|'), JSON.stringify(s.delve!.finds), JSON.stringify(s.delve!.fossil ?? null), JSON.stringify(s.delve!.rush ?? null));
      const cat = s.offered.find((c) => !findOn(s, c) && !isWayOut(c) && auraOn(s, c) === null && sulphiteCard(s) !== c)!;
      h.act({ type: 'pick', category: cat });
      h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
      const q = h.s.question!;
      seen.push(q.itemId, q.options.join('|'), JSON.stringify(q.mirrored), String(q.gray));
      h.act({ type: 'answer', index: i % 7 === 6 ? wrong(q) : right(q), askedAt: q.askedAt });
      h.act({ type: 'next' });
    }
    return { seen, auras: h.s.delve?.auraFacts };
  };
  const off = play(false);
  const on = play(true);
  assert.deepEqual(on.seen, off.seen);
  assert.ok(on.auras && !off.auras, 'the deal ran beside it');
});

test('older states without the fields read as none', () => {
  const h = run({ depth: 12 });
  h.edit((c) => {
    delete c.delve!.aura;
    delete c.delve!.auras;
    delete c.delve!.aurasMissed;
    delete c.delve!.auraFacts;
  });
  assert.equal(auraOffer(h.s), null);
  assert.deepEqual(runAuras(h.s), []);
  assert.deepEqual(missedAuras(h.s), []);
  // Damaged ones too: an aura this build doesn't know, or benched, on a card or in the run.
  h.edit((c) => {
    c.delve!.aura = { category: c.offered[0], kind: 'lich' };
    (c.delve as { auras?: unknown }).auras = [{ kind: 'nope', depth: 3, at: 1, to: ['p0'] }, { kind: 'ice', depth: 3, at: 1, to: 'p0' }];
  });
  assert.equal(auraOffer(h.s), null);
  assert.deepEqual(runAuras(h.s), []);
  h.step();
  assert.ok(h.s.phase === 'choosing');
});

test('counts: an aura card dealt once an offer, one won, one missed', () => {
  const h = run({ depth: 20 });
  const plain = h.s;
  const cat = h.plant('ice');
  assert.deepEqual(auraEvents({ ...plain, phase: 'reveal' }, h.s), ['aura/seen']);
  assert.deepEqual(auraEvents(h.s, { ...h.s, version: h.s.version + 1 }), [], 'once');
  h.pick(cat);
  const asked = h.s;
  h.answer(true);
  assert.deepEqual(auraEvents(asked, h.s), ['aura/won']);
  assert.deepEqual(auraEvents(h.s, h.s), []);
  const m = run({ depth: 20 });
  m.pick(m.plant('ice'));
  const q = m.s;
  m.answer(false);
  assert.deepEqual(auraEvents(q, m.s), ['aura/missed']);
});

test('kept on this device: owned with its mode and depth and worn at once; a second pass never puts it back on; only the player it went to', () => {
  store.clear();
  const given = [{ kind: 'ice' as const, depth: 21, at: 1_700_000_000_000, to: ['p0', 'p1'] }];
  assert.deepEqual(keepRunAuras(given, 'p2', false), [], 'not given to this device’s player');
  assert.deepEqual(loadAuras(), emptyAuras());
  assert.deepEqual(keepRunAuras(given, 'p1', false), ['ice']);
  assert.deepEqual(loadAuras().owned.ice, { at: 1_700_000_000_000, mode: 'delve', depth: 21 });
  assert.equal(loadAuras().worn, 'ice');
  // Taken off since (or another worn): a reload reading the run again leaves it so.
  wearAura(null);
  assert.deepEqual(keepRunAuras(given, 'p1', false), []);
  assert.equal(loadAuras().worn, null);
  // On one device, whoever played.
  store.clear();
  assert.deepEqual(keepRunAuras([{ kind: 'breach', depth: 5, at: 1_700_000_000_000, to: ['p0'] }], null, true), ['breach']);
  assert.equal(loadAuras().worn, 'breach');
});
