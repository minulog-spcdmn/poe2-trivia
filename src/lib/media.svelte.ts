// Question art. Guests never load an item's image file directly while a
// question is open (its file name would identify the answer). Instead the
// host sends a lightly altered copy (re-scaled, shifted, noised, re-encoded,
// so it doesn't match the original file byte for byte). A veiled picture
// goes out whole, with which patch each of its pixels falls in, and the
// host then says when each patch is uncovered; every device cuts the
// patches' pictures from it itself.

import { itemImage } from './ui-paths';
import { patchCount, patchWork } from './patches';
import { prepare, type PrepJob, type Prepped } from './prepArt';
import type { PrepAnswer, PrepRequest } from './prepWorker';
import type { OwnVeil, PatchImage } from './veilCut';
import { forgetCuts, startCut, type CutHandle } from './veilCutter';
import type { MediaMsg } from './protocol';
import { drawnAs, type Grayscale, type Item, type Question, type Veil } from './game';
import { veilPlan } from './delve';
import { loadOnce } from './loadOnce';

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
const fileCache = new Map<string, Promise<Blob>>();

/** A request that neither loads nor fails by then has stalled. */
const IMAGE_TIMEOUT_MS = 8000;
/**
 * The most art pixels a veil is cut in (the biggest art has under 90,000),
 * and how much cutting it may take for each (patches.ts patchWork): a real
 * cut takes about twice its pixels, the smallest art's on the finest cuts
 * over four times, so eight, and never less than MIN_VEIL_WORK, where small
 * art's cuts are all well within (a cut that takes it costs a few ms).
 */
const MAX_VEIL_PIXELS = 512 * 512;
const VEIL_WORK = 8;
const MIN_VEIL_WORK = 1 << 20;

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

/**
 * Loads a picture's file as it is, for a worker to decode (prepWorker.ts):
 * an image element's pixels would have to be copied out on the main thread
 * (createImageBitmap) to get there, a few ms a picture.
 */
async function fetchFile(src: string): Promise<Blob> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(src, { signal: stop.signal });
    if (!res.ok) throw new Error(`Could not load ${src}`);
    return await res.blob();
  } finally {
    clearTimeout(timer);
  }
}

const loadImage = (src: string) => loadOnce(imageCache, src, fetchImage);
const loadFile = (src: string) => loadOnce(fileCache, src, fetchFile);

/** The items, by id: their art, its size (art pixels; Item.w, Item.h) and their other art (Item.variants). */
export type ItemsById = ReadonlyMap<string, Item>;

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

/**
 * One picture of a question, prepared (prepArt.ts: drawn lightly altered,
 * cut if veiled, encoded as WebP). In a worker (prepWorker.ts), from the
 * item's file as it is, so the page goes on as the question begins; where
 * there is no worker, OffscreenCanvas or createImageBitmap, or where the
 * file can't be fetched or a worker fails, the page does it itself from the
 * item's image. `signal` stops it: a worker drops the job where it is.
 */
async function prepPicture(art: { art: string; w: number; h: number }, job: Omit<PrepJob, 'w' | 'h'>, signal?: AbortSignal): Promise<Prepped> {
  const src = itemImage(art.art);
  const full: PrepJob = { ...job, w: art.w, h: art.h };
  const here = async () => {
    const img = await loadImage(src);
    signal?.throwIfAborted();
    return prepare(img, img.naturalWidth, full, canvasOnPage, encodeHere);
  };
  signal?.throwIfAborted();
  if (!preparers()?.length) return here();
  const file = await loadFile(src).catch(() => null);
  signal?.throwIfAborted();
  // (Picked only now: one may have failed meanwhile.)
  const p = leastBusy();
  if (!file || !p) return here();
  const id = ++prepJobs;
  return new Promise<Prepped>((resolve, reject) => {
    p.jobs.set(id, { resolve, again: () => here().then(resolve, reject) });
    p.worker.postMessage({ t: 'prep', id, file, job: full } satisfies PrepRequest);
    signal?.addEventListener(
      'abort',
      () => {
        if (!p.jobs.delete(id)) return;
        p.worker.postMessage({ t: 'drop', id } satisfies PrepRequest);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

const canvasOnPage = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

function encodeHere(canvas: HTMLCanvasElement, type: string, quality: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error('encode failed'))), type, quality),
  );
}

/**
 * How many workers prepare pictures side by side: a "find the art" question's
 * eight are ready sooner, while a phone keeps cores for the page and the
 * link.
 */
const PREPARERS = 3;

/** A preparing worker and the pictures it hasn't answered yet, by job. */
interface Preparer {
  worker: Worker;
  jobs: Map<number, { resolve: (p: Prepped) => void; again: () => Promise<void> }>;
}

let pool: Preparer[] | null | undefined;
let prepJobs = 0;

/** The preparing workers, started on first use (or by warmMedia); null (or none left) where they can't run. */
function preparers(): Preparer[] | null {
  if (pool !== undefined) return pool;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return (pool = null);
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  pool = [];
  for (let k = 0; k < Math.max(1, Math.min(PREPARERS, cores - 1)); k++) {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./prepWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      break;
    }
    const p: Preparer = { worker, jobs: new Map() };
    worker.onmessage = ({ data }: MessageEvent<PrepAnswer>) => {
      const job = p.jobs.get(data.id);
      p.jobs.delete(data.id);
      if (data.prepped) job?.resolve(data.prepped);
      else job?.again();
    };
    // A worker that won't start (or dies): what it had is prepared here, and it is given no more.
    worker.onerror = () => {
      pool = pool?.filter((q) => q !== p) ?? null;
      for (const job of p.jobs.values()) job.again();
      p.jobs.clear();
    };
    pool.push(p);
  }
  return pool;
}

/** The worker with the fewest pictures in hand; null if none can run. */
function leastBusy(): Preparer | null {
  return (preparers() ?? []).reduce<Preparer | null>((a, b) => (!a || b.jobs.size < a.jobs.size ? b : a), null);
}

/**
 * Host: gets the art's preparing ready before the first question needs it,
 * starting its workers and running each through a tiny picture once, so the
 * first question's art isn't the one that waits for their script to load and
 * their encoder to start. Call it as a game starts; calling it again does
 * nothing more.
 */
export function warmMedia() {
  if (pool !== undefined) return;
  for (const p of preparers() ?? []) p.worker.postMessage({ t: 'warm' } satisfies PrepRequest);
}

/**
 * Host side: builds the art for a question (full question, with the answer).
 * `clock`: the question's seconds (game.ts questionClock) and the veil's
 * share of them, which each veiled picture's pace is fitted to as it is cut
 * (prepArt.ts cutArt). `signal` stops it partway (a race's question drawn
 * ahead and thrown away), so it holds up no question asked in its place.
 */
export async function prepareMedia(
  q: Question,
  grayscale: Grayscale,
  clock: { secs: number; share: number },
  items: ItemsById,
  signal?: AbortSignal,
): Promise<PreparedMedia> {
  // Each picture as the question draws its item (Question.variant).
  const art = (id: string, i: number) => drawnAs(items.get(id)!, q.variant?.[i]);
  const out: PreparedMedia = { qid: q.askedAt, art: null, veil: null, patches: [], delays: [], gap: 0, areas: [], options: [], tiles: [] };
  if (q.mode === 'art') {
    const most = q.veil || q.options.length > FEW_OPTIONS ? LIGHT : SHARP;
    const plan = q.veil && veilPlan(clock.secs, clock.share, true);
    const pictures = await Promise.all(
      q.options.map((id, i) =>
        prepPicture(art(id, i), {
          most,
          grayscale: grayscale !== 'off',
          mirror: !!q.mirrored?.[i],
          // Each picture cut on its own seed, so no two burn in alike.
          veil: q.veil && plan ? { size: q.veil.size, seed: q.veil.seed + i, plan } : undefined,
        }, signal),
      ),
    );
    if (q.veil) out.tiles = pictures.map(cutVeil);
    else out.options = pictures.map(({ w, h, data }) => ({ w, h, data }));
    return out;
  }
  const veil = q.veil ? { size: q.veil.size, seed: q.veil.seed, plan: veilPlan(clock.secs, clock.share, false) } : undefined;
  const picture = await prepPicture(art(q.itemId, 0), { most: q.veil ? LIGHT : SHARP, grayscale: grayscale === 'all', mirror: !!q.mirrored?.[0], veil }, signal);
  if (!picture.cut) {
    out.art = { w: picture.w, h: picture.h, data: picture.data };
    return out;
  }
  const cut = cutVeil(picture);
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
 * A picture prepared veiled, as it goes out: cut into `size` × `size`-ish
 * patches, in the order they uncover, paced for the patches it really has
 * and their areas (prepArt.ts cutArt, veilSchedule): half of the item in by
 * VEIL_LEFT_MS before the clock ends at the latest, the rest after. The
 * picture goes out whole, at full resolution, with the cut (its labels);
 * each device takes each patch's own picture from it (veilCut.ts
 * patchPicture), scale × scale pixels for each of its own (and of its ring,
 * its outline smoothed through it: patchCoverage). The host's own device
 * takes them from what was cut (ownCuts), not the encoded picture.
 */
function cutVeil({ data, cut }: Prepped): CutVeil {
  if (!cut) throw new Error('a veiled picture prepared uncut');
  const veil = { w: cut.w, h: cut.h, burn: cut.burn, count: cut.count, box: cut.box, data, labels: cut.labels };
  ownCuts.set(veil.data, { shapes: cut.shapes, lit: cut.lit, pixels: cut.pixels });
  return { veil, patches: cut.order.map((i) => ({ i })), delays: cut.delays, gap: cut.gap, areas: cut.areas };
}

// ---- what this device shows -------------------------------------------

export interface ShownPatch {
  i: number;
  /** Its place in the picture, in art pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its own picture, cut from the veiled one (veilCut.ts patchPicture), made when first asked for. */
  picture: () => Promise<PatchImage>;
  /** (x, y, patch) triples: where this patch meets another (see PatchShape.edges). */
  edges: Uint16Array;
}

/**
 * Host: what it cut each veiled picture into, by the picture as encoded
 * (VeilPicture.data), for its own device to show the patches from (Shown)
 * rather than decode the picture and work the shapes out again.
 */
const ownCuts = new WeakMap<ArrayBuffer, OwnVeil>();

/** What an encoded picture is, by its first bytes: WebP, or PNG where the browser can't encode WebP (as Safari can't); '' if neither. */
export function imageType(data: ArrayBuffer | ArrayBufferView): string {
  const n = Math.min(12, data.byteLength);
  const b = data instanceof ArrayBuffer ? new Uint8Array(data, 0, n) : new Uint8Array(data.buffer, data.byteOffset, n);
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x89 && text(1, 4) === 'PNG') return 'image/png';
  return '';
}

/** Whether two runs of numbers are the same. */
function sameNumbers(a: Uint16Array, b: Uint16Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Binary from the wire (an ArrayBuffer or a view of one) as 16-bit numbers. */
function uint16s(data: ArrayBuffer | ArrayBufferView): Uint16Array {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  // Copied, so the numbers start on an even byte whatever the view's offset.
  return new Uint16Array(bytes.slice(0, bytes.length & ~1).buffer);
}

/** The most patches held waiting for their picture: every patch of a "find the art" question's pictures, and then some. */
const MAX_EARLY = 1024;

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
  /**
   * When this question's first picture came to be shown (page clock), for the
   * codex's answer times: as it opened with its key on a guest (seal.ts), as
   * its clock started on the host.
   */
  since = 0;
  private urls: string[] = [];
  /** The veiled pictures received, by tile (-1: the question's own), and their labels. */
  private cuts = new Map<number, { cut: CutHandle; labels: Uint16Array }>();
  /** This question's patch pictures from the worker, freed when it's over (the drawn patches have them on their own canvases by then). */
  private bitmaps: ImageBitmap[] = [];
  /**
   * Patches named before their veiled picture is here: on a guest it comes
   * sealed and opens only as the clock starts (seal.ts), while its patches
   * come plain, so one can overtake it. They wait for it, in order.
   */
  private early: { qid: number; tile: number; i: number }[] = [];

  private url(data: ArrayBuffer) {
    const u = URL.createObjectURL(new Blob([data], { type: imageType(data) }));
    this.urls.push(u);
    return u;
  }

  /** Starts a new question: forget (and free) the previous one's pictures. */
  private ensure(qid: number) {
    if (qid === this.qid) return;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    this.cuts.clear();
    forgetCuts();
    for (const b of this.bitmaps) b.close();
    this.bitmaps = [];
    this.early = this.early.filter((p) => p.qid === qid);
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
    if (m.t === 'patch' && (m.qid !== this.qid || !this.cuts.has(m.tile ?? -1))) {
      // Its picture isn't here yet (still sealed, or opening): it waits for it.
      if (this.early.length < MAX_EARLY) this.early.push({ qid: m.qid, tile: m.tile ?? -1, i: m.i });
      return;
    }
    this.ensure(m.qid);
    switch (m.t) {
      case 'art':
        this.art = { url: this.url(m.data), w: m.w, h: m.h };
        break;
      case 'veil': {
        // Labels that don't make the patches the veil counts would leave it never whole.
        const labels = uint16s(m.labels);
        if (patchCount(labels, m.w * m.h) !== m.count) return;
        // A veil no real cut makes (a host's attempt to freeze its guests) isn't cut at all.
        if (m.w * m.h > MAX_VEIL_PIXELS || patchWork(labels, m.w) > Math.max(VEIL_WORK * m.w * m.h, MIN_VEIL_WORK)) return;
        // The same veil again (a guest reconnecting) keeps its cut and the
        // patches shown of it; one cut otherwise starts afresh.
        const tile = m.tile ?? -1;
        const had = this.cuts.get(tile);
        if (!had || !sameNumbers(had.labels, labels)) {
          // Cut in the worker (veilCutter.ts); the host's own device from what it cut.
          const own = ownCuts.get(m.data);
          ownCuts.delete(m.data);
          had?.cut.drop();
          this.cuts.set(tile, { cut: startCut({ w: m.w, h: m.h, data: m.data, labels }, own), labels });
          if (had && m.tile === undefined) this.patches = {};
          else if (had) this.tilePatches = { ...this.tilePatches, [m.tile!]: {} };
        }
        const v = { w: m.w, h: m.h, burn: m.burn, count: m.count, box: m.box };
        if (m.tile === undefined) this.veil = v;
        else this.tileVeils = { ...this.tileVeils, [m.tile]: v };
        // The patches that came ahead of it burn in now.
        const ahead = this.early.filter((p) => p.qid === m.qid && p.tile === tile);
        if (!ahead.length) break;
        this.early = this.early.filter((p) => !ahead.includes(p));
        for (const p of ahead) this.receive({ t: 'patch', qid: p.qid, ...(m.tile === undefined ? {} : { tile: m.tile }), i: p.i });
        break;
      }
      case 'patch': {
        const tile = m.tile ?? -1;
        const held = this.cuts.get(tile);
        if (!held) return;
        const { cut } = held;
        const shownAlready = () => !!(m.tile === undefined ? this.patches : this.tilePatches[m.tile])?.[m.i];
        // (Sent again to a guest reconnecting: it's there, burnt in already.)
        if (shownAlready()) return;
        const bitmaps = this.bitmaps;
        // (Its places come from the worker; patches named meanwhile wait for them, in turn.)
        cut.places().then((places) => {
          const shape = places?.[m.i];
          if (!shape || this.cuts.get(tile) !== held || shownAlready()) return;
          let made: Promise<PatchImage> | null = null;
          const picture = () =>
            (made ??= cut.picture(m.i).then((img) => {
              if (typeof ImageBitmap === 'undefined' || !(img instanceof ImageBitmap)) return img;
              // One for a question already over is freed at once (nothing still showing it draws it).
              if (bitmaps === this.bitmaps) bitmaps.push(img);
              else img.close();
              return img;
            }));
          const p = { i: m.i, x: shape.x, y: shape.y, w: shape.w, h: shape.h, picture, edges: shape.edges };
          if (m.tile === undefined) this.patches = { ...this.patches, [m.i]: p };
          else this.tilePatches = { ...this.tilePatches, [m.tile]: { ...this.tilePatches[m.tile], [m.i]: p } };
        }, () => {});
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
    this.early = [];
  }
}

export const shown = new Shown();
