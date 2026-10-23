// Delve: the start lines this device has shown (delveStart.ts), most recent
// first. The host weighs them with every other player's to pick a run's line;
// a guest's go in its hello (protocol.ts).

import { cleanSeen, sawLine, START_LINES } from './delveStart.ts';
import { readStored, removeStored, writeStored } from './storage.ts';

const STORE_NAME = 'delveStartSeen';
/**
 * Before the host picked: this device's own shuffled deck, the lines dealt
 * this time round in `order` up to `next`, and its last few runs' lines in
 * `runs` ([startedAt, line], newest first), which may be from the time round
 * before.
 */
const OLD_DECK = 'delveStartDeck';

function parse(raw: string | null): unknown {
  try {
    return JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
}

/** What an old deck had shown, most recent first: its last runs', then the rest dealt this time round. */
export function fromOldDeck(deck: unknown): number[] {
  const d = deck as { order?: unknown; next?: unknown; runs?: unknown } | null;
  if (!d) return [];
  const runs = Array.isArray(d.runs) ? d.runs.map((r) => (Array.isArray(r) ? r[1] : null)) : [];
  const dealt = Array.isArray(d.order) && Number.isInteger(d.next) ? d.order.slice(0, d.next as number).reverse() : [];
  return cleanSeen([...runs, ...dealt]);
}

/** The lines this device has shown, most recent first. */
export function seenLines(): number[] {
  const raw = readStored(STORE_NAME);
  if (raw !== null) return cleanSeen(parse(raw));
  // Taken over from the old deck, so a device doesn't start over.
  const old = readStored(OLD_DECK);
  if (old === null) return [];
  const seen = fromOldDeck(parse(old));
  writeStored(STORE_NAME, JSON.stringify(seen));
  removeStored(OLD_DECK);
  return seen;
}

/** Notes that this device showed `line` (a reload showing it again changes nothing; a line this build doesn't have is let be). */
export function noteLine(line: string) {
  const i = START_LINES.indexOf(line);
  const seen = seenLines();
  if (i < 0 || seen[0] === i) return;
  writeStored(STORE_NAME, JSON.stringify(sawLine(seen, i)));
}
