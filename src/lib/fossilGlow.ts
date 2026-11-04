// The light a kept fossil gives off in the codex (codex/DelveFossils): cast
// by its own shape, as the backdrop's drop shadows are (backdropDropShadow.ts,
// which takes only a few elements at once, too few for the set's 25). The
// art's alpha is blurred twice in floating point, a tight light and a wide
// one, and coloured as the card's amber lights (app.css, --fossil-*): the
// nearer one the light's warm middle, the wider one falling to the edge's
// ember, so the light cools as it leaves the stone, as lamplight through
// amber does. Rounded to 8 bits with a triangular dither, or its fall-off bands.
// Made once per fossil and size, kept as an object URL.

import { fossilArt, type FossilId } from './fossils';

/** The art's side (px) the glow is made from, and the room round it for the light to spread into. */
export const GLOW_ART = 128;
export const GLOW_PAD = 64;

/** Each light: its colour (sRGB 0-1), its strength, and its spread (px of the art). */
type Light = { c: [number, number, number]; a: number; sigma: number };
const LIGHTS: Record<'common' | 'rare', Light[]> = {
  // --fossil-mid over --fossil-edge: no tight band round the stone (that reads as an outline), only light spread over the floor.
  common: [
    { c: [1, 0.67, 0.17], a: 0.3, sigma: 14 },
    { c: [0.93, 0.42, 0.06], a: 0.26, sigma: 28 },
  ],
  // --fossil-rare-mid over --fossil-rare-edge, a little stronger.
  rare: [
    { c: [0.95, 0.49, 0.11], a: 0.36, sigma: 15 },
    { c: [0.78, 0.19, 0.05], a: 0.32, sigma: 30 },
  ],
};

const made = new Map<string, Promise<string>>();

/** The glow's image (an object URL), for the art drawn GLOW_ART across with GLOW_PAD round it. */
export function fossilGlow(id: FossilId, rare: boolean): Promise<string> {
  const key = `${id}:${rare ? 1 : 0}`;
  let p = made.get(key);
  if (!p) {
    p = make(id, rare);
    made.set(key, p);
  }
  return p;
}

async function make(id: FossilId, rare: boolean): Promise<string> {
  const img = new Image();
  img.decoding = 'async';
  img.src = fossilArt(id, GLOW_ART);
  await img.decode();
  const side = GLOW_ART + 2 * GLOW_PAD;
  const cv = document.createElement('canvas');
  cv.width = cv.height = side;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  // As object-fit: contain lays it in its square.
  const k = GLOW_ART / Math.max(img.naturalWidth, img.naturalHeight);
  const [w, h] = [img.naturalWidth * k, img.naturalHeight * k];
  cx.drawImage(img, GLOW_PAD + (GLOW_ART - w) / 2, GLOW_PAD + (GLOW_ART - h) / 2, w, h);
  const px = cx.getImageData(0, 0, side, side);
  const alpha = new Float32Array(side * side);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px.data[i * 4 + 3] / 255;

  const lights = LIGHTS[rare ? 'rare' : 'common'].map((l) => ({ ...l, m: blur(alpha, side, l.sigma) }));
  const out = px.data;
  for (let i = 0; i < alpha.length; i++) {
    // Each light over the next, premultiplied ("over", the tight one on top).
    let [r, g, b, a] = [0, 0, 0, 0];
    for (let j = lights.length - 1; j >= 0; j--) {
      const l = lights[j];
      const la = Math.min(1, l.m[i] * l.a);
      r = l.c[0] * la + r * (1 - la);
      g = l.c[1] * la + g * (1 - la);
      b = l.c[2] * la + b * (1 - la);
      a = la + a * (1 - la);
    }
    const o = i * 4;
    if (a < 1e-4) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      continue;
    }
    // Triangular, 2 levels wide: drawn smaller than it's made, the browser's resampling averages some of it away.
    const n = () => (Math.random() - Math.random()) * 2;
    out[o] = round((r / a) * 255 + n());
    out[o + 1] = round((g / a) * 255 + n());
    out[o + 2] = round((b / a) * 255 + n());
    out[o + 3] = round(a * 255 + n());
  }
  cx.putImageData(px, 0, 0);
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
  return blob ? URL.createObjectURL(blob) : '';
}

const round = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** A Gaussian of `sigma` px, as three box blurs each way, in floating point. */
function blur(src: Float32Array, side: number, sigma: number): Float32Array {
  const boxes = boxesFor(sigma);
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (const r of boxes) {
    boxH(a, b, side, r);
    boxV(b, a, side, r);
  }
  return a;
}

/** Three box radii whose passes make a Gaussian of `sigma` (Kovesi). */
function boxesFor(sigma: number): number[] {
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}

function boxH(src: Float32Array, dst: Float32Array, side: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < side; y++) {
    const row = y * side;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(side - 1, Math.max(0, x))];
    for (let x = 0; x < side; x++) {
      dst[row + x] = acc * k;
      acc += src[row + Math.min(side - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, side: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < side; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[Math.min(side - 1, Math.max(0, y)) * side + x];
    for (let y = 0; y < side; y++) {
      dst[y * side + x] = acc * k;
      acc += src[Math.min(side - 1, y + r + 1) * side + x] - src[Math.max(0, y - r) * side + x];
    }
  }
}
