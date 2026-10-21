// What sync keeps in this browser (lib/sync/link.svelte.ts runs it): the code it is
// paired with, its own name among the player's devices, and its copies of
// the others' progress.
//
// Progress only ever goes up. Some of it is the same wherever it was made,
// and is simply taken in (lib/sync/shared.ts): an achievement, a sigil, a
// best. What is counted is not: an item seen ten times on one device and
// four on the other was seen fourteen times, and taking the other's count in
// would count it again at every sync. So each device keeps, beside its own,
// a copy of every other device's counted progress (its codex, its Delve
// records, its practice tally) as that device stores it, and reads its own
// and the copies together (lib/codex.ts loadCodex, lib/delveRecord.ts
// loadRecords). A copy is only ever replaced by a newer one of the same
// device, and devices pass on the copies they hold, so a third device's
// progress reaches the others by way of whichever it last met.

import { BACKDROP_TOOL, BOT, COPIES_OF, LAB, QA, onStorageFull, onStoredHere, readStored, removeStored, storeKey, writeStored } from '../storage.ts';

/** Only the game itself syncs: never the lab, the tools, the bot or the QA desk, whose progress is theirs alone. */
export const SYNC_HERE = typeof document !== 'undefined' && !(LAB || BACKDROP_TOOL || BOT || QA);

/** What each device keeps of the others: what sync passes on as copies. */
export const COPY_KINDS = ['codex', 'delve', 'practice'] as const;
export type CopyKind = (typeof COPY_KINDS)[number];

/** One device's progress of one kind, as it stored it, and when it last changed (on that device's clock). */
export interface Copy {
  at: number;
  raw: string;
}

/** The longest a copy can be (a full codex is well under a megabyte). */
export const MAX_COPY = 4_000_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A device's name: what deviceId makes. */
export const isDevice = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-z]{12}$/.test(v);
export const isStamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

// ---- the pairing ---------------------------------------------------------------

const PAIR = 'sync.pair';
export const PAIR_NAME = PAIR;

export interface Pairing {
  code: string;
  /** Another device has been met with this code: until then the pairing is only offered, and let go if nothing comes of it (UNMET_MS). */
  met: boolean;
  /** Unmet: when the code was made or taken. */
  at?: number;
  /** Unmet: the code this device was synced under before it took this one (a new device's), so it brings that device home to the others rather than leaving them. */
  home?: string;
  /** Unmet: made on starting over, so a synced device that takes it comes to it rather than bringing this one home to the group it left (pairingAnew). */
  anew?: boolean;
}

/** How long a pairing that has met no device is kept: the other device has long come by then, or isn't coming. */
export const UNMET_MS = 10 * 60_000;

export const isCode = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Z]{16}$/.test(v);

/** The pairing stored, or null when this browser isn't paired. */
export function loadPairing(): Pairing | null {
  try {
    const v: unknown = JSON.parse(readStored(PAIR) ?? 'null');
    if (!isObj(v) || v.v !== 1 || !isCode(v.code)) return null;
    if (v.met === true) return { code: v.code, met: true };
    return {
      code: v.code,
      met: false,
      at: typeof v.at === 'number' ? v.at : 0,
      ...(isCode(v.home) && v.home !== v.code ? { home: v.home } : v.anew === true ? { anew: true } : {}),
    };
  } catch {
    return null;
  }
}

/** A device's pairing as the rules of meeting see it (lib/sync/link.svelte.ts keeps it as state). */
export interface Paired {
  code: string | null;
  met: boolean;
  home: string | null;
  /** Its code was made on starting over (Pairing.anew). */
  anew?: boolean;
}

/**
 * A pairing as it stands at `now`: one that met nobody in time goes back to
 * the code the device came from (or is let go of: null), and one stamped
 * ahead of the clock (set back since) counts from now. One started over
 * waits for good: the player's other devices may come days later, and let
 * go of it, the device would offer a plain new code, which a device of the
 * group it left would take it home to. The same pairing when nothing changed.
 */
export function pairingNow(p: Pairing | null, now: number): Pairing | null {
  if (!p || p.met) return p;
  const at = p.at ?? 0;
  if (at > now) return { ...p, at: now };
  if (now - at > UNMET_MS && !p.anew) return p.home ? { code: p.home, met: true } : null;
  return p;
}

/**
 * Whether a pairing let go of (`was` read from storage, `now` what is left
 * of it) went because its code met nobody in time, rather than because the
 * player let go of it: lapsed here, or gone in another tab once it was past
 * its time there (`waitingSince`, when the code this tab held was made).
 */
export const lapsed = (was: Pairing | null, now: Pairing | null, waitingSince: number | null, at: number): boolean =>
  !now && (!!was || (waitingSince !== null && at - waitingSince > UNMET_MS));

/**
 * What a device says of itself as it meets another: that it brings a new
 * device home, or is new itself, with nowhere else to go (and, started over,
 * that it is new on purpose and goes nowhere else).
 */
export const meeting = (me: Paired): { home: string } | { fresh: true; anew?: true } | Record<string, never> =>
  me.home ? { home: me.home } : !me.met ? { fresh: true, ...(me.anew ? { anew: true as const } : {}) } : {};

/**
 * Where two devices go once they've met and given each other what they have
 * (each works it out alike): this one's home when it brings a new device, the
 * other's when it brings this new one; null to stay with the code they met by.
 * A device that started over is never taken home: the one that took its code
 * stays on it, and lets go of the group it came from.
 */
export function homeOnMeeting(me: Paired, them: { home?: unknown; fresh?: unknown; anew?: unknown }): string | null {
  if (me.home && them.fresh === true) return them.anew === true ? null : me.home;
  return isCode(them.home) && !me.met && !me.home && !me.anew ? them.home : null;
}

/**
 * The pairing a device takes with another device's code: its own group's
 * again is simply home; synced already, it keeps its code as the home it
 * brings the other to. Null for the code it has.
 */
export function pairingTaking(code: string, me: Paired, now: number): Pairing | null {
  if (code === me.home) return { code, met: true };
  if (code === me.code) return null;
  const home = me.met ? me.code : me.home;
  return { code, met: false, at: now, ...(home && home !== code ? { home } : {}) };
}

/**
 * The pairing a device starts over with: out of its group (nothing said to
 * it), on a new code of its own that every device it is to sync with again
 * takes, one by one, and comes to (homeOnMeeting). It waits for them however
 * long they take (pairingNow).
 */
export const pairingAnew = (code: string, now: number): Pairing => ({ code, met: false, at: now, anew: true });

/** The pairing left on unpairing: a code taken but not met yet goes back to the one before; otherwise none. */
export const pairingAfterUnpair = (me: Paired): Pairing | null => (!me.met && me.home ? { code: me.home, met: true } : null);

export const savePairing = (p: Pairing) => writeStored(PAIR, JSON.stringify({ v: 1, ...p }));
export const forgetPairing = () => removeStored(PAIR);

const DEVICE = 'sync.device';

/** This browser's name among the player's devices: made once, at random, and kept. */
export function deviceId(): string {
  const was = readStored(DEVICE);
  if (isDevice(was)) return was;
  const made = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
  writeStored(DEVICE, made);
  return made;
}

// ---- the copies ----------------------------------------------------------------

/** The entry each kind of copy is read into (the device's own): the codex, the Delve records, the practice tally. */
export const VIEW: Record<CopyKind, keyof typeof COPIES_OF> = { codex: 'codex2', delve: 'delve2', practice: 'practice' };
const copiesName = (kind: CopyKind) => COPIES_OF[VIEW[kind]];
export const COPY_NAMES = COPY_KINDS.map(copiesName);
/** The most devices whose copies are kept: past that, the one heard from longest ago goes (a browser whose site data was cleared comes back as a new device, and the old name would be kept for good). */
export const KEEP_DEVICES = 8;

/** The copies of one kind held, by device. */
export function readCopies(kind: CopyKind): Record<string, Copy> {
  return parseCopies(readStored(copiesName(kind)));
}

function parseCopies(raw: string | null): Record<string, Copy> {
  const out: Record<string, Copy> = {};
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!isObj(v) || v.v !== 1 || !isObj(v.devices)) return out;
    for (const [device, c] of Object.entries(v.devices))
      if (isDevice(device) && isObj(c) && isStamp(c.at) && typeof c.raw === 'string' && c.raw.length <= MAX_COPY) out[device] = { at: c.at, raw: c.raw };
  } catch {
    /* none to read */
  }
  return out;
}

/**
 * Keeps `copy` as `device`'s of `kind` (newer than the one held: the caller
 * checks); whether it could be stored. Past KEEP_DEVICES, or where the
 * browser has no room left, the copies heard from longest ago go first, so
 * the copies never crowd out the device's own progress for long.
 */
export function keepCopy(kind: CopyKind, device: string, copy: Copy): boolean {
  const list = Object.entries({ ...readCopies(kind), [device]: copy })
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, KEEP_DEVICES);
  while (list.some(([d]) => d === device)) {
    if (writeStored(copiesName(kind), JSON.stringify({ v: 1, devices: Object.fromEntries(list) }))) return true;
    // (No room: the oldest other goes, then this one if it's all that's left.)
    const oldest = list.findLastIndex(([d]) => d !== device);
    list.splice(oldest >= 0 ? oldest : 0, 1);
  }
  return false;
}

// The browser out of room for something of the device's own: the copies go first, the one heard from longest ago
// first (they come again at the next meeting), before the device's own progress loses anything (the codex's oldest
// answers, which it lets go of when it can't be stored).
onStorageFull(() => {
  let oldest: { kind: CopyKind; device: string; at: number } | null = null;
  for (const kind of COPY_KINDS) for (const [device, c] of Object.entries(readCopies(kind))) if (!oldest || c.at < oldest.at) oldest = { kind, device, at: c.at };
  if (!oldest) return false;
  const rest = readCopies(oldest.kind);
  delete rest[oldest.device];
  const name = copiesName(oldest.kind);
  return Object.keys(rest).length ? writeStored(name, JSON.stringify({ v: 1, devices: rest })) : removeStored(name);
}, COPY_NAMES);

/** Lets go of every copy (the codex erased: what the others had is theirs to keep). */
export function clearCopies() {
  for (const name of COPY_NAMES) removeStored(name);
}

/**
 * The copies of `kind` read with `parse`, each device's that it can read
 * (one from a build with another format is left out). Parsed again only
 * when the stored copies change, as the codex is read often.
 */
export function copiesOf<T>(kind: CopyKind, parse: (raw: string) => T | null): T[] {
  const was = cache.get(kind);
  if (was && was.parse === parse) return was.list as T[];
  const raw = readStored(copiesName(kind));
  const list = raw ? Object.values(parseCopies(raw)).flatMap((c) => parse(c.raw) ?? []) : [];
  cache.set(kind, { parse, list });
  return list;
}
// Kept until the copies change, written in this tab or another (the copies run to megabytes: not read from
// storage every time the codex is).
const cache = new Map<CopyKind, { parse: unknown; list: unknown[] }>();
onStoredHere((name) => {
  for (const kind of COPY_KINDS) if (name === copiesName(kind)) cache.delete(kind);
});
if (typeof addEventListener === 'function')
  addEventListener('storage', (e) => {
    for (const kind of COPY_KINDS) if (e.key === null || e.key === storeKey(copiesName(kind))) cache.delete(kind);
  });
