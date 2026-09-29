// Outer box-shadows drawn by the WebGL backdrop instead of CSS.
//
// Big, soft CSS shadows band (the browser rasterizes them at 8 bits, with no
// dither) and stop short at the blur radius. For elements that sit directly on
// the backdrop, the backdrop can draw the same shadows itself: dithered, with a
// true Gaussian falloff. Tag such an element with `use:backdropShadow`.
//
// The element keeps its CSS `box-shadow` as the source of truth. Every frame
// the renderer reads the *computed* value (so transitions and animations just
// work), draws the blurred outer shadows, and marks the element with
// `data-bs-on`; a rule in app.css then clips the element to its border box, so
// CSS stops painting those shadows while inset shadows and any crisp 1px rings
// (kept via --bs-keep) still render. Whenever the renderer can't draw an
// element faithfully (rotated or 3D-transformed, too many shadows, over
// budget, no WebGL) it leaves the attribute off and CSS paints as usual.

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

type Shadow = { color: number[]; ox: number; oy: number; blur: number; spread: number; inset: boolean };

/** Splits a computed `box-shadow` list on top-level commas. */
function splitList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(value.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Parses a computed colour (`rgb()`, `rgba()` or `color(srgb …)`) to 0-1 RGBA. */
function parseColor(css: string): number[] | null {
  const nums = (css.match(/-?[\d.]+(?:e-?\d+)?%?/g) ?? []).map((n) =>
    n.endsWith('%') ? parseFloat(n) / 100 : parseFloat(n),
  );
  if (css.startsWith('color(srgb')) {
    const [r, g, b, a = 1] = nums;
    return [r, g, b, a];
  }
  if (css.startsWith('rgb')) {
    const [r, g, b, a = 1] = nums;
    return [r / 255, g / 255, b / 255, a];
  }
  return null;
}

function parseShadows(value: string): Shadow[] {
  if (!value || value === 'none') return [];
  const out: Shadow[] = [];
  for (const part of splitList(value)) {
    const colorMatch = part.match(/(?:rgba?|color)\([^)]*\)/);
    const color = colorMatch ? parseColor(colorMatch[0]) : null;
    if (!color) continue;
    const rest = part.replace(colorMatch![0], '');
    const [ox = 0, oy = 0, blur = 0, spread = 0] = (rest.match(/-?[\d.]+(?:e-?\d+)?px/g) ?? []).map(parseFloat);
    out.push({ color, ox, oy, blur, spread, inset: /\binset\b/.test(rest) });
  }
  return out;
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
 * - elA: (left, top, 1 / scale, keep) in CSS px of the viewport
 * - elB: (width, height, corner radius, in use) in the element's own px
 * - geo: (offset x, offset y, sigma, spread) per shadow, element px
 * - col: (r, g, b, alpha) per shadow, alpha 0 for unused slots
 * Shadows go in paint order (the last listed is painted first, as in CSS).
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
    const outer = cs ? parseShadows(cs.boxShadow).filter((s) => !s.inset && s.color[3] > 0) : [];
    const soft = outer.filter((s) => s.blur > 0);
    ok &&= soft.length > 0 && soft.length <= SHADOWS_PER_ELEMENT;

    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const rect = ok ? node.getBoundingClientRect() : null;
    const scale = rect && w ? rect.width / w : 0;
    // Only translation and uniform scale map onto an axis-aligned box; any
    // rotation or 3D turn changes the box's aspect, so leave those to CSS.
    ok &&= !!rect && w > 0 && h > 0 && scale > 0 && Math.abs(rect.height / h - scale) <= 0.01 * scale;

    // Skip elements whose shadows can't reach the viewport.
    const reach = soft.reduce((m, s) => Math.max(m, Math.hypot(s.ox, s.oy) + s.spread + 2 * s.blur), 0) * scale;
    ok &&= !!rect && rect.right + reach > 0 && rect.left - reach < viewW && rect.bottom + reach > 0 && rect.top - reach < viewH;

    const opacity = ok ? effectiveOpacity(node) : 0;
    ok &&= opacity > 0;

    if (!ok) {
      release(node);
      continue;
    }

    // Crisp rings (no blur) stay with CSS: the clip is widened to keep them.
    const keep = outer
      .filter((s) => s.blur === 0)
      .reduce((m, s) => Math.max(m, s.spread + Math.max(Math.abs(s.ox), Math.abs(s.oy))), 0);
    const r = cs!.borderTopLeftRadius;
    const radius = r.endsWith('%') ? (parseFloat(r) / 100) * Math.min(w, h) : parseFloat(r) || 0;

    const keepVar = `${keep}px`;
    const radiusVar = `${radius}px`;
    if (node.style.getPropertyValue('--bs-keep') !== keepVar) node.style.setProperty('--bs-keep', keepVar);
    if (node.style.getPropertyValue('--bs-radius') !== radiusVar) node.style.setProperty('--bs-radius', radiusVar);
    if (!node.hasAttribute('data-bs-on')) node.setAttribute('data-bs-on', '');

    elA.set([rect!.left, rect!.top, 1 / scale, keep], n * 4);
    elB.set([w, h, radius, 1], n * 4);
    soft.reverse().forEach((s, j) => {
      const k = (n * SHADOWS_PER_ELEMENT + j) * 4;
      // CSS blur radius is twice the Gaussian's standard deviation.
      geo.set([s.ox, s.oy, Math.max(s.blur / 2, 0.5), s.spread], k);
      col.set([s.color[0], s.color[1], s.color[2], s.color[3] * opacity], k);
    });
    n++;
  }
}
