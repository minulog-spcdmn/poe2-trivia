// On large windows the whole app (every screen, the header, dialogs and
// toasts) is scaled up with CSS zoom, so a big screen doesn't show it small
// in an empty field: by the window's width over 1440 or its height over 980,
// whichever is less, never below 1 and at most 2.2. One rule for every
// screen, so moving between them never changes the scale. Under zoom,
// 100dvh is divided by the zoom, and whatever measures itself on screen
// (getBoundingClientRect) divides by the element's currentCSSZoom.

/** How much the stage is scaled for a window `w` x `h` (CSS px): 1 to 2.2. */
export function stageZoom(w: number, h: number): number {
  return Math.max(1, Math.min(w / 1440, h / 980, 2.2));
}

/**
 * What carries the stage's zoom: the app's shell, and what sits outside it
 * at the page's scale (the deathmatch intro, the toasts, dialogs' backdrops
 * and the blast layer, the last two zoomed inline), and within the stage
 * what is zoomed again (marked data-zoom: the category cards).
 */
const ZOOMED = '.shell, .dm-intro, .toasts, [style*="zoom"], [data-zoom]';

/**
 * The CSS zoom an element is drawn at (1 without): getBoundingClientRect's
 * sizes divided by it are in the element's own CSS pixels. A browser that
 * doesn't say (no currentCSSZoom) may zoom the old way, where those sizes
 * are already the element's own px, or the new: what its
 * getBoundingClientRect does is measured instead, on whatever carries the
 * zoom the element is under (1 under none), and kept until the zoom or the
 * window changes.
 */
export function zoomOf(el: Element): number {
  const said = (el as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return said ?? measuredZoom(el);
}

const measured = new WeakMap<Element, { key: string; z: number }>();
function measuredZoom(el: Element): number {
  const root = el.closest<HTMLElement>(ZOOMED);
  if (!root) return 1;
  const key = `${document.documentElement.style.getPropertyValue('--stage-zoom')} ${innerWidth}x${innerHeight}`;
  const was = measured.get(root);
  if (was?.key === key) return was.z;
  // Not laid out yet: nothing to measure, and nothing kept.
  if (!root.offsetWidth) return 1;
  // (Rounded: the two widths are rounded differently.)
  const z = Math.round((root.getBoundingClientRect().width / root.offsetWidth) * 1000) / 1000;
  measured.set(root, { key, z });
  return z;
}

/** A box measured on screen, in the px of something drawn at zoom `z`. */
export function unzoomRect(r: DOMRect, z: number): DOMRect {
  return z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
}

/** Where `el` is on screen (getBoundingClientRect), in its own CSS px: what to set its styles, or its children's, by. */
export function ownRect(el: Element): DOMRect {
  return unzoomRect(el.getBoundingClientRect(), zoomOf(el));
}

/** A point on screen (a pointer's clientX/Y), as an offset into `el` in its own CSS px. */
export function ownOffset(el: Element, x: number, y: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const z = zoomOf(el);
  return { x: (x - r.left) / z, y: (y - r.top) / z };
}

/**
 * Svelte pins a leaving item of an animated list (`animate:`) where it
 * stood with a translate measured on screen; under the stage's zoom that is
 * zoom times too far, and the item jumps as it goes. Its out-transition runs
 * after the pin, so it scales the pin back here.
 */
export function unzoomPin(node: Element) {
  const z = zoomOf(node);
  const style = (node as HTMLElement).style;
  if (z === 1 || !style?.transform) return;
  // Svelte writes `translate(Xpx, Ypx)`; a browser may read it back without a zero Y.
  style.transform = style.transform.replace(
    /translate\((-?[\d.]+(?:e[-+]?\d+)?)px(?:, (-?[\d.]+(?:e[-+]?\d+)?)px)?\)$/,
    (_, x: string, y?: string) => `translate(${+x / z}px, ${+(y ?? 0) / z}px)`,
  );
}

/**
 * An out-transition for an item of an animated list: `transition`, with the
 * item pinned where it stood under zoom (unzoomPin). Deferred (Svelte calls
 * the function each time the outro starts), as Svelte keeps an out-only
 * transition's options: an item that leaves, comes back and leaves again is
 * pinned afresh, and fixed afresh.
 */
export function pinnedOut<P, R>(transition: (node: Element, params: P) => R) {
  // (Params as the directive gives them: none when it names none.)
  return (node: Element, params?: P) => () => {
    unzoomPin(node);
    return transition(node, params as P);
  };
}
