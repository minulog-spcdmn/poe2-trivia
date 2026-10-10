// What a public room says about itself in the room list, and the checks on
// what others say (listings come from strangers). Apart from rooms.ts, which
// needs PeerJS, so tests can reach it.

import { isDifficulty, type Difficulty, type GameMode, type Phase } from './game.ts';
import { cleanName } from './names.ts';
import { PROTOCOL_VERSION } from './protocol.ts';
import { DIFFICULTY_NAMES } from './difficultyText.ts';
import { shownDepth } from './delve.ts';

export interface RoomInfo {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  spectators: number;
  maxSpectators: number;
  mode: GameMode;
  difficulty: Difficulty;
  target: number;
  phase: Phase | 'locked';
  /** Delve: the depth of the run under way. */
  depth?: number;
  /** The host's PROTOCOL_VERSION (missing from hosts before 10). */
  v?: number;
}

const PHASES = ['lobby', 'locked', 'choosing', 'question', 'reveal', 'over'];
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * The listing as it goes out. A Delve room says it plays turns, with a flag
 * on top, so scanners from before Delve still list it (as turns) instead of
 * dropping it, which would end their scan early.
 */
export function wireRoomInfo(info: RoomInfo): Record<string, unknown> {
  const { mode, ...rest } = info;
  return { ...rest, mode: mode === 'delve' ? 'turns' : mode, ...(mode === 'delve' ? { delve: true } : {}), v: PROTOCOL_VERSION };
}

/** Listings come from strangers: accept only well-formed ones. */
export function parseRoomInfo(raw: unknown): RoomInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const host = cleanName(r.host);
  if (typeof r.code !== 'string' || !CODE.test(r.code) || !host) return null;
  if (!int(r.players, 0, 64) || !int(r.maxPlayers, 1, 64) || !int(r.target, 1, 50)) return null;
  if (!int(r.spectators, 0, 64) || !int(r.maxSpectators, 0, 64)) return null;
  if (r.mode !== 'turns' && r.mode !== 'race' && r.mode !== 'delve') return null;
  if (!isDifficulty(r.difficulty)) return null;
  if (typeof r.phase !== 'string' || !PHASES.includes(r.phase)) return null;
  const delve = r.delve === true || r.mode === 'delve';
  return {
    code: r.code,
    host,
    players: r.players,
    maxPlayers: r.maxPlayers,
    spectators: r.spectators,
    maxSpectators: r.maxSpectators,
    mode: delve ? 'delve' : r.mode,
    difficulty: r.difficulty as Difficulty,
    target: r.target,
    phase: r.phase as RoomInfo['phase'],
    // Extras that don't check out are dropped; the room is still listed.
    ...(delve && int(r.depth, 1, 9999) ? { depth: r.depth } : {}),
    ...(int(r.v, 0, 1e6) ? { v: r.v } : {}),
  };
}

const MODE_NAMES = { turns: 'Turns', race: 'Race', delve: 'Delve' } as const;

/**
 * A listed room's line under its host: "Turns · Cruel · 3/12" while it
 * gathers, "Turns · in a game · 4/12" once it plays, and for a Delve run
 * under way the depth it has reached ("Delve · depth 14 · 4/12"). A locked
 * room may be either (the listing only says it is locked), so it gives its
 * settings and claims neither.
 */
export function roomMeta(r: RoomInfo): string {
  const gathering = r.phase === 'lobby' || r.phase === 'locked';
  let how: string | null;
  if (r.mode === 'delve' && r.depth && r.phase !== 'lobby') {
    // A finished run that never left the entrance still reads as its depth, not as one waiting there.
    how = shownDepth(r.depth) > 0 || r.phase === 'over' ? `depth ${Math.max(0, shownDepth(r.depth))}` : 'at the entrance';
  } else if (gathering) how = r.mode === 'delve' ? null : DIFFICULTY_NAMES[r.difficulty];
  else how = 'in a game';
  return [MODE_NAMES[r.mode], how, `${r.players}/${r.maxPlayers}`].filter(Boolean).join(' · ');
}
