// This browser's Gambler's ledger: its player's Vaal Orb corruptions over
// every turns game it counted (how many held, how many bricked) and the
// biggest Altar a hold of theirs ever took. Kept in localStorage, like the
// Delve records (lib/delveRecord.ts); the lobby shows it, and the end screen
// tells of a new biggest Altar.
//
// Whose game is it? Online, the player this browser seats (never a
// spectator); on one device, its one player (a hot-seat game of several is
// nobody's). A game counts once, as it ends: the last game counted is kept
// (`last`, its startedAt), so a reload of the end screen, or a second tab of
// the same browser in the same room, changes nothing.
//
// A ledger this build can't read is never written over (lib/keepAside.ts): a
// newer build's stays untouched, anything else is kept aside first.

import { vaalMode, type GameState } from './game.ts';
import { clearAside, makeRoom } from './keepAside.ts';
import { readStored, removeStored, tryReadStored, writeStored } from './storage.ts';

const NAME = 'vaalLedger';
const VERSION = 1;
/** The most any count can hold; more is read as this many (damage, never play). */
export const MAX_COUNT = 1_000_000;

export interface VaalLedger {
  /** Turns games counted. */
  games: number;
  /** Corruptions that held. */
  held: number;
  /** Corruptions that bricked (time-outs too). */
  bricked: number;
  /** The biggest Altar a hold took (0 for none yet). */
  bestAltar: number;
  /** The last game counted: its startedAt on the host's clock (0 for none). */
  last: number;
}

/** One game as this browser's player played it (game.ts Player.ledger), and which game it was. */
export interface LedgerEntry {
  held: number;
  bricked: number;
  /** The biggest Altar a hold of theirs took in this game (0 for none). */
  altar: number;
  /** The game's startedAt. */
  game: number;
}

export const emptyLedger = (): VaalLedger => ({ games: 0, held: 0, bricked: 0, bestAltar: 0, last: 0 });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A count as stored: a whole number from 0 up, capped; anything else (damage) reads as 0. */
const count = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? Math.min(v as number, MAX_COUNT) : 0);

/** The stored ledger, cleaned up; null when missing, malformed or from another version. */
export function parseLedger(raw: string | null): VaalLedger | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== VERSION) return null;
  const last = typeof v.last === 'number' && Number.isFinite(v.last) && v.last > 0 ? v.last : 0;
  return { games: count(v.games), held: count(v.held), bricked: count(v.bricked), bestAltar: count(v.bestAltar), last };
}

export const serializeLedger = (l: VaalLedger) => JSON.stringify({ v: VERSION, ...l });

/**
 * The ledger with a game added, and whether its Altar is a new biggest (beats
 * the one before and is at least 2: an Altar of 1 is no story). The game
 * counted last, counted again, changes nothing (the same ledger back).
 */
export function addGame(l: VaalLedger, e: LedgerEntry): { rec: VaalLedger; bestAltar: boolean } {
  if (e.game === l.last) return { rec: l, bestAltar: false };
  const add = (a: number, b: number) => Math.min(MAX_COUNT, a + count(b));
  const altar = count(e.altar);
  return {
    rec: { games: add(l.games, 1), held: add(l.held, e.held), bricked: add(l.bricked, e.bricked), bestAltar: Math.max(l.bestAltar, altar), last: e.game },
    bestAltar: altar > l.bestAltar && altar >= 2,
  };
}

/**
 * What the state change adds to this browser's ledger: the game just over,
 * as its player (`me` online; `hotSeat`, the device's one player) played it.
 * Null for anything else: a game still on or already over before, race and
 * Delve, a spectator, a hot-seat game of several.
 */
export function ledgerEvent(prev: GameState | null, next: GameState, me: string | null, hotSeat = false): LedgerEntry | null {
  if (next.phase !== 'over' || prev?.phase === 'over' || !next.startedAt || next.delve || !vaalMode(next.settings)) return null;
  const self = hotSeat ? (next.players.length === 1 ? next.players[0] : null) : next.players.find((p) => p.id === me);
  if (!self) return null;
  const l = self.ledger ?? { held: 0, bricked: 0, altar: 0 };
  return { held: l.held, bricked: l.bricked, altar: l.altar, game: next.startedAt };
}

/** The stored ledger (empty when there is none or it can't be read; never written over for that). Read fresh: another tab may have added to it. */
export function loadLedger(): VaalLedger {
  return parseLedger(readStored(NAME)) ?? emptyLedger();
}

/**
 * Counts a game; returns the ledger and whether the game's Altar is a new
 * biggest, or null when it couldn't be stored (storage blocked or full, or a
 * newer build's ledger, left as it is). Anything else unreadable is kept
 * aside first.
 */
export function recordLedger(e: LedgerEntry): { rec: VaalLedger; bestAltar: boolean } | null {
  const raw = tryReadStored(NAME);
  if (raw === undefined) return null;
  const stored = parseLedger(raw);
  if (raw && !stored && !makeRoom(NAME, raw, VERSION)) return null;
  const was = stored ?? emptyLedger();
  const r = addGame(was, e);
  if (r.rec !== was && !writeStored(NAME, serializeLedger(r.rec))) return null;
  return r;
}

/** Erases the ledger, and any kept aside (erasing the codex erases this browser's records with it). */
export function resetLedger() {
  removeStored(NAME);
  clearAside(NAME);
}
