// Sealed art: a question's pictures go out as soon as they're ready, but
// locked, and the key follows on the main channel the moment the clock
// starts. Until then a guest holds bytes it can't read, so a near guest
// gains nothing by having them early and a far one loses nothing by having
// them late. Each media message is sealed whole (its question, size, box and
// index too, not just the picture), under a fresh AES-GCM key per question
// and a fresh IV per message. The key id is bound into every message, so
// bytes sealed for one key never open under another's id (a host reload's
// new art never pairs with old bytes). Kept free of PeerJS and Svelte so it
// can be tested on its own (tests/seal.test.ts).

import { decodeLaneMsg, encodeLaneMsg, MAX_LANE_MESSAGE } from './artLane.ts';

/** AES-GCM's IV, 96 bits as it wants it. */
export const SEAL_IV_BYTES = 12;
/** A raw AES-256 key. */
export const SEAL_KEY_BYTES = 32;
/** AES-GCM's tag, added to every ciphertext. */
export const SEAL_TAG_BYTES = 16;
/** The largest sealed message a guest takes: the lane's largest message and its tag. */
export const MAX_SEALED_BYTES = MAX_LANE_MESSAGE + SEAL_TAG_BYTES;
/**
 * The largest message the host seals: room is left for the IV, the tag and
 * the sealed message's own description, so it still fits down the lane.
 */
export const MAX_SEALED_PLAIN = MAX_LANE_MESSAGE - 1024;

/** A key id: short, and plain enough to sit in a log or a Map without care. */
const KID = /^[A-Za-z0-9_.:-]{1,48}$/;

/** A message sealed for the art lane: nothing about it readable but which key opens it. */
export interface SealedMsg {
  t: 'sealed';
  kid: string;
  iv: ArrayBuffer;
  data: ArrayBuffer;
}

/** The key to a question's sealed messages, sent on the main channel when its clock starts. */
export interface KeyMsg {
  t: 'key';
  kid: string;
  key: ArrayBuffer;
}

/** The host's key for one question: its id, the key itself, and its raw bytes to send when the clock starts. */
export interface SealKey {
  kid: string;
  key: CryptoKey;
  raw: Uint8Array<ArrayBuffer>;
}

/** Whether this browser can seal and open (WebCrypto is only there in a secure context). */
export function sealAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.encrypt === 'function' && typeof globalThis.crypto.getRandomValues === 'function';
}

/** A fresh random key id (11 characters); the session may put its own prefix in front, e.g. the question's. */
export function newKid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isKid(v: unknown): v is string {
  return typeof v === 'string' && KID.test(v);
}

const encoder = new TextEncoder();

/** The key id, bound into each message's tag: bytes re-labelled with another id fail to open. */
const aad = (kid: string) => encoder.encode(kid);

const importRaw = (raw: BufferSource, usages: KeyUsage[]) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages);

/** Host: a fresh key for a question. The CryptoKey can't be exported; the raw bytes are kept to send. */
export async function makeSealKey(kid: string = newKid()): Promise<SealKey> {
  if (!isKid(kid)) throw new TypeError('bad key id');
  const raw = crypto.getRandomValues(new Uint8Array(SEAL_KEY_BYTES));
  return { kid, key: await importRaw(raw, ['encrypt', 'decrypt']), raw };
}

/** The message that hands out a key: a copy of its bytes, so nothing sent shares memory with the key kept. */
export function keyMsg(key: SealKey): KeyMsg {
  return { t: 'key', kid: key.kid, key: key.raw.slice().buffer };
}

/** Host: seals a whole media message (every field, the binary ones too) under the question's key. */
export async function sealMsg(msg: Record<string, unknown>, key: SealKey): Promise<SealedMsg> {
  const plain = encodeLaneMsg(msg);
  if (plain.byteLength > MAX_SEALED_PLAIN) throw new RangeError('message too large to seal');
  const iv = crypto.getRandomValues(new Uint8Array(SEAL_IV_BYTES));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(key.kid) }, key.key, plain);
  return { t: 'sealed', kid: key.kid, iv: iv.buffer, data };
}

/** A key from its raw bytes (a KeyMsg's), able only to open; null if the browser won't take it. */
export async function importSealKey(raw: ArrayBuffer): Promise<CryptoKey | null> {
  if (raw.byteLength !== SEAL_KEY_BYTES) return null;
  try {
    return await importRaw(raw, ['decrypt']);
  } catch {
    return null;
  }
}

/** Opens a sealed message: the media message inside, or null if this key (or id) isn't the one, or it was tampered with. */
export async function openSealed(sealed: SealedMsg, key: CryptoKey): Promise<Record<string, unknown> | null> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv, additionalData: aad(sealed.kid) }, key, sealed.data);
  } catch {
    return null;
  }
  return decodeLaneMsg(new Uint8Array(plain));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Binary bytes as an ArrayBuffer of their own (a view is copied out of whatever it sits in); null if not binary. */
function bytesOf(v: unknown): ArrayBuffer | null {
  if (v instanceof ArrayBuffer) return v;
  if (!ArrayBuffer.isView(v)) return null;
  const { buffer, byteOffset, byteLength } = v;
  if (!(buffer instanceof ArrayBuffer)) return null;
  return byteOffset === 0 && byteLength === buffer.byteLength ? buffer : buffer.slice(byteOffset, byteOffset + byteLength);
}

/** Validates a sealed message from the host. Returns a clean copy (only its known fields), or null if it's bogus. */
export function parseSealed(raw: unknown): SealedMsg | null {
  if (!isObj(raw) || raw.t !== 'sealed' || !isKid(raw.kid)) return null;
  const iv = bytesOf(raw.iv);
  const data = bytesOf(raw.data);
  if (!iv || iv.byteLength !== SEAL_IV_BYTES) return null;
  // The smallest message encodeLaneMsg makes is its 4-byte length, then the tag.
  if (!data || data.byteLength < 4 + SEAL_TAG_BYTES || data.byteLength > MAX_SEALED_BYTES) return null;
  return { t: 'sealed', kid: raw.kid, iv, data };
}

/** Validates a key message from the host. Returns a clean copy, or null if it's bogus. */
export function parseKey(raw: unknown): KeyMsg | null {
  if (!isObj(raw) || raw.t !== 'key' || !isKid(raw.kid)) return null;
  const key = bytesOf(raw.key);
  return key && key.byteLength === SEAL_KEY_BYTES ? { t: 'key', kid: raw.kid, key } : null;
}

export interface SealedStoreLimits {
  /** Ciphertext held waiting for its key, all ids together. */
  maxBytes?: number;
  /** Ids with ciphertext waiting for their key. */
  maxWaiting?: number;
  /** Keys kept, so late ciphertext still opens. */
  maxKeys?: number;
}

/**
 * Guest: holds sealed messages until their key comes, then opens them in the
 * order they arrived and hands each one on. Whatever comes after its key
 * opens at once. A host can send nothing that makes it hold more than its
 * caps (the oldest id goes first), and nothing that makes it throw: a message
 * that won't open is dropped and counted.
 */
export class SealedStore {
  /** Messages that failed to open (wrong key, tampered with, not a message inside). */
  failed = 0;
  /** Messages let go unopened to stay within the caps. */
  dropped = 0;

  private waiting = new Map<string, { items: SealedMsg[]; bytes: number }>();
  private waitingBytes = 0;
  private keys = new Map<string, Promise<CryptoKey | null>>();
  /** Opening is one queue, so messages come out in the order they went in, across ids too. */
  private chain: Promise<void> = Promise.resolve();
  private readonly onOpen: (msg: Record<string, unknown>, kid: string) => void;
  private readonly maxBytes: number;
  private readonly maxWaiting: number;
  private readonly maxKeys: number;

  constructor(onOpen: (msg: Record<string, unknown>, kid: string) => void, limits: SealedStoreLimits = {}) {
    this.onOpen = onOpen;
    this.maxBytes = limits.maxBytes ?? 8 * 1024 * 1024;
    this.maxWaiting = limits.maxWaiting ?? 4;
    this.maxKeys = limits.maxKeys ?? 8;
  }

  /** Bytes held waiting for keys. */
  get bytes() {
    return this.waitingBytes;
  }

  /** Whether this id's key is here. */
  hasKey(kid: string) {
    return this.keys.has(kid);
  }

  /** How many messages wait for this id's key. */
  waitingFor(kid: string) {
    return this.waiting.get(kid)?.items.length ?? 0;
  }

  /** Takes a sealed message (parseSealed's): opened now if its key is here, else kept for it. */
  take(sealed: SealedMsg) {
    const key = this.keys.get(sealed.kid);
    if (key) {
      this.open(sealed, key);
      return;
    }
    const size = sealed.data.byteLength + sealed.iv.byteLength;
    let entry = this.waiting.get(sealed.kid);
    if (!entry) {
      while (this.waiting.size >= this.maxWaiting && this.dropOldestWaiting());
      entry = { items: [], bytes: 0 };
      this.waiting.set(sealed.kid, entry);
    }
    while (this.waitingBytes + size > this.maxBytes && this.dropOldestWaiting(sealed.kid));
    if (this.waitingBytes + size > this.maxBytes) {
      // This id alone holds all there's room for: the newest goes, so what's kept stays in order from the start.
      this.dropped++;
      return;
    }
    entry.items.push(sealed);
    entry.bytes += size;
    this.waitingBytes += size;
  }

  /** Takes a key (parseKey's) and opens what waits for it. A second key for the same id is ignored. */
  key(msg: KeyMsg) {
    if (this.keys.has(msg.kid)) return;
    while (this.keys.size && this.keys.size >= this.maxKeys) this.keys.delete(this.keys.keys().next().value!);
    const key = importSealKey(msg.key);
    this.keys.set(msg.kid, key);
    const entry = this.waiting.get(msg.kid);
    if (!entry) return;
    this.waiting.delete(msg.kid);
    this.waitingBytes -= entry.bytes;
    for (const sealed of entry.items) this.open(sealed, key);
  }

  /** Lets go of an id: its waiting bytes and its key; anything of it still being opened isn't handed on. */
  forget(kid: string) {
    const entry = this.waiting.get(kid);
    if (entry) {
      this.waiting.delete(kid);
      this.waitingBytes -= entry.bytes;
    }
    this.keys.delete(kid);
  }

  /** Lets go of everything (a new room, a host's reload). */
  clear() {
    this.waiting = new Map();
    this.waitingBytes = 0;
    this.keys = new Map();
  }

  /** Settles once everything taken so far has been opened (or failed). */
  idle(): Promise<void> {
    return this.chain;
  }

  /** Drops the oldest id still waiting, other than `keep`; false if there's none. */
  private dropOldestWaiting(keep?: string): boolean {
    for (const [kid, entry] of this.waiting) {
      if (kid === keep) continue;
      this.waiting.delete(kid);
      this.waitingBytes -= entry.bytes;
      this.dropped += entry.items.length;
      return true;
    }
    return false;
  }

  private open(sealed: SealedMsg, key: Promise<CryptoKey | null>) {
    this.chain = this.chain.then(async () => {
      const ck = await key;
      // Forgotten (or its key pushed out) meanwhile: not wanted any more.
      if (this.keys.get(sealed.kid) !== key) return;
      const msg = ck ? await openSealed(sealed, ck) : null;
      if (this.keys.get(sealed.kid) !== key) return;
      if (!msg) {
        this.failed++;
        return;
      }
      try {
        this.onOpen(msg, sealed.kid);
      } catch (e) {
        // The queue must go on for the messages behind this one.
        console.error(e);
      }
    });
  }
}
