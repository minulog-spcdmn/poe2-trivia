// The room bot's player: how a person might pick categories and answer.
//
// The bot hosts its room, so it always knows the answer. Everything here is
// about not playing like it: it knows some categories better than others,
// takes its time (longer when it isn't sure), sometimes doesn't know, and
// then falls for the option most like the right one, as people do.
// Pure functions of their inputs and a random source, so tests can pin them.

import { nameSimilarity, type Difficulty } from '../lib/game.ts';

export type Rng = () => number;

/** One bot's character, rolled when it starts: steady for the whole session. */
export interface Persona {
  /** Added to every chance of knowing an answer. */
  skill: number;
  /** Multiplies every delay (below 1: quicker). */
  pace: number;
  /** Added to the chance of knowing an answer in each category. */
  affinity: Record<string, number>;
}

/** What the bot sees of a question when it decides. */
export interface Ask {
  difficulty: Difficulty;
  /** One difficulty harder than the room's (a deathmatch). */
  harder: boolean;
  category: string;
  /** The art burns in patch by patch. */
  veiled: boolean;
  /** Seconds on the clock, 0 without one. */
  clock: number;
  race: boolean;
}

const LADDER: Difficulty[] = ['cruel', 'merciless', 'eternal'];

/** Chance of knowing an answer by difficulty, before the persona. */
const KNOWS: Record<Difficulty, number> = { cruel: 0.8, merciless: 0.66, eternal: 0.52, custom: 0.66 };
/** Typical (median) seconds to answer by difficulty, when the answer is known. */
const MEDIAN_S: Record<Difficulty, number> = { cruel: 3.6, merciless: 5, eternal: 6.4, custom: 5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/** A normally distributed number (Box-Muller). */
function gauss(rng: Rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Picks an index with chances in proportion to `weights`. */
export function weighted(weights: number[], rng: Rng): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function makePersona(categories: string[], rng: Rng): Persona {
  return {
    skill: between(rng, -0.05, 0.05),
    pace: between(rng, 0.85, 1.2),
    affinity: Object.fromEntries(categories.map((c) => [c, between(rng, -0.15, 0.12)])),
  };
}

function rung(ask: Pick<Ask, 'difficulty' | 'harder'>): Difficulty {
  if (!ask.harder) return ask.difficulty;
  const i = LADDER.indexOf(ask.difficulty);
  return i < 0 ? 'eternal' : LADDER[Math.min(LADDER.length - 1, i + 1)];
}

/** How likely the bot is to know this answer. */
export function knowChance(p: Persona, ask: Ask): number {
  let c = KNOWS[rung(ask)] + p.skill + (p.affinity[ask.category] ?? 0);
  if (ask.veiled) c -= 0.08;
  // A race is a scramble: less time to be sure before someone else is.
  if (ask.race) c -= 0.06;
  return clamp(c, 0.15, 0.95);
}

/**
 * Milliseconds the bot takes to answer, from when the question was asked;
 * null to let the clock run out (or, in a race, to stay out of it).
 */
export function answerDelay(p: Persona, ask: Ask, knows: boolean, rng: Rng): number | null {
  const clockMs = ask.clock * 1000;
  if (!knows) {
    // Not sure: a wrong answer in a race costs a point, so mostly sit it out;
    // on a clock in turns, now and then nothing comes to mind at all.
    if (ask.race && rng() < 0.6) return null;
    if (!ask.race && clockMs && rng() < 0.12) return null;
  }
  let s = MEDIAN_S[rung(ask)] * Math.exp(0.4 * gauss(rng)) * p.pace;
  if (ask.veiled) s *= 1.35;
  if (!knows) s *= 1.5;
  let ms = Math.max(1200, s * 1000);
  // Answers come in before the clock's end (with a little room for the network).
  if (clockMs) ms = Math.min(ms, clockMs - between(rng, 600, 1500));
  return Math.max(900, Math.round(ms));
}

/**
 * The wrong option the bot falls for: likelier the more its name looks like
 * the right one (made-up names copy real ones, so they tempt the most).
 * `names`: each option's name ('' when unknown); `ruledOut`: options it
 * won't pick (others' wrong guesses in a race).
 */
export function wrongPick(names: string[], correct: number, ruledOut: number[], rng: Rng): number | null {
  const right = names[correct] ?? '';
  const weights = names.map((n, i) => {
    if (i === correct || ruledOut.includes(i)) return 0;
    const sim = right && n ? nameSimilarity(right, n) : 0.5;
    return (0.25 + sim) ** 2;
  });
  return weights.some((w) => w > 0) ? weighted(weights, rng) : null;
}

/** The category the bot picks: mostly the ones it knows best. */
export function pickCategory(p: Persona, offered: string[], rng: Rng): string {
  return offered[weighted(offered.map((c) => Math.exp(6 * (p.affinity[c] ?? 0))), rng)];
}

/** Milliseconds to look over the categories before picking. */
export function pickDelay(p: Persona, rng: Rng): number {
  return Math.round(between(rng, 1300, 3800) * p.pace);
}
