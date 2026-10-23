// `filter: drop-shadow()` drawn by the WebGL backdrop instead of CSS.
//
// Drop shadows follow an element's shape (glyphs, image alpha), so unlike
// box-shadows they can't be drawn in closed form. Instead each tagged element
// gets an alpha mask of its shape: its image drawn as `object-fit` does, or
// its text drawn glyph by glyph at the positions the browser laid them out.
// The mask is blurred once, in floating point in a worker (dropBlur.ts),
// and stored at 16-bit precision (two 8-bit channels) so the shadow's own
// gradient can't band; the backdrop then samples it every frame through the
// element's current position, rotation, scale and opacity, and dithers the
// result.
//
// Usage: tag the element with `use:backdropDropShadow`, declare its shadows
// in `--drop-shadow` (at most two drop-shadow() functions), and paint them as
// `filter: … var(--drop-shadow-paint, var(--drop-shadow))`. While the backdrop
// draws the element it sets `data-bs-drop`, which (via app.css) swaps the
// drop-shadow part of the filter for a no-op. Whenever it can't (3D turns,
// fonts or image not ready, its shape still changing or its blur on its way,
// over budget, no WebGL), the attribute stays off and CSS paints the shadow
// as usual.
//
// Only text and <img> content is masked: a text element's non-text children
// (such as the title's thin decorative lines) cast no shadow here. Their CSS
// shadow is faint enough not to matter.

import { backgroundPainter } from './backdropShadow';
import { blurMask } from './dropBlur';
import type { BlurAnswer, BlurJob } from './dropBlurWorker';
import { linearOf, type Lin } from './linear';
import { opacityOf } from './opacity';

const tagged = new Set<HTMLElement>();

/** Svelte action: let the backdrop draw this element's drop shadows. */
export function backdropDropShadow(node: HTMLElement) {
  tagged.add(node);
  return {
    destroy() {
      tagged.delete(node);
      node.removeAttribute('data-bs-drop');
      masks.delete(node);
      unsettled.delete(node);
      blurring.delete(node);
      unmaskable.delete(node);
      atlasDirty = true;
    },
  };
}

export const MAX_MASKS = 8;
export const DROPS_PER_MASK = 2;
const SHARP_ATLAS_W = 2048;
const BLUR_ATLAS_W = 1024;

type Drop = { color: number[]; ox: number; oy: number; sigma: number };

type Mask = {
  key: string;
  drops: Drop[];
  // Mask region in the element's local px (border-box origin), padding included.
  x: number;
  y: number;
  w: number;
  h: number;
  sharp: HTMLCanvasElement; // content alpha at 1 local px per texel
  q: number; // blur texels per local px
  bw: number;
  bh: number;
  blur: Uint8Array; // RGBA: drop 1 in R+G, drop 2 in B+A (16-bit each)
  // Placement in the atlases, in texels.
  sx: number;
  sy: number;
  bx: number;
  by: number;
};

const masks = new Map<HTMLElement, Mask>();
/** Per element, the shape (mask key) it last changed to that has no mask yet (see measureDrops). */
const unsettled = new Map<HTMLElement, string>();
/** Per element, the shape whose mask is being blurred in the worker, and the job's id. */
const blurring = new Map<HTMLElement, { id: number; key: string }>();
/** Per element, the shape it can't have a mask for (too wide, no glyphs): not tried again until it changes. */
const unmaskable = new Map<HTMLElement, string>();
let atlasDirty = true;
let fontsGeneration = 0;
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener('loadingdone', () => fontsGeneration++);
}

export function releaseAllDrops() {
  for (const node of tagged) node.removeAttribute('data-bs-drop');
}

// ---------- parsing ----------

let probe: HTMLDivElement | null = null;
const dropCache = new Map<string, Drop[]>();

/** Resolves a `--drop-shadow` declaration to drop shadows, via the browser's own parser. */
function parseDrops(decl: string): Drop[] {
  const cached = dropCache.get(decl);
  if (cached) return cached;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.display = 'none';
    document.body.append(probe);
  }
  probe.style.filter = '';
  probe.style.filter = decl;
  const computed = getComputedStyle(probe).filter; // e.g. drop-shadow(rgba(0, 0, 0, 0.9) 0px 4px 18px)
  const drops: Drop[] = [];
  for (const m of computed.matchAll(/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g)) {
    const body = m[1];
    const colorMatch = body.match(/(?:rgba?|color)\([^)]*\)/);
    const nums = ((colorMatch ? colorMatch[0] : '').match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(parseFloat);
    const [r = 0, g = 0, b = 0, alpha = 1] = nums;
    let color = [0, 0, 0, 1];
    if (colorMatch?.[0].startsWith('rgb')) color = [r / 255, g / 255, b / 255, alpha];
    else if (colorMatch?.[0].startsWith('color(srgb')) color = [r, g, b, alpha];
    const rest = colorMatch ? body.replace(colorMatch[0], '') : body;
    const [ox = 0, oy = 0, blur = 0] = (rest.match(/-?[\d.]+(?:e-?\d+)?px/g) ?? []).map(parseFloat);
    // The blur value is twice the Gaussian's standard deviation.
    drops.push({ color, ox, oy, sigma: Math.max(blur / 2, 0.5) });
  }
  dropCache.set(decl, drops);
  return drops;
}

// ---------- geometry ----------

// ---------- masks ----------

type Glyph = { ch: string; cx: number; cy: number };

/** Text glyphs with their centres in local px, from the browser's own layout. */
function glyphsOf(node: HTMLElement, toLocal: (x: number, y: number) => [number, number]) {
  const glyphs: Glyph[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const text = t.data;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(t, i);
      range.setEnd(t, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      const [cx, cy] = toLocal(r.left + r.width / 2, r.top + r.height / 2);
      glyphs.push({ ch: text[i], cx, cy });
    }
  }
  return glyphs;
}

function textTransform(ch: string, tt: string) {
  if (tt === 'uppercase') return ch.toUpperCase();
  if (tt === 'lowercase') return ch.toLowerCase();
  return ch;
}

/** Draws the element's content alpha in local px, offset by (-x, -y) and scaled by `s`. */
function drawContent(
  ctx: CanvasRenderingContext2D,
  node: HTMLElement,
  cs: CSSStyleDeclaration,
  glyphs: Glyph[],
  x: number,
  y: number,
  s: number,
) {
  ctx.setTransform(s, 0, 0, s, -x * s, -y * s);
  if (node instanceof HTMLImageElement) {
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const iw = node.naturalWidth;
    const ih = node.naturalHeight;
    let dw = w;
    let dh = h;
    if (cs.objectFit === 'contain' || cs.objectFit === 'scale-down') {
      const k = Math.min(w / iw, h / ih, cs.objectFit === 'scale-down' ? 1 : Infinity);
      dw = iw * k;
      dh = ih * k;
    } else if (cs.objectFit === 'cover') {
      const k = Math.max(w / iw, h / ih);
      dw = iw * k;
      dh = ih * k;
    } else if (cs.objectFit === 'none') {
      dw = iw;
      dh = ih;
    }
    ctx.drawImage(node, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  const ls = parseFloat(cs.letterSpacing) || 0;
  for (const g of glyphs) {
    const ch = textTransform(g.ch, cs.textTransform);
    const m = ctx.measureText(ch);
    // The glyph's layout box spans the font's ascent + descent (plus the
    // letter-spacing the browser adds after it), centred on its rect.
    const baseline = g.cy + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    ctx.fillText(ch, g.cx - ls / 2, baseline);
  }
}

/** The mask's shape: everything but its blur, with the alpha to blur. */
type Shape = Omit<Mask, 'blur'> & { alpha: Float32Array };

function shapeOf(node: HTMLElement, cs: CSSStyleDeclaration, key: string, drops: Drop[], lin: Lin): Shape | null {
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const rect = node.getBoundingClientRect();
  const det = lin[0] * lin[3] - lin[1] * lin[2];
  if (!det) return null;
  const inv: Lin = [lin[3] / det, -lin[1] / det, -lin[2] / det, lin[0] / det];
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const toLocal = (x: number, y: number): [number, number] => [
    inv[0] * (x - cx) + inv[2] * (y - cy) + w / 2,
    inv[1] * (x - cx) + inv[3] * (y - cy) + h / 2,
  ];

  // Content bounds in local px.
  let x0 = 0;
  let y0 = 0;
  let x1 = w;
  let y1 = h;
  let glyphs: Glyph[] = [];
  if (!(node instanceof HTMLImageElement)) {
    glyphs = glyphsOf(node, toLocal);
    if (!glyphs.length) return null;
    const em = parseFloat(cs.fontSize) || 16;
    x0 = Math.min(...glyphs.map((g) => g.cx)) - em;
    x1 = Math.max(...glyphs.map((g) => g.cx)) + em;
    y0 = Math.min(...glyphs.map((g) => g.cy)) - em;
    y1 = Math.max(...glyphs.map((g) => g.cy)) + em;
  }
  const pad =
    Math.max(...drops.map((d) => 3 * d.sigma + Math.max(Math.abs(d.ox), Math.abs(d.oy)))) + 2;
  const x = Math.floor(x0 - pad);
  const y = Math.floor(y0 - pad);
  const mw = Math.ceil(x1 + pad) - x;
  const mh = Math.ceil(y1 + pad) - y;
  if (mw > SHARP_ATLAS_W - 2) return null;

  const sharp = document.createElement('canvas');
  sharp.width = mw;
  sharp.height = mh;
  drawContent(sharp.getContext('2d')!, node, cs, glyphs, x, y, 1);

  // Blur at a reduced scale: at least 4 texels per sigma keeps bilinear
  // sampling of the result smooth, and it's far cheaper.
  const q = Math.min(1, 4 / Math.min(...drops.map((d) => d.sigma)));
  const bw = Math.ceil(mw * q);
  const bh = Math.ceil(mh * q);
  if (bw > BLUR_ATLAS_W - 2) return null;
  const small = document.createElement('canvas');
  small.width = bw;
  small.height = bh;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  drawContent(sctx, node, cs, glyphs, x, y, q);
  const px = sctx.getImageData(0, 0, bw, bh).data;
  const alpha = new Float32Array(bw * bh);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3] / 255;
  return { key, drops, x, y, w: mw, h: mh, sharp, q, bw, bh, alpha, sx: 0, sy: 0, bx: 0, by: 0 };
}

/** How many masks made lately are kept (recent). */
const RECENT = 8;
/**
 * Masks made lately, by the kind of element and its shape: one that comes
 * back (a turn's banner, made afresh each turn, naming the same player a
 * round later) takes its mask again at once.
 */
const recent = new Map<string, Mask>();
const recentKey = (node: HTMLElement, key: string) => `${node.tagName}|${node.className}|${key}`;

let worker: Worker | null | undefined;
let lastJob = 0;
/** What each blur sent to the worker does with its answer. */
const answers = new Map<number, (blur: Uint8Array) => void>();

/** The worker the masks are blurred in; null where there's none (the blur is done here then). */
function blurWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./dropBlurWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<BlurAnswer>) => {
      answers.get(data.id)?.(data.blur);
      answers.delete(data.id);
    };
    // (Failed to load, say: the masks are blurred here from now on, those it had made again.)
    w.onerror = () => {
      w.terminate();
      worker = null;
      answers.clear();
      blurring.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Makes `node`'s mask for its shape `key`: its shape here, as it must be
 * (the browser's own layout of it), and its blur in the worker. The mask
 * comes in a few frames later, CSS painting the shadow meanwhile.
 */
function startMask(node: HTMLElement, cs: CSSStyleDeclaration, key: string, drops: Drop[], lin: Lin) {
  const kept = recentKey(node, key);
  const known = recent.get(kept);
  if (known) {
    masks.set(node, known);
    atlasDirty = true;
    return;
  }
  const shape = shapeOf(node, cs, key, drops, lin);
  if (!shape) {
    masks.delete(node);
    unmaskable.set(node, key);
    atlasDirty = true;
    return;
  }
  const { alpha, ...rest } = shape;
  const sigmas = drops.slice(0, DROPS_PER_MASK).map((d) => d.sigma * shape.q);
  const done = (blur: Uint8Array) => {
    const mask = { ...rest, blur };
    masks.set(node, mask);
    atlasDirty = true;
    recent.delete(kept);
    recent.set(kept, mask);
    if (recent.size > RECENT) recent.delete(recent.keys().next().value!);
  };
  const w = blurWorker();
  if (!w) return done(blurMask(alpha, shape.bw, shape.bh, sigmas));
  const id = ++lastJob;
  blurring.set(node, { id, key });
  answers.set(id, (blur) => {
    // (Not if its shape changed again meanwhile, or it's gone.)
    if (blurring.get(node)?.id !== id) return;
    blurring.delete(node);
    done(blur);
  });
  w.postMessage({ id, alpha, bw: shape.bw, bh: shape.bh, sigmas } satisfies BlurJob, [alpha.buffer]);
}

// ---------- per-frame measurement ----------

export type Atlases = {
  sharp: HTMLCanvasElement;
  blur: Uint8Array;
  blurW: number;
  blurH: number;
};

/** Packs rows of boxes left to right, 1 texel apart. Returns the total height. */
function shelfPack(items: { w: number; h: number; place: (x: number, y: number) => void }[], width: number) {
  let x = 1;
  let y = 1;
  let row = 0;
  for (const it of items) {
    if (x + it.w + 1 > width) {
      x = 1;
      y += row + 1;
      row = 0;
    }
    it.place(x, y);
    x += it.w + 1;
    row = Math.max(row, it.h);
  }
  return y + row + 1;
}

/** The sharp atlas's canvas, kept from one build to the next (a new one each time is a new buffer in the GPU's process): only ever made taller. */
let sharpAtlas: HTMLCanvasElement | null = null;

function buildAtlases(list: Mask[]): Atlases {
  const sh = shelfPack(
    list.map((m) => ({ w: m.w, h: m.h, place: (x, y) => ((m.sx = x), (m.sy = y)) })),
    SHARP_ATLAS_W,
  );
  const sharp = (sharpAtlas ??= Object.assign(document.createElement('canvas'), { width: SHARP_ATLAS_W, height: 1 }));
  if (sharp.height < sh) sharp.height = sh;
  const ctx = sharp.getContext('2d');
  ctx?.clearRect(0, 0, sharp.width, sharp.height);
  for (const m of list) ctx?.drawImage(m.sharp, m.sx, m.sy);

  const bh = Math.max(
    1,
    shelfPack(
      list.map((m) => ({ w: m.bw, h: m.bh, place: (x, y) => ((m.bx = x), (m.by = y)) })),
      BLUR_ATLAS_W,
    ),
  );
  const blur = new Uint8Array(BLUR_ATLAS_W * bh * 4);
  for (const m of list) {
    for (let row = 0; row < m.bh; row++) {
      blur.set(m.blur.subarray(row * m.bw * 4, (row + 1) * m.bw * 4), ((m.by + row) * BLUR_ATLAS_W + m.bx) * 4);
    }
  }
  return { sharp, blur, blurW: BLUR_ATLAS_W, blurH: bh };
}

/**
 * Measures the tagged elements and fills the uniform arrays (see the shader):
 * - a: (centre x, centre y, width, height), viewport / local px
 * - b: inverse linear map (a, b, c, d), viewport to local
 * - c: mask region (x, y, w, h) in local px; w = 0 marks an unused slot
 * - d: mask placement in the sharp and blur atlases (texels)
 * - e: (blur texels per local px, inside a fill the backdrop draws (1) or not (0), 0, 0)
 * - off: (x1, y1, x2, y2) drop offsets, local px
 * - col: (r, g, b, alpha) per drop, alpha 0 for none
 * Returns new atlases when any mask changed (to upload), else null.
 */
export function measureDrops(
  a: Float32Array,
  b: Float32Array,
  c: Float32Array,
  d: Float32Array,
  e: Float32Array,
  off: Float32Array,
  col: Float32Array,
  viewW: number,
  viewH: number,
): Atlases | null {
  for (const arr of [a, b, c, d, e, off, col]) arr.fill(0);
  const active: [HTMLElement, Mask, Lin, number, DOMRect, boolean][] = [];
  // Per-element style reads, shared by the tagged elements' common ancestors.
  // Nothing below changes a transform or an opacity (data-bs-drop only swaps
  // the filter), so they hold for the whole pass.
  const linears = new Map<Element, Lin | null>();
  const opacities = new Map<Element, number>();
  const paintsAt = backgroundPainter();
  for (const node of tagged) {
    let ok = node.isConnected && active.length < MAX_MASKS;
    const cs = ok ? getComputedStyle(node) : null;
    const decl = cs ? cs.getPropertyValue('--drop-shadow').trim() : '';
    const drops = decl ? parseDrops(decl) : [];
    ok &&= drops.length > 0 && drops.length <= DROPS_PER_MASK;
    const lin = ok ? linearOf(node, linears) : null;
    ok &&= !!lin;
    const opacity = ok ? opacityOf(node, opacities) : 0;
    ok &&= opacity > 0;
    if (ok && node instanceof HTMLImageElement) ok = node.complete && node.naturalWidth > 0;
    if (ok && !(node instanceof HTMLImageElement)) ok = document.fonts?.status !== 'loading';
    // What lies under it: the backdrop; or a fill the backdrop draws (an
    // ancestor with data-bs-fill, measureShadows having just written them),
    // so the shadow is drawn after the fills, over it; or a background CSS
    // paints, which would cover the shadow drawn here.
    let inFill = false;
    for (let el = node.parentElement; ok && el && el !== document.body; el = el.parentElement) {
      if (el.hasAttribute('data-bs-fill')) {
        inFill = true;
        break;
      }
      if (paintsAt(el)) ok = false;
    }

    const rect = ok ? node.getBoundingClientRect() : null;
    if (rect) {
      const reach = Math.max(...drops.map((dd) => 3 * dd.sigma + Math.hypot(dd.ox, dd.oy))) * Math.hypot(lin![0], lin![1]);
      ok = rect.right + reach > 0 && rect.left - reach < viewW && rect.bottom + reach > 0 && rect.top - reach < viewH;
    }

    let mask = masks.get(node);
    if (ok) {
      const src = node instanceof HTMLImageElement ? node.currentSrc : node.textContent;
      const key = [
        node.offsetWidth,
        node.offsetHeight,
        src,
        cs!.font,
        cs!.letterSpacing,
        cs!.objectFit,
        decl,
        fontsGeneration,
      ].join('|');
      // (Back to the shape its mask has: a blur on its way for another is let go.)
      if (mask?.key === key) blurring.delete(node);
      else if (blurring.get(node)?.key !== key && unmaskable.get(node) !== key) {
        if (unsettled.get(node) !== key) {
          // A new shape (a new element's, or one changed since its mask was
          // made), which may go on changing every frame (an entrance opening
          // its letter-spacing): CSS paints it until it holds still for a
          // frame, rather than a mask made anew each frame.
          unsettled.set(node, key);
        } else {
          unsettled.delete(node);
          startMask(node, cs!, key, drops, lin!);
          mask = masks.get(node);
        }
      }
      ok &&= mask?.key === key;
    }
    if (!ok) {
      node.removeAttribute('data-bs-drop');
      continue;
    }
    if (!node.hasAttribute('data-bs-drop')) node.setAttribute('data-bs-drop', '');
    active.push([node, mask!, lin!, opacity, rect!, inFill]);
  }

  let atlases: Atlases | null = null;
  if (atlasDirty) {
    atlases = buildAtlases([...masks.values()]);
    atlasDirty = false;
  }

  active.forEach(([node, m, lin, opacity, rect, inFill], i) => {
    const det = lin[0] * lin[3] - lin[1] * lin[2];
    a.set([rect.left + rect.width / 2, rect.top + rect.height / 2, node.offsetWidth, node.offsetHeight], i * 4);
    b.set([lin[3] / det, -lin[1] / det, -lin[2] / det, lin[0] / det], i * 4);
    c.set([m.x, m.y, m.w, m.h], i * 4);
    d.set([m.sx, m.sy, m.bx, m.by], i * 4);
    e.set([m.q, inFill ? 1 : 0, 0, 0], i * 4);
    m.drops.forEach((dd, k) => {
      off[i * 4 + k * 2] = dd.ox;
      off[i * 4 + k * 2 + 1] = dd.oy;
      col.set([dd.color[0], dd.color[1], dd.color[2], dd.color[3] * opacity], (i * DROPS_PER_MASK + k) * 4);
    });
  });
  return atlases;
}
