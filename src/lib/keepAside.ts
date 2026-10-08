// Stored records this build can't read are never written over. A newer
// build's (a higher version) stay as they are, and nothing is written in
// their place, so going back to that build finds them whole. Anything else
// unreadable (damaged, or from a version nothing reads any more) is copied
// aside before new records start in its place, into one slot of its own
// (`${name}.unread`). The slot is only written while it is empty: a write that
// keeps failing (storage full) finds its copy already there and never piles
// up more, and the first copy kept is never written over (a later unreadable
// entry, with the slot taken, is let go rather than stopping the records for
// good). Reset clears it. Used by the codex and the Delve records.

import { removeStored, removeStoredStarting, tryReadStored, writeStored } from './storage.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether stored data was written by a newer build than one reading `version`. */
export function newerThan(raw: string, version: number): boolean {
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) && typeof v.v === 'number' && Number.isFinite(v.v) && v.v > version;
  } catch {
    return false;
  }
}

/** Where what was stored under `name`, and couldn't be read, is kept. */
export const asideName = (name: string) => `${name}.unread`;

/**
 * Whether new data may take the place of `raw`, stored under `name` and
 * unreadable at `version`: never over a newer build's; anything else once a
 * copy is kept aside (or one already is), and not if that fails.
 */
export function makeRoom(name: string, raw: string, version: number): boolean {
  if (newerThan(raw, version)) return false;
  const slot = asideName(name);
  const kept = tryReadStored(slot);
  if (kept === undefined) return false;
  return kept !== null || writeStored(slot, raw);
}

/** Removes what was kept aside for `name`: its slot, and the copies older builds kept under `${name}.unread.${time}`. */
export function clearAside(name: string) {
  removeStored(asideName(name));
  removeStoredStarting(`${asideName(name)}.`);
}
