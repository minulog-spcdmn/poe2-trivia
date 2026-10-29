// Prints of the category cards' engraved plates (lib/cardEngraving): each
// still layer of a side (its glow, its lines) drawn once into an image, at
// the size it's drawn at, and shown in place of its svg (CardEngraving),
// which keeps only the lines' hairlines, cheap for Chrome to draw (pathsOf).
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
// as they're styled, and its masks. A dealt card lies unseen at first (it
// fades in late, its face turns up later still), and its svgs aren't drawn
// meanwhile (CardEngraving's hold): a plate printed for the first time is
// never drawn as strokes at all, unless its prints are late.

import type { Engraved, Fade } from './cardEngraving';
import { whenIdle } from './idle';

/** The layers of a side that are printed: the still ones. */
export type Layer = 'glow' | 'lines';
/** A layer's print as shown: its URL ('' if it left every path to the svg), and the paths it leaves to its svg (leftKey). */
export type Shown = { url: string; left: Set<string> };
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

let workers: Worker[] | null | undefined;
let lastJob = 0;
/** What each job sent to a worker does with its answer. */
const answers = new Map<number, (png: Blob | null) => void>();
/** How many jobs each worker has in hand. */
const jobs = new Map<Worker, number>();

/**
 * The workers the prints are pulled in (null where there are none): a few,
 * as a plate seen for the first time is four prints (each side's glow and
 * lines) of 40 to 70 ms each at 4K, wanted before its card is first seen.
 */
function printWorkers(): Worker[] | null {
  if (workers !== undefined) return workers;
  workers = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  const all: Worker[] = [];
  // (Failed to load, say: what they were doing comes back undone, and the cards keep their svgs.)
  const fail = () => {
    for (const w of all) w.terminate();
    workers = null;
    for (const done of answers.values()) done(null);
    answers.clear();
  };
  try {
    for (let n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); n > 0; n--) {
      const w = new Worker(new URL('./platePrintWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }: MessageEvent<PrintAnswer>) => {
        jobs.set(w, jobs.get(w)! - 1);
        answers.get(data.id)?.(data.png ?? null);
        answers.delete(data.id);
      };
      w.onerror = fail;
      jobs.set(w, 0);
      all.push(w);
    }
    workers = all;
  } catch {
    fail();
  }
  return workers;
}

/** Starts the workers in an idle moment, ahead of the first prints wanted: a first hand's don't wait for them to start. */
export function warmPrints() {
  whenIdle(() => void printWorkers(), { timeout: 10_000 });
}

function ask(job: Omit<PrintJob, 'id'>): Promise<Blob | null> {
  const all = printWorkers();
  if (!all) return Promise.resolve(null);
  // The one with the fewest jobs in hand.
  const w = all.reduce((a, b) => (jobs.get(b)! < jobs.get(a)! ? b : a));
  const id = ++lastJob;
  return new Promise((done) => {
    answers.set(id, done);
    jobs.set(w, jobs.get(w)! + 1);
    w.postMessage({ ...job, id });
  });
}

// ---- the prints ------------------------------------------------------------------

/** A print: its URL once it's pulled and decoded (null if it couldn't be, '' if there was nothing to print), the paths it leaves to the svg, and the image that keeps it decoded. */
type Print = { url?: string | null; left: Set<string>; made: Promise<string | null>; img?: HTMLImageElement };
/** By plate (engrave keeps one per side, size and variant), then layer, size and ink. */
const prints = new WeakMap<Engraved, Map<string, Print>>();
/** Sizes kept per plate: a few, as a window is resized; the oldest let go. */
const KEEP = 4;

const keyOf = (layer: Layer, at: At, ink: string) => `${layer} ${at.W}x${at.H} ${at.cw}x${at.ch} ${at.z} ${ink}`;

/** The layer's print at this size and ink, if it's been pulled: ready to show. */
export function pulled(plate: Engraved, layer: Layer, at: At, ink: string): Shown | null {
  const print = prints.get(plate)?.get(keyOf(layer, at, ink));
  return typeof print?.url === 'string' ? { url: print.url, left: print.left } : null;
}

/**
 * What a path of a layer is known by among those its print leaves to the
 * svg: its class, and whether it's the motif's (which may share a class
 * with the plate's own).
 */
export const leftKey = (cls: string, motif: boolean) => (motif ? `motif ${cls}` : cls);

/** Pulls the layer's print from its svg as it's drawn (`svg`), unless it's been pulled already: its URL once it's ready to show (as `Shown`'s), null if it couldn't be. */
export function pull(plate: Engraved, layer: Layer, at: At, ink: string, svg: SVGSVGElement): Promise<string | null> {
  const key = keyOf(layer, at, ink);
  let kept = prints.get(plate);
  if (!kept) prints.set(plate, (kept = new Map()));
  const was = kept.get(key);
  if (was) return was.made;
  const place = placed(svg, at);
  // (Only the lines' hairlines: the glow's strokes are wider than a pixel at any density, and it breathes, which an image and an svg apart would do out of step.)
  const { paths, left } = pathsOf(svg, layer === 'lines' ? Math.min(place[0], place[1]) : 0);
  const print: Print = { left, made: Promise.resolve(null) };
  print.made = (paths.length ? ask({ size: [at.W, at.H], view: [at.w, at.h], at: place, paths, fade: plate.fade, knockout: plate.knockout?.split(/(?<=Z)(?=M)/) ?? [] }) : Promise.resolve(null))
    .then(async (png) => {
      if (!png) return paths.length ? null : '';
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

/**
 * The svg's paths in its order, each as it's styled: the plate's own (in its
 * group, under the knockout's mask), then the motif's. But for its
 * hairlines, at `scale` (device px to its units; 0 for none): strokes under
 * a device pixel wide, which Chrome draws on the GPU as hairlines, cheaply,
 * and a canvas a shade dimmer; those are left to the svg (`left`, by
 * leftKey), so the print and they look as the strokes did. (They're all in
 * one ink, so drawn apart they come out as drawn together.)
 */
function pathsOf(svg: SVGSVGElement, scale: number): { paths: PrintPath[]; left: Set<string> } {
  const out: PrintPath[] = [];
  const left = new Set<string>();
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
    if (scale && !path.fill && path.stroke && path.width * scale <= 1) return void left.add(leftKey(p.classList[0] ?? '', motif));
    if (p.hasAttribute('mask')) path.fade = true;
    if (motif) path.motif = true;
    out.push(path);
  };
  for (const el of svg.children) {
    if (el instanceof SVGGElement) for (const p of el.querySelectorAll('path')) add(p, false);
    else if (el instanceof SVGPathElement) add(el, true);
  }
  return { paths: out, left };
}
