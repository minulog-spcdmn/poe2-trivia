// How large to draw each category card's emblem. The item art comes padded
// by different amounts (and some items are tall, some round), so fitting
// every image into the same box makes some items crowd the card's window
// and others look small. Instead each icon's visible bounds (its pixels
// at least half opaque) are measured once, and the item is scaled to a
// common visual weight, within the window. Until an icon is measured the
// card falls back to fitting the whole image (see ChooseCategory).

/** An icon's fit, in pixels at a tall card's size: the image's drawn size, and the visible part's offset and size in it (with room for its soft edges). */
export type Fit = { iw: number; ih: number; x: number; y: number; w: number; h: number };

/** The visible item's typical size (the geometric mean of its width and height), and the most it may take of the window. */
const WEIGHT = 108;
const MAX_W = 120;
const MAX_H = 118;
/** Room round the visible part for the art's soft edges (pixels under half opaque). */
const PAD = 8;

export const fits = $state<Record<string, Fit>>({});
const pending = new Set<string>();

/** Measures the icon at `url` (same origin), once. */
export function measure(url: string) {
  if (url in fits || pending.has(url)) return;
  pending.add(url);
  const img = new Image();
  img.src = url;
  img
    .decode()
    .then(() => {
      const [iw, ih] = [img.naturalWidth, img.naturalHeight];
      const c = document.createElement('canvas');
      [c.width, c.height] = [iw, ih];
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0);
      const a = g.getImageData(0, 0, iw, ih).data;
      let [x0, y0, x1, y1] = [iw, ih, -1, -1];
      for (let y = 0; y < ih; y++)
        for (let x = 0; x < iw; x++)
          if (a[(y * iw + x) * 4 + 3]! >= 128) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (x1 < 0) return;
      const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
      const k = Math.min(WEIGHT / Math.sqrt(w * h), MAX_W / w, MAX_H / h);
      fits[url] = { iw: iw * k, ih: ih * k, x: x0 * k - PAD, y: y0 * k - PAD, w: w * k + 2 * PAD, h: h * k + 2 * PAD };
    })
    .catch(() => {})
    .finally(() => pending.delete(url));
}

/** The emblem's style for an icon: its fit as custom properties, once measured. */
export function fitStyle(url: string) {
  const f = fits[url];
  if (!f) return '';
  return `--e-iw:${f.iw.toFixed(1)};--e-ih:${f.ih.toFixed(1)};--e-x:${f.x.toFixed(1)};--e-y:${f.y.toFixed(1)};--e-w:${f.w.toFixed(1)};--e-h:${f.h.toFixed(1)}`;
}
