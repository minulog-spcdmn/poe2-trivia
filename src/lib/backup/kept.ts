// What this browser keeps of its backup (lib/backup/backup.svelte.ts): the
// secret its progress is kept under, and when it was set. Sync passes it to
// the player's other devices (lib/sync/shared.ts), so they keep theirs under
// the same, and the newer of two always wins: a backup turned on on one
// device is on on all of them, and one forgotten is forgotten on all of them.
// A Forget names the backup it forgot, and each device that hears of it
// deletes that backup again, whatever it sent before it heard
// (backup.svelte.ts). Which record wins is only ever the newer: so every
// device ends on the same one, whatever order they meet in.
//
// A device that moves from one secret to another (a newer one through sync,
// another passkey brought back) or erases its codex leaves its entry behind
// under the old one: frozen there, it would come back as if it were all of
// its progress. So it notes it (LEFT), and once its progress is saved under
// the new one puts a note in its place saying where it went, or takes it out
// where it stopped keeping (backup.svelte.ts clearLeft): a passkey brings
// back everything, following the notes, or nothing.

import { readStored, removeStored, writeStored } from '../storage.ts';
import { fromBase64url } from '../base64url.ts';
import { SECRET_BYTES } from './seal.ts';
import { deviceId, isDevice } from '../sync/store.ts';

export const KEPT_NAME = 'backup';

export interface Kept {
  /** The secret, in base64url; null once it was forgotten. */
  secret: string | null;
  /** When it was set or forgotten (on that device's clock). */
  at: number;
  /** The bucket it keeps in, or forgotten, the one it kept in (none where an older build saved it). */
  bucket?: string;
}

export const isSecret = (v: unknown): v is string => typeof v === 'string' && fromBase64url(v)?.length === SECRET_BYTES;
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

/** Another device's, taken where it is newer; whether it was. */
export function absorbKept(raw: string): boolean {
  const theirs = parseKept(raw);
  const mine = loadKept();
  if (!theirs || (mine && mine.at >= theirs.at)) return false;
  // (Forgotten: what was sent went with the bucket, so all of it goes again if it's brought back.)
  if (!theirs.secret) forgetSent();
  // (Moved on to another: this device's entry under the one it had goes, once it's saved under the new one.)
  if (mine?.secret && theirs.secret && mine.secret !== theirs.secret) leave(mine.secret, deviceId(), theirs.secret);
  // (Stopped by a Forget: nothing of its own to note, since the bucket goes whole, but what waited for a save under it waits no more.)
  else if (mine?.secret && !theirs.secret) repoint(mine.secret, null);
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

/**
 * A device's entry under a secret it left (`after`: the one it moved to,
 * null where it stopped keeping), to be taken out of the server: the
 * oldest first, and no more than MAX_LEFT. Only ever this browser's own,
 * never passed on by sync.
 */
const LEFT = 'backup.left';
export interface Left {
  secret: string;
  device: string;
  after: string | null;
}
export const MAX_LEFT = 8;
const isLeft = (v: unknown): v is Left => {
  const l = v as Partial<Left> | null;
  return typeof l === 'object' && l !== null && isSecret(l.secret) && isDevice(l.device) && (l.after === null || isSecret(l.after));
};
/** What's waiting to be taken out (none where an older build saved nothing of it). */
export function loadLeft(): Left[] {
  try {
    const v: unknown = JSON.parse(readStored(LEFT) ?? '[]');
    return Array.isArray(v) ? v.filter(isLeft) : [];
  } catch {
    return [];
  }
}
const saveLeft = (list: Left[]) => (list.length ? writeStored(LEFT, JSON.stringify(list.slice(-MAX_LEFT))) : removeStored(LEFT));
/** What waited for a save under `from` waits for one under `to` instead (null: for none), as the device moves on from it before any. */
export function repoint(from: string, to: string | null) {
  const list = loadLeft();
  if (list.some((l) => l.after === from)) saveLeft(list.map((l) => (l.after === from ? { ...l, after: to } : l)));
}
/** `device`'s entry under `secret`, left for `after`: noted, to be taken out. */
export function leave(secret: string, device: string, after: string | null) {
  repoint(secret, after);
  saveLeft([...loadLeft().filter((l) => !(l.secret === secret && l.device === device)), { secret, device, after }]);
}
/** One taken out (or no longer to be). */
export const dropLeft = (gone: Left) => saveLeft(loadLeft().filter((l) => !(l.secret === gone.secret && l.device === gone.device)));

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
