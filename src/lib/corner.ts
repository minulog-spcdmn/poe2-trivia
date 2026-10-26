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

/**
 * The outer ring a computed box-shadow draws round its box, in px (0 with
 * none): the widest of its shadows that is all spread, with no offset or blur
 * (`0 0 0 1px`, a toast's dark line round its border). Inset shadows draw
 * inside the box and don't count.
 */
export function ringOf(shadow: string): number {
  let ring = 0;
  // (Its colours are read without their commas and numbers: `rgba(0, 0, 0, 0.65) 0px 0px 0px 1px, …`.)
  for (const one of shadow.replace(/[a-z-]+\([^)]*\)/gi, '').split(',')) {
    if (/\binset\b/i.test(one)) continue;
    const [x, y, blur, spread] = (one.match(/-?[\d.]+(?:e[-+]?\d+)?px/gi) ?? []).map(parseFloat);
    if (x === 0 && y === 0 && !blur && spread > ring) ring = spread;
  }
  return ring;
}
