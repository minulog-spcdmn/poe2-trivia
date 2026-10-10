// Other players' pointers, live on everyone's screen (PeerCursors.svelte).
//
// Screens differ (a phone stacks what a desktop sets side by side), so a
// pointer isn't sent as a spot on the screen but as a spot on something every
// screen has: an anchor, an element marked data-cursor="<name>" (an answer, a
// category card, a scoreboard row, the art; the game as a whole when over
// none of them), with where on it from 0 to SCALE across and down. Each
// screen puts it on its own copy of that element. The game as a whole is the
// exception down it (toAnchor): its height changes as cards are dealt and
// questions come and go, so a pointer resting on it would slide with it.
// Down the game, a pointer goes by screen heights from its top instead.
//
// Guests send theirs to the host at most every SEND_EVERY_MS while it moves;
// the host keeps only the latest of each and sends every guest one batch of
// what changed every FLUSH_EVERY_MS. None of it is part of the game state, so
// a pointer moving never sends the state to anyone.

import type { GameState } from './game.ts';

/** Positions on an anchor go from 0 to this, across and down. */
export const SCALE = 1000;
/** The game as a whole: down it, positions go by screen heights from its top, up to this many (toAnchor). */
export const GAME_ANCHOR = 0;
export const GAME_DEPTH = 4;
/** The furthest down a position on `anchor` goes. */
const maxY = (anchor: number) => (anchor === GAME_ANCHOR ? GAME_DEPTH * SCALE : SCALE);

/** An anchor's box on the screen, as getBoundingClientRect gives it. */
export interface AnchorBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the spot (px, py) is on `anchor` (its code, its box `r`), on a
 * screen `screenH` high: across, from 0 to SCALE; down, the same, but on
 * the game as a whole by screen heights from its top (it grows and shrinks
 * as screens come and go, the screen doesn't).
 */
export function toAnchor(anchor: number, px: number, py: number, r: AnchorBox, screenH: number): [number, number] {
  const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v * SCALE)));
  const down = anchor === GAME_ANCHOR ? (py - r.top) / screenH : (py - r.top) / r.height;
  return [clamp((px - r.left) / r.width, SCALE), clamp(down, maxY(anchor))];
}

/** Where a position on `anchor` (toAnchor's) is on this screen. */
export function fromAnchor(anchor: number, x: number, y: number, r: AnchorBox, screenH: number): [number, number] {
  return [r.left + (x / SCALE) * r.width, r.top + (y / SCALE) * (anchor === GAME_ANCHOR ? screenH : r.height)];
}
/** A guest sends its pointer at most this often (ms), and the host its batches. */
export const SEND_EVERY_MS = 100;
export const FLUSH_EVERY_MS = 100;

/** Anchors that come in lists (by index, the same on every screen) take the codes from their base up. */
const LISTS = { opt: 16, card: 32, row: 48 } as const;
const SINGLES: Record<string, number> = { game: GAME_ANCHOR, art: 1 };
const LIST_SIZE = 16;
export const MAX_ANCHOR = LISTS.row + LIST_SIZE - 1;

/** The wire code for an anchor's name (data-cursor), or null for one there isn't. */
export function anchorCode(name: string): number | null {
  if (name in SINGLES) return SINGLES[name];
  const m = /^(opt|card|row):(\d{1,2})$/.exec(name);
  if (!m) return null;
  const i = Number(m[2]);
  return i < LIST_SIZE ? LISTS[m[1] as keyof typeof LISTS] + i : null;
}

/** The name for a wire code, or null for one there isn't. */
export function anchorName(code: number): string | null {
  for (const [name, c] of Object.entries(SINGLES)) if (c === code) return name;
  for (const [name, base] of Object.entries(LISTS)) if (code >= base && code < base + LIST_SIZE) return `${name}:${code - base}`;
  return null;
}

/** What a pointer is doing: a mouse, a mouse with its button held, or a tap on a touch screen (shown for a moment). */
export const MOUSE = 0;
export const TAP = 1;
export const PRESSED = 2;
export type PointerKind = typeof MOUSE | typeof TAP | typeof PRESSED;
/** Where a pointer is: an anchor's code, the spot on it, and what it's doing. */
export type CursorAt = [anchor: number, x: number, y: number, kind: PointerKind];
/** One pointer in a host's batch: whose (cursorKey), and where, or nothing when it's gone. */
export type CursorEntry = [who: string] | [who: string, ...CursorAt];

/** Where a batch's entry has the pointer, or null when it's gone. */
export const entryAt = (e: CursorEntry): CursorAt | null => (e.length === 5 ? [e[1], e[2], e[3], e[4]] : null);

/** Short for a player's id in batches; ids are random, so their start tells a room's players apart. */
export const cursorKey = (id: string) => id.slice(0, 8);

/**
 * Whether pointers are shown: in the lobby (whatever the mode: there's
 * nothing to give away there), and in a game, but never while players race
 * for the same answer (race mode, a deathmatch's question), where one
 * hovering an answer would give it away. Delve together races for the
 * answer too, but as one team, so it shows them.
 */
export function cursorsLive(s: GameState | null): boolean {
  if (s?.phase === 'lobby') return true;
  if (!s || s.settings.mode === 'race') return false;
  if (s.phase !== 'choosing' && s.phase !== 'question' && s.phase !== 'reveal') return false;
  return !(s.deathmatch && s.phase === 'question');
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** A pointer from a guest, or undefined when it's bogus (null is a pointer gone). */
export function parseCursorAt(v: unknown): CursorAt | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 4) return undefined;
  const [a, x, y, kind] = v;
  if (!isInt(a, 0, MAX_ANCHOR) || anchorName(a) === null || !isInt(x, 0, SCALE) || !isInt(y, 0, maxY(a)) || !isInt(kind, MOUSE, PRESSED))
    return undefined;
  return [a, x, y, kind as PointerKind];
}

/** A host's batch, or null when it's bogus. */
export function parseCursorBatch(v: unknown): CursorEntry[] | null {
  if (!Array.isArray(v) || v.length > 32) return null;
  const out: CursorEntry[] = [];
  for (const e of v) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0].length > 16) return null;
    if (e.length === 1) out.push([e[0]]);
    else {
      const at = parseCursorAt(e.slice(1));
      if (!at) return null;
      out.push([e[0], ...at]);
    }
  }
  return out;
}

/**
 * Host: what each guest (`K`, its connection) is still to be sent, the latest
 * of each pointer only. A guest whose link is backed up is simply sent it
 * later, by which time older moves have been replaced by newer ones.
 */
export class CursorOutbox<K> {
  private pending = new Map<K, Map<string, CursorEntry>>();

  put(entry: CursorEntry, to: Iterable<K>) {
    for (const k of to) {
      let m = this.pending.get(k);
      if (!m) this.pending.set(k, (m = new Map()));
      m.set(entry[0], entry);
    }
  }

  /** What `k` is to be sent now, which is then no longer pending; null when nothing is. */
  take(k: K): CursorEntry[] | null {
    const m = this.pending.get(k);
    this.pending.delete(k);
    return m?.size ? [...m.values()] : null;
  }

  drop(k: K) {
    this.pending.delete(k);
  }

  clear() {
    this.pending.clear();
  }

  get waiting() {
    return this.pending.size > 0;
  }
}
