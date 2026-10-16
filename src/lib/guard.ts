// Host-side limits on what guests can make the host do, and the per-room
// secret guests identify themselves with. Kept free of PeerJS and Svelte so
// it can be tested on its own.

import { RateLimit } from './protocol.ts';

/**
 * Largest data-channel frame a guest may send. A real client's biggest
 * message (hello with a long name) is well under 1 KB; PeerJS splits anything
 * over ~16 KB into chunks, which a real guest never needs.
 */
export const MAX_FRAME_BYTES = 2048;

/** What to do with a raw frame: pass it on, drop the connection (a flood), or block the peer (no real client sends it). */
export type FrameVerdict = 'ok' | 'flood' | 'bad';

/** Deeper than any message a real client sends (hello, pong, action, cursor). */
const MAX_PACK_DEPTH = 8;

/**
 * Whether `bytes` is exactly one well-formed binarypack value whose declared
 * lengths all fit in the frame. PeerJS's decoder trusts those lengths: five
 * bytes can announce an array of four billion entries, which it would
 * allocate and fill before anything else could look at it. Every element
 * takes at least one byte, so an honest count never exceeds the bytes left.
 */
export function plausiblePack(bytes: Uint8Array): boolean {
  let i = 0;
  const left = () => bytes.length - i;
  const uint = (n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + bytes[i + k];
    i += n;
    return v;
  };
  const value = (depth: number): boolean => {
    if (depth > MAX_PACK_DEPTH || left() < 1) return false;
    const type = bytes[i++];
    let size: number;
    if (type < 0x80 || type >= 0xe0 || (type >= 0xc0 && type <= 0xc3)) return true;
    if (type >= 0xa0 && type <= 0xbf) size = type & 0x0f; // short bytes / string
    else if (type >= 0x90 && type <= 0x9f) return items(type & 0x0f, 1, depth);
    else if (type >= 0x80 && type <= 0x8f) return items(type & 0x0f, 2, depth);
    else {
      const fixed: Record<number, number> = { 0xca: 4, 0xcb: 8, 0xcc: 1, 0xcd: 2, 0xce: 4, 0xcf: 8, 0xd0: 1, 0xd1: 2, 0xd2: 4, 0xd3: 8 };
      if (type in fixed) {
        if (left() < fixed[type]) return false;
        i += fixed[type];
        return true;
      }
      // Lengths: 16 or 32 bits, then bytes/string, array or map.
      const width: Record<number, number> = { 0xd8: 2, 0xd9: 4, 0xda: 2, 0xdb: 4, 0xdc: 2, 0xdd: 4, 0xde: 2, 0xdf: 4 };
      if (!(type in width) || left() < width[type]) return false;
      size = uint(width[type]);
      if (type === 0xdc || type === 0xdd) return items(size, 1, depth);
      if (type === 0xde || type === 0xdf) return items(size, 2, depth);
    }
    if (size > left()) return false;
    i += size;
    return true;
  };
  const items = (count: number, per: number, depth: number) => {
    if (count * per > left()) return false;
    for (let k = 0; k < count * per; k++) if (!value(depth + 1)) return false;
    return true;
  };
  return value(0) && i === bytes.length;
}

/** A frame's bytes, or null when it isn't binary. */
const asBytes = (data: unknown) =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : null;

/**
 * Budget for the raw frames a guest sends, checked before PeerJS decodes
 * them (see `hookFrames`). PeerJS reassembles chunked messages on its own and
 * never hands the pieces to us, so without this a guest could make the host
 * decode and buffer data without ever tripping the message rate limit.
 */
export class FrameGuard {
  private frames: RateLimit;
  private bytes: RateLimit;

  constructor(now: () => number = Date.now) {
    // Looser than the message limits (10/s, and 40/s for the pointer,
    // cursors.ts), so only abuse ever hits it; a few seconds' worth at once,
    // so a link that stalled and sends its backlog in one go isn't.
    this.frames = new RateLimit(80, 240, now);
    this.bytes = new RateLimit(3072, 16 * 1024, now);
  }

  check(data: unknown): FrameVerdict {
    // Binary connections only ever carry bytes.
    const bytes = asBytes(data);
    if (!bytes || bytes.length > MAX_FRAME_BYTES) return 'bad';
    if (!this.frames.take() || !this.bytes.take(bytes.length)) return 'flood';
    return plausiblePack(bytes) ? 'ok' : 'bad';
  }
}

/** The (undocumented) methods of a PeerJS binary connection that `hookFrames` wraps. */
interface Decoder {
  _handleDataMessage?: (e: { data: unknown }) => void;
  _handleChunk?: (data: unknown) => void;
}

/**
 * Puts `check` in front of a PeerJS binary connection's decoding: its data
 * channel listener calls `_handleDataMessage` for every frame, before
 * unpacking it, and again for a split message once its chunks are put back
 * together. Each chunk of a split message goes to `onChunk` first, and on to
 * PeerJS's own buffering only if that returns true (a host's guests never
 * send messages big enough to be split, so for them it never does). Returns
 * false when this PeerJS doesn't have those methods (the caller must then
 * fall back, and say so).
 */
export function hookFrames(conn: object, check: (data: unknown) => boolean, onChunk: (chunk: unknown) => boolean): boolean {
  const c = conn as Decoder;
  const decode = c._handleDataMessage;
  const buffer = c._handleChunk;
  if (typeof decode !== 'function' || typeof buffer !== 'function') return false;
  c._handleDataMessage = (e) => {
    if (check(e.data)) decode.call(conn, e);
  };
  c._handleChunk = (data) => {
    if (onChunk(data)) buffer.call(conn, data);
  };
  return true;
}

/**
 * Largest message a host sends a guest, put back together: a picture, or a
 * veil with its labels (at most 1 MB, protocol.ts), fits several times over.
 */
export const MAX_HOST_MSG_BYTES = 8 * 1024 * 1024;
/** The most a probe's answer (a room's info, roomInfo.ts) ever takes. */
export const MAX_PROBE_BYTES = 2048;
/** How much of a split message each chunk carries (PeerJS's chunkedMTU). */
const CHUNK_BYTES = 16300;

/**
 * Whether a frame from a host (or a room answering a probe) may be decoded:
 * bytes, at most `max` of them, and one well-formed binarypack value. A host
 * is no more to be trusted than a guest: a few bytes announcing billions of
 * entries would freeze anyone who joins it, or merely scans the room list.
 */
export function frameFits(data: unknown, max: number): boolean {
  const bytes = asBytes(data);
  return !!bytes && bytes.length <= max && plausiblePack(bytes);
}

/**
 * The chunks of the split messages a host sends, checked before PeerJS
 * buffers them: each in shape, from a message no bigger than
 * MAX_HOST_MSG_BYTES, never twice, and only a couple of messages unfinished
 * at once (a host sends one message's chunks back to back), so what PeerJS
 * holds can't grow without end.
 */
export class ChunkGuard {
  private open = new Map<number, { total: number; seen: Set<number> }>();
  private maxChunks: number;
  private maxOpen: number;

  constructor(maxBytes = MAX_HOST_MSG_BYTES, maxOpen = 2) {
    this.maxChunks = Math.ceil(maxBytes / CHUNK_BYTES);
    this.maxOpen = maxOpen;
  }

  check(chunk: unknown): boolean {
    if (typeof chunk !== 'object' || chunk === null) return false;
    const { __peerData: id, n, total, data } = chunk as Record<string, unknown>;
    const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    if (!int(id, 0, 2 ** 32) || !int(total, 1, this.maxChunks) || !int(n, 0, total - 1)) return false;
    const bytes = asBytes(data);
    if (!bytes || bytes.length > CHUNK_BYTES) return false;
    let message = this.open.get(id);
    if (!message) {
      if (this.open.size >= this.maxOpen) return false;
      this.open.set(id, (message = { total, seen: new Set() }));
    }
    if (message.total !== total || message.seen.has(n)) return false;
    message.seen.add(n);
    if (message.seen.size === total) this.open.delete(id);
    return true;
  }
}

/** Most tokens the join gate keeps a budget for; the oldest go first. */
const GATE_ENTRIES = 500;

/**
 * How often people may join. Newcomers share one budget for the room (enough
 * for a full lobby at once, then one every few seconds) so a script can't
 * flood the room with fresh identities faster than the host can kick them;
 * everyone also has their own budget, so no one can leave and rejoin in a
 * loop (every join is announced to the whole room).
 */
export class JoinGate {
  private newcomers: RateLimit;
  /** Turned-down attempts that don't cost the newcomers' allowance. */
  private rejects: RateLimit;
  private each = new Map<string, RateLimit>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.newcomers = new RateLimit(1 / 4, 12, now);
    this.rejects = new RateLimit(1, 10, now);
  }

  /** Null if `secret` may join now, otherwise why not. */
  admit(secret: string, known: boolean): string | null {
    // A newcomer gets an entry only once past the shared budget, so junk
    // tokens can't crowd out (or reset) everyone else's.
    if (!known && !this.newcomers.take()) return 'Lots of people are joining right now. Try again in a few seconds.';
    // Least recently seen goes first when full, so a regular can't age out
    // (and come back with a fresh budget) while they keep rejoining.
    let own = this.each.get(secret);
    this.each.delete(secret);
    if (!own && this.each.size >= GATE_ENTRIES) this.each.delete(this.each.keys().next().value!);
    this.each.set(secret, (own ??= new RateLimit(1 / 10, 6, this.now)));
    if (own.take()) return null;
    if (!known) this.newcomers.refund();
    return 'You reconnected too often. Wait a few seconds, then try again.';
  }

  /**
   * The join was turned down after all (bad name, full, locked). A few such
   * attempts give the newcomers' allowance back, so they can't use it up; a
   * steady stream of them keeps paying for it, so it can't go on unthrottled.
   */
  rejected(secret: string, known: boolean) {
    if (known) return;
    this.each.delete(secret);
    if (this.rejects.take()) this.newcomers.refund();
  }
}

/** Keeps the newest `max` entries. */
export function capped<T>(list: T[], max: number): T[] {
  return list.length > max ? list.slice(list.length - max) : list;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * The token a browser shows the host of room `code`: an HMAC of its own
 * secret and the room code. Each host only learns a token for its own room,
 * so no host can take over someone's seat in another room. Throws where
 * WebCrypto is missing (plain http).
 */
export async function roomSecret(secret: string, code: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is not available');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await subtle.sign('HMAC', key, enc.encode(`room:${code}`))));
}
