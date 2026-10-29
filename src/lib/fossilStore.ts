// The fossils this browser's player has found in Delve (lib/fossils.ts),
// kept in localStorage beside the codex: when each was first found, and at
// which depth. A fossil found is found for good; only erasing the codex lets
// go of them. Paired devices take in each other's (lib/sync: absorbFossils),
// keeping every fossil either has and, for one both have, the earlier find.
// A build that doesn't know fossils neither reads nor writes this entry, so
// it leaves them be; one with a newer format (a higher version) is never
// written over (keepAside.ts).

import { clearAside, openStored } from './keepAside.ts';
import { FOSSIL_IDS, fossilMask, isFossilId, type FossilId } from './fossils.ts';
import type { RunFossil } from './game.ts';
import { removeStored, storeKey, tryReadStored, writeStored } from './storage.ts';

/** One fossil found: when first (ms since 1970, this device's clock or the one it came from), and at which depth (the engine's: delve.ts shownDepth shows it). */
export interface FoundFossil {
  at: number;
  depth: number;
  /** Found in a run together. */
  together?: true;
}

export interface FossilStore {
  found: Partial<Record<FossilId, FoundFossil>>;
}

export const emptyFossils = (): FossilStore => ({ found: {} });

const NAME = 'fossils';
/** The whole key, as storage events name it. */
export const FOSSILS_KEY = storeKey(NAME);
/** Bump when the stored shape changes incompatibly. */
export const FOSSILS_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isDepth = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1_000_000;

/** One find as stored, cleaned up; null when it doesn't read as one. */
function parseFound(v: unknown): FoundFossil | null {
  if (!isObj(v) || !isStamp(v.at) || !isDepth(v.depth)) return null;
  return { at: v.at, depth: v.depth, ...(v.together === true ? { together: true as const } : {}) };
}

/** A stored entry, cleaned up (fossils this build doesn't know left out); null when it's missing, malformed or from another version. */
export function parseFossils(raw: string | null): FossilStore | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== FOSSILS_VERSION || !isObj(v.found)) return null;
  const found: FossilStore['found'] = {};
  for (const id of FOSSIL_IDS) {
    const f = Object.hasOwn(v.found, id) ? parseFound(v.found[id]) : null;
    if (f) found[id] = f;
  }
  return { found };
}

export const serializeFossils = (s: FossilStore) => JSON.stringify({ v: FOSSILS_VERSION, found: s.found });

/** The fossils in `s`, as a mask (fossils.ts fossilMask): what this device tells a host it holds. */
export const heldMask = (s: FossilStore) => fossilMask(Object.keys(s.found).filter(isFossilId));

/** How many fossils `s` holds. */
export const foundCount = (s: FossilStore) => Object.keys(s.found).length;

/** The earlier of two finds of one fossil (on a tie, the first). */
const earlier = (a: FoundFossil, b: FoundFossil) => (b.at < a.at ? b : a);

/**
 * Two stores as one: every fossil either has, with the earlier find of one
 * both have. Returns `mine` itself when `theirs` adds nothing.
 */
export function mergeFossils(mine: FossilStore, theirs: FossilStore): FossilStore {
  let changed = false;
  const found = { ...mine.found };
  for (const id of FOSSIL_IDS) {
    const t = theirs.found[id];
    if (!t) continue;
    const m = found[id];
    const keep = m ? earlier(m, t) : t;
    if (keep !== m) {
      found[id] = keep;
      changed = true;
    }
  }
  return changed ? { found } : mine;
}

// ---- storage -------------------------------------------------------------------

/** The stored fossils (none when there are none, or they can't be read). Always read fresh: another tab may have changed them. */
export function loadFossils(): FossilStore {
  return parseFossils(tryReadStored(NAME) ?? null) ?? emptyFossils();
}

/**
 * Keeps the fossils just found (`ids`, at depth `depth`), those not found
 * before; says which were new. None when they can't be written (storage
 * blocked, or a newer build's entry, never written over).
 */
export function keepFossils(ids: FossilId[], depth: number, together: boolean, at = Date.now()): FossilId[] {
  const o = openStored(NAME, FOSSILS_VERSION, parseFossils);
  if (!o) return [];
  const was = o.was ?? emptyFossils();
  const fresh = [...new Set(ids)].filter((id) => isFossilId(id) && !was.found[id]);
  if (!fresh.length || !isDepth(depth)) return [];
  const found = { ...was.found };
  for (const id of fresh) found[id] = { at, depth, ...(together ? { together: true as const } : {}) };
  return writeStored(NAME, serializeFossils({ found })) ? fresh : [];
}

/** This device's fossils as stored, for sync to pass on (lib/sync/shared.ts); null for none. */
export const ownFossilsRaw = () => tryReadStored(NAME) ?? null;

/** Takes in another of the player's devices' fossils (mergeFossils). Whether it changed anything. */
export function absorbFossils(raw: string): boolean {
  const theirs = parseFossils(raw);
  const o = theirs && openStored(NAME, FOSSILS_VERSION, parseFossils);
  if (!theirs || !o) return false;
  const was = o.was ?? emptyFossils();
  const next = mergeFossils(was, theirs);
  return next !== was && writeStored(NAME, serializeFossils(next));
}

/** Lets go of every fossil (the codex erased), and of what was kept aside of them. */
export function resetFossils() {
  removeStored(NAME);
  clearAside(NAME);
}

/**
 * Keeps every fossil a run gave this device's player (`me`; on one device,
 * `local`, whoever played): read from the run's own state (Delve fossils),
 * not the moment it was given, so a guest whose link dropped over the
 * reveal, or who reloaded into the depth after it, still keeps it. Those
 * already kept are skipped (keepFossils), so it can run on every state.
 * Says which were new.
 */
export function keepRunFossils(given: readonly RunFossil[], me: string | null, local: boolean, together: boolean): FossilId[] {
  const kept: FossilId[] = [];
  for (const f of given) if (local || (me !== null && f.to.includes(me))) kept.push(...keepFossils([f.id], f.depth, together, f.at));
  return kept;
}
