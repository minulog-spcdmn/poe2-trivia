// How large to draw each category card's emblem. The item art comes padded
// by different amounts (and some items are tall, some round), so fitting
// every image into the same box makes some items crowd the card's window
// and others look small. Instead each icon's visible bounds (its pixels
// at least half opaque) are measured, and the item is scaled to a common
// visual weight, within the window. The measures are baked into
// src/data/iconFits.json (npm run bake-icons), so every card is laid out
// from its first frame; an icon missing there (the data changed which item
// stands for a category) is measured on the page, and until then the card
// falls back to fitting the whole image (see ChooseCategory).
//
// The art also carries a faint baked-in shadow, which a mask would turn
// into a haze of gold and a drop shadow into a dark disc. So each icon gets
// a clean mask too, baked with its fit (public/icons/masks/): the haze
// (nearly all of it under 72 of 255) taken out, and the edges' softer
// pixels made fainter so they stay smooth. One not baked is made on the
// page. (An SVG filter could do this on the page, but WebKit draws SVG
// filters on HTML as a box round the element.)

import baked from '../data/iconFits.json' with { type: 'json' };
import { absoluteUrl } from './ui-paths';

/** An icon's fit, in pixels at a tall card's size: the image's drawn size, and the visible part's offset and size in it (with room for its soft edges). */
export type Fit = { iw: number; ih: number; x: number; y: number; w: number; h: number };

/**
 * The visible item's typical size (the geometric mean of its width and
 * height), the most ink it may carry (its filled area, so a solid ring or
 * pendant comes out smaller than a spindly bow of the same bounds), and the
 * most it may take of the window.
 */
export const WEIGHT = 108;
const INK = 5200;
export const MAX_W = 120;
export const MAX_H = 118;
/** Room round the visible part for the art's soft edges (pixels under half opaque). */
export const PAD = 8;
/** The clean mask's edge: pixels less opaque than this go, more opaque than that stay whole, those between ramp up. */
const EDGE = [72, 216] as const;

/** An icon's fit from its pixels (RGBA, iw × ih), to a tenth of a pixel; null when none are visible. */
export function fitOf(rgba: Uint8ClampedArray, iw: number, ih: number): Fit | null {
  let [x0, y0, x1, y1] = [iw, ih, -1, -1];
  let ink = 0;
  for (let y = 0; y < ih; y++)
    for (let x = 0; x < iw; x++)
      if (rgba[(y * iw + x) * 4 + 3]! >= 128) {
        ink++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
  const k = Math.min(WEIGHT / Math.sqrt(w * h), Math.sqrt(INK / ink), MAX_W / w, MAX_H / h);
  const tenth = (v: number) => Math.round(v * 10) / 10;
  return { iw: tenth(iw * k), ih: tenth(ih * k), x: tenth(x0 * k - PAD), y: tenth(y0 * k - PAD), w: tenth(w * k + 2 * PAD), h: tenth(h * k + 2 * PAD) };
}

/** The image at `url` (same origin), decoded and drawn on a canvas of its own size: the canvas, its context and its pixels (RGBA); null without a 2D context. */
export async function pixelsOf(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const [iw, ih] = [img.naturalWidth, img.naturalHeight];
  const c = document.createElement('canvas');
  [c.width, c.height] = [iw, ih];
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  return { c, g, iw, ih, rgba: g.getImageData(0, 0, iw, ih).data };
}

/** An icon's pixels (from pixelsOf) made its clean mask, on its own canvas: white, as opaque as the item and no more. */
export function cleanMask({ c, g, iw, ih, rgba }: NonNullable<Awaited<ReturnType<typeof pixelsOf>>>) {
  const clean = g.createImageData(iw, ih);
  for (let i = 0; i < rgba.length; i += 4) {
    const t = Math.min(1, Math.max(0, (rgba[i + 3]! - EDGE[0]) / (EDGE[1] - EDGE[0])));
    clean.data.fill(255, i, i + 3);
    clean.data[i + 3] = Math.round(t * 255);
  }
  g.putImageData(clean, 0, 0);
  return c;
}

/** A baked icon (src/data/iconFits.json, by its path from the site's base): its fit, and its clean mask's path. */
type Baked = Fit & { mask?: string };
/** Where the baked icons' paths are from (the site's base). */
const BASE = absoluteUrl('');
const BAKED = Object.entries(baked as Record<string, Baked>).map(([path, f]) => [new URL(path, BASE).href, f] as const);
/** Each icon's fit, by its absolute URL: baked, or measured here. */
export const fits = $state<Record<string, Fit>>(Object.fromEntries(BAKED));
/** Each icon's clean mask: baked, or made here. */
const masks = $state<Record<string, string>>(Object.fromEntries(BAKED.flatMap(([url, f]) => (f.mask ? [[url, new URL(f.mask, BASE).href]] : []))));
const pending = new Set<string>();
/** Baked masks already fetched ahead. */
const fetched = new Set<string>();

/**
 * Readies the icon at `url` (same origin), once: a baked one's mask is
 * fetched ahead; one not baked is measured and made its clean mask here.
 */
export function measure(url: string) {
  if (url in masks) {
    if (!fetched.has(url)) new Image().src = masks[url]!;
    fetched.add(url);
    return;
  }
  if (pending.has(url)) return;
  pending.add(url);
  pixelsOf(url)
    .then((p) => {
      if (!p) return;
      if (!(url in fits)) {
        const fit = fitOf(p.rgba, p.iw, p.ih);
        if (!fit) return;
        fits[url] = fit;
      }
      if (import.meta.env.DEV) console.warn(`iconFit: ${url.slice(BASE.length)} isn't baked; run npm run bake-icons`);
      return new Promise<void>((done) =>
        cleanMask(p).toBlob((blob) => {
          if (blob) masks[url] = URL.createObjectURL(blob);
          done();
        }),
      );
    })
    .catch(() => {})
    .finally(() => pending.delete(url));
}

/** The mask to draw an icon with: its clean one (baked, or once made), else the image itself. */
export function maskOf(url: string) {
  return masks[url] ?? url;
}

/** The emblem's style for an icon, `k` times the common size and moved `up` and `left`: its fit as custom properties, once measured. */
export function fitStyle(url: string, { k = 1, up = 0, left = 0 } = {}) {
  const f = fits[url];
  if (!f) return '';
  return `--e-kin:${k};--e-up:${up};--e-left:${left};--e-iw:${f.iw.toFixed(1)};--e-ih:${f.ih.toFixed(1)};--e-x:${f.x.toFixed(1)};--e-y:${f.y.toFixed(1)};--e-w:${f.w.toFixed(1)};--e-h:${f.h.toFixed(1)}`;
}
