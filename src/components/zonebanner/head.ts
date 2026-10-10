// Where the head of the stage lies (Game.svelte's .head: the empty kicker's
// line over the depth banner, its heading between two rules), px from the
// head's top left. The zone gate (./Threshold.svelte) is laid over it and
// works its geometry out from this, so it keeps to its box and never reaches
// the cards, the question or the player list.

import { zoomOf } from '../../lib/stage';

export type Head = {
  /** The head's size. */
  w: number;
  h: number;
  /** The middle of the kicker's (first) line. */
  ky: number;
  /** The heading's box, the top of its capitals and its baseline (about). */
  hx0: number;
  hx1: number;
  hy0: number;
  hy1: number;
  capTop: number;
  base: number;
  /** The heading's font size. */
  size: number;
  /** The middle of the banner's rules, and their outer ends. */
  by: number;
  rl0: number;
  rr1: number;
  /** A phone's layout (the banner set tighter). */
  narrow: boolean;
};

export function measureHead(head: Element): Head | null {
  const h2 = head.querySelector('.banner h2');
  if (!h2) return null;
  // Boxes on screen, undone of the stage's zoom (lib/stage.ts): the gate is drawn in the head's own px.
  const z = zoomOf(head);
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z };
  };
  const box = rect(head);
  const kicker = head.querySelector('.kicker');
  const rules = head.querySelectorAll('.banner .rule');
  const hb = rect(h2);
  const size = parseFloat(getComputedStyle(h2).fontSize) || 24;
  const kb = kicker ? rect(kicker) : undefined;
  const line = kicker ? parseFloat(getComputedStyle(kicker).lineHeight) || 17 : 17;
  const ky = kb ? kb.top - box.top + Math.min(kb.height, line) / 2 : hb.top - box.top - 10;
  // The heading's text is centred in its box (it may be wider than the text).
  const textW = Math.min(hb.width, (h2 as HTMLElement).scrollWidth);
  const cx = hb.left - box.left + hb.width / 2;
  const mid = hb.top - box.top + hb.height / 2;
  const l = rules[0] ? rect(rules[0]) : undefined;
  const r = rules[1] ? rect(rules[1]) : undefined;
  return {
    w: box.width,
    h: box.height,
    ky,
    hx0: cx - textW / 2,
    hx1: cx + textW / 2,
    hy0: hb.top - box.top,
    hy1: hb.bottom - box.top,
    capTop: mid - size * 0.36,
    base: mid + size * 0.34,
    size,
    by: mid,
    rl0: l && l.width ? l.left - box.left : Math.max(0, cx - textW / 2 - 160),
    rr1: r && r.width ? r.right - box.left : Math.min(box.width, cx + textW / 2 + 160),
    narrow: box.width < 560,
  };
}

/**
 * Keeps `head` measured while `el` (inside it) is mounted: calls `set` now
 * and whenever the head or any of `watch` changes size, and once the fonts
 * have loaded (the name's width depends on them).
 */
export function watchHead(el: HTMLElement, set: (h: Head) => void, watch: (HTMLElement | undefined)[] = []) {
  const head = el.closest('.head') ?? el.parentElement!;
  const update = () => {
    const m = measureHead(head);
    if (m) set(m);
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(head);
  for (const w of watch) if (w) ro.observe(w);
  let live = true;
  document.fonts?.ready.then(() => live && update());
  return () => {
    live = false;
    ro.disconnect();
  };
}
