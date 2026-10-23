import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, publicView, DEFAULT_SETTINGS, type GameState } from '../src/lib/game.ts';
import { CRAFT, ORBS, canAim, dealable, madeBy, guessedBy, holds, rightGuess, shownOf, veiledPatches, wantedLooks, type Aim, type Orb } from '../src/lib/craft.ts';
import { linesFrom } from '../src/lib/craftLines.ts';

import { parseClientMsg } from '../src/lib/protocol.ts';
import { cursorsLive } from '../src/lib/cursors.ts';
import { items, loudly, seeded, silently } from './helpers.ts';

const lines = linesFrom(JSON.parse(readFileSync(new URL('../src/data/itemStats.json', import.meta.url), 'utf8')));

/** A Craft room on a clock the test moves, `n` players p0, p1, ... (p0 hosting), started. */
function craftRoom(n = 2, seed = 7) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(seed), now: () => clock.now });
  engine.setCraftLines(lines);
  let s: GameState = createGame('p0', { ...DEFAULT_SETTINGS, mode: 'craft' });
  for (let i = 0; i < n; i++) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name: `Crafter ${'ABCDEF'[i]}` }, `p${i}`);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const r = {
    engine,
    clock,
    s,
    act(a: Parameters<Engine['apply']>[1], from: string | null) {
      r.s = engine.apply(r.s, a, from);
      return r.s;
    },
    gold: (id: string) => r.s.players.find((p) => p.id === id)!.score,
    /** Everyone done with the step (the shop, the crafting, the reveal). */
    allReady() {
      for (const p of r.s.players) if (!r.s.craft!.ready.includes(p.id)) r.act({ type: 'craft', do: 'ready' }, p.id);
    },
    /** The step's time runs out. */
    timeUp() {
      const c = r.s.craft!;
      clock.now = c.until;
      r.act({ type: 'craftTime', round: c.round, step: c.step }, null);
    },
    buy(id: string, orb: Orb, times = 1) {
      for (let i = 0; i < times; i++) r.act({ type: 'craft', do: 'buy', orb }, id);
    },
    /** Uses an orb, put where it is given (a scramble with none: on the first line still there, or a Veil Orb in the middle of the picture). */
    use(id: string, orb: Orb, aim?: Aim) {
      const mine = madeBy(r.s.craft!, id);
      const first = mine ? mine.slots.findIndex((s) => s !== 'gone') : -1;
      aim ??= orb === 'annul' || orb === 'chaos' ? { line: first } : orb === 'veil' ? { at: [0.5, 0.5] } : undefined;
      return r.act({ type: 'craft', do: 'use', orb, ...(aim ? { aim } : {}) }, id);
    },
    /** Names the piece passed to `id`, right or wrong. */
    guess(id: string, right: boolean) {
      const p = guessedBy(r.s.craft!, id)!;
      const index = right ? p.options.indexOf(p.item) : p.options.findIndex((o) => o !== p.item);
      return r.act({ type: 'craft', do: 'guess', index }, id);
    },
  };
  return r;
}

test('craft: played online by two or more, with the items lines at hand', () => {
  const engine = new Engine(items, { rng: seeded(1) });
  let s = createGame(null, { ...DEFAULT_SETTINGS, mode: 'craft' });
  s = engine.apply(s, { type: 'join', playerId: 'a', name: 'Ash' }, null);
  s = engine.apply(s, { type: 'join', playerId: 'b', name: 'Bel' }, null);
  loudly(() => engine.apply(s, { type: 'start' }, null), /online/);
  let online = createGame('a', { ...DEFAULT_SETTINGS, mode: 'craft' });
  online = engine.apply(online, { type: 'join', playerId: 'a', name: 'Ash' }, 'a');
  engine.setCraftLines(lines);
  loudly(() => engine.apply(online, { type: 'start' }, 'a'), /two players/);
  online = engine.apply(online, { type: 'join', playerId: 'b', name: 'Bel' }, 'b');
  const started = engine.apply(online, { type: 'start' }, 'a');
  assert.equal(started.phase, 'craft');
  assert.equal(started.craft!.step, 'shop');
  assert.ok(started.players.every((p) => p.score === CRAFT.startGold));
});

test('craft: the shop sells for gold, and nobody else sees what was bought', () => {
  const r = craftRoom(2);
  r.buy('p0', 'annul', 2);
  assert.equal(r.gold('p0'), CRAFT.startGold - 2 * ORBS.annul.price);
  assert.equal(holds(r.s.craft!, 'p0', 'annul'), 2);
  const theirs = publicView(r.s, 'p1');
  assert.deepEqual(theirs.craft!.stash, {});
  assert.equal(theirs.players.find((p) => p.id === 'p0')!.score, CRAFT.startGold, 'their gold as the shop opened');
  assert.equal(publicView(r.s, 'p0').players.find((p) => p.id === 'p0')!.score, r.gold('p0'));
  // Not more than they have, and nothing once they're done shopping.
  r.buy('p1', 'chaos', Math.floor(CRAFT.startGold / ORBS.chaos.price));
  silently(() => r.buy('p1', 'chaos'), /gold/);
  r.act({ type: 'craft', do: 'ready' }, 'p0');
  silently(() => r.buy('p0', 'veil'), /closed/);
});

test('craft: everyone done shopping deals each an item for the next to name', () => {
  const r = craftRoom(3);
  r.allReady();
  const c = r.s.craft!;
  assert.equal(c.step, 'craft');
  assert.equal(c.pieces.length, 3);
  const ids = r.s.players.map((p) => p.id);
  for (const p of c.pieces) {
    const it = items.find((i) => i.id === p.item)!;
    assert.ok(dealable(it, lines));
    assert.equal(p.options.length, CRAFT.options);
    assert.ok(p.options.includes(p.item));
    assert.equal(new Set(p.options).size, CRAFT.options);
    assert.equal(p.guesser, ids[(ids.indexOf(p.maker) + 1) % ids.length]);
    assert.deepEqual(p.shown, lines(p.item));
  }
  assert.equal(new Set(c.pieces.map((p) => p.item)).size, 3, 'three different items');
});

test('craft: scrambles change the item as its maker watches', () => {
  const r = craftRoom(2);
  r.buy('p0', 'annul');
  r.buy('p0', 'chaos');
  r.buy('p0', 'veil');
  r.buy('p0', 'chance');
  r.allReady();
  const before = madeBy(r.s.craft!, 'p0')!;
  const n = before.shown.length;
  // Each where it was put: Annulment takes that line away.
  r.use('p0', 'annul', { line: 1 });
  let p = madeBy(r.s.craft!, 'p0')!;
  assert.equal(p.shown.length, n - 1);
  assert.deepEqual(p.slots.map((s) => s === 'gone'), p.slots.map((_, i) => i === 1));
  assert.equal(holds(r.s.craft!, 'p0', 'annul'), 0);
  silently(() => r.use('p0', 'annul'), /none/);
  // Not on a line already gone, nor anywhere it can't go: nothing is spent.
  silently(() => r.use('p0', 'chaos', { line: 1 }), /go there/);
  silently(() => r.use('p0', 'chaos', {}), /go there/);
  silently(() => r.use('p0', 'veil', { line: 0 }), /go there/);
  assert.equal(holds(r.s.craft!, 'p0', 'chaos'), 1);
  r.use('p0', 'veil', { at: [0.3, 0.6] });
  p = madeBy(r.s.craft!, 'p0')!;
  assert.deepEqual(p.veils, [[0.3, 0.6]]);
  assert.equal(p.look, 1);
  r.use('p0', 'chaos', { line: 0 });
  p = madeBy(r.s.craft!, 'p0')!;
  assert.equal(typeof p.slots[0], 'object', 'that line swapped for another item’s');
  assert.equal(p.picture, null);
  assert.deepEqual(p.shown, shownOf(p, lines));
  // Chance: a new item altogether, what was done to the old one lost.
  r.use('p0', 'chance');
  const fresh = madeBy(r.s.craft!, 'p0')!;
  assert.notEqual(fresh.item, p.item);
  assert.deepEqual(fresh.veils, []);
  assert.ok(fresh.slots.every((s) => s === 'kept'));
  assert.ok(fresh.look > p.look, 'its picture goes out again');
});

test('craft: the guesser sees the item as it looks, never what it is or what was done', () => {
  const r = craftRoom(3);
  r.buy('p0', 'annul');
  r.allReady();
  r.use('p0', 'annul');
  const mine = madeBy(r.s.craft!, 'p0')!;
  const guesser = mine.guesser;
  const third = r.s.players.find((p) => p.id !== 'p0' && p.id !== guesser)!.id;
  // While it is being crafted, nothing of it.
  let seen = publicView(r.s, guesser).craft!.pieces.find((p) => p.maker === 'p0')!;
  assert.equal(seen.item, '');
  assert.deepEqual(seen.shown, []);
  assert.deepEqual(seen.options, []);
  assert.equal(publicView(r.s, 'p0').craft!.pieces.find((p) => p.maker === 'p0')!.item, mine.item, 'its maker sees it whole');
  r.allReady();
  assert.equal(r.s.craft!.step, 'guess');
  seen = publicView(r.s, guesser).craft!.pieces.find((p) => p.maker === 'p0')!;
  assert.equal(seen.item, '');
  assert.deepEqual(seen.slots, []);
  assert.equal(seen.picture, null);
  assert.deepEqual(seen.veils, []);
  assert.deepEqual(seen.shown, mine.shown);
  assert.deepEqual(seen.options, mine.options);
  assert.ok(!JSON.stringify(publicView(r.s, guesser)).includes(`"item":"${mine.item}"`), 'the item only as one of the six');
  const other = publicView(r.s, third).craft!.pieces.find((p) => p.maker === 'p0')!;
  assert.deepEqual(other.options, []);
  assert.deepEqual(other.shown, []);
  // The pictures: to the maker while crafting, and to the guesser too while naming.
  const look = wantedLooks(r.s).find((w) => w.key.includes('p0'))!;
  assert.deepEqual(look.to, ['p0', guesser]);
});

test('craft: an undo puts back what it finds, and is spent with nothing to find', () => {
  const r = craftRoom(2);
  r.buy('p0', 'annul', 2);
  const g = 'p1';
  r.buy(g, 'exalt', 3);
  r.buy(g, 'unveil');
  r.buy('p0', 'veil');
  r.allReady();
  r.use('p0', 'annul');
  r.use('p0', 'annul');
  r.allReady();
  const n = guessedBy(r.s.craft!, g)!.shown.length;
  r.use(g, 'exalt');
  assert.equal(guessedBy(r.s.craft!, g)!.shown.length, n + 1);
  assert.deepEqual(guessedBy(r.s.craft!, g)!.last, { orb: 'exalt', hit: true });
  r.use(g, 'exalt');
  r.use(g, 'exalt');
  assert.deepEqual(guessedBy(r.s.craft!, g)!.last, { orb: 'exalt', hit: false });
  assert.equal(holds(r.s.craft!, g, 'exalt'), 0);
  r.use(g, 'unveil');
  assert.deepEqual(guessedBy(r.s.craft!, g)!.last, { orb: 'unveil', hit: false });
  // Scrambles are the maker's, in their own step.
  silently(() => r.use('p0', 'veil'));
});

test('craft: a right name is paid by the bank, a wrong one by the guesser to the maker', () => {
  const r = craftRoom(2);
  r.allReady();
  r.allReady();
  r.guess('p1', true);
  r.guess('p0', false);
  const c = r.s.craft!;
  assert.equal(c.step, 'reveal');
  const p1 = guessedBy(c, 'p1')!;
  const p0 = guessedBy(c, 'p0')!;
  assert.ok(rightGuess(p1));
  assert.equal(p1.paid, CRAFT.rightPay);
  assert.equal(p0.paid, CRAFT.wrongCost);
  assert.equal(r.gold('p1'), CRAFT.startGold + CRAFT.rightPay + CRAFT.wrongCost);
  assert.equal(r.gold('p0'), CRAFT.startGold - CRAFT.wrongCost);
  // At the reveal everything comes out.
  assert.equal(publicView(r.s, 'p0').craft!.pieces.find((p) => p.guesser === 'p0')!.item, p0.item);
});

test('craft: no name in time counts as wrong, and costs no more gold than they have', () => {
  const r = craftRoom(2);
  r.buy('p1', 'chaos', Math.floor(CRAFT.startGold / ORBS.chaos.price));
  const left = r.gold('p1');
  assert.ok(left < CRAFT.wrongCost);
  r.allReady();
  r.allReady();
  r.guess('p0', true);
  r.timeUp();
  const p = guessedBy(r.s.craft!, 'p1')!;
  assert.equal(p.guess, null);
  assert.equal(p.paid, left);
  assert.equal(r.gold('p1'), 0);
});

test('craft: the game ends after the last round, or after one where someone reaches the cap', () => {
  const r = craftRoom(2);
  for (let round = 1; round <= CRAFT.rounds; round++) {
    assert.equal(r.s.phase, 'craft');
    assert.equal(r.s.craft!.round, round);
    r.allReady();
    r.allReady();
    r.guess('p0', true);
    r.guess('p1', round === 1);
    if (r.s.players.some((p) => p.score >= CRAFT.goldCap)) {
      r.allReady();
      break;
    }
    r.allReady();
  }
  assert.equal(r.s.phase, 'over');
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(r.s.craft!.round < CRAFT.rounds, 'the cap ended it early');
});

test('craft: a step never waits for someone who left, and one player left ends it', () => {
  const r = craftRoom(3);
  r.act({ type: 'connection', playerId: 'p2', connected: false }, null);
  r.act({ type: 'craft', do: 'ready' }, 'p0');
  r.act({ type: 'craft', do: 'ready' }, 'p1');
  assert.equal(r.s.craft!.step, 'craft', 'the shop did not wait');
  assert.equal(r.s.craft!.pieces.length, 2, 'dealt to those here');
  r.act({ type: 'remove', playerId: 'p1' }, 'p0');
  assert.equal(r.s.phase, 'craft');
  assert.ok(r.s.craft!.pieces.every((p) => p.guesser !== 'p1'), 'the item passed to them is put back');
  r.act({ type: 'remove', playerId: 'p2' }, 'p0');
  assert.equal(r.s.phase, 'over');
  assert.deepEqual(r.s.winners, ['p0']);
});

test('craft: guests may only send their own moves, well formed', () => {
  const ok = parseClientMsg({ t: 'action', action: { type: 'craft', do: 'use', orb: 'chaos' } });
  assert.deepEqual(ok, { t: 'action', action: { type: 'craft', do: 'use', orb: 'chaos' } });
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'craft', do: 'use', orb: 'mirror' } }), null);
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'craft', do: 'guess', index: 99 } }), null);
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'craftTime', round: 1, step: 'shop' } }), null);
  const guess = parseClientMsg({ t: 'action', action: { type: 'craft', do: 'guess', index: 2, orb: 'chaos' } });
  assert.deepEqual(guess, { t: 'action', action: { type: 'craft', do: 'guess', index: 2 } });
  // Where a scramble is put: a line, the picture, or a place on it, and nothing else with it.
  const use = (aim: unknown) => parseClientMsg({ t: 'action', action: { type: 'craft', do: 'use', orb: 'chaos', aim } });
  assert.deepEqual(use({ line: 2, picture: true }), { t: 'action', action: { type: 'craft', do: 'use', orb: 'chaos', aim: { line: 2 } } });
  assert.deepEqual(use({ picture: true }), { t: 'action', action: { type: 'craft', do: 'use', orb: 'chaos', aim: { picture: true } } });
  assert.deepEqual(use({ at: [0.25, 1], x: 1 }), { t: 'action', action: { type: 'craft', do: 'use', orb: 'chaos', aim: { at: [0.25, 1] } } });
  for (const bad of [null, 3, { line: -1 }, { line: 1.5 }, { at: [0.5] }, { at: [0.5, 2] }, { at: ['0.5', 0.5] }, { picture: 1 }]) assert.equal(use(bad), null, JSON.stringify(bad));
});

test('craft: a scramble goes only where it does something', () => {
  const r = craftRoom(2);
  r.allReady();
  const p = madeBy(r.s.craft!, 'p0')!;
  p.slots[0] = 'gone';
  assert.ok(!canAim(p, 'annul', { line: 0 }) && canAim(p, 'annul', { line: 1 }));
  assert.ok(!canAim(p, 'annul', { line: p.slots.length }) && !canAim(p, 'annul', { picture: true }));
  assert.ok(canAim(p, 'chaos', { picture: true }) && canAim(p, 'chaos', { line: 1 }) && !canAim(p, 'chaos', {}));
  assert.ok(canAim(p, 'veil', { at: [0, 1] }) && !canAim(p, 'veil', { at: [1.2, 0] }) && !canAim(p, 'veil', {}));
  p.veils = Array.from({ length: CRAFT.veilLayers }, () => [0.5, 0.5] as [number, number]);
  assert.ok(!canAim(p, 'veil', { at: [0.2, 0.2] }), 'no more veils than a picture takes');
  assert.ok(canAim(p, 'chance', {}));
});

test('craft: a veil hides about a quarter of the picture, round where it was put', () => {
  // A picture of 10 x 10 patches, each one pixel.
  const patches = Array.from({ length: 100 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10), area: 1 }));
  const hid = veiledPatches(patches, [[0, 0]], 10, 10);
  assert.equal(hid.size, 100 / CRAFT.veilLayers);
  for (const i of hid) assert.ok(patches[i].x <= 6 && patches[i].y <= 6, 'near its top left corner');
  assert.ok(!hid.has(99));
  // Two apart hide twice as much; two in one place, no more than one.
  assert.equal(veiledPatches(patches, [[0, 0], [1, 1]], 10, 10).size, 50);
  assert.equal(veiledPatches(patches, [[0.5, 0.5], [0.5, 0.5]], 10, 10).size, 25);
  assert.equal(veiledPatches(patches, [], 10, 10).size, 0);
});

test('craft: every dealable item has six names from its kind to go with it', () => {
  const engine = new Engine(items, { rng: seeded(3) });
  engine.setCraftLines(lines);
  const dealt = items.filter((it) => dealable(it, lines));
  assert.ok(dealt.length > 300, `${dealt.length} items can be dealt`);
  for (const it of dealt) {
    const sameKind = items.filter((o) => o.id !== it.id && o.kind === 'unique' && o.category === it.category);
    assert.ok(sameKind.length >= CRAFT.options - 1, `${it.name} has too few of its kind`);
  }
});

test("craft: no other player's pointer shows during a game, to tell which orbs they reach for", () => {
  const r = craftRoom();
  for (const step of ['shop', 'craft', 'guess', 'reveal']) {
    assert.equal(r.s.craft!.step, step);
    assert.equal(cursorsLive(r.s), false, step);
    if (step === 'guess') for (const p of r.s.players) r.guess(p.id, true);
    else r.allReady();
  }
});
