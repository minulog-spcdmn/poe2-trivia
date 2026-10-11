/**
 * How an element went as the page scrolled `scrolled` px (down, positive),
 * from how far it `moved` on the screen meanwhile (down, positive): 'page'
 * when it scrolled with the page, 'screen' when it stayed put (fixed, or
 * sticky and stuck), null when that can't be told (the page didn't scroll,
 * or the element moved some other way as well).
 *
 * A phone scrolls the page on its own, ahead of the frames drawn in script,
 * so what's drawn to follow an element (the effects layer, the others'
 * pointers) is set in the page while it follows something of the page, and
 * scrolls along between frames, and fixed to the screen while it follows
 * something that stays put there.
 */
export function scrollFollow(moved: number, scrolled: number): 'page' | 'screen' | null {
  if (Math.abs(scrolled) < 1) return null;
  if (Math.abs(moved + scrolled) < 1) return 'page';
  if (Math.abs(moved) < 1) return 'screen';
  return null;
}
