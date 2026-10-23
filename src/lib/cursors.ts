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
// timer is `timer` wherever a layout puts it.
//
// Between anchors (and in one a screen hasn't), a pointer goes with the
// anchors beside it too, up to MAX_BESIDE within BLEND_PX: the nearest spot
// on each and how far off it, in px (besideOf). Each screen sets it by all
// of them, the nearer the more (blended), and by what holds it a little:
// where the two screens set things alike, just where it is; where they set
// them apart (a host's controls a guest only reads, the winner's end screen
// and a loser's), it goes from one to the next as its player's hand does,
// rather than on what holds them, which the two set apart, and then
// hopping onto the next as it got there.
//
// The game as a whole is the exception down it (toAnchor): its height
// changes as cards are dealt and questions come and go, so a pointer resting
// on it would slide with it. Down the game, a pointer goes by screen heights
// from its top instead.
//
// Guests send theirs to the host at most every SEND_EVERY_MS while it moves,
// and a press or a release at once (within POINTER_RATE); the host keeps
// only the latest of each and sends every guest one batch of what changed
// every FLUSH_EVERY_MS, or, for a click, a frame after the last. None of it is part of the game state, so
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
 * On an element, a position may lie off it (a bot's pointer goes on the one
 * nearest it, so it keeps its place beside it on every screen): as far as
 * four times its own size on either side.
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
 * little behind the newest, a pointer heard twenty times a second moves along
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
  // (The next not come yet: going on as it goes, rather than slowing for a stop that isn't one.)
  const p3: [number, number] = j + 2 >= n ? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]] : ps[j + 2];
  const c = (a: number, b: number, c2: number, d: number) =>
    0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

/** Which of the places at times `ts` trailAt draws at time `t`, or is on its way to. */
export function trailIndex(ts: number[], t: number): number {
  const i = ts.findIndex((x) => x >= t);
  return i < 0 ? ts.length - 1 : i;
}

/** How far a trail (places `ps` at times `ts`) still goes from `from`, where it's drawn at time `t`, to its newest place (in its places' own measure). */
export function wayLeft(ps: [number, number][], ts: number[], t: number, from: [number, number]): number {
  if (!ps.length || t >= ts.at(-1)!) return 0;
  const i = trailIndex(ts, t);
  let left = Math.hypot(ps[i][0] - from[0], ps[i][1] - from[1]);
  for (let j = i + 1; j < ps.length; j++) left += Math.hypot(ps[j][0] - ps[j - 1][0], ps[j][1] - ps[j - 1][1]);
  return left;
}

/**
 * How far a hand goes, measured on its game as a whole as it would on a
 * desktop's (the game this wide and a screen this high, px): a phone's game
 * is so small that its px of the way, beside how far another layout sets
 * things there, came to next to nothing (handOn).
 */
const HAND_W = 1440;
const HAND_H = 900;
/** Where a hand at (x, y) on the game as a whole (toAnchor's) is in HAND_W by HAND_H. */
export const handOn = (x: number, y: number): [number, number] => [(x / SCALE) * HAND_W, (y / SCALE) * HAND_H];
/** And a spot on this screen (px) by the game's box `r` here, though it's off the game (the header over it). */
export const handAt = (px: number, py: number, r: AnchorBox, screenH: number): [number, number] => [((px - r.left) / r.width) * HAND_W, ((py - r.top) / screenH) * HAND_H];

/** How quickly a pointer standing still makes up the rest of how far it's off (ms to about 2/3 of it). */
export const LEAN_MS = 150;
/** Landing, at most this many px of it for each its hand goes (handOn's). */
const LEAN_RATE = 2;
/** Going, how far its hand goes (handOn's) for what it aims at, and then for itself, to come about 2/3 of the way (leaned). */
const AIM_HAND = 70;
const LEAN_HAND = 70;
/** And never more in a frame than this share of the way its hand went here (px), so it keeps within 30 degrees of its hand's way. */
const STEER = 0.5;
/** A hand going slower than this (handOn's px a ms) on something is landing on it. */
export const LANDING_SPEED = 0.25;

/** How far a pointer is drawn off its hand's own path (x, y), and how far it's aiming to be (ax, ay): leaned. */
export interface Lean {
  x: number;
  y: number;
  ax: number;
  ay: number;
}

/**
 * How far a pointer is drawn off its hand's own path, `lean` last frame,
 * toward `off` (how far its newest place lies off it), its hand having gone
 * `moved` since (handOn's; `step` px here) and with `left` still to go to
 * its newest place.
 *
 * Landing (its hand coming to rest on something this screen has too, the
 * very thing): by as much of what's left as the way its hand went this frame
 * is of that and the way it has still to go, so it's all made up as its hand
 * gets there, evenly along the way; never more than LEAN_RATE times its
 * hand's way (with little way left for much to make up, it swooped), and
 * never less than it makes up standing (LEAN_MS): what's left then is made
 * up as it stands, as a hand reaching further takes a moment longer.
 *
 * Going (over things, or over what this screen hasn't: a host's buttons a
 * guest hasn't, the winner's lines on a loser's screen), smoothed twice over
 * its hand's way: what it aims at goes toward its place (AIM_HAND), and it
 * goes toward that (LEAN_HAND). Set by whatever this screen has round there,
 * its place swings about as its hand goes straight on: followed, the pointer
 * jerked about with it; ignored, it went on as if the screens were alike and
 * then swooped across to where its hand came to rest. Smoothed twice, the
 * swings come to nothing and it bends smoothly toward where things are here,
 * all along the way, never more than STEER of its hand's way here in a frame
 * (a phone's game is so small that, measured as a desktop's, it was pulled
 * back against its hand).
 */
export function leaned(lean: Lean, off: [number, number], moved: number, left: number, dt: number, landing: boolean, step = moved): Lean {
  if (landing) {
    const rest = Math.hypot(off[0] - lean.x, off[1] - lean.y);
    if (rest < 1e-9) return { x: off[0], y: off[1], ax: off[0], ay: off[1] };
    const k = Math.max(moved > 0 ? Math.min(moved / (moved + left), (LEAN_RATE * moved) / rest) : 0, 1 - Math.exp(-dt / LEAN_MS));
    const [x, y] = [lean.x + (off[0] - lean.x) * k, lean.y + (off[1] - lean.y) * k];
    return { x, y, ax: x, ay: y };
  }
  const a = 1 - Math.exp(-moved / AIM_HAND);
  const ax = lean.ax + (off[0] - lean.ax) * a;
  const ay = lean.ay + (off[1] - lean.ay) * a;
  const b = 1 - Math.exp(-moved / LEAN_HAND);
  const [dx, dy] = [(ax - lean.x) * b, (ay - lean.y) * b];
  const k = Math.min(1, (STEER * step) / Math.max(1e-9, Math.hypot(dx, dy)));
  return { x: lean.x + dx * k, y: lean.y + dy * k, ax, ay };
}

/** Where a position on `anchor` (toAnchor's) is on this screen. */
export function fromAnchor(anchor: number, x: number, y: number, r: AnchorBox, screenH: number): [number, number] {
  return [r.left + (x / SCALE) * r.width, r.top + (y / SCALE) * (anchor === GAME_ANCHOR ? screenH : r.height)];
}
/**
 * A pointer drawn on another screen (PeerCursors.svelte) placed onto
 * another element further than this from where it was going (px: the two
 * screens place things apart, another layout, a bot's picture of the page),
 * or leaping as far on the same one (made anew, come back to), has jumped:
 * it stays where it's drawn, and the difference fades away.
 */
export const JUMP_PX = 40;
export const LEAP_PX = 160;
/** A frame this long (ms) after the last: a pointer's leap and its move can't be told apart across it. */
export const LONG_FRAME_MS = 100;

/** Where a drawn pointer's place was the last two frames (`pdt` ms apart), and what it was on. */
export interface PlaceWas {
  px: number;
  py: number;
  qx: number;
  qy: number;
  pdt: number;
  code: number;
}

/**
 * A pointer whose place was `was` now at `tx`, `ty` on `code`, `dt` ms on:
 * whether it jumped (JUMP_PX; only looked at with `check`), measured from
 * where its place would be now going on as it went, not from where it's
 * drawn, which trails it as it moves, the further the quicker (a quick move
 * isn't a jump), and never after a long frame, where it can't be told. And
 * `was` moved on to now (after a jump, from rest: the jump isn't a speed).
 */
export function moveOn(was: PlaceWas, tx: number, ty: number, code: number, dt: number, check = true): boolean {
  // No time gone by (a frame at once after the last): nothing to go on, and nothing kept of it.
  if (dt <= 0) return false;
  const k = was.pdt > 0 ? Math.min(2, dt / was.pdt) : 0;
  const far = Math.hypot(tx - (was.px + (was.px - was.qx) * k), ty - (was.py + (was.py - was.qy) * k));
  // Without a frame before to tell how it was going (just come in), only a leap is a jump.
  const near = was.pdt > 0 ? JUMP_PX : LEAP_PX;
  const jump = check && dt < LONG_FRAME_MS && ((code !== was.code && far > near) || far > LEAP_PX);
  was.qx = jump ? tx : was.px;
  was.qy = jump ? ty : was.py;
  was.pdt = dt;
  was.px = tx;
  was.py = ty;
  was.code = code;
  return jump;
}

/**
 * How far a pointer that jumped is drawn off its place (px), and how quickly
 * that's changing (px a ms): it closes along an ease, from rest and without
 * overshooting (critically damped), so the pointer bends over to its place
 * rather than lunging at it.
 */
export interface Off {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** How long a jump `px` long takes to close, most of the way (ms): a flick, as quick as the old one that jumped there, a little longer the further (Fitts). */
export const closeMs = (px: number) => 30 + 12 * Math.log2(1 + px / 30);

/** `off` moved on `dt` ms, closing in about `ms`. */
export function closeOff(off: Off, dt: number, ms: number) {
  // Nothing off (no jump yet, or closed), or no time to close it in: as it is.
  if ((!off.x && !off.y && !off.vx && !off.vy) || !(ms > 0) || !(dt > 0)) return;
  // (95 % of the way at `ms`.)
  const w = 4.74 / ms;
  const e = Math.exp(-w * dt);
  const bx = off.vx + w * off.x;
  const by = off.vy + w * off.y;
  off.x = (off.x + bx * dt) * e;
  off.y = (off.y + by * dt) * e;
  off.vx = (off.vx - w * bx * dt) * e;
  off.vy = (off.vy - w * by * dt) * e;
}

/**
 * A pointer's places go with the time each was sent (ms on its sender's
 * clock, modulo STAMP), and are drawn by it: heard as they come, through a
 * guest's sends and the host's batches each on a clock of its own, they came
 * bunched and gapped, and a hand going steadily was drawn surging and
 * stalling.
 */
export const STAMP = 65536;
/** A time on its sender's clock (performance.now's), as stamped: by default, now. */
export const stampOf = (ms = performance.now()) => Math.floor(ms) % STAMP;

/**
 * A pointer's clock, as this screen keeps it: its last stamp (counted on
 * past STAMP), when that came, how far behind its stamps it's drawn (ms),
 * and how far behind each of its last few places needed it to be.
 */
export interface Pace {
  sent: number;
  heard: number;
  behind: number;
  needs: number[];
}
/**
 * It's drawn as far behind as the latest of its last this many places
 * needed (about two seconds of a pointer moving), and no less: it comes a
 * little unevenly (a guest's sends and the host's batches, each on a clock
 * of its own, and the link), and kept just behind each one that came late,
 * then less and less until the next, it was drawn quicker and slower by
 * turns, as much as a quarter.
 */
const NEEDS = 40;
/**
 * Once the latest of those has gone by, it's drawn less far behind this
 * quickly: this share of the time between its places (it goes this much
 * quicker meanwhile).
 */
const CATCH_UP = 0.05;
/**
 * And one that comes later than any of them puts it further behind by at
 * most this (ms): a hitch (the sender's page busy for a moment, the link
 * stalling) isn't the link gone slower, and a pointer drawn as far behind as
 * the worst of them took seconds to catch up. Past it, the pointer stands
 * for a moment and goes on from where it is.
 */
const HITCH_MS = 150;
/** Not heard from for this long (ms), it starts afresh (its stamps may have gone round STAMP). */
const PACE_AFRESH_MS = 30_000;

/**
 * When the place stamped `ms`, heard at `now` (this screen's clock), is
 * drawn as being, on this screen's clock: as far after the place before as
 * it was sent, and never sooner than LEAD_MS after it came, so that, drawn
 * BEHIND_MS behind, the curve it's drawn along has the places it looks
 * ahead to before it gets there (one that came as the curve was drawn bent
 * it, the pointer kinking at every place). As far behind as the latest of its last few needed (NEEDS);
 * one that comes later puts the rest that much further behind at once (by
 * HITCH_MS at most; the pointer slows a little, rather than standing till
 * it comes).
 */
export function paced(pace: Pace | undefined, ms: number, now: number): { pace: Pace; t: number } {
  if (!pace || now - pace.heard > PACE_AFRESH_MS) pace = { sent: ms, heard: now, behind: now + LEAD_MS - ms, needs: [] };
  else {
    // (A stamp a little before the last: its sender's input came timed a moment before it went, after the last.)
    const step = (((ms - pace.sent) % STAMP) + STAMP) % STAMP;
    pace.sent += step > STAMP / 2 ? step - STAMP : step;
  }
  const need = now + LEAD_MS - pace.sent;
  if (need > pace.behind) pace.behind = Math.min(need, pace.behind + HITCH_MS);
  // (A hitch is kept as far behind as it put the rest, not as far as it came.)
  pace.needs = [...pace.needs, Math.min(need, pace.behind)].slice(-NEEDS);
  const most = Math.max(...pace.needs);
  if (pace.behind > most) pace.behind = Math.max(most, pace.behind - CATCH_UP * (now - pace.heard));
  pace.heard = now;
  return { pace, t: pace.sent + pace.behind };
}

/** A guest sends its pointer at most this often (ms), and the host its batches. */
export const SEND_EVERY_MS = 50;
/**
 * Another's pointer is drawn this far behind where it's heard to be (ms;
 * paced's clock), along a curve through its places (trailAt): heard twenty
 * times a second, and drawn from one place straight to the next, it would
 * move from corner to corner. One place's worth: each place timed as it was
 * sent, the curve always has the next place it's going to.
 */
export const BEHIND_MS = 50;
/** So a place is drawn as being at least this long after it came (paced), to be there before the curve gets to it. */
const LEAD_MS = SEND_EVERY_MS - BEHIND_MS;
export const FLUSH_EVERY_MS = 50;
/**
 * How many pointer messages a host takes from each guest a second, and at
 * once: one every SEND_EVERY_MS, and besides them a press and a release
 * for each click, which go at once (PeerCursors.svelte), ten clicks a
 * second. Past that a message is dropped, its click lost on the others' screens.
 */
export const POINTER_RATE = 1000 / SEND_EVERY_MS + 20;
export const POINTER_BURST = 40;

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
  // The header over every screen. ('fx' was the effects button's, which the
  // settings took: kept, so the codes after it stay as they are.)
  'header', 'brand', 'meta', 'gear', 'fx', 'leave',
  // The lobby: the room, the party, the game's settings, the start (Begin, or a guest's wait for it).
  'room', 'code', 'invite', 'hide', 'access', 'public', 'lock', 'party', 'watch', 'coop',
  'settings', 'modes', 'about', 'target', 'difficulty', 'time', 'rules', 'descent', 'start', 'begin',
  // A game: its banner, the scoreboard, the choice of cards, a question and the row under it.
  // ('duel' was the deathmatch's strip, since gone: kept, so the codes after it stay as they are.)
  'banner', 'duel', 'skip', 'board', 'ask',
  'prompt', 'cards', 'notes', 'vote', 'note',
  'task', 'timer', 'item', 'plate', 'options', 'footer', 'result', 'verdict', 'outcome', 'blast', 'hint',
  // The end: the headline, the standings, what's next.
  'kicker', 'headline', 'sub', 'standings', 'actions', 'again', 'back', 'share', 'joining', 'credit',
  // The end, as it is now: what the game meant for you (or where your lives went), the highlights, the runs chart, the status by the buttons.
  'yours', 'highlights', 'runs', 'status',
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
/** And at most this many beside it (besideOf), each its code with BESIDE added (past every anchor's code). */
export const MAX_BESIDE = 3;
export const BESIDE = 256;
/** How near an anchor beside the pointer counts (px), the less the further. */
export const BLEND_PX = 120;
/** And what holds it, as much as one beside it this share of BLEND_PX off. */
const HELD = 0.65;
/**
 * Where a pointer is: an anchor's code and the spot on it, what it's doing,
 * then up to MAX_HOPS - 1 more anchors that hold the first, outward, and
 * the spot on each, for a screen that doesn't have the first; then up to
 * MAX_BESIDE beside it, nearest first.
 */
export type CursorAt = [anchor: number, x: number, y: number, kind: PointerKind, ...more: number[]];
/** One pointer in a host's batch: whose (cursorKey), and where and when it was sent (its stamp, STAMP), or nothing when it's gone. */
export type CursorEntry = [who: string] | [who: string, ...CursorAt] | [who: string, ...CursorAt, ms: number];

/** A pointer at `hops` (innermost first, at least one), doing `kind`, with the anchors `beside` it (besideOf's, nearest first). */
export function cursorAt(hops: Hop[], kind: PointerKind, beside: Hop[] = []): CursorAt {
  const [first, ...more] = hops.slice(0, MAX_HOPS);
  return [...first, kind, ...more.flat(), ...beside.slice(0, MAX_BESIDE).flatMap(([a, x, y]) => [a + BESIDE, x, y])];
}

/** The anchors a pointer is at, innermost first. */
export function hopsOf(at: CursorAt): Hop[] {
  const out: Hop[] = [[at[0], at[1], at[2]]];
  for (let i = 4; i + 2 < at.length && at[i] < BESIDE; i += 3) out.push([at[i], at[i + 1], at[i + 2]]);
  return out;
}

/** The anchors beside it (besideOf's), nearest first. */
export function besideHops(at: CursorAt): Hop[] {
  const out: Hop[] = [];
  for (let i = 4; i + 2 < at.length; i += 3) if (at[i] >= BESIDE) out.push([at[i] - BESIDE, at[i + 1], at[i + 2]]);
  return out;
}

/**
 * The spot (px, py) beside the anchor box `r`: across and down, on it from
 * 0 to SCALE (the nearest spot on it), or off it by the px it's off (below
 * 0 before it, past SCALE after it; at most BLEND_PX).
 */
export function besideOf(px: number, py: number, r: AnchorBox): [number, number] {
  const along = (v: number, lo: number, size: number) =>
    v < lo ? -Math.min(BLEND_PX, Math.round(lo - v)) : v > lo + size ? SCALE + Math.min(BLEND_PX, Math.round(v - lo - size)) : Math.min(SCALE, Math.round(((v - lo) / size) * SCALE));
  return [along(px, r.left, r.width), along(py, r.top, r.height)];
}

/** Where a spot beside an anchor (besideOf's) is beside its box `r` on this screen, and how far off it the pointer was (px). */
export function fromBeside(x: number, y: number, r: AnchorBox): { x: number; y: number; off: number } {
  const along = (v: number, lo: number, size: number): [number, number] => (v < 0 ? [lo, v] : v > SCALE ? [lo + size, v - SCALE] : [lo + (v / SCALE) * size, 0]);
  const [ex, ox] = along(x, r.left, r.width);
  const [ey, oy] = along(y, r.top, r.height);
  return { x: ex + ox, y: ey + oy, off: Math.hypot(ox, oy) };
}

/**
 * How much each counts in where a pointer is set: one beside it `off` px
 * off (all of it when on it; nothing BLEND_PX off, coming to nothing
 * smoothly, so it's there as it comes and goes), what holds it a little.
 */
export const besideWeight = (off: number) => (1 - Math.min(1, off / BLEND_PX)) ** 2 / Math.max(1, off) ** 2;
export const HELD_WEIGHT = besideWeight(HELD * BLEND_PX);

/** A spot set by several (each where it is here, and how much it counts): where they put it, the nearer the more; null when none counts. */
export function blended(by: { x: number; y: number; w: number }[]): [number, number] | null {
  let [x, y, w] = [0, 0, 0];
  for (const b of by) {
    x += b.x * b.w;
    y += b.y * b.w;
    w += b.w;
  }
  return w > 0 ? [x / w, y / w] : null;
}

/** Whether a batch's entry is stamped: a pointer's place is 4 long, and 3 more for each anchor round its own. */
const stamped = (e: CursorEntry) => e.length >= 6 && (e.length - 5) % 3 === 1;
/** Where a batch's entry has the pointer, or null when it's gone. */
export const entryAt = (e: CursorEntry): CursorAt | null => (e.length >= 5 ? (e.slice(1, stamped(e) ? -1 : undefined) as CursorAt) : null);
/** When a batch's entry was sent (its stamp), if it says. */
export const entryMs = (e: CursorEntry): number | undefined => (stamped(e) ? (e.at(-1) as number) : undefined);

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

/** Whether (a, x, y) is a spot beside an anchor there is (besideOf's, BESIDE added to its code). */
function isBeside(a: unknown, x: unknown, y: unknown): boolean {
  if (!isInt(a, BESIDE, BESIDE + MAX_ANCHOR) || a === BESIDE + GAME_ANCHOR || anchorName(a - BESIDE) === null) return false;
  return isInt(x, -BLEND_PX, SCALE + BLEND_PX) && isInt(y, -BLEND_PX, SCALE + BLEND_PX);
}

/** A pointer from a guest, or undefined when it's bogus (null is a pointer gone). */
export function parseCursorAt(v: unknown): CursorAt | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length < 4 || v.length > 1 + 3 * (MAX_HOPS + MAX_BESIDE) || (v.length - 4) % 3) return undefined;
  if (!isInt(v[3], MOUSE, LIT + PRESSED)) return undefined;
  if (!isHop(v[0], v[1], v[2])) return undefined;
  // What holds it, then what's beside it.
  let [hops, beside] = [1, 0];
  for (let i = 4; i < v.length; i += 3) {
    if (isBeside(v[i], v[i + 1], v[i + 2])) beside++;
    else if (beside || ++hops > MAX_HOPS || !isHop(v[i], v[i + 1], v[i + 2])) return undefined;
  }
  return beside > MAX_BESIDE ? undefined : (v.slice() as CursorAt);
}

/** A host's batch, or null when it's bogus. */
export function parseCursorBatch(v: unknown): CursorEntry[] | null {
  if (!Array.isArray(v) || v.length > 32) return null;
  const out: CursorEntry[] = [];
  for (const e of v) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0].length > 16) return null;
    if (e.length === 1) out.push([e[0]]);
    else {
      const ms = stamped(e as CursorEntry) ? e.at(-1) : undefined;
      if (ms !== undefined && !isInt(ms, 0, STAMP - 1)) return null;
      const at = parseCursorAt(e.slice(1, ms === undefined ? undefined : -1));
      if (!at) return null;
      out.push(ms === undefined ? [e[0], ...at] : [e[0], ...at, ms]);
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
