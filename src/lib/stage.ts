// The start page and the lobby are laid out in one stage, at most 1440 px
// wide. On large windows the whole of it (in the lobby, the header too) is
// scaled up with CSS zoom, so a big screen doesn't show it small in an empty
// field: by the window's width over 1440 or its height over 980, whichever
// is less, never below 1 and at most 2.2. Both use the same rule, so going
// from the start page into the lobby never changes the scale. Under zoom,
// 100dvh is divided by the zoom, and whatever measures itself on screen
// (getBoundingClientRect) divides by the element's currentCSSZoom.

/** How much the stage is scaled for a window `w` x `h` (CSS px): 1 to 2.2. */
export function stageZoom(w: number, h: number): number {
  return Math.max(1, Math.min(w / 1440, h / 980, 2.2));
}

/**
 * The invite screen's scale, the rule the start page had before: from 2560
 * px wide, at most 2. It keeps it until its own redesign.
 */
export function inviteZoom(w: number, h: number): number {
  return Math.min(2, Math.max(1, Math.min(w / 2560, h / 1100)));
}

/**
 * Svelte action: keeps `--stage-zoom` on the stage up to date with the
 * window (its CSS sets `zoom` from it, and sizes itself to the window by it).
 */
export function stage(node: HTMLElement, rule: (w: number, h: number) => number = stageZoom) {
  const set = () => node.style.setProperty('--stage-zoom', String(rule(innerWidth, innerHeight)));
  set();
  addEventListener('resize', set);
  return { destroy: () => removeEventListener('resize', set) };
}

/** The CSS zoom an element is drawn at (1 without): getBoundingClientRect's sizes divided by it are in the element's own CSS pixels. */
export function zoomOf(el: Element): number {
  return (el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
}
