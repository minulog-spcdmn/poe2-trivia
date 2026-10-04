/**
 * A computed border radius (`12px`, `50%`, or an elliptical `12px 8px`, read
 * by its first value) in px for a box `w` by `h`: a percentage counts against
 * the box's shorter side.
 */
export function cornerPx(radius: string, w: number, h: number): number {
  const r = parseFloat(radius) || 0;
  return radius.trim().split(/\s+/)[0].endsWith('%') ? (r / 100) * Math.min(w, h) : r;
}
