// The room bot's player: how a person might pick categories and answer.
//
// The bot hosts its room, so it always knows the answer. Everything here is
// about playing like someone who knows the game well, not like the host:
// it knows nearly every item when it is shown plainly, and less the more a
// question piles on (look-alike and made-up names, look-alike art, the art
// burning in, mirrored, without colour); it knows some categories better
// than others, takes its time (longer on hard questions and when unsure),
// and when it doesn't know, it narrows the options down and guesses, falling
// for the one most like the right one when the guess is wrong. The same
// player in every mode: take turns, race and Delve (where it also weighs up
// finds, uses dynamite, and always gives a teammate who perished a life).
// Each has a build they played (items they know cold and name in a flash),
// is more or less trigger-happy, and keeps their nerve as the clock ticks
// down, or doesn't.
// Pure functions of their inputs and a random source, so tests can pin them.

import { nameSimilarity, type DifficultyRules } from '../lib/game.ts';

export type Rng = () => number;

/** One bot's character, rolled when it starts: steady for the whole session. */
export interface Persona {
  /** Added to every chance of knowing an answer. */
  skill: number;
  /** Multiplies every delay (below 1: quicker). */
  pace: number;
  /** Added to the chance of knowing an answer in each category. */
  affinity: Record<string, number>;
  /** Delve: how keen it is on finds (before what a miss would cost it: findAppetite). */
  finds: number;
  /** Delve alone: the chance it detonates dynamite on a question it isn't sure of, rather than guess. */
  boldness: number;
  /** Trigger-happy (0 to 1): quicker to answer, a little sloppier, and in a race quicker to guess. */
  haste: number;
  /** Nerve (0 to 1): how calm it stays once the clock ticks urgent; low, and it panics into an answer. */
  nerve: number;
  /** Items it knows cold, from builds it played (identities.ts buildOf): named in a flash. */
  favourites: string[];
}

/** What the bot sees of a question when it decides. */
export interface Ask {
  /** The rules it is asked under (a deathmatch's and a Delve depth's included). */
  rules: Pick<DifficultyRules, 'options' | 'similarNames' | 'fakes' | 'moreFakes' | 'lookalikes'>;
  category: string;
  /** The share of the clock the art takes to burn in (0: shown whole). */
  veil: number;
  /** The art is shown without colour. */
  gray: boolean;
  /** Some of the art is shown flipped. */
  mirrored: boolean;
  /** Seconds on the clock, 0 without one. */
  clock: number;
  mode: 'turns' | 'race' | 'delve';
  /** It is one of the player's own favourites (a build's). */
  favourite?: boolean;
}

/** Chance of knowing an item shown plainly, before the persona. */
const RECOGNISE = 0.985;
/** Typical (median) seconds to answer a plain question it knows, and how much each bit of hardness adds. */
const MEDIAN_S = 2.4;
const HARD_S = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/** A normally distributed number (Box-Muller). */
export function gauss(rng: Rng) {
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
    skill: between(rng, -0.06, 0.015),
    pace: between(rng, 0.75, 1.35),
    affinity: Object.fromEntries(categories.map((c) => [c, between(rng, -0.07, 0.025)])),
    finds: between(rng, 0.6, 1),
    boldness: between(rng, 0.4, 0.95),
    haste: rng() ** 1.5,
    nerve: between(rng, 0.1, 1),
    favourites: [],
  };
}

/**
 * What a question piles on, as the share of known items it costs: about 0.1
 * on Merciless, 0.2 on Eternal, up to 0.35 at Delve's hardest.
 */
export function hardness(ask: Ask): number {
  const r = ask.rules;
  return (
    0.05 * r.similarNames +
    0.015 * (r.fakes + (r.moreFakes ?? 0)) +
    0.06 * (r.lookalikes ?? 0) +
    0.08 * ask.veil +
    (ask.mirrored ? 0.03 : 0) +
    (ask.gray ? 0.06 : 0)
  );
}

/** How likely the bot is to know this answer. */
export function knowChance(p: Persona, ask: Ask): number {
  // A favourite it knows cold, whatever the question piles on (bar a little).
  if (ask.favourite) return clamp(0.995 - hardness(ask) * 0.15 - 0.02 * p.haste, 0.9, 0.995);
  // A race is a scramble: less time to be sure before someone else is. Haste costs a little care.
  return clamp(RECOGNISE + p.skill + (p.affinity[ask.category] ?? 0) - hardness(ask) - (ask.mode === 'race' ? 0.03 : 0) - 0.04 * p.haste, 0.3, 0.99);
}

/**
 * Not knowing it, the chance a guess is right anyway: the options that
 * don't look like it are ruled out, and it guesses between the rest (more of
 * them alike the more look-alikes and made-up names there are).
 */
export function guessChance(ask: Ask): number {
  const r = ask.rules;
  const alike = clamp(1 + 2 * r.similarNames + 0.5 * (r.fakes + (r.moreFakes ?? 0)) + (r.lookalikes ?? 0), 1, r.options - 1);
  return 1 / (1 + alike);
}

/**
 * Milliseconds the bot takes to answer, from when the clock started; null to
 * let the clock run out (or, in a race, to stay out of it). The clock isn't
 * minded: an answer slower than it comes too late, as anyone's does.
 */
export function answerDelay(p: Persona, ask: Ask, knows: boolean, rng: Rng): number | null {
  if (!knows) {
    // Not sure: a wrong answer in a race costs a point, so mostly sit it out;
    // in turns, now and then nothing comes to mind at all. (In Delve a guess
    // beats a time-out, which costs the life all the same.)
    // (Trigger-happy players sit out less, and blank less.)
    if (ask.mode === 'race' && rng() < 0.6 * (1 - 0.7 * p.haste)) return null;
    if (ask.mode === 'turns' && ask.clock && rng() < 0.05 * (1 - p.haste)) return null;
  }
  let s = (MEDIAN_S + HARD_S * hardness(ask)) * Math.exp(0.4 * gauss(rng)) * p.pace * (1 - 0.3 * p.haste);
  if (ask.veil) s *= 1.3;
  if (!knows) s *= 1.6;
  // A favourite is named in a flash (the art burning in or not).
  if (ask.favourite && knows) s *= 0.5;
  return Math.round(Math.max(ask.favourite ? 700 : 1000, s * 1000));
}

/** The seconds the clock ticks urgent before 0, as the game shows them (Game.svelte warnFrom). */
export const urgentSeconds = (ask: Pick<Ask, 'clock' | 'mode'>) => (ask.mode === 'delve' ? clamp(Math.round(ask.clock * 0.35), 3, 5) : 5);

/**
 * Whether the urgent ticking gets to it: with its answer due only after the
 * clock turns urgent, a nervous player often panics, clicking within a second
 * of the ticking starting (ms from the clock's start), and now and then on
 * the wrong one (`fumble`). Calm players hardly ever.
 */
export function panic(p: Persona, ask: Ask, delay: number, rng: Rng): { at: number; fumble: boolean } | null {
  if (!ask.clock) return null;
  const urgent = (ask.clock - urgentSeconds(ask)) * 1000;
  if (delay <= urgent || rng() >= 0.75 * (1 - p.nerve)) return null;
  return { at: Math.round(urgent + between(rng, 300, 1200)), fumble: rng() < 0.35 * (1 - p.nerve) };
}

/**
 * Delve alone: whether, not sure of the answer, it blasts the question away
 * with dynamite (when it may) rather than guess. Together it never does early:
 * a teammate may know it, and at 0 the dynamite goes off by itself anyway.
 */
export const blasts = (p: Persona, rng: Rng) => rng() < p.boldness;

/** What a find would put at stake for the bot (Delve). */
export interface FindStake {
  lives: number;
  wards: number;
  /** What a miss on it costs (an Azurite Vein two). */
  losses: number;
  /** The depth as players see it. */
  depth: number;
  /** Delve together: teammates still standing. */
  teammates: number;
}

/**
 * How likely it goes for a find: a find is always worth having, but a miss
 * on it (asked deeper down) can cost the run. Keen as the player is, less so
 * when a miss would take its last life, or all but one, and the deeper the
 * worse; teammates still standing make it braver (one of them may know it,
 * and the team goes on).
 */
export function findAppetite(p: Persona, f: FindStake): number {
  const left = f.lives + f.wards - f.losses;
  const deep = clamp((f.depth - 20) / 60, 0, 1);
  let risk = left <= 0 ? 0.6 + 0.35 * deep : left === 1 ? 0.25 + 0.35 * deep : 0.1 * deep;
  if (f.teammates > 0) risk *= 0.6;
  return p.finds * (1 - risk);
}

/**
 * The option the bot picks: the right one if it knows, else a guess that is
 * right as often as guessChance says and otherwise falls for a look-alike.
 * `names`: each option's name ('' when unknown); `ruledOut`: options it
 * won't pick (others' wrong guesses in a race).
 */
export function chooseAnswer(names: string[], correct: number, knows: boolean, ask: Ask, ruledOut: number[], rng: Rng): number {
  if (knows || rng() < guessChance(ask)) return correct;
  return wrongPick(names, correct, ruledOut, rng) ?? correct;
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
  return offered[weighted(offered.map((c) => Math.exp(15 * (p.affinity[c] ?? 0))), rng)];
}

/**
 * The card the bot picks (or votes for): a find on offer as readily as its
 * appetite for it says (findAppetite), else a category it knows.
 */
export function chooseCard(p: Persona, offered: string[], finds: { category: string; appetite: number }[], rng: Rng): string {
  const on = finds.filter((f) => offered.includes(f.category));
  for (let i = on.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [on[i], on[j]] = [on[j], on[i]];
  }
  for (const f of on) if (rng() < f.appetite) return f.category;
  return pickCategory(p, offered, rng);
}

/** Milliseconds to look over the categories before picking. */
export function pickDelay(p: Persona, rng: Rng): number {
  return Math.round(between(rng, 1300, 3800) * p.pace);
}
