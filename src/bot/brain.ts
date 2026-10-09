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
// down, or doesn't; a run of misses tilts some and steadies others, an item
// seen at an earlier reveal sticks, and in a team some follow the votes.
// All of it mild: these are players, not caricatures.
// Pure functions of their inputs and a random source, so tests can pin them.

import { nameSimilarity, type DifficultyRules, type GameState } from '../lib/game.ts';

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
  /** After a run of misses: below 0 it tilts (hastier, sloppier), above 0 it steadies (slower, more careful). */
  temper: number;
  /** Delve together: the chance it goes with the team's votes once there are some. */
  herd: number;
  /** How often it moves on from a reveal itself rather than wait for the timer (0 to 1). */
  impatience: number;
  /** Delve together: the chance it changes its vote while the vote is open. */
  dither: number;
  /**
   * How much it likes hosting (0 to 1): those high on it are the ones who
   * open rooms, quickly when there is none to play in; those low on it would
   * rather join someone else's.
   */
  hosting: number;
  /** Likes a busy room (1) or a quiet one (0), when picking a room to join. */
  sociable: number;
  /** How much it minds rules other than its own in a room to join (0 to 1). */
  picky: number;
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
  /** It saw this item revealed earlier on (the reveal stuck). */
  remembered?: boolean;
  /** How far a run of misses has got to it, 0 (none) to 1 (three or more in a row). */
  tilt?: number;
  /** Still warming up (its first few answers on): a little slower. */
  warming?: boolean;
  /** How tired it is from a long time on, 0 to 1: a little slower and sloppier. */
  tired?: number;
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
    temper: between(rng, -1, 1),
    herd: between(rng, 0.1, 0.5),
    impatience: rng(),
    dither: between(rng, 0, 0.3),
    // Most would rather join; a few like to host.
    hosting: rng() ** 1.6,
    sociable: rng(),
    picky: rng(),
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

/**
 * A run of misses on its mood: below 0 (a temper) it costs care, above 0 it
 * buys a little, each in proportion to how far the run has got (Ask.tilt).
 */
const tilted = (p: Persona, ask: Ask) => (ask.tilt ?? 0) * p.temper;

/** How likely the bot is to know this answer. */
export function knowChance(p: Persona, ask: Ask): number {
  // A favourite it knows cold, whatever the question piles on (bar a little).
  if (ask.favourite) return clamp(0.995 - hardness(ask) * 0.15 - 0.02 * p.haste, 0.9, 0.995);
  // A race is a scramble: less time to be sure before someone else is. Haste costs a little care.
  const t = tilted(p, ask);
  let c = clamp(RECOGNISE + p.skill + (p.affinity[ask.category] ?? 0) - hardness(ask) - (ask.mode === 'race' ? 0.03 : 0) - 0.04 * p.haste + (t < 0 ? 0.03 * t : 0.01 * t), 0.3, 0.99);
  // Seen revealed earlier on: it mostly stuck.
  if (ask.remembered) c += (0.99 - c) * 0.4;
  return c - 0.015 * (ask.tired ?? 0);
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
  // Tilted, quicker; steadied, slower.
  const t = tilted(p, ask);
  let s = (MEDIAN_S + HARD_S * hardness(ask)) * Math.exp(0.4 * gauss(rng)) * p.pace * (1 - 0.3 * p.haste) * (t < 0 ? 1 + 0.15 * t : 1 + 0.2 * t);
  if (ask.veil) s *= 1.3;
  if (!knows) s *= 1.6;
  if (ask.warming) s *= 1.2;
  s *= 1 + 0.1 * (ask.tired ?? 0);
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

/**
 * Delve together: the card it votes for, given its own choice and the
 * team's votes so far: now and then (as far as it goes with the herd) the
 * one most voted for instead.
 */
export function withTheHerd(p: Persona, own: string, votes: string[], rng: Rng): string {
  if (!votes.length || rng() >= p.herd) return own;
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** How a game went for it: won, lost badly (last, and well behind), or neither. */
export type Mood = 'won' | 'lost' | 'even';

/**
 * How a game went for player `me`: won, lost badly (last, and at least
 * two points and two fifths of the target behind the leader), or neither.
 * A Delve run has no winner: neither.
 */
export function moodOf(s: GameState, me: string): Mood {
  if (s.delve || !s.players.some((p) => p.id === me)) return 'even';
  if (s.winners.includes(me)) return 'won';
  const scores = s.players.map((p) => p.score);
  const mine = s.players.find((p) => p.id === me)!.score;
  const behind = Math.max(...scores) - mine;
  return mine === Math.min(...scores) && behind >= Math.max(2, s.settings.targetScore * 0.4) ? 'lost' : 'even';
}

/** Whether it stays on after a game: one more after a win now and then, early off after a heavy loss now and then. */
export const staysOn = (mood: Mood, rng: Rng, odds: StayOdds = GUEST_ODDS): 'longer' | 'leave' | 'as planned' =>
  mood === 'won' && rng() < odds.longer ? 'longer' : mood === 'lost' && rng() < odds.leave ? 'leave' : 'as planned';

/** The chances of staying longer after a win, and of leaving after a heavy loss. */
export interface StayOdds {
  longer: number;
  leave: number;
}
/** A guest: one more game now and then after a win, and half the time off after a heavy loss. */
export const GUEST_ODDS: StayOdds = { longer: 0.4, leave: 0.5 };
/** A host (whose leaving closes the room on everyone): longer as often, off much less often. */
export const HOST_ODDS: StayOdds = { longer: 0.4, leave: 0.15 };

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
  let ms = between(rng, 1300, 3800);
  // Now and then it reads the cards a while longer, or something else catches its eye (well under the host's skip).
  const r = rng();
  if (r < 0.03) ms += between(rng, 8000, 18000);
  else if (r < 0.15) ms += between(rng, 2000, 6000);
  return Math.round(ms * p.pace);
}

/** Now and then the click lands on the option next to the one it meant (the hastier, the likelier; rarely all the same). */
export const misclicks = (p: Persona, rng: Rng) => rng() < 0.004 + 0.012 * p.haste;

/** After its own reveal (or the team's), whether it moves on itself, and how soon (ms), rather than wait for the timer. */
export function movesOn(p: Persona, rng: Rng): number | null {
  return rng() < 0.6 * p.impatience ? Math.round(between(rng, 1300, 3200) * p.pace) : null;
}

/** Delve together: whether it has second thoughts about its vote (ms after voting), while the vote is open. */
export function rethinks(p: Persona, rng: Rng): number | null {
  return rng() < p.dither ? Math.round(between(rng, 1500, 4000)) : null;
}

/** How tired it is after `minutes` on: nothing for 40 minutes, then rising to all of it at 120. */
export const tiredness = (minutes: number) => clamp((minutes - 40) / 80, 0, 1);
