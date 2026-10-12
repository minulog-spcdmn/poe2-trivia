// Scrolling with the middle mouse button, done by the page itself so it can
// wear the game's look: the browser's own shows its pictures, which no CSS
// reaches. Where the button went down, a seal (lib/pointerArt.ts); the
// pointer turns to a dart up or down, and the page scrolls that way, faster
// the further it is taken from the seal. As the browsers do it: pressed and
// let go at once, it runs until the next click (or a key, or the wheel);
// held and moved, until the button comes up.
//
// Only where the browsers scroll so (Windows, Linux): a Mac has no such
// scrolling, and the middle button stays its own there. Never on a link or
// a text field, where the button means something else.

import { SCROLL_SEAL, SCROLL_SEAL_R, WEIGHT } from './pointerArt';
import { cursorColor, scrollCursor } from './ownCursor';

/** Within this far of the seal (CSS px), it holds still. */
const DEAD = 12;
/** Speed per pixel past that (px/s), and the most. */
const SPEED = 9;
const MAX_SPEED = 6000;
/** Let go this soon, without moving this far, and it keeps running until the next click. */
const CLICK_MS = 350;
const CLICK_MOVE = 8;

/** The nearest thing up from `el` that can scroll up or down, the page itself last. */
function scrollerFor(el: Element | null): HTMLElement | null {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n as HTMLElement;
  }
  const page = document.scrollingElement as HTMLElement | null;
  return page && page.scrollHeight > page.clientHeight + 1 ? page : null;
}

const svg = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** The seal, engraved as the pointer is: a dark ground, a glow under the lines. */
function sealSvg() {
  const R = SCROLL_SEAL_R + 4;
  const root = svg('svg', { viewBox: `${-R} ${-R} ${2 * R} ${2 * R}`, width: 2 * R, height: 2 * R, class: 'autoscroll-seal', 'aria-hidden': 'true' });
  root.append(
    svg('circle', { r: SCROLL_SEAL_R + 0.6, class: 'ground' }),
    svg('path', { d: SCROLL_SEAL.rings, class: 'glow' }),
    svg('path', { d: SCROLL_SEAL.rings, 'stroke-width': WEIGHT.fine }),
    svg('circle', { r: 1.1, class: 'dot' }),
  );
  for (const way of ['up', 'down'] as const) {
    const d = SCROLL_SEAL[way];
    const g = svg('g', { class: `way ${way}` });
    g.append(svg('path', { d: d.outline, 'stroke-width': WEIGHT.fine }), svg('path', { d: d.ridge, 'stroke-width': 0.5 }), svg('path', { d: d.hatch, 'stroke-width': 0.4, class: 'fine' }));
    root.append(g);
  }
  return root;
}

let run: {
  scroller: HTMLElement;
  x: number;
  y: number;
  at: number;
  /** Where the pointer is now. */
  py: number;
  held: boolean;
  carry: number;
  last: number;
  raf: number;
  veil: HTMLElement;
  seal: SVGElement;
  way: string;
} | null = null;
/** The click that ended a run: it goes nowhere. */
let swallow = false;

function stop() {
  if (!run) return;
  cancelAnimationFrame(run.raf);
  run.veil.remove();
  run = null;
}

function frame(now: number) {
  if (!run) return;
  const r = run;
  const dt = Math.min(64, now - r.last);
  r.last = now;
  const dy = r.py - r.y;
  const v = Math.abs(dy) <= DEAD ? 0 : Math.sign(dy) * Math.min(MAX_SPEED, (Math.abs(dy) - DEAD) * SPEED);
  // Whole pixels at a time; the rest is kept for the next frame.
  r.carry += (v * dt) / 1000;
  const step = Math.trunc(r.carry);
  if (step) {
    r.scroller.scrollTop += step;
    r.carry -= step;
  }
  const way = v === 0 ? 'still' : v < 0 ? 'up' : 'down';
  if (way !== r.way) {
    r.way = way;
    r.veil.style.cursor = scrollCursor(way);
  }
  // As the browsers do, the seal shows only the ways there is still room to go.
  const top = r.scroller.scrollTop <= 0;
  const bottom = r.scroller.scrollTop + r.scroller.clientHeight >= r.scroller.scrollHeight - 1;
  r.seal.classList.toggle('no-up', top);
  r.seal.classList.toggle('no-down', bottom);
  r.raf = requestAnimationFrame(frame);
}

function start(scroller: HTMLElement, x: number, y: number) {
  // Over the whole page while it runs: it holds the cursor, and nothing underneath lights up.
  const veil = document.createElement('div');
  veil.className = 'autoscroll';
  const seal = sealSvg();
  seal.style.color = cursorColor();
  seal.style.left = `${x}px`;
  seal.style.top = `${y}px`;
  veil.append(seal);
  veil.style.cursor = scrollCursor('still');
  document.body.append(veil);
  const now = performance.now();
  run = { scroller, x, y, at: now, py: y, held: true, carry: 0, last: now, raf: requestAnimationFrame(frame), veil, seal, way: 'still' };
}

export function installAutoscroll() {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
  if (/mac|iphone|ipad|ipod|android/i.test(platform) || !matchMedia('(pointer: fine)').matches) return;
  addEventListener(
    'mousedown',
    (e) => {
      // A click while it runs ends it, and does nothing else.
      if (run) {
        e.preventDefault();
        e.stopPropagation();
        swallow = true;
        stop();
        return;
      }
      if (e.button !== 1) return;
      const target = e.target as Element | null;
      if (target?.closest('a[href], input, textarea, select, [contenteditable]')) return;
      const scroller = scrollerFor(target);
      if (!scroller) return;
      e.preventDefault();
      start(scroller, e.clientX, e.clientY);
    },
    { capture: true },
  );
  addEventListener(
    'mousemove',
    (e) => {
      if (run) run.py = e.clientY;
    },
    { capture: true, passive: true },
  );
  addEventListener(
    'mouseup',
    (e) => {
      if (!run || e.button !== 1 || !run.held) return;
      const quick = performance.now() - run.at < CLICK_MS && Math.abs(e.clientY - run.y) < CLICK_MOVE;
      // Pressed and let go at once: it keeps running until the next click.
      if (quick) run.held = false;
      else stop();
    },
    { capture: true },
  );
  for (const type of ['click', 'auxclick', 'contextmenu'])
    addEventListener(
      type,
      (e) => {
        if (!swallow) return;
        swallow = false;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true },
    );
  // A new press starts afresh, whatever became of the last one's click.
  addEventListener('pointerdown', () => !run && (swallow = false), { capture: true, passive: true });
  addEventListener('wheel', stop, { passive: true });
  addEventListener('keydown', stop);
  addEventListener('blur', stop);
}
