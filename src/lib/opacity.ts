/** An element's rendered opacity: its own times its ancestors', up to (not including) the body. */
export function opacityOf(el: Element): number {
  let o = 1;
  for (let e: Element | null = el; e && e !== document.body && o > 0; e = e.parentElement) {
    o *= parseFloat(getComputedStyle(e).opacity) || 0;
  }
  return o;
}
