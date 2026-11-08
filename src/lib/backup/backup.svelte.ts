// Keeping a player's progress safe without an account (#190; README,
// "Keeping progress"). Safari deletes a site's storage after seven days of
// use without a visit, and clearing the browser's data deletes it anywhere;
// a passkey isn't the site's storage: it lives in the player's own password
// manager (iCloud Keychain, Google's, Windows Hello), which neither touches,
// and it follows them to a new phone on the same account.
//
// So "Keep it safe" makes a passkey whose user id is a secret of 32 random
// bytes (no server checks it: the passkey is only where the secret lives).
// The secret makes a bucket and a key (./seal.ts); each of the player's
// devices puts its own progress, sealed, in the bucket on the matchmaking
// server (signal/worker.js, Keep), with the copies it holds of the others'
// (a device whose browser was cleared lives on only there, if it died before
// it was kept or the bucket was another): a while after it changes, at most
// every few minutes, and as the page is hidden. "Bring it back" asks for the
// passkey, and takes every device's in as sync takes another device's
// (lib/sync/shared.ts takeCopies, takeIn): progress only goes up, and what a
// device counted is kept apart and never counted twice, the newest copy of
// each winning. A browser brought back is a new device, its old self one of
// the others.
//
// Sync passes the secret on (./kept.ts), so one press keeps every paired
// device's. Only the game itself keeps (SYNC_HERE): never the lab, the bot or
// the QA desk, whose benches set `backup` as they like and whose buttons only
// act it out.

import { BETA, CHANNEL, LOCAL } from '../channel.ts';
import { OWN_SIGNAL_HOST } from '../signalHost.ts';
import { QA, announceStored, onStoredHere, storeKey } from '../storage.ts';
import { toasts } from '../toasts.svelte.ts';
import { whenCalm } from '../idle.ts';
import { base64url, fromBase64url } from '../base64url.ts';
import { loadCodex } from '../codex.ts';
import { COPY_KINDS, MAX_COPY, SYNC_HERE, deviceId, isDevice, isStamp, readCopies, type CopyKind } from '../sync/store.ts';
import { OWN_NAMES, TAKEN_NAMES, fingerprint, ownNow, takeCopies, takeIn, takenNow } from '../sync/shared.ts';
import { KEPT_NAME, forgetKept, forgetSent, loadKept, loadSent, markAsked, nextAt, saveKept, saveSent, wasAsked } from './kept.ts';
import { fromSecret, newSecret, secretIn, seal, unseal, userId } from './seal.ts';
import { OFFER } from './words.ts';

/** How the backup stands, for the settings and the codex (the QA desk's benches set it). */
export const backup = $state({
  /** This browser can make and use a passkey, and the game keeps here. */
  supported: false,
  /** A secret is kept: this device's progress is kept with it. */
  on: false,
  /** When this device's progress was last sent (0: not yet). */
  savedAt: 0,
  /** What it is doing at the player's word. */
  busy: null as null | 'making' | 'bringing' | 'forgetting',
});

const BASE = OWN_SIGNAL_HOST ? `https://${OWN_SIGNAL_HOST}/keep/` : '';
/** What each channel's passkeys are called in the player's password manager, so the beta's isn't taken for the game's. */
const PASSKEY_NAMES = { live: 'PoE2.Quest progress', beta: 'PoE2.Quest beta progress', local: 'PoE2.Quest local progress' } as const;
const PASSKEY_NAME = PASSKEY_NAMES[BETA ? 'beta' : LOCAL ? 'local' : 'live'];
/** The most a device's entry may be, sealed: what the server keeps (signal/worker.js MAX_ENTRY). */
export const MAX_ENTRY = 512 * 1024;
/** And opened: as much as sync takes from another device at once (lib/sync/link.svelte.ts MAX_GIVE). */
const MAX_ENTRY_TEXT = 6 * MAX_COPY;
/** A change is sent this long after it, at the soonest. */
const SOON_MS = 20_000;
/** And no sooner than this after the last time. */
const APART_MS = 3 * 60_000;
/** The most a send may carry as the page goes away (a browser's limit for what goes on after it, 64 KB). */
const KEEPALIVE_MAX = 60_000;
/** The codex this full before the offer after a game: enough played for it to matter. */
export const OFFER_AT = 30;

function readState() {
  const k = loadKept();
  backup.on = !!k?.secret;
  const sent = loadSent();
  backup.savedAt = backup.on && sent ? sent.at : 0;
}

/** Whether this browser can keep progress with a passkey. */
async function canKeep(): Promise<boolean> {
  if (!SYNC_HERE || !BASE || !isSecureContext || typeof PublicKeyCredential === 'undefined' || !crypto?.subtle || typeof CompressionStream !== 'function') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** What a secret makes, made once each. */
const made = new Map<string, ReturnType<typeof fromSecret>>();
const fromKept = (secret: string) => {
  let m = made.get(secret);
  if (!m) made.set(secret, (m = fromSecret(fromBase64url(secret)!, CHANNEL)));
  return m;
};

// ---- sending ----------------------------------------------------------------------

/** One device's entry, as kept: its own copies, those it holds of its other devices', and what sync takes in. */
export interface Entry {
  copies: { device: string; kind: CopyKind; at: number; raw: string }[];
  taken: Record<string, string>;
}

/** This device's, to send (and its print), or null with nothing to keep: its own copies first, then the others' it holds, the newest first. */
export function entryNow(): { entry: Entry; print: string } | null {
  const me = deviceId();
  const own: Entry['copies'] = [];
  const held: Entry['copies'] = [];
  for (const kind of COPY_KINDS) {
    const mine = ownNow(kind);
    if (mine) own.push({ device: me, kind, ...mine });
    for (const [device, c] of Object.entries(readCopies(kind))) held.push({ device, kind, ...c });
  }
  const taken = takenNow();
  // (The secret isn't kept under itself.)
  delete taken.backup;
  if (!own.length && !held.length && !Object.keys(taken).length) return null;
  const entry: Entry = { copies: [...own, ...held.sort((a, b) => b.at - a.at)], taken };
  return { entry, print: fingerprint(JSON.stringify(entry)) };
}

/**
 * `entry` sealed for `device` in `bucket` within what the server keeps:
 * where it would be more, the copies held of the other devices go, the
 * oldest first. Null where the device's own progress is more already.
 */
export async function sealEntry(entry: Entry, key: CryptoKey, bucket: string, device: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const own = entry.copies.filter((c) => c.device === device).length;
  let copies = entry.copies;
  for (;;) {
    const data = await seal(JSON.stringify({ v: 1, copies, taken: entry.taken }), key, bucket, device);
    if (data.length <= MAX_ENTRY) return data;
    if (copies.length <= own) return null;
    // (As many as would fit at the size they came to, one fewer at least.)
    const fit = Math.floor(((copies.length - own) * MAX_ENTRY * 0.9) / data.length);
    copies = copies.slice(0, own + Math.min(fit, copies.length - own - 1));
  }
}

let sending: Promise<void> | null = null;

/** Sends this device's progress if it changed since it was last sent; `leaving`, as the page goes away. */
function send(leaving = false): Promise<void> {
  // (One at a time: a change meanwhile is sent after it.)
  if (sending) return sending.then(() => send(leaving));
  return (sending = sendNow(leaving).finally(() => (sending = null)));
}

async function sendNow(leaving: boolean) {
  const k = loadKept();
  if (!k?.secret) return;
  const now = entryNow();
  if (!now) return;
  const { bucket, key } = await fromKept(k.secret);
  const was = loadSent();
  if (was?.print === now.print && was.bucket === bucket) return;
  const me = deviceId();
  const data = await sealEntry(now.entry, key, bucket, me);
  // (Its own progress alone more than the server keeps of a device, many times a full codex: it can't be kept.)
  if (!data) return;
  try {
    const r = await fetch(BASE + `${bucket}/${me}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' }, keepalive: leaving && data.length <= KEEPALIVE_MAX });
    if (!r.ok) return schedule(APART_MS);
  } catch {
    // (Out of reach, or cut off as the page went away: again in a while, or as it's hidden next.)
    return schedule(APART_MS);
  }
  // (Forgotten meanwhile, or another secret taken: not this one's to stamp.)
  if (loadKept()?.secret !== k.secret) return;
  saveSent({ at: Date.now(), print: now.print, bucket });
  readState();
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** A change to send: soon, but no sooner than APART_MS after the last time (or `wait`, for a send that didn't go). */
function schedule(wait = Math.max(SOON_MS, (loadSent()?.at ?? 0) + APART_MS - Date.now())) {
  if (timer || !loadKept()?.secret) return;
  timer = setTimeout(() => {
    timer = null;
    whenCalm(() => void send());
  }, wait);
}

let watching = false;
/** Sends this device's progress as it changes (here or in another of its tabs), and as the page is hidden. */
function watch() {
  if (watching) return;
  watching = true;
  const names = new Set([...Object.values(OWN_NAMES).flat(), ...TAKEN_NAMES.filter((n) => n !== KEPT_NAME)]);
  const keys = new Set([...names].map(storeKey));
  onStoredHere((name) => {
    if (names.has(name)) schedule();
    // (Set or forgotten here, a press here or sync's.)
    if (name === KEPT_NAME) {
      readState();
      schedule();
    }
  });
  addEventListener('storage', (e) => {
    if (e.key === storeKey(KEPT_NAME) || e.key === null) readState();
    if (e.isTrusted && e.key && keys.has(e.key)) schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !timer) return;
    clearTimeout(timer);
    timer = null;
    void send(true);
  });
}

let checked: Promise<void> | null = null;
/** Finds out once whether this browser can keep progress with a passkey (backup.supported), and reads how it stands. */
export function checkBackup(): Promise<void> {
  if (!SYNC_HERE) return Promise.resolve();
  readState();
  return (checked ??= canKeep().then((can) => void (backup.supported = can)));
}

/**
 * Asks the browser to keep the site's storage when the device runs short of
 * room, where it says yes or no without asking the player: Chrome, by how much
 * the site is played; Safari, for a home-screen app (WebKit, "Updates to
 * Storage Policy"). Not in Firefox, which asks the player in a popup. It never
 * outlasts the player clearing the browser's data, nor Safari's seven days.
 */
function askToPersist() {
  if (/Firefox\/|FxiOS/.test(navigator.userAgent)) return;
  void navigator.storage?.persist?.().catch(() => {});
}

/** At startup, once the page is idle (main.ts): what the backup can do here, and anything not sent yet goes. */
export async function bootBackup() {
  if (!SYNC_HERE) return;
  askToPersist();
  await checkBackup();
  watch();
  schedule();
}

// ---- at the player's word ---------------------------------------------------------

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** The desk's buttons act it out: no passkey, no server. */
async function actedOut(busy: NonNullable<typeof backup.busy>, then: () => void) {
  backup.busy = busy;
  await new Promise((r) => setTimeout(r, 700));
  backup.busy = null;
  then();
}

/** Makes a passkey and keeps this device's progress with it from now on. */
export async function keepSafe() {
  if (backup.busy || backup.on) return;
  if (QA) return actedOut('making', () => ((backup.on = true), (backup.savedAt = Date.now())));
  // (Asked for before anything else is awaited: Safari makes a passkey only straight from the press.)
  const secret = newSecret();
  backup.busy = 'making';
  try {
    await navigator.credentials.create({
      publicKey: {
        challenge: challenge(),
        rp: { name: 'PoE2.Quest' },
        user: { id: userId(secret, CHANNEL), name: PASSKEY_NAME, displayName: PASSKEY_NAME },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
        attestation: 'none',
        timeout: 120_000,
      },
    });
  } catch (err) {
    backup.busy = null;
    // (Turned down at the passkey's sheet: nothing to say.)
    if ((err as DOMException)?.name !== 'NotAllowedError') toasts.show('This browser couldn’t make a passkey here.', 'error', { title: 'Not kept' });
    return;
  }
  saveKept({ secret: base64url(secret), at: nextAt() });
  readState();
  backup.busy = null;
  markAsked();
  if (timer) clearTimeout(timer);
  timer = null;
  void send();
  toasts.show('Your progress is kept with your passkey from now on, saved as you play.', 'info', { title: 'Kept safe' });
}

/** The entries kept under `secret`, each device's that opens, or null where the server can't be reached. */
async function fetchEntries(secret: string): Promise<{ device: string; entry: Entry }[] | null> {
  const { bucket, key } = await fromKept(secret);
  let body: Uint8Array<ArrayBuffer>;
  try {
    const r = await fetch(BASE + bucket);
    if (!r.ok) return null;
    body = new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
  const out: { device: string; entry: Entry }[] = [];
  for (const { device, data } of unpack(body)) {
    const text = await unseal(data, key, bucket, device, MAX_ENTRY_TEXT);
    const entry = text === null ? null : readEntry(text);
    if (entry) out.push({ device, entry });
  }
  return out;
}

/** The frames the server sends a bucket's entries in (signal/worker.js pack). */
export function unpack(body: Uint8Array<ArrayBuffer>): { device: string; data: Uint8Array<ArrayBuffer> }[] {
  const out: { device: string; data: Uint8Array<ArrayBuffer> }[] = [];
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  for (let at = 0; at + 16 <= body.length; ) {
    const device = new TextDecoder().decode(body.subarray(at, at + 12));
    const n = view.getUint32(at + 12);
    if (at + 16 + n > body.length) break;
    out.push({ device, data: body.slice(at + 16, at + 16 + n) });
    at += 16 + n;
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A device's entry as it was kept, or null for one this build can't read. */
export function readEntry(text: string): Entry | null {
  try {
    const v: unknown = JSON.parse(text);
    if (!isObj(v) || v.v !== 1 || !Array.isArray(v.copies) || !isObj(v.taken)) return null;
    const copies: Entry['copies'] = [];
    for (const c of v.copies)
      if (isObj(c) && isDevice(c.device) && COPY_KINDS.includes(c.kind as CopyKind) && isStamp(c.at) && typeof c.raw === 'string' && c.raw.length <= MAX_COPY)
        copies.push({ device: c.device, kind: c.kind as CopyKind, at: c.at, raw: c.raw });
    const taken: Record<string, string> = {};
    for (const [k, raw] of Object.entries(v.taken)) if (typeof raw === 'string') taken[k] = raw;
    return { copies, taken };
  } catch {
    return null;
  }
}

/** Takes in what was kept: every device's copies but this one's own (the newest of each), and what the others' took in; the names of what changed. */
export function takeEntries(entries: readonly { device: string; entry: Entry }[], me: string): string[] {
  const changed = takeCopies(
    entries.flatMap(({ entry }) => entry.copies),
    me,
  );
  for (const { device, entry } of entries) if (device !== me) for (const name of takeIn(entry.taken)) changed.add(name);
  return [...changed];
}

/** Asks for the passkey and brings back what was kept with it; keeps this device's with it from then on. */
export async function bringBack() {
  if (backup.busy) return;
  if (QA) return actedOut('bringing', () => ((backup.on = true), toasts.show('Your codex, Delve runs and achievements are back.', 'info', { title: 'Brought back' })));
  backup.busy = 'bringing';
  let handle: ArrayBuffer | null = null;
  try {
    const cred = (await navigator.credentials.get({ publicKey: { challenge: challenge(), userVerification: 'preferred', timeout: 120_000 } })) as PublicKeyCredential | null;
    handle = (cred?.response as AuthenticatorAssertionResponse | undefined)?.userHandle ?? null;
  } catch (err) {
    backup.busy = null;
    if ((err as DOMException)?.name !== 'NotAllowedError') toasts.show('This browser couldn’t use a passkey here.', 'error', { title: 'Not brought back' });
    return;
  }
  const got = handle && secretIn(new Uint8Array(handle), CHANNEL);
  if (!(got instanceof Uint8Array)) {
    backup.busy = null;
    // (The beta's, say, which the password manager offers here too: its progress is the beta's own.)
    toasts.show(got ? `That one is “${PASSKEY_NAMES[got.elsewhere]}”. Pick “${PASSKEY_NAME}”.` : 'That passkey isn’t one the game made.', 'error', { title: 'Not brought back' });
    return;
  }
  const secret = base64url(got);
  const entries = await fetchEntries(secret);
  backup.busy = null;
  if (!entries) {
    toasts.show('The server can’t be reached just now. Try again in a while.', 'error', { title: 'Not brought back' });
    return;
  }
  const changed = takeEntries(entries, deviceId());
  if (changed.length) announceStored(changed);
  // (Kept with it from now on, and every paired device with it: newer than any it had. All of it sent
  // again, whatever was sent before: the bucket may have been forgotten since.)
  saveKept({ secret, at: nextAt() });
  forgetSent();
  readState();
  markAsked();
  void send();
  toasts.show(entries.length ? 'Your codex, Delve runs and achievements are back.' : 'Nothing was kept with that passkey yet. Your progress is kept with it from now on.', 'info', { title: entries.length ? 'Brought back' : 'Kept safe' });
}

/** Deletes what was kept online and stops keeping it, here and on every paired device; this browser's progress stays. */
export async function forgetBackup() {
  if (backup.busy) return;
  if (QA) return actedOut('forgetting', () => ((backup.on = false), (backup.savedAt = 0)));
  const k = loadKept();
  if (!k?.secret) return;
  backup.busy = 'forgetting';
  const { bucket } = await fromKept(k.secret);
  let ok = false;
  try {
    ok = (await fetch(BASE + `${bucket}/forget`, { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).ok;
  } catch {
    /* out of reach */
  }
  backup.busy = null;
  if (!ok) {
    toasts.show('The server can’t be reached just now. Try again in a while.', 'error', { title: 'Not forgotten' });
    return;
  }
  saveKept({ secret: null, at: nextAt() });
  forgetSent();
  readState();
}

/**
 * The codex erased: this device's entry goes from the backup, and this
 * browser stops keeping (it stops syncing too). Not forgotten: paired again
 * with the others, it keeps with them again, and never stops theirs.
 */
export function eraseBackup() {
  const k = loadKept();
  if (!k?.secret || QA) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const secret = k.secret;
  forgetKept();
  forgetSent();
  readState();
  void fromKept(secret).then(({ bucket }) => fetch(BASE + `${bucket}/${deviceId()}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' } }).catch(() => {}));
}

/** After a game: once, where a passkey can keep it and there's enough played for it to matter, a notice offering to keep it safe. */
export function offerBackup() {
  if (!backup.supported || backup.on || wasAsked() || Object.keys(loadCodex().items).length < OFFER_AT) return;
  markAsked();
  toasts.show(OFFER.message, 'info', { ...OFFER.opts, action: { label: 'Keep it safe', run: () => void keepSafe() } });
}
