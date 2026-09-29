// Soft outer box-shadows drawn by the WebGL backdrop instead of CSS.
//
// Big, soft CSS shadows band (the browser rasterizes them at 8 bits, with no
// dither) and stop short at the blur radius. For elements that sit directly on
// the backdrop, the backdrop can draw them itself: dithered, with a true
// Gaussian falloff. Tag such an element with `use:backdropShadow`.
//
// The element declares up to two soft shadows in the registered properties
// --bs1 / --bs2 (y offset and blur) and --bs1-color / --bs2-color, and paints
// them through `var(--bs-soft-paint, …)` (see app.css). Being registered, they
// transition and animate like box-shadow would, and every frame the renderer
// reads their current computed values. While it draws an element it sets
// `data-bs-on`, which swaps just those soft shadows for a no-op; crisp rings
// and inset shadows stay in CSS, and nothing is clipped. Whenever it can't
// draw an element faithfully (rotated or 3D-transformed, over budget, no
// WebGL) it leaves the attribute off and CSS paints as usual.

const shadowed = new Set<HTMLElement>();

/** Svelte action: let the backdrop draw this element's blurred outer shadows. */
export function backdropShadow(node: HTMLElement) {
  shadowed.add(node);
  return {
    destroy() {
      shadowed.delete(node);
      release(node);
    },
  };
}

export const MAX_ELEMENTS = 8;
export const SHADOWS_PER_ELEMENT = 2;

type Shadow = { color: number[]; oy: number; blur: number };

/** Parses a computed colour (`rgb()`, `rgba()` or `color(srgb …)`) to 0-1 RGBA. */
function parseColor(css: string): number[] | null {
  const nums = (css.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(parseFloat);
  const [r = 0, g = 0, b = 0, a = 1] = nums;
  if (css.startsWith('color(srgb')) return [r, g, b, a];
  if (css.startsWith('rgb')) return [r / 255, g / 255, b / 255, a];
  return null;
}

/** Reads soft shadow `n` from the element's --bsN / --bsN-color. */
function readShadow(cs: CSSStyleDeclaration, n: number): Shadow | null {
  const color = parseColor(cs.getPropertyValue(`--bs${n}-color`).trim());
  if (!color || color[3] <= 0) return null;
  const [oy = 0, blur = 0] = (cs.getPropertyValue(`--bs${n}`).match(/-?[\d.]+(?:e-?\d+)?px/g) ?? []).map(parseFloat);
  return blur > 0 ? { color, oy, blur } : null;
}

function release(node: HTMLElement) {
  node.removeAttribute('data-bs-on');
}

/** Releases every element back to CSS, e.g. when the renderer stops. */
export function releaseAll() {
  for (const node of shadowed) release(node);
}

function effectiveOpacity(node: HTMLElement): number {
  let o = 1;
  for (let el: HTMLElement | null = node; el && el !== document.body; el = el.parentElement) {
    o *= parseFloat(getComputedStyle(el).opacity) || 0;
    if (o === 0) break;
  }
  return o;
}

/**
 * Measures the tagged elements and fills the uniform arrays:
 * - elA: (left, top, 1 / scale, 0) in CSS px of the viewport
 * - elB: (width, height, corner radius, in use) in the element's own px
 * - geo: (offset x, offset y, sigma, spread) per shadow, element px
 * - col: (r, g, b, alpha) per shadow, alpha 0 for unused slots
 * Shadows go in paint order (--bs2 under --bs1, as listed in CSS).
 */
export function measureShadows(
  elA: Float32Array,
  elB: Float32Array,
  geo: Float32Array,
  col: Float32Array,
  viewW: number,
  viewH: number,
) {
  elA.fill(0);
  elB.fill(0);
  geo.fill(0);
  col.fill(0);
  let n = 0;
  for (const node of shadowed) {
    let ok = node.isConnected && n < MAX_ELEMENTS;
    const cs = ok ? getComputedStyle(node) : null;
    const soft = cs ? [readShadow(cs, 2), readShadow(cs, 1)].filter((x): x is Shadow => !!x) : [];
    ok &&= soft.length > 0;

    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const rect = ok ? node.getBoundingClientRect() : null;
    const scale = rect && w ? rect.width / w : 0;
    // Only translation and uniform scale map onto an axis-aligned box; any
    // rotation or 3D turn changes the box's aspect, so leave those to CSS.
    ok &&= !!rect && w > 0 && h > 0 && scale > 0 && Math.abs(rect.height / h - scale) <= 0.01 * scale;

    // Skip elements whose shadows can't reach the viewport.
    const reach = soft.reduce((m, s) => Math.max(m, Math.abs(s.oy) + 2 * s.blur), 0) * scale;
    ok &&= !!rect && rect.right + reach > 0 && rect.left - reach < viewW && rect.bottom + reach > 0 && rect.top - reach < viewH;

    const opacity = ok ? effectiveOpacity(node) : 0;
    ok &&= opacity > 0;

    if (!ok) {
      release(node);
      continue;
    }
    if (!node.hasAttribute('data-bs-on')) node.setAttribute('data-bs-on', '');

    const r = cs!.borderTopLeftRadius;
    const radius = r.endsWith('%') ? (parseFloat(r) / 100) * Math.min(w, h) : parseFloat(r) || 0;
    elA.set([rect!.left, rect!.top, 1 / scale, 0], n * 4);
    elB.set([w, h, radius, 1], n * 4);
    soft.forEach((s, j) => {
      const k = (n * SHADOWS_PER_ELEMENT + j) * 4;
      // CSS blur radius is twice the Gaussian's standard deviation.
      geo.set([0, s.oy, s.blur / 2, 0], k);
      col.set([s.color[0], s.color[1], s.color[2], s.color[3] * opacity], k);
    });
    n++;
  }
}
