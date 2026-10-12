// Question art. Guests never load an item's image file directly while a
// question is open (its file name would identify the answer). Instead the
// host sends a lightly altered copy (re-scaled, shifted, noised, re-encoded,
// so it doesn't match the original file byte for byte). A veiled picture
// goes out whole, with which patch each of its pixels falls in, and the
// host then says when each patch is uncovered; every device cuts the
// patches' pictures from it itself.

import { itemImage } from './ui-paths';
import { labelPatches, packLabels, patchShapes, spreadOrder, unpackLabels, veilSchedule, visibleBox, type PatchShape, type VeilPlan } from './patches';
import type { MediaMsg } from './protocol';
import type { Grayscale, Question, Veil } from './game';
import { veilPlan } from './delve';

/** A patch as the host lets it out: which one it is (its index in the cut, patchShapes). */
export interface Patch {
  i: number;
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

/** A veiled picture as it goes out: what is told of it (VeilArt), the picture itself, and which patch each of its art pixels falls in (packLabels). */
export interface VeilPicture extends VeilArt {
  data: ArrayBuffer;
  labels: ArrayBuffer;
}

/** Everything a question can show, prepared once by the host. */
export interface PreparedMedia {
  qid: number;
  art: { w: number; h: number; data: ArrayBuffer } | null;
  /** Veiled questions: the art, and its patches in the order they uncover. */
  veil: VeilPicture | null;
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

/**
 * Loads a picture and decodes it. Decoding first (img.decode) does it off the
 * main thread, and for a "find the art" question all its pictures at once;
 * drawn undecoded, each would be decoded on the main thread, one after the
 * other, as it is drawn. Only the loading is timed: a picture that is in
 * isn't thrown away for decoding slowly.
 */
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
      // Still drawable if decoding fails: it decodes as it's drawn instead.
      img.decode().then(
        () => resolve(img),
        () => resolve(img),
      );
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
 * to 2 x 2: artScale); veiled pictures (shown only until the full art
 * takes over at the reveal) and the small tiles of a "find the art"
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
 * Pictures go out as WebP, at a quality that keeps the upscaled art's
 * detail. Encoded in a worker (encodeWorker.ts), so the page goes on as the
 * question begins; where there is no worker or OffscreenCanvas, a canvas
 * does it here.
 */
function encode(pixels: ImageData): Promise<ArrayBuffer> {
  const type = 'image/webp';
  const quality = rand(0.92, 0.95);
  const worker = encoder();
  if (!worker) return encodeHere(pixels, type, quality);
  const id = ++encodeJobs;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    // Copied, not handed over: should the worker fail, they're encoded here.
    encoding.set(id, { resolve, again: () => encodeHere(pixels, type, quality).then(resolve, reject) });
    worker.postMessage({ id, w: pixels.width, h: pixels.height, pixels: pixels.data.buffer, type, quality });
  });
}

function encodeHere(pixels: ImageData, type: string, quality?: number): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext('2d', { willReadFrequently: true })!.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error('encode failed'))), type, quality),
  );
}

let worker: Worker | null | undefined;
let encodeJobs = 0;
const encoding = new Map<number, { resolve: (data: ArrayBuffer) => void; again: () => Promise<void> }>();
/** The encoding worker, started on first use; null where it can't run. */
function encoder(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./encodeWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<{ id: number; data?: ArrayBuffer; error?: string }>) => {
    const job = encoding.get(data.id);
    encoding.delete(data.id);
    if (data.data) job?.resolve(data.data);
    else job?.again();
  };
  // A worker that won't start (or dies): what it had, and all that comes after, is encoded here.
  worker.onerror = () => {
    worker = null;
    for (const job of encoding.values()) job.again();
    encoding.clear();
  };
  return worker;
}

/** A canvas's pixels, for encode. */
const pixelsOf = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);

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
    else out.options = await Promise.all(pictures.map(async (p) => ({ w: p.canvas.width / p.scale, h: p.canvas.height / p.scale, data: await encode(pixelsOf(p.canvas)) })));
    return out;
  }
  const picture = await alteredCanvas(q.itemId, art(q.itemId), q.veil ? LIGHT : SHARP, grayscale === 'all', !!q.mirrored?.[0]);
  if (!q.veil) {
    out.art = { w: picture.canvas.width / picture.scale, h: picture.canvas.height / picture.scale, data: await encode(pixelsOf(picture.canvas)) };
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
 * A veiled picture as cut: the picture and what guests get told of it, its
 * patches in the order they uncover, and (host only) when each goes out,
 * the gap between them up to the half, and how much of the item each holds.
 */
export interface CutVeil {
  veil: VeilPicture;
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
 * what they always were. The picture goes out whole, at full resolution,
 * with the cut (its labels); each device takes each patch's own picture from
 * it (patchPicture), scale × scale pixels for each of its own.
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
  const label = labelPatches(pixels, W, H, v.size, v.seed);
  const cut = patchShapes(label, W, H);
  const order = spreadOrder(cut, v.seed);
  const areas = order.map((i) => cut[i].area);
  const schedule = veilSchedule(areas, plan);
  const veil = {
    w: W,
    h: H,
    burn: Math.round(schedule.burn),
    count: cut.length,
    box: visibleBox(pixels, W, H),
    data: await encode(pixelsOf(canvas)),
    labels: packLabels(label).buffer as ArrayBuffer,
  };
  return { veil, patches: order.map((i) => ({ i })), delays: schedule.delays, gap: schedule.gap, areas };
}

// ---- what this device shows -------------------------------------------

export interface ShownPatch {
  i: number;
  /** Its place in the picture, in art pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its own picture, cut from the veiled one (patchPicture), made when first asked for. */
  picture: () => Promise<HTMLCanvasElement>;
  /** (x, y, patch) triples: where this patch meets another (see PatchShape.edges). */
  edges: Uint16Array;
}

/** A veiled picture as received: the picture, decoded, and its patches' shapes. */
interface Cut {
  w: number;
  picture: Promise<HTMLImageElement>;
  shapes: PatchShape[];
}

/**
 * A patch's own picture, at the veiled picture's resolution: its part of the
 * picture, everything outside its mask (its pixels and their 1px ring)
 * transparent, as the host's patches were when each went out on its own.
 */
function patchPicture(img: HTMLImageElement, W: number, p: PatchShape): HTMLCanvasElement {
  const S = Math.max(1, Math.round(img.naturalWidth / W));
  const canvas = document.createElement('canvas');
  canvas.width = p.w * S;
  canvas.height = p.h * S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, p.x * S, p.y * S, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // One 32-bit word per pixel, so each one clears in one go.
  const px = new Uint32Array(data.data.buffer);
  for (let by = 0; by < canvas.height; by++) {
    const row = ((by / S) | 0) * p.w;
    for (let bx = 0; bx < canvas.width; bx++) if (!p.mask[row + ((bx / S) | 0)]) px[by * canvas.width + bx] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
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
  /** The veiled pictures received, by tile (-1: the question's own). */
  private cuts = new Map<number, Cut>();

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
    this.cuts.clear();
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
        const labels = unpackLabels(uint16s(m.labels), m.w * m.h);
        if (!labels) return;
        const url = this.url(m.data);
        const img = new Image();
        img.src = url;
        const picture = img.decode().then(() => img);
        // A picture that won't decode shows no patches; nothing more to say until one asks for it.
        picture.catch(() => {});
        this.cuts.set(m.tile ?? -1, { w: m.w, picture, shapes: patchShapes(labels, m.w, m.h) });
        const v = { w: m.w, h: m.h, burn: m.burn, count: m.count, box: m.box };
        if (m.tile === undefined) this.veil = v;
        else this.tileVeils = { ...this.tileVeils, [m.tile]: v };
        break;
      }
      case 'patch': {
        const cut = this.cuts.get(m.tile ?? -1);
        const shape = cut?.shapes[m.i];
        if (!cut || !shape) return;
        let made: Promise<HTMLCanvasElement> | null = null;
        const picture = () => (made ??= cut.picture.then((img) => patchPicture(img, cut.w, shape)));
        const p = { i: m.i, x: shape.x, y: shape.y, w: shape.w, h: shape.h, picture, edges: shape.edges };
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
