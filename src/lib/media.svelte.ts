// Question art. Guests never load an item's image file directly while a
// question is open (its file name would identify the answer). Instead the
// host sends a lightly altered copy (re-scaled, shifted, noised, re-encoded,
// so it doesn't match the original file byte for byte), and for veiled
// questions only the patches of it that have been uncovered so far.

import { itemImage } from './ui-paths';
import { FIRST_PATCH_MS, cutPatches, spreadOrder, veilPaceFor, visibleBox } from './patches';
import type { MediaMsg } from './protocol';
import type { Grayscale, Question } from './game';

export interface Patch {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  data: ArrayBuffer;
  /** Where the item carries on into other patches (see RawPatch.edges). */
  edges: ArrayBuffer;
}

/**
 * A veiled picture's size (its patches are placed on it), how long each patch
 * takes to burn in (ms), how many there are, and where the item is in it (x,
 * y, w, h of its visible pixels), so the full art can take over in the same
 * place.
 */
export interface VeilArt {
  w: number;
  h: number;
  burn: number;
  count: number;
  box: [number, number, number, number];
}

/** Everything a question can show, prepared once by the host. */
export interface PreparedMedia {
  qid: number;
  art: { w: number; h: number; data: ArrayBuffer } | null;
  /** Veiled questions: the art cut into patches, in the order they uncover. */
  veil: VeilArt | null;
  patches: Patch[];
  /** Art questions: one picture per option. */
  options: ArrayBuffer[];
  /** Veiled art questions (Delve): each option's picture cut into patches instead. */
  tiles: { veil: VeilArt; patches: Patch[] }[];
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** A request that neither loads nor fails by then has stalled. */
const IMAGE_TIMEOUT_MS = 8000;

function fetchImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      img.src = '';
      reject(new Error(`Timed out loading ${src}`));
    }, IMAGE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Could not load ${src}`));
    };
    img.src = src;
  });
}

/** Loads an image, trying again after a hiccup (a dropped request would leave everyone without art). */
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    const attempt = (left: number): Promise<HTMLImageElement> =>
      fetchImage(src).catch((err) =>
        left > 0 ? new Promise((r) => setTimeout(r, 600)).then(() => attempt(left - 1)) : Promise.reject(err),
      );
    p = attempt(2);
    imageCache.set(src, p);
    p.catch(() => imageCache.delete(src));
  }
  return p;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Draws the item onto a canvas with small random changes (and flipped left to right if `mirror`). */
async function alteredCanvas(itemId: string, grayscale: boolean, mirror = false): Promise<HTMLCanvasElement> {
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
  if (mirror) ctx.scale(-1, 1);
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

/**
 * Whole pictures go out as lossy WebP. Patches are lossless PNG: they are small
 * and cut from small art, so lossy encoding blurs them into blocks with seams
 * between neighbours.
 */
function encode(canvas: HTMLCanvasElement, lossless = false): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error('encode failed'))),
      lossless ? 'image/png' : 'image/webp',
      lossless ? undefined : rand(0.82, 0.9),
    ),
  );
}

/** Host side: builds the art for a question (full question, with the answer). */
export async function prepareMedia(q: Question, grayscale: Grayscale): Promise<PreparedMedia> {
  const out: PreparedMedia = { qid: q.askedAt, art: null, veil: null, patches: [], options: [], tiles: [] };
  if (q.mode === 'art') {
    const canvases = await Promise.all(q.options.map((id, i) => alteredCanvas(id, grayscale !== 'off', !!q.mirrored?.[i])));
    // Each picture cut on its own seed, so no two burn in alike.
    if (q.veil) out.tiles = await Promise.all(canvases.map((c, i) => cutVeil(c, q.veil!.size, q.veil!.seconds, q.veil!.seed + i)));
    else out.options = await Promise.all(canvases.map((c) => encode(c)));
    return out;
  }
  const canvas = await alteredCanvas(q.itemId, grayscale === 'all', !!q.mirrored?.[0]);
  const { width: W, height: H } = canvas;
  if (!q.veil) {
    out.art = { w: W, h: H, data: await encode(canvas) };
    return out;
  }
  const cut = await cutVeil(canvas, q.veil.size, q.veil.seconds, q.veil.seed);
  out.veil = cut.veil;
  out.patches = cut.patches;
  return out;
}

/** A picture cut into `size` × `size`-ish patches, in the order they uncover, burning in over `seconds`. */
async function cutVeil(canvas: HTMLCanvasElement, size: number, seconds: number, seed: number): Promise<{ veil: VeilArt; patches: Patch[] }> {
  const { width: W, height: H } = canvas;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  const cut = cutPatches(pixels, W, H, size, seed);
  const veil = {
    w: W,
    h: H,
    burn: Math.round(veilPaceFor(seconds * 1000, size, cut.length).burn),
    count: cut.length,
    box: visibleBox(pixels, W, H),
  };
  const order = spreadOrder(cut, seed);
  const patches = await Promise.all(
    order.map(async (i) => {
      const { x, y, w, h, pixels, edges } = cut[i];
      const piece = document.createElement('canvas');
      piece.width = w;
      piece.height = h;
      piece.getContext('2d')!.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      return { i, x, y, w, h, data: await encode(piece, true), edges: edges.buffer as ArrayBuffer };
    }),
  );
  return { veil, patches };
}

/**
 * When (ms after the question was asked) each of `count` patches appears, by
 * rank: at an even pace, so the reveal burns through the item steadily, the
 * last patch done burning in `seconds` after the first started, or sooner
 * when the picture was cut into fewer patches than its size (veilPaceFor).
 */
export function patchDelays(q: Question, count: number): number[] {
  const { gap } = veilPaceFor(q.veil!.seconds * 1000, q.veil!.size, count);
  return Array.from({ length: count }, (_, rank) => FIRST_PATCH_MS + rank * gap);
}

// ---- what this device shows -------------------------------------------

export interface ShownPatch {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
  /** (x, y, patch) triples: where this patch meets another (see RawPatch.edges). */
  edges: Uint16Array;
}

/** Binary from the wire (an ArrayBuffer or a view of one) as 16-bit numbers. */
function uint16s(data: ArrayBuffer | ArrayBufferView): Uint16Array {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  // Copied, so the numbers start on an even byte whatever the view's offset.
  return new Uint16Array(bytes.slice(0, bytes.length & ~1).buffer);
}

class Shown {
  qid = $state(0);
  art = $state<{ url: string; w: number; h: number } | null>(null);
  veil = $state<VeilArt | null>(null);
  patches = $state<Record<number, ShownPatch>>({});
  options = $state<Record<number, string>>({});
  /** Veiled "find the art" pictures (Delve), by option: their size and burn, and the patches in so far. */
  tileVeils = $state<Record<number, VeilArt>>({});
  tilePatches = $state<Record<number, Record<number, ShownPatch>>>({});
  /** When this question's first picture arrived (page clock), for the codex's answer times. */
  since = 0;
  private urls: string[] = [];

  private url(data: ArrayBuffer) {
    // No type: patches are PNG, everything else WebP, and images are sniffed anyway.
    const u = URL.createObjectURL(new Blob([data]));
    this.urls.push(u);
    return u;
  }

  /** Starts a new question: forget (and free) the previous one's pictures. */
  private ensure(qid: number) {
    if (qid === this.qid) return;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    this.qid = qid;
    this.since = performance.now();
    this.art = null;
    this.veil = null;
    this.patches = {};
    this.options = {};
    this.tileVeils = {};
    this.tilePatches = {};
  }

  receive(m: MediaMsg) {
    if (m.qid < this.qid) return;
    this.ensure(m.qid);
    switch (m.t) {
      case 'art':
        this.art = { url: this.url(m.data), w: m.w, h: m.h };
        break;
      case 'veil': {
        const v = { w: m.w, h: m.h, burn: m.burn, count: m.count, box: m.box };
        if (m.tile === undefined) this.veil = v;
        else this.tileVeils = { ...this.tileVeils, [m.tile]: v };
        break;
      }
      case 'patch': {
        const p = { i: m.i, x: m.x, y: m.y, w: m.w, h: m.h, url: this.url(m.data), edges: uint16s(m.edges) };
        if (m.tile === undefined) this.patches = { ...this.patches, [m.i]: p };
        else this.tilePatches = { ...this.tilePatches, [m.tile]: { ...this.tilePatches[m.tile], [m.i]: p } };
        break;
      }
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
