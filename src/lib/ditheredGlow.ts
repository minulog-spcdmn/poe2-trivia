// Soft glows drawn dithered: text-shadow and box-shadow glows, wherever they are.
//
// CSS draws a blurred shadow in 8 bits with no dither, so a soft glow steps
// through its few levels in visible rings, worst in the dark (CLAUDE.md, "No
// banding"). Noise laid over it afterwards only blurs the rings' edges: it has
// to go in before the glow is rounded. So the page draws each glow itself: its
// shape (the element's glyphs, or its box) blurred on the CPU in floating
// point, dithered as it's rounded, into a small canvas inside the element,
// under its content and over its own background. The browser then lays that
// canvas over what's beneath like any image, which keeps the dither.
//
// Glows stay written plainly. A build step (lib/glowCss.ts) copies each
// element's soft shadows into --text-glow, --box-glow-in and --box-glow-out
// and paints them through a variable; while this draws a kind, the element's
// data-glow lists it (text, in, out) and app.css swaps the CSS copy for a
// no-op. Where it can't draw one, CSS paints it as before: outer glows of an
// element that clips its overflow (the canvas would be clipped with it), text
// broken over lines, text before its fonts load, and any shadow a CSS
// animation is moving.
//
// It finds glowing elements as they come (added, changed, hovered), redraws
// one only when what it draws changed, and only on screen; a glow that goes
// on or off fades as the CSS transition did. An element only gets a canvas
// while it shows a glow, so there are only ever a few.

import { glyphsOf, drawGlyphs } from './glyphMask';

const FADE_MS = 250;
/** Time a frame may spend finding and drawing glows, ms; the rest waits (CSS shows them meanwhile). */
const FRAME_BUDGET_MS = 4;
const NO_HOST = /^(IMG|INPUT|TEXTAREA|SELECT|CANVAS|VIDEO|IFRAME|svg|BR|HR|OPTION)$/;

type Shadow = { color: [number, number, number, number]; x: number; y: number; blur: number; spread: number; inset: boolean };

type Host = {
  key: string;
  canvas: HTMLCanvasElement | null;
  styled: { position: string; isolation: string } | null;
};

const hosts = new Map<HTMLElement, Host>();
const onScreen = new Set<HTMLElement>();
const dirty = new Set<HTMLElement>();
/** Elements to look at, and roots to look through (with how many they may hold). */
const toConsider = new Set<Element>();
const toScan = new Map<Element, number>();
let allDirty = false;
let raf = 0;
let fontsGeneration = 0;
let io: IntersectionObserver | null = null;

// ---------- parsing ----------

let probe: HTMLDivElement | null = null;
const shadowCache = new Map<string, Shadow[]>();

/** A computed colour as [r, g, b, a], 0 to 1. */
function colorOf(text: string): [number, number, number, number] {
  const nums = (text.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(parseFloat);
  if (text.startsWith('rgb')) return [nums[0] / 255, nums[1] / 255, nums[2] / 255, nums[3] ?? 1];
  if (text.startsWith('color(srgb')) return [nums[0], nums[1], nums[2], nums[3] ?? 1];
  return [0, 0, 0, 0];
}

/** A shadow list, resolved through the browser's own parser. */
function parseShadows(decl: string): Shadow[] {
  const cached = shadowCache.get(decl);
  if (cached) return cached;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.display = 'none';
    document.body.append(probe);
  }
  probe.style.boxShadow = '';
  probe.style.boxShadow = decl;
  // Computed: "rgba(r, g, b, a) Xpx Ypx Bpx Spx [inset]", comma separated.
  const computed = getComputedStyle(probe).boxShadow;
  const shadows: Shadow[] = [];
  if (computed && computed !== 'none') {
    for (const m of computed.matchAll(/((?:rgba?|color)\([^)]*\))\s+([^,]*?)(?=,\s*(?:rgba?|color)\(|$)/g)) {
      const [x = 0, y = 0, blur = 0, spread = 0] = (m[2].match(/-?[\d.]+(?:e-?\d+)?px/g) ?? []).map(parseFloat);
      shadows.push({ color: colorOf(m[1]), x, y, blur, spread, inset: /inset/.test(m[2]) });
    }
  }
  shadowCache.set(decl, shadows);
  return shadows;
}

const softIn = (v: string) => !!v && v !== 'none';

// ---------- finding glowing elements ----------

function glowsOf(cs: CSSStyleDeclaration) {
  return {
    text: cs.getPropertyValue('--text-glow').trim(),
    in: cs.getPropertyValue('--box-glow-in').trim(),
    out: cs.getPropertyValue('--box-glow-out').trim(),
  };
}

function consider(el: Element) {
  if (!(el instanceof HTMLElement) || hosts.has(el) || NO_HOST.test(el.tagName) || el.dataset.glowCanvas !== undefined) return;
  const g = glowsOf(getComputedStyle(el));
  if (!softIn(g.text) && !softIn(g.in) && !softIn(g.out)) return;
  hosts.set(el, { key: '', canvas: null, styled: null });
  io?.observe(el);
}

/** Elements still to look at, a frame's time's worth at a time. */
const pending: Element[] = [];

/** Queues `root` and what it holds to be looked at, unless that's more than `limit`. */
function scan(root: Element, limit: number) {
  pending.push(root);
  const all = root.querySelectorAll('*');
  if (all.length <= limit) for (const el of all) pending.push(el);
}

function drop(el: HTMLElement) {
  const h = hosts.get(el);
  if (!h) return;
  h.canvas?.remove();
  if (h.styled) {
    el.style.position = h.styled.position;
    el.style.isolation = h.styled.isolation;
  }
  el.removeAttribute('data-glow');
  hosts.delete(el);
  onScreen.delete(el);
  dirty.delete(el);
  io?.unobserve(el);
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(pass);
}

/** Marks the glowing elements in and around `el` to be looked at again. */
function touched(el: Node | null) {
  for (let n: Node | null = el; n; n = n.parentNode) if (hosts.has(n as HTMLElement)) dirty.add(n as HTMLElement);
  if (el instanceof Element) {
    for (const h of hosts.keys()) if (el.contains(h)) dirty.add(h);
    toScan.set(el, Math.max(toScan.get(el) ?? 0, 1500));
  }
  schedule();
}

// ---------- drawing ----------

/** Box blur radii whose three passes approximate a Gaussian of `sigma`. */
function boxes(sigma: number): number[] {
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}

/** One box pass along rows (or columns, `vertical`), edges held. */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, vertical: boolean) {
  const lines = vertical ? w : h;
  const len = vertical ? h : w;
  const step = vertical ? w : 1;
  const k = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = vertical ? l : l * w;
    const first = src[base];
    const last = src[base + (len - 1) * step];
    let acc = (r + 1) * first;
    for (let i = 0; i < r; i++) acc += src[base + Math.min(i, len - 1) * step];
    for (let i = 0; i < len; i++) {
      const add = i + r < len ? src[base + (i + r) * step] : last;
      const sub = i - r - 1 >= 0 ? src[base + (i - r - 1) * step] : first;
      acc += add - sub;
      dst[base + i * step] = acc * k;
    }
  }
}

function blur(a: Float32Array, w: number, h: number, sigma: number) {
  if (sigma < 0.3) return a;
  const tmp = new Float32Array(a.length);
  for (const r of boxes(sigma)) {
    if (r < 1) continue;
    boxPass(a, tmp, w, h, r, false);
    boxPass(tmp, a, w, h, r, true);
  }
  return a;
}

/** `src` (sw x sh, at q of full size) stretched bilinearly to w x h. */
function upsample(src: Float32Array, sw: number, sh: number, q: number, w: number, h: number): Float32Array {
  if (sw === w && sh === h) return src;
  const out = new Float32Array(w * h);
  const xi = new Int32Array(w);
  const xf = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const u = Math.min(sw - 1, Math.max(0, (x + 0.5) * q - 0.5));
    xi[x] = Math.min(sw - 2, Math.floor(u));
    xf[x] = u - xi[x];
  }
  for (let y = 0; y < h; y++) {
    const v = Math.min(sh - 1, Math.max(0, (y + 0.5) * q - 0.5));
    const y0 = Math.max(0, Math.min(sh - 2, Math.floor(v)));
    const fy = sh > 1 ? v - y0 : 0;
    const r0 = y0 * sw;
    const r1 = sh > 1 ? r0 + sw : r0;
    for (let x = 0; x < w; x++) {
      const i = xi[x];
      const fx = sw > 1 ? xf[x] : 0;
      const j = sw > 1 ? i + 1 : i;
      const top = src[r0 + i] + (src[r0 + j] - src[r0 + i]) * fx;
      const bot = src[r1 + i] + (src[r1 + j] - src[r1 + i]) * fx;
      out[y * w + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

let scratch: HTMLCanvasElement | null = null;

/** Alpha of what `draw` paints on a w x h canvas, 0 to 1. */
function maskOf(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Float32Array {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  draw(ctx);
  const px = ctx.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
  return a;
}

type Radii = [number, number, number, number];

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Radii) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r.map((v) => Math.max(0, v)));
  ctx.fill();
}

// Triangular noise, one level wide each side, in a table read from a random start.
const NOISE = (() => {
  const t = new Float32Array(1 << 16);
  for (let i = 0; i < t.length; i++) t[i] = Math.random() + Math.random() - 1;
  return t;
})();

type State = {
  el: HTMLElement;
  cs: CSSStyleDeclaration;
  w: number;
  h: number;
  rect: DOMRect;
  s: number; // device px per local px
  kinds: string[];
  text: Shadow[];
  inset: Shadow[];
  outer: Shadow[];
};

/** What an element's glows need, and the key that changes when any of it does. */
function stateOf(el: HTMLElement): { state: State; key: string } | null {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') return null;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const rect = el.getBoundingClientRect();
  if (!w || !h || !rect.width) return null;
  const g = glowsOf(cs);
  // A shadow a CSS animation moves stays with CSS.
  const moving = new Set<string>();
  for (const a of el.getAnimations()) {
    if (!(a instanceof CSSAnimation) || !a.effect) continue;
    for (const k of (a.effect as KeyframeEffect).getKeyframes()) {
      if ('textShadow' in k) moving.add('text');
      if ('boxShadow' in k) moving.add('box');
    }
  }
  const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
  const kinds: string[] = [];
  if (!moving.has('text') && document.fonts?.status !== 'loading' && el.getClientRects().length <= 1) kinds.push('text');
  if (!moving.has('box')) kinds.push('in');
  if (!moving.has('box') && !clips) kinds.push('out');
  const soft = (v: string) => (softIn(v) ? parseShadows(v).filter((sh) => sh.color[3] > 0) : []);
  const text = kinds.includes('text') ? soft(g.text) : [];
  const inset = kinds.includes('in') ? soft(g.in).filter((sh) => sh.inset) : [];
  const outer = kinds.includes('out') ? soft(g.out).filter((sh) => !sh.inset) : [];
  const s = devicePixelRatio * (rect.width / w);
  const key = [
    kinds.join(' '),
    g.text,
    g.in,
    g.out,
    w,
    h,
    s.toFixed(3),
    text.length ? el.textContent : '',
    text.length ? cs.font + cs.letterSpacing + cs.textTransform : '',
    cs.borderRadius,
    cs.borderWidth,
    fontsGeneration,
  ].join('|');
  return { state: { el, cs, w, h, rect, s, kinds, text, inset, outer }, key };
}

/** The glows of `st` drawn dithered into a new canvas, or null when there's nothing to draw. */
function render(st: State): HTMLCanvasElement | null {
  const { el, cs, w, h, rect, s, text, inset, outer } = st;
  if (!text.length && !inset.length && !outer.length) return null;
  const reach = (list: Shadow[]) => Math.max(0, ...list.map((sh) => 1.5 * sh.blur + Math.abs(sh.spread) + Math.max(Math.abs(sh.x), Math.abs(sh.y))));
  // The area to draw, in the element's local px (its border box at 0, 0).
  let x0 = 0;
  let y0 = 0;
  let x1 = w;
  let y1 = h;
  const grow = (m: number) => {
    x0 = Math.min(x0, -m);
    y0 = Math.min(y0, -m);
    x1 = Math.max(x1, w + m);
    y1 = Math.max(y1, h + m);
  };
  // An inset glow is blurred from the outside in: room for that blur beyond the box.
  if (inset.length) grow(reach(inset));
  if (outer.length) grow(reach(outer));
  const toLocal = (vx: number, vy: number): [number, number] => [((vx - rect.left) * w) / rect.width, ((vy - rect.top) * h) / rect.height];
  // Text of descendants that set their own text-shadow is theirs to glow.
  const own = new Map<Element, boolean>();
  const mine = (e: Element): boolean => {
    if (e === el) return true;
    let v = own.get(e);
    if (v === undefined) {
      v = getComputedStyle(e).getPropertyValue('--text-glow').trim() === '' && (!e.parentElement || mine(e.parentElement));
      own.set(e, v);
    }
    return v;
  };
  const glyphs = text.length ? glyphsOf(el, toLocal, mine) : [];
  if (glyphs.length) {
    const em = parseFloat(cs.fontSize) || 16;
    const m = reach(text);
    x0 = Math.min(x0, Math.min(...glyphs.map((g) => g.cx)) - em - m);
    x1 = Math.max(x1, Math.max(...glyphs.map((g) => g.cx)) + em + m);
    y0 = Math.min(y0, Math.min(...glyphs.map((g) => g.cy)) - em - m);
    y1 = Math.max(y1, Math.max(...glyphs.map((g) => g.cy)) + em + m);
  }
  if (!glyphs.length && !inset.length && !outer.length) return null;

  // Canvas pixels on the screen's own: its left edge on a whole device px.
  const dpr = devicePixelRatio;
  const ox = rect.left * dpr;
  const oy = rect.top * dpr;
  x0 = (Math.floor(ox + x0 * s) - ox) / s;
  y0 = (Math.floor(oy + y0 * s) - oy) / s;
  const cw = Math.ceil((x1 - x0) * s);
  const ch = Math.ceil((y1 - y0) * s);
  if (cw * ch > 1 << 21) return null;
  // Local px to canvas px, at `k` of full size.
  const local = (ctx: CanvasRenderingContext2D, dx = 0, dy = 0, k = 1) => ctx.setTransform(s * k, 0, 0, s * k, (dx - x0) * s * k, (dy - y0) * s * k);
  // A shape blurred by `blurPx` (CSS blur, local px), full size. Blurred at a
  // reduced size, 4 texels or more per standard deviation (far cheaper, and
  // smooth all the same once stretched back); only the dither below needs
  // every pixel.
  const soft = (blurPx: number, draw: (ctx: CanvasRenderingContext2D, k: number, lw: number, lh: number) => void) => {
    const sigma = (blurPx / 2) * s;
    const q = Math.min(1, 4 / Math.max(sigma, 1e-3));
    const lw = Math.max(2, Math.ceil(cw * q));
    const lh = Math.max(2, Math.ceil(ch * q));
    return upsample(blur(maskOf(lw, lh, (ctx) => draw(ctx, q, lw, lh)), lw, lh, sigma * q), lw, lh, q, cw, ch);
  };

  const radius = (c: string) => parseFloat(c) || 0;
  const r: Radii = [radius(cs.borderTopLeftRadius), radius(cs.borderTopRightRadius), radius(cs.borderBottomRightRadius), radius(cs.borderBottomLeftRadius)];
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const br = parseFloat(cs.borderRightWidth) || 0;
  const bb = parseFloat(cs.borderBottomWidth) || 0;
  const inner: Radii = [r[0] - Math.max(bl, bt), r[1] - Math.max(br, bt), r[2] - Math.max(br, bb), r[3] - Math.max(bl, bb)];

  const n = cw * ch;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const A = new Float32Array(n);
  const over = (sh: Shadow, m: Float32Array) => {
    const [cr, cg, cb, ca] = sh.color;
    for (let i = 0; i < n; i++) {
      const a = ca * m[i];
      if (a <= 0) continue;
      const k = 1 - a;
      R[i] = cr * a + R[i] * k;
      G[i] = cg * a + G[i] * k;
      B[i] = cb * a + B[i] * k;
      A[i] = a + A[i] * k;
    }
  };

  // Bottom to top, as CSS paints them: outer shadows, inset ones, then the text's;
  // in each list the first is on top.
  if (outer.length) {
    const box = maskOf(cw, ch, (ctx) => (local(ctx), rrect(ctx, 0, 0, w, h, r)));
    for (const sh of [...outer].reverse()) {
      const m = soft(sh.blur, (ctx, k) => (local(ctx, sh.x, sh.y, k), rrect(ctx, -sh.spread, -sh.spread, w + 2 * sh.spread, h + 2 * sh.spread, r.map((v) => (v ? v + sh.spread : 0)) as Radii)));
      for (let i = 0; i < n; i++) m[i] *= 1 - box[i];
      over(sh, m);
    }
  }
  if (inset.length) {
    const pad = maskOf(cw, ch, (ctx) => (local(ctx), rrect(ctx, bl, bt, w - bl - br, h - bt - bb, inner)));
    for (const sh of [...inset].reverse()) {
      const m = soft(sh.blur, (ctx, k, lw, lh) => {
        ctx.fillRect(0, 0, lw, lh);
        ctx.globalCompositeOperation = 'destination-out';
        local(ctx, sh.x, sh.y, k);
        const sp = sh.spread;
        rrect(ctx, bl + sp, bt + sp, w - bl - br - 2 * sp, h - bt - bb - 2 * sp, inner.map((v) => v - sp) as Radii);
        ctx.globalCompositeOperation = 'source-over';
      });
      for (let i = 0; i < n; i++) m[i] *= pad[i];
      over(sh, m);
    }
  }
  for (const sh of [...text].reverse()) {
    if (!glyphs.length) break;
    over(sh, soft(sh.blur, (ctx, k) => (local(ctx, sh.x, sh.y, k), drawGlyphs(ctx, glyphs))));
  }

  // Rounded to 8 bits with the noise in: premultiplied, then handed to
  // putImageData unpremultiplied, which it multiplies back exactly.
  const img = new ImageData(cw, ch);
  const px = img.data;
  let j = (Math.random() * NOISE.length) | 0;
  const mask = NOISE.length - 1;
  let any = false;
  for (let i = 0; i < n; i++) {
    if (A[i] <= 0) continue;
    const a8 = Math.min(255, Math.max(0, Math.round(A[i] * 255 + NOISE[(j += 7) & mask])));
    if (!a8) continue;
    any = true;
    const k = 255 / a8;
    px[i * 4] = Math.round(Math.min(a8, Math.max(0, Math.round(R[i] * 255 + NOISE[(j += 13) & mask]))) * k);
    px[i * 4 + 1] = Math.round(Math.min(a8, Math.max(0, Math.round(G[i] * 255 + NOISE[(j += 13) & mask]))) * k);
    px[i * 4 + 2] = Math.round(Math.min(a8, Math.max(0, Math.round(B[i] * 255 + NOISE[(j += 13) & mask]))) * k);
    px[i * 4 + 3] = a8;
  }
  if (!any) return null;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  canvas.dataset.glowCanvas = '';
  canvas.setAttribute('aria-hidden', 'true');
  // Placed from the padding box, as an absolute child is; nothing the page's
  // rules give its children (`.row > *`) reaches it.
  canvas.style.cssText = [
    'all: initial',
    'position: absolute',
    `left: ${x0 - bl}px`,
    `top: ${y0 - bt}px`,
    `width: ${cw / s}px`,
    `height: ${ch / s}px`,
    'z-index: -1',
    'pointer-events: none',
    'image-rendering: pixelated',
  ].join(';');
  return canvas;
}

function show(el: HTMLElement, host: Host, canvas: HTMLCanvasElement | null, kinds: string[], fade: boolean) {
  const old = host.canvas;
  if (canvas) {
    if (!host.styled) {
      const cs = getComputedStyle(el);
      host.styled = { position: el.style.position, isolation: el.style.isolation };
      // A stacking context of its own, so the canvas goes over its background and under its content.
      if (cs.position === 'static') el.style.position = 'relative';
      el.style.isolation = 'isolate';
    }
    // First, not last: rules like `span:last-child` keep their meaning.
    el.prepend(canvas);
    if (fade && !matchMedia('(prefers-reduced-motion: reduce)').matches) canvas.animate([{ opacity: 0 }, { opacity: 1 }], FADE_MS);
  }
  host.canvas = canvas;
  if (old) {
    if (fade && old.isConnected) old.animate([{ opacity: 1 }, { opacity: 0 }], FADE_MS).finished.then(() => old.remove(), () => old.remove());
    else old.remove();
  }
  const list = kinds.join(' ');
  if (el.getAttribute('data-glow') !== list) el.setAttribute('data-glow', list);
}

// ---------- the frame pass ----------

function pass() {
  raf = 0;
  const t0 = performance.now();
  for (const [root, limit] of toScan) if (root.isConnected) scan(root, limit);
  toScan.clear();
  for (const el of toConsider) consider(el);
  toConsider.clear();
  while (pending.length && performance.now() - t0 < FRAME_BUDGET_MS / 2) consider(pending.pop()!);
  const look = allDirty ? [...onScreen] : [...dirty].filter((el) => onScreen.has(el));
  allDirty = false;
  let drawn = 0;
  for (const el of look) {
    dirty.delete(el);
    const host = hosts.get(el);
    if (!host) continue;
    if (!el.isConnected) {
      drop(el);
      continue;
    }
    if (host.canvas && host.canvas.parentNode !== el) host.key = '';
    const got = stateOf(el);
    if (!got) continue;
    if (got.key === host.key) continue;
    // One a frame at least, more while there's time.
    if (drawn && performance.now() - t0 > FRAME_BUDGET_MS) {
      dirty.add(el);
      continue;
    }
    drawn++;
    const first = host.key === '';
    host.key = got.key;
    show(el, host, render(got.state), got.state.kinds, !first);
  }
  for (const el of hosts.keys()) if (!el.isConnected) drop(el);
  if (dirty.size || toScan.size || pending.length) schedule();
}

let installed = false;

/** Starts drawing the page's soft glows dithered (main.ts). */
export function installDitheredGlows() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          onScreen.add(el);
          dirty.add(el);
        } else onScreen.delete(el);
      }
      schedule();
    },
    { rootMargin: '200px' },
  );
  new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === 'attributes') {
        const name = rec.attributeName ?? '';
        if (name === 'style' || name === 'data-glow' || name.startsWith('data-bs') || name.startsWith('data-behind')) continue;
        touched(rec.target);
      } else if (rec.type === 'characterData') touched(rec.target.parentNode);
      else {
        // Our own canvases coming and going; one taken away with the rest of
        // an element's content shows in the pass, which draws it again.
        const ours = (n: Node) => n instanceof HTMLElement && n.dataset.glowCanvas !== undefined;
        if ([...rec.addedNodes, ...rec.removedNodes].every(ours)) continue;
        touched(rec.target);
        for (const n of rec.addedNodes) if (n instanceof Element) toScan.set(n, Infinity);
      }
    }
    schedule();
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  // Hover and focus restyle without a mutation.
  // A hover lights what's hovered, what holds it, and what those hold (`.card:hover .name`).
  const restyle = (e: Event) => {
    allDirty = true;
    const t = e.target instanceof Element ? e.target : null;
    for (let n = t, i = 0; n && i < 8; n = n.parentElement, i++) toConsider.add(n);
    if (t?.parentElement) toScan.set(t.parentElement, Math.max(toScan.get(t.parentElement) ?? 0, 300));
    schedule();
  };
  for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout']) addEventListener(type, restyle, { capture: true, passive: true });
  addEventListener('resize', () => ((allDirty = true), schedule()));
  document.fonts?.addEventListener('loadingdone', () => {
    fontsGeneration++;
    allDirty = true;
    schedule();
  });
  const start = () => {
    toScan.set(document.body, Infinity);
    schedule();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1000 });
  else setTimeout(start, 200);
}
