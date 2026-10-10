// Question art. Guests never load an item's image file directly while a
// question is open (its file name would identify the answer). Instead the
// host sends a lightly altered copy (re-scaled, shifted, noised, re-encoded,
// so it doesn't match the original file byte for byte), and for veiled
// questions only the patches of it that have been uncovered so far.

import { itemImage } from './ui-paths';
import { cutPatches, spreadOrder, veilSchedule, visibleBox, type VeilPlan } from './patches';
import type { MediaMsg } from './protocol';
import type { Grayscale, Question, Veil } from './game';
import { veilPlan } from './delve';

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
  /** Veiled questions, host only: when each patch goes out (ms after the clock starts), the gap up to the half, and each one's area (veilSchedule). */
  delays: number[];
  gap: number;
  areas: number[];
  /** Art questions: one picture per option, and its size in art pixels. */
  options: { w: number; h: number; data: ArrayBuffer }[];
  /** Veiled art questions (Delve): each option's picture cut into patches instead, with its own delays. */
  tiles: CutVeil[];
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

/** Items' art sizes (art pixels; Item.w, Item.h), by id. */
export type ArtSizes = ReadonlyMap<string, { w: number; h: number }>;

/**
 * At most how many pixels per art pixel a picture goes out with. The art to
 * name is shown big and alone, so it keeps all the file has (4 for items up
 * to 2 x 2: artScale); veiled patches (lossless, and only until the full
 * art takes over at the reveal) and the small tiles of a "find the art"
 * question with many options go out at 2, which keeps what every guest is
 * sent near what it was before the art went to 4.
 */
const SHARP = 4;
const LIGHT = 2;
/** A "find the art" question with more options than this shows them small. */
const FEW_OPTIONS = 4;

/** A picture drawn for a question, with its pixels per art pixel. */
interface Altered {
  canvas: HTMLCanvasElement;
  scale: number;
}

/**
 * Draws the item onto a canvas with small random changes (and flipped left to
 * right if `mirror`), so it matches no file byte for byte. The canvas has as
 * many pixels per art pixel as the item's file (its own size over the art's:
 * artScale), but no more than `most`, and its size is a whole number of art
 * pixels. The changes keep clear of the art's sharpness: it is shifted by
 * whole pixels and not turned, only its size is resampled.
 */
async function alteredCanvas(itemId: string, art: { w: number; h: number }, most: number, grayscale: boolean, mirror = false): Promise<Altered> {
  const img = await loadImage(itemImage(itemId));
  const S = Math.max(1, Math.min(most, Math.round(img.naturalWidth / art.w)));
  const scale = rand(0.9, 1.0);
  const w = Math.round(art.w * scale);
  const h = Math.round(art.h * scale);
  const pad = Math.round(rand(2, 8));
  const canvas = document.createElement('canvas');
  canvas.width = (w + pad * 2) * S;
  canvas.height = (h + pad * 2) * S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(Math.round(canvas.width / 2 + rand(-1.5, 1.5) * S), Math.round(canvas.height / 2 + rand(-1.5, 1.5) * S));
  if (mirror) ctx.scale(-1, 1);
  ctx.filter = `brightness(${rand(0.97, 1.03)}) saturate(${rand(0.96, 1.04)})`;
  ctx.drawImage(img, (-w / 2) * S, (-h / 2) * S, w * S, h * S);
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
  return { canvas, scale: S };
}

/**
 * Whole pictures go out as WebP, at a quality that keeps the upscaled art's
 * detail. Patches are lossless PNG: lossy encoding blurs them into blocks
 * with seams between neighbours.
 */
function encode(canvas: HTMLCanvasElement, lossless = false): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error('encode failed'))),
      lossless ? 'image/png' : 'image/webp',
      lossless ? undefined : rand(0.92, 0.95),
    ),
  );
}

/**
 * Host side: builds the art for a question (full question, with the answer).
 * `clock`: the question's seconds (game.ts questionClock) and the veil's
 * share of them, which each veiled picture's pace is fitted to once it is
 * cut (cutVeil).
 */
export async function prepareMedia(q: Question, grayscale: Grayscale, clock: { secs: number; share: number }, sizes: ArtSizes): Promise<PreparedMedia> {
  const art = (id: string) => sizes.get(id)!;
  const out: PreparedMedia = { qid: q.askedAt, art: null, veil: null, patches: [], delays: [], gap: 0, areas: [], options: [], tiles: [] };
  if (q.mode === 'art') {
    const most = q.veil || q.options.length > FEW_OPTIONS ? LIGHT : SHARP;
    const pictures = await Promise.all(q.options.map((id, i) => alteredCanvas(id, art(id), most, grayscale !== 'off', !!q.mirrored?.[i])));
    // Each picture cut on its own seed, so no two burn in alike.
    if (q.veil) out.tiles = await Promise.all(pictures.map((p, i) => cutVeil(p, { ...q.veil!, seed: q.veil!.seed + i }, veilPlan(clock.secs, clock.share, true))));
    else out.options = await Promise.all(pictures.map(async (p) => ({ w: p.canvas.width / p.scale, h: p.canvas.height / p.scale, data: await encode(p.canvas) })));
    return out;
  }
  const picture = await alteredCanvas(q.itemId, art(q.itemId), q.veil ? LIGHT : SHARP, grayscale === 'all', !!q.mirrored?.[0]);
  if (!q.veil) {
    out.art = { w: picture.canvas.width / picture.scale, h: picture.canvas.height / picture.scale, data: await encode(picture.canvas) };
    return out;
  }
  const cut = await cutVeil(picture, q.veil, veilPlan(clock.secs, clock.share, false));
  out.veil = cut.veil;
  out.patches = cut.patches;
  out.delays = cut.delays;
  out.gap = cut.gap;
  out.areas = cut.areas;
  return out;
}

/**
 * A veiled picture as cut: what guests get told of it, its patches in the
 * order they uncover, and (host only) when each goes out, the gap between
 * them up to the half, and how much of the item each holds.
 */
export interface CutVeil {
  veil: VeilArt;
  patches: Patch[];
  delays: number[];
  gap: number;
  areas: number[];
}

/**
 * A picture cut into `size` × `size`-ish patches, in the order they uncover,
 * paced for the patches it really has and their areas (veilSchedule, as
 * `plan` has it): half of the item in by VEIL_LEFT_MS before the clock ends
 * at the latest, the rest after. The patches are cut in art pixels (a copy
 * of the picture scaled down to them), so their shapes, seams and areas are
 * what they always were; each patch's own picture is then taken from the
 * full-resolution canvas, scale × scale pixels for each of its own.
 */
async function cutVeil({ canvas, scale: S }: Altered, v: Veil, plan: VeilPlan): Promise<CutVeil> {
  const W = Math.round(canvas.width / S);
  const H = Math.round(canvas.height / S);
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const sg = small.getContext('2d', { willReadFrequently: true })!;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(canvas, 0, 0, W, H);
  const pixels = sg.getImageData(0, 0, W, H).data;
  // One 32-bit word per pixel, so each one copies without a subarray.
  const fine = new Uint32Array(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
  const FW = canvas.width;
  const cut = cutPatches(pixels, W, H, v.size, v.seed);
  const order = spreadOrder(cut, v.seed);
  const areas = order.map((i) => cut[i].area);
  const schedule = veilSchedule(areas, plan);
  const veil = {
    w: W,
    h: H,
    burn: Math.round(schedule.burn),
    count: cut.length,
    box: visibleBox(pixels, W, H),
  };
  const patches = await Promise.all(
    order.map(async (i) => {
      const { x, y, w, h, pixels: own, edges } = cut[i];
      // The patch's pixels at full resolution: wherever it has an art pixel.
      const pw = w * S;
      const ph = h * S;
      const big = new Uint32Array(pw * ph);
      for (let by = 0; by < ph; by++) {
        const ay = (by / S) | 0;
        const row = (y * S + by) * FW + x * S;
        for (let bx = 0; bx < pw; bx++) {
          if (own[(ay * w + ((bx / S) | 0)) * 4 + 3]) big[by * pw + bx] = fine[row + bx];
        }
      }
      const piece = document.createElement('canvas');
      piece.width = pw;
      piece.height = ph;
      piece.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(big.buffer), pw, ph), 0, 0);
      return { i, x, y, w, h, data: await encode(piece, true), edges: edges.buffer as ArrayBuffer };
    }),
  );
  return { veil, patches, delays: schedule.delays, gap: schedule.gap, areas };
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
  /** Art questions' pictures, by option: their URL and size in art pixels. */
  options = $state<Record<number, { url: string; w: number; h: number }>>({});
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
        this.options = { ...this.options, [m.index]: { url: this.url(m.data), w: m.w, h: m.h } };
        break;
    }
  }

  clear() {
    this.ensure(-1);
    this.qid = 0;
  }
}

export const shown = new Shown();
