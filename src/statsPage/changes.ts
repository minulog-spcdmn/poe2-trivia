// What came in between two reads of a period (stats.html updates by itself
// every few minutes): the visitors, games and answers added, the games by
// mode, and the countries and systems the new visitors came from and on:
// what today's box shows. (Joining going wrong has its own line, from the
// counts themselves, insights.ts troubleOf.) GoatCounter keeps
// no visit with its country and system together, so with several new
// visitors the two lists are each their own. Pure, so the tests can feed it.

import type { Named } from './api.ts';
import { MODE_NAMES, modesOf, type Counts } from './model.ts';
import type { Read } from './read.ts';

export interface Changes {
  /** The two reads it lies between. */
  since: number;
  at: number;
  visitors: number;
  games: number;
  /** Today's unique's answers. */
  answers: number;
  /** Each mode's new games, most first. */
  modes: Named[];
  countries: Named[];
  systems: Named[];
}

const answers = (c: Counts) => c.daily.right + c.daily.wrong;

/** What a list gained, by name, most first (a count that went down is GoatCounter's own correction, left out). */
function gained(was: Named[], now: Named[]): Named[] {
  const had = new Map(was.map((n) => [n.name, n.count]));
  return now
    .map((n) => ({ name: n.name || 'Unknown', count: n.count - (had.get(n.name) ?? 0) }))
    .filter((n) => n.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** What `now` added to `was`, or null where they aren't the same period (another span, or read on another day). */
export function changesOf(was: Read, now: Read): Changes | null {
  if (was.span !== now.span || was.from !== now.from || was.at >= now.at) return null;
  const a = was.now;
  const b = now.now;
  const playedWas = new Map(modesOf(a.games.rows).map((m) => [m.mode, m.started]));
  return {
    since: was.at,
    at: now.at,
    visitors: Math.max(0, b.visitors.total - a.visitors.total),
    games: Math.max(0, b.games.started - a.games.started),
    answers: Math.max(0, answers(b) - answers(a)),
    modes: modesOf(b.games.rows)
      .map((m) => ({ name: MODE_NAMES[m.mode], count: m.started - (playedWas.get(m.mode) ?? 0) }))
      .filter((m) => m.count > 0)
      .sort((x, y) => y.count - x.count),
    countries: gained(was.countries, now.countries),
    systems: gained(was.systems, now.systems),
  };
}

/** What the newest update (read at `at`) brought each name of a list, for Bars to mark; nothing once an update has brought nothing. */
export function freshOf(c: Changes | null | undefined, at: number, list: 'countries' | 'systems' | 'modes'): Map<string, number> | undefined {
  return c && c.at === at ? new Map(c[list].map((n) => [n.name, n.count])) : undefined;
}

/** Anything new that today's box shows (an update with nothing more leaves the last one that had). */
export const anyNew = (c: Changes | null | undefined): c is Changes => !!c && c.visitors + c.games + c.answers + c.modes.length + c.countries.length + c.systems.length > 0;

/**
 * The changes a fresh read keeps: what it added to the read before it, or,
 * with nothing new, the last that brought something (of the same period).
 */
export function keptChanges(was: Read | null, now: Read): Changes | null {
  if (!was) return null;
  const fresh = changesOf(was, now);
  if (anyNew(fresh)) return fresh;
  return was.changes && was.from === now.from && was.span === now.span ? was.changes : null;
}
