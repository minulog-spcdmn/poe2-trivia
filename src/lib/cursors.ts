// Other players' pointers, live on everyone's screen (PeerCursors.svelte).
//
// Screens differ (a phone stacks what a desktop sets side by side, a host
// has controls a guest only reads), so a pointer isn't sent as a spot on the
// screen but as a spot on something every screen has: an anchor, an element
// marked data-cursor="<name>" (an answer, a category card, a scoreboard row,
// a setting, the header's buttons; the game as a whole when over none of
// them), with where on it from 0 to SCALE across and down. Each screen puts
// it on its own copy of that element. Anchors sit inside each other (a
// setting's button in its row, the row in the settings panel), and a pointer
// goes with up to MAX_HOPS of them, innermost first: a screen without the
// first (a guest has no host's buttons; a phone hides what a desktop shows)
// puts it on the next it has, so it lands in the right part of the screen
// rather than by the game as a whole. Counterparts share a name: the host's
// Begin row and a guest's "waiting for the host" line are both `start`, the
// timer is `timer` wherever a layout puts it. Between anchors, a pointer
// goes on the one nearest it, beside it (pointerAnchor.ts).
//
// The game as a whole is the exception down it (toAnchor): its height
// changes as cards are dealt and questions come and go, so a pointer resting
// on it would slide with it. Down the game, a pointer goes by screen heights
// from its top instead.
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
/**
 * On an element, a position may lie off it (a pointer between elements goes
 * on the one nearest it, so it keeps its place beside it on every screen): as
 * far as four times its own size on either side.
 */
export const OFF = 4 * SCALE;

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
  const game = anchor === GAME_ANCHOR;
  const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(game ? 0 : -OFF, v * SCALE)));
  const down = game ? (py - r.top) / screenH : (py - r.top) / r.height;
  return [clamp((px - r.left) / r.width, game ? SCALE : SCALE + OFF), clamp(down, game ? maxY(anchor) : SCALE + OFF)];
}

/**
 * Where a pointer is drawn at time `t`, from where it was heard to be at
 * times `ts` (points `ps`, oldest first): along a smooth curve through them
 * (Catmull-Rom), held at the first before it and the last after it. Drawn a
 * little behind the newest, a pointer heard ten times a second moves along
 * a curve rather than from corner to corner.
 */
export function trailAt(ps: [number, number][], ts: number[], t: number): [number, number] {
  const n = ps.length;
  if (!n) return [0, 0];
  if (n === 1 || t <= ts[0]) return ps[0];
  if (t >= ts[n - 1]) return ps[n - 1];
  let j = 0;
  while (j < n - 2 && ts[j + 1] <= t) j++;
  const u = Math.min(1, Math.max(0, (t - ts[j]) / Math.max(1, ts[j + 1] - ts[j])));
  const p0 = ps[Math.max(0, j - 1)];
  const [p1, p2] = [ps[j], ps[j + 1]];
  const p3 = ps[Math.min(n - 1, j + 2)];
  const c = (a: number, b: number, c2: number, d: number) =>
    0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
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
const LIST_SIZE = 16;
/**
 * Anchors there's one of, coded from 64 up (`game`, `art` and `next` keep
 * their first codes, as recorded hands have them). Each is a part of a
 * screen, named for what it is so its counterpart elsewhere can share the
 * name. `next`: the button that moves on after a reveal (a host or the
 * player whose turn it was presses it).
 */
const FIRST = ['game', 'art', 'next'];
const MORE = [
  // The header over every screen.
  'header', 'brand', 'meta', 'mute', 'fx', 'leave',
  // The lobby: the room, the party, the game's settings, the start (Begin, or a guest's wait for it).
  'room', 'code', 'invite', 'hide', 'access', 'public', 'lock', 'party', 'watch', 'coop',
  'settings', 'modes', 'about', 'target', 'difficulty', 'time', 'rules', 'descent', 'start', 'begin',
  // A game: its banner, the scoreboard, the choice of cards, a question and the row under it.
  'banner', 'duel', 'skip', 'board', 'ask', 'watching',
  'prompt', 'cards', 'notes', 'vote', 'note',
  'task', 'timer', 'item', 'plate', 'options', 'footer', 'result', 'verdict', 'outcome', 'blast', 'hint',
  // The end: the headline, the standings, what's next.
  'kicker', 'headline', 'sub', 'standings', 'actions', 'again', 'back', 'share', 'joining', 'credit',
];
/** Every anchor there's one of, by name. */
export const SINGLE_ANCHORS: readonly string[] = [...FIRST, ...MORE];
const SINGLES: Record<string, number> = Object.fromEntries([...FIRST.map((n, i) => [n, i]), ...MORE.map((n, i) => [n, 64 + i])]);
const NAMES = new Map(Object.entries(SINGLES).map(([n, c]) => [c, n]));
export const MAX_ANCHOR = 64 + MORE.length - 1;

/** The wire code for an anchor's name (data-cursor), or null for one there isn't. */
export function anchorCode(name: string): number | null {
  if (Object.hasOwn(SINGLES, name)) return SINGLES[name];
  const m = /^(opt|card|row):(\d{1,2})$/.exec(name);
  if (!m) return null;
  const i = Number(m[2]);
  return i < LIST_SIZE ? LISTS[m[1] as keyof typeof LISTS] + i : null;
}

/** The name for a wire code, or null for one there isn't. */
export function anchorName(code: number): string | null {
  const single = NAMES.get(code);
  if (single !== undefined) return single;
  for (const [name, base] of Object.entries(LISTS)) if (code >= base && code < base + LIST_SIZE) return `${name}:${code - base}`;
  return null;
}

/** What a pointer is doing: a mouse, a mouse with its button held, or a tap on a touch screen (shown for a moment). */
export const MOUSE = 0;
export const TAP = 1;
export const PRESSED = 2;
/**
 * Added to any of those: over something its player can click (their own
 * cursor is the hand there), so the others see it as the hand too. What a
 * player can click is theirs to know: their own screen says.
 */
export const LIT = 3;
export type PointerKind = 0 | 1 | 2 | 3 | 4 | 5;
/** What a pointer is doing, its look aside: MOUSE, TAP or PRESSED. */
export const actionOf = (kind: PointerKind) => kind % LIT;
/** Whether it's over something its player can click. */
export const litOf = (kind: PointerKind) => kind >= LIT;
/** A spot on an anchor: its code, and where on it. */
export type Hop = [anchor: number, x: number, y: number];
/** A pointer goes with at most this many anchors: its own, then what holds it (cursors.ts). */
export const MAX_HOPS = 3;
/**
 * Where a pointer is: an anchor's code and the spot on it, what it's doing,
 * then up to MAX_HOPS - 1 more anchors that hold the first, outward, and
 * the spot on each, for a screen that doesn't have the first.
 */
export type CursorAt = [anchor: number, x: number, y: number, kind: PointerKind, ...more: number[]];
/** One pointer in a host's batch: whose (cursorKey), and where, or nothing when it's gone. */
export type CursorEntry = [who: string] | [who: string, ...CursorAt];

/** A pointer at `hops` (innermost first, at least one), doing `kind`. */
export function cursorAt(hops: Hop[], kind: PointerKind): CursorAt {
  const [first, ...more] = hops.slice(0, MAX_HOPS);
  return [...first, kind, ...more.flat()];
}

/** The anchors a pointer is at, innermost first. */
export function hopsOf(at: CursorAt): Hop[] {
  const out: Hop[] = [[at[0], at[1], at[2]]];
  for (let i = 4; i + 2 < at.length; i += 3) out.push([at[i], at[i + 1], at[i + 2]]);
  return out;
}

/** Where a batch's entry has the pointer, or null when it's gone. */
export const entryAt = (e: CursorEntry): CursorAt | null => (e.length >= 5 ? (e.slice(1) as CursorAt) : null);

/** Short for a player's id in batches; ids are random, so their start tells a room's players apart. */
export const cursorKey = (id: string) => id.slice(0, 8);

/**
 * Whether pointers are shown: in the lobby and once the game is over
 * (whatever the mode: there's nothing to give away there), and in a game, but never while players race
 * for the same answer (race mode, a deathmatch's question), where one
 * hovering an answer would give it away. Delve together races for the
 * answer too, but as one team, so it shows them.
 */
export function cursorsLive(s: GameState | null): boolean {
  // The lobby has nothing to give away, nor the end of a game.
  if (s?.phase === 'lobby' || s?.phase === 'over') return true;
  if (!s || s.settings.mode === 'race') return false;
  if (s.phase !== 'choosing' && s.phase !== 'question' && s.phase !== 'reveal') return false;
  return !(s.deathmatch && s.phase === 'question');
}

/**
 * Whether the player `id` can click the anchor `name` now (true), can't
 * (false: someone else's answer, a card not theirs to pick, Next when it's
 * neither their turn nor their room), or it's nothing to click (null): so a
 * pointer over it shows as theirs would, the hand or the dull lead dart.
 */
export function clickableFor(s: GameState, id: string, name: string): boolean | null {
  const group = (s.delve?.entrants.length ?? 0) >= 2;
  const seated = s.players.some((p) => p.id === id);
  const theirTurn = s.players[s.turn]?.id === id;
  if (name === 'next') {
    if (s.phase !== 'reveal') return false;
    return s.settings.mode === 'race' && !s.delve ? s.hostId === id : group ? seated : theirTurn || s.hostId === id;
  }
  if (name.startsWith('opt:')) return s.phase === 'question' && (group ? seated : theirTurn);
  if (name.startsWith('card:')) {
    if (s.phase === 'lobby') return s.hostId === id;
    return s.phase === 'choosing' && (group ? seated : theirTurn);
  }
  return null;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Whether (a, x, y) is a spot on an anchor there is. */
function isHop(a: unknown, x: unknown, y: unknown): boolean {
  if (!isInt(a, 0, MAX_ANCHOR) || anchorName(a) === null) return false;
  const game = a === GAME_ANCHOR;
  const lo = game ? 0 : -OFF;
  return isInt(x, lo, game ? SCALE : SCALE + OFF) && isInt(y, lo, game ? maxY(a) : SCALE + OFF);
}

/** A pointer from a guest, or undefined when it's bogus (null is a pointer gone). */
export function parseCursorAt(v: unknown): CursorAt | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length < 4 || v.length > 1 + 3 * MAX_HOPS || (v.length - 4) % 3) return undefined;
  if (!isInt(v[3], MOUSE, LIT + PRESSED)) return undefined;
  if (!isHop(v[0], v[1], v[2])) return undefined;
  for (let i = 4; i < v.length; i += 3) if (!isHop(v[i], v[i + 1], v[i + 2])) return undefined;
  return v.slice() as CursorAt;
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
 * later, by which time older moves have been replaced by newer ones. A press
 * (or a tap) is never replaced before it has gone, though: a click is over
 * quicker than a batch comes, and would never be seen.
 */
export class CursorOutbox<K> {
  private pending = new Map<K, Map<string, CursorEntry>>();
  /** What came after a press not sent yet: it goes in the batch after, so the press is seen (a click is quicker than a batch). */
  private after = new Map<K, Map<string, CursorEntry>>();

  put(entry: CursorEntry, to: Iterable<K>) {
    for (const k of to) {
      let m = this.pending.get(k);
      if (!m) this.pending.set(k, (m = new Map()));
      const was = m.get(entry[0]);
      const marks = (e: CursorEntry | undefined) => !!e && e.length > 1 && actionOf(e[4]!) !== MOUSE;
      if (marks(was) && !(entry.length > 1 && actionOf(entry[4]!) === actionOf(was![4]!))) {
        let a = this.after.get(k);
        if (!a) this.after.set(k, (a = new Map()));
        a.set(entry[0], entry);
      } else {
        m.set(entry[0], entry);
        this.after.get(k)?.delete(entry[0]);
      }
    }
  }

  /** What `k` is to be sent now, which is then no longer pending (what was held back after a press is, for next time); null when nothing is. */
  take(k: K): CursorEntry[] | null {
    const m = this.pending.get(k);
    this.pending.delete(k);
    const a = this.after.get(k);
    this.after.delete(k);
    if (a?.size) this.pending.set(k, a);
    return m?.size ? [...m.values()] : null;
  }

  drop(k: K) {
    this.pending.delete(k);
    this.after.delete(k);
  }

  clear() {
    this.pending.clear();
    this.after.clear();
  }

  get waiting() {
    return this.pending.size > 0;
  }
}
