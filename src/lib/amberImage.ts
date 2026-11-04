// The fossils' amber as images (lib/amber.ts paints them): each image of a
// slab at a size, and each emblem caught in it, painted once in a worker
// (amberWorker.ts), kept for the visit as a URL to show. Where no worker can
// run, painted here.

import { paintAmber, paintInclusion, type AmberJob } from './amber';
import type { AmberAnswer, AmberAsk, InclusionJob } from './amberWorker';

/** Images kept, by what was painted: a few slabs' worth at the sizes a window passes through. */
const kept = new Map<string, Promise<string[] | null>>();
const KEEP = 48;

let workers: Worker[] | null | undefined;
let next = 0;
let lastId = 0;
const waiting = new Map<number, (a: AmberAnswer) => void>();

/** Two workers (a card's two strips paint at once), or none where they can't run. */
function pool(): Worker[] | null {
  if (workers !== undefined) return workers;
  workers = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    workers = Array.from({ length: 2 }, () => {
      const w = new Worker(new URL('./amberWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }: MessageEvent<AmberAnswer>) => {
        waiting.get(data.id)?.(data);
        waiting.delete(data.id);
      };
      // (Failed to load: painted here from now on, those it had painted again.)
      w.onerror = () => {
        for (const x of workers ?? []) x.terminate();
        workers = null;
        for (const [id, done] of waiting) done({ id });
        waiting.clear();
      };
      return w;
    });
  } catch {
    workers = null;
  }
  return workers;
}

/** RGBA pixels as a PNG, painted on the page. */
function pngHere(px: Uint8ClampedArray, W: number, H: number): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [W, H];
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(undefined);
  ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
  return new Promise((done) => canvas.toBlob((b) => done(b ?? undefined), 'image/png'));
}

/** An emblem caught in the amber, painted here: its body and rim. */
async function inclusionHere({ image, W, H, s, rare, grain }: InclusionJob): Promise<AmberAnswer> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [W, H];
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0, W, H);
  bitmap.close();
  const rgba = g.getImageData(0, 0, W, H).data;
  const alpha = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = rgba[p * 4 + 3] / 255;
  const { body, rim } = paintInclusion(alpha, W, H, s, rare, grain);
  return { id: 0, png: await pngHere(body, W, H), rim: await pngHere(rim, W, H) };
}

/** What's asked painted, in a worker or here; the same thing again, the same URLs. */
function painted(key: string, ask: { job: AmberJob } | { inclusion: InclusionJob }, here: () => Promise<AmberAnswer>): Promise<string[] | null> {
  const known = kept.get(key);
  if (known) {
    // (Seen again: kept the longest now.)
    kept.delete(key);
    kept.set(key, known);
    return known;
  }
  const all = pool();
  const answer: Promise<AmberAnswer> = all
    ? new Promise((done) => {
        const id = ++lastId;
        waiting.set(id, done);
        all[next++ % all.length].postMessage({ ...ask, id } as AmberAsk);
      })
    : here();
  const urls = answer
    .then((a) => {
      const blobs = [a.png, ...('inclusion' in ask ? [a.rim] : [])];
      return blobs.every(Boolean) ? blobs.map((b) => URL.createObjectURL(b!)) : null;
    })
    .catch(() => null);
  kept.set(key, urls);
  if (kept.size > KEEP) {
    const [oldest, gone] = kept.entries().next().value!;
    kept.delete(oldest);
    void gone.then((us) => us && setTimeout(() => us.forEach((u) => URL.revokeObjectURL(u)), 10_000));
  }
  return urls;
}

/** `job` painted, as a URL to show (null if it couldn't be). The same job again is the same URL. */
export function amberImage(job: AmberJob): Promise<string | null> {
  return painted(JSON.stringify(job), { job }, async () => ({ id: 0, png: await pngHere(paintAmber(job), job.W, job.H) })).then((us) => us?.[0] ?? null);
}

/** The masks read, by URL: the image and its size. */
const masks = new Map<string, Promise<{ image: Blob; w: number; h: number }>>();
function maskImage(url: string) {
  let m = masks.get(url);
  if (!m) {
    m = (async () => {
      const image = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(image);
      const [w, h] = [bitmap.width, bitmap.height];
      bitmap.close();
      return { image, w, h };
    })();
    masks.set(url, m);
    // (Not kept if it fails: tried again on the next look.)
    m.catch(() => masks.delete(url));
  }
  return m;
}

/**
 * A fossil's emblem as the amber caught it (lib/amber's paintInclusion),
 * from its mask at `url` drawn `contain` in a box `bw` x `bh` layout px at
 * `s` device px to one, in a rare's amber or a common's (`grain`, as
 * lib/amber's AmberJob's): its body's and its rim's URLs.
 */
export async function inclusionImages(url: string, bw: number, bh: number, s: number, rare: boolean, grain = 1): Promise<{ body: string; rim: string } | null> {
  try {
    const { image, w, h } = await maskImage(url);
    const k = Math.min(bw / w, bh / h) * s;
    const [W, H] = [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
    const job: InclusionJob = { image, W, H, s, rare, grain };
    const us = await painted(`inclusion ${url} ${W} ${H} ${s} ${rare} ${grain}`, { inclusion: job }, () => inclusionHere(job));
    return us ? { body: us[0]!, rim: us[1]! } : null;
  } catch {
    return null;
  }
}
