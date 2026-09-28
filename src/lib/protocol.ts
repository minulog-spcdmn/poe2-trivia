// Messages between host and guests, and strict checks for everything that
// arrives from the other side. Anything that doesn't match is dropped and the
// sender disconnected: a real client never sends malformed messages.

import type { Action, GameState } from './game';

export const PROTOCOL_VERSION = 4;

/** Guest → host. */
export type ClientMsg =
  | { t: 'hello'; secret: string; name: string; v: number }
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
  | { t: 'ping'; n: number }
  | MediaMsg;

export type MediaMsg =
  | { t: 'art'; qid: number; w: number; h: number; data: ArrayBuffer }
  | { t: 'grid'; qid: number; w: number; h: number; cols: number; rows: number }
  | { t: 'tile'; qid: number; i: number; x: number; y: number; w: number; h: number; data: ArrayBuffer }
  | { t: 'option'; qid: number; index: number; data: ArrayBuffer };

/** Roughly how big a decoded message is; guests never need more than this. */
const MAX_CLIENT_MSG_CHARS = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const SECRET = /^[A-Za-z0-9_-]{20,64}$/;

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
      return { t: 'hello', secret: raw.secret, name: raw.name, v: raw.v };
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
      return isStr(raw.message, 300) ? (raw as HostMsg) : null;
    case 'kicked':
    case 'closed':
    case 'replaced':
      return raw as HostMsg;
    case 'ping':
      return isInt(raw.n, 0, Number.MAX_SAFE_INTEGER) ? (raw as HostMsg) : null;
    case 'art':
      return qid && bin(raw.data) && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) ? (raw as HostMsg) : null;
    case 'grid':
      return qid && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) && isInt(raw.cols, 1, 64) &&
        isInt(raw.rows, 1, 64)
        ? (raw as HostMsg)
        : null;
    case 'tile':
      return qid && bin(raw.data) && isInt(raw.i, 0, 255) && isInt(raw.x, 0, 4096) && isInt(raw.y, 0, 4096) &&
        isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096)
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
  private last = Date.now();
  private perSecond: number;
  private burst: number;
  strikes = 0;

  constructor(perSecond = 10, burst = 20) {
    this.perSecond = perSecond;
    this.burst = burst;
    this.tokens = burst;
  }

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    this.strikes++;
    return false;
  }
}
