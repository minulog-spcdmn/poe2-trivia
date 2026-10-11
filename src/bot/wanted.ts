// When the room bot opens a room, from what the open-room list shows: there
// should always be a room to join, but never one that competes with the
// rooms people open themselves.
//
// Our rooms are numbered 1, 2, 3 and on, as many as it takes:
// - Room 1 opens when no room is listed at all.
// - Each one after opens when no room is looking for players: every room
//   listed is mid-game (or full or locked), or one of our own lobbies that
//   already has company. So people can only watch, or our players crowd one
//   lobby, and newcomers get a room of their own. A lobby of someone else's
//   always counts as looking, however busy: never a room to compete with it.
// - Any of them, alone in its lobby, makes way for another room looking for
//   players: someone's own room, or one of our rooms numbered lower. Never
//   for one numbered higher, so when several wait empty the higher ones go
//   and room 1 stays.

import { PROTOCOL_VERSION } from '../lib/protocol.ts';
import type { RoomInfo } from '../lib/roomInfo.ts';

/** Which of our rooms it is: 1, 2, 3 and on. */
export type Role = number;

/** The room a seat could open, with `taken` held by other seats and at most `rooms` at once (Infinity: no limit): the lowest number free, or none. */
export function nextRole(taken: readonly Role[], rooms = Infinity): Role | null {
  let role = 1;
  while (taken.includes(role)) role++;
  return role <= rooms ? role : null;
}

/** A room someone arriving could play in now (on this version: the list greys out the others, OpenRooms.svelte). */
export const joinable = (r: RoomInfo) => r.phase === 'lobby' && r.players < r.maxPlayers && (r.v ?? 0) === PROTOCOL_VERSION;

/** Why a room listed can't be joined now (null: it can): for the log, when a guest finds nothing to join. */
export function notJoinable(r: RoomInfo): string | null {
  if ((r.v ?? 0) !== PROTOCOL_VERSION) return `on protocol ${r.v ?? 'unknown'}, the bot is on ${PROTOCOL_VERSION} (run the bot from a checkout of the same version)`;
  if (r.phase === 'locked') return 'locked';
  if (r.phase !== 'lobby') return 'mid-game';
  if (r.players >= r.maxPlayers) return 'full';
  return null;
}

/** Someone's own room (not one of `ours`) with its host waiting alone in the lobby: the bot's players go to it first and soonest. */
export const waitingAlone = (r: RoomInfo, ours: ReadonlySet<string>) => joinable(r) && !ours.has(r.code) && r.players === 1;

/** Players (the host counted) that make one of our lobbies busy enough for another room to open. */
export const COMPANY = 3;

/** A room still looking for players: joinable, and (one of `ours`, our own rooms' codes) without company yet. */
export const looking = (r: RoomInfo, ours: ReadonlySet<string>) => joinable(r) && (!ours.has(r.code) || r.players < COMPANY);

/** Whether this room should open, given the other rooms listed (`ours`: which are our own). */
export function wanted(role: Role, others: RoomInfo[], ours: ReadonlySet<string> = new Set()): boolean {
  return role === 1 ? others.length === 0 : !others.some((r) => looking(r, ours));
}

/** Whether this room, nobody in it, should close for the other rooms listed (`ours`: which are our own). */
export const makesWay = (others: RoomInfo[], ours: ReadonlySet<string> = new Set()) => others.some((r) => looking(r, ours));
