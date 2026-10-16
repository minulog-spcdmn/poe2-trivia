// The ledger's line to GoatCounter's API (stats.html): read-only, with the
// API key the owner pasted once, which stays in this browser
// (lib/storage.ts) and is never in the code. GoatCounter lets a page call its
// API from anywhere (CORS); the site's CSP lets this one reach it
// (lib/counter.ts).
//
// GoatCounter takes 4 requests a second from an address (and 500 an hour),
// and counts the browser's preflight too: each call, sent with the key, is
// two requests. So calls go out one at a time, 600ms apart. A preflight it
// turns away fails as CORS, so the page sees no answer at all, not its 429;
// a call that gets none is tried again, later each time.

import { COUNTER_ORIGIN } from '../lib/counter';
import { readStored, removeStored, writeStored } from '../lib/storage';
import type { PathCount } from './model';
import { zoneOf } from './zone';

const KEY = 'ledger.key';
export const savedKey = () => readStored(KEY) ?? '';
export const saveKey = (key: string) => writeStored(KEY, key.trim());
export const forgetKey = () => removeStored(KEY);

/** Where the owner makes a key: GoatCounter's API settings. */
export const KEY_PAGE = `${COUNTER_ORIGIN}/user/api`;
/** GoatCounter's own dashboard. */
export const DASHBOARD = `${COUNTER_ORIGIN}/`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'busy' | 'network' | 'other',
  ) {
    super(message);
  }
}

/** Between the starts of two calls: each is two requests (preflight and call), GoatCounter takes 4 a second. */
const APART_MS = 600;
const TRIES = 4;
let queue: Promise<unknown> = Promise.resolve();
let lastStart = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `go` once every call before it has finished, and APART_MS after the last one began. */
function paced<T>(go: () => Promise<T>): Promise<T> {
  const turn = queue.then(async () => {
    const wait = lastStart + APART_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    return go();
  });
  queue = turn.catch(() => undefined);
  return turn;
}

async function get<T>(key: string, path: string, query: Record<string, string> = {}, tried = 0): Promise<T> {
  const url = `${COUNTER_ORIGIN}/api/v0${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;
  const again = async () => {
    await sleep(1500 * 2 ** tried);
    return get<T>(key, path, query, tried + 1);
  };
  const res = await paced(() => fetch(url, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }).catch(() => null));
  // No answer: most often a preflight GoatCounter turned away for coming too fast, now and then an ad blocker.
  if (!res) {
    if (tried + 1 < TRIES) return again();
    throw new ApiError("GoatCounter didn't answer. It may be busy (4 requests a second, 500 an hour), or an ad blocker may stop it. Try again in a minute.", 'network');
  }
  if (res.status === 429) {
    if (tried + 1 < TRIES) return again();
    throw new ApiError('GoatCounter asked to slow down (500 requests an hour). Try again in a few minutes.', 'busy');
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('GoatCounter turned the key down. It may have been deleted, or lack "Read statistics".', 'key');
  if (!res.ok) throw new ApiError(`GoatCounter answered ${res.status}. Try again in a moment.`, 'other');
  return (await res.json()) as T;
}

/** The account's time zone, GoatCounter's days are cut in (any key may ask). */
export async function accountZone(key: string): Promise<string> {
  const me = await get<{ user?: { settings?: { timezone?: string } } }>(key, '/me');
  return zoneOf(me.user?.settings?.timezone);
}

/** A stretch of time, as the API takes it. */
export interface Span {
  start: Date;
  end: Date;
}
const range = (s: Span) => ({ start: s.start.toISOString(), end: s.end.toISOString() });

interface HitsResponse {
  hits: { path_id: number; path: string; event: boolean; count: number; stats: { day: string; daily: number }[] }[];
  more: boolean;
}

/** Pages read at most: 1,000 paths, far more than the game counts, and an address that stays short enough to send. */
const MAX_PAGES = 10;

/**
 * Every path counted in the span, with its days: pages of up to 100, each
 * next one leaving out the paths already had. `complete`: false when there
 * were more than MAX_PAGES of them.
 */
export async function pathCounts(key: string, span: Span): Promise<{ paths: PathCount[]; complete: boolean }> {
  const out: PathCount[] = [];
  const had: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await get<HitsResponse>(key, '/stats/hits', {
      ...range(span),
      group: 'day',
      limit: '100',
      ...(had.length ? { exclude_paths: had.join(',') } : {}),
    });
    for (const h of r.hits) {
      had.push(String(h.path_id));
      out.push({ path: h.path, event: h.event, count: h.count, days: Object.fromEntries(h.stats.map((s) => [s.day, s.daily])) });
    }
    if (!r.more) return { paths: out, complete: true };
    // A page that brought nothing new would ask the same again for ever.
    if (!r.hits.length) throw new ApiError("GoatCounter's list of paths didn't add up. Try again in a moment.", 'other');
  }
  return { paths: out, complete: false };
}

export interface Named {
  name: string;
  count: number;
}

/** Visitors of the start page (visits, not game events) by system, country or referrer. */
export async function visitorsBy(key: string, span: Span, page: 'systems' | 'locations' | 'toprefs'): Promise<Named[]> {
  const r = await get<{ stats: { name: string; count: number }[] }>(key, `/stats/${page}`, {
    ...range(span),
    include_paths: '/',
    path_by_name: 'true',
    limit: '50',
  });
  return r.stats.map((s) => ({ name: s.name, count: s.count }));
}
