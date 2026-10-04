// Soft outer box-shadows, and large gradient fills, drawn by the WebGL
// backdrop instead of CSS.
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
// draw an element faithfully (over budget, no WebGL) it leaves the attribute
// off and CSS paints as usual. A rotated or 3D-turned element (a card tilting
// toward the pointer) gets its shadows drawn in its own plane, through the
// perspective map from the screen onto it (see screenToLocal).
//
// Fills work the same way for backgrounds, which band just like shadows when
// they're large and dark: `use:backdropShadow={{ fill: 'linear' }}` makes the
// backdrop paint the element's background from --bs-fill-a, --bs-fill-b and
// --bs-fill-angle (a two-stop linear gradient), and 'stage' paints the item
// art stage (its layered glows, the warm one in --bs-fill-a). CSS
// paints the same gradient through `var(--bs-fill-paint, …)`, which
// `data-bs-fill` turns transparent while the backdrop draws it. Unlike a soft
// shadow, a fill has a crisp edge, so it goes back to CSS whenever it could
// lag behind the element: while the page scrolls, while a transform animation
// or the camera shake (lib/fx/core.ts) moves the element or an ancestor, or
// when an ancestor paints a background of its own (which would cover the
// backdrop).

import { shaking } from './fx/core';
import { cornerPx } from './corner';
import { linearOf, type Lin } from './linear';
import { opacityOf } from './opacity';

export type Fill = 'linear' | 'stage';
export type BackdropOptions = { fill?: Fill } | undefined;

const shadowed = new Map<HTMLElement, BackdropOptions>();

/** Svelte action: let the backdrop draw this element's blurred outer shadows (and fill). */
export function backdropShadow(node: HTMLElement, opts?: BackdropOptions) {
  shadowed.set(node, opts);
  return {
    update(next: BackdropOptions) {
      shadowed.set(node, next);
    },
    destroy() {
      shadowed.delete(node);
      release(node);
    },
  };
}

export const SHADOWS_PER_ELEMENT = 2;
const FILL_KIND: Record<Fill, number> = { linear: 1, stage: 2 };

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
  node.removeAttribute('data-bs-fill');
}

/** Releases every element back to CSS, e.g. when the renderer stops. */
export function releaseAll() {
  for (const node of shadowed.keys()) release(node);
}

// ---------- when fills must go back to CSS ----------

let lastScroll = -Infinity;
if (typeof window !== 'undefined') {
  const mark = () => (lastScroll = performance.now());
  addEventListener('scroll', mark, { passive: true, capture: true });
  addEventListener('wheel', mark, { passive: true });
  addEventListener('touchmove', mark, { passive: true });
}

const MOVING = /transform|translate|scale|rotate/;

/** Whether an animation moves its target (cached: an animation's keyframes don't change). */
const movesCache = new WeakMap<Animation, boolean>();
function moves(anim: Animation, effect: KeyframeEffect): boolean {
  let m = movesCache.get(anim);
  if (m === undefined) {
    if (anim instanceof CSSTransition) m = MOVING.test(anim.transitionProperty);
    else {
      try {
        m = effect.getKeyframes().some((k) => Object.keys(k).some((p) => MOVING.test(p)));
      } catch {
        m = true;
      }
    }
    movesCache.set(anim, m);
  }
  return m;
}

/**
 * Elements with a running animation or transition that moves them. Scanned
 * every frame rather than kept until one starts: a hover's transition, say,
 * shows up here in the frame that first styles it, but its transitionrun (or
 * animationstart) event only fires a frame later.
 */
function movingElements(): Set<Element> {
  const out = new Set<Element>();
  for (const anim of document.getAnimations()) {
    if (anim.playState !== 'running') continue;
    const effect = anim.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (target && moves(anim, effect)) out.add(target);
  }
  return out;
}

function paintsBackground(cs: CSSStyleDeclaration) {
  if (cs.backgroundImage !== 'none') return true;
  const c = parseColor(cs.backgroundColor);
  return !!c && c[3] > 0;
}

// ---------- turned elements ----------

/** Zero-size probes in the corners of an element's padding box (see screenToLocal). */
const probes = new WeakMap<HTMLElement, HTMLElement[]>();
function probesOf(node: HTMLElement): HTMLElement[] {
  let ps = probes.get(node);
  if (!ps) {
    ps = ['left:0;top:0', 'right:0;top:0', 'right:0;bottom:0', 'left:0;bottom:0'].map((at) => {
      const el = document.createElement('span');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = `position:absolute;${at};width:0;height:0;visibility:hidden;pointer-events:none`;
      return el;
    });
    probes.set(node, ps);
  }
  for (const el of ps) if (el.parentNode !== node) node.append(el);
  return ps;
}

/** 3x3 inverse (row major), or null if singular. */
function invert3([a, b, c, d, e, f, g, h, i]: number[]): number[] | null {
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !Number.isFinite(det)) return null;
  const k = 1 / det;
  return [A * k, (c * h - b * i) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, (c * d - a * f) * k, C * k, (b * g - a * h) * k, (a * e - b * d) * k];
}

/**
 * The perspective map (row-major 3x3, homogeneous) from viewport CSS px onto
 * a turned element's own px from its border-box corner, and its scale on
 * screen. The browser lays out the element's corners itself (in zero-size
 * probes), so this holds through any chain of 3D transforms. Null when the
 * element can't hold the probes, lies edge-on, or shows its hidden back.
 */
function screenToLocal(node: HTMLElement, cs: CSSStyleDeclaration, w: number, h: number) {
  if (cs.position === 'static') return null;
  const q = probesOf(node).map((el) => el.getBoundingClientRect());
  // Unit square to the corner quad (Heckbert's square-to-quad).
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q.flatMap((r) => [r.left, r.top]);
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-6) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const hh = (dx1 * sy - sx * dy1) / den;
  const quad = [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh, 1];
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const pw = w - bl - (parseFloat(cs.borderRightWidth) || 0);
  const ph = h - bt - (parseFloat(cs.borderBottomWidth) || 0);
  if (pw <= 0 || ph <= 0) return null;
  // Screen to unit square, then to element px.
  const inv = invert3(quad);
  if (!inv) return null;
  const toLocal = [pw * inv[0] + bl * inv[6], pw * inv[1] + bl * inv[7], pw * inv[2] + bl * inv[8], ph * inv[3] + bt * inv[6], ph * inv[4] + bt * inv[7], ph * inv[5] + bt * inv[8], inv[6], inv[7], inv[8]];
  // Keep w positive on the element's side of the horizon.
  const cx = (x0 + x1 + x2 + x3) / 4;
  const cy = (y0 + y1 + y2 + y3) / 4;
  if (toLocal[6] * cx + toLocal[7] * cy + toLocal[8] < 0) for (let k = 0; k < 9; k++) toLocal[k] = -toLocal[k];
  // Its area on screen against its own: the scale, and (negative) whether it
  // shows its back.
  const area = ((x1 - x3) * (y2 - y0) - (x2 - x0) * (y1 - y3)) / 2;
  if (area < 0 && cs.backfaceVisibility === 'hidden') return null;
  const scale = Math.sqrt(Math.abs(area) / (pw * ph));
  if (scale < 1e-3) return null;
  return { toLocal, scale };
}

/**
 * Measures the tagged elements and fills the uniform arrays, `max` elements
 * at most:
 * - elX, elY, elA: the map from viewport CSS px (x, y, 1) to the element's
 *   own px from its border-box corner, homogeneous: one row each in xyz (a
 *   plain offset and scale unless the element is turned). elA.w: how far
 *   beyond the border box its shadows draw, in element px (-1 with no shadow)
 * - elB: (width, height, corner radius, in use) in the element's own px
 * - elC: (fill kind, angle in radians, opacity, 0); kind 0 = no fill
 * - elD, elE: fill colours (r, g, b, a)
 * - geo: (offset x, offset y, sigma, spread) per shadow, element px
 * - col: (r, g, b, alpha) per shadow, alpha 0 for unused slots
 * Elements go in document order, so later fills paint over earlier ones as in
 * CSS; every shadow goes under every fill (see the shader). Shadows go in
 * paint order (--bs2 under --bs1, as listed in CSS).
 */
export function measureShadows(
  max: number,
  elX: Float32Array,
  elY: Float32Array,
  elA: Float32Array,
  elB: Float32Array,
  elC: Float32Array,
  elD: Float32Array,
  elE: Float32Array,
  geo: Float32Array,
  col: Float32Array,
  viewW: number,
  viewH: number,
) {
  for (const arr of [elX, elY, elA, elB, elC, elD, elE, geo, col]) arr.fill(0);

  const scrolling = performance.now() - lastScroll < 220;
  // The shake moves the whole view with an inline translate, which the effects
  // loop updates after this frame's backdrop is drawn.
  const shook = shaking();
  let moving: Set<Element> | null = null;
  const isMoving = (node: HTMLElement) => {
    moving ??= movingElements();
    if (!moving.size) return false;
    for (let el: Element | null = node; el; el = el.parentElement) if (moving.has(el)) return true;
    return false;
  };
  // Ancestors' backgrounds, read once a frame: fills share most of their
  // ancestors. (An ancestor comes first in document order, so its own
  // data-bs-fill is settled before any descendant reads it.)
  const paints = new Map<Element, boolean>();
  const paintsAt = (el: Element) => {
    let p = paints.get(el);
    if (p === undefined) paints.set(el, (p = paintsBackground(getComputedStyle(el))));
    return p;
  };
  // Opacities and transforms likewise (nothing below changes one).
  const opacities = new Map<Element, number>();
  const linears = new Map<Element, Lin | null>();

  // Fills first when there are more elements than room, then document order.
  const nodes = [...shadowed.keys()].filter((n) => n.isConnected);
  nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const withFill = nodes.filter((n) => shadowed.get(n)?.fill);
  const chosen = new Set([...withFill, ...nodes.filter((n) => !shadowed.get(n)?.fill)].slice(0, max));
  for (const n of shadowed.keys()) if (!chosen.has(n)) release(n);

  const filled = new Set<Element>();
  let n = 0;
  for (const node of nodes) {
    if (!chosen.has(node)) continue;
    const cs = getComputedStyle(node);
    const soft = [readShadow(cs, 2), readShadow(cs, 1)].filter((x): x is Shadow => !!x);
    const fillKind = shadowed.get(node)?.fill;

    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const rect = node.getBoundingClientRect();
    let scale = w ? rect.width / w : 0;
    let ok = w > 0 && h > 0 && scale > 0;
    // A box that only moves and scales maps onto the screen by an offset and
    // a scale. Any rotation or 3D turn, even a slight one (as a card tilting
    // toward the pointer), needs the full map, or its shadows wouldn't follow
    // the turned shape.
    const lin = ok ? linearOf(node, linears) : null;
    const flat = !!lin && Math.abs(lin[1]) + Math.abs(lin[2]) <= 1e-3 * lin[0] && Math.abs(lin[3] - lin[0]) <= 1e-3 * lin[0];
    let toLocal = [1 / scale, 0, -rect.left / scale, 0, 1 / scale, -rect.top / scale, 0, 0, 1];
    if (ok && !flat) {
      const turned = screenToLocal(node, cs, w, h);
      ok = !!turned;
      if (turned) ({ toLocal, scale } = turned);
    }

    // Skip elements whose shadows (or fill) can't reach the viewport.
    // (The shader skips a shadow 4 sigma beyond its offset box.)
    const shadowReach = soft.reduce((m, s) => Math.max(m, Math.abs(s.oy) + 2 * s.blur), -1);
    const reach = Math.max(0, shadowReach) * scale;
    ok &&= rect.right + reach > 0 && rect.left - reach < viewW && rect.bottom + reach > 0 && rect.top - reach < viewH;

    const opacity = ok ? opacityOf(node, opacities) : 0;
    ok &&= opacity > 0;

    let fill: { kind: number; angle: number; a: number[]; b: number[] } | null = null;
    if (ok && flat && fillKind && !scrolling && !shook && !isMoving(node)) {
      const a = parseColor(cs.getPropertyValue('--bs-fill-a').trim());
      const b = parseColor(cs.getPropertyValue('--bs-fill-b').trim());
      const angle = parseFloat(cs.getPropertyValue('--bs-fill-angle')) || 180;
      // Every ancestor must let the backdrop show through (or be drawn by it).
      let clear = !!a && !!b;
      for (let el = node.parentElement; clear && el && el !== document.body; el = el.parentElement) {
        if (!filled.has(el) && paintsAt(el)) clear = false;
      }
      if (clear) fill = { kind: FILL_KIND[fillKind], angle: (angle * Math.PI) / 180, a: a!, b: b! };
    }

    if (!ok || (!soft.length && !fill)) {
      release(node);
      continue;
    }
    if (soft.length) {
      if (!node.hasAttribute('data-bs-on')) node.setAttribute('data-bs-on', '');
    } else node.removeAttribute('data-bs-on');
    if (fill) {
      if (!node.hasAttribute('data-bs-fill')) node.setAttribute('data-bs-fill', '');
      filled.add(node);
    } else node.removeAttribute('data-bs-fill');

    const radius = cornerPx(cs.borderTopLeftRadius, w, h);
    elX.set(toLocal.slice(0, 3), n * 4);
    elY.set(toLocal.slice(3, 6), n * 4);
    elA.set([...toLocal.slice(6, 9), shadowReach], n * 4);
    elB.set([w, h, radius, 1], n * 4);
    if (fill) {
      elC.set([fill.kind, fill.angle, opacity, 0], n * 4);
      elD.set(fill.a, n * 4);
      elE.set(fill.b, n * 4);
    }
    soft.forEach((s, j) => {
      const k = (n * SHADOWS_PER_ELEMENT + j) * 4;
      // CSS blur radius is twice the Gaussian's standard deviation.
      geo.set([0, s.oy, s.blur / 2, 0], k);
      col.set([s.color[0], s.color[1], s.color[2], s.color[3] * opacity], k);
    });
    n++;
  }
}
