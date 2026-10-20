// Before and after (B on the desk): the view as the code before this change
// draws it, beside the code now, both live; and where they differ. The dev
// server keeps the code before ready on a server of its own (qaBefore.ts),
// and takes shots of both in a browser of its own, the same way each time
// (WebGL off, motion reduced), so two shots of the same code match: the
// desk compares them here (./diff.ts) and marks what differs on both.

import { compare, type Area, type Difference, type Pixels } from './diff.ts';

/** A frame the stage shows: its address, or (none yet) a word on why; and over it, before and after, what differs. */
export interface Shown {
  src: string;
  title: string;
  caption: string;
  /** Instead of Loading… while it has no address. */
  note?: string;
  /** The areas that differ from the other side, numbered. */
  marks?: Area[];
  /** A picture of what differs, laid over it (an object URL). */
  layer?: string;
}

/** The code before this change, as the dev server has it (/__qa/before); `none` without one (the beta). */
export type Before =
  | { state: 'preparing'; base?: string; step?: string }
  | { state: 'ready'; base: string; origin: string }
  | { state: 'failed'; base?: string; error: string }
  | { state: 'none' };

/** How far the code before is; `retry` starts again one that failed. */
export async function askBefore(retry = false): Promise<Before> {
  try {
    const r = await fetch(`./__qa/before${retry ? '?retry' : ''}`, { cache: 'no-store' });
    if (!r.ok) return { state: 'none' };
    const got = await r.json();
    return got && typeof got.state === 'string' ? got : { state: 'none' };
  } catch {
    return { state: 'none' };
  }
}

/** A frame's address on the server of the code before: the same view, answering to this desk. */
export function beforeSrc(src: string, origin: string, slot: string): string {
  const u = new URL(src, location.href);
  const p = u.searchParams;
  p.set('frame', slot);
  p.set('desk', location.origin);
  return `${origin}${u.pathname}?${p}`;
}

/** A frame's address for a shot of it: a page of its own, without the outlines of what's wrong. */
export function shotSrc(src: string, origin = location.origin): string {
  const u = new URL(src, location.href);
  const p = u.searchParams;
  p.set('frame', 'shot');
  p.set('o', '0');
  p.delete('desk');
  return `${origin}${u.pathname}?${p}`;
}

export interface Compared {
  diff: Omit<Difference, 'mask'>;
  before: ImageBitmap;
  now: ImageBitmap;
  /** The difference as a picture to lay over the frame now (an object URL). */
  layer: string;
}

/** One side couldn't show the view at all (on the code before: it's new, or uses something that is), and why. */
export class CantShow extends Error {
  constructor(
    readonly side: 'before' | 'now',
    why: string,
  ) {
    super(why);
  }
}

async function shot(url: string, w: number, h: number, signal: AbortSignal, side: 'before' | 'now'): Promise<ImageBitmap> {
  const q = new URLSearchParams({ url, w: String(Math.round(w)), h: String(Math.round(h)) });
  const r = await fetch(`./__qa/shot?${q}`, { signal, cache: 'no-store' });
  if (!r.ok) {
    const why = (await r.json().catch(() => null))?.error ?? `the shot failed (${r.status})`;
    throw r.status === 422 ? new CantShow(side, why) : new Error(why);
  }
  return createImageBitmap(await r.blob());
}

function pixels(b: ImageBitmap): Pixels {
  const c = new OffscreenCanvas(b.width, b.height);
  const g = c.getContext('2d')!;
  g.drawImage(b, 0, 0);
  return g.getImageData(0, 0, b.width, b.height);
}

/** What differs, drawn: each pixel that does, bright, the rest clear. */
async function layerOf(mask: Uint8Array, w: number, h: number): Promise<string> {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let p = 0; p < mask.length; p++) if (mask[p]) img.data.set([255, 70, 210, 235], p * 4);
  g.putImageData(img, 0, 0);
  return URL.createObjectURL(await c.convertToBlob());
}

/**
 * Shoots the view before (`beforeUrl`) and now (`nowUrl`, twice: what
 * differs between those moves on its own) at `w` by `h`, and compares them.
 */
export async function compareShots(beforeUrl: string, nowUrl: string, w: number, h: number, signal: AbortSignal): Promise<Compared> {
  const [before, now, again] = await Promise.all([shot(beforeUrl, w, h, signal, 'before'), shot(nowUrl, w, h, signal, 'now'), shot(nowUrl, w, h, signal, 'now')]);
  const { mask, ...diff } = compare(pixels(before), pixels(now), pixels(again));
  again.close();
  return { diff, before, now, layer: await layerOf(mask, now.width, now.height) };
}
