// What this browser keeps of its backup (lib/backup/backup.svelte.ts): the
// secret its progress is kept under, and whose it is. A secret this device
// made (Keep it safe) or brought back (Bring it back) is its own. Sync
// offers it to the player's other devices (lib/sync/shared.ts), and one that
// keeps with none borrows it, so it's kept too; a device never swaps a
// secret it has for an offered one. Saves only add up, so whichever passkey
// brings it back, it brings back what its devices knew.
//
// Stopped keeping, the record says why: a Forget pressed here ('here'),
// after which it never borrows again, only Keep it safe or Bring it back
// keeps again; or its backup forgotten on another device ('gone',
// backup.svelte.ts gone), after which it may borrow another, but never that
// one again. The server keeps a mark where a forgotten backup was, so
// whatever a device sends there after is refused.

import { readStored, removeStored, writeStored } from '../storage.ts';
import { fromBase64url } from '../base64url.ts';
import { OWN_SIGNAL_HOST } from '../signalHost.ts';
import { SECRET_BYTES } from './seal.ts';

export const KEPT_NAME = 'backup';

/** Keeping, or stopped keeping; no record where it never kept (or an older build erased it with the codex). */
export type Kept =
  | {
      /** The secret, in base64url. */
      secret: string;
      /** The bucket it keeps in (none where an older build saved it without). */
      bucket?: string;
      /** Made or brought back here; false: borrowed through sync. */
      own: boolean;
      /** When it was set (Date.now()), for display and tests only. */
      at: number;
    }
  | {
      secret: null;
      /** The bucket it kept in (none where an older build saved it without). */
      bucket?: string;
      /** Forget pressed here, or its backup forgotten on another device. */
      stopped: 'here' | 'gone';
      at: number;
    };

export const isSecret = (v: unknown): v is string => typeof v === 'string' && fromBase64url(v)?.length === SECRET_BYTES;
/** A bucket's name, as the server takes it (signal/worker.js BUCKET). */
const isBucket = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

/** A record as stored: this build's (v2), or one an older build saved (v1: `{ v: 1, secret, at, bucket? }`, its secret its own, or forgotten here). */
function parseKept(raw: string | null): Kept | null {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (typeof v !== 'object' || v === null) return null;
    const { v: version, secret: s, at, bucket, own, stopped } = v as Record<string, unknown>;
    if ((version !== 1 && version !== 2) || typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0) return null;
    const secret = s === null ? null : isSecret(s) ? s : undefined;
    if (secret === undefined) return null;
    const where = isBucket(bucket) ? { bucket } : {};
    if (version === 1) return secret ? { secret, ...where, own: true, at } : { secret: null, ...where, stopped: 'here', at };
    if (secret) return typeof own === 'boolean' ? { secret, ...where, own, at } : null;
    return stopped === 'here' || stopped === 'gone' ? { secret: null, ...where, stopped, at } : null;
  } catch {
    return null;
  }
}

export const loadKept = (): Kept | null => parseKept(readStored(KEPT_NAME));
export const saveKept = (k: Kept) => writeStored(KEPT_NAME, JSON.stringify({ v: 2, ...k }));

/** What this device offers its paired devices through sync: its record where it keeps (own or borrowed), else null. */
export const ownKeptRaw = (): string | null => (loadKept()?.secret ? readStored(KEPT_NAME) : null);

/** Whether this browser can seal what it keeps and send it (not Safari before 16.4): where it can't, it never says it keeps. */
export const canSeal = () => !!OWN_SIGNAL_HOST && globalThis.isSecureContext === true && !!globalThis.crypto?.subtle && typeof CompressionStream === 'function';

/**
 * Another device's offer, borrowed where this device keeps with none: it
 * never kept, or its backup was forgotten on another device and this is
 * another one. An older build's record borrows as well (an older build
 * can't read this one's, so it passes it over). Whether it was.
 */
export function absorbKept(raw: string): boolean {
  const theirs = parseKept(raw);
  if (!theirs?.secret || !canSeal()) return false;
  const mine = loadKept();
  // (Forgotten: never that one again. One whose bucket isn't named may be it, so it isn't taken either.)
  if (mine && !(mine.secret === null && mine.stopped === 'gone' && mine.bucket && theirs.bucket && theirs.bucket !== mine.bucket)) return false;
  // (All of it sent under the one borrowed, whatever was sent before.)
  forgetSent();
  return saveKept({ secret: theirs.secret, ...(theirs.bucket ? { bucket: theirs.bucket } : {}), own: false, at: Date.now() });
}

/** When this device's progress was last sent, and what it was (its print), and to which bucket. */
const SENT = 'backup.sent';
export interface Sent {
  at: number;
  print: string;
  bucket: string;
}
export function loadSent(): Sent | null {
  try {
    const v: unknown = JSON.parse(readStored(SENT) ?? 'null');
    const s = v as Partial<Sent> | null;
    return s && typeof s.at === 'number' && typeof s.print === 'string' && typeof s.bucket === 'string' ? { at: s.at, print: s.print, bucket: s.bucket } : null;
  } catch {
    return null;
  }
}
export const saveSent = (s: Sent) => writeStored(SENT, JSON.stringify(s));
export const forgetSent = () => removeStored(SENT);

/** The offer after a game (lib/backup/backup.svelte.ts offerBackup) was made: never again. */
const ASKED = 'backup.asked';
export const wasAsked = () => readStored(ASKED) !== null;
export const markAsked = () => writeStored(ASKED, '1');
