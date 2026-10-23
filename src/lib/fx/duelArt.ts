// The deathmatch's sigil as the effects draw it (effects' sigil): its
// plate (lib/plates/duel.ts) built and painted away from the page, in a
// worker (duelArtWorker.ts), one part to a channel (duelPaint.ts), handed
// to the renderer and kept for the visit. Where no worker can paint it, it
// is painted on the page in an idle moment. Asked for ahead (a game that
// could end in a deathmatch: Game.svelte), so the intro finds it ready.

import { sigilArt } from './core';
import { DUEL_SPAN, paintDuel } from './duelPaint';
import type { DuelAnswer, DuelJob } from './duelArtWorker';
import type { SigilPicture } from './renderer';
import type { DuelPlate } from '../plates/duel.ts';

/** The picture painted. */
let kept: SigilPicture | null = null;
let coming: { size: number; done: Promise<SigilPicture | null> } | null = null;

/** The radius the sigil is drawn at on this screen, CSS px (moments.ts' deathmatchIntro; the card is laid out to it: Game.svelte). */
export const deathmatchRadius = () => Math.min(innerWidth, innerHeight) * 0.42;

/** The size it's painted at: a power of two at least as fine as the sigil is drawn on this screen, at most 2048. */
function sizeFor() {
  const across = 2 * deathmatchRadius() * (DUEL_SPAN / 200) * (devicePixelRatio || 1);
  return Math.min(2048, Math.max(512, 2 ** Math.ceil(Math.log2(Math.max(1, across)))));
}

/** The picture, if it's at hand. */
export const duelPicture = () => kept;

/** The picture: painted (in the worker, failing that on the page) unless one fine enough is kept already; null if it can't be. */
export function duelArt(): Promise<SigilPicture | null> {
  const size = sizeFor();
  if (kept && kept.size >= size) return Promise.resolve(kept);
  if (coming && coming.size >= size) return coming.done;
  const done = paint(size)
    .catch(() => null)
    .then((picture) => {
      if (picture && (!kept || kept.size < size)) {
        kept = picture;
        sigilArt(picture);
      }
      if (coming?.done === done) coming = null;
      return kept;
    });
  coming = { size, done };
  return done;
}

/** Has the picture painted ahead of its showing. */
export const warmDuelArt = () => void duelArt();

async function paint(size: number): Promise<SigilPicture | null> {
  const answer = await fromWorker(size);
  if (answer?.pixels) return { size, pixels: answer.pixels };
  // (The worker built the plate but couldn't paint it, or there's no worker: the page paints it, when it's idle.)
  const plate = answer?.plate ?? (await import('../plates/duel.ts')).build();
  await idle();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  paintDuel(ctx, size, plate as DuelPlate);
  return { size, pixels: new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer) };
}

/** The worker's answer, or null where none can run (or it fails, or doesn't answer in time). */
function fromWorker(size: number): Promise<DuelAnswer | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  let w: Worker;
  try {
    w = new Worker(new URL('./duelArtWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const late = setTimeout(() => done(null), 6000);
    const done = (a: DuelAnswer | null) => {
      clearTimeout(late);
      w.terminate();
      resolve(a && !a.error ? a : null);
    };
    w.onmessage = ({ data }: MessageEvent<DuelAnswer>) => done(data);
    w.onerror = () => done(null);
    w.postMessage({ size } satisfies DuelJob);
  });
}

const idle = () => new Promise<void>((resolve) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 1500 }) : setTimeout(resolve, 50)));
