// Where things are in the game: the room bot's picture of the screen for its
// pointer (hand.ts). The bot page has no screens, so this is the room's
// desktop layout as measured on the real page, at the size most players'
// screens give it: a 1440p window (2560 by about 1300), which the stage's
// zoom (lib/stage.ts) lays out as 1925 by 977, as a 4K one at 150% does, and
// about as the recordings the hands replay were made on (measured October
// 2026, every data-cursor box, with Playwright). In the terms pointers are
// sent in (src/lib/cursors.ts toAnchor): across, 0 to SCALE of the room's
// width; down, thousandths of the screen's height from its top. Each screen
// puts a pointer on its own copy of the element it's nearest, so what lands
// beside an answer or a card lands beside it on every screen.
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

/** Boxes in `cols` columns from `left` to `right` (`gap` between), row by row from `top`, each `h` high and `step` apart. */
function grid(n: number, cols: number, left: number, right: number, gap: number, top: number, h: number, step: number): Box[] {
  const w = (right - left - (cols - 1) * gap) / cols;
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return [left + c * (w + gap), top + r * step, left + c * (w + gap) + w, top + r * step + h];
  });
}

/** Measured: the lobby's party rows (two to a row, down from rowsTop, 47 lower for a host: its own controls above) and its three modes. */
const LOBBY = {
  rowsLeft: 188.3,
  rowsRight: 416.9,
  rowsGap: 4.2,
  rowsTop: 363.8,
  rowStep: 57.7,
  rowH: 49.5,
  hostDrop: 47.3,
  modes: [
    [512.2, 605.2],
    [609.3, 702.4],
    [706.5, 799.5],
  ],
  modesTop: 153.9,
  modesBottom: 248,
};

/** Measured: the game's column (the art and answers, the pictures), and how far Delve's taller scoreboard (its lives) puts it down. */
const COLUMN = { left: 246, right: 754.5, delve: 1.9 };

/** Measured: the button that moves on, under the answers or the pictures, at the column's right. */
const NEXT = { left: 691.8, below: 26.3, h: 41.6 };

/**
 * The anchors on screen in this state (data-cursor names, as cursors.ts
 * codes them), with their boxes, for the player `me` (a host's lobby rows
 * sit lower). In the lobby, the party's rows and the modes; in a game, the
 * scoreboard's rows across the top, then on a choice the cards, on a
 * question or its reveal the art and the answers (or the pictures to pick
 * from), and on a reveal the button that moves on; at the end, the
 * winner's circle and the standings.
 */
export function layout(s: GameState, me = ''): Map<string, Box> {
  const out = new Map<string, Box>();
  if (s.phase === 'lobby') {
    const drop = s.hostId === me ? LOBBY.hostDrop : 0;
    grid(Math.min(s.players.length, 16), 2, LOBBY.rowsLeft, LOBBY.rowsRight, LOBBY.rowsGap, LOBBY.rowsTop + drop, LOBBY.rowH, LOBBY.rowStep).forEach((b, i) => out.set(`row:${i}`, b));
    LOBBY.modes.forEach(([l, r], i) => out.set(`card:${i}`, [l, LOBBY.modesTop, r, LOBBY.modesBottom]));
    return out;
  }
  if (s.phase === 'over') {
    // The end (measured): the winner's circle, then the standings, best first, down a column.
    out.set('art', [471.4, 151, 528.6, 263.5]);
    const order = s.players.map((p, i) => [p.score, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    order.slice(0, 16).forEach(([, i], k) => out.set(`row:${i}`, [387.7, 498.6 + k * 53.2, 612.3, 546 + k * 53.2]));
    return out;
  }
  // Delve's scoreboard carries its lives, a little taller: everything under it a little lower.
  const d = s.delve ? COLUMN.delve : 0;
  across(Math.min(s.players.length, 16), 88, 3.5, 31 + d / 2, 82 + d).forEach((b, i) => out.set(`row:${i}`, b));
  if (s.phase === 'choosing') across(Math.min(s.offered.length, 16), 155.5, 15.8, 241.8 + d, 659.4 + d).forEach((b, i) => out.set(`card:${i}`, b));
  else if ((s.phase === 'question' || s.phase === 'reveal') && s.question) {
    const q = s.question;
    const n = Math.min(q.labels.length, 16);
    if (q.mode === 'art') {
      // The pictures to pick from: four in a row, six three to a row, ten five, else four; a row
      // 205 high (256 for a single row of four). Tall art (staves, bows), up to eight: one row of them, as high as two.
      const tall = !!q.tall && n > 4 && n <= 8;
      const cols = tall ? n : n <= 4 ? n : n === 6 ? 3 : n === 10 ? 5 : 4;
      const h = tall ? 409.5 : n <= 4 ? 255.9 : 204.7;
      grid(n, cols, COLUMN.left, COLUMN.right - 0.5, 0.5, 320.6 + d, h, h + 1.1).forEach((b, i) => out.set(`opt:${i}`, b));
    } else {
      // The art at the left, the names at the right: one column up to six (a shorter row for six, and the art
      // as tall as them), two side by side for more.
      out.set('art', [COLUMN.left, 308.4 + d, 491.2, (n > 4 && n <= 6 ? 673 : 615.4) + d]);
      const [cols, h, step] = n <= 4 ? [1, 84.5, 96.75] : n <= 6 ? [1, 61.8, 74.1] : n <= 8 ? [2, 86.3, 96.1] : [2, 67.1, 76.9];
      grid(n, cols, 508.3, COLUMN.right, 5, 241.8 + d, h, step).forEach((b, i) => out.set(`opt:${i}`, b));
    }
    // Once the answer is shown, the button that moves on: under it all, at the right.
    if (s.phase === 'reveal') {
      const bottom = Math.max(...[...out].filter(([k]) => k === 'art' || k.startsWith('opt:')).map(([, b]) => b[3]));
      out.set('next', [NEXT.left, bottom + NEXT.below, COLUMN.right, bottom + NEXT.below + NEXT.h]);
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
  // As recorded (a player's hand, scratch analysis): names clicked a third of the way in, at any height on them;
  // cards and pictures around the middle across and a little below it.
  if (text) return { x: l + (r - l) * (0.22 + 0.3 * rng()), y: t + (b - t) * (0.25 + 0.53 * rng()) };
  return { x: l + (r - l) * (0.32 + 0.4 * rng()), y: t + (b - t) * (0.42 + 0.34 * rng()) };
}
