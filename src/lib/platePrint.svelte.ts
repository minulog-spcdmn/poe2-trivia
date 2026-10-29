// Prints of the category cards' engraved plates (lib/cardEngraving): each
// still layer of a side (its glow, its lines) drawn once into an image, at
// the size it's drawn at, and shown in place of its svg (CardEngraving).
//
// Chrome draws a card's svg strokes on the GPU process's main thread, and as
// wide as the card they are, its software path renderer makes a mask on the
// CPU for each path in each tile and uploads it: 25 to 37 ms for the first
// face of every hand dealt, at 4K, and so a dropped frame or two. A print is
// made in a worker (platePrintWorker.ts), on the CPU, once for each plate and
// size, kept for the visit, and drawn as an image. It is drawn pixel for
// pixel, as large as the screen's pixels the layer covers, which is what
// keeps it as sharp as the strokes: only where Chrome rasters the card at
// its laid-out size whatever its transform, a sharp face (or a back) under
// its 3D transform (ChooseCategory). Elsewhere, and until its print is
// ready, a layer stays its svg, which the print is drawn from: its paths,
// as they're styled, and its masks.

import type { Engraved, Fade } from './cardEngraving';

/** The layers of a side that are printed: the still ones. */
export type Layer = 'glow' | 'lines';
/** A layer as drawn: the size of its svg's viewBox (w, h), of its box (CSS px), the device pixels to its CSS px (its zoom, all of it, times the screen's density), and its box in whole device pixels, where the print is drawn. */
export type At = { w: number; h: number; cw: number; ch: number; z: number; W: number; H: number };

/** A path of the layer, as its svg draws it: its paint, stroke and opacity; faded (its mask, the glory's); the motif's (drawn over the plate, not stopping short of it). */
export type PrintPath = {
  d: string;
  fill: string | null;
  stroke: string | null;
  width: number;
  opacity: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  miter: number;
  fade?: boolean;
  motif?: boolean;
};
/** A print to pull: its size (device px), the viewBox's (w, h), the viewBox onto its pixels (sx, sy, tx, ty), its paths, the fade, and the motif's shapes the plate's lines stop short of. */
export type PrintJob = {
  id: number;
  size: [number, number];
  view: [number, number];
  at: [number, number, number, number];
  paths: PrintPath[];
  fade: Fade | null;
  knockout: string[];
};
/** The print, as a PNG; nothing if it couldn't be pulled there. */
export type PrintAnswer = { id: number; png?: Blob };

/** Whether the cards' plates are printed: always, but on the card bench, which can show them as live strokes to compare. */
export const printing = $state({ on: true });

/**
 * The viewBox onto the print's pixels, as Chrome maps an svg's onto the
 * screen's: scaled to fit its box as laid out (not its whole pixels) and
 * centred in it (preserveAspectRatio's default), from the box's corner on
 * the pixel it's drawn from (read from the paint commands: a stretch to
 * the whole pixels was a third of a pixel out at the foot of a face).
 */
export function placing({ w, h, cw, ch, z }: At): [number, number, number, number] {
  const s = Math.min(cw / w, ch / h) * z;
  return [s, s, (cw * z - w * s) / 2, (ch * z - h * s) / 2];
}

/**
 * The same, read from the svg itself: Chrome fits it to its box at the
 * layout's own precision, which the box's size in CSS px (rounded to
 * 1/64 px) can't give back; its group's CTM can (to 1/10000 of a pixel at
 * a face's foot, where placing was 3/100 out).
 */
function placed(svg: SVGSVGElement, at: At): [number, number, number, number] {
  const m = svg.querySelector('g')?.getCTM();
  return m ? [m.a * at.z, m.d * at.z, m.e * at.z, m.f * at.z] : placing(at);
}

// ---- the worker ----------------------------------------------------------------

let worker: Worker | null | undefined;
let lastJob = 0;
/** What each job sent to the worker does with its answer. */
const answers = new Map<number, (png: Blob | null) => void>();

/** The worker the prints are pulled in; null where there's none. */
function printWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const w = new Worker(new URL('./platePrintWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<PrintAnswer>) => {
      answers.get(data.id)?.(data.png ?? null);
      answers.delete(data.id);
    };
    // (Failed to load, say: what it was doing comes back undone, and the cards keep their svgs.)
    w.onerror = () => {
      w.terminate();
      worker = null;
      for (const done of answers.values()) done(null);
      answers.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function ask(job: Omit<PrintJob, 'id'>): Promise<Blob | null> {
  const w = printWorker();
  if (!w) return Promise.resolve(null);
  const id = ++lastJob;
  return new Promise((done) => {
    answers.set(id, done);
    w.postMessage({ ...job, id });
  });
}

// ---- the prints ------------------------------------------------------------------

/** A print: its URL once it's pulled and decoded (null if it couldn't be), and the image that keeps it decoded. */
type Print = { url?: string | null; made: Promise<string | null>; img?: HTMLImageElement };
/** By plate (engrave keeps one per side, size and variant), then layer, size and ink. */
const prints = new WeakMap<Engraved, Map<string, Print>>();
/** Sizes kept per plate: a few, as a window is resized; the oldest let go. */
const KEEP = 4;

const keyOf = (layer: Layer, at: At, ink: string) => `${layer} ${at.W}x${at.H} ${at.cw}x${at.ch} ${at.z} ${ink}`;

/** The layer's print at this size and ink, if it's been pulled: its URL, ready to show. */
export function pulled(plate: Engraved, layer: Layer, at: At, ink: string): string | null {
  return prints.get(plate)?.get(keyOf(layer, at, ink))?.url ?? null;
}

/** Pulls the layer's print from its svg as it's drawn (`svg`), unless it's been pulled already: its URL once it's ready to show. */
export function pull(plate: Engraved, layer: Layer, at: At, ink: string, svg: SVGSVGElement): Promise<string | null> {
  const key = keyOf(layer, at, ink);
  let kept = prints.get(plate);
  if (!kept) prints.set(plate, (kept = new Map()));
  const was = kept.get(key);
  if (was) return was.made;
  const print: Print = { made: Promise.resolve(null) };
  print.made = ask({ size: [at.W, at.H], view: [at.w, at.h], at: placed(svg, at), paths: pathsOf(svg), fade: plate.fade, knockout: plate.knockout?.split(/(?<=Z)(?=M)/) ?? [] })
    .then(async (png) => {
      if (!png) return null;
      const url = URL.createObjectURL(png);
      const img = new Image();
      img.src = url;
      await img.decode();
      print.img = img;
      return url;
    })
    .catch(() => null)
    .then((url) => (print.url = url));
  if (kept.size >= KEEP * 2) {
    const [oldest, gone] = kept.entries().next().value!;
    kept.delete(oldest);
    void gone.made.then((url) => url && URL.revokeObjectURL(url));
  }
  kept.set(key, print);
  return print.made;
}

/** The svg's paths in its order, each as it's styled: the plate's own (in its group, under the knockout's mask), then the motif's. */
function pathsOf(svg: SVGSVGElement): PrintPath[] {
  const out: PrintPath[] = [];
  const add = (p: SVGPathElement, motif: boolean) => {
    const cs = getComputedStyle(p);
    const paint = (v: string) => (v === 'none' ? null : v);
    const path: PrintPath = {
      d: p.getAttribute('d') ?? '',
      fill: paint(cs.fill),
      stroke: paint(cs.stroke),
      width: parseFloat(cs.strokeWidth) || 0,
      opacity: parseFloat(cs.opacity),
      cap: cs.strokeLinecap as CanvasLineCap,
      join: cs.strokeLinejoin as CanvasLineJoin,
      miter: parseFloat(cs.strokeMiterlimit) || 4,
    };
    if (p.hasAttribute('mask')) path.fade = true;
    if (motif) path.motif = true;
    out.push(path);
  };
  for (const el of svg.children) {
    if (el instanceof SVGGElement) for (const p of el.querySelectorAll('path')) add(p, false);
    else if (el instanceof SVGPathElement) add(el, true);
  }
  return out;
}
