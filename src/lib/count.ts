// Visits and a few game events, counted by GoatCounter (counter.ts):
// no cookies, no IP addresses stored, nothing kept in the browser but the
// privacy page's opt-out, when it was asked for. Only the game's own page at
// poe2.quest counts; the beta, the dev server and the dev pages never do, nor
// a browser that asked not to be (countOptOut.ts: the privacy page's switch,
// or Global Privacy Control). datenschutz.html says what is sent, and vite.config.ts's
// CSP lets it through.
//
// Not GoatCounter's count.js: it sends the address's query too, and an
// invite link's carries the room's code. This sends only what's named here.

import { CHANNEL, type Channel } from './channel.ts';
import { nobodyStands, shownDepth, teamDepth } from './delve.ts';
import type { GameState } from './game.ts';
import { COUNTER_ORIGIN } from './counter.ts';
import { notCounted } from './countOptOut.ts';
import { SITE_URL } from './site.ts';

/** Whether a page counts: the live game's own page at its own address, no robot driving it. */
export function countsOn(at: { hostname: string; pathname: string }, channel: Channel, robot: boolean): boolean {
  const live = new URL(SITE_URL);
  return channel === 'live' && !robot && at.hostname === live.hostname && (at.pathname === live.pathname || at.pathname === `${live.pathname}index.html`);
}

/** Whether this page counts, settled as it loads (its address changes only in its query and hash after). */
export const counting = typeof location !== 'undefined' && typeof navigator !== 'undefined' && countsOn(location, CHANNEL, !!navigator.webdriver);

function beacon(url: string) {
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch {
    // (Falls back to an image below.)
  }
  new Image().src = url;
}

/** Whether the page has been seen yet: until it is, counts wait, so a tab opened in the background and closed unseen counts nothing. */
let seen = typeof document === 'undefined' || document.visibilityState === 'visible';
const waiting: string[] = [];
if (counting && !seen) {
  const look = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', look);
    seen = true;
    const held = waiting.splice(0);
    // Not if the privacy page was used to opt out while this page waited unseen.
    if (!notCounted()) for (const url of held) beacon(url);
  };
  document.addEventListener('visibilitychange', look);
}

function send(params: Record<string, string>) {
  // Asked each time: the privacy page can set it while this page waits in the back-forward cache.
  if (!counting || notCounted()) return;
  const url = `${COUNTER_ORIGIN}/count?${new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) })}`;
  if (seen) beacon(url);
  else waiting.push(url);
}

const sameSite = (referrer: string, here: string) => {
  try {
    return new URL(referrer).origin === new URL(here).origin;
  } catch {
    return false;
  }
};

/**
 * This page was reached from this site's own pages: a room in the address
 * then comes from the Open rooms list reloading into a newer host's room
 * (OpenRooms reloadInto, any build's), never from an invite link, which
 * comes from elsewhere. A reload keeps the referrer, a copied address loses it.
 */
export const cameFromThisSite = typeof document !== 'undefined' && sameSite(document.referrer, location.href);

/** This page was come back to rather than arrived at: reloaded, gone back or forward to, or reached from this site's own pages. What came with the arrival was counted then. */
const cameBack = () => {
  const type = (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  return type === 'reload' || type === 'back_forward' || cameFromThisSite;
};

/**
 * Where a visitor came from, as counted: another site's or app's name alone
 * (its path and query may name a private thread, a document, anything), none
 * for this site's own (an address here may carry a room's code) or none.
 */
export function referrerOf(referrer: string, here: string): string {
  if (sameSite(referrer, here)) return '';
  try {
    const from = new URL(referrer);
    // (An app's, android-app://com.reddit.frontpage/, has no origin of its own.)
    return from.origin === 'null' ? (from.host ? `${from.protocol}//${from.host}` : '') : from.origin;
  } catch {
    return '';
  }
}

/** A visit to the start page; not one come back to (cameBack). */
export function countVisit() {
  if (!counting || cameBack()) return;
  const r = referrerOf(document.referrer, location.href);
  send({ p: '/', t: document.title, ...(r ? { r } : {}) });
}

/**
 * An event: its name is the path GoatCounter lists it under. Each one counts
 * (`ns`, no session): GoatCounter would otherwise count a path once a visitor
 * in eight hours, five games in an evening as one. A visit keeps its session,
 * so visits still count people.
 */
export function countEvent(name: string) {
  send({ p: name, t: name, e: 'true', ns: 'true' });
}

const arrivals = new Set<string>();
/** An event that comes with arriving (a link opened): once a page load, not on coming back. */
export function countArrival(name: string) {
  if (arrivals.has(name) || !counting || cameBack()) return;
  arrivals.add(name);
  countEvent(name);
}

// ---- games -------------------------------------------------------------------

/** How many play ("5p"): Delve its entrants, other games their seats. */
function partySize(s: GameState): string {
  return `${Math.max(1, s.delve?.entrants.length ?? s.players.length)}p`;
}

/** A game's key: its mode, and on one device or online ("race-online", "turns-hotseat"). */
export const gameKey = (s: GameState, hotSeat: boolean) => `${s.settings.mode ?? 'turns'}-${hotSeat ? 'hotseat' : 'online'}`;

const playing = (s: GameState) => s.phase !== 'lobby' && s.phase !== 'over';

/** A game decided: over, or a Delve run nobody stands in any more (alone, as they perish; before anyone looks at the results). */
const decided = (s: GameState) => s.phase === 'over' || (s.phase !== 'lobby' && nobodyStands(s));

/** The event for a Delve run's end, by the ten depths it ended in, as players see them ("delve/depth-20-29"). */
export function delveEndEvent(depth: number): string {
  const from = Math.floor(Math.max(0, depth) / 10) * 10;
  return `delve/depth-${from}-${from + 9}`;
}

/**
 * What a state change counts, on the device that runs the game (the host, or
 * hot-seat): a game starting, from the lobby or the last one's end
 * ("play/race-online", with "size/race-online-3p" for how many play), and
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

/** gameEvents for one device's games, a Delve run's end counted once whatever becomes of who stands after. */
export class GameCounts {
  private ended: number | null = null;

  events(prev: GameState | null, next: GameState, hotSeat: boolean): string[] {
    const out = gameEvents(prev, next, hotSeat);
    const run = next.delve?.startedAt;
    if (run === undefined || !out.some((e) => e.startsWith('end/'))) return out;
    if (this.ended === run) return [];
    this.ended = run;
    return out;
  }
}

// ---- joining -----------------------------------------------------------------

/** Where a join started: a code typed, an invite link, the Open rooms list. Counted as tried ("join/…") and as let in ("joined/…"). */
export type JoinVia = 'code' | 'invite-link' | 'open-rooms';

/**
 * A failure counted ("error/…"): a room that couldn't be opened, or reached,
 * or that turned a join down (full, locked, a name: "join-refused"). A guest
 * removed, a room closed or a game moved to another tab isn't one: nothing
 * failed. Nor is a guest's link to its host going mid-game: from the guest's
 * side a host closing its tab, a host reloading and a network failing look
 * the same, so a count of them would mostly count hosts leaving.
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
  | 'join-refused';

export const countFailure = (failure: Failure) => countEvent(`error/${failure}`);
