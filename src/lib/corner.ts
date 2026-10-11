/**
 * A computed border radius (`12px`, `50%`, or an elliptical `12px 8px`, read
 * by its first value) in px for a box `w` by `h`: a percentage counts against
 * the box's shorter side.
 */
export function cornerPx(radius: string, w: number, h: number): number {
  const r = parseFloat(radius) || 0;
  return radius.trim().split(/\s+/)[0].endsWith('%') ? (r / 100) * Math.min(w, h) : r;
}

/**
 * A computed border radius on screen, for an element whose box on screen is
 * `w` by `h` and which is drawn at CSS zoom `z` (lib/stage.ts zoomOf): the
 * radius is in its own px, the box on screen.
 */
export function cornerOnScreen(radius: string, w: number, h: number, z: number): number {
  return cornerPx(radius, w / z, h / z) * z;
}
