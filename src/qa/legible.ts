// How well a run of text reads: its contrast with what's behind it as
// APCA's Lc (the contrast measure built for how type reads on screens,
// apcacontrast.com), against the game's floor: no text dimmer than its
// dimmest grey, --muted, on the page's own dark. The game's notes run a step
// or two brighter where they're read; a label, a date or an aside may sit at
// --muted, and nothing under it. The QA desk's frames check every run against
// the page's own dark (checks.ts), the sweep's --faint against what's
// actually behind it in its shot.

export type RGB = [number, number, number];

/** The page's own dark (app.css --bg), behind text where nothing else is. */
export const PAGE: RGB = [10, 9, 8];

/** APCA's screen luminance of an sRGB colour (0 to 255), soft-clamped near black. */
export function luminance([r, g, b]: RGB): number {
  const y = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
}

/** APCA (0.0.98G) Lc of text on a background, as a magnitude: 0 to about 106. */
export function lc(text: RGB, bg: RGB): number {
  const t = luminance(text);
  const b = luminance(bg);
  if (Math.abs(b - t) < 0.0005) return 0;
  if (b > t) {
    const s = (b ** 0.56 - t ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (b ** 0.65 - t ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (-s - 0.027) * 100;
}

/** A colour laid over a background at its alpha: what reaches the screen. */
export const over = ([r, g, b, a]: [number, number, number, number], bg: RGB): RGB => [
  r * a + bg[0] * (1 - a),
  g * a + bg[1] * (1 - a),
  b * a + bg[2] * (1 - a),
];

/** app.css --muted, the dimmest grey the game sets text in (tests/legible.test.ts holds the two the same). */
export const MUTED: RGB = [0x96, 0x8a, 0x77];

/** The least Lc a run of text needs: --muted's on the page's own dark (about 40). */
export const FLOOR = lc(MUTED, PAGE);
