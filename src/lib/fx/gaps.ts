// On a phone the gaps between the toasts, and the one above the first, hide
// the page's light as the toasts do (core.ts dialogNow): worked out here from
// the boxes core.ts measures, kept free of the DOM so the tests can run it.

import { MAX_HIDES, type HideLight } from './renderer';

/** A front's box on screen as it hides the light (core.ts dialogNow): its outer ring in, its corners' radius, how much it hides. */
export type Stood = { el: Element; box: DOMRect; round: number; amount: number };

/** How far under the header, or under the toast above it, a phone's toast may rest and still hide the light in the gap (Toasts.svelte keeps 6px under the header, 0.4rem between). */
export const UNDER_HEADER = 10;

/**
 * On a phone the toasts stand across the top, one under another a few px
 * under the header (Toasts.svelte), over the player's pill and its streak's
 * fire. The gap above each hides the light too, up to the toast of the stack
 * just above it or, for the first, the header, so the fire passes behind them
 * rather than burning in a thin line between. (Past the corners' curve on
 * both sides, so the gap meets each box with no notch at either end.)
 * `header` is the bottom of the app's header on screen, or null with none
 * showing, asked once at most, as only the first toast rests under it.
 */
export function hideGaps(stood: readonly Stood[], hides: HideLight[], header: () => number | null) {
  let bottom: number | null | undefined;
  for (const s of stood) {
    if (hides.length >= MAX_HIDES) return;
    const { box: r } = s;
    let above: Stood | null = null;
    for (const t of stood) {
      if (t === s || t.el.parentElement !== s.el.parentElement) continue;
      if (t.box.bottom <= r.top && t.box.left < r.right && t.box.right > r.left && (!above || t.box.bottom > above.box.bottom)) above = t;
    }
    if (above) {
      if (r.top - above.box.bottom > UNDER_HEADER) continue;
      const left = Math.max(r.left, above.box.left);
      const top = above.box.bottom - above.round;
      const box = new DOMRect(left, top, Math.min(r.right, above.box.right) - left, r.top + s.round - top);
      hides.push({ box, radius: 0, amount: Math.min(s.amount, above.amount) });
      continue;
    }
    if (bottom === undefined) bottom = header();
    if (bottom !== null && r.top > bottom && r.top - bottom <= UNDER_HEADER) {
      hides.push({ box: new DOMRect(r.left, bottom, r.width, r.top - bottom + s.round), radius: 0, amount: s.amount });
    }
  }
}
