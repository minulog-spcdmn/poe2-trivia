// Where things are in the game, and how a hand gets there: the room bot's
// picture of the screen for its pointer (hand.ts). The bot page has no
// screens, so this is the game's desktop layout as measured on the real page
// (1440 by 900), in the game element's own terms: 0 to SCALE across and down
// (src/lib/cursors.ts). Each screen puts a pointer on its own copy of the
// element it was over, so only the path between them goes by this picture;
// where it stops (an answer, a card) lands right on every screen.
// Pure functions of their inputs and a random source, so tests can pin them.

import type { GameState } from '../lib/game.ts';
import { SCALE } from '../lib/cursors.ts';
import type { Rng } from './brain.ts';

/** A spot in the game element, 0 to SCALE across and down. */
export interface Spot {
  x: number;
  y: number;
}
/** An element's box in the game element: left, top, right, bottom. */
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

/**
 * The anchors on screen in this state (data-cursor names, as cursors.ts
 * codes them), with their boxes: the scoreboard's rows across the top; on
 * a choice, the cards; on a question or its reveal, the art and the answers
 * (or the pictures to pick from).
 */
export function layout(s: GameState): Map<string, Box> {
  const out = new Map<string, Box>();
  const choosing = s.phase === 'choosing';
  across(Math.min(s.players.length, 16), 116, 5, choosing ? 46 : 36, choosing ? 125 : 99).forEach((b, i) => out.set(`row:${i}`, b));
  if (choosing) across(Math.min(s.offered.length, 16), 154, 16, 391, 862).forEach((b, i) => out.set(`card:${i}`, b));
  else if ((s.phase === 'question' || s.phase === 'reveal') && s.question) {
    const n = Math.min(s.question.labels.length, 16);
    if (s.question.mode === 'art') grid(n, 157, 844, 340, 862).forEach((b, i) => out.set(`opt:${i}`, b));
    else {
      out.set('art', [157, 421, 488, 861]);
      down(n, 511, 844, 340, 862, 89.5, 75).forEach((b, i) => out.set(`opt:${i}`, b));
    }
  }
  return out;
}

/** A spot to aim at in a box: around its middle, never on its rim. */
export function aimIn(box: Box, rng: Rng): Spot {
  const [l, t, r, b] = box;
  return { x: l + (r - l) * (0.3 + 0.4 * rng()), y: t + (b - t) * (0.3 + 0.4 * rng()) };
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

/** A movement from one spot to another: a slight curve, quick in the middle and slow at both ends, as hands move. */
export interface Stroke {
  from: Spot;
  to: Spot;
  /** The curve's pull (a quadratic Bézier's control point). */
  via: Spot;
  start: number;
  end: number;
}

/** A stroke from `from` to `to`, starting `at` and taking `ms`: bowed a little to one side. */
export function stroke(from: Spot, to: Spot, at: number, ms: number, rng: Rng): Stroke {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bow = (rng() - 0.5) * 0.3;
  return { from, to, via: { x: (from.x + to.x) / 2 - dy * bow, y: (from.y + to.y) / 2 + dx * bow }, start: at, end: at + Math.max(1, ms) };
}

/** Where a stroke is at `now`: eased (minimum jerk), along its curve. */
export function along(s: Stroke, now: number): Spot {
  const t = Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start)));
  const e = t * t * t * (10 - 15 * t + 6 * t * t);
  const u = 1 - e;
  return {
    x: u * u * s.from.x + 2 * u * e * s.via.x + e * e * s.to.x,
    y: u * u * s.from.y + 2 * u * e * s.via.y + e * e * s.to.y,
  };
}
