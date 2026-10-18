// The sites behind past busy days (What happened), kept in this browser: a
// day gone by never changes, so it's read from GoatCounter once. One stored
// map for the account's time zone (another zone cuts other days, so they're
// read again), holding only the days the longest period reaches back to.
// Pure, so the tests can feed it.

import type { Named } from './api.ts';

export const DAY_REFS_KEY = 'analytics.dayrefs';

interface Stored {
  zone: string;
  days: Record<string, Named[]>;
}

/** The days kept for `zone`; none where they're another zone's, or what's stored can't be read. */
export function dayRefsOf(stored: string | null, zone: string): Record<string, Named[]> {
  try {
    const s = JSON.parse(stored ?? 'null') as Stored | null;
    return s && s.zone === zone && s.days && typeof s.days === 'object' && !Array.isArray(s.days) ? s.days : {};
  } catch {
    return {};
  }
}

/** What to store: `days` for `zone`, those before `oldest` left out. */
export function dayRefsToKeep(days: Record<string, Named[]>, zone: string, oldest: string): string {
  const kept = Object.fromEntries(Object.entries(days).filter(([day]) => day >= oldest));
  return JSON.stringify({ zone, days: kept } satisfies Stored);
}
