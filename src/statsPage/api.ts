// The ledger's line to GoatCounter's API (stats.html): read-only, with the
// API key the owner pasted once, which stays in this browser
// (lib/storage.ts) and is never in the code. GoatCounter lets a page call its
// API from anywhere (CORS); the site's CSP lets this one reach it
// (lib/counter.ts). It allows 4 calls a second and 500 an hour, so calls go
// out a few at a time and a turned-down one waits and tries again.

import { COUNTER_ORIGIN } from '../lib/counter';
import { readStored, removeStored, writeStored } from '../lib/storage';
import type { PathCount } from './model';

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

const MAX_AT_ONCE = 3;
let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(go: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await go();
  } finally {
    running--;
    queue.shift()?.();
  }
}

async function get<T>(key: string, path: string, query: Record<string, string>, tries = 3): Promise<T> {
  const url = `${COUNTER_ORIGIN}/api/v0${path}?${new URLSearchParams(query)}`;
  const res = await slot(() =>
    fetch(url, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }).catch(() => {
      throw new ApiError("GoatCounter couldn't be reached. Check the connection and try again.", 'network');
    }),
  );
  if (res.status === 429 && tries > 1) {
    await new Promise((r) => setTimeout(r, 1200));
    return get(key, path, query, tries - 1);
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('GoatCounter turned the key down. It may have been deleted, or lack "Read statistics".', 'key');
  if (res.status === 429) throw new ApiError('GoatCounter asked to slow down (500 calls an hour). Try again in a few minutes.', 'busy');
  if (!res.ok) throw new ApiError(`GoatCounter answered ${res.status}. Try again in a moment.`, 'other');
  return (await res.json()) as T;
}

/** A period: from the start of `from` to the end of `to` (YYYY-MM-DD, this browser's days), as the API takes it. */
export interface Period {
  from: string;
  to: string;
}
const span = (p: Period) => ({
  start: new Date(`${p.from}T00:00:00`).toISOString(),
  end: new Date(`${p.to}T23:59:59`).toISOString(),
});

interface HitsResponse {
  hits: { path_id: number; path: string; event: boolean; count: number; stats: { day: string; daily: number }[] }[];
  more: boolean;
}

/** Every path counted in the period, with its days: pages of 100, each next one leaving out the paths already had. */
export async function pathCounts(key: string, period: Period): Promise<PathCount[]> {
  const out: PathCount[] = [];
  const had: string[] = [];
  for (let page = 0; page < 10; page++) {
    const r = await get<HitsResponse>(key, '/stats/hits', {
      ...span(period),
      group: 'day',
      limit: '100',
      ...(had.length ? { exclude_paths: had.join(',') } : {}),
    });
    for (const h of r.hits) {
      had.push(String(h.path_id));
      out.push({ path: h.path, event: h.event, count: h.count, days: Object.fromEntries(h.stats.map((s) => [s.day, s.daily])) });
    }
    if (!r.more || !r.hits.length) break;
  }
  return out;
}

export interface Named {
  name: string;
  count: number;
}

/** Visitors of the start page (visits, not game events) by browser, system, country or referrer. */
export async function visitorsBy(key: string, period: Period, page: 'systems' | 'locations' | 'toprefs' | 'browsers'): Promise<Named[]> {
  const r = await get<{ stats: { name: string; count: number }[] }>(key, `/stats/${page}`, {
    ...span(period),
    include_paths: '/',
    path_by_name: 'true',
    limit: '50',
  });
  return r.stats.map((s) => ({ name: s.name, count: s.count }));
}
