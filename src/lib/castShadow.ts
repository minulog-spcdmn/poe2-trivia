// The arithmetic of an item picture's drop shadow (lib/artShadow.ts), apart
// from the page so its worker (lib/artShadowWorker.ts) can run it: the
// picture's alpha blurred as CSS blurs a drop-shadow(), into a bitmap that
// lies under the picture, a texel to a CSS px.
//
// A texel to a CSS px, not a device pixel, and still the same to see: the
// blur's standard deviation is 25 px, and a Gaussian that wide holds
// nothing a pixel's sampling can lose; drawn up to the screen's pixels
// (bilinear at the least, as a browser draws an image bigger), it comes within three
// hundredths of an 8-bit level of the blur worked out at three device
// pixels to the px (tests/castShadow.test.ts measures it). At those pixels
// it is nine times the work and the memory, the cost this is here to take
// away.

/** The shadow, as ArtImage's CSS writes it where it can't have this one: drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8)). */
export const SHADOW = { dy: 12, blur: 25, alpha: 0.8 } as const;

/**
 * The three box blurs a Gaussian blur of `sigma` (2 or more) is made of, as
 * the filter spec defines feGaussianBlur and WebKit draws a drop-shadow()'s
 * (its length the standard deviation): each as how far it reaches back
 * from a pixel and how far on. Their size d is ⌊sigma · 3√(2π)/4 + 0.5⌋;
 * an odd d centres all three on the pixel, an even one the first two on its
 * edges either side, and the third, a pixel wider, on it.
 */
export function boxes(sigma: number): [number, number][] {
  const d = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  if (d % 2) {
    const r = (d - 1) / 2;
    return [
      [r, r],
      [r, r],
      [r, r],
    ];
  }
  const r = d / 2;
  return [
    [r, r - 1],
    [r - 1, r],
    [r, r],
  ];
}

/** How far the blur of `sigma` spreads a pixel, px. */
export const reach = (sigma: number) => boxes(sigma).reduce((n, [back, on]) => n + Math.max(back, on), 0);

/** `line` (n long, clear past its ends) blurred by each box in turn, through `sums` (n + 1 long). */
function blurLine(line: Float32Array, n: number, passes: [number, number][], sums: Float64Array) {
  for (const [back, on] of passes) {
    sums[0] = 0;
    for (let i = 0; i < n; i++) sums[i + 1] = sums[i]! + line[i]!;
    const size = back + on + 1;
    for (let i = 0; i < n; i++) line[i] = (sums[Math.min(n, i + on + 1)]! - sums[Math.max(0, i - back)]!) / size;
  }
}

/** `alpha` (w x h, 0 to 1) blurred as a Gaussian blur of `sigma` is drawn (see boxes), in place. */
export function blurAlpha(alpha: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const passes = boxes(sigma);
  const line = new Float32Array(Math.max(w, h));
  const sums = new Float64Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    line.set(alpha.subarray(y * w, (y + 1) * w));
    blurLine(line, w, passes, sums);
    alpha.set(line.subarray(0, w), y * w);
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) line[y] = alpha[y * w + x]!;
    blurLine(line, h, passes, sums);
    for (let y = 0; y < h; y++) alpha[y * w + x] = line[y]!;
  }
  return alpha;
}

/**
 * The shadow of a picture drawn in `rgba` (w x h, with room round it for
 * the blur: castBox), in its place: black, as opaque as SHADOW.alpha times
 * the picture's alpha blurred. The picture is drawn over it, as a
 * drop-shadow() draws it over its shadow, and the shadow lies SHADOW.dy
 * lower (where its <img> is put: ArtImage).
 */
export function shadowOf(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]! / 255;
  blurAlpha(alpha, w, h, SHADOW.blur);
  for (let i = 0; i < alpha.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = Math.round(alpha[i]! * SHADOW.alpha * 255);
  }
  return rgba;
}

/** The shadow's bitmap round a picture `w` x `h` (CSS px): the picture drawn `pad` texels in from its top and left, with room for the blur on every side, `cw` x `ch` texels. */
export function castBox(w: number, h: number) {
  const pad = reach(SHADOW.blur) + 1;
  return { pad, cw: Math.ceil(w + 2 * pad), ch: Math.ceil(h + 2 * pad) };
}

/**
 * The picture's box in a slot `sw` x `sh` (CSS px), for a picture of `w` x
 * `h` art px at most `s` times that, as app.css fits .art-fit (100cqw and
 * 100cqh being the slot's): within the slot, or with `round` (its --round)
 * as big as the circle round its centre holds it, if that's bigger.
 */
export function fitOf(sw: number, sh: number, w: number, h: number, s: number, round?: number) {
  const box = { w: Math.min(sw, (sh * w) / h), h: Math.min(sh, (sw * h) / w) };
  if (round !== undefined) {
    const diag = Math.hypot(w, h);
    box.w = Math.max(box.w, (round * sw * w) / diag);
    box.h = Math.max(box.h, (round * sw * h) / diag);
  }
  return { w: Math.min(box.w, w * s), h: Math.min(box.h, h * s) };
}
