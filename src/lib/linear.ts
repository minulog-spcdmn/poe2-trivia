// The linear part of an element's on-screen transform, for the backdrop's
// shadows and fills (lib/backdropShadow.ts, lib/backdropDropShadow.ts): they
// can only follow an element whose box stays flat on screen.

import { zoomOf } from './stage.ts';

export type Lin = [number, number, number, number]; // a b c d: x' = a x + c y, y' = b x + d y

export const mul = (m: Lin, n: Lin): Lin => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
];

/**
 * A matrix3d that maps the element's own plane affinely: a perspective() in
 * front of no turn (as on a card that is lifted but not tilted) still keeps
 * the box flat. Any turn about X or Y makes it a trapezoid (null).
 */
function flat3d(v: number[]): Lin | null {
  const [m11, m12, m13, m14, m21, m22, m23, m24, , , , , , , , m44] = v;
  // The depth must not vary across the box (under an ancestor's perspective),
  // nor may the perspective divide.
  if (Math.abs(m13) > 1e-3 || Math.abs(m23) > 1e-3) return null;
  if (Math.abs(m14) > 1e-5 || Math.abs(m24) > 1e-5 || m44 <= 0) return null;
  return [m11 / m44, m12 / m44, m21 / m44, m22 / m44];
}

/** The linear part of one element's own transform, or null if it isn't 2D. */
export function ownLinear(cs: CSSStyleDeclaration): Lin | null {
  let m: Lin = [1, 0, 0, 1];
  if (cs.rotate && cs.rotate !== 'none') {
    const r = cs.rotate.match(/^(?:z\s+)?(-?[\d.]+)deg$/);
    if (!r) return null;
    const t = (parseFloat(r[1]) * Math.PI) / 180;
    m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t)]);
  }
  if (cs.scale && cs.scale !== 'none') {
    const s = cs.scale.split(/\s+/).map(parseFloat);
    if (s.length > 2) return null;
    m = mul(m, [s[0], 0, 0, s[1] ?? s[0]]);
  }
  if (cs.transform && cs.transform !== 'none') {
    const t = cs.transform.match(/^matrix(3d)?\(([^)]+)\)$/);
    if (!t) return null;
    const v = t[2].split(',').map(parseFloat);
    const own = t[1] ? flat3d(v) : (v.slice(0, 4) as Lin);
    if (!own) return null;
    m = mul(m, own);
  }
  return m;
}

/**
 * Linear map from the element's local px to the viewport, ancestors (and any
 * CSS zoom) included.
 * `cache` holds each element's own transform, so the tagged elements' shared
 * ancestors are read once a pass (reading a computed transform is costly).
 */
export function linearOf(node: HTMLElement, cache: Map<Element, Lin | null>): Lin | null {
  let m: Lin = [1, 0, 0, 1];
  for (let el: Element | null = node; el; el = el.parentElement) {
    let own = cache.get(el);
    if (own === undefined) cache.set(el, (own = ownLinear(getComputedStyle(el))));
    if (!own) return null;
    m = mul(own, m);
  }
  // CSS zoom over it (the app's stage zoom, lib/stage.ts) scales it too.
  const z = zoomOf(node);
  return z === 1 ? m : [m[0] * z, m[1] * z, m[2] * z, m[3] * z];
}
