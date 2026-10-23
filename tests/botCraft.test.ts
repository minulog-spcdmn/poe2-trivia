import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, craftView, DEFAULT_SETTINGS, type GameState } from '../src/lib/game.ts';
import { CRAFT, ORBS, SCRAMBLES, UNDOS, canScramble, guessedBy, holds, madeBy, veilShare, type Orb } from '../src/lib/craft.ts';
import { linesFrom } from '../src/lib/craftLines.ts';
import { makePersona, type Persona } from '../src/bot/brain.ts';
import { knowsLine, naming, scrambling, shopping, sureness, unscrambling, weigh, type Clues } from '../src/bot/craftBrain.ts';
import { items, seeded } from './helpers.ts';

const lines = linesFrom(JSON.parse(readFileSync(new URL('../src/data/itemStats.json', import.meta.url), 'utf8')));
const categories = [...new Set(items.map((it) => it.category))];
const persona = (seed: number): Persona => makePersona(categories, seeded(seed));

test('craft bot: shops within its gold, never more of an orb than would do anything', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const p = persona(seed);
    const gold = 5 + (seed % 40);
    const list = shopping(p, gold, {}, seeded(seed * 7));
    const spent = list.reduce((sum, o) => sum + ORBS[o].price, 0);
    assert.ok(spent <= gold, `spent ${spent} of ${gold}`);
    const count = (o: Orb) => list.filter((x) => x === o).length;
    assert.ok(count('chance') <= 1 && count('chaos') <= 2 && count('annul') <= 3);
  }
  // With gold to spend, something of each side, mostly.
  let both = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const list = shopping(persona(seed), 20, {}, seeded(seed));
    if (list.some((o) => SCRAMBLES.includes(o)) && list.some((o) => UNDOS.includes(o))) both++;
  }
  assert.ok(both > 70, `${both} of 100 bought both`);
});

test('craft bot: uses every scramble it holds, an Orb of Chance first', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const held = { annul: 2, chaos: 1, veil: 1, chance: 1, exalt: 2 };
    const list = scrambling(held, seeded(seed));
    assert.deepEqual(list.filter((o) => o !== 'chance').sort(), ['annul', 'annul', 'chaos', 'veil']);
    if (list.includes('chance')) assert.equal(list[0], 'chance');
  }
});

test('craft bot: names what the clues point to, the surer the more often; with nothing to go by, a guess', () => {
  const p = persona(3);
  const clear: Clues = { lines: [0, 4, 0, 1, 0, 0], picture: [0.1, 0.85, 0.2, 0.3, 0.15, 0.2], shown: 5 };
  const faint: Clues = { lines: [1, 1, 0, 1, 0, 0], picture: null, shown: 3 };
  const share = (c: Clues, want: number) => {
    const rng = seeded(11);
    let n = 0;
    for (let i = 0; i < 1000; i++) if (naming(p, weigh(c), rng) === want) n++;
    return n / 1000;
  };
  assert.ok(sureness(weigh(clear)) > sureness(weigh(faint)));
  assert.ok(share(clear, 1) > 0.7, `clear ${share(clear, 1)}`);
  assert.ok(share(clear, 1) > share(faint, 0) + 0.15);
  assert.ok(share(faint, 0) < 0.7);
  const none: Clues = { lines: [0, 0, 0, 0, 0, 0], picture: null, shown: 0 };
  const seen = new Set(Array.from({ length: 200 }, (_, i) => naming(p, weigh(none), seeded(i))));
  assert.equal(seen.size, 6);
});

test('craft bot: unsure, it unscrambles with what it holds; sure, or holding none, it names it', () => {
  const p = persona(5);
  const unsure: Clues = { lines: [1, 1, 0, 0, 1, 0], picture: [0.3, 0.32, 0.28, 0.3, 0.31, 0.29], shown: 2 };
  const sure: Clues = { lines: [0, 5, 0, 0, 0, 0], picture: [0.1, 0.9, 0.1, 0.2, 0.1, 0.1], shown: 5 };
  let used = 0;
  for (let i = 0; i < 100; i++) {
    const o = unscrambling(p, weigh(unsure), unsure, { exalt: 1, unveil: 1 }, seeded(i));
    if (o) {
      used++;
      assert.ok(o === 'exalt' || o === 'unveil');
    }
  }
  assert.ok(used > 80, `${used}`);
  assert.equal(unscrambling(p, weigh(unsure), unsure, {}, seeded(1)), null);
  let sureUsed = 0;
  for (let i = 0; i < 100; i++) if (unscrambling(p, weigh(sure), sure, { divine: 2 }, seeded(i))) sureUsed++;
  assert.ok(sureUsed < 20, `${sureUsed}`);
});

/**
 * Bots playing a whole game against each other through the engine, on what
 * their screens show (the lines; the picture as eyes would make it out: the
 * art shown, the less alike the more of it a veil hides, against the rest).
 */
test('craft bot: two bots play a whole game to its end, naming a fair share right', () => {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(21), now: () => clock.now });
  engine.setCraftLines(lines);
  let s: GameState = createGame('a', { ...DEFAULT_SETTINGS, mode: 'craft' });
  const ids = ['a', 'b'];
  for (const id of ids) s = engine.apply(s, { type: 'join', playerId: id, name: `Bot ${id}` }, id);
  s = engine.apply(s, { type: 'start' }, 'a');
  const personas: Record<string, Persona> = { a: persona(31), b: persona(32) };
  const rng = seeded(41);
  const act = (a: Parameters<Engine['apply']>[1], from: string) => {
    try {
      s = engine.apply(s, a, from);
    } catch {
      // A move the game turns down (a scramble that would do nothing more): as a click that does nothing.
    }
  };
  let right = 0;
  let named = 0;
  for (let guard = 0; s.phase === 'craft' && guard < 200; guard++) {
    const c = s.craft!;
    if (c.step === 'shop') {
      for (const id of ids) {
        const v = craftView(s, id);
        for (const orb of shopping(personas[id], v.players.find((p) => p.id === id)!.score, v.craft!.stash[id] ?? {}, rng)) act({ type: 'craft', do: 'buy', orb }, id);
        act({ type: 'craft', do: 'ready' }, id);
      }
    } else if (c.step === 'craft') {
      for (const id of ids) {
        for (const orb of scrambling(craftView(s, id).craft!.stash[id] ?? {}, rng)) {
          const mine = madeBy(s.craft!, id);
          if (mine && canScramble(mine, orb) && holds(s.craft!, id, orb) > 0) act({ type: 'craft', do: 'use', orb }, id);
        }
        act({ type: 'craft', do: 'ready' }, id);
      }
    } else if (c.step === 'guess') {
      for (const id of ids) {
        for (let tries = 0; tries < 8; tries++) {
          const v = craftView(s, id);
          const p = guessedBy(v.craft!, id)!;
          const full = guessedBy(s.craft!, id)!;
          const art = full.picture ?? full.item;
          const visible = 1 - veilShare(full.veil);
          const shown = new Set(p.shown);
          const clues: Clues = {
            lines: p.options.map((o) => lines(o).filter((l) => shown.has(l) && knowsLine(personas[id], o, l)).length),
            picture: p.options.map((o) => 0.2 + 0.15 * rng() + (o === art ? 0.6 * visible ** 2 : 0)),
            shown: p.shown.length,
          };
          const undo = unscrambling(personas[id], weigh(clues), clues, v.craft!.stash[id] ?? {}, rng);
          if (undo) {
            act({ type: 'craft', do: 'use', orb: undo }, id);
            continue;
          }
          const index = naming(personas[id], weigh(clues), rng);
          named++;
          if (p.options[index] === full.item) right++;
          act({ type: 'craft', do: 'guess', index }, id);
          break;
        }
        if (guessedBy(s.craft!, id)?.guess === undefined) {
          named++;
          act({ type: 'craft', do: 'guess', index: 0 }, id);
        }
      }
    } else for (const id of ids) act({ type: 'craft', do: 'ready' }, id);
  }
  assert.equal(s.phase, 'over');
  assert.ok(s.winners.length >= 1);
  assert.ok(named >= 2 && named <= CRAFT.rounds * 2);
  // Scrambled against them, they still name a fair share, and miss some.
  assert.ok(right / named > 0.25, `${right} of ${named}`);
});
