// Turns: what a turn is worth near the end of a game. Once someone reaches
// the target with seats still to play this round, the round is the final
// one (game.ts advance only ends a game where a round wraps): each player
// left gets a last chance, told what their own turn can do. A player one
// right answer from the target is at match point. Also the Gambler's ledger
// in words: a player's corruptions this game (the end screen) and this
// browser's over every game (the lobby, lib/vaalRecord.ts). Pure: read off
// the state, the same on every screen; game.ts never imports this.

import { HOLD, vaalOn, type GameState, type Player } from './game.ts';
import type { VaalLedger } from './vaalRecord.ts';

/** A classic turns game (settings without a mode count as turns; never race or Delve). */
const turnsGame = (s: GameState) => s.settings.mode !== 'race' && s.settings.mode !== 'delve' && !s.delve;

/**
 * Who still plays this round, in seat order: the player on turn until their
 * question is revealed, then every connected seat after theirs (the seats
 * game.ts advance moves through before it wraps to the next round).
 */
export function toPlay(s: GameState): string[] {
  const ids = s.players.slice(s.turn + 1).filter((p) => p.connected).map((p) => p.id);
  const active = s.players[s.turn];
  return active && s.phase !== 'reveal' ? [active.id, ...ids] : ids;
}

/**
 * The final round: someone has reached the target, and seats are still to
 * play before the round ends (and with it the game, or a deathmatch begins).
 * From the reveal that reaches it through the last remaining turn's choice
 * and question; not at the last seat's reveal (nobody is left to play), nor
 * in a deathmatch, race or Delve.
 */
export function finalRound(s: GameState): boolean {
  if (!turnsGame(s) || s.deathmatch) return false;
  if (s.phase !== 'choosing' && s.phase !== 'question' && s.phase !== 'reveal') return false;
  if (!s.players.length || Math.max(...s.players.map((p) => p.score)) < s.settings.targetScore) return false;
  return toPlay(s).length > 0;
}

/** Who has reached the target (the final round's overlay names them). */
export function reachedBy(s: GameState): string[] {
  return s.players.filter((p) => p.score >= s.settings.targetScore).map((p) => p.id);
}

/** One right answer from the target. */
export const matchPoint = (score: number, target: number) => score === target - 1;

/**
 * What the turn in play was when it began (its banner keeps it through the
 * reveal, as the score changes): 'last', a last chance in the final round;
 * 'match', the player on turn at match point; else null. At the reveal it
 * reads the score before this turn's answer counted.
 */
export function turnStakes(s: GameState): 'last' | 'match' | null {
  if (!turnsGame(s) || s.deathmatch) return null;
  if (s.phase !== 'choosing' && s.phase !== 'question' && s.phase !== 'reveal') return null;
  const active = s.players[s.turn];
  if (!active) return null;
  const r = s.phase === 'reveal' ? s.reveal : null;
  const gained = r ? (r.stake?.delta ?? (r.correct ? 1 : 0)) : 0;
  const before = active.score - gained;
  const best = Math.max(before, ...s.players.filter((p) => p !== active).map((p) => p.score));
  if (best >= s.settings.targetScore) return 'last';
  return matchPoint(before, s.settings.targetScore) ? 'match' : null;
}

/** The header's "Final round": the final round, through its last turn's reveal. */
export const finalRoundShown = (s: GameState) => finalRound(s) || turnStakes(s) === 'last';

/**
 * The final round, as a remaining player chooses: what their own turn can do
 * against the leader (later seats may still change the outcome; these words
 * stay true for this turn). Said to the player (and in hot-seat, `local`);
 * those watching read it under the player's name. '' outside a final round's
 * choosing.
 */
export function stakesLine(s: GameState, viewer: string | null, local: boolean): string {
  if (!finalRound(s) || s.phase !== 'choosing') return '';
  const active = s.players[s.turn];
  if (!active) return '';
  const gap = Math.max(...s.players.map((p) => p.score)) - active.score;
  if (gap <= 0) return '';
  const corrupts = vaalOn(s) && (active.vaal ?? 0) > 0;
  const altar = s.altar ?? 0;
  let line: string;
  if (gap === 1) line = corrupts ? 'Answer right to force a deathmatch; a corruption that holds takes the lead.' : 'Answer right to force a deathmatch.';
  else if (corrupts && HOLD + altar >= gap) {
    const withAltar = altar > 0 ? ', with the Altar,' : '';
    line = HOLD + altar === gap ? `Only a corruption that holds${withAltar} can force a deathmatch.` : `Only a corruption that holds${withAltar} takes the lead.`;
  } else line = "It's out of reach. Play for pride.";
  if (local || viewer === active.id) return line;
  return `${active.name}: ${line[0].toLowerCase()}${line.slice(1)}`;
}

/**
 * A player's corruptions this game, for the end screen: only what happened
 * ("2 held, 1 bricked, took an Altar of 3"); '' for a player who never
 * corrupted. Commas, not bullets: it is set in the body font.
 */
export function ledgerText(l: Player['ledger']): string {
  if (!l) return '';
  const parts = [l.held > 0 ? `${l.held} held` : '', l.bricked > 0 ? `${l.bricked} bricked` : '', l.altar > 0 ? `took an Altar of ${l.altar}` : ''];
  return parts.filter(Boolean).join(', ');
}

/** This browser's ledger over every game it counted, for the lobby; '' before the first. */
export function ledgerLine(rec: VaalLedger): string {
  if (rec.games <= 0) return '';
  return `Your ledger: ${rec.held} held, ${rec.bricked} bricked${rec.bestAltar > 0 ? `, biggest Altar ${rec.bestAltar}` : ''}.`;
}
