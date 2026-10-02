// Host-side limits on what guests can make the host do, and the per-room
// secret guests identify themselves with. Kept free of PeerJS and Svelte so
// it can be tested on its own.

import { RateLimit } from './protocol.ts';
import { base64url } from './tokens.ts';

/**
 * Largest data-channel frame a guest may send. A real client's biggest
 * message (hello with a long name) is well under 1 KB; PeerJS splits anything
 * over ~16 KB into chunks, which a real guest never needs.
 */
export const MAX_FRAME_BYTES = 2048;

/** What to do with a raw frame: pass it on, drop the connection (a flood), or block the peer (no real client sends it). */
export type FrameVerdict = 'ok' | 'flood' | 'bad';

/** Deeper than any message a real client sends (hello, pong, action). */
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
    // Looser than the message limit (10/s), so only abuse ever hits it.
    this.frames = new RateLimit(20, 40, now);
    this.bytes = new RateLimit(1024, 16 * 1024, now);
  }

  check(data: unknown): FrameVerdict {
    // Binary connections only ever carry bytes.
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : null;
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
 * unpacking it. Chunks of a split message go to `onChunk` instead of being
 * buffered: real guests never send messages big enough to be split, so
 * unfinished ones could only pile up. Returns false when this PeerJS doesn't
 * have those methods (the caller must then fall back, and say so).
 */
export function hookFrames(conn: object, check: (data: unknown) => boolean, onChunk: () => void): boolean {
  const c = conn as Decoder;
  const decode = c._handleDataMessage;
  if (typeof decode !== 'function' || typeof c._handleChunk !== 'function') return false;
  c._handleDataMessage = (e) => {
    if (check(e.data)) decode.call(conn, e);
  };
  c._handleChunk = () => onChunk();
  return true;
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
