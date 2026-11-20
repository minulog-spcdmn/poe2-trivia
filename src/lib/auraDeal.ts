// Auras found in Delve (docs/gameplay.md, "Auras"): now and then an ordinary
// card on offer holds a player aura (lib/auraKinds.ts) its taker lacks.
// Answered right, the aura is theirs for good and worn at once
// (lib/auraStore.ts); missed, or blasted away with its card, it is gone.
// Each aura turns up only while something the run did, or the depth, calls
// for it (auraHolds), at its own chance; each offer rolls for them rarest
// tier first, within a tier in AURA_DROPS' order, and the first hit is the
// card. The rolls come from a random source of their own (the engine's
// auraRng), so no deal of the rest of the game draws differently for them.
//
// Depths here are the ones players see (delve.ts shownDepth); the engine
// hands them over that way. Nothing here reads or writes storage: the
// engine (game.ts) asks the session what each player owns.

import { findableWith, holdsAura, type AuraKind } from './auraKinds.ts';
import type { PlayerClass } from './classSigils.ts';

/** How rare an aura is, rarest first. */
export type AuraTier = 'mirror' | 'deep' | 'rare' | 'uncommon' | 'common';

export interface AuraDrop {
  kind: AuraKind;
  tier: AuraTier;
  /** Its chance on an offer where its condition holds (0 to 1). */
  chance: number;
}

/**
 * Every aura Delve deals, in the order an offer rolls them: rarest tier
 * first, within a tier as the owner listed them. The Lich and Delve are
 * benched (lib/auraKinds.ts BENCHED) and not dealt.
 */
export const AURA_DROPS: readonly AuraDrop[] = [
  { kind: 'mirror', tier: 'mirror', chance: 0.00004242 },
  { kind: 'abyss', tier: 'deep', chance: 0.002924 },
  { kind: 'chayula', tier: 'deep', chance: 0.001502 },
  { kind: 'ritual', tier: 'rare', chance: 0.005494 },
  { kind: 'divine', tier: 'rare', chance: 0.002917 },
  { kind: 'corrupted', tier: 'rare', chance: 0.002009 },
  { kind: 'twilight', tier: 'rare', chance: 0.0007586 },
  { kind: 'shadow', tier: 'rare', chance: 0.0006139 },
  { kind: 'breach', tier: 'uncommon', chance: 1 },
  { kind: 'expedition', tier: 'uncommon', chance: 0.002556 },
  { kind: 'ice', tier: 'uncommon', chance: 0.004236 },
  { kind: 'delirium', tier: 'uncommon', chance: 0.005391 },
  { kind: 'chronomancer', tier: 'uncommon', chance: 0.08853 },
  { kind: 'slayer', tier: 'uncommon', chance: 0.1677 },
  { kind: 'runeseal', tier: 'common', chance: 0.3 },
  { kind: 'tower', tier: 'common', chance: 0.1994 },
  { kind: 'azmeri', tier: 'common', chance: 0.007321 },
];

/** Breach: right answers in a row, each within BREACH_MS of its art reaching the player (FAST_MS in lib/achievements.ts). */
export const BREACH_IN_A_ROW = 2;
export const BREACH_MS = 2000;
/** Chronomancer: the right answer just given had less than this left on its clock (ms). */
export const CLOSE_MS = 1000;
/** Runic Seals: the streak at exactly this (rolled once a streak). */
export const SEALS_STREAK = 3;
/** Divinity: right answers in a row, and the depth it takes. */
export const DIVINE_STREAK = 10;
export const DIVINE_FROM = 20;
/** Herald of Ice: these depths. */
export const ICE_AT = [20, 29] as const;
/** Delirium: from this depth (its question's picture mirrored). */
export const DELIRIUM_FROM = 14;
/** Corruption: these depths. */
export const CORRUPTED_AT = [40, 49] as const;
/** Twilight Order: on the last life, past this depth, and at least so many depths after coming onto it. */
export const TWILIGHT_PAST = 30;
export const TWILIGHT_AFTER = 5;
/** Shadow: from this depth (its question's art grey). */
export const SHADOW_FROM = 40;
/** Abyss: these depths. */
export const ABYSS_AT = [
  [50, 59],
  [80, 89],
] as const;
/** Acolyte of Chayula: past this depth. */
export const CHAYULA_PAST = 50;
/** Azmeri Spirits: a run together of at least this many players. */
export const AZMERI_PLAYERS = 3;
/** Ritual: zones count from the Fissure (shown 10 to 19); the Mines (0 to 9) never do. */
export const RITUAL_FROM_ZONE = 1;

/** What the run says as an offer is dealt, shown depths. Alone the player's, together the team's. */
export interface AuraSigns {
  /** The depth (shown). */
  depth: number;
  /** Right answers in a row: alone the player's streak, together the team's. */
  streak: number;
  /** Right answers in a row each within BREACH_MS. */
  quick: number;
  /** The last answer was right with under CLOSE_MS on its clock. */
  close: boolean;
  /** Runic Seals was rolled already at this streak. */
  sealsRolled: boolean;
  /** The first offer of a zone from the second on whose previous zone (from RITUAL_FROM_ZONE) was cleared without a miss. */
  ritual: boolean;
  /** Players seated in the run (1 alone). */
  players: number;
  /** A card free to hold an aura is the tablets' category (Precursor Engine sits on it). */
  tablets: boolean;
}

/** One who could take an aura on this offer: alone the player, together each standing. */
export interface AuraTaker {
  /** The auras they own, as a mask (lib/auraKinds.ts auraMask), with any the run gave them. */
  owned: number;
  /** The class sigil they wear (class auras are found only with theirs). */
  sigil?: PlayerClass | null;
  /** They set off dynamite (Detonate) this run. */
  detonated: boolean;
  /** Slayer: the deepest of their last runs (shown), if they have one. */
  best?: number;
  /** Lives they have left. */
  lives: number;
  /** The depth (shown) they came onto their last life at, if they're on it. */
  lastLife?: number;
}

const within = (d: number, [lo, hi]: readonly [number, number]) => d >= lo && d <= hi;

/** Whether `kind`'s condition holds on this offer for `t` (whether they could take it aside: canTake). */
export function auraHolds(kind: AuraKind, g: AuraSigns, t: AuraTaker): boolean {
  const d = g.depth;
  switch (kind) {
    case 'mirror':
      return true;
    case 'abyss':
      return ABYSS_AT.some((r) => within(d, r));
    case 'chayula':
      return d > CHAYULA_PAST;
    case 'ritual':
      return g.ritual;
    case 'divine':
      return g.streak >= DIVINE_STREAK && d >= DIVINE_FROM;
    case 'corrupted':
      return within(d, CORRUPTED_AT);
    case 'twilight':
      return t.lives === 1 && d > TWILIGHT_PAST && t.lastLife !== undefined && d - t.lastLife >= TWILIGHT_AFTER;
    case 'shadow':
      return d >= SHADOW_FROM;
    case 'breach':
      return g.quick >= BREACH_IN_A_ROW;
    case 'expedition':
      return t.detonated;
    case 'ice':
      return within(d, ICE_AT);
    case 'delirium':
      return d >= DELIRIUM_FROM;
    case 'chronomancer':
      return g.close;
    case 'slayer':
      return t.best !== undefined && d === t.best;
    case 'runeseal':
      return g.streak === SEALS_STREAK && !g.sealsRolled;
    case 'tower':
      return g.tablets;
    case 'azmeri':
      return g.players >= AZMERI_PLAYERS;
    default:
      return false;
  }
}

/** Whether `t` could take `kind`: one they lack, and a class aura only with its sigil worn. */
export const canTake = (kind: AuraKind, t: Pick<AuraTaker, 'owned' | 'sigil'>) => !holdsAura(t.owned, kind) && findableWith(kind, t.sigil);

/**
 * The aura an offer deals, if any: each in AURA_DROPS' order whose
 * condition holds for a taker who could take it is rolled (one draw of
 * `rand` each) at its chance, and the first hit is the one. `rolled`: the
 * auras rolled, in order.
 */
export function dealAura(g: AuraSigns, takers: readonly AuraTaker[], rand: () => number): { kind: AuraKind | null; rolled: AuraKind[] } {
  const rolled: AuraKind[] = [];
  for (const { kind, chance } of AURA_DROPS) {
    if (!takers.some((t) => canTake(kind, t) && auraHolds(kind, g, t))) continue;
    rolled.push(kind);
    if (rand() < chance) return { kind, rolled };
  }
  return { kind: null, rolled };
}

/** How the question of a card holding `kind` is shown: the depth's own (Take turns: the room's), but Delirium's picture mirrored, Shadow's art grey, Precursor Engine's a tablet. */
export const auraForcing = (kind: AuraKind | undefined): { mirror?: true; gray?: true; group?: string } =>
  kind === 'delirium' ? { mirror: true } : kind === 'shadow' ? { gray: true } : kind === 'tower' ? { group: TABLETS } : {};

/** The group of items Precursor Engine's question asks from (game.ts RARE_GROUPS has it rare). */
export const TABLETS = 'Tablets';

// ---- Take turns ------------------------------------------------------------------

// Online Take turns at Merciless or Eternal deals aura cards too (counted
// games: countedTurns), to the player on turn: an ordinary card of their
// offer, one an offer at most, rolled as Delve's are (rarest tier first, the
// first hit the card) from the same random source of the engine's, with
// their own conditions and chances. Race, Custom, Cruel and a game on one
// device deal none; nor does a deathmatch (its one card is drawn, not chosen).

/** The difficulties whose online Take turns games deal auras and carry Divinity's streak. */
export const COUNTED_DIFFICULTIES = ['merciless', 'eternal'] as const;

/** Whether a game of these settings is one Take turns deals auras in (online aside, which the engine is told: AuraHeld online). */
export const countedTurns = (settings: { mode: string; difficulty: string }) =>
  settings.mode === 'turns' && (COUNTED_DIFFICULTIES as readonly string[]).includes(settings.difficulty);

/**
 * Every aura Take turns deals, in the order an offer rolls them: rarest tier
 * first, within a tier as the owner listed them for Take turns (Shadow before
 * Divinity, unlike Delve's), at Take turns' own chances.
 */
export const TURNS_AURA_DROPS: readonly AuraDrop[] = [
  { kind: 'mirror', tier: 'mirror', chance: 0.00004242 },
  { kind: 'shadow', tier: 'rare', chance: 0.0006139 },
  { kind: 'divine', tier: 'rare', chance: 0.0057 },
  { kind: 'breach', tier: 'uncommon', chance: 1 },
  { kind: 'delirium', tier: 'uncommon', chance: 0.005391 },
  { kind: 'chronomancer', tier: 'uncommon', chance: 0.3642 },
  { kind: 'slayer', tier: 'uncommon', chance: 0.04778 },
  { kind: 'runeseal', tier: 'common', chance: 0.3 },
  { kind: 'tower', tier: 'common', chance: 0.1994 },
  { kind: 'azmeri', tier: 'common', chance: 0.007321 },
];

/** Slayer in Take turns: only with a target of at least this many. */
export const SLAYER_TARGET = 10;

/** What a Take turns game says of the player on turn as their offer is dealt. */
export interface TurnsSigns {
  /** The room plays at Eternal (Shadow and Delirium deal only there). */
  eternal: boolean;
  /** Their right answers in a row this game (Runic Seals). */
  streak: number;
  /** Divinity: their right answers in a row across counted games (carried on their device, with this game's). */
  carried: number;
  /** Their right answers in a row each within BREACH_MS. */
  quick: number;
  /** Their last answer was right with under CLOSE_MS on its clock. */
  close: boolean;
  /** The room plays with a timer (Chronomancer only then). */
  timer: boolean;
  /** Runic Seals was rolled already at this streak. */
  sealsRolled: boolean;
  /** Their score, and the room's target. */
  score: number;
  target: number;
  /** Players seated in the game. */
  players: number;
  /** The tablets' card is on their offer (Precursor Engine sits on it). */
  tablets: boolean;
}

/** Whether `kind`'s condition holds on this Take turns offer (whether they could take it aside: canTake). */
export function turnsAuraHolds(kind: AuraKind, g: TurnsSigns): boolean {
  switch (kind) {
    case 'mirror':
      return true;
    case 'shadow':
    case 'delirium':
      return g.eternal;
    case 'divine':
      return g.carried >= DIVINE_STREAK;
    case 'breach':
      return g.quick >= BREACH_IN_A_ROW;
    case 'chronomancer':
      return g.timer && g.close;
    case 'slayer':
      return g.target >= SLAYER_TARGET && g.score === g.target - 1;
    case 'runeseal':
      return g.streak === SEALS_STREAK && !g.sealsRolled;
    case 'tower':
      return g.tablets;
    case 'azmeri':
      return g.players >= AZMERI_PLAYERS;
    default:
      return false;
  }
}

/** The aura a Take turns offer deals to `t`, the player on turn, if any: as dealAura, by TURNS_AURA_DROPS and turnsAuraHolds. */
export function dealTurnsAura(g: TurnsSigns, t: Pick<AuraTaker, 'owned' | 'sigil'>, rand: () => number): { kind: AuraKind | null; rolled: AuraKind[] } {
  const rolled: AuraKind[] = [];
  for (const { kind, chance } of TURNS_AURA_DROPS) {
    if (!canTake(kind, t) || !turnsAuraHolds(kind, g)) continue;
    rolled.push(kind);
    if (rand() < chance) return { kind, rolled };
  }
  return { kind: null, rolled };
}

/** Divinity's carried streak after an answer in a counted game: one more right, or back to none on a miss. */
export const carryStreak = (was: number, correct: boolean) => (correct ? was + 1 : 0);
