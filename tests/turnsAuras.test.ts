// Take turns' aura cards (src/lib/auraDeal.ts, "Take turns"; docs/gameplay.md,
// "Auras"): only online Take turns at Merciless or Eternal deals them, to the
// player on turn; their conditions and chances, Divinity's streak carried
// across counted games, what the hello carries, what's counted, and the deal's
// own random source. And an aura won is worn on the winner's token at once, in
// Delve too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_AURAS, auraMask, type AuraKind } from '../src/lib/auraKinds.ts';
import {
  AURA_DROPS,
  SLAYER_TARGET,
  TABLETS,
  TURNS_AURA_DROPS,
  carryStreak,
  countedTurns,
  dealTurnsAura,
  turnsAuraHolds,
  type TurnsSigns,
} from '../src/lib/auraDeal.ts';
import { auraOffer, auraOn, runAuras } from '../src/lib/delve.ts';
import { carriedStreak, dealtTo, turnsAuras, turnsGiven, turnsMissed } from '../src/lib/turnsAuras.ts';
import { DEFAULT_SETTINGS, type AuraHeld, type GameState, type Settings } from '../src/lib/game.ts';
import { auraEvents } from '../src/lib/count.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';
import type { PlayerClass } from '../src/lib/classSigils.ts';
import { keepRunAuras, loadAuraStreak, loadAuras, parseAuraStreak, saveAuraStreak } from '../src/lib/auraStore.ts';
import { DELVE, memoryStorage, right, room, wrong } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);

/** Every aura owned but `kinds`: only they can be dealt. */
const onlyLacks = (...kinds: AuraKind[]) => ALL_AURAS & ~auraMask(kinds);

const TURNS: Settings = { ...DEFAULT_SETTINGS, mode: 'turns', difficulty: 'merciless', timer: 16, targetScore: 10 };

// ---- the table and the conditions ----------------------------------------------------

test('the table: Take turns’ ten, rarest tier first in the owner’s order, at its own chances; none of Delve’s others', () => {
  assert.deepEqual(
    TURNS_AURA_DROPS.map((d) => d.kind),
    ['mirror', 'shadow', 'divine', 'breach', 'delirium', 'chronomancer', 'slayer', 'runeseal', 'tower', 'azmeri'],
  );
  const tiers = ['mirror', 'deep', 'rare', 'uncommon', 'common'];
  const order = TURNS_AURA_DROPS.map((d) => tiers.indexOf(d.tier));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'rarest tier first');
  // Each aura's tier is Delve's.
  for (const d of TURNS_AURA_DROPS) assert.equal(d.tier, AURA_DROPS.find((x) => x.kind === d.kind)!.tier, d.kind);
  assert.deepEqual(Object.fromEntries(TURNS_AURA_DROPS.map((d) => [d.kind, d.chance])), {
    mirror: 0.00004242,
    shadow: 0.0006139,
    divine: 0.0057,
    breach: 1,
    delirium: 0.005391,
    chronomancer: 0.3642,
    slayer: 0.04778,
    runeseal: 0.3,
    tower: 0.1994,
    azmeri: 0.007321,
  });
  for (const k of ['expedition', 'ice', 'ritual', 'corrupted', 'twilight', 'abyss', 'chayula'] as const) assert.ok(!TURNS_AURA_DROPS.some((d) => d.kind === k), `${k} is Delve’s only`);
});

test('counted: Take turns at Merciless or Eternal; never Cruel, Custom, Race or Delve', () => {
  assert.ok(countedTurns({ mode: 'turns', difficulty: 'merciless' }));
  assert.ok(countedTurns({ mode: 'turns', difficulty: 'eternal' }));
  for (const difficulty of ['cruel', 'custom']) assert.ok(!countedTurns({ mode: 'turns', difficulty }), difficulty);
  for (const mode of ['race', 'delve']) assert.ok(!countedTurns({ mode, difficulty: 'eternal' }), mode);
});

const SIGNS: TurnsSigns = { eternal: false, streak: 0, carried: 0, quick: 0, close: false, timer: true, sealsRolled: false, score: 0, target: 10, players: 2, tablets: false };
const holds = (kind: AuraKind, g: Partial<TurnsSigns> = {}) => turnsAuraHolds(kind, { ...SIGNS, ...g });

test('each condition, at its edges', () => {
  assert.ok(holds('mirror'));
  for (const k of ['shadow', 'delirium'] as const) {
    assert.ok(!holds(k), `${k} at Merciless`);
    assert.ok(holds(k, { eternal: true }), `${k} at Eternal`);
  }
  assert.ok(!holds('divine', { carried: 9 }));
  assert.ok(holds('divine', { carried: 10 }));
  assert.ok(holds('divine', { carried: 14, streak: 0 }), 'carried across games: this game’s own may be none');
  assert.ok(!holds('breach', { quick: 1 }));
  assert.ok(holds('breach', { quick: 2 }));
  assert.ok(holds('chronomancer', { close: true }));
  assert.ok(!holds('chronomancer', { close: true, timer: false }), 'only with a timer');
  assert.ok(!holds('chronomancer'));
  assert.ok(holds('slayer', { score: 9, target: 10 }));
  assert.ok(!holds('slayer', { score: 8, target: 10 }));
  assert.ok(holds('slayer', { score: 19, target: 20 }));
  assert.ok(!holds('slayer', { score: 8, target: SLAYER_TARGET - 1 }), 'a target under 10');
  assert.ok(holds('runeseal', { streak: 3 }));
  assert.ok(!holds('runeseal', { streak: 3, sealsRolled: true }));
  assert.ok(!holds('runeseal', { streak: 4 }));
  assert.ok(holds('tower', { tablets: true }));
  assert.ok(!holds('tower'));
  assert.ok(!holds('azmeri', { players: 2 }));
  assert.ok(holds('azmeri', { players: 3 }));
  for (const k of ['expedition', 'ice', 'ritual', 'corrupted', 'twilight', 'abyss', 'chayula'] as const) assert.ok(!holds(k, { eternal: true, carried: 99, streak: 3 }), k);
});

test('the deal: rolled in order, one draw each, only auras the taker lacks, a class aura only with its sigil', () => {
  const draws: number[] = [];
  const rand = () => (draws.push(0), 0.99);
  const r = dealTurnsAura({ ...SIGNS, eternal: true, streak: 3, players: 3 }, { owned: 0, sigil: 'assassin' }, rand);
  assert.equal(r.kind, null);
  assert.deepEqual(r.rolled, ['mirror', 'shadow', 'delirium', 'runeseal', 'azmeri']);
  assert.equal(draws.length, 5);
  assert.deepEqual(dealTurnsAura({ ...SIGNS, eternal: true }, { owned: 0, sigil: null }, () => 0.99).rolled, ['mirror', 'delirium'], 'Shadow only with the Assassin');
  assert.equal(dealTurnsAura(SIGNS, { owned: onlyLacks('breach'), sigil: null }, () => 0).kind, null, 'Breach’s sign not there');
  assert.equal(dealTurnsAura({ ...SIGNS, quick: 2 }, { owned: onlyLacks('breach'), sigil: null }, () => 0.5).kind, 'breach', 'at 100%');
  assert.equal(dealTurnsAura(SIGNS, { owned: ALL_AURAS, sigil: null }, () => 0).kind, null, 'owns them all');
});

test('Divinity’s carried streak: one more right, back to none on a miss', () => {
  assert.equal(carryStreak(0, true), 1);
  assert.equal(carryStreak(12, true), 13);
  assert.equal(carryStreak(12, false), 0);
});

// ---- in the game ------------------------------------------------------------------

interface GameOpts {
  players?: string[];
  settings?: Partial<Settings>;
  owned?: (id: string) => number;
  streak?: (id: string) => number;
  /** Online on a device of their own (all of them by default). */
  online?: (id: string) => boolean;
  sigil?: PlayerClass;
  aura?: () => number;
  seed?: number;
  /** Players the host seats at its own screen (Player.local). */
  local?: string[];
  /** The aura deal's hook left out (tests, tools, the bot). */
  noHook?: true;
  host?: null;
}

/** A Take turns game with the aura deal on (the session's hook), its rolls from `aura` (0: the first rolled hits). */
function game(o: GameOpts = {}) {
  const h = room({ players: o.players ?? ['Ash'], seed: o.seed ?? 3, start: false, settings: { ...TURNS, ...o.settings }, auraRng: o.aura ?? (() => 0), ...(o.host === null ? { host: null } : {}) });
  const held = (id: string): AuraHeld => ({ owned: o.owned?.(id) ?? 0, streak: o.streak?.(id) ?? 0, ...((o.online?.(id) ?? true) ? { online: true as const } : {}) });
  if (!o.noHook) h.engine.setAurasHeld((ids) => ids.map(held));
  (o.local ?? []).forEach((name, i) => h.act({ type: 'join', playerId: `l${i}`, name, local: true }, o.host === null ? null : 'p0'));
  if (o.sigil) h.edit((c) => c.players.forEach((p) => (p.sigil = o.sigil)));
  h.act({ type: 'start' }, o.host === null ? null : 'p0');
  const x = Object.assign(h, {
    /** Who's on turn. */
    on: () => h.s.players[h.s.turn].id,
    /** Puts `kind` on a card on offer, as a lucky roll would; its category. */
    plant(kind: AuraKind, category?: string) {
      let cat = '';
      h.edit((c) => {
        cat = category ?? c.offered[0];
        c.turnAuras!.card = { category: cat, kind };
      });
      return cat;
    },
    /** A card holding no aura. */
    plain: () => h.s.offered.find((c) => auraOn(h.s, c) === null)!,
    pick(category: string) {
      h.act({ type: 'pick', category });
      h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
    },
    /** Answered (`ms` its time on the device, as a session sends it). */
    answer(ok: boolean, ms = 800) {
      const q = h.s.question!;
      return h.act({ type: 'answer', index: ok ? right(q) : wrong(q), askedAt: q.askedAt, ms });
    },
    /** A plain card picked and answered, then on to the next offer. */
    step(ok = true) {
      x.pick(x.plain());
      x.answer(ok);
      h.act({ type: 'next' });
    },
    dealt: () => h.s.turnAuras?.card?.kind ?? null,
  });
  return x;
}

test('online Take turns at Merciless or Eternal deals to the player on turn: an ordinary card of their offer, one at most', () => {
  for (const difficulty of ['merciless', 'eternal'] as const) {
    const h = game({ settings: { difficulty }, owned: () => onlyLacks('mirror') });
    assert.equal(h.dealt(), 'mirror', difficulty);
    const card = auraOffer(h.s)!;
    assert.ok(h.s.offered.includes(card.category));
    assert.equal(auraOn(h.s, card.category), 'mirror');
    assert.equal(h.s.offered.filter((c) => auraOn(h.s, c)).length, 1);
  }
});

test('nothing dealt nor counted in Cruel, Custom, Race, Delve, on one device, at the host’s screen, or with no hook', () => {
  for (const difficulty of ['cruel', 'custom'] as const) {
    const h = game({ settings: { difficulty } });
    assert.equal(h.s.turnAuras, undefined, difficulty);
    h.step(false);
    assert.equal(h.s.turnAuras, undefined, difficulty);
  }
  const race = game({ settings: { mode: 'race' } });
  assert.equal(race.s.turnAuras, undefined);
  const delve = game({ settings: { ...DELVE } });
  assert.equal(delve.s.turnAuras, undefined);
  // On one device: the session says nobody plays online, and the engine sees a hot-seat room whatever it says.
  assert.equal(game({ players: ['Ash', 'Brea'], host: null, online: () => false }).s.turnAuras, undefined);
  assert.equal(game({ players: ['Ash', 'Brea'], host: null }).s.turnAuras, undefined);
  // A room that couldn't go online (hereOnly): the session says the host's own player isn't online.
  assert.equal(game({ online: () => false }).s.turnAuras, undefined);
  const none = game({ noHook: true });
  assert.equal(none.s.turnAuras, undefined);
  // A player at the host's screen is never dealt to, whatever the hook says; the host's own player is.
  const here = game({ local: ['Rog'], owned: () => onlyLacks('mirror') });
  assert.ok(dealtTo(here.s, 'p0'));
  assert.ok(!dealtTo(here.s, 'l0'));
  for (let i = 0; i < 6; i++) {
    if (here.on() === 'l0') assert.equal(here.dealt(), null, 'at the host’s screen');
    else assert.equal(here.dealt(), 'mirror');
    here.step();
  }
});

test('right: the aura is theirs, noted in the game, and worn on their token at once', () => {
  const h = game({ players: ['Ash', 'Brea'] });
  const me = h.on();
  h.pick(h.plant('breach'));
  assert.equal(h.s.question!.aura, 'breach');
  h.answer(true);
  assert.deepEqual(h.s.reveal!.aura, { kind: 'breach', to: [me] });
  assert.deepEqual(turnsGiven(h.s).map((a) => [a.kind, a.to]), [['breach', [me]]]);
  assert.equal(h.s.players.find((p) => p.id === me)!.aura, 'breach', 'worn at once');
  assert.equal(h.s.players.find((p) => p.id !== me)!.aura, undefined);
  assert.deepEqual(turnsMissed(h.s), []);
  // Owned now: never dealt to them again this game (the game's gift counted).
  h.act({ type: 'next' });
  h.step();
  const engine = h.engine as unknown as { auraTakers(s: GameState, ids: string[]): { owned: number }[] };
  assert.equal(engine.auraTakers(h.s, [me])[0].owned & auraMask(['breach']), auraMask(['breach']));
});

test('a miss, wrong or out of time: the aura is gone, noted as missed; nothing worn', () => {
  const h = game();
  h.pick(h.plant('mirror'));
  h.answer(false);
  assert.equal(h.s.reveal!.aura, undefined);
  assert.deepEqual(turnsGiven(h.s), []);
  assert.deepEqual(turnsMissed(h.s), [{ kind: 'mirror', to: ['p0'] }]);
  assert.equal(h.s.players[0].aura, undefined);
  h.act({ type: 'next' });
  const t = game();
  t.pick(t.plant('mirror'));
  t.clock.now = t.s.question!.deadline! + 1000;
  t.act({ type: 'answer', index: null });
  assert.ok(t.s.reveal!.timedOut);
  assert.deepEqual(turnsMissed(t.s), [{ kind: 'mirror', to: ['p0'] }]);
});

test('forced questions: Delirium’s every picture mirrored, Shadow’s art grey, Precursor Engine’s a tablet; a reask keeps them', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const d = game({ seed, settings: { difficulty: 'eternal' } });
    d.pick(d.plant('delirium'));
    assert.ok((d.s.question!.mirrored ?? []).length > 0 && d.s.question!.mirrored!.every(Boolean), 'mirrored');
    const s = game({ seed, settings: { difficulty: 'eternal' } });
    s.pick(s.plant('shadow'));
    assert.equal(s.s.question!.gray, true, 'grey');
    s.act({ type: 'reask' });
    assert.equal(s.s.question!.aura, 'shadow');
    assert.equal(s.s.question!.gray, true, 'grey again');
  }
  const tablets = game().engine.items.find((it) => it.group === TABLETS)!.category;
  const t = game();
  t.edit((c) => (c.offered = [tablets, ...c.offered.filter((x) => x !== tablets)].slice(0, 3)));
  t.pick(t.plant('tower', tablets));
  assert.equal(t.engine.byId.get(t.s.question!.itemId)!.group, TABLETS);
});

test('Breach: after 2 right answers in a row each within 2 s; a slow one breaks it', () => {
  const h = game({ owned: () => onlyLacks('breach') });
  h.step();
  assert.equal(h.dealt(), null, 'one is not enough');
  h.step();
  assert.equal(h.dealt(), 'breach');
  const slow = game({ owned: () => onlyLacks('breach') });
  slow.step();
  slow.pick(slow.plain());
  slow.clock.now += 3000;
  slow.answer(true, 3000);
  slow.act({ type: 'next' });
  assert.equal(slow.dealt(), null);
});

test('Chronomancer: right with under 1 s left, only with a timer and the Sorceress sigil', () => {
  for (const [sigil, left, want] of [
    ['sorceress', 500, 'chronomancer'],
    ['sorceress', 1500, null],
    [undefined, 500, null],
  ] as const) {
    const h = game({ owned: () => onlyLacks('chronomancer'), ...(sigil ? { sigil } : {}) });
    h.pick(h.plain());
    h.clock.now = h.s.question!.deadline! - left;
    h.answer(true);
    h.act({ type: 'next' });
    assert.equal(h.dealt(), want, `${sigil} ${left}`);
  }
  // No timer: the clock never runs out, so nothing is close.
  const untimed = game({ settings: { timer: 0 }, owned: () => onlyLacks('chronomancer'), sigil: 'sorceress' });
  untimed.step();
  assert.equal(untimed.s.question, null);
  assert.equal(untimed.dealt(), null);
});

test('Slayer: one right answer from a target of 10 or more, with the Gladiator sigil', () => {
  for (const [target, sigil, want] of [
    [10, 'gladiator', 'slayer'],
    [20, 'gladiator', 'slayer'],
    [9, 'gladiator', null],
    [10, undefined, null],
  ] as const) {
    const h = game({ settings: { targetScore: target }, owned: () => onlyLacks('slayer'), ...(sigil ? { sigil } : {}) });
    h.edit((c) => (c.players[0].score = target - 2));
    assert.equal(h.dealt(), null, 'two away');
    h.step();
    assert.equal(h.s.players[0].score, target - 1);
    assert.equal(h.dealt(), want, `${target} ${sigil}`);
  }
});

test('Runic Seals: as their streak reaches exactly 3, rolled once a streak', () => {
  const h = game({ owned: () => onlyLacks('runeseal'), aura: () => 0.5 });
  h.step();
  h.step();
  assert.equal(h.s.turnAuras!.seals, undefined);
  h.step();
  assert.equal(h.s.players[0].streak, 3);
  assert.deepEqual(h.s.turnAuras!.seals, ['p0'], 'rolled (and missed at 0.5)');
  h.step();
  assert.equal(h.s.turnAuras!.seals, undefined);
  const hit = game({ owned: () => onlyLacks('runeseal') });
  hit.step();
  hit.step();
  hit.step();
  assert.equal(hit.dealt(), 'runeseal');
});

test('Precursor Engine: on the tablets’ card when it’s on offer, never elsewhere', () => {
  const h = game({ owned: () => onlyLacks('tower') });
  const tablets = h.engine.items.find((it) => it.group === TABLETS)!.category;
  const engine = h.engine as unknown as { rollTurnsAura(s: GameState): { category: string; kind: AuraKind } | undefined };
  const others = h.s.offered.filter((c) => c !== tablets);
  h.edit((c) => (c.offered = others.slice(0, 3)));
  assert.equal(engine.rollTurnsAura(structuredClone(h.s)), undefined);
  h.edit((c) => (c.offered = [others[0], tablets, others[1]]));
  assert.deepEqual(engine.rollTurnsAura(structuredClone(h.s)), { category: tablets, kind: 'tower' });
});

test('Azmeri Spirits: a game of 3 or more players', () => {
  assert.equal(game({ players: ['Ash', 'Brea'], owned: () => onlyLacks('azmeri') }).dealt(), null);
  assert.equal(game({ players: ['Ash', 'Brea', 'Cal'], owned: () => onlyLacks('azmeri') }).dealt(), 'azmeri');
});

test('Shadow and Delirium: Eternal only; Shadow with the Assassin sigil', () => {
  assert.equal(game({ owned: () => onlyLacks('delirium') }).dealt(), null);
  assert.equal(game({ settings: { difficulty: 'eternal' }, owned: () => onlyLacks('delirium') }).dealt(), 'delirium');
  assert.equal(game({ settings: { difficulty: 'eternal' }, owned: () => onlyLacks('shadow') }).dealt(), null);
  assert.equal(game({ settings: { difficulty: 'eternal' }, owned: () => onlyLacks('shadow'), sigil: 'assassin' }).dealt(), 'shadow');
});

test('no card in a deathmatch: its one card is drawn, not chosen', () => {
  const h = game({ players: ['Ash', 'Brea'], owned: () => onlyLacks('mirror'), settings: { targetScore: 1 } });
  // Both on 1 point: a tie at the target, settled by a deathmatch.
  for (let i = 0; i < 2; i++) h.step();
  assert.ok(h.s.deathmatch, 'a deathmatch');
  assert.equal(h.dealt(), null);
});

// ---- Divinity's streak, carried ---------------------------------------------------

test('Divinity: the streak carried in, with this game’s right answers, deals it at 10', () => {
  const h = game({ owned: () => onlyLacks('divine'), streak: () => 9 });
  assert.equal(carriedStreak(h.s, 'p0'), 9);
  assert.equal(h.dealt(), null);
  h.step();
  assert.equal(carriedStreak(h.s, 'p0'), 10);
  assert.equal(h.dealt(), 'divine');
  // A miss ends it.
  h.step(false);
  assert.equal(carriedStreak(h.s, 'p0'), 0);
  assert.equal(h.dealt(), null);
});

test('the carried streak across games: counted games add and end it, any other game and Delve leave it as it is', () => {
  // Two devices' stored streaks, as each device's session keeps its own from the state (saveAuraStreak).
  const kept = new Map([
    ['p0', 4],
    ['p1', 7],
  ]);
  const keep = (s: GameState) => {
    for (const id of kept.keys()) {
      const n = carriedStreak(s, id);
      if (n !== null) kept.set(id, n);
    }
  };
  /** Six turns, three each; `answers` says how each player's `n`th answer went. */
  const play = (settings: Partial<Settings>, answers: (id: string, n: number) => boolean) => {
    const h = game({ players: ['Ash', 'Brea'], settings, streak: (id) => kept.get(id)!, aura: () => 0.99 });
    const turns = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const id = h.on();
      const n = turns.get(id) ?? 0;
      turns.set(id, n + 1);
      h.pick(h.plain());
      h.answer(answers(id, n));
      keep(h.s);
      h.act({ type: 'next' });
      if (h.s.phase !== 'choosing') break;
    }
    return h;
  };
  // A counted game: Ash right three times (4 to 7), Brea right, then wrong, then right (7, 8, 0, 1).
  play({}, (id, n) => id === 'p0' || n !== 1);
  assert.deepEqual([...kept], [
    ['p0', 7],
    ['p1', 1],
  ]);
  // Cruel, Custom and Race leave it: wrong answers there end nothing.
  for (const settings of [{ difficulty: 'cruel' }, { difficulty: 'custom' }, { mode: 'race' }] as Partial<Settings>[]) {
    const h = game({ players: ['Ash', 'Brea'], settings, streak: (id) => kept.get(id)! });
    assert.equal(carriedStreak(h.s, 'p0'), null);
    keep(h.s);
  }
  // Delve too.
  keep(game({ players: ['Ash', 'Brea'], settings: DELVE, streak: (id) => kept.get(id)! }).s);
  assert.deepEqual([...kept], [
    ['p0', 7],
    ['p1', 1],
  ]);
  // The next counted game starts from what each carries: Ash, three more right, reaches 10 (Divinity's sign).
  const h = game({ players: ['Ash', 'Brea'], streak: (id) => kept.get(id)!, owned: () => onlyLacks('divine') });
  assert.equal(carriedStreak(h.s, 'p0'), 7);
  assert.equal(carriedStreak(h.s, 'p1'), 1);
  let dealt = false;
  for (let i = 0; i < 8 && !dealt; i++) {
    if (h.on() === 'p0' && carriedStreak(h.s, 'p0')! >= 10) dealt = h.dealt() === 'divine';
    h.step();
  }
  assert.ok(dealt, 'dealt as the carried streak reached 10');
});

test('a restart, a game in another mode: the deal of the game before is gone', () => {
  const h = game({ owned: () => onlyLacks('mirror') });
  assert.ok(h.s.turnAuras);
  h.act({ type: 'restart' });
  assert.equal(h.s.turnAuras, undefined);
  h.act({ type: 'settings', settings: { difficulty: 'cruel' } });
  h.act({ type: 'start' });
  assert.equal(h.s.turnAuras, undefined);
});

test('kept on this device: Divinity’s streak in a key of its own, read back as stored; damaged reads as none', () => {
  store.clear();
  assert.equal(loadAuraStreak(), 0, 'none stored');
  assert.ok(saveAuraStreak(12));
  assert.equal(loadAuraStreak(), 12);
  assert.ok(saveAuraStreak(0));
  assert.equal(loadAuraStreak(), 0);
  assert.ok(!saveAuraStreak(-1));
  assert.ok(!saveAuraStreak(2.5));
  for (const bad of [null, '', 'x', '-3', '1.5', '99999999']) assert.equal(parseAuraStreak(bad), 0, String(bad));
  assert.equal(parseAuraStreak('41'), 41);
});

test('kept on this device: a Take turns find owned with its mode (no depth) and worn at once, only the player it went to', () => {
  store.clear();
  const given = [{ kind: 'breach' as const, at: 1_700_000_000_000, to: ['p1'] }];
  assert.deepEqual(keepRunAuras(given, 'p0', false, 'turns'), []);
  assert.deepEqual(keepRunAuras(given, 'p1', false, 'turns'), ['breach']);
  assert.deepEqual(loadAuras().owned.breach, { at: 1_700_000_000_000, mode: 'turns' });
  assert.equal(loadAuras().worn, 'breach');
});

test('the hello carries Divinity’s streak its device carries; what isn’t one is left out', () => {
  const hello = { t: 'hello', secret: 'a'.repeat(24), name: 'Ash', v: 35 };
  assert.equal((parseClientMsg({ ...hello, divine: 7 }) as { divine?: number }).divine, 7);
  assert.equal((parseClientMsg({ ...hello, divine: 0 }) as { divine?: number }).divine, 0);
  assert.ok(!('divine' in parseClientMsg(hello)!), 'an older guest’s: none');
  for (const bad of [-1, 2.5, '9', 2_000_000]) assert.ok(!('divine' in parseClientMsg({ ...hello, divine: bad })!), `divine ${bad}`);
});

// ---- the deal's own random source, older states, counts ---------------------------------

test('its own random source: the same seed deals and asks exactly the same with the aura deal on or off', () => {
  const play = (on: boolean) => {
    const h = room({ players: ['Ash', 'Brea', 'Cal'], seed: 9, start: false, settings: { ...TURNS, difficulty: 'eternal', targetScore: 50 }, auraRng: () => 0 });
    if (on) h.engine.setAurasHeld((ids) => ids.map(() => ({ owned: 0, streak: 0, online: true })));
    h.act({ type: 'start' }, 'p0');
    const seen: string[] = [];
    let dealt = 0;
    for (let i = 0; i < 40 && h.s.phase === 'choosing'; i++) {
      const s = h.s;
      seen.push(String(s.turn), s.offered.join('|'));
      if (auraOffer(s)) dealt++;
      // (With every roll 0 the aura is always on the first card: the last is picked, on or off.)
      const cat = s.offered.at(-1)!;
      assert.equal(auraOn(s, cat), null);
      h.act({ type: 'pick', category: cat });
      h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
      const q = h.s.question!;
      seen.push(q.itemId, q.options.join('|'), JSON.stringify(q.mirrored), String(q.gray));
      h.act({ type: 'answer', index: i % 7 === 6 ? wrong(q) : right(q), askedAt: q.askedAt, ms: 800 });
      h.act({ type: 'next' });
    }
    return { seen, dealt };
  };
  const off = play(false);
  const on = play(true);
  assert.deepEqual(on.seen, off.seen);
  assert.equal(off.dealt, 0);
  assert.ok(on.dealt >= 30, `${on.dealt} dealt beside it`);
});

test('older states without the field read as none; damaged ones too', () => {
  const h = game();
  h.edit((c) => delete c.turnAuras);
  assert.equal(auraOffer(h.s), null);
  assert.equal(turnsAuras(h.s), null);
  assert.deepEqual(turnsGiven(h.s), []);
  assert.equal(carriedStreak(h.s, 'p0'), null);
  h.step();
  assert.equal(h.s.turnAuras, undefined);
  const d = game();
  d.edit((c) => {
    c.turnAuras!.card = { category: c.offered[0], kind: 'lich' };
    (c.turnAuras as { given?: unknown }).given = [{ kind: 'nope', at: 1, to: ['p0'] }, { kind: 'ice', at: 1, to: 'p0' }];
    (c.turnAuras!.streak as Record<string, unknown>).p0 = 'x';
  });
  assert.equal(auraOffer(d.s), null);
  assert.deepEqual(turnsGiven(d.s), []);
  assert.equal(carriedStreak(d.s, 'p0'), 0);
  d.step();
  assert.equal(d.s.phase, 'choosing');
});

test('counts: an aura card dealt once an offer, one won, one missed; none in a game that deals none', () => {
  const h = game({ owned: () => onlyLacks('mirror') });
  const before = { ...h.s, phase: 'reveal' as const };
  assert.deepEqual(auraEvents(before, h.s), ['aura/seen']);
  assert.deepEqual(auraEvents(h.s, { ...h.s, version: h.s.version + 1 }), [], 'once');
  h.pick(auraOffer(h.s)!.category);
  const asked = h.s;
  h.answer(true);
  assert.deepEqual(auraEvents(asked, h.s), ['aura/won']);
  const m = game();
  m.pick(m.plant('mirror'));
  const q = m.s;
  m.answer(false);
  assert.deepEqual(auraEvents(q, m.s), ['aura/missed']);
  // Cruel: no deal, so nothing counted, whatever is on its state by hand.
  const c = game({ settings: { difficulty: 'cruel' } });
  const cq = c.s;
  c.step(false);
  assert.deepEqual(auraEvents({ ...cq, phase: 'reveal' }, cq), []);
  assert.deepEqual(auraEvents(cq, c.s), []);
});

// ---- worn at once, in Delve too ---------------------------------------------------

test('Delve: an aura won is worn on the winner’s token at once, alone and together', () => {
  const alone = room({ players: ['Ash'], seed: 3, start: false, auraRng: () => 0 });
  alone.engine.setAurasHeld((ids) => ids.map(() => ({ owned: onlyLacks('mirror') })));
  alone.act({ type: 'start' }, 'p0');
  assert.equal(alone.s.delve!.aura?.kind, 'mirror');
  alone.act({ type: 'pick', category: alone.s.delve!.aura!.category });
  alone.act({ type: 'clock', askedAt: alone.s.question!.askedAt });
  alone.act({ type: 'answer', index: right(alone.s.question!), askedAt: alone.s.question!.askedAt, ms: 800 });
  assert.deepEqual(runAuras(alone.s).map((a) => a.kind), ['mirror']);
  assert.equal(alone.s.players[0].aura, 'mirror');

  const team = room({ players: ['Ash', 'Brea', 'Cal'], seed: 3, start: false, auraRng: () => 0 });
  // Cal owns it already: only Ash and Brea take it, and only theirs changes.
  team.engine.setAurasHeld((ids) => ids.map((id) => ({ owned: id === 'p2' ? ALL_AURAS : onlyLacks('mirror') })));
  team.edit((c) => (c.players.find((p) => p.id === 'p2')!.aura = 'breach'));
  team.act({ type: 'start' }, 'p0');
  const card = team.s.delve!.aura!.category;
  for (const p of team.s.players) team.act({ type: 'vote', category: card }, p.id);
  if (team.s.phase === 'choosing') team.act({ type: 'expire' }, null);
  team.act({ type: 'clock', askedAt: team.s.question!.askedAt });
  team.act({ type: 'answer', index: right(team.s.question!), askedAt: team.s.question!.askedAt, ms: 800 }, 'p0');
  assert.deepEqual([...team.s.reveal!.aura!.to].sort(), ['p0', 'p1']);
  const worn = Object.fromEntries(team.s.players.map((p) => [p.id, p.aura]));
  assert.deepEqual(worn, { p0: 'mirror', p1: 'mirror', p2: 'breach' });
});

