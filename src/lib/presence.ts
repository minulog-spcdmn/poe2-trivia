// Who in the room is really there: each device says whether its game is on
// screen and in use (here), on screen but untouched for a while (idle), or
// behind another tab or app, or a screen gone dark (away). The host adds
// what it sees of each guest's link (slow), and tells everyone how each
// player stands, so the lobby can show who is ready before the game begins.

/** How this device's player is, by their own device. */
export type Presence = 'here' | 'idle' | 'away';

/** How a player stands, as the room is told (slow: lagging): missing when all is well. */
export type Standing = 'away' | 'idle' | 'slow';

/** Untouched this long (no pointer, key or touch), a player on screen is idle. */
export const IDLE_AFTER_MS = 120_000;
/** Gone from the screen this long, a player shows as away (a quick look at another tab doesn't count). */
export const AWAY_AFTER_MS = 2500;
/**
 * A guest's round trip to the host (its smoothed ping) above this is a slow
 * link, and stays one until it is back under SLOW_CLEAR_MS. Well above a
 * long way round the world (a few hundred ms): a ping is answered on the
 * page's main thread, so a busy device adds to it too.
 */
export const SLOW_RTT_MS = 800;
export const SLOW_CLEAR_MS = 500;
/** No answer to the host's pings for this long (they go every 3 s): the link is struggling. */
export const LATE_PONG_MS = 7000;

/** A player's presence and since when (ms, any clock). */
export interface Seen {
  presence: Presence;
  since: number;
}

/** How a player stands, from their presence and their link (`slow`: the host's own judgement, never for itself). */
export function standingOf(seen: Seen, slow: boolean, now: number): Standing | null {
  if (seen.presence === 'away' && now - seen.since >= AWAY_AFTER_MS) return 'away';
  if (seen.presence === 'idle') return 'idle';
  return slow ? 'slow' : null;
}

/** Whether a guest's link is slow now, given whether it was (hysteresis, so it doesn't flicker), its round trip and how long since its last pong. */
export function slowLink(was: boolean, rtt: number, sincePong: number): boolean {
  if (sincePong > LATE_PONG_MS) return true;
  return rtt > (was ? SLOW_CLEAR_MS : SLOW_RTT_MS);
}

/** What each standing says on a player's chip, and when pointed at. */
export const STANDING_TEXT: Record<Standing, { tag: string; title: string }> = {
  away: { tag: 'Away', title: "The game isn't on their screen: another tab or app, or the screen is off." },
  idle: { tag: 'Idle', title: 'No sign of them for a couple of minutes.' },
  slow: { tag: 'Lagging', title: 'Their game is slow to answer the host (a slow connection, or a busy device), so the art may reach them late.' },
};

/** A standing that means the player isn't ready to play (one lagging is still there, only late). */
export const notReady = (s: Standing | null | undefined) => s === 'away' || s === 'idle';

/** Names joined for a sentence: "Ana", "Ana and Bo", "Ana, Bo and 2 more". */
export function namesList(names: string[], most = 2): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= most) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, most).join(', ')} and ${names.length - most} more`;
}

// ---- this device ------------------------------------------------------

const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
/** How often this device checks whether it has gone idle. */
const CHECK_MS = 5000;

let lastInput = 0;
let presence: Presence = 'here';
let since = 0;
const listeners = new Set<(p: Presence) => void>();
let started = false;

function now() {
  return Date.now();
}

function current(): Presence {
  if (document.visibilityState === 'hidden') return 'away';
  return now() - lastInput >= IDLE_AFTER_MS ? 'idle' : 'here';
}

function update() {
  const p = current();
  if (p === presence) return;
  presence = p;
  since = now();
  for (const f of listeners) f(p);
}

function start() {
  started = true;
  lastInput = since = now();
  presence = current();
  for (const type of INPUTS) addEventListener(type, noteInput, { passive: true, capture: true });
  document.addEventListener('visibilitychange', update);
  setInterval(update, CHECK_MS);
}

/** The player did something (the room bot's hand counts too: it moves without the page's events). */
export function noteInput() {
  lastInput = now();
  if (presence === 'idle') update();
}

/** This device's presence and since when (Date.now() ms). Watches for it from the first call on. */
export function ownPresence(): Seen {
  if (!started) start();
  return { presence, since };
}

/** Calls `f` whenever this device's presence changes. Returns a function that stops it. */
export function watchPresence(f: (p: Presence) => void): () => void {
  if (!started) start();
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}
