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
    const size =
      data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data.byteLength : typeof data === 'string' ? data.length : Infinity;
    if (size > MAX_FRAME_BYTES) return 'bad';
    return this.frames.take() && this.bytes.take(size) ? 'ok' : 'flood';
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
  private each = new Map<string, RateLimit>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.newcomers = new RateLimit(1 / 4, 12, now);
  }

  /** Null if `secret` may join now, otherwise why not. */
  admit(secret: string, known: boolean): string | null {
    // A newcomer gets an entry only once past the shared budget, so junk
    // tokens can't crowd out (or reset) everyone else's.
    if (!known && !this.newcomers.take()) return 'Lots of people are joining right now. Try again in a few seconds.';
    let own = this.each.get(secret);
    if (!own) {
      if (this.each.size >= GATE_ENTRIES) this.each.delete(this.each.keys().next().value!);
      this.each.set(secret, (own = new RateLimit(1 / 10, 6, this.now)));
    }
    if (own.take()) return null;
    if (!known) this.newcomers.refund();
    return 'You reconnected too often. Wait a few seconds, then try again.';
  }

  /**
   * The join was turned down after all (bad name, full, locked): a newcomer
   * gets the shared allowance back, so rejected attempts can't use it up.
   */
  rejected(secret: string, known: boolean) {
    if (known) return;
    this.newcomers.refund();
    this.each.delete(secret);
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
