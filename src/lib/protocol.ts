// Messages between host and guests, and strict checks for everything that
// arrives from the other side. Anything that doesn't match is dropped and the
// sender disconnected: a real client never sends malformed messages.

import type { Action, GameState } from './game';

export const PROTOCOL_VERSION = 10;

/** What hosts before version 10 tell a guest on another version, whichever side is out of date. */
export const LEGACY_VERSION_TEXT = 'Your game version is out of date. Please reload the page.';

/** Why a guest on protocol `v` can't join this host, or null when it can. */
export function versionProblem(v: number): string | null {
  if (v === PROTOCOL_VERSION) return null;
  return v < PROTOCOL_VERSION ? 'Your game is out of date. Reload the page to join.' : "The host's game is out of date. Ask them to reload the page.";
}

/** The refusal a guest shows: an older host can't say which side is behind, so the guest says it for them. */
export function versionRefusal(message: string): string {
  return message === LEGACY_VERSION_TEXT ? 'You and the host are on different versions of the game. Whoever loaded the page earlier should reload.' : message;
}

/** Guest → host. */
export type ClientMsg =
  /** `tab`: random per page load, so the host can tell another tab from this one reconnecting. */
  | { t: 'hello'; secret: string; name: string; v: number; tab?: string }
  | { t: 'action'; action: Action }
  | { t: 'pong'; n: number };

/** Host → guest. Media carries question art as image bytes. */
export type HostMsg =
  | { t: 'welcome'; playerId: string }
  | { t: 'state'; state: GameState; now: number }
  | { t: 'error'; message: string }
  | { t: 'kicked' }
  | { t: 'closed' }
  /** The same player connected again (another tab): this connection is dropped. */
  | { t: 'replaced' }
  /** Not now (too many joins): this connection is dropped, try again in a moment. */
  | { t: 'busy'; message: string }
  | { t: 'ping'; n: number }
  | MediaMsg;

export type MediaMsg =
  | { t: 'art'; qid: number; w: number; h: number; data: ArrayBuffer }
  | { t: 'veil'; qid: number; w: number; h: number; burn: number; count: number; box: [number, number, number, number] }
  | { t: 'patch'; qid: number; i: number; x: number; y: number; w: number; h: number; data: ArrayBuffer; edges: ArrayBuffer }
  | { t: 'option'; qid: number; index: number; data: ArrayBuffer };

/** A patch's edges: (x, y, patch) triples of 16-bit numbers, a few thousand at most. */
const MAX_EDGE_BYTES = 6 * 16384;

/** Roughly how big a decoded message is; guests never need more than this. */
const MAX_CLIENT_MSG_CHARS = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const SECRET = /^[A-Za-z0-9_-]{20,64}$/;
const TAB = /^[A-Za-z0-9_-]{8,64}$/;

/** Validates a message from a guest. Returns a clean copy, or null if it's bogus. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!isObj(raw)) return null;
  try {
    if (JSON.stringify(raw).length > MAX_CLIENT_MSG_CHARS) return null;
  } catch {
    return null;
  }
  switch (raw.t) {
    case 'hello':
      if (!isStr(raw.secret, 64) || !SECRET.test(raw.secret) || !isStr(raw.name, 200) || !isInt(raw.v, 0, 1e6))
        return null;
      if (raw.tab !== undefined && !(isStr(raw.tab, 64) && TAB.test(raw.tab))) return null;
      return raw.tab === undefined
        ? { t: 'hello', secret: raw.secret, name: raw.name, v: raw.v }
        : { t: 'hello', secret: raw.secret, name: raw.name, v: raw.v, tab: raw.tab };
    case 'pong':
      return isInt(raw.n, 0, Number.MAX_SAFE_INTEGER) ? { t: 'pong', n: raw.n } : null;
    case 'action': {
      const a = raw.action;
      if (!isObj(a)) return null;
      // Guests may only play; everything else is the host's job.
      switch (a.type) {
        case 'pick':
          return isStr(a.category, 80) ? { t: 'action', action: { type: 'pick', category: a.category } } : null;
        case 'answer': {
          const index = a.index === null ? null : isInt(a.index, 0, 16) ? a.index : undefined;
          const askedAt = a.askedAt === undefined ? undefined : isInt(a.askedAt, 0, Number.MAX_SAFE_INTEGER) ? a.askedAt : NaN;
          if (index === undefined || Number.isNaN(askedAt)) return null;
          return { t: 'action', action: { type: 'answer', index, askedAt } };
        }
        case 'next':
          return { t: 'action', action: { type: 'next' } };
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/** Light shape check of what the host sends (a broken host shouldn't crash us). */
export function parseHostMsg(raw: unknown): HostMsg | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  const bin = (v: unknown) => v instanceof ArrayBuffer || ArrayBuffer.isView(v);
  const qid = isInt(raw.qid, 0, Number.MAX_SAFE_INTEGER);
  switch (raw.t) {
    case 'welcome':
      return isStr(raw.playerId, 64) ? (raw as HostMsg) : null;
    case 'state': {
      const s = raw.state;
      return isObj(s) && Array.isArray(s.players) && isObj(s.settings) && typeof raw.now === 'number'
        ? (raw as HostMsg)
        : null;
    }
    case 'error':
    case 'busy':
      return isStr(raw.message, 300) ? (raw as HostMsg) : null;
    case 'kicked':
    case 'closed':
    case 'replaced':
      return raw as HostMsg;
    case 'ping':
      return isInt(raw.n, 0, Number.MAX_SAFE_INTEGER) ? (raw as HostMsg) : null;
    case 'art':
      return qid && bin(raw.data) && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) ? (raw as HostMsg) : null;
    case 'veil':
      return qid && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) && isInt(raw.burn, 0, 120000) &&
        isInt(raw.count, 0, 256) && Array.isArray(raw.box) && raw.box.length === 4 &&
        raw.box.every((v) => isInt(v, 0, 4096))
        ? (raw as HostMsg)
        : null;
    case 'patch':
      return qid && bin(raw.data) && isInt(raw.i, 0, 255) && isInt(raw.x, 0, 4096) && isInt(raw.y, 0, 4096) &&
        isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) && bin(raw.edges) &&
        (raw.edges as ArrayBuffer).byteLength % 6 === 0 && (raw.edges as ArrayBuffer).byteLength <= MAX_EDGE_BYTES
        ? (raw as HostMsg)
        : null;
    case 'option':
      return qid && bin(raw.data) && isInt(raw.index, 0, 16) ? (raw as HostMsg) : null;
    default:
      return null;
  }
}

/** Per-connection message budget: short bursts are fine, floods are not. */
export class RateLimit {
  private tokens: number;
  private last: number;
  private perSecond: number;
  private burst: number;
  private now: () => number;
  strikes = 0;

  constructor(perSecond = 10, burst = 20, now: () => number = Date.now) {
    this.perSecond = perSecond;
    this.burst = burst;
    this.tokens = burst;
    this.now = now;
    this.last = now();
  }

  /** Spends `cost` tokens (e.g. bytes), or counts a strike when there aren't enough. */
  take(cost = 1): boolean {
    const now = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    this.strikes++;
    return false;
  }

  /** Gives back tokens taken for something that didn't happen after all. */
  refund(cost = 1) {
    this.tokens = Math.min(this.burst, this.tokens + cost);
  }
}
