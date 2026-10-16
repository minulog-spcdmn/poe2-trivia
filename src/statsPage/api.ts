// The ledger's line to GoatCounter's API (stats.html): read-only, with the
// API key the owner pasted once, which stays in this browser
// (lib/storage.ts) and is never in the code. GoatCounter lets a page call its
// API from anywhere (CORS); the site's CSP lets this one reach it
// (lib/counter.ts). It allows 4 calls a second and 500 an hour: calls go out
// three at a time at most and a quarter second apart, and one turned away
// waits longer each time (its Retry-After isn't readable from another site).

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

const AT_ONCE = 3;
const APART_MS = 260;
let running = 0;
let lastStart = 0;
const waiting: (() => void)[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `go` once a place is free (a call finishing hands its place straight on) and a quarter second after the last call began. */
async function paced<T>(go: () => Promise<T>): Promise<T> {
  if (running < AT_ONCE) running++;
  else await new Promise<void>((r) => waiting.push(r));
  try {
    const wait = lastStart + APART_MS - Date.now();
    lastStart = Math.max(Date.now(), lastStart + APART_MS);
    if (wait > 0) await sleep(wait);
    return await go();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

async function get<T>(key: string, path: string, query: Record<string, string> = {}, tries = 4): Promise<T> {
  const url = `${COUNTER_ORIGIN}/api/v0${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;
  const res = await paced(() =>
    fetch(url, { headers: { Authorization: `Bearer ${key}` } }).catch(() => {
      throw new ApiError("GoatCounter couldn't be reached. Check the connection and try again.", 'network');
    }),
  );
  if (res.status === 429 && tries > 1) {
    await sleep(1200 * 2 ** (4 - tries));
    return get(key, path, query, tries - 1);
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('GoatCounter turned the key down. It may have been deleted, or lack "Read statistics".', 'key');
  if (res.status === 429) throw new ApiError('GoatCounter asked to slow down (500 calls an hour). Try again in a few minutes.', 'busy');
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

/** Every path counted in the span, with its days: pages of up to 100, each next one leaving out the paths already had. */
export async function pathCounts(key: string, span: Span): Promise<PathCount[]> {
  const out: PathCount[] = [];
  const had: string[] = [];
  for (;;) {
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
    if (!r.more) return out;
    // A page that brought nothing new would ask the same again for ever.
    if (!r.hits.length) throw new ApiError("GoatCounter's list of paths didn't add up. Try again in a moment.", 'other');
  }
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
