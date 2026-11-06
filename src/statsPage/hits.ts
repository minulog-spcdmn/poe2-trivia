// What Analytics reads of GoatCounter's API, given a way to ask it: the
// account's time zone and every path's days. The stats page asks through
// api.ts (the key in this browser, its calls paced and written down), the
// daily health check through its own (scripts/daily-health.mjs), so this
// file imports nothing a browser alone has and loads in Node as it is.

import type { PathCount } from './model.ts';
import { onClock, zoneOf } from './zone.ts';

/** A GET of the API at `path` with `query`, its answer as JSON. */
export type Get = <T>(path: string, query: Record<string, string>) => Promise<T>;

/** A stretch of time, as the API takes it. */
export interface Span {
  start: Date;
  end: Date;
}
export const range = (s: Span) => ({ start: s.start.toISOString(), end: s.end.toISOString() });

/** The account's time zone, GoatCounter's days are cut in (any key may ask). */
export async function accountZone(get: Get): Promise<string> {
  const me = await get<{ user?: { settings?: { timezone?: string } } }>('/me', {});
  return zoneOf(me.user?.settings?.timezone);
}

interface HitsResponse {
  hits: { path_id: number; path: string; event: boolean; count: number; stats: { day: string; daily: number; hourly?: number[] }[] }[];
  more: boolean;
}

/** Pages read at most: 1,000 paths, far more than the game counts, and an address that stays short enough to send. */
const MAX_PAGES = 10;

/**
 * Every path counted in the span, with its days: pages of up to 100, each
 * next one leaving out the paths already had. Its days and hours put onto
 * the clock of `zone`, the account's (zone.ts onClock): GoatCounter labels
 * them all with the offset the zone has when asked. `complete`: false when
 * there were more than MAX_PAGES of them. `muddled`: the error thrown when
 * the pages don't add up.
 */
export async function pathCounts(
  get: Get,
  span: Span,
  zone: string,
  muddled: () => Error,
  now = () => Date.now(),
): Promise<{ paths: PathCount[]; complete: boolean }> {
  const out: PathCount[] = [];
  const had: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await get<HitsResponse>('/stats/hits', { ...range(span), group: 'day', limit: '100', ...(had.length ? { exclude_paths: had.join(',') } : {}) });
    // (Its offset, as near the moment GoatCounter took it as the reader can tell.)
    const at = new Date(now());
    for (const h of r.hits) {
      had.push(String(h.path_id));
      out.push({
        path: h.path,
        event: h.event,
        count: h.count,
        ...(h.stats.every((s) => s.hourly?.length === 24)
          ? onClock(Object.fromEntries(h.stats.map((s) => [s.day, s.hourly!])), zone, at)
          : { days: Object.fromEntries(h.stats.map((s) => [s.day, s.daily])) }),
      });
    }
    if (!r.more) return { paths: out, complete: true };
    // A page that brought nothing new would ask the same again for ever.
    if (!r.hits.length) throw muddled();
  }
  return { paths: out, complete: false };
}
