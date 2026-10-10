// This device's own mouse pointer: the engraved dart the other players see
// it as (pointerArt.ts), gold, or in an online game where this device has a seat in
// its player's colour. Drawn once per colour into images the browser shows as
// the system cursor, so it moves with no lag at all.
//
// The CSS never names these images: vite.config.ts turns every
// `cursor: pointer` and `cursor: default` into var(--cursor-pointer, pointer)
// and var(--cursor, default), and this sets those variables on <html>.
// Pages that don't call installCursor keep the system's cursors.

import { PAD_X, PAD_Y, POINTER, SIZE, WEIGHT } from './pointerArt';

/** The circle's old gold (docs/arcane-style.md). */
const GOLD = '#d9a45a';
const INK = '#0a0908';

/** The dart as a PNG at `scale` pixels per CSS px; `lit` (over something that can be clicked) glows brighter. */
function draw(color: string, lit: boolean, scale: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE[0] * scale;
  canvas.height = SIZE[1] * scale;
  const g = canvas.getContext('2d');
  if (!g) return '';
  g.scale(scale, scale);
  g.translate(PAD_X, PAD_Y);
  const outline = new Path2D(POINTER.outline);
  const lines = (d: string, w: number) => {
    g.lineWidth = w;
    g.stroke(new Path2D(d));
  };
  g.lineJoin = 'miter';
  g.miterLimit = 12;
  // A dark rim and ground, so it reads on gold as well as on black.
  g.fillStyle = 'rgba(10, 9, 8, 0.9)';
  g.fill(outline);
  g.strokeStyle = INK;
  lines(POINTER.outline, WEIGHT.rim);
  // The glow under the lines, never on them.
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = lit ? 0.45 : 0.22;
  g.shadowColor = color;
  g.shadowBlur = (lit ? 4 : 2) * scale;
  lines(POINTER.outline, lit ? 2.6 : 2);
  g.restore();
  if (lit) {
    g.fillStyle = color;
    g.globalAlpha = 0.18;
    g.fill(outline);
    g.globalAlpha = 1;
  }
  g.strokeStyle = color;
  lines(POINTER.outline, WEIGHT.outline);
  lines(POINTER.ridge, WEIGHT.ridge);
  g.lineCap = 'round';
  g.globalAlpha = 0.85;
  lines(POINTER.hatch, WEIGHT.hatch);
  return canvas.toDataURL('image/png');
}

/** How this browser takes a cursor at two resolutions, if it does. */
let imageSet: string | null | undefined;
function setSyntax() {
  if (imageSet !== undefined) return imageSet;
  const probe = (fn: string) => CSS.supports('cursor', `${fn}(url("data:,") 1x) 1 1, auto`);
  imageSet = probe('image-set') ? 'image-set' : probe('-webkit-image-set') ? '-webkit-image-set' : null;
  return imageSet;
}

function cursorValue(color: string, lit: boolean, fallback: string) {
  const sharp = setSyntax();
  const one = draw(color, lit, 1);
  if (!one) return fallback;
  return sharp
    ? `${sharp}(url("${one}") 1x, url("${draw(color, lit, 2)}") 2x) ${PAD_X} ${PAD_Y}, ${fallback}`
    : `url("${one}") ${PAD_X} ${PAD_Y}, ${fallback}`;
}

const made = new Map<string, [string, string]>();
let shown = '';

/** Shows the arrow in `color` from now on (gold when none). */
export function setCursorColor(color: string = GOLD) {
  if (color === shown || typeof document === 'undefined') return;
  shown = color;
  let v = made.get(color);
  if (!v) made.set(color, (v = [cursorValue(color, false, 'default'), cursorValue(color, true, 'pointer')]));
  const root = document.documentElement.style;
  root.setProperty('--cursor', v[0]);
  root.setProperty('--cursor-pointer', v[1]);
}

/** The app's pages: the gold arrow, until a seat in an online game colours it. */
export const installCursor = () => setCursorColor();
