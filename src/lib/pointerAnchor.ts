import { BLEND_PX, MAX_BESIDE, MAX_HOPS, anchorCode, besideOf, cursorAt, toAnchor, type CursorAt, type Hop, type PointerKind } from './cursors.ts';

/**
 * The screen height the game anchor's positions go by (cursors.ts toAnchor):
 * the page's own viewport, which keeps its height while a phone's toolbars
 * slide in and out (innerHeight follows them, and a pointer placed by it
 * would slide up and down the page as they do).
 */
export const screenHeight = () => document.documentElement.clientHeight || innerHeight;

/** The page under a spot, through the covers that aren't the page (middle-button scrolling's, the recorder's badge). */
const under = (px: number, py: number) => document.elementsFromPoint(px, py).find((n) => !n.closest('.autoscroll, .recorder'));

/**
 * Whether this player's own cursor is the hand at a spot: something they can
 * click (cursor: pointer, or a closer look or something to move, which the
 * app's cursors keep as the fallback after their own picture), so the others
 * see it as the hand too.
 */
export function clickableAt(px: number, py: number): boolean {
  const el = under(px, py);
  return !!el && /\b(?:pointer|zoom-in|grab|grabbing)$/.test(getComputedStyle(el).cursor.trim());
}

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

/**
 * The anchors holding no other (an answer, a button, a row) within BLEND_PX
 * of the spot, but for `but` (the one it's on), nearest first, up to
 * MAX_BESIDE: the spot beside each (cursors.ts besideOf).
 */
function besides(px: number, py: number, but?: HTMLElement): Hop[] {
  const near: { f: Found; far: number }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-cursor]')) {
    if (el === but || el.querySelector('[data-cursor]')) continue;
    const f = found(el);
    if (!f) continue;
    const far = Math.hypot(Math.max(f.r.left - px, 0, px - f.r.right), Math.max(f.r.top - py, 0, py - f.r.bottom));
    if (far < BLEND_PX) near.push({ f, far });
  }
  near.sort((a, b) => a.far - b.far);
  return near.slice(0, MAX_BESIDE).map(({ f }) => [f.code, ...besideOf(px, py, f.r)]);
}

/**
 * Where a spot on this screen is, as the pointer sync sends it (cursors.ts):
 * on the anchor under it (data-cursor) and those round that one, innermost
 * first, on the game as a whole when over none; and beside the anchors near
 * it (besides). Null when outside the game.
 */
export function anchorAt(px: number, py: number, kind: PointerKind): CursorAt | null {
  let chain = ancestry(under(px, py));
  if (!chain.length) {
    const game = document.querySelector<HTMLElement>('[data-cursor="game"]');
    const f = game && found(game);
    if (!f || px < f.r.left || px > f.r.right || py < f.r.top || py > f.r.bottom) return null;
    chain = [f];
  }
  // The innermost, what holds it, and the outermost: whatever a screen has of them, the pointer lands near where it is.
  const inner = chain[0].el;
  if (chain.length > MAX_HOPS) chain = [...chain.slice(0, MAX_HOPS - 1), chain.at(-1)!];
  const hops = chain.map(({ code, r }): Hop => [code, ...toAnchor(code, px, py, r, screenHeight())]);
  return cursorAt(hops, kind, besides(px, py, inner));
}
