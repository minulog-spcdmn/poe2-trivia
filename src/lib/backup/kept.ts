// What this browser keeps of its backup (lib/backup/backup.svelte.ts): the
// secret its progress is kept under, and when it was set. Sync passes it to
// the player's other devices (lib/sync/shared.ts), so they keep theirs under
// the same, and the newer of two always wins: a backup turned on on one
// device is on on all of them, and one forgotten is forgotten on all of them.
// A Forget names the backup it forgot, so it never stops one kept with
// another passkey, and each device that hears of it deletes that backup
// again, whatever it sent before it heard (backup.svelte.ts).

import { readStored, removeStored, writeStored } from '../storage.ts';
import { fromBase64url } from '../base64url.ts';
import { SECRET_BYTES } from './seal.ts';

export const KEPT_NAME = 'backup';

export interface Kept {
  /** The secret, in base64url; null once it was forgotten. */
  secret: string | null;
  /** When it was set or forgotten (on that device's clock). */
  at: number;
  /** The bucket it keeps in, or forgotten, the one it kept in (none where an older build saved it). */
  bucket?: string;
}

const isSecret = (v: unknown): v is string => typeof v === 'string' && fromBase64url(v)?.length === SECRET_BYTES;
/** A bucket's name, as the server takes it (signal/worker.js BUCKET). */
const isBucket = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

function parseKept(raw: string | null): Kept | null {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (typeof v !== 'object' || v === null) return null;
    const { v: version, secret, at, bucket } = v as Record<string, unknown>;
    if (version !== 1 || typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0) return null;
    if (secret !== null && !isSecret(secret)) return null;
    return isBucket(bucket) ? { secret, at, bucket } : { secret, at };
  } catch {
    return null;
  }
}

export const loadKept = (): Kept | null => parseKept(readStored(KEPT_NAME));
export const saveKept = (k: Kept) => writeStored(KEPT_NAME, JSON.stringify({ v: 1, ...k }));
/** None set here, not even forgotten: another device's, met again, is taken in (the codex erased). */
export const forgetKept = () => removeStored(KEPT_NAME);
/** When a secret set or forgotten now is from: later than the one it replaces, whatever this device's clock says, so a Forget is never undone by a device whose clock runs ahead. */
export const nextAt = () => Math.max(Date.now(), (loadKept()?.at ?? 0) + 1);

/** As sync sends it: null where nothing was ever set. */
export const ownKeptRaw = (): string | null => (loadKept() ? readStored(KEPT_NAME) : null);

/**
 * Whether `a` takes `b`'s place: the newer, but a Forget only ever stops the
 * backup it names. One kept with another passkey stays, and comes in over it.
 */
export function takesOver(a: Kept, b: Kept): boolean {
  const names = (forgot: Kept, live: Kept) => !forgot.bucket || !live.bucket || forgot.bucket === live.bucket;
  if (!a.secret && b.secret && !names(a, b)) return false;
  if (a.secret && !b.secret && !names(b, a)) return true;
  return a.at > b.at;
}

/** Another device's, taken where it takes this one's place; whether it was. */
export function absorbKept(raw: string): boolean {
  const theirs = parseKept(raw);
  const mine = loadKept();
  if (!theirs || (mine && !takesOver(theirs, mine))) return false;
  // (Forgotten: what was sent went with the bucket, so all of it goes again if it's brought back.)
  if (!theirs.secret) forgetSent();
  return saveKept(theirs);
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

/** The last Forget this device deleted the backup for (its own, or one taken in), as `bucket@at`. */
const FORGOT = 'backup.forgot';
const forgetMark = (k: Kept) => `${k.bucket}@${k.at}`;
/** A Forget with the bucket it names, not yet deleted from here: null where there is none. */
export function forgetToSend(): Kept | null {
  const k = loadKept();
  return k && !k.secret && k.bucket && readStored(FORGOT) !== forgetMark(k) ? k : null;
}
export const markForgotten = (k: Kept) => writeStored(FORGOT, forgetMark(k));

/** The offer after a game (lib/backup/backup.svelte.ts offerBackup) was made: never again. */
const ASKED = 'backup.asked';
export const wasAsked = () => readStored(ASKED) !== null;
export const markAsked = () => writeStored(ASKED, '1');
