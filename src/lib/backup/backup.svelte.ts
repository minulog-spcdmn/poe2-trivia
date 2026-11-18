// Keeping a player's progress safe without an account (#190; README,
// "Keeping progress"). Safari deletes a site's storage after seven days of
// use without a visit, and clearing the browser's data deletes it anywhere;
// a passkey isn't the site's storage: it lives in the player's own password
// manager (iCloud Keychain, Google's, Windows Hello), which neither touches,
// and it follows them to a new phone on the same account.
//
// So "Keep it safe" makes a passkey whose user id is a secret of 32 random
// bytes (no server checks it: the passkey is only where the secret lives).
// The secret makes a bucket and a key (./seal.ts); the device puts its
// progress, sealed, in the bucket on the matchmaking server (signal/worker.js,
// Keep), with the copies it holds of its paired devices' (a device whose
// browser was cleared lives on only there, if it died before it was kept):
// a while after it changes, at most every ten minutes, and as the page is
// hidden. "Bring it back" asks for the passkey, and takes every device's in
// as sync takes another device's (lib/sync/shared.ts takeCopies, takeIn):
// progress only goes up, and what a device counted is kept apart and never
// counted twice, the newest copy of each winning. A browser brought back is
// a new device, its old self one of the others.
//
// A secret made or brought back here is this device's own; a paired device
// without one borrows it through sync (./kept.ts), and keeps in its bucket
// too. A device never swaps a secret it has for an offered one, and saves
// only add up, so each device's passkey brings back everything its devices
// knew at their last save, and bringing back the same twice can't hurt.
// Erasing the codex leaves the backup alone: sync's erase gives the browser
// a new name, so its next save is a new entry, and Bring it back can undo
// the erase. Forget deletes the bucket and leaves a mark in its place on the
// server, so every device keeping there is refused, and stops keeping too
// (gone); a borrowed secret's Forget only stops this device, since the
// bucket is another device's backup. Only the game itself keeps
// (SYNC_HERE): never the lab, the bot or the QA desk, whose benches set
// `backup` as they like and whose buttons only act it out.

import { BETA, CHANNEL, LOCAL } from '../channel.ts';
import { OWN_SIGNAL_HOST } from '../signalHost.ts';
import { QA, announceStored, onStoredHere, readStored, storeKey, writeStored } from '../storage.ts';
import { toasts } from '../toasts.svelte.ts';
import { whenCalm } from '../idle.ts';
import { base64url, fromBase64url } from '../base64url.ts';
import { loadCodex } from '../codex.ts';
import { COPY_KINDS, COPY_NAMES, MAX_COPY, SYNC_HERE, deviceId, isDevice, isStamp, readCopies, type CopyKind } from '../sync/store.ts';
import { OWN_NAMES, TAKEN_NAMES, fingerprint, ownNow, takeCopies, takeIn, takenNow } from '../sync/shared.ts';
import { KEPT_NAME, canSeal, forgetSent, loadKept, loadSent, markAsked, saveKept, saveSent, wasAsked } from './kept.ts';
import { fromSecret, newSecret, secretIn, seal, unseal, userId } from './seal.ts';
import { OFFER } from './words.ts';

const BASE = OWN_SIGNAL_HOST ? `https://${OWN_SIGNAL_HOST}/keep/` : '';

/** Whether this browser could make and use a passkey, as it was last found ('1' or '0'). */
const CAN = 'backup.can';
/**
 * Whether it can, from the first frame: as it was last found, or before
 * that, what the page sees at once (the browser says whether it has a
 * passkey of its own to make only a moment later). So the settings and the
 * codex lay their lines out from the start and nothing jumps as it answers;
 * a browser that turns out to have none drops them once, the first time.
 */
function canKeepAtOnce(): boolean {
  if (!SYNC_HERE) return false;
  const was = readStored(CAN);
  if (was !== null) return was === '1';
  return !!BASE && globalThis.isSecureContext === true && typeof PublicKeyCredential !== 'undefined' && typeof CompressionStream === 'function';
}

/** How the backup stands, for the settings and the codex (the QA desk's benches set it). */
export const backup = $state({
  /** This browser can make and use a passkey, and the game keeps here. */
  supported: canKeepAtOnce(),
  /** A secret is kept: this device's progress is kept with it. */
  on: false,
  /** Kept with a secret borrowed from a paired device, not one of its own. */
  borrowed: false,
  /** When this device's progress was last sent (0: not yet). */
  savedAt: 0,
  /** The last send didn't reach the server: it goes again in a while. */
  failing: false,
  /** What it is doing at the player's word. */
  busy: null as null | 'making' | 'bringing' | 'forgetting',
});
/** What each channel's passkeys are called in the player's password manager, so the beta's isn't taken for the game's. */
const PASSKEY_NAMES = { live: 'PoE2.Quest progress', beta: 'PoE2.Quest beta progress', local: 'PoE2.Quest local progress' } as const;
const PASSKEY_NAME = PASSKEY_NAMES[BETA ? 'beta' : LOCAL ? 'local' : 'live'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A passkey made now, by name: with the day, so one made after a browser was wiped is told from the one before it. */
export const passkeyName = (d = new Date()) => `${PASSKEY_NAME}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
/** The most a device's entry may be, sealed: what the server keeps (signal/worker.js MAX_ENTRY). */
export const MAX_ENTRY = 512 * 1024;
/** And opened: as much as sync takes from another device at once (lib/sync/link.svelte.ts MAX_GIVE). */
const MAX_ENTRY_TEXT = 6 * MAX_COPY;
/** A change is sent this long after it, at the soonest. */
const SOON_MS = 20_000;
/** And no sooner than this after the last time. (Exported for tests/backup.test.ts.) */
export const APART_MS = 10 * 60_000;
/** A send that didn't go is tried again this long after. (Exported for tests/backup.test.ts.) */
export const RETRY_MS = 3 * 60_000;
/** A send given up on after this long without an answer (and tried again in a while). */
const SEND_WITHIN_MS = 30_000;
/** The most a send may carry as the page goes away (a browser's limit for what goes on after it, 64 KB). */
const KEEPALIVE_MAX = 60_000;
/** The codex this full before the offer after a game: enough played for it to matter. */
export const OFFER_AT = 30;

function readState() {
  const k = loadKept();
  backup.on = !!k?.secret;
  backup.borrowed = !!k?.secret && !k.own;
  const sent = loadSent();
  // (Saved under the bucket it keeps in now: one sent under another before doesn't count.)
  backup.savedAt = backup.on && sent && (!k?.bucket || sent.bucket === k.bucket) ? sent.at : 0;
  if (!backup.on) backup.failing = false;
}

/** Whether this browser can keep progress with a passkey: one of its own, or one on a phone (a computer without its own, through the phone's code). */
async function canKeep(): Promise<boolean> {
  if (!SYNC_HERE || !BASE || !isSecureContext || typeof PublicKeyCredential === 'undefined' || !crypto?.subtle || typeof CompressionStream !== 'function') return false;
  try {
    if (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) return true;
  } catch {
    /* none of its own, as far as it says */
  }
  // (Newer browsers only: where it's missing, a browser without its own passkey isn't offered one.)
  const caps = (PublicKeyCredential as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities;
  if (typeof caps !== 'function') return false;
  try {
    return (await caps.call(PublicKeyCredential)).hybridTransport === true;
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
/** Nothing sent while a Forget goes (forgetBackup). */
let hold = false;

/** Sends this device's progress if it changed since it was last sent; `leaving`, as the page goes away. (Exported for tests/backup.test.ts, which drives it.) */
export function send(leaving = false): Promise<void> {
  // (One at a time: a change meanwhile is sent after it.)
  if (sending) return sending.then(() => send(leaving));
  // (One that fails along the way is tried again in a while, as one the server didn't take.)
  return (sending = sendNow(leaving)
    .catch(() => missed(loadKept()?.secret ?? '', leaving))
    .finally(() => (sending = null)));
}

/** Until no save is on its way: what's sent after it lands after it. (Exported for tests/backup.test.ts, which waits on it.) */
export async function settled() {
  while (sending) await sending;
}

async function sendNow(leaving: boolean) {
  const k = loadKept();
  if (hold || !k?.secret) return;
  const now = entryNow();
  if (!now) return;
  const { bucket, key } = await fromKept(k.secret);
  const was = loadSent();
  if (was?.print === now.print && was.bucket === bucket) return;
  const me = deviceId();
  const data = await sealEntry(now.entry, key, bucket, me);
  // (Its own progress alone more than the server keeps of a device, many times a full codex: it can't be kept.)
  if (!data) return;
  // (Forgotten, erased or moved on while it was sealed: not this one's to send.)
  if (hold || loadKept()?.secret !== k.secret) return;
  const stop = new AbortController();
  const late = setTimeout(() => stop.abort(), SEND_WITHIN_MS);
  try {
    const r = await fetch(BASE + `${bucket}/${me}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' }, keepalive: leaving && data.length <= KEEPALIVE_MAX, signal: stop.signal });
    if (r.status === 410) return gone(k.secret, bucket);
    if (!r.ok) return missed(k.secret, false);
  } catch {
    // (Out of reach, or cut off as the page went away: again in a while, or as it's hidden next.)
    return missed(k.secret, leaving);
  } finally {
    clearTimeout(late);
  }
  // (Forgotten meanwhile, or another secret taken: not this one's to stamp.)
  if (loadKept()?.secret !== k.secret) return;
  backup.failing = false;
  saveSent({ at: Date.now(), print: now.print, bucket });
  readState();
}

/**
 * A send that didn't go: again in a while. Said in the settings and the codex
 * (backup.failing) unless it was only cut off as the page went away, as a
 * phone's is each time it switches apps.
 */
function missed(secret: string, leaving: boolean) {
  if (!leaving && loadKept()?.secret === secret) backup.failing = true;
  schedule(RETRY_MS);
}

/**
 * The bucket was forgotten, on a device this one may never have heard it
 * from (one not paired, another tab): it stops keeping with it too, naming
 * it, so it never borrows it again.
 */
function gone(secret: string, bucket: string) {
  if (loadKept()?.secret !== secret) return;
  saveKept({ secret: null, bucket, stopped: 'gone', at: Date.now() });
  forgetSent();
  readState();
  toasts.show('What your passkey kept was deleted on another device, so this browser stops keeping it too.', 'info', { title: 'No longer kept' });
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** A change to send: soon, but no sooner than APART_MS after the last time (or `wait`: RETRY_MS, for a send that didn't go). */
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
  // (The copies sync brings of the other devices too: what a lost phone sent its pair is kept even if it never kept its own.)
  const names = new Set([...Object.values(OWN_NAMES).flat(), ...COPY_NAMES, ...TAKEN_NAMES.filter((n) => n !== KEPT_NAME)]);
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
  return (checked ??= canKeep().then((can) => {
    backup.supported = can;
    if (readStored(CAN) !== (can ? '1' : '0')) writeStored(CAN, can ? '1' : '0');
  }));
}
// (How it stands from the first frame too: the settings and the codex import this as they open.)
if (SYNC_HERE) readState();

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
  if (!canSeal()) return;
  watch();
  schedule();
}

// ---- at the player's word ---------------------------------------------------------

const challenge = () => crypto.getRandomValues(new Uint8Array(32));
/** A computer: no touch screen (a laptop with one passes for a phone, and is offered its own passkey first). */
const ON_COMPUTER = typeof matchMedia === 'function' && !matchMedia('(any-pointer: coarse)').matches;

/** The desk's buttons act it out: no passkey, no server. */
async function actedOut(busy: NonNullable<typeof backup.busy>, then: () => void) {
  backup.busy = busy;
  await new Promise((r) => setTimeout(r, 700));
  backup.busy = null;
  then();
}

/** Makes a passkey and keeps this device's progress with it from now on. */
export async function keepSafe() {
  if (backup.busy) return;
  // (Not while it keeps with one of its own; with one borrowed, it may make its own.)
  if (QA) return backup.on && !backup.borrowed ? undefined : actedOut('making', () => Object.assign(backup, { on: true, borrowed: false, savedAt: Date.now() }));
  const had = loadKept();
  if (had?.secret && had.own) return;
  // (Asked for before anything else is awaited: Safari makes a passkey only straight from the press.)
  const secret = newSecret();
  const name = passkeyName();
  backup.busy = 'making';
  // (`hints` is the spec's and Chrome's, but not yet in TypeScript's own type for these options.)
  const publicKey: PublicKeyCredentialCreationOptions & { hints?: string[] } = {
    challenge: challenge(),
    rp: { name: 'PoE2.Quest' },
    user: { id: userId(secret, CHANNEL), name, displayName: name },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    // (Not this device's alone: a computer's own passkey never reaches a phone, which can't scan a computer's
    // code, while a phone's serves any computer that shows one. So on a computer the browser offers the phone
    // first, a code to scan with it; on a phone, its own. Either way the player may pick the other.)
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
    hints: ON_COMPUTER ? ['hybrid', 'client-device'] : ['client-device', 'hybrid'],
    attestation: 'none',
    timeout: 120_000,
  };
  try {
    await navigator.credentials.create({ publicKey });
  } catch (err) {
    backup.busy = null;
    // (Turned down at the passkey's sheet: nothing to say.)
    if ((err as DOMException)?.name !== 'NotAllowedError') toasts.show('This browser couldn’t make a passkey here.', 'error', { title: 'Not kept' });
    return;
  }
  const kept = base64url(secret);
  const { bucket } = await fromKept(kept);
  // (Its own from now on, in place of one it borrowed or stopped with: its entry in a borrowed one's bucket
  // stays there, which is harmless, since saves only add up.)
  saveKept({ secret: kept, bucket, own: true, at: Date.now() });
  readState();
  markAsked();
  if (timer) clearTimeout(timer);
  timer = null;
  // (Said once the first save is in, or not.)
  await send();
  backup.busy = null;
  if (backup.failing) toasts.show('Your passkey is made, but the server can’t be reached just now. Your progress is saved with it as soon as it can be.', 'error', { title: 'Not saved yet' });
  else toasts.show('Your progress is kept with your passkey from now on, saved as you play.', 'info', { title: 'Kept safe' });
}

/** What's kept under `secret`, each device's entry that opens, and whether it was forgotten; null where the server can't be reached. */
async function fetchKept(secret: string): Promise<{ entries: { device: string; entry: Entry }[]; gone: boolean } | null> {
  const { bucket, key } = await fromKept(secret);
  let body: Uint8Array<ArrayBuffer>;
  const stop = new AbortController();
  const late = setTimeout(() => stop.abort(), SEND_WITHIN_MS);
  try {
    const r = await fetch(BASE + bucket, { signal: stop.signal });
    if (r.status === 410) return { entries: [], gone: true };
    if (!r.ok) return null;
    body = new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(late);
  }
  const entries: { device: string; entry: Entry }[] = [];
  for (const { device, data } of unpack(body)) {
    const text = await unseal(data, key, bucket, device, MAX_ENTRY_TEXT);
    const entry = text === null ? null : readEntry(text);
    if (entry) entries.push({ device, entry });
  }
  return { entries, gone: false };
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

/** A device's entry as it was kept, or null for one this build can't read (a note an older build left in its place, say). */
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
  if (QA) return actedOut('bringing', () => (Object.assign(backup, { on: true, borrowed: false }), toasts.show('Your codex, Delve runs and achievements are back.', 'info', { title: 'Brought back' })));
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
    toasts.show(got ? `That one is a “${PASSKEY_NAMES[got.elsewhere]}” passkey. Pick a “${PASSKEY_NAME}” one.` : 'That passkey isn’t one the game made.', 'error', { title: 'Not brought back' });
    return;
  }
  const secret = base64url(got);
  const brought = await fetchKept(secret);
  backup.busy = null;
  if (!brought) {
    toasts.show('The server can’t be reached just now. Try again in a while.', 'error', { title: 'Not brought back' });
    return;
  }
  // (Forgotten: nothing to bring back, and nothing changes here.)
  if (brought.gone) {
    toasts.show('What was kept with that passkey was deleted with Forget, so it brings nothing back.', 'info', { title: 'Nothing kept with it' });
    return;
  }
  const { entries } = brought;
  const changed = takeEntries(entries, deviceId());
  if (changed.length) announceStored(changed);
  const k = loadKept();
  // (Its own from now on, where it had none of its own: with none, stopped, or borrowing. One of its own stays, the
  // same one or another, and only the progress is taken in.)
  const adopt = !k?.secret || !k.own;
  if (adopt) {
    const { bucket } = await fromKept(secret);
    // (All of it sent again under it, whatever was sent before.)
    saveKept({ secret, bucket, own: true, at: Date.now() });
    forgetSent();
    readState();
    markAsked();
  }
  // (What it took in kept with its own as well.)
  void send();
  if (changed.length) toasts.show('Your codex, Delve runs and achievements are back.', 'info', { title: 'Brought back' });
  // (Only what this browser has already: its own, or what sync brought.)
  else if (entries.length) toasts.show('Everything kept with that passkey is here already.', 'info', { title: 'Already here' });
  else if (adopt) toasts.show('Nothing was kept with that passkey yet. Your progress here is kept with it from now on.', 'info', { title: 'Nothing kept with it' });
  else toasts.show('Nothing was kept with that passkey. Your progress here stays kept with the one it has.', 'info', { title: 'Nothing kept with it' });
}

/**
 * Stops keeping this browser's progress; it stays here. With its own secret,
 * what was kept online is deleted too, and every device keeping with it
 * stops at its next save (gone). With a borrowed one, nothing is asked of the
 * server: the bucket is the other device's backup, and stays as it was.
 */
export async function forgetBackup() {
  if (backup.busy) return;
  if (QA) return actedOut('forgetting', () => Object.assign(backup, { on: false, borrowed: false, savedAt: 0 }));
  const k = loadKept();
  if (!k?.secret) return;
  backup.busy = 'forgetting';
  // (Nothing more sent meanwhile, and a save on its way lands first, so the Forget takes it too.)
  hold = true;
  if (timer) clearTimeout(timer);
  timer = null;
  await settled();
  const { bucket } = await fromKept(k.secret);
  if (k.own) {
    let ok = false;
    const stop = new AbortController();
    const late = setTimeout(() => stop.abort(), SEND_WITHIN_MS);
    try {
      ok = (await fetch(BASE + `${bucket}/forget`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, signal: stop.signal })).ok;
    } catch {
      /* out of reach */
    } finally {
      clearTimeout(late);
    }
    if (!ok) {
      hold = false;
      backup.busy = null;
      toasts.show('The server can’t be reached just now. Try again in a while.', 'error', { title: 'Not forgotten' });
      schedule();
      return;
    }
  }
  hold = false;
  backup.busy = null;
  // (Another taken meanwhile, in another tab: it stands, and one forgotten is gone from the server all the same.)
  if (loadKept()?.secret !== k.secret) return;
  // (Naming the backup it stopped with.)
  saveKept({ secret: null, bucket, stopped: 'here', at: Date.now() });
  forgetSent();
  readState();
}

/** After a game: once, where a passkey can keep it and there's enough played for it to matter, a notice offering to keep it safe. */
export function offerBackup() {
  if (!backup.supported || backup.on || wasAsked() || Object.keys(loadCodex().items).length < OFFER_AT) return;
  markAsked();
  toasts.show(OFFER.message, 'info', { ...OFFER.opts, action: { label: 'Keep it safe', run: () => void keepSafe() } });
}
