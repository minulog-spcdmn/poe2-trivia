// The fossils' amber as images (lib/amber.ts paints them): each layer of a
// slab at a size, painted once in a worker (amberWorker.ts), kept for the
// visit as a URL an <img> shows. Where no worker can run, painted here.

import { paintAmber, type AmberJob } from './amber';
import type { AmberAnswer, AmberAsk } from './amberWorker';

/** Images kept, by what was painted: a few slabs' worth at the sizes a window passes through. */
const kept = new Map<string, Promise<string | null>>();
const KEEP = 48;

let workers: Worker[] | null | undefined;
let next = 0;
let lastId = 0;
const waiting = new Map<number, (png: Blob | undefined) => void>();

/** Two workers (a card's body and its light paint at once), or none where they can't run. */
function pool(): Worker[] | null {
  if (workers !== undefined) return workers;
  workers = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    workers = Array.from({ length: 2 }, () => {
      const w = new Worker(new URL('./amberWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }: MessageEvent<AmberAnswer>) => {
        waiting.get(data.id)?.(data.png);
        waiting.delete(data.id);
      };
      // (Failed to load: painted here from now on, those it had painted again.)
      w.onerror = () => {
        for (const x of workers ?? []) x.terminate();
        workers = null;
        for (const [, done] of waiting) done(undefined);
        waiting.clear();
      };
      return w;
    });
  } catch {
    workers = null;
  }
  return workers;
}

/** Paints `job` on the page: a canvas, its PNG. */
function paintHere(job: AmberJob): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [job.W, job.H];
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(undefined);
  ctx.putImageData(new ImageData(paintAmber(job) as Uint8ClampedArray<ArrayBuffer>, job.W, job.H), 0, 0);
  return new Promise((done) => canvas.toBlob((b) => done(b ?? undefined), 'image/png'));
}

/** `job` painted, as a URL to show (null if it couldn't be). The same job again is the same URL. */
export function amberImage(job: AmberJob): Promise<string | null> {
  const key = JSON.stringify(job);
  const known = kept.get(key);
  if (known) {
    // (Seen again: kept the longest now.)
    kept.delete(key);
    kept.set(key, known);
    return known;
  }
  const all = pool();
  const png: Promise<Blob | undefined> = all
    ? new Promise((done) => {
        const id = ++lastId;
        waiting.set(id, done);
        all[next++ % all.length].postMessage({ id, job } satisfies AmberAsk);
      })
    : paintHere(job);
  const url = png.then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null);
  kept.set(key, url);
  if (kept.size > KEEP) {
    const [oldest, gone] = kept.entries().next().value!;
    kept.delete(oldest);
    void gone.then((u) => u && setTimeout(() => URL.revokeObjectURL(u), 10_000));
  }
  return url;
}
