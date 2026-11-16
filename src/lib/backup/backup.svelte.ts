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
// device's. A device that moves to another secret leaves a note in its place
// under the one it left, sealed as its entry was, saying where it went
// (clearLeft): so a passkey never brings back an old part of the progress as
// if it were all of it, and a computer's own passkey, which only that
// computer can use, still brings back everything once its secret has lost
// to another's. Bring it back follows the notes (walk). A device that erases
// its codex takes its entry out. Forget deletes the bucket and leaves a mark
// in its place on the server, so a device that never heard of it (not
// paired, another tab) is refused there, and stops keeping too (gone). Only
// the game itself keeps (SYNC_HERE): never the lab, the bot or the QA desk,
// whose benches set `backup` as they like and whose buttons only act it out.

import { BETA, CHANNEL, LOCAL } from '../channel.ts';
import { OWN_SIGNAL_HOST } from '../signalHost.ts';
import { QA, announceStored, onStoredHere, readStored, storeKey, writeStored } from '../storage.ts';
import { toasts } from '../toasts.svelte.ts';
import { whenCalm } from '../idle.ts';
import { base64url, fromBase64url } from '../base64url.ts';
import { loadCodex } from '../codex.ts';
import { COPY_KINDS, COPY_NAMES, MAX_COPY, SYNC_HERE, deviceId, isDevice, isStamp, readCopies, type CopyKind } from '../sync/store.ts';
import { OWN_NAMES, TAKEN_NAMES, fingerprint, ownNow, takeCopies, takeIn, takenNow } from '../sync/shared.ts';
import { KEPT_NAME, dropLeft, forgetKept, forgetSent, isSecret, leave, loadKept, loadLeft, loadSent, markAsked, nextAt, repoint, saveKept, saveSent, wasAsked } from './kept.ts';
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
/** And no sooner than this after the last time. */
const APART_MS = 3 * 60_000;
/** A send given up on after this long without an answer (and tried again in a while). */
const SEND_WITHIN_MS = 30_000;
/** The most a send may carry as the page goes away (a browser's limit for what goes on after it, 64 KB). */
const KEEPALIVE_MAX = 60_000;
/** The codex this full before the offer after a game: enough played for it to matter. */
export const OFFER_AT = 30;

function readState() {
  const k = loadKept();
  backup.on = !!k?.secret;
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

/** Whether this browser can seal what it keeps and send it (not Safari before 16.4): where it can't, a secret sync brings is only passed on. */
const canSeal = () => !!BASE && globalThis.isSecureContext === true && !!globalThis.crypto?.subtle && typeof CompressionStream === 'function';

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

/** Sends this device's progress if it changed since it was last sent; `leaving`, as the page goes away. */
function send(leaving = false): Promise<void> {
  // (One at a time: a change meanwhile is sent after it.)
  if (sending) return sending.then(() => send(leaving));
  // (One that fails along the way is tried again in a while, as one the server didn't take.)
  return (sending = sendNow(leaving)
    .catch(() => missed(loadKept()?.secret ?? '', leaving))
    .finally(() => (sending = null)));
}

/** Until no save is on its way: what's sent after it lands after it. */
async function settled() {
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
    if (r.status === 410) return gone(k.secret);
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
  // (Saved under it: what this device left under the one before goes.)
  void clearLeft();
}

/** A note left in a device's place under a secret it moved on from: the secret it moved to, and when. */
export interface Note {
  next: string;
  at: number;
}

let clearing: Promise<void> | null = null;
/**
 * Replaces the entries this device left under secrets it no longer keeps
 * with (./kept.ts leave): one it moved on from, once its progress is saved
 * under the one it moved to (the bucket last sent to), with a note saying
 * where it went, so the passkey that opens it still brings everything back
 * (bringBack follows it); one it stopped keeping with, at once, with
 * nothing. One it's kept with again is its own again, and the next save
 * takes its place, note or entry. What doesn't go is tried again after the
 * next save, or as the page next starts.
 */
export function clearLeft(): Promise<void> {
  // (One at a time: one asked for meanwhile goes after it.)
  if (clearing) return clearing.then(() => clearLeft());
  return (clearing = clearLeftNow().finally(() => (clearing = null)));
}

async function clearLeftNow() {
  if (!BASE) return;
  // (A save on its way lands first, so what's taken out stays out.)
  await settled();
  for (const left of loadLeft()) {
    if (left.secret === (loadKept()?.secret ?? null) && left.device === deviceId()) {
      dropLeft(left);
      continue;
    }
    if (left.after !== null && (await fromKept(left.after)).bucket !== loadSent()?.bucket) continue;
    const { bucket, key } = await fromKept(left.secret);
    // (A note where it moved on, sealed as its entry was and for the device it was, as of the record it moved to; an empty entry takes it out.)
    const body = left.after === null ? undefined : await seal(JSON.stringify({ v: 1, next: left.after, at: left.at ?? Date.now() }), key, bucket, left.device);
    const stop = new AbortController();
    const late = setTimeout(() => stop.abort(), SEND_WITHIN_MS);
    try {
      const r = await fetch(BASE + `${bucket}/${left.device}`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, signal: stop.signal });
      // (Gone: forgotten since, nothing of it left to take out or point on.)
      if (r.ok || r.status === 410) dropLeft(left);
    } catch {
      /* out of reach: again in a while */
    } finally {
      clearTimeout(late);
    }
  }
}

/**
 * A send that didn't go: again in a while. Said in the settings and the codex
 * (backup.failing) unless it was only cut off as the page went away, as a
 * phone's is each time it switches apps.
 */
function missed(secret: string, leaving: boolean) {
  if (!leaving && loadKept()?.secret === secret) backup.failing = true;
  schedule(APART_MS);
}

/**
 * The bucket was forgotten, on a device this one never heard it from (one
 * not paired, another tab): it stops keeping with it too, as if it had.
 * Stamped just after the record it replaces, so one set since on another
 * device still stands over it.
 */
function gone(secret: string) {
  const k = loadKept();
  if (k?.secret !== secret) return;
  repoint(secret, null);
  saveKept({ secret: null, at: k.at + 1, ...(k.bucket ? { bucket: k.bucket } : {}) });
  forgetSent();
  readState();
  toasts.show('What your passkey kept was deleted on another device, so this browser stops keeping it too.', 'info', { title: 'No longer kept' });
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
  // (The copies sync brings of the other devices too: what a lost phone sent its pair is kept even if it never kept its own.)
  const names = new Set([...Object.values(OWN_NAMES).flat(), ...COPY_NAMES, ...TAKEN_NAMES.filter((n) => n !== KEPT_NAME)]);
  const keys = new Set([...names].map(storeKey));
  onStoredHere((name) => {
    if (names.has(name)) schedule();
    // (Set or forgotten here, a press here or sync's.)
    if (name === KEPT_NAME) {
      readState();
      schedule();
      void clearLeft();
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
  void clearLeft();
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
  if (backup.busy || backup.on) return;
  if (QA) return actedOut('making', () => ((backup.on = true), (backup.savedAt = Date.now())));
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
  const at = nextAt();
  const was = loadKept()?.secret;
  // (One taken from another device while the sheet was up, and maybe saved under already: this device's entry there points here.)
  if (was && was !== kept) leave(was, deviceId(), kept, at);
  saveKept({ secret: kept, at, bucket });
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

/** What's kept under `secret`, each device's that opens: its entry, or its note where it moved on, and whether it was forgotten; null where the server can't be reached. */
async function fetchKept(secret: string): Promise<{ entries: { device: string; entry: Entry }[]; notes: Note[]; gone: boolean } | null> {
  const { bucket, key } = await fromKept(secret);
  let body: Uint8Array<ArrayBuffer>;
  const stop = new AbortController();
  const late = setTimeout(() => stop.abort(), SEND_WITHIN_MS);
  try {
    const r = await fetch(BASE + bucket, { signal: stop.signal });
    if (r.status === 410) return { entries: [], notes: [], gone: true };
    if (!r.ok) return null;
    body = new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(late);
  }
  const entries: { device: string; entry: Entry }[] = [];
  const notes: Note[] = [];
  for (const { device, data } of unpack(body)) {
    const text = await unseal(data, key, bucket, device, MAX_ENTRY_TEXT);
    if (text === null) continue;
    const entry = readEntry(text);
    if (entry) entries.push({ device, entry });
    else {
      const note = readNote(text);
      if (note) notes.push(note);
    }
  }
  return { entries, notes, gone: false };
}

/** The most buckets Bring it back opens, following notes. */
export const MAX_WALK = 8;

/**
 * What's kept under `secret` and under every secret its notes lead to, and
 * on (A to B and B back to A may both be there, each opened once, no more
 * than MAX_WALK): every entry, and the secret to keep with from then on, the
 * one the newest note names of those opened and not forgotten, or `secret`
 * itself, or none where all of it was forgotten. Null where any can't be
 * reached, so none of it is taken in by halves.
 */
export async function walk(secret: string): Promise<{ entries: { device: string; entry: Entry }[]; next: string | null } | null> {
  const seen = new Set<string>();
  const queue = [secret];
  const entries: { device: string; entry: Entry }[] = [];
  const notes: Note[] = [];
  /** The secrets opened and not forgotten: only one of these is kept with after (a walk cut short at MAX_WALK never keeps with one it didn't open). */
  const live = new Set<string>();
  while (queue.length && seen.size < MAX_WALK) {
    const s = queue.shift()!;
    const { bucket } = await fromKept(s);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    const got = await fetchKept(s);
    if (!got) return null;
    if (!got.gone) live.add(s);
    entries.push(...got.entries);
    for (const note of got.notes) {
      notes.push(note);
      queue.push(note.next);
    }
  }
  let to: Note | null = null;
  for (const note of notes) if (live.has(note.next) && (!to || note.at > to.at)) to = note;
  return { entries, next: to?.next ?? (live.has(secret) ? secret : null) };
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

/** A device's note where it moved on (clearLeft), or null where it's something else. */
export function readNote(text: string): Note | null {
  try {
    const v: unknown = JSON.parse(text);
    if (!isObj(v) || v.v !== 1 || !isSecret(v.next) || typeof v.at !== 'number' || !Number.isSafeInteger(v.at)) return null;
    return { next: v.next, at: v.at };
  } catch {
    return null;
  }
}

/** A device's entry as it was kept, or null for one this build can't read (a note among them, as a build before notes reads it too). */
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
    toasts.show(got ? `That one is a “${PASSKEY_NAMES[got.elsewhere]}” passkey. Pick a “${PASSKEY_NAME}” one.` : 'That passkey isn’t one the game made.', 'error', { title: 'Not brought back' });
    return;
  }
  const brought = await walk(base64url(got));
  backup.busy = null;
  if (!brought) {
    toasts.show('The server can’t be reached just now. Try again in a while.', 'error', { title: 'Not brought back' });
    return;
  }
  // (Where the notes lead: the secret its devices moved on to, kept with from now on.)
  const { entries, next: secret } = brought;
  // (Forgotten: nothing to bring back, and nothing to keep with.)
  if (!secret) {
    toasts.show('What was kept with that passkey was deleted with Forget, so it brings nothing back.', 'info', { title: 'Nothing kept with it' });
    return;
  }
  const { bucket } = await fromKept(secret);
  const was = loadKept()?.secret ?? null;
  // (Nothing kept with it, while this browser keeps with another: most likely not the one it was, so it stays with the one it has.)
  if (!entries.length && was && was !== secret) {
    toasts.show('Nothing was kept with that passkey. Your progress here stays kept with the one it has.', 'info', { title: 'Nothing kept with it' });
    return;
  }
  const changed = takeEntries(entries, deviceId());
  if (changed.length) announceStored(changed);
  const at = nextAt();
  // (Moved on from the one it had: its entry there gives way to a note once this device's is saved under this one.)
  if (was && was !== secret) leave(was, deviceId(), secret, at);
  // (Kept with it from now on, and every paired device with it: newer than any it had. All of it sent
  // again, whatever was sent before.)
  saveKept({ secret, at, bucket });
  forgetSent();
  readState();
  markAsked();
  void send();
  if (changed.length) toasts.show('Your codex, Delve runs and achievements are back.', 'info', { title: 'Brought back' });
  // (Only what this browser has already: its own, or what sync brought.)
  else if (entries.length) toasts.show('Everything kept with that passkey is here already.', 'info', { title: 'Already here' });
  else toasts.show('If you made another passkey, bring that one back. Until then, your progress here is kept with this one.', 'info', { title: 'Nothing kept with it' });
}

/** Deletes what was kept online and stops keeping it, here and on every paired device; this browser's progress stays. */
export async function forgetBackup() {
  if (backup.busy) return;
  if (QA) return actedOut('forgetting', () => ((backup.on = false), (backup.savedAt = 0)));
  const k = loadKept();
  if (!k?.secret) return;
  backup.busy = 'forgetting';
  // (Nothing more sent meanwhile, and a save on its way lands first, so the Forget takes it too.)
  hold = true;
  if (timer) clearTimeout(timer);
  timer = null;
  await settled();
  const { bucket } = await fromKept(k.secret);
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
  hold = false;
  backup.busy = null;
  if (!ok) {
    toasts.show('The server can’t be reached just now. Try again in a while.', 'error', { title: 'Not forgotten' });
    schedule();
    return;
  }
  // (Another taken meanwhile, from another device or tab: it stands, and the one forgotten is gone from the server all the same.)
  if (loadKept()?.secret !== k.secret) return;
  // (Nothing of its own left to take out, since the bucket went whole; what waited for a save under it waits no more.)
  repoint(k.secret, null);
  // (Naming the backup it forgot.)
  saveKept({ secret: null, at: nextAt(), bucket });
  forgetSent();
  readState();
  void clearLeft();
}

/**
 * The codex erased: this device's entry goes from the backup (tried again
 * until it does, ./kept.ts leave), and this browser stops keeping (it stops
 * syncing too). Not forgotten: paired again with the others, it keeps with
 * them again, and never stops theirs.
 */
export function eraseBackup(): Promise<void> {
  const k = loadKept();
  if (!k?.secret || QA) return Promise.resolve();
  if (timer) clearTimeout(timer);
  timer = null;
  // (Under its name now: sync's erase gives it a new one.)
  leave(k.secret, deviceId(), null);
  forgetKept();
  forgetSent();
  readState();
  return clearLeft();
}

/** After a game: once, where a passkey can keep it and there's enough played for it to matter, a notice offering to keep it safe. */
export function offerBackup() {
  if (!backup.supported || backup.on || wasAsked() || Object.keys(loadCodex().items).length < OFFER_AT) return;
  markAsked();
  toasts.show(OFFER.message, 'info', { ...OFFER.opts, action: { label: 'Keep it safe', run: () => void keepSafe() } });
}
