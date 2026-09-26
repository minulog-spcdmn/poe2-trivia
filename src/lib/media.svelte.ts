// Question art. Guests never load an item's image file directly while a
// question is open (its file name would identify the answer). Instead the
// host sends a lightly altered copy (re-scaled, shifted, noised, re-encoded,
// so it doesn't match the original file byte for byte), and for veiled
// questions only the tiles that have been uncovered so far.

import { itemImage } from './ui-paths';
import type { MediaMsg } from './protocol';
import type { Question } from './game';

export interface Tile {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  data: ArrayBuffer;
}

/** Everything a question can show, prepared once by the host. */
export interface PreparedMedia {
  qid: number;
  art: { w: number; h: number; data: ArrayBuffer } | null;
  /** Veiled questions: the art cut into tiles, in the order they uncover. */
  grid: { w: number; h: number; n: number } | null;
  tiles: Tile[];
  /** Art questions: one picture per option. */
  options: ArrayBuffer[];
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load ${src}`));
      img.src = src;
    });
    imageCache.set(src, p);
    p.catch(() => imageCache.delete(src));
  }
  return p;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Draws the item onto a canvas with small random changes. */
async function alteredCanvas(itemId: string, grayscale: boolean): Promise<HTMLCanvasElement> {
  const img = await loadImage(itemImage(itemId));
  const scale = rand(0.9, 1.0);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const pad = Math.round(rand(2, 8));
  const canvas = document.createElement('canvas');
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2 + rand(-1.5, 1.5), canvas.height / 2 + rand(-1.5, 1.5));
  ctx.rotate(rand(-0.6, 0.6) * (Math.PI / 180));
  ctx.filter = `brightness(${rand(0.97, 1.03)}) saturate(${rand(0.96, 1.04)})`;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (Math.random() - 0.5) * 6;
    if (grayscale) {
      const g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] + n;
      d[i] = d[i + 1] = d[i + 2] = g;
    } else {
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function encode(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error('encode failed'))),
      'image/webp',
      rand(0.82, 0.9),
    ),
  );
}

/** Tile order for veiled questions; the same for every device given the seed. */
export function seededOrder(n: number, seed: number): number[] {
  let t = seed >>> 0;
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Host side: builds the art for a question (full question, with the answer). */
export async function prepareMedia(q: Question, grayscale: boolean): Promise<PreparedMedia> {
  const out: PreparedMedia = { qid: q.askedAt, art: null, grid: null, tiles: [], options: [] };
  if (q.mode === 'art') {
    out.options = await Promise.all(q.options.map(async (id) => encode(await alteredCanvas(id, grayscale))));
    return out;
  }
  const canvas = await alteredCanvas(q.itemId, false);
  const { width: W, height: H } = canvas;
  if (!q.veil) {
    out.art = { w: W, h: H, data: await encode(canvas) };
    return out;
  }
  const n = q.veil.size;
  out.grid = { w: W, h: H, n };
  const edges = (len: number) => Array.from({ length: n + 1 }, (_, k) => Math.round((k * len) / n));
  const xs = edges(W);
  const ys = edges(H);
  const order = seededOrder(n * n, q.veil.seed);
  out.tiles = await Promise.all(
    order.map(async (i) => {
      const cx = i % n;
      const cy = Math.floor(i / n);
      const x = xs[cx];
      const y = ys[cy];
      const w = xs[cx + 1] - x;
      const h = ys[cy + 1] - y;
      const tile = document.createElement('canvas');
      tile.width = w;
      tile.height = h;
      tile.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      return { i, x, y, w, h, data: await encode(tile) };
    }),
  );
  return out;
}

/** When (ms after the question was asked) tile number `rank` uncovers. */
export function tileDelay(q: Question, rank: number): number {
  const v = q.veil!;
  return 400 + (rank * v.seconds * 1000) / (v.size * v.size);
}

// ---- what this device shows -------------------------------------------

export interface ShownTile {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

class Shown {
  qid = $state(0);
  art = $state<{ url: string; w: number; h: number } | null>(null);
  grid = $state<{ w: number; h: number; n: number } | null>(null);
  tiles = $state<Record<number, ShownTile>>({});
  options = $state<Record<number, string>>({});
  private urls: string[] = [];

  private url(data: ArrayBuffer) {
    const u = URL.createObjectURL(new Blob([data], { type: 'image/webp' }));
    this.urls.push(u);
    return u;
  }

  /** Starts a new question: forget (and free) the previous one's pictures. */
  private ensure(qid: number) {
    if (qid === this.qid) return;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    this.qid = qid;
    this.art = null;
    this.grid = null;
    this.tiles = {};
    this.options = {};
  }

  receive(m: MediaMsg) {
    if (m.qid < this.qid) return;
    this.ensure(m.qid);
    switch (m.t) {
      case 'art':
        this.art = { url: this.url(m.data), w: m.w, h: m.h };
        break;
      case 'grid':
        this.grid = { w: m.w, h: m.h, n: m.n };
        break;
      case 'tile':
        this.tiles = { ...this.tiles, [m.i]: { i: m.i, x: m.x, y: m.y, w: m.w, h: m.h, url: this.url(m.data) } };
        break;
      case 'option':
        this.options = { ...this.options, [m.index]: this.url(m.data) };
        break;
    }
  }

  clear() {
    this.ensure(-1);
    this.qid = 0;
  }
}

export const shown = new Shown();
