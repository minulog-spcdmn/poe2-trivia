// A guest bot's eyes: a guest never gets the answer (the host sends only an
// altered copy of the art: re-scaled, shifted, a little turned, noised,
// re-encoded, maybe flipped, without colour, or burning in patch by patch),
// so the bot recognises the item the way a player with their own tools
// could, by comparing what it got against the item pictures the site
// serves. What a person would make of it is still up to the player
// (brain.ts): the eyes only say which option it is.
//
// Each picture is cropped to the item (its opaque pixels) and boiled down to
// a SIZE × SIZE grid of brightness (so colour or none compares alike) and
// opacity; two grids compare by their correlation, over the cells revealed
// so far on a veiled picture.

import { activeRules, type GameState, type Question } from '../lib/game';
import { engine } from '../lib/session.svelte';
import { shown, type ShownPatch, type VeilArt } from '../lib/media.svelte';
import { visibleBox } from '../lib/patches';
import { itemImage } from '../lib/ui-paths';
import type { Eyes } from './player';

const SIZE = 32;
/** Cells a veiled picture must have shown before it is worth comparing (as a share of the item). */
const MIN_SHOWN = 0.12;

type Box = [number, number, number, number];
/** A picture as a grid: brightness and opacity per cell (brightness × opacity, so the background counts as dark). */
type Grid = Float32Array;

const images = new Map<string, Promise<HTMLImageElement>>();

function load(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = img.decode().then(() => img);
    images.set(url, p);
    p.catch(() => images.delete(url));
  }
  return p;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

/** Where the item is in a picture: the box round its opaque pixels. */
function boxOf(src: CanvasImageSource, w: number, h: number): Box {
  const [, ctx] = canvas(w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return visibleBox(ctx.getImageData(0, 0, w, h).data, w, h);
}

/** The part of a picture in `box` as a grid (flipped left to right with `mirror`). */
function gridOf(src: CanvasImageSource, box: Box, mirror = false): Grid {
  const [, ctx] = canvas(SIZE, SIZE);
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, box[0], box[1], box[2], box[3], 0, 0, SIZE, SIZE);
  const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const g = new Float32Array(SIZE * SIZE * 2);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = d[i * 4 + 3] / 255;
    g[i * 2] = ((0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255) * a;
    g[i * 2 + 1] = a;
  }
  return g;
}

/** How alike two grids are (correlation, -1 to 1), each cell weighted by `weight` (how much of it has been seen). */
export function likeness(a: Grid, b: Grid, weight?: Float32Array): number {
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    const w = weight ? weight[i >> 1] : 1;
    n += w;
    sa += w * a[i];
    sb += w * b[i];
  }
  if (n <= 0) return 0;
  const [ma, mb] = [sa / n, sb / n];
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const w = weight ? weight[i >> 1] : 1;
    const [x, y] = [a[i] - ma, b[i] - mb];
    ab += w * x * y;
    aa += w * x * x;
    bb += w * y * y;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

const references = new Map<string, Promise<Grid[]>>();

/** An item's own picture as grids: as it is, and flipped. */
function reference(id: string): Promise<Grid[]> {
  let p = references.get(id);
  if (!p) {
    p = load(itemImage(id)).then((img) => {
      const box = boxOf(img, img.naturalWidth, img.naturalHeight);
      return [gridOf(img, box), gridOf(img, box, true)];
    });
    references.set(id, p);
    p.catch(() => references.delete(id));
  }
  return p;
}

/** What has been received of one picture: whole, or the patches of it shown so far (and how much of each cell). */
interface Seen {
  grid: Grid;
  weight?: Float32Array;
}

async function seenWhole(url: string): Promise<Seen> {
  const img = await load(url);
  return { grid: gridOf(img, boxOf(img, img.naturalWidth, img.naturalHeight)) };
}

async function seenVeiled(veil: VeilArt, patches: Record<number, ShownPatch>): Promise<Seen | null> {
  const list = Object.values(patches);
  if (!list.length) return null;
  const [pic, ctx] = canvas(veil.w, veil.h);
  const [cover, mask] = canvas(veil.w, veil.h);
  mask.fillStyle = '#fff';
  for (const p of list) {
    ctx.drawImage(await load(p.url), p.x, p.y, p.w, p.h);
    mask.fillRect(p.x, p.y, p.w, p.h);
  }
  const weight = new Float32Array(SIZE * SIZE);
  const m = gridOf(cover, veil.box);
  for (let i = 0; i < weight.length; i++) weight[i] = m[i * 2 + 1];
  if (weight.reduce((a, b) => a + b, 0) < MIN_SHOWN * weight.length) return null;
  return { grid: gridOf(pic, veil.box), weight };
}

/** How alike a received picture is to an item (the better of as it is and flipped, if pictures may be flipped). */
async function match(seen: Seen, id: string, flips: boolean): Promise<number> {
  const [plain, flipped] = await reference(id);
  const a = likeness(seen.grid, plain, seen.weight);
  return flips ? Math.max(a, likeness(seen.grid, flipped, seen.weight)) : a;
}

/** Items by name (made-up names have none: they are never the answer). */
let byName: Map<string, string[]> | null = null;
function idsNamed(name: string | null): string[] {
  if (!byName) {
    byName = new Map();
    for (const it of engine.items) byName.set(it.name, [...(byName.get(it.name) ?? []), it.id]);
  }
  return name ? (byName.get(name) ?? []) : [];
}

/** The eyes' last reading (for the log): which option, and by how much it beat the next best. */
export let lastReading: { qid: number; index: number; margin: number } | null = null;

/** Which option the art shows, or null with nothing (enough) to go on yet. */
export const sight: Eyes = async (s: GameState, q: Question) => {
  if (shown.qid !== q.askedAt) return null;
  const flips = activeRules(s).mirror > 0;
  const scores: number[] = [];
  try {
    if (q.mode === 'name') {
      // The art is shown; which name is it?
      const seen = shown.veil ? await seenVeiled(shown.veil, shown.patches) : shown.art ? await seenWhole(shown.art.url) : null;
      if (!seen) return null;
      for (const label of q.labels) {
        let best = -1;
        for (const id of idsNamed(label)) best = Math.max(best, await match(seen, id, flips));
        scores.push(best);
      }
    } else {
      // The name is shown; which picture is it?
      const target = idsNamed(q.prompt)[0];
      if (!target) return null;
      for (let i = 0; i < q.labels.length; i++) {
        const tile = shown.tileVeils[i];
        const url = shown.options[i];
        const seen = tile ? await seenVeiled(tile, shown.tilePatches[i] ?? {}) : url ? await seenWhole(url).catch(() => null) : null;
        scores.push(seen ? await match(seen, target, flips) : -1);
      }
    }
  } catch {
    return null;
  }
  const order = scores.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  if (!order.length || order[0][0] <= -1) return null;
  lastReading = { qid: q.askedAt, index: order[0][1], margin: order[0][0] - (order[1]?.[0] ?? -1) };
  return order[0][1];
};
