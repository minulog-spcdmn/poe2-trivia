import { MAX_HOPS, anchorCode, cursorAt, toAnchor, type CursorAt, type Hop, type PointerKind } from './cursors.ts';

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
 * Between anchors (the gap between two answers, the margin round a card), a
 * pointer this close to one (px) goes on it, beside it, so on every screen
 * it keeps its place beside that one rather than on what holds them.
 */
const NEAR_PX = 48;

interface Found {
  el: HTMLElement;
  code: number;
  r: DOMRect;
}

/** An anchor a pointer can go on: one there is, on this screen (not on its way out: Svelte makes that inert), with a size. */
function found(el: HTMLElement): Found | null {
  const code = anchorCode(el.dataset.cursor ?? '');
  if (code === null || el.closest('[inert]')) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? { el, code, r } : null;
}

/** The anchors at `el` and round it, innermost first. */
function ancestry(el: Element | null | undefined): Found[] {
  const out: Found[] = [];
  for (let at = el?.closest<HTMLElement>('[data-cursor]'); at; at = at.parentElement?.closest<HTMLElement>('[data-cursor]')) {
    const f = found(at);
    if (f) out.push(f);
  }
  return out;
}

/** The innermost anchor in `scope` (one holding no other) nearest the spot, within NEAR_PX of it. */
function nearest(scope: ParentNode, px: number, py: number): Found | null {
  let best: Found | null = null;
  let d = NEAR_PX;
  for (const el of scope.querySelectorAll<HTMLElement>('[data-cursor]')) {
    if (el.querySelector('[data-cursor]')) continue;
    const f = found(el);
    if (!f) continue;
    const far = Math.hypot(Math.max(f.r.left - px, 0, px - f.r.right), Math.max(f.r.top - py, 0, py - f.r.bottom));
    if (far <= d) [best, d] = [f, far];
  }
  return best;
}

/**
 * Where a spot on this screen is, as the pointer sync sends it (cursors.ts):
 * on the anchor under it (data-cursor) and those round that one, innermost
 * first; between anchors, on the nearest and those round it; on the game as
 * a whole when near none. Null when outside the game.
 */
export function anchorAt(px: number, py: number, kind: PointerKind): CursorAt | null {
  let chain = ancestry(under(px, py));
  // Over an anchor that holds others (the game, a panel), but none of them: beside the nearest, if one is near.
  const inner = chain[0]?.el;
  if (!inner || inner.querySelector('[data-cursor]')) {
    const near = nearest(inner ?? document, px, py);
    if (near) chain = ancestry(near.el);
  }
  if (!chain.length) {
    const game = document.querySelector<HTMLElement>('[data-cursor="game"]');
    const f = game && found(game);
    if (!f || px < f.r.left || px > f.r.right || py < f.r.top || py > f.r.bottom) return null;
    chain = [f];
  }
  // The innermost, what holds it, and the outermost: whatever a screen has of them, the pointer lands near where it is.
  if (chain.length > MAX_HOPS) chain = [...chain.slice(0, MAX_HOPS - 1), chain.at(-1)!];
  const hops = chain.map(({ code, r }): Hop => [code, ...toAnchor(code, px, py, r, innerHeight)]);
  return cursorAt(hops, kind);
}
