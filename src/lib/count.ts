// Visits and a few game events, counted by GoatCounter (poe2quest.goatcounter.com):
// no cookies, nothing kept in the browser, no IP addresses stored. Only the
// game's own page at poe2.quest counts; the beta, the dev server and the dev
// pages never do. datenschutz.html says what is sent.
//
// Not GoatCounter's count.js: it sends the address's query too, and an
// invite link's carries the room's code. This sends only what's named here.

import { CHANNEL } from './channel.ts';
import type { GameState } from './game.ts';

const ENDPOINT = 'https://poe2quest.goatcounter.com/count';

/** Whether this page counts: the live game at poe2.quest, no robot driving it. */
function counting(): boolean {
  if (CHANNEL !== 'live' || typeof location === 'undefined' || typeof navigator === 'undefined') return false;
  if (location.hostname !== 'poe2.quest' || (location.pathname !== '/' && location.pathname !== '/index.html')) return false;
  return !navigator.webdriver;
}

function send(params: Record<string, string>) {
  if (!counting()) return;
  const url = `${ENDPOINT}?${new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) })}`;
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch {
    // (Falls back to an image below.)
  }
  new Image().src = url;
}

/** A visit to the start page, once it is first seen (a tab opened in the background counts when it's looked at). */
export function countVisit() {
  if (!counting()) return;
  const go = () => send({ p: '/', t: document.title, r: document.referrer });
  if (document.visibilityState === 'visible') return go();
  const seen = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', seen);
    go();
  };
  document.addEventListener('visibilitychange', seen);
}

/** An event: its name is the path GoatCounter lists it under. */
export function countEvent(name: string) {
  send({ p: name, t: name, e: 'true' });
}

/** How many play, roughly: Delve its entrants, other games their seats. */
function partySize(s: GameState): string {
  const n = s.delve?.entrants.length ?? s.players.length;
  return n <= 2 ? `${Math.max(1, n)}p` : n <= 4 ? '3-4p' : n <= 8 ? '5-8p' : '9-12p';
}

/**
 * A game's key: its mode, on one device or online, and how many play
 * ("race-online-3-4p", "delve-online-1p", "turns-hotseat-2p"). Counted once
 * a game, by the device that runs it, as it starts ("play/…") and as it
 * ends ("end/…", under the key it started with): the two side by side say
 * how many games are left unfinished.
 */
export function gameKey(s: GameState, hotSeat: boolean): string {
  return `${s.settings.mode ?? 'turns'}-${hotSeat ? 'hotseat' : 'online'}-${partySize(s)}`;
}

/** Where a join started: a code typed, an invite link, the Open rooms list. Counted as tried ("join/…") and as let in ("joined/…"). */
export type JoinVia = 'code' | 'invite-link' | 'open-rooms';

/**
 * The failures counted ("error/no-answer", …), by the title their notice
 * shows: a room that can't be reached or opened. Not a guest removed, a room
 * closed, a game moved to another tab or a code mistyped: nothing failed.
 */
const FAILURES: Record<string, string> = {
  'No connection': 'no-connection',
  'No answer': 'no-answer',
  'No such room': 'no-such-room',
  "Couldn't join": 'turned-away',
  'Room not opened': 'room-not-opened',
  'Room not reopened': 'room-not-reopened',
};
export const failureEvent = (title: string | undefined): string | null => (title && FAILURES[title] ? `error/${FAILURES[title]}` : null);

/** The event for a Delve run's end, by the ten depths it ended in, as players see them ("delve/depth-20-29"). */
export function delveEndEvent(shownDepth: number): string {
  const from = Math.floor(Math.max(0, shownDepth) / 10) * 10;
  return `delve/depth-${from}-${from + 9}`;
}
