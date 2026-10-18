// What a frame of the QA desk checks once its scene is at rest, so a stop
// with something wrong is marked red in the desk's strip without anyone
// having to spot it: something off the side of the screen, text cut off
// without meaning to be (an ellipsis or a line clamp is meant), an error in
// the console, a picture that didn't load, and an em dash, which CLAUDE.md
// rules out of everything the game says. The elements at fault are marked
// (data-qa-flag) and outlined, unless the desk has outlines off.

/** What a frame finds wrong; and banding, which only the sweep can see (scripts/qa.mjs, in a screenshot). */
export type Kind = 'offscreen' | 'clipped' | 'error' | 'image' | 'dash' | 'banding';
export const KIND_LABEL: Record<Kind, string> = {
  offscreen: 'Off the side of the screen',
  clipped: 'Text cut off',
  error: 'Console error',
  image: "Picture didn't load",
  dash: 'Em dash',
  banding: 'Banding',
};

/** One kind of problem on a page: how many, and the first few in words. */
export interface Problem {
  kind: Kind;
  count: number;
  examples: string[];
}

/** The em dash, built so no source file holds one (tests/style.test.ts). */
const DASH = String.fromCharCode(0x2014);
const FLAG = 'data-qa-flag';
/** The elements someone uses: one cut by the screen's side is out of reach. */
const CONTROL = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/;

/** Console errors, uncaught ones and pictures that failed, from the moment this is called (before the app loads). */
export function listen() {
  const errors: string[] = [];
  const images: string[] = [];
  const real = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    real(...args);
  };
  addEventListener(
    'error',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLImageElement) images.push(t.currentSrc || t.src);
      else if (e instanceof ErrorEvent) errors.push(e.message);
    },
    true,
  );
  addEventListener('unhandledrejection', (e) => errors.push(e.reason instanceof Error ? e.reason.message : String(e.reason)));
  return { errors, images };
}

const visible = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
/** The text an element holds itself (not its children's), trimmed. */
const ownText = (el: Element) =>
  Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('')
    .trim();
/** Where an element's own text lies, as drawn. */
function textBox(el: Element): DOMRect | null {
  const range = document.createRange();
  let box: DOMRect | null = null;
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    box = box ? new DOMRect(Math.min(box.left, r.left), Math.min(box.top, r.top), Math.max(box.right, r.right) - Math.min(box.left, r.left), Math.max(box.bottom, r.bottom) - Math.min(box.top, r.top)) : r;
  }
  return box;
}
/** Each line of an element's own text, as drawn. */
function textLines(el: Element): DOMRect[] {
  const range = document.createRange();
  const lines: DOMRect[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    lines.push(...Array.from(range.getClientRects()));
  }
  return lines;
}
/** The nearest box that cuts off what spills out of it (not one that scrolls), from `el` itself (`self`) or above, up to the app. */
function clipper(el: Element, axis: 'x' | 'y' | 'both', self = false): Element | null {
  for (let a = self ? el : el.parentElement; a && a.id !== 'app' && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    const ox = cs.overflowX;
    const oy = cs.overflowY;
    if (axis !== 'y' && (ox === 'auto' || ox === 'scroll')) return null;
    if (axis !== 'x' && (oy === 'auto' || oy === 'scroll')) return null;
    if ((axis !== 'y' && (ox === 'hidden' || ox === 'clip')) || (axis !== 'x' && (oy === 'hidden' || oy === 'clip'))) return a;
  }
  return null;
}
const meansToCut = (el: Element) => {
  const cs = getComputedStyle(el);
  return cs.textOverflow === 'ellipsis' || (!!cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
};
const describe = (el: Element) => {
  const text = ownText(el) || el.getAttribute('aria-label') || '';
  const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
  return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text.slice(0, 40)}"` : ''}`;
};
/** Only the outermost of elements at fault: what's inside one is the same fault. */
const outermost = (els: Element[]) => els.filter((el) => !els.some((o) => o !== el && o.contains(el)));

/** Checks the page as it is now; marks the elements at fault. */
export function check(heard: { errors: string[]; images: string[] }): Problem[] {
  for (const el of Array.from(document.querySelectorAll(`[${FLAG}]`))) el.removeAttribute(FLAG);
  const W = document.documentElement.clientWidth;
  const off: Element[] = [];
  const cut: Element[] = [];
  const dash: Element[] = [];
  const broken: string[] = [...heard.images];
  const all = Array.from(document.querySelectorAll('#app *'));
  for (const el of all) {
    if (el.closest(`[data-qa-ignore]`) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = ownText(el);
    // Content spilling past the side, partly: its text where the text lies, a
    // control, a picture that means something. Decoration (a circle's veil,
    // a glow) may bleed off the edge, and whole things off the side are
    // panels waiting to slide in.
    const decor = !!el.closest('[aria-hidden="true"]');
    const content = text ? textBox(el) : CONTROL.test(el.tagName) || el.getAttribute('role') === 'button' || (el instanceof HTMLImageElement && !!el.alt) ? r : null;
    if (content && !decor) {
      const past = content.right > W + 1 || content.left < -1;
      const gone = content.left >= W || content.right <= 0;
      if (past && !gone && !clipper(el, 'x')) off.push(el);
    }
    // Text cut off: a line of it past the box that clips it (the element's
    // own, or one around it). Sideways by more than a hair; up or down by a
    // good part of the line, as a display face's tall glyph box overhangs a
    // tight line without anything going missing. Not where the box means
    // to cut (an ellipsis, a line clamp) or is folded away (a chip shrunk
    // to its mark).
    if (text && !decor) {
      const box = clipper(el, 'both', true);
      if (box && !meansToCut(el) && !meansToCut(box)) {
        const o = box.getBoundingClientRect();
        const folded = o.width < 4 || o.height < 4;
        const out = textLines(el).some((l) => l.right > o.right + 2 || l.left < o.left - 2 || l.bottom > o.bottom + l.height * 0.35 || l.top < o.top - l.height * 0.35);
        if (!folded && out) cut.push(el);
      }
    }
    if (text.includes(DASH)) dash.push(el);
    for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) if (el.getAttribute(attr)?.includes(DASH)) dash.push(el);
    if (el instanceof HTMLImageElement && el.complete && el.naturalWidth === 0 && el.getAttribute('src')) broken.push(el.currentSrc || el.src);
  }
  const flagged = { offscreen: outermost(off), clipped: outermost(cut), dash: [...new Set(dash)] };
  for (const el of [...flagged.offscreen, ...flagged.clipped, ...flagged.dash]) el.setAttribute(FLAG, '');
  const problems: Problem[] = [];
  const add = (kind: Kind, examples: string[]) => {
    if (examples.length) problems.push({ kind, count: examples.length, examples: [...new Set(examples)].slice(0, 3) });
  };
  add('offscreen', flagged.offscreen.map(describe));
  add('clipped', flagged.clipped.map(describe));
  add('error', heard.errors);
  add('image', [...new Set(broken)]);
  add('dash', flagged.dash.map(describe));
  return problems;
}

/** Outlines the elements at fault (or stops). */
export function outline(on: boolean) {
  let style = document.getElementById('qa-outlines');
  if (!style) {
    style = document.createElement('style');
    style.id = 'qa-outlines';
    style.textContent = `[${FLAG}] { outline: 2px solid #ff4d3d !important; outline-offset: -2px !important; }`;
    document.head.append(style);
  }
  (style as HTMLStyleElement).disabled = !on;
}
