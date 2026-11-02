// A fossil's amber as a picture (lib/fossilAmber's paintAmber, in
// lib/fossilAmberWorker.ts): asked for as a fossil's card is dealt, made
// away from the page and kept for the visit by what it shows (the stone,
// its tier, its size in pixels), so a hand dealt again shows it at once.
// Where no worker can run, it's painted here, in an idle moment.

import type { AmberJob } from './fossilAmber.ts';
import type { AmberAnswer, AmberAsk } from './fossilAmberWorker.ts';

/** Pictures kept, by job, as blob URLs: a few sizes' worth (a window resized, a phone turned). */
const kept = new Map<string, Promise<string | null>>();
const KEEP = 8;

let worker: Worker | null | undefined;
let last = 0;
const owed = new Map<number, (a: AmberAnswer) => void>();

function amberWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./fossilAmberWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<AmberAnswer>) => {
      owed.get(data.id)?.(data);
      owed.delete(data.id);
    };
    // (Failed to load: what it owes is painted here.)
    w.onerror = () => {
      worker = null;
      for (const [id, done] of owed) done({ id });
      owed.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** `pixels` as a PNG's blob URL, on a canvas here. */
async function fromPixels(pixels: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): Promise<string | null> {
  const c = document.createElement('canvas');
  [c.width, c.height] = [w, h];
  c.getContext('2d')?.putImageData(new ImageData(pixels, w, h), 0, 0);
  const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}

/** Painted here, in an idle moment. */
async function paintHere(job: AmberJob): Promise<string | null> {
  await new Promise<void>((go) => ('requestIdleCallback' in window ? requestIdleCallback(() => go(), { timeout: 400 }) : setTimeout(go, 30)));
  const { paintAmber } = await import('./fossilAmber.ts');
  const pixels = new Uint8ClampedArray(new ArrayBuffer(job.w * job.h * 4));
  paintAmber(job, pixels);
  return fromPixels(pixels, job.w, job.h);
}

async function make(job: AmberJob): Promise<string | null> {
  const w = amberWorker();
  if (!w) return paintHere(job);
  const id = ++last;
  const answer = await new Promise<AmberAnswer>((done) => {
    owed.set(id, done);
    w.postMessage({ id, job } satisfies AmberAsk);
  });
  if (answer.png) return URL.createObjectURL(answer.png);
  if (answer.pixels) return fromPixels(answer.pixels, job.w, job.h);
  return paintHere(job);
}

let lamp: Promise<string | null> | undefined;
/**
 * The lamp's light seen through the amber (AmberStone's `.lamp`): a pale
 * round of it, soft to its edge, as a picture whose every pixel's opacity is
 * dithered as it's rounded, so its slow falloff never bands where it moves
 * over the stone (CLAUDE.md); a picture, alone on its element, as a sharp
 * face's must be (docs/category-cards.md). Made once, here.
 */
export function lampTexture(): Promise<string | null> {
  return (lamp ??= (async () => {
    // (Drawn at about its size on a sharp face at twice the screen's density: stretched, its dither would blur away.)
    const N = 224;
    const px = new Uint8ClampedArray(new ArrayBuffer(N * N * 4));
    let rng = 0x9e3779b9;
    const rand = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const r = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2;
        // Full at the middle, half by 0.45 of the way, gone at the edge.
        const a = r >= 1 ? 0 : Math.exp(-((r / 0.53) ** 2)) * (1 - r * r);
        const o = (j * N + i) * 4;
        [px[o], px[o + 1], px[o + 2]] = [255, 242, 200];
        px[o + 3] = a > 0 ? a * 255 + rand() + rand() - rand() - rand() : 0;
      }
    }
    return fromPixels(px, N, N);
  })().catch(() => null));
}

/** The amber `job` paints, as a picture's URL (null if it couldn't be made). */
export function amberTexture(job: AmberJob): Promise<string | null> {
  const key = JSON.stringify(job);
  let p = kept.get(key);
  if (!p) {
    p = make(job).catch(() => null);
    if (kept.size >= KEEP) {
      const [oldKey, old] = kept.entries().next().value!;
      kept.delete(oldKey);
      void old.then((url) => url && setTimeout(() => URL.revokeObjectURL(url), 2000));
    }
    kept.set(key, p);
  }
  return p;
}
