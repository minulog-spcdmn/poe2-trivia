// Where things are in the game: the room bot's picture of the screen for its
// pointer (hand.ts). The bot page has no screens, so this is the room's
// desktop layout as measured on the real page (1440 by 900, scratch
// measuring of every data-cursor box), in the terms pointers are sent in
// (src/lib/cursors.ts toAnchor): across, 0 to SCALE of the room's width;
// down, thousandths of the screen's height from its top. Each screen puts a
// pointer on its own copy of the element it's nearest, so what lands beside
// an answer or a card lands beside it on every screen.
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
    // Side by side, a hair apart (as measured).
    return [left + c * w + 2, top + r * h + 2, left + (c + 1) * w - 2, top + (r + 1) * h - 2];
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
 * from), and on a reveal the button that moves on; at the end, the
 * winner's circle and the standings.
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
  if (s.phase === 'over') {
    // The end (measured): the winner's circle, then the standings, best first, down a column.
    out.set('art', [461, 164, 539, 286]);
    const order = s.players.map((p, i) => [p.score, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    order.slice(0, 16).forEach(([, i], k) => out.set(`row:${i}`, [348, 541 + k * 56, 652, 591 + k * 56]));
    return out;
  }
  across(Math.min(s.players.length, 16), 116, 5, 32, 88).forEach((b, i) => out.set(`row:${i}`, b));
  if (s.phase === 'choosing') across(Math.min(s.offered.length, 16), 154, 16, 277, 610).forEach((b, i) => out.set(`card:${i}`, b));
  else if ((s.phase === 'question' || s.phase === 'reveal') && s.question) {
    const n = Math.min(s.question.labels.length, 16);
    // The pictures to pick from sit under the name to find (measured with six).
    if (s.question.mode === 'art') grid(n, 153, 847, 377, 826).forEach((b, i) => out.set(`opt:${i}`, b));
    else {
      out.set('art', [157, 379, 488, 774]);
      down(n, 511, 844, 306, 790, 80.6, 68).forEach((b, i) => out.set(`opt:${i}`, b));
    }
    // Once the answer is shown, the button that moves on: under it all, at the right.
    if (s.phase === 'reveal') {
      const bottom = Math.max(...[...out].filter(([k]) => k === 'art' || k.startsWith('opt:')).map(([, b]) => b[3]));
      out.set('next', [759, bottom + 48, 844, bottom + 93]);
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
