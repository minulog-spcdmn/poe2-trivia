// The player auras this browser's player owns (lib/auraKinds.ts) and the one
// they wear, kept in localStorage beside the class sigils (lib/sigils.ts), and
// never sent anywhere but as the one worn (lib/auraKinds.ts shownAura says
// what others see of it), and to the player's own devices, paired to sync
// (lib/sync: absorbAuras) or kept with a passkey (lib/backup/).
//
// One found is owned for good: erasing the codex keeps them, as it keeps the
// sigils (the owner's call). Owned ones this build doesn't know (a newer
// build's) are kept as they are, through reading, writing and sync, so a
// device without an aura never takes another's find away; likewise the one
// worn, which this build shows as none (wornAura) until it knows it. What
// decides that one is found, and whether it's worn at once, isn't here.

import { AURAS, isWornAura, type AuraKind } from './auraKinds.ts';
import { openStored } from './keepAside.ts';
import { storeKey, tryReadStored, writeStored } from './storage.ts';

/** One aura found: when first (ms since 1970, this device's clock or the one it came from), and where, if it's known. */
export interface FoundAura {
  at: number;
  /** The game's mode it was found in (game.ts GameMode, or a newer build's). */
  mode?: string;
  /** Delve: the depth it was found at (the engine's: delve.ts shownDepth shows it). */
  depth?: number;
}

export interface AuraStore {
  /** The auras owned, by kind: every kind stored, this build's or not (owns says which). */
  owned: Record<string, FoundAura>;
  /** The one worn, as stored (one of `owned`, maybe one this build doesn't know): wornAura says what it is here. */
  worn: string | null;
  /** When the one worn was put on (or taken off), on this browser's clock: the latest of the player's devices' is worn on all (lib/sync). */
  wornAt?: number;
}

export const emptyAuras = (): AuraStore => ({ owned: {}, worn: null });

const NAME = 'auras';
/** The whole key, as storage events name it. */
export const AURAS_KEY = storeKey(NAME);
/** Bump when the stored shape changes incompatibly. */
export const AURAS_VERSION = 1;

/** The most kinds kept: far more than there are, so a damaged entry can't grow without end. */
const MAX_KINDS = 200;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isDepth = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1_000_000;
/** A kind's name as any build writes them: this build's and those to come. */
const isKindName = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(v);
const isMode = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(v);

/** One find as stored, cleaned up; null when it doesn't read as one. */
function parseFound(v: unknown): FoundAura | null {
  if (!isObj(v) || !isStamp(v.at)) return null;
  return { at: v.at, ...(isMode(v.mode) ? { mode: v.mode } : {}), ...(isDepth(v.depth) ? { depth: v.depth } : {}) };
}

/** Whether `s` owns `kind`. */
export const owns = (s: AuraStore, kind: string) => Object.hasOwn(s.owned, kind);

/** The auras in `s` this build knows, in the order AURAS lists them. */
export const ownedAuras = (s: AuraStore): AuraKind[] => AURAS.filter((k) => owns(s, k));

/** The aura `s` wears, as this build sees it: none for one it doesn't know or has benched. */
export const wornAura = (s: AuraStore): AuraKind | null => (isWornAura(s.worn) ? s.worn : null);

/** A stored entry, cleaned up (unknown kinds kept); null when it's missing, malformed or from another version. */
export function parseAuras(raw: string | null): AuraStore | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== AURAS_VERSION || !isObj(v.owned)) return null;
  const owned: AuraStore['owned'] = {};
  let n = 0;
  for (const [kind, f] of Object.entries(v.owned)) {
    const found = isKindName(kind) ? parseFound(f) : null;
    if (!found) continue;
    owned[kind] = found;
    if (++n >= MAX_KINDS) break;
  }
  const worn = isKindName(v.worn) && Object.hasOwn(owned, v.worn) ? v.worn : null;
  return { owned, worn, ...(isStamp(v.wornAt) ? { wornAt: v.wornAt } : {}) };
}

export const serializeAuras = (s: AuraStore) => JSON.stringify({ v: AURAS_VERSION, owned: s.owned, worn: s.worn, ...(s.wornAt ? { wornAt: s.wornAt } : {}) });

/** `s` with `kind` owned, found as `found`; `s` itself when it's owned already (the first find stands). Never wears it. */
export function gain(s: AuraStore, kind: AuraKind, found: FoundAura): AuraStore {
  if (owns(s, kind) || !isStamp(found.at)) return s;
  const f: FoundAura = { at: found.at, ...(isMode(found.mode) ? { mode: found.mode } : {}), ...(isDepth(found.depth) ? { depth: found.depth } : {}) };
  return { ...s, owned: { ...s.owned, [kind]: f } };
}

/** `s` with `kind` worn (null: none); `s` itself when it's worn already, or isn't owned or can't be worn now (benched). */
export function wear(s: AuraStore, kind: AuraKind | null): AuraStore {
  if (kind === s.worn) return s;
  if (kind !== null && (!owns(s, kind) || !isWornAura(kind))) return s;
  return { ...s, worn: kind };
}

/**
 * Two stores as one: every aura either owns, at the earlier find of one
 * both own, and the one worn of whichever put theirs on later. Returns
 * `mine` itself when `theirs` changes nothing.
 */
export function mergeAuras(mine: AuraStore, theirs: AuraStore): AuraStore {
  let changed = false;
  const owned = { ...mine.owned };
  for (const [kind, t] of Object.entries(theirs.owned)) {
    const m = Object.hasOwn(owned, kind) ? owned[kind] : undefined;
    if (m && m.at <= t.at) continue;
    owned[kind] = t;
    changed = true;
  }
  const later = (theirs.wornAt ?? 0) > (mine.wornAt ?? 0);
  if (later && (theirs.worn !== mine.worn || theirs.wornAt !== mine.wornAt)) {
    return { owned, worn: theirs.worn, ...(theirs.wornAt ? { wornAt: theirs.wornAt } : {}) };
  }
  return changed ? { ...mine, owned } : mine;
}

// ---- storage -------------------------------------------------------------------

/** The stored auras (none when there are none, or they can't be read). Always read fresh: another tab may have changed them. */
export function loadAuras(): AuraStore {
  return parseAuras(tryReadStored(NAME) ?? null) ?? emptyAuras();
}

/**
 * Changes the stored auras by `change`, and says where they stand now; null
 * when they can't be written (storage blocked, or a newer build's, which are
 * never written over). Anything else unreadable is kept aside first.
 */
function change(change: (s: AuraStore) => AuraStore): AuraStore | null {
  const o = openStored(NAME, AURAS_VERSION, parseAuras);
  if (!o) return null;
  const was = o.was ?? emptyAuras();
  const changed = change(was);
  if (changed === was) return was;
  const next = changed.worn === was.worn ? changed : { ...changed, wornAt: Date.now() };
  return writeStored(NAME, serializeAuras(next)) ? next : null;
}

/** Keeps `kind` as found (`found`), if it isn't owned already; not worn (gain). */
export const gainAura = (kind: AuraKind, found: FoundAura) => change((s) => gain(s, kind, found));

/** Wears `kind`, one owned (null: none). */
export const wearAura = (kind: AuraKind | null) => change((s) => wear(s, kind));

/** This device's auras as stored, for sync to pass on (lib/sync/shared.ts); null for none. */
export const ownAurasRaw = () => tryReadStored(NAME) ?? null;

/** Takes in another of the player's devices' auras (mergeAuras). Whether it changed anything. */
export function absorbAuras(raw: string): boolean {
  const theirs = parseAuras(raw);
  const o = theirs && openStored(NAME, AURAS_VERSION, parseAuras);
  if (!theirs || !o) return false;
  const was = o.was ?? emptyAuras();
  const next = mergeAuras(was, theirs);
  return next !== was && writeStored(NAME, serializeAuras(next));
}
