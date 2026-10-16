// Visits and a few game events, counted by GoatCounter (counter.ts):
// no cookies, nothing kept in the browser, no IP addresses stored. Only the
// game's own page at poe2.quest counts; the beta, the dev server and the dev
// pages never do. datenschutz.html says what is sent, and vite.config.ts's
// CSP lets it through.
//
// Not GoatCounter's count.js: it sends the address's query too, and an
// invite link's carries the room's code. This sends only what's named here.

import { CHANNEL, type Channel } from './channel.ts';
import { livesOf, shownDepth, teamDepth } from './delve.ts';
import type { GameState } from './game.ts';
import { COUNTER_ORIGIN } from './counter.ts';
import { SITE_URL } from './site.ts';

/** Whether a page counts: the live game's own page at its own address, no robot driving it. */
export function countsOn(at: { hostname: string; pathname: string }, channel: Channel, robot: boolean): boolean {
  const live = new URL(SITE_URL);
  return channel === 'live' && !robot && at.hostname === live.hostname && (at.pathname === live.pathname || at.pathname === `${live.pathname}index.html`);
}

const counting = () => typeof location !== 'undefined' && typeof navigator !== 'undefined' && countsOn(location, CHANNEL, !!navigator.webdriver);

function send(params: Record<string, string>) {
  if (!counting()) return;
  const url = `${COUNTER_ORIGIN}/count?${new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) })}`;
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch {
    // (Falls back to an image below.)
  }
  new Image().src = url;
}

/** This page was reloaded rather than arrived at: what came with the arrival was counted then. */
const reloaded = () => (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload';

/**
 * Where a visitor came from, as counted: another site's address without its
 * query (a link elsewhere may carry anything), nothing for this site's own
 * (an address here may carry a room's code) or none.
 */
export function referrerOf(referrer: string, here: string): string {
  try {
    const from = new URL(referrer);
    return from.origin === new URL(here).origin ? '' : `${from.origin}${from.pathname}`;
  } catch {
    return '';
  }
}

/** A visit to the start page, once it is first seen (a tab opened in the background counts when it's looked at); not a reload. */
export function countVisit() {
  if (!counting() || reloaded()) return;
  const go = () => {
    const r = referrerOf(document.referrer, location.href);
    send({ p: '/', t: document.title, ...(r ? { r } : {}) });
  };
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

const arrivals = new Set<string>();
/** An event that comes with arriving (a link opened): once a page load, and not again on a reload. */
export function countArrival(name: string) {
  if (arrivals.has(name) || !counting() || reloaded()) return;
  arrivals.add(name);
  countEvent(name);
}

// ---- games -------------------------------------------------------------------

/** How many play, roughly: Delve its entrants, other games their seats. */
function partySize(s: GameState): string {
  const n = s.delve?.entrants.length ?? s.players.length;
  return n <= 2 ? `${Math.max(1, n)}p` : n <= 4 ? '3-4p' : n <= 8 ? '5-8p' : '9-12p';
}

/** A game's key: its mode, and on one device or online ("race-online", "turns-hotseat"). */
export const gameKey = (s: GameState, hotSeat: boolean) => `${s.settings.mode ?? 'turns'}-${hotSeat ? 'hotseat' : 'online'}`;

const playing = (s: GameState) => s.phase !== 'lobby' && s.phase !== 'over';

/** A game decided: over, or a Delve run where no entrant has a life left (alone, as they perish; before anyone looks at the results). */
const decided = (s: GameState) => s.phase === 'over' || (!!s.delve && s.phase !== 'lobby' && s.delve.entrants.every((id) => livesOf(s, id) === 0));

/** The event for a Delve run's end, by the ten depths it ended in, as players see them ("delve/depth-20-29"). */
export function delveEndEvent(shownDepth: number): string {
  const from = Math.floor(Math.max(0, shownDepth) / 10) * 10;
  return `delve/depth-${from}-${from + 9}`;
}

/**
 * What a state change counts, on the device that runs the game (the host, or
 * hot-seat): a game starting, from the lobby or the last one's end
 * ("play/race-online", with "size/race-online-3-4p" for how many play), and
 * a game decided ("end/race-online", a Delve run with its depths). The two
 * keys side by side say how many games are left unfinished. Nothing for a
 * game picked up after a reload (no `prev`): what it had reached was counted
 * before.
 */
export function gameEvents(prev: GameState | null, next: GameState, hotSeat: boolean): string[] {
  if (!prev) return [];
  const key = gameKey(next, hotSeat);
  if (!playing(prev) && playing(next)) return [`play/${key}`, `size/${key}-${partySize(next)}`];
  if (!decided(next) || (decided(prev) && prev.delve?.startedAt === next.delve?.startedAt)) return [];
  return next.delve ? [`end/${key}`, delveEndEvent(shownDepth(teamDepth(next)))] : [`end/${key}`];
}

// ---- joining -----------------------------------------------------------------

/** In the address of a page the Open rooms list reloads into a newer host's room: that join started in the list, not at an invite link. */
export const LISTED_PARAM = 'listed';

/** Where a join started: a code typed, an invite link, the Open rooms list. Counted as tried ("join/…") and as let in ("joined/…"). */
export type JoinVia = 'code' | 'invite-link' | 'open-rooms';

/**
 * A failure counted ("error/…"): a room that couldn't be opened or reached,
 * or a guest's link to its host lost. A guest removed, a room closed or a
 * game moved to another tab isn't one: nothing failed.
 */
export type Failure =
  | 'host-no-connection'
  | 'host-room-not-opened'
  | 'host-room-not-reopened'
  | 'join-no-connection'
  | 'join-no-answer'
  | 'join-no-such-room'
  | 'join-turned-away'
  | 'join-version-mismatch'
  | 'connection-lost'
  | 'reconnect-gave-up';

export const countFailure = (failure: Failure) => countEvent(`error/${failure}`);
