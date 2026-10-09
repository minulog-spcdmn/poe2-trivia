// When the room bot opens a room, from what the open-room list shows: there
// should always be a room to join, but never one that competes with the
// rooms people open themselves.
//
// - The first room opens when no room is listed at all.
// - The second opens when every room listed is mid-game (or full or locked):
//   people can only watch, so newcomers get a room to play in.
// - Either one, alone in its lobby, makes way when another room can be
//   joined: someone's own room, or the other bot's back in its lobby.

import type { RoomInfo } from '../lib/roomInfo.ts';

export type Role = 'first' | 'second';

/** A room someone arriving could play in now. */
export const joinable = (r: RoomInfo) => r.phase === 'lobby' && r.players < r.maxPlayers;

/** Whether this room should open, given the other rooms listed. */
export function wanted(role: Role, others: RoomInfo[]): boolean {
  return role === 'first' ? others.length === 0 : !others.some(joinable);
}

/** Whether this room, nobody in it, should close for the other rooms listed. */
export const makesWay = (others: RoomInfo[]) => others.some(joinable);
