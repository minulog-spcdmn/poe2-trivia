// What Analytics reads for a period, and the periods it offers.

import type { Named } from './api';
import type { Changes } from './changes';
import type { Counts } from './model';
import { addDays } from './zone';

/** A period read: its days and the same many before, with what the start page's visitors came on and from. */
export interface Read {
  /** The shape this was kept in: a read kept by an older build is read again. */
  v: 10;
  /** The period's length; `from` is later where counting began inside it (counted). */
  span: number;
  from: string;
  to: string;
  fromBefore: string;
  toBefore: string;
  /** The time zone GoatCounter cuts the account's days in. */
  zone: string;
  now: Counts;
  before: Counts;
  systems: Named[];
  countries: Named[];
  refs: Named[];
  /** Visitors by the tag of the link they came by (poe2.quest/?ref=<tag>, GoatCounter's campaigns); untagged visits aren't in it. */
  campaigns: Named[];
  /** The period before's, to see who brought more or fewer (insights.ts moversOf). */
  countriesBefore: Named[];
  refsBefore: Named[];
  /** The sites that brought each of the period's busiest days (insights.ts spikesOf), by day. */
  spikeRefs: Record<string, Named[]>;
  at: number;
  complete: boolean;
  /** Whether the period before was counted from its first day: if not, nothing is compared with it (COMPARE). */
  compare: boolean;
  /** The first day anything was counted on (model.ts firstCounted): counted only partway, so the period starts the day after where it's inside it. */
  began: string | null;
  /** What came in since the read before it (changes.ts keptChanges). */
  changes?: Changes | null;
}

/** Whether counting began inside the period, so it starts there and not `span` days back. */
export const counted = (r: Read) => r.from !== addDays(r.to, -(r.span - 1));

/**
 * The context key for whether the read compares with the period before: a
 * function, so it follows the read. Without one, the changes (Delta), the
 * period before's line (TrendChart) and where a share stood (Shares) aren't
 * shown.
 */
export const COMPARE = Symbol('compare');

export interface Period {
  value: number;
  /** On its button. */
  name: string;
  /** The period, and the one before it, in a sentence ("the 7 days before"). */
  now: string;
  before: string;
}

export const PERIODS: readonly Period[] = [
  { value: 7, name: 'Week', now: 'The last 7 days', before: 'the 7 days before' },
  { value: 30, name: 'Month', now: 'The last 30 days', before: 'the 30 days before' },
  { value: 90, name: 'Quarter', now: 'The last 90 days', before: 'the 90 days before' },
  // 52 weeks: drawn by the week, a year of whole weeks has no stub of a day at its start.
  { value: 364, name: 'Year', now: 'The last 52 weeks', before: 'the 52 weeks before' },
];

/** The views, each a question; the overview is the page without a #. */
export const VIEWS = [
  { value: 'overview', name: 'Overview' },
  { value: 'visitors', name: 'Visitors' },
  { value: 'games', name: 'Games' },
  { value: 'daily', name: "Today's unique" },
  { value: 'joining', name: 'Joining' },
  { value: 'groups', name: 'Groups' },
] as const;
export type View = (typeof VIEWS)[number]['value'];
