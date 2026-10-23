// How the room bot's players play Craft (lib/craft.ts), as people might:
// what they buy with their gold, how they scramble the item dealt them (and
// where they put each scramble), and
// what they make of the one passed to them. A player naming an item goes by
// what is on their screen, nothing more: the mod lines they know as one of
// the options' own (most of them, not all: knowsLine), and the
// picture, as far as it is still the item's own (sight.ts compares it). A
// line a Chaos Orb swapped in, or a picture, may point to another option,
// and fools them as it would a person. Unsure, those who have undos use one
// and look again. Pure functions of their inputs and a random source, so
// tests can pin them.

import { CRAFT, ORBS, SCRAMBLES, UNDOS, canAim, type Aim, type ModLines, type Orb, type Piece } from '../lib/craft.ts';
import { gauss, weighted, type Persona, type Rng } from './brain.ts';
import { seededBy } from './util.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** An orb used on one's own item. */
export type Scramble = Exclude<Orb, 'exalt' | 'divine' | 'unveil'>;

/** How keen people are on each orb, in the shop. */
const LIKES: Record<Orb, number> = { annul: 3, chaos: 3, veil: 2.5, chance: 0.4, exalt: 3, divine: 2.5, unveil: 2.5 };
/** The most of each anyone holds: more would mostly be wasted on one item. */
const MOST: Record<Orb, number> = { annul: 3, chaos: 2, veil: 3, chance: 1, exalt: 3, divine: 2, unveil: 3 };

/**
 * What a player buys in the shop, in the order they buy it. The careful
 * keep enough back to pay for a wrong name (and gamblers seldom do); of the
 * rest they spend most, a little over half on scrambling their own item and
 * the rest on undoing the one passed to them, never more of one orb than
 * would do anything.
 */
export function shopping(p: Persona, gold: number, held: Partial<Record<Orb, number>>, rng: Rng): Orb[] {
  const keepsBack = rng() < clamp(0.25 + 0.5 * p.sense - 0.4 * p.gamble, 0.05, 0.85);
  let budget = Math.max(0, gold - (keepsBack ? CRAFT.wrongCost : 0));
  budget = Math.round(budget * clamp(0.7 + 0.3 * p.gamble + 0.1 * gauss(rng), 0.5, 1));
  const toScramble = clamp(0.6 + 0.15 * gauss(rng), 0.35, 0.85);
  const have = { ...held };
  const out: Orb[] = [];
  let spent = { scramble: 0, undo: 0 };
  for (;;) {
    const left = budget - spent.scramble - spent.undo;
    const side = spent.scramble <= toScramble * (spent.scramble + spent.undo + 1) ? 'scramble' : 'undo';
    const can = (orbs: readonly Orb[]) => orbs.filter((o) => ORBS[o].price <= left && (have[o] ?? 0) < MOST[o]);
    let choice = can(side === 'scramble' ? SCRAMBLES : UNDOS);
    if (!choice.length) choice = can(side === 'scramble' ? UNDOS : SCRAMBLES);
    if (!choice.length) break;
    const orb = choice[weighted(choice.map((o) => LIKES[o]), rng)];
    out.push(orb);
    have[orb] = (have[orb] ?? 0) + 1;
    spent = { ...spent, [ORBS[orb].side]: spent[ORBS[orb].side] + ORBS[orb].price };
  }
  return out;
}

/**
 * The scrambles a player uses on their item, in order: an Orb of Chance
 * first, if they use it (it trades the item for another, so it comes before
 * the rest), then everything else they hold, in a shuffled order: an item
 * is only this round's, so nothing is kept back for the next.
 */
export function scrambling(held: Partial<Record<Orb, number>>, rng: Rng): Scramble[] {
  const out: Scramble[] = [];
  if ((held.chance ?? 0) > 0 && rng() < 0.45) out.push('chance');
  const rest = (['annul', 'chaos', 'veil'] as const).flatMap((o) => Array.from({ length: held[o] ?? 0 }, () => o));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...out, ...rest];
}

/**
 * Where a player puts a scramble on their item, or null where it can't go
 * anywhere. Annulment and Chaos go on a line, the better players' on one
 * that gives the item away (no other of its six names has it), the rest's
 * on any; Chaos goes on the picture now and then, while it is still the
 * item's own; a Veil Orb near the middle, where the item is, away from the
 * veils already on it. Chance goes on the item.
 */
export function aiming(p: Persona, piece: Piece, orb: Scramble, lines: ModLines, rng: Rng): Aim | null {
  if (orb === 'chance') return {};
  if (orb === 'veil') {
    let best: [number, number] | null = null;
    let far = -1;
    for (let i = 0; i < 6; i++) {
      const at: [number, number] = [clamp(0.5 + 0.2 * gauss(rng), 0.15, 0.85), clamp(0.5 + 0.2 * gauss(rng), 0.15, 0.85)];
      const d = Math.min(9, ...piece.veils.map(([x, y]) => (x - at[0]) ** 2 + (y - at[1]) ** 2));
      if (d > far) [best, far] = [at, d];
    }
    return best && canAim(piece, 'veil', { at: best }) ? { at: best } : null;
  }
  if (orb === 'chaos' && piece.picture === null && rng() < 0.3) return { picture: true };
  const own = lines(piece.item);
  const others = new Set(piece.options.filter((o) => o !== piece.item).flatMap((o) => lines(o)));
  const standing = piece.slots.flatMap((s, i) => (s === 'gone' ? [] : [i]));
  const telling = standing.filter((i) => piece.slots[i] === 'kept' && !others.has(own[i]));
  const from = telling.length && rng() < clamp(0.55 + 5 * p.skill + 0.25 * (p.sense - 0.5), 0.2, 0.95) ? telling : standing;
  if (!from.length) return orb === 'chaos' ? { picture: true } : null;
  return { line: from[Math.floor(rng() * from.length)] };
}

/**
 * Whether a player knows a mod line as an item's own (`item`'s): nobody
 * knows them all, the better players more of them. The same lines known
 * every time (a fresh draw for a player with no seed).
 */
export function knowsLine(p: Persona, item: string, line: string): boolean {
  const r = p.seed ? seededBy(`${p.seed}:line:${item}:${line}`)() : Math.random();
  return r < clamp(0.62 + 3 * p.skill, 0.4, 0.8);
}

/** What a player makes of the item to name: per option, the shown lines that are its own, and how alike the picture is to it (-1 to 1; null: no picture to go by). */
export interface Clues {
  lines: number[];
  picture: (number | null)[] | null;
  /** How many lines are shown in all. */
  shown: number;
}

/**
 * How strongly the clues point to each option. A line is an option's own or
 * it isn't; the picture counts for as much as it stands out from the rest
 * (one clearly alike, much; all of them about as alike, nothing).
 */
export function weigh(c: Clues): number[] {
  const out = c.lines.map((n) => n);
  const pic = c.picture;
  if (pic && pic.every((v) => v !== null)) {
    const sorted = [...(pic as number[])].sort((a, b) => b - a);
    const mid = sorted[Math.floor(sorted.length / 2)];
    for (let i = 0; i < out.length; i++) out[i] += 3 * clamp(((pic[i] as number) - mid) / 0.35, 0, 1);
  }
  return out;
}

/** How sure a player is of the best option (0 to 1): how far it stands out from the next best, and how much there is to go by. */
export function sureness(scores: number[]): number {
  const sorted = [...scores].sort((a, b) => b - a);
  const [best, next] = [sorted[0] ?? 0, sorted[1] ?? 0];
  if (best <= 0) return 0;
  return clamp((best - next) / 2.5, 0, 1) * clamp(best / 2, 0, 1);
}

/**
 * Which option a player names: the one the clues point to, more often the
 * surer they are and the better they know the items; otherwise one of the
 * others, those the clues half point to first. Nothing to go by: a guess.
 */
export function naming(p: Persona, scores: number[], rng: Rng): number {
  const sure = sureness(scores);
  const best = scores.indexOf(Math.max(...scores));
  if (Math.max(...scores) <= 0) return Math.floor(rng() * scores.length);
  const right = clamp(0.25 + 0.65 * sure + 2 * p.skill - 0.05 * p.haste, 0.2, 0.93);
  if (rng() < right) return best;
  return weighted(
    scores.map((s, i) => (i === best ? 0 : 0.3 + Math.max(0, s))),
    rng,
  );
}

/**
 * Whether a player who holds undos uses one before naming, and which: the
 * unsure do (those who weigh things up more readily), the sure keep them for
 * later rounds. Few lines to go by, the Exalted Orb first; a picture that
 * says little, the Unveil Orb; else the Divine Orb, for what may have been
 * swapped. Null: they name it now.
 */
export function unscrambling(p: Persona, scores: number[], clues: Clues, held: Partial<Record<Orb, number>>, rng: Rng): Orb | null {
  const have = UNDOS.filter((o) => (held[o] ?? 0) > 0);
  if (!have.length) return null;
  const sure = sureness(scores);
  if (rng() > clamp(1 - sure * (1.2 - 0.4 * p.sense), 0, 1)) return null;
  const pic = clues.picture?.filter((v): v is number => v !== null) ?? [];
  const picSays = pic.length ? Math.max(...pic) - Math.min(...pic) : 0;
  const order: Orb[] = clues.shown < 3 ? ['exalt', 'divine', 'unveil'] : picSays < 0.3 ? ['unveil', 'divine', 'exalt'] : ['divine', 'exalt', 'unveil'];
  return order.find((o) => have.includes(o)) ?? null;
}

/** Seconds a player looks the item over before deciding (a little longer with less to go by). */
export function lookTime(p: Persona, scores: number[], rng: Rng): number {
  const s = (3 + 5 * (1 - sureness(scores))) * Math.exp(0.35 * gauss(rng)) * p.pace * (1 - 0.3 * p.haste);
  return Math.round(clamp(s, 1.5, 20) * 1000);
}
