// Today's unique's questions, written down ahead (src/data/dailies.json, by
// npm run deal): every day's from the first to a year past the last deal, as
// the game dealt or deals it. A day's question is read from its row, so no
// change to the item data or the code can move a day once it is written; a
// refresh deals only the days still to come again (scripts/deal.mjs). On its
// own, without the game's engine, so a page can name past days (src/statsPage).

import dailies from '../data/dailies.json' with { type: 'json' };
import type { Question } from './game.ts';

const DAY_MS = 86_400_000;

/** The UTC day the first row is for. */
export const ROWS_FROM = Date.parse(`${dailies.from}T00:00:00Z`) / DAY_MS;

const rows = dailies.days as unknown as Question[];

/** The UTC day the last row is for. */
export const ROWS_TO = ROWS_FROM + rows.length - 1;

/** A day's question as written down (a copy), or null for a day with no row. */
export const dailyRow = (day: number): Question | null =>
  day >= ROWS_FROM && day <= ROWS_TO ? structuredClone(rows[day - ROWS_FROM]) : null;
