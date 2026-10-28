// Visits and a few game events, counted by GoatCounter (counter.ts):
// no cookies, no IP addresses stored, and nothing kept in the browser but
// its opt-out (countOptOut.ts), set only on asking: on the privacy page, or
// by opening poe2.quest/#toggle-goatcounter. Nothing counts from a browser
// that opted out or sends Global Privacy Control. Only the game's own page
// at poe2.quest counts; the beta, the dev server and the dev pages never do.
// datenschutz.html says what is sent, and vite.config.ts's CSP lets it
// through.
//
// Not GoatCounter's count.js: it sends the address's query too, and an
// invite link's carries the room's code. This sends only what's named here.
// So count.js's #toggle-goatcounter means nothing to GoatCounter here;
// onCountToggle below reads it instead.

import { CHANNEL, type Channel } from './channel.ts';
import { nobodyStands, shownDepth, teamDepth } from './delve.ts';
import type { GameState } from './game.ts';
import { COUNTER_ORIGIN } from './counter.ts';
import { isoWeek } from './isoWeek.ts';
import { countOptedOut, notCounted, privacySignal, setCountOptedOut } from './countOptOut.ts';
import { SITE_URL } from './site.ts';

/** Whether a page counts: the live game's own page at its own address, no robot driving it. */
export function countsOn(at: { hostname: string; pathname: string }, channel: Channel, robot: boolean): boolean {
  const live = new URL(SITE_URL);
  return channel === 'live' && !robot && at.hostname === live.hostname && (at.pathname === live.pathname || at.pathname === `${live.pathname}index.html`);
}

/** The address's hash that switches counting this browser off, or back on (GoatCounter's own, as count.js reads it; without the dash too). */
export const isToggleHash = (hash: string) => /^#toggle-?goatcounter$/i.test(hash);

/** Where the opt-out is kept: whether it's set, and setting it, true when it held. */
export interface SkipStore {
  skipped(): boolean;
  set(skip: boolean): boolean;
}

/** The browser's opt-out (countOptOut.ts): the one the privacy page's switch sets too. */
const browserSkip: SkipStore = { skipped: countOptedOut, set: setCountOptedOut };

/** What a toggle came to: counted no longer, counted again, or nothing changed as the browser can't keep it. */
export type Toggled = 'skipped' | 'counted' | 'unsaved';

/** Flips the opt-out; what it came to. */
export function flipSkip(store: SkipStore): Toggled {
  const skip = !store.skipped();
  return store.set(skip) ? (skip ? 'skipped' : 'counted') : 'unsaved';
}

/** The page counts where it is: the live game's own page, no robot. Settled as it loads (its address changes only in its query and hash after). */
const countsHere = typeof location !== 'undefined' && typeof navigator !== 'undefined' && countsOn(location, CHANNEL, !!navigator.webdriver);

/** Whether this page counts: where it counts, in a browser that hasn't opted out or sent Global Privacy Control. A toggle changes it. */
export let counting = countsHere && !browserSkip.skipped() && !privacySignal();

/** Takes a toggle hash from the address, if there is one where it means something, and flips the opt-out. */
function takeToggle(): Toggled | null {
  if (!countsHere || !isToggleHash(location.hash)) return null;
  history.replaceState(history.state, '', location.pathname + location.search);
  const out = flipSkip(browserSkip);
  counting = !browserSkip.skipped() && !privacySignal();
  return out;
}

/** A toggle in the address the page opened with: taken at once, before anything counts, and that load counts nothing either way. */
const toggledOnLoad = takeToggle();

/**
 * poe2.quest/#toggle-goatcounter: this browser stops being counted, or
 * starts again, for good, opened with it or typed after the address of a
 * page already open. The hash goes from the address after, so a reload
 * doesn't switch it back. `say` is told what each came to.
 */
export function onCountToggle(say: (t: Toggled) => void) {
  if (toggledOnLoad) say(toggledOnLoad);
  if (!countsHere) return;
  addEventListener('hashchange', () => {
    const t = takeToggle();
    if (t) say(t);
  });
}

function beacon(url: string) {
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch {
    // (Falls back to an image below.)
  }
  new Image().src = url;
}

/**
 * GoatCounter takes at most four counts a second from one address, and turns
 * the rest away unseen (a beacon never hears). So counts go out one at a
 * time, GAP_MS apart, the first after a random wait (JITTER_MS): a game's
 * start sends several at once, on every device at one router at the same
 * moment. The visit goes at once. What waits goes all at once as the page
 * is left: better a few turned away than all of them lost. A newcomer's
 * first steps (HEAD_STEPS) wait at the head, behind the visit, so one who
 * leaves within a second of pressing New game is still counted.
 */
const GAP_MS = 600;
const JITTER_MS = 2_000;
const queue: string[] = [];
/** How many at the queue's front went to its head (release `head`), so the next one waits behind them, not ahead. */
let atHead = 0;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
function drain() {
  drainTimer = null;
  const url = queue.shift();
  if (atHead) atHead--;
  // Not if the privacy page was used to opt out meanwhile.
  if (url && !notCounted()) beacon(url);
  if (queue.length) drainTimer = setTimeout(drain, GAP_MS);
}
function release(url: string, now: boolean, head = false) {
  if (now && !queue.length && !drainTimer) return beacon(url);
  if (now) {
    queue.unshift(url);
    atHead++;
  } else if (head) queue.splice(atHead++, 0, url);
  else queue.push(url);
  drainTimer ??= setTimeout(drain, Math.random() * JITTER_MS);
}
// (Where it counts at all, not only where it counts on loading: #toggle-goatcounter can switch counting on later.)
if (countsHere && typeof addEventListener !== 'undefined')
  addEventListener('pagehide', () => {
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = null;
    atHead = 0;
    const left = queue.splice(0);
    if (!notCounted()) for (const url of left) beacon(url);
  });

/** Whether the page has been seen yet: until it is, counts wait, so a tab opened in the background and closed unseen counts nothing. */
let seen = typeof document === 'undefined' || document.visibilityState === 'visible';
const waiting: { url: string; now: boolean; head: boolean }[] = [];
if (countsHere && !seen) {
  const look = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', look);
    seen = true;
    const held = waiting.splice(0);
    // Not if the privacy page was used to opt out while this page waited unseen.
    if (!notCounted()) for (const w of held) release(w.url, w.now, w.head);
  };
  document.addEventListener('visibilitychange', look);
}

/** Sends a count: in turn (release), or `now`, the visit, ahead of the rest, or at the `head`, behind the visit. */
function send(params: Record<string, string>, now = false, head = false) {
  // Asked each time: the privacy page can set it while this page waits in the back-forward cache.
  // (Nor the load that switched counting: it counts nothing either way.)
  if (!counting || toggledOnLoad || notCounted()) return;
  const url = `${COUNTER_ORIGIN}/count?${new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) })}`;
  if (seen) release(url, now, head);
  else waiting.push({ url, now, head });
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

/** What the game's save says (this device's and its paired devices'), as a visit is counted with it (lib/lastPlayed.ts): when it first and last had a question answered, null for no save. */
export interface Played {
  first: number;
  last: number;
}

/** GoatCounter's visit: a visitor's counts within eight hours of the last are one visit's. */
const VISIT_MS = 8 * 3_600_000;

/**
 * How long ago the player last played (this device or a paired one), as a visit is marked
 * ("visit/back-7d"); "visit/new" for no save. None (null) within VISIT_MS:
 * GoatCounter is still in the visit that played, which was marked then.
 */
export function recencyEvent(played: Played | null, now: number): string | null {
  if (!played) return 'visit/new';
  const ago = Math.max(0, now - played.last);
  if (ago < VISIT_MS) return null;
  const days = ago / 86_400_000;
  return days <= 1 ? 'visit/back-1d' : days <= 7 ? 'visit/back-7d' : days <= 30 ? 'visit/back-30d' : 'visit/back-later';
}

/** The week this device first played in ("cohort/2026-W43"), so the visitors of each week can be followed; none for no save. */
export const cohortEvent = (played: Played | null) => (played ? `cohort/${isoWeek(played.first)}` : null);

/**
 * What a visit is marked with from the save: its recency (recencyEvent) and,
 * only beside a "visit/back-…", its cohort. A page opened again within
 * VISIT_MS of the last play marks neither: until 2026-10-28 it still sent
 * its cohort, so a week's cohort counted more than its visits back.
 */
export function visitMarks(played: Played | null, now: number): string[] {
  // ("visit/new" is a save's absence, which has no cohort.)
  const back = recencyEvent(played, now);
  const cohort = cohortEvent(played);
  return !back ? [] : cohort ? [back, cohort] : [back];
}

/** The tag of a link made to be counted apart (poe2.quest/?ref=reddit-oct), sent as its campaign; null for none or one that isn't a plain short word. */
export function campaignOf(search: string): string | null {
  const tag = new URLSearchParams(search).get('ref');
  return tag && /^[\w-]{1,40}$/.test(tag) ? tag : null;
}

/**
 * A tagged link's tag, taken out of the address whether or not anything
 * counts: a bookmark or a copied address would file every later visit under
 * it. Read once, before the page reads its address for anything else.
 */
export function takeCampaign(): string | null {
  if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('ref')) return null;
  const tag = campaignOf(location.search);
  const url = new URL(location.href);
  url.searchParams.delete('ref');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return tag;
}

/**
 * Opened as the app on a home screen, not in a browser's tab: iOS says so,
 * Android's opens fullscreen (the manifest's display). A desktop browser in
 * F11 is fullscreen too, so that counts on a phone or tablet only.
 */
export function openedAsApp(e: { standalone?: boolean; userAgent: string; matches: (q: string) => boolean }): boolean {
  if (e.standalone === true || e.matches('(display-mode: standalone)')) return true;
  return e.matches('(display-mode: fullscreen)') && /Android|iPhone|iPad|iPod|Mobile/.test(e.userAgent);
}
const asApp = () =>
  typeof matchMedia !== 'undefined' &&
  openedAsApp({ standalone: (navigator as { standalone?: boolean }).standalone, userAgent: navigator.userAgent, matches: (q) => matchMedia(q).matches });

/** The save as this page found it, read once (`save`, given with the visit), before anything played here writes to it. */
let readPlayed: (() => Played | null) | null = null;
let played: Played | null | undefined;
const playedHere = () => (played === undefined && readPlayed ? (played = readPlayed()) : played) ?? null;
/** A first visit (firstVisit: no save, or one begun within it): its steps are a newcomer's too ("new/played"). */
let newcomer = false;
/**
 * Whether the save says this is still the player's first visit: none, or one
 * first played within VISIT_MS (GoatCounter's same visit), so a newcomer who
 * played and then reloaded is still one.
 */
const firstVisit = (p: Played | null, now: number) => !p || now - p.first < VISIT_MS;

/**
 * A visit to the start page; not one come back to (cameBack). Then, once a
 * visitor like the steps (countReach) and in an idle moment (`idle`):
 * whether and how long ago the player played (this device or a paired one) and the week
 * it first was (`save`, the game's own save, read only if the visit counts),
 * and whether it was opened as the app. A tagged link's tag (takeCampaign)
 * goes as the visit's campaign. A load come back to still gives the save
 * for its steps (countStep): a newcomer's reload is still their first visit.
 */
export function countVisit(save: () => Played | null, campaign: string | null, idle: (f: () => void) => void = (f) => f()) {
  // Nothing read from the save where nothing may be counted (Global Privacy Control too), as the privacy page says.
  if (!counting || toggledOnLoad || notCounted()) return;
  readPlayed = save;
  const back = cameBack();
  if (!back) {
    const r = referrerOf(document.referrer, location.href);
    send({ p: '/', t: document.title, ...(r ? { r } : {}), ...(campaign ? { q: `?utm_campaign=${campaign}` } : {}) }, true);
  }
  // (Read in the idle moment on a load come back to as well: a game picked up mid-way writes to the save before its next step.)
  idle(() => {
    // (Nor if the privacy page was used to opt out meanwhile.)
    if (notCounted()) return;
    const p = playedHere();
    newcomer = firstVisit(p, Date.now());
    if (back) return;
    for (const e of visitMarks(p, Date.now())) countReach(e);
    if (asApp()) countReach('visit/app');
  });
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

const reached = new Set<string>();
/**
 * A step a visit reached ("reach/played", "reach/finished"): counted the way
 * visits are, once a visitor in eight hours (no `ns`), so set against the
 * page loads ("reach/page", countPage) it says what share got that far. Sent
 * once a page load.
 */
export function countReach(name: string, head = false) {
  if (reached.has(name) || !counting) return;
  reached.add(name);
  send({ p: name, t: name, e: 'true' }, false, head);
}

/** A page load that counts, reloads and coming back too: what the steps are set against, as they're counted on every load as well. */
export const countPage = () => countReach('reach/page');

/**
 * The steps a newcomer's are counted apart too ("new/played"): a game's
 * (Steps), and the start page's way into one: New game tapped
 * ("reach/create"), a room asked for under a name that passed
 * ("reach/host", session host), that room's lobby, online or on this device
 * ("reach/room"), a run alone begun ("reach/solo", session startDelve), the
 * Daily answered ("reach/daily", countDaily) and a practice question
 * ("reach/practice"). The ones that aren't "reach/…" are a newcomer's only:
 * the first press of a control ("new/acted", countActed) and how long the
 * page took to become usable ("load/ready-2s", countReady).
 */
const NEWCOMER_STEPS = new Set([
  'reach/lobby',
  'reach/played',
  'reach/finished',
  'reach/create',
  'reach/host',
  'reach/room',
  'reach/solo',
  'reach/daily',
  'reach/practice',
  'new/acted',
  'load/ready-2s',
  'load/ready-5s',
  'load/ready-10s',
  'load/ready-later',
]);
/** A newcomer's steps that go to the queue's head (release): one who leaves at the portal pressed these within a second or so. */
const HEAD_STEPS = new Set(['new/acted', 'new/create', 'new/host']);

/**
 * Whether this load is a newcomer's (firstVisit), the save read now if the
 * visit's idle moment hasn't read it yet: kept, so it's read once a load,
 * and only while counting (readPlayed is set only then). Asked before what's
 * being counted writes to the save: a game's step, or the Daily's answer
 * (the codex records it after).
 */
function isNewcomer(): boolean {
  if (readPlayed && played === undefined) newcomer = firstVisit(playedHere(), Date.now());
  return newcomer;
}

/** A step reached (NEWCOMER_STEPS' "reach/…" ones), and for a visit whose device had no save, as a newcomer's too; a newcomer's own ones for theirs alone. */
export function countStep(name: string) {
  if (name.startsWith('reach/')) countReach(name);
  if (!NEWCOMER_STEPS.has(name) || !counting || notCounted() || !isNewcomer()) return;
  const step = name.replace('reach/', 'new/');
  countReach(step, HEAD_STEPS.has(step));
}

/**
 * Today's unique answered ("daily/right", "daily/wrong", each time): as a
 * step, a newcomer's too ("new/daily"), and from a load that isn't a
 * newcomer's, "daily/back", so it says whether those who come back use it.
 */
export function countDaily(good: boolean) {
  countEvent(good ? 'daily/right' : 'daily/wrong');
  countStep('reach/daily');
  if (counting && readPlayed && !notCounted() && !isNewcomer()) countReach('daily/back');
}

/** What a press is on that counts as acting: a control, not the page around it. */
const CONTROL =
  'button, a[href], input, select, textarea, summary, label, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';

/**
 * A newcomer's first press of a control ("new/acted"): a click on one,
 * which a tap, a mouse's press or a key gives, never a touch that scrolls
 * or one on the page around them. Heard first (capture), before the control
 * acts, so it goes out ahead of what it starts.
 */
export function countActed() {
  if (!counting || typeof addEventListener === 'undefined') return;
  const onClick = (e: Event) => {
    // (Not a click a script gave.)
    if (!e.isTrusted) return;
    const t = e.target as { closest?: (s: string) => unknown } | null;
    if (!t?.closest?.(CONTROL)) return;
    removeEventListener('click', onClick, { capture: true });
    countStep('new/acted');
  };
  addEventListener('click', onClick, { capture: true });
}

/** How long a page took to become usable (countReady), in coarse marks: within 2 s, 5 s, 10 s, or later. */
export const readyEvent = (ms: number) => (ms <= 2_000 ? 'load/ready-2s' : ms <= 5_000 ? 'load/ready-5s' : ms <= 10_000 ? 'load/ready-10s' : 'load/ready-later');

/**
 * How long a newcomer's page took to become usable ("load/ready-5s"), from
 * the start of its navigation: the app mounted (the start menu, on a first
 * visit) and a frame drawn with its fonts loaded. Called once the app is
 * mounted (main.ts). Nothing for a page that went unseen meanwhile: its
 * frames wait for it.
 */
export function countReady() {
  if (!counting || typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  let hidden = document.visibilityState !== 'visible';
  const onHide = () => void (hidden ||= document.visibilityState !== 'visible');
  document.addEventListener('visibilitychange', onHide);
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  // A frame first, so the fonts the start menu uses have begun loading before they're waited for.
  void frame()
    .then(() => document.fonts?.ready)
    .then(frame)
    .then(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (!hidden) countStep(readyEvent(performance.now()));
    });
}

/**
 * The save written to on a newcomer's visit (codex.ts onSaved): their first item met,
 * in a game or Today's unique, which puts them in that week's cohort
 * ("cohort/…"). Counted as a step is ("new/saved"), so a week's cohort is
 * set against how many joined it.
 */
export function countSaved() {
  if (!counting || notCounted()) return;
  // (Read without keeping it: it's just been written to, and the visit's own read, still to come, would take a newcomer's for a save.)
  if (readPlayed && played === undefined) newcomer = firstVisit(readPlayed(), Date.now());
  if (newcomer) countReach('new/saved');
}

/** The marks for time on the page, in minutes ("reach/time-10m"). */
export const TIME_MARKS = [2, 10, 30] as const;
/** The marks passed going from `before` to `after` milliseconds spent. */
export const timeMarksPassed = (before: number, after: number) => TIME_MARKS.filter((m) => before < m * 60_000 && after >= m * 60_000).map((m) => `reach/time-${m}m`);

/** How long after the last sign of life (input, a game moving: markActive) time still counts as spent. */
export const ACTIVE_MS = 90_000;
let activeAt = 0;
/** A sign that someone is there: a game moving on this device (session.svelte.ts), as input is. */
export const markActive = () => void (activeAt = Date.now());
const INPUT = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

/** Counts the time spent on this page, as steps at TIME_MARKS: while it's seen and someone is there (ACTIVE_MS), not a tab left open. */
export function countTime() {
  if (!counting || typeof document === 'undefined') return;
  for (const type of INPUT) addEventListener(type, markActive, { capture: true, passive: true });
  markActive();
  const TICK = 5_000;
  let ms = 0;
  const timer = setInterval(() => {
    if (document.visibilityState !== 'visible' || Date.now() - activeAt > ACTIVE_MS) return;
    for (const e of timeMarksPassed(ms, ms + TICK)) countReach(e);
    ms += TICK;
    if (ms < TIME_MARKS[TIME_MARKS.length - 1] * 60_000) return;
    clearInterval(timer);
    for (const type of INPUT) removeEventListener(type, markActive, { capture: true });
  }, TICK);
}

/** Whether an error's file or stack is the game's own built scripts (`assets`, its assets/ folder), not an extension's or a userscript's put into the page. */
export const ownScript = (where: string, assets: string) => where.includes(assets);
/** A module that failed to load: a page left open across an update asking for one the update removed. */
export const failedImport = (message: string) => /dynamically imported module|Importing a module script failed/i.test(message);

/** Whether "error/script" went out this page load, and how its listeners (countScriptErrors) are taken off once it has. */
let scriptErrorCounted = false;
let stopScriptErrors = () => {};
/** Counts "error/script", once a page load, whichever way it came. */
function scriptErrorDone() {
  if (scriptErrorCounted) return;
  scriptErrorCounted = true;
  stopScriptErrors();
  countEvent('error/script');
}

/**
 * An uncaught error in the game's own scripts ("error/script"), thrown or
 * rejected, or a module of the game's that failed to load; once a page load.
 * Installed first thing (lib/countErrors.ts), so a start that fails is
 * mostly caught too.
 */
export function countScriptErrors() {
  if (!counting || typeof addEventListener === 'undefined') return;
  const assets = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}assets/`;
  const onError = (e: ErrorEvent) => {
    if (ownScript(e.filename ?? '', assets) || ownScript((e.error as Error | undefined)?.stack ?? '', assets)) scriptErrorDone();
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const err = e.reason as { stack?: unknown; message?: unknown } | null;
    if (ownScript(typeof err?.stack === 'string' ? err.stack : '', assets) || failedImport(typeof err?.message === 'string' ? err.message : '')) scriptErrorDone();
  };
  stopScriptErrors = () => {
    removeEventListener('error', onError);
    removeEventListener('unhandledrejection', onRejection);
  };
  addEventListener('error', onError);
  addEventListener('unhandledrejection', onRejection);
}

/**
 * A module of the game's that failed to load where the page catches it (the
 * codex's, the settings'), so it never reaches countScriptErrors' listeners:
 * counted as theirs would be ("error/script", the once a page load they share).
 */
export function countFailedImport() {
  if (counting) scriptErrorDone();
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

const playing = (s: GameState) => s.phase !== 'lobby' && s.phase !== 'over';

/** A game decided: over, or a Delve run nobody stands in any more (alone, as they perish; before anyone looks at the results). */
const decided = (s: GameState) => s.phase === 'over' || (s.phase !== 'lobby' && nobodyStands(s));

/** The event for a Delve run's end, by the ten depths it ended in, as players see them ("delve/depth-20-29"). */
export function delveEndEvent(depth: number): string {
  const from = Math.floor(Math.max(0, depth) / 10) * 10;
  return `delve/depth-${from}-${from + 9}`;
}

/**
 * What a state change counts, on the device that runs the game (the host's,
 * or a room's that never went online): a game starting, from the lobby or
 * the last one's end ("play/race", with "size/race-3p" for how many play,
 * and "screen/turns" if some sit at the host's screen), and a game decided
 * ("end/race", a Delve run with its depths). The two side by side say how
 * many games are left unfinished. Nothing for a game picked up after a
 * reload (no `prev`): what it had reached was counted before.
 */
export function gameEvents(prev: GameState | null, next: GameState): string[] {
  if (!prev) return [];
  const mode = next.settings.mode ?? 'turns';
  if (!playing(prev) && playing(next)) return [`play/${mode}`, `size/${mode}-${partySize(next)}`, ...(next.players.some((p) => p.local) ? [`screen/${mode}`] : [])];
  if (!decided(next) || (decided(prev) && prev.delve?.startedAt === next.delve?.startedAt)) return [];
  return next.delve ? [`end/${mode}`, delveEndEvent(shownDepth(teamDepth(next)))] : [`end/${mode}`];
}

/**
 * The steps a state change reaches on any device in the game, host or guest
 * (countReach): a lobby seen ("reach/lobby", a room's made or joined, picked
 * up after a reload too), a game starting ("reach/played") and one decided
 * ("reach/finished"). Nothing else for a game picked up after a reload.
 */
export function reachEvents(prev: GameState | null, next: GameState): string[] {
  if (next.phase === 'lobby' && prev?.phase !== 'lobby') return ['reach/lobby'];
  if (!prev) return [];
  if (!playing(prev) && playing(next)) return ['reach/played'];
  return decided(next) && !decided(prev) ? ['reach/finished'] : [];
}

/** The games started in a page load that are marked as steps: a second, a fifth ("reach/games-2"). */
export const GAMES_MARKS = [2, 5] as const;

/** reachEvents for one page's games, with the marks for how many it started. */
export class Steps {
  private played = 0;

  events(prev: GameState | null, next: GameState): string[] {
    const out = reachEvents(prev, next);
    if (!out.includes('reach/played')) return out;
    this.played++;
    return (GAMES_MARKS as readonly number[]).includes(this.played) ? [...out, `reach/games-${this.played}`] : out;
  }
}

/** gameEvents for one device's games, a Delve run's end counted once whatever becomes of who stands after. */
export class GameCounts {
  private ended: number | null = null;

  events(prev: GameState | null, next: GameState): string[] {
    const out = gameEvents(prev, next);
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
