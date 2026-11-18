// The item tally as the Items view reads it: every player's answers, summed
// per item, form and the rules each was asked under, from the matchmaking
// server (signal/worker.js Tally; lib/itemTally.ts sends them). Not from
// GoatCounter, and needing no key: the Worker answers the game's own pages
// (vite.config.ts lets them reach its host).

import type { TallyRow } from '../lib/itemTallyRank.ts';
import { OWN_SIGNAL_HOST } from '../lib/signalHost.ts';

const ROW_KEYS = ['v', 'item', 'form', 'ctx', 'first', 'r', 'w'];
const count = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** The rows the Worker sent, each checked: anything off (another shape from a newer Worker) throws rather than ranks wrong. */
export function tallyRowsOf(json: unknown): TallyRow[] {
  if (!Array.isArray(json)) throw new Error('The tally came back in a shape this page doesn’t know.');
  for (const x of json as Record<string, unknown>[])
    if (
      typeof x !== 'object' ||
      x === null ||
      !ROW_KEYS.every((k) => k in x) ||
      !count(x.v) ||
      typeof x.item !== 'string' ||
      (x.form !== 'n' && x.form !== 'a') ||
      typeof x.ctx !== 'string' ||
      (x.first !== 0 && x.first !== 1) ||
      !count(x.r) ||
      !count(x.w)
    )
      throw new Error('The tally came back in a shape this page doesn’t know.');
  return json as TallyRow[];
}

/** Every sum the tally keeps, read now. */
export async function readTally(signal: AbortSignal): Promise<TallyRow[]> {
  if (!OWN_SIGNAL_HOST) throw new Error('This build has no matchmaking server of its own to read the tally from.');
  let r: Response;
  try {
    r = await fetch(`https://${OWN_SIGNAL_HOST}/tally`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error('The matchmaking server couldn’t be reached.');
  }
  if (r.status === 429) throw new Error('The matchmaking server is busy; try again in a minute.');
  // (Its full reads of the tally keep to a day's share: signal/worker.js TALLY_READS.)
  if (r.status === 503) throw new Error('Today’s reading of the tally is used up; try again after midnight UTC.');
  if (!r.ok) throw new Error(`The matchmaking server answered ${r.status}.`);
  return tallyRowsOf(await r.json());
}
