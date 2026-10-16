// Messages between host and guests, and strict checks for everything that
// arrives from the other side. Anything that doesn't match is dropped and the
// sender disconnected: a real client never sends malformed messages.

import { answerMs, type Action, type GameState } from './game.ts';
import { parseCursorAt, parseCursorBatch, type CursorAt, type CursorEntry } from './cursors.ts';
import type { Presence, Standing } from './presence.ts';

export const PROTOCOL_VERSION = 30;

/** What hosts before version 10 tell a guest on another version, whichever side is out of date. */
export const LEGACY_VERSION_TEXT = 'Your game version is out of date. Please reload the page.';

const GUEST_BEHIND = 'Your game is out of date. Reload the page to join.';
const HOST_BEHIND = "The host's game is out of date. Ask them to reload the page.";

/** Why a guest on protocol `v` can't join this host, or null when it can. */
export function versionProblem(v: number): string | null {
  if (v === PROTOCOL_VERSION) return null;
  return v < PROTOCOL_VERSION ? GUEST_BEHIND : HOST_BEHIND;
}

/**
 * Whether a host's refusal is about the versions, not the room (full, locked,
 * a name): flagged so (`version`), or, from a host older than the flag, in
 * the words it used (versionProblem's then, or LEGACY_VERSION_TEXT).
 */
export const isVersionRefusal = (msg: { message: string; version?: true }) =>
  msg.version === true || msg.message === GUEST_BEHIND || msg.message === HOST_BEHIND || msg.message === LEGACY_VERSION_TEXT;

/** The refusal a guest shows: an older host can't say which side is behind, so the guest says it for them. */
export function versionRefusal(message: string): string {
  return message === LEGACY_VERSION_TEXT ? 'You and the host are on different versions of the game. Whoever loaded the page earlier should reload.' : message;
}

/** Guest → host. */
export type ClientMsg =
  /**
   * `tab`: random per page load, so the host can tell another tab from this one reconnecting.
   * `watch`: the guest would rather watch than play (see the watch action).
   */
  | { t: 'hello'; secret: string; name: string; v: number; tab?: string; watch?: boolean }
  | { t: 'action'; action: Action }
  | { t: 'pong'; n: number }
  /** Where this player's pointer is (cursors.ts), or null when it left the page. */
  | { t: 'cursor'; at: CursorAt | null }
  /** Whether this player's game is on screen and in use (presence.ts), sent when it changes. */
  | { t: 'presence'; p: Presence };

/** Host → guest. Media carries question art as image bytes. */
export type HostMsg =
  | { t: 'welcome'; playerId: string }
  | { t: 'state'; state: GameState; now: number }
  /**
   * `askedAt`: an answer to that question was turned down, so it may be
   * given again. A guest that doesn't know the field just shows the message.
   */
  /** `version`: turned away for the versions (isVersionRefusal). */
  | { t: 'error'; message: string; askedAt?: number; version?: true }
  | { t: 'kicked' }
  | { t: 'closed' }
  /** The same player connected again (another tab): this connection is dropped. */
  | { t: 'replaced' }
  /** Not now (too many joins): this connection is dropped, try again in a moment. */
  | { t: 'busy'; message: string }
  | { t: 'ping'; n: number }
  /** Other players' pointers that moved since the last batch (cursors.ts). */
  | { t: 'cursors'; c: CursorEntry[] }
  /** Lobby: how each player who isn't simply ready stands (presence.ts), by id; sent when it changes. */
  | { t: 'standing'; s: Record<string, Standing> }
  | MediaMsg;

export type MediaMsg =
  | { t: 'art'; qid: number; w: number; h: number; data: ArrayBuffer }
  /**
   * A veiled picture, whole (`data`), with which patch each of its art pixels
   * falls in (`labels`: patches.ts packLabels). `tile`: a veiled "find the
   * art" picture (Delve), by option; missing for the art of a name question.
   */
  | { t: 'veil'; qid: number; tile?: number; w: number; h: number; burn: number; count: number; box: [number, number, number, number]; data: ArrayBuffer; labels: ArrayBuffer }
  /** Patch `i` of the veiled picture (its index in the cut) is uncovered. */
  | { t: 'patch'; qid: number; tile?: number; i: number }
  /** `w`, `h`: its size in art pixels (the picture is finer, by the item's artScale). */
  | { t: 'option'; qid: number; index: number; w: number; h: number; data: ArrayBuffer };

/** A veiled picture's labels: (patch, length) pairs of 16-bit numbers, a run per patch per row or so. */
const MAX_LABEL_BYTES = 4 * 262144;

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
      if (raw.watch !== undefined && typeof raw.watch !== 'boolean') return null;
      return {
        t: 'hello',
        secret: raw.secret,
        name: raw.name,
        v: raw.v,
        ...(raw.tab !== undefined ? { tab: raw.tab } : {}),
        ...(raw.watch ? { watch: true } : {}),
      };
    case 'pong':
      return isInt(raw.n, 0, Number.MAX_SAFE_INTEGER) ? { t: 'pong', n: raw.n } : null;
    case 'cursor': {
      const at = parseCursorAt(raw.at);
      return at === undefined ? null : { t: 'cursor', at };
    }
    case 'presence':
      return raw.p === 'here' || raw.p === 'idle' || raw.p === 'away' ? { t: 'presence', p: raw.p } : null;
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
          // Its time on the guest's device, for the end screen: dropped if it isn't one (game.ts answerMs).
          const ms = answerMs(a.ms);
          return { t: 'action', action: { type: 'answer', index, askedAt, ...(ms !== undefined ? { ms } : {}) } };
        }
        case 'next':
          return { t: 'action', action: { type: 'next' } };
        // Delve co-op: a vote for a card, and a life given to a teammate (the host checks both against the run).
        case 'vote':
          return isStr(a.category, 80) && a.category.length > 0 ? { t: 'action', action: { type: 'vote', category: a.category } } : null;
        case 'revive':
          return isStr(a.target, 64) && a.target.length > 0 ? { t: 'action', action: { type: 'revive', target: a.target } } : null;
        // Delve: a stick of dynamite blasts the question asked at `askedAt` away (the host checks it against the run).
        case 'blast':
          return isInt(a.askedAt, 0, Number.MAX_SAFE_INTEGER) ? { t: 'action', action: { type: 'blast', askedAt: a.askedAt } } : null;
        // Watch rather than play (or take a seat again): only ever the sender's own choice.
        case 'watch':
          return typeof a.watch === 'boolean' ? { t: 'action', action: { type: 'watch', watch: a.watch } } : null;
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
  const byteLength = (v: unknown) => (v as ArrayBuffer | ArrayBufferView).byteLength;
  const qid = isInt(raw.qid, 0, Number.MAX_SAFE_INTEGER);
  const tile = raw.tile === undefined || isInt(raw.tile, 0, 16);
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
      return isStr(raw.message, 300) && (raw.askedAt === undefined || isInt(raw.askedAt, 0, Number.MAX_SAFE_INTEGER)) && (raw.version === undefined || raw.version === true)
        ? (raw as HostMsg)
        : null;
    case 'busy':
      return isStr(raw.message, 300) ? (raw as HostMsg) : null;
    case 'kicked':
    case 'closed':
    case 'replaced':
      return raw as HostMsg;
    case 'ping':
      return isInt(raw.n, 0, Number.MAX_SAFE_INTEGER) ? (raw as HostMsg) : null;
    case 'cursors': {
      const c = parseCursorBatch(raw.c);
      return c ? { t: 'cursors', c } : null;
    }
    case 'standing': {
      if (!isObj(raw.s)) return null;
      const s: Record<string, Standing> = Object.create(null);
      const entries = Object.entries(raw.s);
      if (entries.length > 64) return null;
      for (const [id, v] of entries) {
        if (id.length > 64 || (v !== 'away' && v !== 'idle' && v !== 'slow')) return null;
        s[id] = v;
      }
      return { t: 'standing', s };
    }
    case 'art':
      return qid && bin(raw.data) && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) ? (raw as HostMsg) : null;
    case 'veil':
      return qid && tile && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) && isInt(raw.burn, 0, 120000) &&
        isInt(raw.count, 0, 256) && Array.isArray(raw.box) && raw.box.length === 4 &&
        raw.box.every((v) => isInt(v, 0, 4096)) && bin(raw.data) && bin(raw.labels) &&
        byteLength(raw.labels) % 4 === 0 && byteLength(raw.labels) <= MAX_LABEL_BYTES
        ? (raw as HostMsg)
        : null;
    case 'patch':
      return qid && tile && isInt(raw.i, 0, 254) ? (raw as HostMsg) : null;
    case 'option':
      return qid && bin(raw.data) && isInt(raw.index, 0, 16) && isInt(raw.w, 1, 4096) && isInt(raw.h, 1, 4096) ? (raw as HostMsg) : null;
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
