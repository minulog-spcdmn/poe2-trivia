import { anchorCode, toAnchor, type CursorAt, type PointerKind } from './cursors.ts';

/**
 * Where a spot on this screen is, as the pointer sync sends it (cursors.ts):
 * the anchor under it (data-cursor), or the game as a whole; null when
 * outside the game.
 */
export function anchorAt(px: number, py: number, kind: PointerKind): CursorAt | null {
  // Through the cover middle-button scrolling lays over the page (lib/autoscroll.ts), and the recorder's badge (Recorder.svelte).
  const hit = document.elementsFromPoint(px, py).find((n) => !n.closest('.autoscroll, .recorder'));
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
