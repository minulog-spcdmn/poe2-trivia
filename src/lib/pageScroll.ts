// How far the page is scrolled, as its last scroll event left it. Reading
// scrollX or scrollY has the browser lay the page out there and then if
// anything changed since: read as an effect started, the moment a screen
// mounted, they laid the new screen out in the middle of mounting it (21 ms
// as a Delve run began, traced on a 4K screen), and the scroll back to the
// top on a change of screen did the same (13 ms as the lobby opened). The
// page's scroll events come before each frame's own work, its animation
// frames included, so what's read there is that frame's; read between
// frames, it's at most one behind, but for the page's own scrolling: it's
// read afresh after that (scrolled there, the page is laid out already), so
// what starts in the same task as a scroll to the top (a new screen's
// effects) has it where it is.

let at: [number, number] | null = null;
const heard = (): [number, number] => (at = [scrollX, scrollY]);
if (typeof window !== 'undefined') {
  addEventListener('scroll', heard, { passive: true });
  for (const name of ['scrollTo', 'scroll', 'scrollBy'] as const) {
    const real = window[name] as (...args: unknown[]) => void;
    window[name] = function (this: Window, ...args: unknown[]) {
      real.apply(this, args);
      at = null;
    } as Window[typeof name];
  }
  const into = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element, ...args: Parameters<Element['scrollIntoView']>) {
    into.apply(this, args);
    at = null;
  };
}

/** How far the page is scrolled, [x, y] in CSS px (0 with no window, as in the tests). */
export const pageScroll = (): [number, number] => (typeof scrollY === 'number' ? (at ?? heard()) : [0, 0]);
