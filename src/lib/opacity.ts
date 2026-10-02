/**
 * An element's rendered opacity: its own times its ancestors', up to (not including) the body.
 * `own` caches each element's own opacity, so a pass measuring several elements
 * reads their shared ancestors' styles once.
 */
export function opacityOf(el: Element, own?: Map<Element, number>): number {
  let o = 1;
  for (let e: Element | null = el; e && e !== document.body && o > 0; e = e.parentElement) {
    let v = own?.get(e);
    if (v === undefined) {
      v = parseFloat(getComputedStyle(e).opacity) || 0;
      own?.set(e, v);
    }
    o *= v;
  }
  return o;
}
