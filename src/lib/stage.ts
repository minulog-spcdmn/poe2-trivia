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

/** The CSS zoom an element is drawn at (1 without): getBoundingClientRect's sizes divided by it are in the element's own CSS pixels. */
export function zoomOf(el: Element): number {
  return (el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
}
