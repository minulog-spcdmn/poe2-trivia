// Centring a line of capitals by the capitals themselves. Where a font's
// capitals sit in their line differs between systems (which of a font's
// line metrics the browser goes by), so no fixed nudge holds everywhere:
// it's measured where it's drawn.

import { zoomOf } from './stage';

/**
 * How far below the middle of its line (em) the middle of `node`'s
 * capitals is, as laid out here: negative when they sit high. Its baseline
 * is found in the page (a probe set on it), its capitals' height from the
 * glyphs' own outlines (a canvas, measured large: it reports whole pixels).
 */
export function capOffsetEm(node: HTMLElement, caps = 'H'): number {
  const cs = getComputedStyle(node);
  const size = parseFloat(cs.fontSize);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !size) return 0;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
  const capH = (ctx.measureText(caps).actualBoundingBoxAscent / 100) * size;
  const probe = document.createElement('span');
  probe.style.cssText = 'display: inline-block; width: 0; height: 0; vertical-align: baseline';
  node.append(probe);
  const z = zoomOf(node);
  const box = node.getBoundingClientRect();
  const baseline = (probe.getBoundingClientRect().bottom - box.top) / z;
  probe.remove();
  if (!capH || !box.height) return 0;
  return (baseline - capH / 2 - box.height / z / 2) / size;
}

/**
 * Svelte action: moves a line of capitals so they, not their line, sit in
 * the middle of where it's centred (once its font has loaded, and again
 * when fonts change).
 */
export function capCentre(node: HTMLElement) {
  const set = () => {
    node.style.translate = '';
    const off = capOffsetEm(node);
    if (Math.abs(off) > 0.005) node.style.translate = `0 ${(-off).toFixed(3)}em`;
  };
  void document.fonts.ready.then(set);
  document.fonts.addEventListener('loadingdone', set);
  return { destroy: () => document.fonts.removeEventListener('loadingdone', set) };
}
