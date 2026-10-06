// Stored records this build can't read are never written over. A newer
// build's (a higher version) stay as they are, and nothing is written in
// their place, so going back to that build finds them whole. Anything else
// unreadable (damaged, or from a version nothing reads any more) is copied
// aside, under a key of its own that nothing writes again, before new records
// start in its place. Used by the codex and the Delve records.

import { writeStored } from './storage.ts';

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

/**
 * Whether new data may take the place of `raw`, stored under `name` and
 * unreadable at `version`: never over a newer build's; anything else once it
 * is kept aside (as `${name}.unread.${time}`), and not if that fails.
 */
export function makeRoom(name: string, raw: string, version: number, now = Date.now()): boolean {
  if (newerThan(raw, version)) return false;
  return writeStored(`${name}.unread.${now}`, raw);
}
