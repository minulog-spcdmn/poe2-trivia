// Take turns' aura cards (lib/auraDeal.ts, "Take turns"; docs/gameplay.md,
// "Auras"): what a game's state holds of them (GameState turnAuras), read as
// far as it reads sane, so a damaged or older save reads as none. The card on
// offer is read with Delve's (delve.ts auraOffer).

import type { GameState, TurnsAuras } from './game.ts';
import { isWornAura, type AuraKind } from './auraKinds.ts';

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((id) => typeof id === 'string');

/** The game's aura deal, if it reads as one (none outside a counted Take turns game). */
export function turnsAuras(s: GameState): TurnsAuras | null {
  const t = s.turnAuras;
  if (s.delve || !t || typeof t !== 'object' || !t.streak || typeof t.streak !== 'object') return null;
  return t;
}

/** The auras the game gave so far, oldest first. */
export function turnsGiven(s: GameState): { kind: AuraKind; at: number; to: string[] }[] {
  const all = turnsAuras(s)?.given;
  if (!Array.isArray(all)) return [];
  return all.filter((a) => !!a && typeof a === 'object' && isWornAura(a.kind) && isIds(a.to) && Number.isFinite(a.at));
}

/** The aura cards the game picked and missed so far, oldest first. */
export function turnsMissed(s: GameState): { kind: AuraKind; to: string[] }[] {
  const all = turnsAuras(s)?.missed;
  if (!Array.isArray(all)) return [];
  return all.filter((a) => !!a && typeof a === 'object' && isWornAura(a.kind) && isIds(a.to));
}

/** Whether `id` is dealt aura cards in this game (online, on a device of their own: game.ts AuraHeld online). */
export const dealtTo = (s: GameState, id: string) => {
  const t = turnsAuras(s);
  return !!t && Object.hasOwn(t.streak, id);
};

/** Divinity's streak `id` carries as the game stands (what they came in with, and this game's answers), or null for one it isn't dealt to. */
export function carriedStreak(s: GameState, id: string): number | null {
  if (!dealtTo(s, id)) return null;
  const n = turnsAuras(s)!.streak[id];
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0;
}
