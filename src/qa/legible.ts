// How well a run of text reads: its contrast with what's behind it as
// APCA's Lc (the contrast measure built for how type reads on screens,
// apcacontrast.com), against what its size and face need. The QA desk's
// frames check every run against the page's own dark (checks.ts), the
// sweep's --faint against what's actually behind it in its shot.

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

/**
 * Each face's lower case as a share of its size (Cinzel's small capitals),
 * against the 0.52 of the Helvetica APCA's sizes are read in: a face with a
 * smaller lower case reads as a smaller size than it's set at. The text font
 * (app.css) is Manuale upright and Andada Pro's italic, set to the same
 * height and drawn smaller than set (0.49 at 93%, 0.51 at 89%); EB
 * Garamond, behind it for other scripts, stands at 0.41.
 */
const X_HEIGHT: Record<string, number> = {
  'Manuale Andada': 0.45,
  'EB Garamond': 0.41,
  Cinzel: 0.6,
  Maragsa: 0.5,
  'Maragsa Title': 0.5,
  'Fontin SmallCaps': 0.54,
  Fontin: 0.51,
};

/** A run's size as it reads, in Helvetica's px. */
export const readingSize = ({ size, font }: { size: number; font: string }) => (size * (X_HEIGHT[font] ?? 0.52)) / 0.52;

/** Faces whose lower case is drawn as small capitals. */
export const CAPS_FACES = new Set(['Cinzel', 'Fontin SmallCaps']);

/**
 * The least Lc a run of text needs: by the size it reads at, its weight, and
 * whether it's set in capitals (`caps`: uppercased, a small-caps face, or no
 * lower case in it), which a reader takes in by their outline a step sooner
 * than lower case (the gold small-caps labels read at Lc 55). Small lower
 * case has to be bright to read at all: the text font under about 13px needs
 * all but the body's own colour.
 */
export function needs(run: { size: number; weight: number; font: string; caps?: boolean; rgb?: RGB }): number {
  const size = readingSize(run);
  // APCA weighs lightness alone; a strong hue (gold, the unique orange) stands off a dark grey ground by its colour too, worth about 5 (Helmholtz-Kohlrausch).
  const hue = run.rgb && Math.max(...run.rgb) - Math.min(...run.rgb) > 50 ? 5 : 0;
  if (size >= 24 || (size >= 18 && run.weight >= 600)) return 45;
  // (A bold weight reads a step sooner than its size's own row, never more: small and bold still needs more than 16px does.)
  const bold = run.weight >= 600;
  if (run.caps || size >= 16 || (bold && size >= 11.5)) return 55 - hue;
  if (size >= 11.5 || bold) return 60 - hue;
  return 75 - hue;
}
