// What a frame of the QA desk checks once its scene is at rest, so a stop
// with something wrong is marked red in the desk's strip without anyone
// having to spot it: something off the side of the screen, text cut off
// without meaning to be (an ellipsis or a line clamp is meant), an error in
// the console, a picture that didn't load, an em dash, which CLAUDE.md
// rules out of everything the game says, a game that scrolls on a phone,
// on its side or upright, where it is laid out to fit the screen
// (lib/layout.ts `flat` and `upright`), and text too faint to read
// (../legible.ts).
// The elements at fault are marked (data-qa-flag) and outlined, unless the
// desk has outlines off.

import { CRASH_MESSAGE } from './crashCue.svelte.ts';
import { FLAT, UPRIGHT } from '../../lib/layout.ts';
import { FLOOR, PAGE, lc, luminance, over, type RGB } from '../legible.ts';

/** What a frame finds wrong; and banding, which only the sweep can see (scripts/sweep.mjs, in a screenshot). Faint text is measured in both: in a frame against the page's own dark, in the sweep against its shot. */
export type Kind = 'offscreen' | 'clipped' | 'error' | 'image' | 'dash' | 'scrolls' | 'banding' | 'faint';
export const KIND_LABEL: Record<Kind, string> = {
  offscreen: 'Off the side of the screen',
  clipped: 'Text cut off',
  error: 'Console error',
  image: "Picture didn't load",
  dash: 'Em dash',
  scrolls: 'Scrolls on a phone',
  banding: 'Banding',
  faint: 'Hard to read',
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
    const said = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
    // (A crash a scene set off on purpose is no error of the game's: crashCue.svelte.ts.)
    if (!said.includes(CRASH_MESSAGE)) errors.push(said);
    real(...args);
  };
  addEventListener(
    'error',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLImageElement) images.push(t.currentSrc || t.src);
      // (Chrome's note that a ResizeObserver's callback changed a size it watches is harmless, and comes and goes.)
      else if (e instanceof ErrorEvent && !/^ResizeObserver loop/.test(e.message) && !e.message.includes(CRASH_MESSAGE)) errors.push(e.message);
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
/** Whether a box cuts its text short on purpose: to an ellipsis, a line clamp, or a fade over its end that says so (data-fade-cut: Lobby's fadeCut). */
const meansToCut = (el: Element) => {
  const cs = getComputedStyle(el);
  return cs.textOverflow === 'ellipsis' || (!!cs.webkitLineClamp && cs.webkitLineClamp !== 'none') || el.hasAttribute('data-fade-cut');
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
    // (A line that ends in an ellipsis shows no more than its own box, nor
    // does a box that cuts off its own overflow: a screen reader's word
    // kept to a pixel, its letters running on past it unseen.)
    const content = text ? (meansToCut(el) || clipper(el, 'x', true) === el ? r : textBox(el)) : CONTROL.test(el.tagName) || el.getAttribute('role') === 'button' || (el instanceof HTMLImageElement && !!el.alt) ? r : null;
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
  const faint = faintText();
  for (const f of faint) f.el.setAttribute(FLAG, '');
  problems.push(...faintProblem(faint));
  // A game screen (Game.svelte's) on a phone, on its side or upright, fits the screen: art, answers and Next in view at once.
  const over = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  if ((matchMedia(FLAT).matches || matchMedia(UPRIGHT).matches) && document.querySelector('#app .game > .turns') && over > 1) add('scrolls', [`${over}px taller than the screen`]);
  return problems;
}

/**
 * A run of text as drawn: an element's own text, its lines' boxes, its
 * colour (its alpha times its own opacity: a whole row or tile faded with
 * the opacity of something around it is a state, a choice not taken or a
 * player gone, dim on purpose, as is anything in one marked data-dim where
 * the fade sits on the text itself), its size and face.
 */
interface TextRun {
  el: Element;
  text: string;
  lines: DOMRect[];
  rgba: [number, number, number, number];
  size: number;
  italic: boolean;
  font: string;
}

/** A colour as the browser gives it, as numbers: rgb() or rgba(), or color(srgb ...) for a mix (anything else null). */
const rgbaOf = (css: string): [number, number, number, number] | null => {
  const [r = 0, g = 0, b = 0, a = 1] = css.match(/[\d.]+/g)?.map(Number) ?? [];
  if (/^rgba?\(/.test(css)) return [r, g, b, a];
  if (css.startsWith('color(srgb ')) return [r * 255, g * 255, b * 255, a];
  return null;
};

/**
 * Every run of text on show that someone reads: not decoration, not a
 * disabled control's. `keep`, given a run before its lines are found, can
 * leave it out at once: finding its lines and what's over them is the dear
 * part. With `one`, only its first line on show is found (a frame's check,
 * whose page's dark is the same behind every line).
 */
function textRuns(keep: (run: Omit<TextRun, 'lines'>) => boolean, one: boolean): TextRun[] {
  const runs: TextRun[] = [];
  const H = document.documentElement.clientHeight;
  const W = document.documentElement.clientWidth;
  /** Whether a box stays put over the page (fixed or sticky), once per box in a pass. */
  const pinned = new Map<Element, boolean>();
  const isPinned = (el: Element) => {
    let v = pinned.get(el);
    if (v === undefined) pinned.set(el, (v = /fixed|sticky/.test(getComputedStyle(el).position)));
    return v;
  };
  /**
   * Whether a box lies in one shut to a pixel that cuts off what's in it (text kept for screen readers alone), once per box
   * in a pass. Only the boxes that clip it count: one positioned fixed is clipped by none of those round it, one positioned
   * absolute by none inside its containing block (the nearest box round it positioned, or one that holds fixed boxes too:
   * moved by a transform or its own translate, rotate or scale, given a perspective, a filter or a backdrop's, contained,
   * a container, or about to be one of those, will-change).
   */
  const shut = new Map<Element, boolean>();
  const holds = (cs: CSSStyleDeclaration, fixed: boolean) =>
    (!fixed && cs.position !== 'static') ||
    cs.transform !== 'none' ||
    cs.translate !== 'none' ||
    cs.rotate !== 'none' ||
    cs.scale !== 'none' ||
    cs.perspective !== 'none' ||
    cs.filter !== 'none' ||
    cs.backdropFilter !== 'none' ||
    /paint|layout|strict|content/.test(cs.contain) ||
    cs.containerType !== 'normal' ||
    /transform|translate|rotate|scale|perspective|filter/.test(cs.willChange);
  const shutIn = (el: Element): boolean => {
    let v = shut.get(el);
    if (v !== undefined) return v;
    const { position } = getComputedStyle(el);
    let up = el.parentElement;
    if (position === 'fixed' || position === 'absolute') while (up && up.id !== 'app' && !holds(getComputedStyle(up), position === 'fixed')) up = up.parentElement;
    v = false;
    if (up && up.id !== 'app') {
      const cs = getComputedStyle(up);
      const r = up.getBoundingClientRect();
      const cuts = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none';
      v = (cuts && (r.width <= 1 || r.height <= 1)) || shutIn(up);
    }
    shut.set(el, v);
    return v;
  };
  for (const el of Array.from(document.querySelectorAll('#app *'))) {
    const text = ownText(el);
    // (A lone glyph, an initial or a digit or a dot, reads by its shape, and fills most of its own box: what's behind it can't be read off the shot.)
    if ([...text].length < 2) continue;
    // (What's hidden from screen readers is decoration, but for a chart's own labels: SVG text, read by eye, the chart put in words beside it.)
    if (
      (el.closest('[aria-hidden="true"]') && !(el instanceof SVGTextContentElement)) ||
      el.closest('[data-qa-ignore], :disabled, [aria-disabled="true"], [data-dim]') ||
      !visible(el)
    )
      continue;
    // (Text kept for screen readers alone, in a box a pixel wide.)
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    const cs = getComputedStyle(el);
    // SVG text is painted with its fill. (Text a gradient paints, through a transparent fill or a fill that's a picture, is left out: its colour isn't one.)
    const fill = el instanceof SVGElement ? cs.fill : cs.webkitTextFillColor || cs.color;
    const rgba = rgbaOf(fill);
    if (!rgba) continue;
    rgba[3] *= Number(cs.opacity);
    if (rgba[3] < 0.05) continue;
    const font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    // (An SVG's text is sized in its own units: on screen, times the drawing's scale.)
    const scale = el instanceof SVGGraphicsElement ? Math.hypot(el.getScreenCTM()?.a ?? 1, el.getScreenCTM()?.b ?? 0) : 1;
    const run = { el, text, rgba, size: parseFloat(cs.fontSize) * scale, italic: cs.fontStyle === 'italic', font };
    if (!keep(run)) continue;
    // (Or in a box round it that's a pixel wide: a phone's scoreboard keeps the others' names so, behind their avatars.)
    if (shutIn(el)) continue;
    // (A line under what stays put over the page, a phone's docked bar, a dialog's backdrop, a toast, isn't on show: what's in front is.
    // Only those: a row's own button stretched over its text is no cover. And only where the text itself can be hit: one that lets the
    // pointer through says nothing of what's over it, so it's measured as it lies.)
    const covered = (l: DOMRect) => {
      if (cs.pointerEvents === 'none') return false;
      const hit = document.elementFromPoint(Math.min(W - 1, Math.max(0, l.left + l.width / 2)), Math.min(H - 1, Math.max(0, l.top + l.height / 2)));
      if (!hit || el.contains(hit) || hit.contains(el)) return false;
      for (let up: Element | null = hit; up && !up.contains(el); up = up.parentElement) if (isPinned(up)) return true;
      return false;
    };
    const shown = (l: DOMRect) => l.width > 1 && l.height > 1 && l.bottom > 0 && l.top < H && l.right > 0 && l.left < W && !covered(l);
    const all = textLines(el);
    const first = one ? all.find(shown) : undefined;
    const lines = one ? (first ? [first] : []) : all.filter(shown);
    if (!lines.length) continue;
    runs.push({ ...run, lines });
  }
  return runs;
}

/** A run of text too faint to read well: its Lc against what's behind it, the floor it falls under, and the colours measured. */
export interface Faint {
  el: Element;
  where: string;
  text: string;
  lc: number;
  needs: number;
  bg: string;
  seen: string;
  size: number;
  font: string;
  italic: boolean;
}

const hex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Lightness bins for behind(): Rec. 709 luma of the 8-bit values, which orders colours as luminance does, in quarter steps; each bin's count and its colours summed. */
const BINS = 1024;
const binCount = new Uint32Array(BINS);
const binSum = new Float64Array(BINS * 3);

/** What's behind a line of text in a shot: most of a line's box is background (glyphs cover a fifth of it or less), so the 40th percentile of its lightness under light text, the 60th under dark (away from the glyphs, a glow's brighter part still counted). */
function behind(shot: ImageData, l: DOMRect, rgba: [number, number, number, number]): RGB | null {
  const x0 = Math.max(0, Math.round(l.left));
  const y0 = Math.max(0, Math.round(l.top));
  const x1 = Math.min(shot.width, Math.round(l.right));
  const y1 = Math.min(shot.height, Math.round(l.bottom));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  binCount.fill(0);
  binSum.fill(0);
  const d = shot.data;
  for (let y = y0; y < y1; y++)
    for (let i = (y * shot.width + x0) * 4, end = (y * shot.width + x1) * 4; i < end; i += 4) {
      const k = Math.min(BINS - 1, (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * 4) | 0;
      binCount[k]++;
      binSum[k * 3] += d[i];
      binSum[k * 3 + 1] += d[i + 1];
      binSum[k * 3 + 2] += d[i + 2];
    }
  const n = (x1 - x0) * (y1 - y0);
  /** The colour at the q-th darkest pixel: its bin's mean. */
  const at = (q: number): RGB => {
    for (let k = 0, seen = 0; k < BINS; k++) {
      seen += binCount[k];
      if (seen > q) return [binSum[k * 3] / binCount[k], binSum[k * 3 + 1] / binCount[k], binSum[k * 3 + 2] / binCount[k]];
    }
    return [0, 0, 0];
  };
  const mid = at(n >> 1);
  const light = luminance(over(rgba, mid)) > luminance(mid);
  return at(Math.floor(n * (light ? 0.4 : 0.6)));
}

/**
 * The runs of text on show too faint to read well. Without a shot, each
 * light run against the page's own dark, the best it can have (whatever's
 * behind it only takes from that), leaving dark text, which sits on
 * something light, to the sweep; with the sweep's shot of the page (at CSS
 * pixels: shotPixels), each line against what's actually behind it there.
 */
export function faintText(shot?: ImageData): Faint[] {
  const found: Faint[] = [];
  // (Without a shot each run is judged on the page's own dark alone, before its lines are found: one that reads there, or dark
  // text, the sweep's, is left out then.)
  const keep = (run: Omit<TextRun, 'lines'>) => {
    if (shot) return true;
    const seen = over(run.rgba, PAGE);
    return luminance(seen) >= 0.18 && lc(seen, PAGE) < FLOOR;
  };
  for (const run of textRuns(keep, !shot)) {
    let worst: { lc: number; bg: RGB; seen: RGB } | null = null;
    for (const l of run.lines) {
      const bg = shot ? behind(shot, l, run.rgba) : PAGE;
      if (!bg) continue;
      const seen = over(run.rgba, bg);
      if (!shot && luminance(seen) < 0.18) break;
      const v = lc(seen, bg);
      if (!worst || v < worst.lc) worst = { lc: v, bg, seen };
    }
    if (worst && worst.lc < FLOOR)
      found.push({
        el: run.el,
        where: describe(run.el),
        text: run.text.slice(0, 60),
        lc: Math.round(worst.lc * 10) / 10,
        needs: Math.round(FLOOR * 10) / 10,
        bg: hex(worst.bg),
        seen: hex(worst.seen),
        size: run.size,
        font: run.font,
        italic: run.italic,
      });
  }
  return found;
}

/**
 * The sweep's shot of the page (a PNG, base64) as pixels, to measure what's
 * behind the text in it: drawn at CSS pixels, the boxes' own, whatever it was
 * shot at (--banding shoots at the device's pixel ratio).
 */
export async function shotPixels(png: string): Promise<ImageData> {
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const k = img.naturalWidth / innerWidth;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth / k);
  canvas.height = Math.round(img.naturalHeight / k);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * What a page shot as a page of its own (the sweep's) reads once it has come
 * to rest: whether it settled and what it found (__qa), and __qaFaint, which
 * measures its text against the sweep's own shot of it: the runs too faint
 * there, and them as the problem to list in place of the frame's own.
 */
export function publish(settled: boolean, problems: Problem[]) {
  const faint = async (png: string) => {
    const found = faintText(await shotPixels(png));
    return { texts: found.map(({ el: _, ...f }) => f), problems: faintProblem(found) };
  };
  Object.assign(window, { __qa: { settled, problems }, __qaFaint: faint });
}

/** The faint runs as a problem to list: how many, a few named with their Lc against what they need. */
export const faintProblem = (found: Pick<Faint, 'where' | 'lc' | 'needs'>[]): Problem[] =>
  found.length ? [{ kind: 'faint', count: found.length, examples: [...new Set(found.map((f) => `${f.where} at Lc ${f.lc} (needs ${f.needs})`))].slice(0, 3) }] : [];

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
