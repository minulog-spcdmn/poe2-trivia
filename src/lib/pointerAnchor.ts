import { anchorCode, toAnchor, type CursorAt, type PointerKind } from './cursors.ts';

/** The page under a spot, through the covers that aren't the page (middle-button scrolling's, the recorder's badge). */
const under = (px: number, py: number) => document.elementsFromPoint(px, py).find((n) => !n.closest('.autoscroll, .recorder'));

/**
 * Whether this player's own cursor is the hand at a spot: something they can
 * click (cursor: pointer, which the app's cursors keep as the fallback after
 * their own picture), so the others see it as the hand too.
 */
export function clickableAt(px: number, py: number): boolean {
  const el = under(px, py);
  return !!el && /\bpointer$/.test(getComputedStyle(el).cursor.trim());
}

/**
 * Where a spot on this screen is, as the pointer sync sends it (cursors.ts):
 * the anchor under it (data-cursor), or the game as a whole; null when
 * outside the game.
 */
export function anchorAt(px: number, py: number, kind: PointerKind): CursorAt | null {
  const hit = under(px, py);
  let el = hit?.closest<HTMLElement>('[data-cursor]') ?? null;
  // Something on its way out (Svelte makes it inert) isn't on the other screens any more.
  if (el?.closest('[inert]')) el = null;
  el ??= document.querySelector<HTMLElement>('[data-cursor="game"]');
  const code = el ? anchorCode(el.dataset.cursor ?? '') : null;
  if (!el || code === null) return null;
  const r = el.getBoundingClientRect();
  if (px < r.left || px > r.right || py < r.top || py > r.bottom || !r.width || !r.height) return null;
  return [code, ...toAnchor(code, px, py, r, innerHeight), kind];
}
