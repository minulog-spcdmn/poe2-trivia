// Where a plate's print (lib/platePrint.svelte.ts) draws its svg's viewBox
// onto its pixels: apart from the prints themselves, so the tests can read
// it (tests/printPlacing.test.ts).

/** A layer as drawn: the size of its svg's viewBox (w, h), of its box (CSS px), the device pixels to its CSS px (its zoom, all of it, times the screen's density), and its box in whole device pixels as the browser counts them, which the print is drawn into (but see pixelsOf). */
export type At = { w: number; h: number; cw: number; ch: number; z: number; W: number; H: number };

/** The svg's own placing of its group: its CTM's scale and offset (a, d, e, f), in its box's CSS px. */
export type Ctm = { a: number; d: number; e: number; f: number };

/** Whether the box at its zoom times the density (z) fills the pixels the browser counted for it, to their rounding. */
const agrees = ({ cw, ch, z, W, H }: At) => Math.abs(cw * z - W) <= 1.5 && Math.abs(ch * z - H) <= 1.5;

/**
 * The print's size in pixels: those the browser counted for the box, where
 * the density the page reads agrees with them. Where it doesn't, it's
 * posed or emulated, and the larger of the two counts, so the print is
 * never drawn up: a QA desk frame posing as a sharper screen than yours,
 * and a browser emulating a density (Playwright's deviceScaleFactor, the
 * sweep's, DevTools' device mode), which counts the box's pixels without
 * it but draws the page with it, at twice the pixels on a 2x shot.
 */
export function pixelsOf(at: At): [number, number] {
  const { cw, ch, z, W, H } = at;
  return agrees(at) ? [W, H] : [Math.max(W, Math.round(cw * z)), Math.max(H, Math.round(ch * z))];
}

/**
 * The print's pixels to the box's CSS px, across and down: its zoom times
 * the density (z), which places it as Chrome places the svg, where that
 * agrees with the browser's count. Where it doesn't, its pixels over the
 * box: by z alone, the print was drawn that many times too large or too
 * small for its pixels, its lines and glow off the card round an emblem
 * that was right.
 */
export function scaleOf(at: At): [number, number] {
  if (agrees(at)) return [at.z, at.z];
  const [pw, ph] = pixelsOf(at);
  return [pw / at.cw, ph / at.ch];
}

/**
 * The viewBox onto the print's pixels, as Chrome maps an svg's onto the
 * screen's: scaled to fit its box as laid out (not its whole pixels) and
 * centred in it (preserveAspectRatio's default), from the box's corner on
 * the pixel it's drawn from (read from the paint commands: a stretch to
 * the whole pixels was a third of a pixel out at the foot of a face).
 */
export function placing(at: At): [number, number, number, number] {
  const { w, h, cw, ch } = at;
  const [zx, zy] = scaleOf(at);
  const s = Math.min(cw / w, ch / h);
  return [s * zx, s * zy, ((cw - w * s) / 2) * zx, ((ch - h * s) / 2) * zy];
}

/**
 * The same, from the svg's own CTM (`m`): Chrome fits it to its box at the
 * layout's own precision, which the box's size in CSS px (rounded to
 * 1/64 px) can't give back; its CTM can (to 1/10000 of a pixel at a face's
 * foot, where placing was 3/100 out). Null where the svg has been laid out
 * at another size since `at` was read (its fit a thousandth or more off
 * at's, where they agree to a hundred-thousandth): read as the print is
 * pulled, a frame or a quarter of a second after `at`, a window resized in
 * between had the print drawn at the new size into the old one's pixels,
 * and kept for it. It's pulled once the new size is reported.
 */
export function placedBy(m: Ctm | null, at: At): [number, number, number, number] | null {
  if (!m) return placing(at);
  if (Math.abs(m.a / Math.min(at.cw / at.w, at.ch / at.h) - 1) > 1e-3) return null;
  const [zx, zy] = scaleOf(at);
  return [m.a * zx, m.d * zy, m.e * zx, m.f * zy];
}
