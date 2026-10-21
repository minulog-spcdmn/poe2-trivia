// Sync: the player's devices, paired by one code (lib/sync/code.ts), keep
// their progress the same whenever two of them are on the site at once.
// No server keeps anything: the devices meet as the players of a room do,
// through the matchmaking server (lib/peer.ts), and talk over a direct
// WebRTC link.
//
// Meeting: the first of them to come takes the name the code makes
// (code.ts peerName) on the matchmaking server, and waits. The next finds
// it taken, and connects to whoever has it instead. When the one waiting
// goes, the others take its place: whichever is first takes the name again.
//
// On every link, each proves to the other that it has the code (an HMAC
// of the other's random challenge, under a key the code makes), and
// nothing else is said until both have. Then each says which copies it
// holds and how new each is (lib/sync/store.ts), and sends the other what
// it holds newer, with what is taken in (lib/sync/shared.ts). While the
// link lasts, what changes on either side is sent on as it changes, and
// what comes in from one link goes on to the others, so three devices or
// more keep the same as two.
//
// While a page is hidden for a minute, its device lets go (a phone in a
// pocket keeps no link open); it comes back as the page does.
//
// A code that meets no device in ten minutes is let go of (store.ts
// UNMET_MS). A device already synced that takes a new device's code (scans
// it) says so as they meet, and both go to its own code, so a third device
// joins the other two rather than taking one of them away.

import type { DataConnection, Peer } from 'peerjs';
import { CHANNEL, roomPrefix } from '../channel.ts';
import { PEER_OPTIONS, loadPeerJs } from '../peer.ts';
import { announceStored, onStoredHere, storeKey } from '../storage.ts';
import { parseCodex, parsePractice } from '../codex.ts';
import { parseRecords } from '../delveRecord.ts';
import { keepOwnerKey, ownerKeyKept } from '../ownerKey.ts';
import { codeKey, newCode, peerName, prove, proves } from './code.ts';
import { OWN_NAMES, TAKEN_NAMES, ownNow, takeIn, takenNow } from './shared.ts';
import {
  COPY_KINDS,
  MAX_COPY,
  PAIR_NAME,
  SYNC_HERE,
  clearCopies,
  deviceId,
  UNMET_MS,
  VIEW,
  forgetPairing,
  homeOnMeeting,
  isDevice,
  isStamp,
  keepCopy,
  loadPairing,
  meeting,
  lapsed,
  pairingAfterUnpair,
  pairingNow,
  pairingTaking,
  readCopies,
  savePairing,
  type Copy,
  type CopyKind,
} from './store.ts';

/** Bump when what the devices say to each other changes, so devices on different builds wait for each other instead. */
const PROTOCOL = 1;
const PREFIX = `${roomPrefix(CHANNEL, import.meta.env.VITE_LOCAL_ID)}sync${PROTOCOL}-`;

/**
 * - `off`: not paired.
 * - `connecting`: on the way to the matchmaking server, or to the device waiting there.
 * - `waiting`: there, and no other device is.
 * - `linked`: linked to another device (or more).
 * - `offline`: the matchmaking server can't be reached; tried again in a while.
 */
export type SyncStatus = 'off' | 'connecting' | 'waiting' | 'linked' | 'offline';

class SyncState {
  /** The code this browser is paired with (null: none). */
  code = $state<string | null>(null);
  /** Another device has been met with it. */
  met = $state(false);
  status = $state<SyncStatus>('off');
  /** Other devices linked now. */
  linked = $state(0);
  /** Unmet: the code this device was synced under before, which it brings the new device home to. */
  home = $state<string | null>(null);
  /** Not paired because the last code met nobody in time (here or in another tab), not because the player let go of it. */
  lapsed = $state(false);
}

/** How the pairing stands, in a line (the settings and the pairing dialog). */
export function syncLine(): string {
  if (sync.status === 'linked') return sync.linked > 1 ? `Synced with ${sync.linked} other devices.` : 'Synced with your other device.';
  if (sync.status === 'offline') return "Can't reach the matchmaking server. Trying again in a moment.";
  if (!sync.met) return 'Waiting for your other device.';
  return sync.status === 'waiting' ? 'Paired; it syncs whenever your other device is on the site too.' : 'Connecting.';
}

export const sync = new SyncState();

let lapseTimer: ReturnType<typeof setTimeout> | null = null;
/** When the unmet code held was made or taken (null: none held). */
let waitingSince: number | null = null;
function readPairing() {
  const stored = SYNC_HERE ? loadPairing() : null;
  // One that met nobody in time is let go of (back to the code this device came from, if any).
  const p = pairingNow(stored, Date.now());
  if (p !== stored) {
    if (p) savePairing(p);
    else forgetPairing();
  }
  // (Let go of in another tab as it lapsed there: lapsed here too.)
  sync.lapsed = lapsed(stored, p, waitingSince, Date.now());
  sync.code = p?.code ?? null;
  sync.met = p?.met ?? false;
  sync.home = p?.home ?? null;
  waitingSince = p && !p.met ? (p.at ?? 0) : null;
  if (lapseTimer) clearTimeout(lapseTimer);
  lapseTimer = null;
  // (Never further off than UNMET_MS: pairingNow counts one stamped ahead of the clock from now.)
  if (waitingSince !== null)
    lapseTimer = setTimeout(
      () => {
        const was = sync.code;
        readPairing();
        if (sync.code !== was) restart();
      },
      waitingSince + UNMET_MS - Date.now() + 1000,
    );
}
readPairing();

// ---- what is said ----------------------------------------------------------------

/** Each device's copies of each kind held, and how new: `${device}:${kind}` to its time. */
type Have = Record<string, number>;

/** What this device holds at a moment (Run.holding). */
interface Holding {
  own: Partial<Record<CopyKind, Copy>>;
  copies: Record<CopyKind, Record<string, Copy>>;
  taken: Record<string, string>;
  /** `taken`, as it is compared with what a link was last sent. */
  print: string;
}

interface Given {
  copies: { device: string; kind: CopyKind; at: number; raw: string }[];
  taken: Record<string, string>;
}

/** The most a give unpacks to (the copies of a few devices, each well under its limit). */
const MAX_GIVE = 6 * MAX_COPY;
/** The most copies one give carries (a few kinds of a few devices). */
const MAX_COPIES = 60;

const gzips = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** A give as sent: gzipped where the other side can read it, else JSON as it is. */
async function pack(v: Given, gzip: boolean): Promise<ArrayBuffer | string> {
  const json = JSON.stringify(v);
  if (!gzip || !gzips()) return json;
  return new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}

async function unpack(z: unknown): Promise<unknown> {
  if (typeof z === 'string') return z.length <= MAX_GIVE ? JSON.parse(z) : null;
  const bytes = z instanceof ArrayBuffer ? new Uint8Array(z) : ArrayBuffer.isView(z) ? new Uint8Array(z.buffer as ArrayBuffer, z.byteOffset, z.byteLength) : null;
  if (!bytes || !gzips()) return null;
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > MAX_GIVE) {
      void reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isKind = (v: unknown): v is CopyKind => COPY_KINDS.includes(v as CopyKind);

function readHave(v: unknown): Have {
  const out: Have = {};
  if (isObj(v))
    for (const [k, at] of Object.entries(v)) {
      const [device, kind] = k.split(':');
      if (isDevice(device) && isKind(kind) && isStamp(at)) out[k] = at;
    }
  return out;
}

function readGiven(v: unknown): Given | null {
  if (!isObj(v) || !Array.isArray(v.copies) || v.copies.length > MAX_COPIES) return null;
  const copies: Given['copies'] = [];
  for (const c of v.copies)
    if (isObj(c) && isDevice(c.device) && isKind(c.kind) && isStamp(c.at) && typeof c.raw === 'string' && c.raw.length <= MAX_COPY)
      copies.push({ device: c.device, kind: c.kind, at: c.at, raw: c.raw });
  return { copies, taken: isObj(v.taken) ? (v.taken as Record<string, string>) : {} };
}

/** What reads each kind of copy: one it can't read isn't kept (the browser's room is the device's own progress first). */
const READS: Record<CopyKind, (raw: string) => unknown> = { codex: parseCodex, delve: parseRecords, practice: parsePractice };
/** How far ahead of this device's clock a copy may be stamped: past that it would never be replaced by a real one. */
const AHEAD_MS = 24 * 3600_000;

// ---- a run: this device, paired, on the site ----------------------------------------

interface Link {
  conn: DataConnection;
  /** This device waits under the code's name, and the other came to it. */
  hub: boolean;
  nonce: string;
  theirNonce: string | null;
  /** The other can read a gzipped give. */
  gzip: boolean;
  /** The other has proved it has the code. */
  trusted: boolean;
  /** The other's name among the devices, once it says; this device's own for another tab of this browser. */
  device: string | null;
  /** What the other has, as it said and as it has been sent since. */
  has: Have;
  /** What was last sent of what is taken in, so it isn't sent again unchanged. */
  sentTaken: string;
  queue: Promise<void>;
}

const NETWORK_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);
/** How long a page may be hidden before its device lets go. */
const HIDDEN_MS = 60_000;
/** How long a change waits for more before it is sent. */
const PUSH_MS = 2000;
/** How long a link may take to open before it is given up and tried again. */
const OPEN_MS = 15_000;

const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const isNonce = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

class Run {
  private peer: Peer | null = null;
  private links = new Set<Link>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tries in a row that met nobody, to wait longer between them. */
  private misses = 0;
  private stopped = false;
  private me = deviceId();
  private name = '';
  private key: CryptoKey | null = null;
  private unhear: (() => void)[] = [];

  constructor(readonly code: string) {}

  async start() {
    sync.status = 'connecting';
    const watched = new Set([...Object.values(OWN_NAMES).flat(), ...TAKEN_NAMES]);
    const keys = new Set([...watched].map(storeKey));
    // (Only another tab's: those sync announces itself (announceStored) it has passed on already.)
    const onStorage = (e: StorageEvent) => e.isTrusted && e.key && keys.has(e.key) && this.schedulePush();
    addEventListener('storage', onStorage);
    this.unhear.push(
      () => removeEventListener('storage', onStorage),
      onStoredHere((name) => watched.has(name) && this.schedulePush()),
    );
    await this.connect();
  }

  /** Makes what the code makes (once), loads PeerJS, and goes for the code's name; offline, tries again in a while. */
  private async connect() {
    try {
      if (!this.key) [this.name, this.key] = await Promise.all([peerName(this.code), codeKey(this.code)]);
      if (!this.stopped) await this.claim();
    } catch (err) {
      console.warn('sync', err);
      if (!this.links.size) sync.status = 'offline';
      this.retry();
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    for (const f of this.unhear) f();
    for (const l of this.links) l.conn.close();
    this.links.clear();
    this.peer?.destroy();
    this.peer = null;
  }

  /** Tries again in a while, longer after every try that met nobody. */
  private retry(ms = Math.min(30_000, 1500 * 2 ** this.misses) + Math.random() * 1500) {
    if (this.stopped) return;
    this.misses = Math.min(this.misses + 1, 5);
    this.peer?.destroy();
    this.peer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => !this.stopped && void this.connect(), ms);
  }

  private async newPeer(id?: string): Promise<Peer> {
    const { Peer } = await loadPeerJs();
    return id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
  }

  /** Takes the code's name and waits there, or (taken) joins whoever has it. */
  private async claim() {
    const peer = await this.newPeer(PREFIX + this.name);
    if (this.stopped) return peer.destroy();
    this.peer = peer;
    let open = false;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      open = true;
      this.misses = 0;
      this.report();
    });
    peer.on('connection', (conn) => {
      if (this.peer !== peer || conn.serialization !== 'binary') return void conn.close();
      this.attach(conn, true);
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id' && !open) {
        peer.destroy();
        this.join().catch((err) => {
          console.warn('sync', err);
          this.retry();
        });
      } else if (err.type === 'unavailable-id' || NETWORK_ERRORS.has(err.type)) {
        // Another took the name back on a reconnect, or the server can't be reached: start over in a while.
        if (NETWORK_ERRORS.has(err.type) && !this.links.size) sync.status = 'offline';
        if (!this.links.size) this.retry();
      } else console.warn('sync', err);
    });
  }

  /** Connects to the device waiting under the code's name. */
  private async join() {
    const peer = await this.newPeer();
    if (this.stopped) return peer.destroy();
    this.peer = peer;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const conn = peer.connect(PREFIX + this.name, { reliable: true });
      this.attach(conn, false);
      const opening = setTimeout(() => this.peer === peer && !conn.open && this.retry(), OPEN_MS);
      conn.on('open', () => clearTimeout(opening));
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      // Gone between the name being taken and the link (or the server lost): try for the name again.
      if (err.type === 'peer-unavailable' || NETWORK_ERRORS.has(err.type)) {
        if (NETWORK_ERRORS.has(err.type)) sync.status = 'offline';
        this.retry(err.type === 'peer-unavailable' ? 500 + Math.random() * 1500 : undefined);
      } else console.warn('sync', err);
    });
  }

  private attach(conn: DataConnection, hub: boolean) {
    const link: Link = { conn, hub, nonce: nonce(), theirNonce: null, gzip: false, trusted: false, device: null, has: {}, sentTaken: '', queue: Promise.resolve() };
    this.links.add(link);
    conn.on('open', () => conn.send({ t: 'hello', v: PROTOCOL, nonce: link.nonce, gzip: gzips() }));
    conn.on('data', (d) => {
      link.queue = link.queue
        .then(() => this.hear(link, d))
        .catch((err) => {
          console.warn('sync', err);
          conn.close();
        });
    });
    const gone = () => {
      if (!this.links.delete(link)) return;
      this.report();
      // The one waiting went: whichever device is first takes its place.
      if (!hub && !this.stopped) this.retry(500 + Math.random() * 1500);
    };
    conn.on('close', gone);
    conn.on('error', gone);
    // One that never proves it has the code (or never opens) is let go of.
    setTimeout(() => {
      if (link.device) return;
      conn.close();
      gone();
    }, 2 * OPEN_MS);
  }

  private async hear(link: Link, d: unknown) {
    if (this.stopped || !isObj(d)) return;
    const say = (m: unknown) => link.conn.open && link.conn.send(m);
    switch (d.t) {
      case 'hello': {
        if (d.v !== PROTOCOL || !isNonce(d.nonce) || link.theirNonce) return link.conn.close();
        link.theirNonce = d.nonce;
        link.gzip = d.gzip === true;
        say({ t: 'proof', proof: await prove(this.key!, `${link.hub ? 'h' : 'g'}|${d.nonce}|${link.nonce}`) });
        return;
      }
      case 'proof': {
        if (!link.theirNonce || link.trusted) return link.conn.close();
        if (!(await proves(this.key!, `${link.hub ? 'g' : 'h'}|${link.nonce}|${link.theirNonce}`, d.proof))) return link.conn.close();
        link.trusted = true;
        // (`home`: this device took this code to bring the other home; `fresh`: this device has no other to go to.)
        say({ t: 'have', device: this.me, has: this.held(), ...meeting(sync) });
        return;
      }
      case 'have': {
        if (!link.trusted || link.device || !isDevice(d.device)) return link.conn.close();
        link.device = d.device;
        link.has = readHave(d.has);
        // Another tab of this browser: the same progress, nothing to say.
        if (link.device === this.me) return;
        // Bringing a new device home: both go to this one's code once they've given each other what they have.
        const home = homeOnMeeting(sync, d);
        if (!home) this.met();
        this.report();
        await this.give(link);
        if (home) setTimeout(() => !this.stopped && moveTo(home), 800);
        return;
      }
      case 'give': {
        if (!link.trusted || !link.device || link.device === this.me) return link.conn.close();
        const given = readGiven(await unpack(d.z));
        if (given) await this.take(given, link);
        return;
      }
      case 'owner': {
        // The owner key, passed on as the owner asked (passOwnerKey): kept only if it is the owner's.
        if (!link.trusted || !link.device || link.device === this.me) return link.conn.close();
        await keepOwnerKey(d.key);
        return;
      }
    }
  }

  /** What this device holds now, its own and its copies, and what is taken in: read once for all the links it goes to. */
  private holding(): Holding {
    const own: Holding['own'] = {};
    const copies = {} as Holding['copies'];
    for (const kind of COPY_KINDS) {
      own[kind] = ownNow(kind) ?? undefined;
      copies[kind] = readCopies(kind);
    }
    const taken = takenNow();
    return { own, copies, taken, print: JSON.stringify(taken) };
  }

  /** What this device holds, its own and its copies, and how new each is. */
  private held(h = this.holding()): Have {
    const out: Have = {};
    for (const kind of COPY_KINDS) {
      const own = h.own[kind];
      if (own) out[`${this.me}:${kind}`] = own.at;
      for (const [device, c] of Object.entries(h.copies[kind])) out[`${device}:${kind}`] = c.at;
    }
    return out;
  }

  /** Sends the other what it hasn't got (and what is taken in, if that changed since). */
  private async give(link: Link, h?: Holding) {
    if (!link.trusted || !link.device || link.device === this.me || !link.conn.open) return;
    // (Read only for a link that can take it.)
    h ??= this.holding();
    const copies: Given['copies'] = [];
    for (const kind of COPY_KINDS) {
      const own = h.own[kind];
      if (own && own.at > (link.has[`${this.me}:${kind}`] ?? 0)) copies.push({ device: this.me, kind, ...own });
      for (const [device, c] of Object.entries(h.copies[kind]))
        if (device !== link.device && c.at > (link.has[`${device}:${kind}`] ?? 0)) copies.push({ device, kind, ...c });
    }
    if (!copies.length && h.print === link.sentTaken) return;
    for (const c of copies) link.has[`${c.device}:${c.kind}`] = c.at;
    link.sentTaken = h.print;
    link.conn.send({ t: 'give', z: await pack({ copies, taken: h.taken }, link.gzip) });
  }

  /** Keeps what came in that is newer, takes in the rest, and passes it on to the other links. */
  private async take(given: Given, from: Link) {
    const changed = new Set<string>();
    for (const c of given.copies) {
      const key = `${c.device}:${c.kind}`;
      from.has[key] = Math.max(from.has[key] ?? 0, c.at);
      if (c.device === this.me || c.at > Date.now() + AHEAD_MS || READS[c.kind](c.raw) == null) continue;
      const held = readCopies(c.kind)[c.device];
      if ((!held || c.at > held.at) && keepCopy(c.kind, c.device, { at: c.at, raw: c.raw })) changed.add(VIEW[c.kind]);
    }
    for (const name of takeIn(given.taken)) changed.add(name);
    if (!changed.size) return;
    announceStored([...changed]);
    const others = [...this.links].filter((l) => l !== from);
    if (!others.length) return;
    const h = this.holding();
    for (const l of others) await this.give(l, h);
  }

  /** A change of this device's own: sent on to every link a moment later, with any more that follow. */
  private schedulePush() {
    if (this.stopped || !this.links.size) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const h = this.holding();
      for (const l of this.links) void this.give(l, h).catch((err) => console.warn('sync', err));
    }, PUSH_MS);
  }

  /** Passes the owner key on to every device linked now; how many. */
  passOwner(): number {
    const key = ownerKeyKept();
    if (!key) return 0;
    let n = 0;
    for (const l of this.links)
      if (l.trusted && l.device && l.device !== this.me && l.conn.open) {
        l.conn.send({ t: 'owner', key });
        // (The name as well, again: the held name, turned down there until now.)
        l.sentTaken = '';
        void this.give(l).catch((err) => console.warn('sync', err));
        n++;
      }
    return n;
  }

  private met() {
    if (sync.met) return;
    sync.met = true;
    // (Staying here: a code this device came from is no longer one to bring anybody home to.)
    sync.home = null;
    savePairing({ code: this.code, met: true });
  }

  /** Says how the run stands (sync.status, sync.linked). */
  private report() {
    if (this.stopped) return;
    const n = new Set([...this.links].filter((l) => l.device && l.device !== this.me).map((l) => l.device)).size;
    sync.linked = n;
    sync.status = n ? 'linked' : this.peer?.open ? 'waiting' : 'connecting';
  }
}

let run: Run | null = null;

function restart() {
  run?.stop();
  run = null;
  sync.linked = 0;
  sync.status = 'off';
  if (!SYNC_HERE || !sync.code || document.hidden) return;
  run = new Run(sync.code);
  void run.start();
}

let installed = false;
/** Starts syncing, if this browser is paired: the app calls it once the page is up. */
export function startSync() {
  if (!SYNC_HERE) return;
  if (!installed) {
    installed = true;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    document.addEventListener('visibilitychange', () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      if (document.hidden) hiddenTimer = setTimeout(restart, HIDDEN_MS);
      else if (!run && sync.code) restart();
    });
    // Let go of the name at once on leaving, so the next device takes it without waiting.
    addEventListener('pagehide', () => {
      run?.stop();
      run = null;
    });
    // Paired or unpaired in another tab.
    addEventListener('storage', (e) => {
      if (e.key !== storeKey(PAIR_NAME) && e.key !== null) return;
      const was = sync.code;
      readPairing();
      if (sync.code !== was) restart();
    });
  }
  if (!run) restart();
}

/** Paired with `code` and met there: where a device brought home goes, and the one that brought it. */
function moveTo(code: string) {
  savePairing({ code, met: true });
  readPairing();
  restart();
}

/**
 * The code to show another device: the one paired with, or (not paired)
 * a new one, paired with at once so this device waits for the other there.
 * Only kept if another device comes in time (readPairing).
 */
export function offerCode(): string {
  if (sync.code) return sync.code;
  const code = newCode();
  savePairing({ code, met: false, at: Date.now() });
  readPairing();
  startSync();
  return code;
}

/** Pairs with a code from another device (scanned, typed or linked); synced already, this device brings that one home to the others. */
export function useCode(code: string) {
  const p = pairingTaking(code, sync, Date.now());
  // (Its own group's code, taken again: simply back home.)
  if (p?.met) return moveTo(p.code);
  if (p) savePairing(p);
  readPairing();
  startSync();
  if (run?.code !== sync.code) restart();
}

/** Stops syncing (or, a code taken but not met yet, goes back to the one before). What came from the other devices stays, as progress only goes up. */
export function unpair() {
  const p = pairingAfterUnpair(sync);
  if (p) moveTo(p.code);
  else forget();
}

/** Not paired any more. */
function forget() {
  forgetPairing();
  readPairing();
  restart();
}

/**
 * Passes the owner key on to the player's devices linked now (only when the
 * owner asks: the settings, on a device that holds it). How many it went to.
 */
export const passOwnerKey = () => run?.passOwner() ?? 0;

/** The codex erased: unpaired, and the other devices' copies let go of (theirs is still theirs). */
export function eraseSync() {
  // (Not unpair: one waiting to bring a device home would go back to the others, and their progress straight back in.)
  forget();
  clearCopies();
}
