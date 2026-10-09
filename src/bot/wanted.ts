// When the room bot opens a room, from what the open-room list shows: there
// should always be a room to join, but never one that competes with the
// rooms people open themselves.
//
// Our rooms are numbered 1, 2, 3 and on, as many as it takes:
// - Room 1 opens when no room is listed at all.
// - Each one after opens when every room listed is mid-game (or full or
//   locked): people can only watch, so newcomers get a room to play in.
// - Any of them, alone in its lobby, makes way when another room can be
//   joined: someone's own room, or one of our rooms numbered lower back in
//   its lobby. Never for one numbered higher, so when several wait empty
//   the higher ones go and room 1 stays.

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

/** Whether this room should open, given the other rooms listed. */
export function wanted(role: Role, others: RoomInfo[]): boolean {
  return role === 1 ? others.length === 0 : !others.some(joinable);
}

/** Whether this room, nobody in it, should close for the other rooms listed. */
export const makesWay = (others: RoomInfo[]) => others.some(joinable);
