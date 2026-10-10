// Where things are in the game, and how a hand gets there: the room bot's
// picture of the screen for its pointer (hand.ts). The bot page has no
// screens, so this is the room's desktop layout as measured on the real page
// (1440 by 900, scratch measuring of every data-cursor box), in the terms
// pointers are sent in (src/lib/cursors.ts toAnchor): across, 0 to SCALE of
// the room's width; down, thousandths of the screen's height from its top. Each screen puts a pointer on its own copy of the
// element it was over, so only the path between them goes by this picture;
// where it stops (an answer, a card) lands right on every screen.
// Pure functions of their inputs and a random source, so tests can pin them.

import type { GameState } from '../lib/game.ts';
import { SCALE } from '../lib/cursors.ts';
import type { Rng } from './brain.ts';

/** A spot in the room: across, 0 to SCALE of its width; down, thousandths of a screen's height from its top. */
export interface Spot {
  x: number;
  y: number;
}
/** An element's box in the room: left, top, right, bottom. */
export type Box = [number, number, number, number];

/** Boxes in a row, `w` wide with `gap` between, centred across the game. */
function across(n: number, w: number, gap: number, top: number, bottom: number): Box[] {
  const left = SCALE / 2 - (n * w + (n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) => [left + i * (w + gap), top, left + i * (w + gap) + w, bottom]);
}

/** Boxes down a column from `top`, as many as fit by `bottom`. */
function down(n: number, left: number, right: number, top: number, bottom: number, step: number, h: number): Box[] {
  const s = Math.min(step, (bottom - top) / Math.max(1, n));
  const hh = Math.min(h, s * 0.84);
  return Array.from({ length: n }, (_, i) => [left, top + i * s, right, top + i * s + hh]);
}

/** A grid of `n` tiles (a question that shows the pictures to pick from). */
function grid(n: number, left: number, right: number, top: number, bottom: number): Box[] {
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const w = (right - left) / cols;
  const h = (bottom - top) / rows;
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return [left + c * w + w * 0.05, top + r * h + h * 0.05, left + (c + 1) * w - w * 0.05, top + (r + 1) * h - h * 0.05];
  });
}

/** Measured: the lobby's party rows (a column, down from TOP, a step apart) and its three modes, 34 lower for a host (its own controls above). */
const LOBBY = {
  rowsTop: 366,
  rowStep: 68.7,
  rowH: 60,
  rowL: 40,
  rowR: 399,
  modes: [
    [467, 626],
    [634, 793],
    [801, 960],
  ],
  modesTop: 390,
  modesH: 90,
  hostDrop: 34,
};

/**
 * The anchors on screen in this state (data-cursor names, as cursors.ts
 * codes them), with their boxes, for the player `me` (a host's lobby sits
 * lower). In the lobby, the party's rows and the modes; in a game, the
 * scoreboard's rows across the top, then on a choice the cards, on a
 * question or its reveal the art and the answers (or the pictures to pick
 * from).
 */
export function layout(s: GameState, me = ''): Map<string, Box> {
  const out = new Map<string, Box>();
  if (s.phase === 'lobby') {
    const drop = s.hostId === me ? LOBBY.hostDrop : 0;
    s.players.slice(0, 16).forEach((_, i) => {
      const top = LOBBY.rowsTop + drop + i * LOBBY.rowStep;
      out.set(`row:${i}`, [LOBBY.rowL, top, LOBBY.rowR, top + LOBBY.rowH]);
    });
    LOBBY.modes.forEach(([l, r], i) => out.set(`card:${i}`, [l, LOBBY.modesTop + drop, r, LOBBY.modesTop + drop + LOBBY.modesH]));
    return out;
  }
  across(Math.min(s.players.length, 16), 116, 5, 32, 88).forEach((b, i) => out.set(`row:${i}`, b));
  if (s.phase === 'choosing') across(Math.min(s.offered.length, 16), 154, 16, 277, 610).forEach((b, i) => out.set(`card:${i}`, b));
  else if ((s.phase === 'question' || s.phase === 'reveal') && s.question) {
    const n = Math.min(s.question.labels.length, 16);
    if (s.question.mode === 'art') grid(n, 157, 844, 306, 776).forEach((b, i) => out.set(`opt:${i}`, b));
    else {
      out.set('art', [157, 379, 488, 774]);
      down(n, 511, 844, 306, 790, 80.6, 68).forEach((b, i) => out.set(`opt:${i}`, b));
    }
  }
  return out;
}

/**
 * A spot to aim at in a box: around its middle, never on its rim; `text`
 * (an answer's name, read from its start): toward its left, where the words
 * are.
 */
export function aimIn(box: Box, rng: Rng, text = false): Spot {
  const [l, t, r, b] = box;
  const across = text ? 0.12 + 0.45 * rng() : 0.3 + 0.4 * rng();
  return { x: l + (r - l) * across, y: t + (b - t) * (0.3 + 0.4 * rng()) };
}

/**
 * Where a spot is, as a pointer is sent (cursors.ts CursorAt without its
 * kind): on `on` (an anchor the hand went to on purpose) while it is over
 * it, in that anchor's terms; else on the game as a whole. Never on an
 * anchor it just happens to be over: this picture of the screen knows where
 * things end up, not where they are on their way in (cards being dealt fly
 * in from afar), and the others' screens would carry the pointer along.
 */
export function placeOf(at: Spot, boxes: Map<string, Box>, on: string | null = null): { anchor: string; x: number; y: number } {
  const clamp = (v: number) => Math.round(Math.min(SCALE, Math.max(0, v)));
  const box = on ? boxes.get(on) : undefined;
  if (box) {
    const [l, t, r, b] = box;
    if (at.x >= l && at.x <= r && at.y >= t && at.y <= b) return { anchor: on!, x: clamp(((at.x - l) / (r - l)) * SCALE), y: clamp(((at.y - t) / (b - t)) * SCALE) };
  }
  return { anchor: 'game', x: clamp(at.x), y: clamp(at.y) };
}

/**
 * How long a hand takes to cover `distance` (in the game's terms) to a
 * target `size` across (ms): Fitts's law, the further and the smaller the
 * longer, then by the player's own pace.
 */
export function reachTime(distance: number, size: number, pace: number, rng: Rng): number {
  const bits = Math.log2(1 + distance / Math.max(20, size));
  return Math.round((180 + 140 * bits) * pace * (0.85 + 0.35 * rng()));
}

/**
 * A movement from one spot to another, as hands move: along a curve bowed a
 * little to one side (more toward one end than the other), with a slight
 * wobble on the way that dies out at both ends, quick early on and slowing
 * into the end for longer than it took to speed up.
 */
export interface Stroke {
  from: Spot;
  to: Spot;
  /** The curve's pull (a quadratic Bézier's control point). */
  via: Spot;
  /** The wobble across the way: how far (units), how many times over, from where. */
  wobble: { size: number; turns: number; phase: number };
  start: number;
  end: number;
}

/** A stroke from `from` to `to`, starting `at` and taking `ms`, bowed by the hand's `curve` (0 to 1, habits.ts). */
export function stroke(from: Spot, to: Spot, at: number, ms: number, rng: Rng, curve = 0.5): Stroke {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bow = (rng() - 0.5) * (0.12 + 0.5 * curve);
  // Pulled toward one end or the other, not always the middle.
  const k = 0.3 + 0.4 * rng();
  const dist = Math.hypot(dx, dy);
  return {
    from,
    to,
    via: { x: from.x + dx * k - dy * bow, y: from.y + dy * k + dx * bow },
    wobble: { size: Math.min(5, dist * 0.018) * (0.4 + 0.6 * rng()), turns: 1 + 2 * rng(), phase: rng() * Math.PI * 2 },
    start: at,
    end: at + Math.max(1, ms),
  };
}

/** Where a stroke is at `now`. */
export function along(s: Stroke, now: number): Spot {
  const t = Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start)));
  // Minimum jerk, on a clock run fast early: the peak comes before the middle, the slowing in takes longer.
  const tt = t ** 0.82;
  const e = tt * tt * tt * (10 - 15 * tt + 6 * tt * tt);
  const u = 1 - e;
  const x = u * u * s.from.x + 2 * u * e * s.via.x + e * e * s.to.x;
  const y = u * u * s.from.y + 2 * u * e * s.via.y + e * e * s.to.y;
  const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
  if (!len || !s.wobble.size) return { x, y };
  const w = s.wobble.size * Math.sin(Math.PI * e) * Math.sin(s.wobble.phase + e * s.wobble.turns * Math.PI * 2);
  return { x: x - ((s.to.y - s.from.y) / len) * w, y: y + ((s.to.x - s.from.x) / len) * w };
}

/**
 * A reach for a target, as aimed movements go: a long one falls a little
 * short of it or runs a little past (and off to a side), then a small
 * correcting stroke brings it in after a beat; a `sloppy` hand (1: as most)
 * misses by more, and now and then corrects twice. Taking `ms` in all, from
 * `at`, bowed by `curve`; a short one is a single stroke.
 */
export function reach(from: Spot, to: Spot, at: number, ms: number, rng: Rng, { curve = 0.5, sloppy = 1 } = {}): Stroke[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 120 || ms < 250) return [stroke(from, to, at, ms, rng, curve)];
  const off = (k: number): Spot => {
    const err = (-0.07 + 0.12 * rng()) * sloppy * k;
    const side = (rng() - 0.5) * 0.04 * sloppy * k;
    return { x: to.x + dx * err - dy * side, y: to.y + dy * err + dx * side };
  };
  const miss = off(1);
  const first = Math.round(ms * 0.78);
  const beat = () => Math.round(ms * (0.04 + 0.06 * rng()));
  const b1 = beat();
  const twice = sloppy > 1.3 && rng() < 0.5;
  if (!twice) return [stroke(from, miss, at, first, rng, curve), stroke(miss, to, at + first + b1, Math.max(60, ms - first - b1), rng, curve)];
  // Clumsy: the correction misses a little too.
  const near = off(0.3);
  const rest = Math.max(120, ms - first - b1);
  const b2 = beat();
  const second = at + first + b1;
  return [
    stroke(from, miss, at, first, rng, curve),
    stroke(miss, near, second, Math.round(rest * 0.55), rng, curve),
    stroke(near, to, second + Math.round(rest * 0.55) + b2, Math.max(50, Math.round(rest * 0.45)), rng, curve),
  ];
}
