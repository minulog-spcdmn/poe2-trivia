// A tab open since an earlier day asks Today's unique from the rows it
// loaded with. A deal that went live since may have changed today's: a
// release's items come to Today's unique from the day after their refresh
// (lib/daily.ts dealFrom), and a tab from before it doesn't even know them.
// So once its day has turned, the tab looks at the live site's rows (beside
// the page, vite.config.ts dailyRowsFile), and if today's isn't its own, it
// loads again: out of sight (the tab hidden), as it comes back into sight
// (before anything is tapped: a phone looks only then, its timers asleep in
// the background), or in place of an answer to the old question
// (DailyUnique.svelte holds a pick until the look is done: rowsChecked),
// never in a room or a game.

import { utcDay } from './daily.ts';
import { dailyRow } from './dailyRows.ts';
import { LIVE_ROWS } from './liveRows.ts';
import { readStored, removeStored, writeStored } from './storage.ts';

/** How long a look waits for the rows before it lets the tab's own stand. */
const LOOK_MS = 8000;
/** The day this tab last loaded again for (this tab only), so a page served stale again can't load over and over. */
const RELOADED = 'staleRows.reloaded';
/** Set as the tab loads again out of sight, for the load to come to find (reloadedUnseen). */
const UNSEEN = 'staleRows.unseen';

/** Whether this page load is the tab loading again out of sight (asked once a load): nobody is there, so it counts as no visit (main.ts). */
export function reloadedUnseen(): boolean {
  const was = readStored(UNSEEN, 'session') !== null;
  if (was) removeStored(UNSEEN, 'session');
  return was;
}

/** `day`'s row in the rows' file (its text), as the file writes it, or null for a day it has none of, or a file that can't be read. */
export function liveRow(text: string, day: number): string | null {
  try {
    const { from, days } = JSON.parse(text) as { from?: unknown; days?: unknown };
    if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !Array.isArray(days)) return null;
    const row: unknown = days[day - utcDay(Date.parse(`${from}T00:00:00Z`))];
    return row && typeof row === 'object' && typeof (row as { itemId?: unknown }).itemId === 'string' ? JSON.stringify(row) : null;
  } catch {
    return null;
  }
}

/** The watching tab's check (rowsChecked); null while none watches. */
let checked: ((day: number, wait: number) => Promise<boolean> | null) | null = null;

/**
 * Whether today's question as this tab has it may be answered: true when it
 * is the live site's (or that can't be told, or the tab can't load again:
 * then the answer stands, to the question the player sees), false when it
 * isn't, the tab loading again now. Null when there is nothing to wait
 * for: the day the tab loaded on, or a page that doesn't watch (the QA
 * desk, a test). Within `wait` ms: a look that takes longer lets the answer
 * stand, and loads nothing over it when it comes.
 */
export function rowsChecked(day: number, wait = LOOK_MS): Promise<boolean> | null {
  return checked?.(day, wait) ?? null;
}

/**
 * Watches for today's row going stale (see above). `idle`: whether nothing
 * is going on (no room, no game), so the tab may load again. `now`: the
 * day's clock, the one Today's unique asks by. `page`: how the rows are
 * fetched, the page loaded again and a look put off (a test's stand-ins).
 */
export function watchRows(
  idle: () => boolean,
  now: () => number,
  {
    rows = (signal: AbortSignal) => fetch(`${import.meta.env.BASE_URL}${LIVE_ROWS}`, { cache: 'no-cache', signal }),
    reload = () => location.reload(),
    later = (f: () => void, ms: number) => void setTimeout(f, ms),
  }: { rows?: (signal: AbortSignal) => Promise<Response>; reload?: () => void; later?: (f: () => void, ms: number) => void } = {},
) {
  /** The day the tab loaded on: the earliest the clock has said (a device's clock ahead says the next day until the site's time comes). */
  let loadedOn = utcDay(now());
  const today = () => {
    const day = utcDay(now());
    if (day < loadedOn) loadedOn = day;
    return day;
  };
  /** Each day's look, once it has an answer (one that couldn't be had is asked again next time). */
  const looks = new Map<number, Promise<boolean>>();
  let stale = false;
  let reloading = false;
  /** Loads again if today's row is stale and nothing is going on (`unseen`: only with the tab out of sight); whether it does. */
  const reloadIfIdle = (unseen: boolean): boolean => {
    if (reloading) return true;
    if (!stale || !idle() || (unseen && document.visibilityState === 'visible')) return false;
    const day = String(utcDay(now()));
    // (Nor where it can't note that it has: a tab whose storage is blocked or full never loads again by itself.)
    if (readStored(RELOADED, 'session') === day || !writeStored(RELOADED, day, 'session')) return false;
    if (document.visibilityState === 'hidden') writeStored(UNSEEN, '1', 'session');
    reloading = true;
    reload();
    return true;
  };
  const look = (day: number): Promise<boolean> => {
    let had = looks.get(day);
    if (!had) {
      had = (async () => {
        const stop = new AbortController();
        const timer = setTimeout(() => stop.abort(), LOOK_MS);
        try {
          const res = await rows(stop.signal);
          // (No file there, as on the dev server: nothing to look at. Another failure is asked again.)
          if (res.status === 404) return true;
          if (!res.ok) throw new Error(String(res.status));
          const live = liveRow(await res.text(), day);
          const own = dailyRow(day);
          if (live && live !== (own && JSON.stringify(own))) stale = true;
          return !stale;
        } catch {
          // (Offline, slow or the site's down: the rows the tab has stand, and the next look asks again.)
          looks.delete(day);
          return true;
        } finally {
          clearTimeout(timer);
        }
      })();
      looks.set(day, had);
    }
    return had;
  };
  checked = (day, wait) => {
    today();
    if (day <= loadedOn) return null;
    // An answer to the old question: the tab loads again in its place (else, or once the wait is over, the answer stands).
    let over = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      look(day)
        .then((ok) => ok || over || !reloadIfIdle(false))
        .finally(() => clearTimeout(timer)),
      new Promise<boolean>((done) => (timer = setTimeout(() => done((over = true)), wait))),
    ]);
  };
  /** Looks once the day has turned, and loads again if stale: out of sight, or (`back`) as the tab comes back into sight. */
  const tick = (back = false) => {
    const day = today();
    if (day > loadedOn) void look(day).then(() => reloadIfIdle(!back));
  };
  // At each minute's turn (the day's among them; seldom in the background, and not at all while a phone sleeps), and on coming back or going.
  const minute = () => {
    tick();
    later(minute, 60_000 - (now() % 60_000) + 50);
  };
  later(minute, 60_000 - (now() % 60_000) + 50);
  document.addEventListener('visibilitychange', () => tick(document.visibilityState === 'visible'));
}
