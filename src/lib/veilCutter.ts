// Where this device cuts veiled pictures' patches (veilCut.ts): in a worker
// (veilWorker.ts), so the page's main thread stays free as a question begins
// and at the reveal; on the page itself where no worker can run, or where
// one fails.

import { drawnBox, placeOf, VeilCut, type OwnVeil, type PatchImage, type PatchPlace, type VeilWire } from './veilCut';
import type { VeilAnswer, VeilJob } from './veilWorker';

/** A veiled picture being cut. */
export interface CutHandle {
  /** Its patches' places, in the cut's order; null if its labels don't fit it. */
  places(): Promise<PatchPlace[] | null>;
  /** Patch `i`'s own picture. */
  picture(i: number): Promise<PatchImage>;
  /** Done with before its question is (a veil sent again, cut otherwise): the worker lets go of it. */
  drop(): void;
}

const canvasOnPage = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

/** Counts the questions: a cut from an earlier one makes no more pictures. */
let era = 0;

/** A new question: the pictures cut so far are done with. */
export function forgetCuts() {
  era++;
  worker?.postMessage({ t: 'forget' } satisfies VeilJob);
}

/**
 * Starts cutting a veiled picture as a guest got it (`wire`), or as the host
 * cut it (`own`, whose pixels go to the worker). In the worker, its shapes
 * are worked out and its picture decoded at once; on the page, only once its
 * first patch uncovers.
 */
export const startCut = (wire: VeilWire, own?: OwnVeil): CutHandle => new Cutting(wire, own);

class Cutting implements CutHandle {
  private readonly era = era;
  /** Its key in the worker; 0 once it's cut on the page. */
  private key = 0;
  private placed: Promise<PatchPlace[] | null> | null = null;
  private page: VeilCut<HTMLCanvasElement> | null = null;
  private readonly own?: OwnVeil;

  constructor(
    private readonly wire: VeilWire,
    own?: OwnVeil,
  ) {
    if (own) this.placed = Promise.resolve(own.shapes.map(placeOf));
    const w = veilWorker();
    // (Its pixels go to the worker; should that fail, the picture as encoded is used.)
    this.own = own && (w ? { shapes: own.shapes, lit: own.lit } : own);
    if (!w) return;
    this.key = ++keys;
    // (The host's own picture goes as pixels; the encoded one stays here, for should the worker fail.)
    const job: VeilJob = { t: 'cut', key: this.key, wire: own?.pixels ? { ...wire, data: new ArrayBuffer(0) } : wire, own };
    const answer = new Promise<PatchPlace[] | null | undefined>((resolve) => cutting.set(this.key, resolve));
    w.postMessage(job, own?.pixels ? [own.pixels.data.buffer] : []);
    // (Even with the host's own places in hand, a cut the worker couldn't make is made here.)
    const places = answer.then((p) => (p === undefined ? this.onPage() : p));
    this.placed ??= places;
  }

  /** Cut on the page from now on (no worker, or it failed): its places. */
  private onPage(): PatchPlace[] | null {
    this.key = 0;
    this.page ??= new VeilCut(this.wire, canvasOnPage, this.own);
    return this.page.shapes()?.map(placeOf) ?? null;
  }

  places() {
    return (this.placed ??= Promise.resolve().then(() => this.onPage()));
  }

  drop() {
    if (this.key) worker?.postMessage({ t: 'forget', key: this.key } satisfies VeilJob);
  }

  async picture(i: number): Promise<PatchImage> {
    const gone = () => new Error('a question gone by');
    if (this.era !== era) throw gone();
    if (this.key) {
      const bitmap = await askWorker(this.key, i);
      if (bitmap) return bitmap;
      if (this.era !== era) throw gone();
    }
    this.onPage();
    return this.page!.picture(i);
  }
}

/**
 * Where the visible pixels are in `img` (decoded) drawn `w` × `h` (drawnBox):
 * worked out in the worker, from the file as cached, or on the page where it
 * can't be.
 */
export async function visibleBoxOf(img: HTMLImageElement, w: number, h: number): Promise<[number, number, number, number]> {
  const v = veilWorker();
  if (v) {
    const id = ++jobs;
    const box = await new Promise<[number, number, number, number] | null>((resolve) => {
      boxes.set(id, resolve);
      v.postMessage({ t: 'box', id, url: img.currentSrc || img.src, w, h } satisfies VeilJob);
    });
    if (box) return box;
  }
  return drawnBox(img, canvasOnPage(w, h));
}

let worker: Worker | null | undefined;
let keys = 0;
let jobs = 0;
/** Cuts the worker hasn't answered yet, by key (undefined: it failed). */
const cutting = new Map<number, (places: PatchPlace[] | null | undefined) => void>();
/** Pictures asked of the worker, by job (null: it failed). */
const asked = new Map<number, (bitmap: ImageBitmap | null) => void>();
/** Boxes asked of the worker, by job (null: it failed). */
const boxes = new Map<number, (box: [number, number, number, number] | null) => void>();

function askWorker(key: number, i: number): Promise<ImageBitmap | null> {
  const w = worker;
  if (!w) return Promise.resolve(null);
  const id = ++jobs;
  return new Promise((resolve) => {
    asked.set(id, resolve);
    w.postMessage({ t: 'picture', id, key, i } satisfies VeilJob);
  });
}

/** The cutting worker, started on first use; null where it can't run. */
function veilWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./veilWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<VeilAnswer>) => {
    if (data.t === 'cut') {
      const done = cutting.get(data.key);
      cutting.delete(data.key);
      done?.(data.error === undefined ? (data.places ?? null) : undefined);
    } else if (data.t === 'box') {
      const done = boxes.get(data.id);
      boxes.delete(data.id);
      done?.(data.box ?? null);
    } else {
      const done = asked.get(data.id);
      asked.delete(data.id);
      done?.(data.bitmap ?? null);
    }
  };
  // A worker that won't start (or dies): what it had, and all that comes after, is cut on the page.
  worker.onerror = () => {
    worker = null;
    for (const done of cutting.values()) done(undefined);
    for (const done of asked.values()) done(null);
    for (const done of boxes.values()) done(null);
    cutting.clear();
    asked.clear();
    boxes.clear();
  };
  return worker;
}
