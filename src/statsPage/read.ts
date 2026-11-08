// What Analytics reads for a period, and the periods it offers.

import type { Named, Span } from './api';
import type { Changes } from './changes';
import type { Counts } from './model';
import { daysBetween } from './model.ts';
import { addDays, dayIn, hourStarts, hoursIn, midnight } from './zone.ts';

/** The shape reads are kept in: a read kept by an older build (another number) is read again. */
export const READ_V = 16;

/** A period read: its days and the same many before, with what the start page's visitors came on and from. */
export interface Read {
  /** The shape this was kept in (READ_V). */
  v: number;
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
  /** The period before's, to see who brought more or fewer (insights.ts moversOf): its countries over its whole days, as many as countriesWhole's. */
  countriesBefore: Named[];
  /** The period's countries to yesterday, where it's compared: GoatCounter keeps countries by the day, so a part of today has nothing to be held against. */
  countriesWhole?: Named[];
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
  /** Shown with its counts alone, the lists still to come (Analytics' partial read; never kept): an empty list isn't yet none (orReading). */
  waiting?: boolean;
}

/** What stands in a list's place while it's empty: `none` once it's read, "Reading…" while the read is still waiting for it. */
export const orReading = (r: Read, none: string) => (r.waiting ? 'Reading…' : none);

/**
 * What a read of `days` at `at` asks GoatCounter for, in the account's
 * `zone`: from the start of the first day to now, and the period before to
 * as far into its last day as today has gone (by the clock there: the two
 * compare like with like). GoatCounter gives the hour a span ends in whole,
 * so the period before ends with the hour on the clock it is now (both of
 * them, the night the clocks go back), and countsOf takes the part of it
 * that has passed. Both from the day before them: where counting began
 * earlier, the period before's has counts, which tell it was counted from
 * its first (model.ts countedSpan); and in a zone behind UTC each one's
 * first UTC day begins that evening, so Today's unique has it whole in both
 * (model.ts utcPerDay). That day's counts aren't taken (countsOf). `until`: the hours today has had, a part of the one
 * it's in too. `began`: the first whole day counted, where it's kept
 * (Analytics): nothing from before the day counting began partway through
 * is asked for, and no period before at all where it all lies before then
 * (`before` null).
 */
export function spansOf(zone: string, at: Date, days: number, began: string | null = null) {
  const today = dayIn(zone, at);
  const from = addDays(today, -(days - 1));
  const fromBefore = addDays(from, -days);
  const toBefore = addDays(today, -days);
  const until = hoursIn(zone, today, at);
  const counting = began && addDays(began, -1);
  const notBefore = (day: string) => (counting && counting > day ? counting : day);
  const now: Span = { start: midnight(zone, notBefore(addDays(from, -1))), end: at };
  const before: Span | null =
    counting && counting > toBefore ? null : { start: midnight(zone, notBefore(addDays(fromBefore, -1))), end: new Date(hourStarts(zone, toBefore)[Math.floor(until) + 1] - 1) };
  return { today, from, fromBefore, toBefore, until, now, before };
}

/** `span` to just before `day` begins in `zone`: GoatCounter's countries, kept by the day, are asked for whole days by the days the span's ends fall on. */
export const untilDay = (zone: string, span: Span, day: string): Span => ({ start: span.start, end: new Date(midnight(zone, day).getTime() - 1) });

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

/** A kept read of `days`, from what storage holds: null where it's another shape's, another period's, or nothing. */
export function keptRead(raw: string | null, days: number): Read | null {
  try {
    const r = JSON.parse(raw ?? 'null') as Read | null;
    return r?.v === READ_V && r.span === days ? r : null;
  } catch {
    return null;
  }
}

/**
 * The shortest period that holds every day counted from `began` to `today`,
 * where counting began inside the longest: it and those longer are one
 * choice ("Since Oct 16"), and a longer one kept from before is read as it.
 */
export function coverOf(began: string | null, today: string): Period | null {
  if (!began) return null;
  const n = daysBetween(began, today).length;
  return n > PERIODS[PERIODS.length - 1].value ? null : (PERIODS.find((p) => p.value >= n) ?? null);
}

/** The views, each a question; the overview is the page without a #. */
export const VIEWS = [
  { value: 'overview', name: 'Overview' },
  { value: 'visitors', name: 'Visitors' },
  { value: 'games', name: 'Games' },
  { value: 'daily', name: "Today's unique" },
  { value: 'joining', name: 'Joining' },
  { value: 'stutter', name: 'Stutter' },
  { value: 'groups', name: 'Groups' },
] as const;
export type View = (typeof VIEWS)[number]['value'];
