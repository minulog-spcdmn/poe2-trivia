// Delve: dynamite blasts the question away for a new one at the same depth,
// the explosion bursting in from the screen edge the new question comes
// from (Question.blast.side). The page's part of it, over everything but the
// effects overlay: the old question broken into shards flung to the far
// side, the screen shaking, and smoke rolling in for the new question to
// come through as it clears (lib/blastSmoke.ts, which darkens what it rolls
// over, as the overlay's light can't). The fire and light, the shockwave,
// the sparks and the rock chips are the effects overlay's (fx/blast.ts
// edgeBlast); without it, the page draws them itself, plainer.
//
// The question's shards move by transform and opacity alone, each painted
// once; the smoke is one canvas.

import dither from '../assets/dither.png';
import { edgeBlast } from './fx/blast';
import { fxActive } from './fx/core';
import { unzoomRect, zoomOf } from './stage';
import { BLAST_IMPACT_MS } from './blastTiming';
import { beforeToasts } from './portal';
import { at, measure, type Found } from './blastParts';

export { BLAST_IMPACT_MS, BLAST_IN_DELAY_MS, BLAST_IN_MS } from './blastTiming';
/** How long the whole of it lasts (ms), the last of the smoke included. */
const BLAST_MS = 2300;

/**
 * The page's smoke (lib/blastSmoke.ts): not loaded with the game (this file
 * is), but as a run nears dynamite (Game.svelte), or at the latest by the blast.
 */
let smoke: Promise<typeof import('./blastSmoke')> | null = null;
const loadSmoke = () =>
  (smoke ??= import('./blastSmoke').catch((err) => {
    smoke = null;
    throw err;
  }));
/** Gets the blast's smoke ready, while the page is idle: as a run nears dynamite (Game.svelte). */
export function prepareBlast() {
  loadSmoke().then(
    (m) => m.prepareBlastSmoke(),
    () => {},
  );
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/**
 * A soft light's gradient over the page, dithered under it (app.css,
 * --dither, imported: an inline style can't resolve the variable's url), so
 * its opacity rounds up or down from pixel to pixel instead of banding. Its
 * element wants image-rendering: pixelated, and a mask fading out with the
 * gradient, so the dither goes where the light does and no further.
 */
const glare = (gradient: string) => `${gradient}, url(${dither})`;
const px = (n: number) => `${n.toFixed(1)}px`;

type Pt = { x: number; y: number };

/**
 * Cracks a w by h box into `n` shards fanning out from `p`, a point on its
 * edge nearest the blast: each is `p` and the stretch of the box's outline
 * between two cuts, as polygon points in px.
 */
function crack(w: number, h: number, p: Pt, side: -1 | 1, n: number): Pt[][] {
  // The outline from p round the box and back to p: up the near edge, along
  // the top to the far side, down it, back along the bottom, up to p.
  const near = side > 0 ? w : 0;
  const far = w - near;
  const path: Pt[] = [p, { x: near, y: 0 }, { x: far, y: 0 }, { x: far, y: h }, { x: near, y: h }, p];
  const lens = path.slice(1).map((q, i) => Math.hypot(q.x - path[i].x, q.y - path[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  const at = (d: number): { pt: Pt; seg: number } => {
    let i = 0;
    while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
    const k = lens[i] ? Math.min(1, d / lens[i]) : 0;
    return { pt: { x: path[i].x + (path[i + 1].x - path[i].x) * k, y: path[i].y + (path[i + 1].y - path[i].y) * k }, seg: i };
  };
  // The cuts, evenly round the outline past the near edge (the first and
  // last shards take the near edge either side of p), jittered so no two
  // blasts break alike.
  const from = lens[0];
  const to = total - lens[lens.length - 1];
  const cuts = [0];
  for (let i = 1; i < n; i++) cuts.push(from + ((to - from) * (i + rand(-0.3, 0.3))) / n);
  cuts.push(total);
  const out: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const a = at(cuts[i]);
    const b = at(cuts[i + 1]);
    const poly = [p, a.pt];
    for (let s = a.seg; s < b.seg; s++) poly.push(path[s + 1]);
    poly.push(b.pt);
    out.push(poly);
  }
  return out;
}

/**
 * Copies what is drawn on `from`'s canvases onto their twins in `to` (a
 * clone draws none of it), and swaps `to`'s pictures for canvases showing
 * them as `from` does: the question's art is gone from where it came from
 * (its object URL let go with it), but what is on screen can still be drawn.
 */
function copyPictures(from: Element, to: Element, looks: Partial<CSSStyleDeclaration>[] = []) {
  const canvases = to.querySelectorAll('canvas');
  from.querySelectorAll('canvas').forEach((c, i) => {
    const twin = canvases[i];
    if (!twin || !c.width || !c.height) return;
    twin.width = c.width;
    twin.height = c.height;
    try {
      twin.getContext('2d')?.drawImage(c, 0, 0);
    } catch {
      /* nothing drawn there yet */
    }
  });
  const imgs = to.querySelectorAll('img');
  from.querySelectorAll('img').forEach((img, i) => {
    const twin = imgs[i];
    if (!twin) return;
    const c = document.createElement('canvas');
    for (const a of Array.from(twin.attributes)) if (a.name !== 'src' && a.name !== 'srcset' && a.name !== 'alt') c.setAttribute(a.name, a.value);
    // Styled as the picture was (rules written for an img don't reach a canvas).
    if (looks[i]) Object.assign(c.style, looks[i]);
    if (img.complete && img.naturalWidth) {
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      try {
        c.getContext('2d')?.drawImage(img, 0, 0);
      } catch {
        /* a picture that can't be drawn just goes blank */
      }
    }
    twin.replaceWith(c);
  });
}

/** How each picture in `node` is laid out and drawn, measured for the canvases that stand in for them (copyPictures). */
const PICTURE_LOOK = ['display', 'position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'margin', 'objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity', 'borderRadius'] as const;
function pictureLooks(node: Element): Partial<CSSStyleDeclaration>[] {
  return Array.from(node.querySelectorAll('img'), (img) => {
    const cs = getComputedStyle(img);
    return Object.fromEntries(PICTURE_LOOK.map((k) => [k, cs[k]])) as Partial<CSSStyleDeclaration>;
  });
}

/** An absolutely placed piece of the blast, its look in `css`. */
function piece(parent: HTMLElement, css: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', willChange: 'transform, opacity', ...css });
  parent.append(el);
  return el;
}

export type BlastAway = {
  /** The question blasted away, as it still stands. */
  node: HTMLElement;
  /** The screen edge the blast comes from, and the new question with it: -1 left, 1 right. */
  side: -1 | 1;
  /** The player who set it off: their screen shakes harder. */
  mine: boolean;
};

type Part = { el: HTMLElement; rect: DOMRect; origin?: string };

/**
 * Cracks a part in three where the blast strikes it (at height `y`, from
 * `side`): it keeps one shard, and two copies of it beside it in its parent
 * (`parent`, its box measured before) the others. Returns the two new parts.
 */
function crackPart(p: Part, parent: { el: HTMLElement; rect: DOMRect; static: boolean; border: [number, number] }, side: -1 | 1, y: number): Part[] {
  const r = p.rect;
  if (parent.static) parent.el.style.position = 'relative';
  const hit = { x: side > 0 ? r.width : 0, y: Math.min(r.height - 8, Math.max(8, y - r.top + rand(-20, 20))) };
  const polys = crack(r.width, r.height, hit, side, 3);
  const clip = (poly: Pt[]) => `polygon(${poly.map((q) => `${px(q.x)} ${px(q.y)}`).join(',')})`;
  const centre = (poly: Pt[]) => {
    const cx = poly.reduce((a, q) => a + q.x, 0) / poly.length;
    const cy = poly.reduce((a, q) => a + q.y, 0) / poly.length;
    return { rect: new DOMRect(r.left + cx - r.width / 2, r.top + cy - r.height / 2, r.width, r.height), origin: `${px(cx)} ${px(cy)}` };
  };
  const out: Part[] = [];
  polys.slice(1).forEach((poly) => {
    const twin = p.el.cloneNode(true) as HTMLElement;
    copyPictures(p.el, twin);
    Object.assign(twin.style, {
      position: 'absolute',
      left: px(r.left - parent.rect.left - parent.border[0]),
      top: px(r.top - parent.rect.top - parent.border[1]),
      width: px(r.width),
      height: px(r.height),
      margin: '0',
      clipPath: clip(poly),
    });
    parent.el.append(twin);
    out.push({ el: twin, ...centre(poly) });
  });
  p.el.style.clipPath = clip(polys[0]);
  Object.assign(p, centre(polys[0]));
  return out;
}

/**
 * The copy of the question shows it as it stood: what was animating
 * in it jumps to where it was going (an art fading in would start over),
 * and nothing eases.
 */
const SHARD_CSS = '.blast-layer .blast-copy * { animation-delay: -60s !important; transition: none !important; }';
function shardStyle() {
  if (document.getElementById('blast-away-css')) return;
  const style = document.createElement('style');
  style.id = 'blast-away-css';
  style.textContent = SHARD_CSS;
  document.head.append(style);
}

/**
 * Blasts the question in `node` away (Game.svelte calls it as the new
 * question comes, before the page changes, so `node` still shows the old
 * one): see the top of this file.
 */
export function blastAway({ node, side, mine }: BlastAway) {
  // The layer is zoomed as the page is, so everything is measured in its px (the fire, drawn by the effects overlay, on screen).
  const Z = zoomOf(node);
  const W = innerWidth / Z;
  const H = innerHeight / Z;
  // Everything measured first, before the page changes, so it is laid out once.
  const onScreen = node.getBoundingClientRect();
  const rect = unzoomRect(onScreen, Z);
  const shown = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < H;
  const cs = getComputedStyle(node);
  const inherited = shown ? Array.from(cs).flatMap((name) => (name.startsWith('--') ? [[name, cs.getPropertyValue(name)]] : [])) : [];
  const found = shown ? measure(node, rect.width * rect.height, Z) : { parts: [], hollow: [] };
  const looks = shown ? pictureLooks(node) : [];
  // The biggest part (the art, as a rule) cracks where the blast strikes it, and its parent holds the pieces.
  const big = found.parts.reduce<Found | null>((m, p) => (!m || p.rect.width * p.rect.height > m.rect.width * m.rect.height ? p : m), null);
  const bigParent = big && big.rect.width * big.rect.height > rect.width * Math.min(rect.height, H) * 0.12 ? at(node, big.path)?.parentElement : null;
  const holder = bigParent
    ? { rect: unzoomRect(bigParent.getBoundingClientRect(), Z), static: getComputedStyle(bigParent).position === 'static', border: [bigParent.clientLeft, bigParent.clientTop] as [number, number] }
    : null;
  const phone = W < 600;
  const fx = fxActive();
  // The blast's height: the question's middle, as far as it is on screen.
  const top = Math.max(0, rect.top);
  const bottom = Math.min(H, rect.bottom);
  const y = bottom > top ? Math.min(top + (bottom - top) * 0.45, top + H * 0.35) : H * 0.4;
  const inward = -side;

  shardStyle();
  const layer = document.createElement('div');
  layer.className = 'blast-layer';
  layer.setAttribute('aria-hidden', 'true');
  // It dims behind an open dialog like the page's other overlays (lib/portal.ts).
  layer.dataset.behindDialog = 'dim';
  // Under the toasts (90, Toasts.svelte), as the question it blows apart is,
  // and over all else: at their z-index but before them in the page
  // (lib/portal.ts). Added after them, it drew over them.
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '90', pointerEvents: 'none', overflow: 'hidden', contain: 'strict' });
  if (Z !== 1) layer.style.zoom = String(Z);
  beforeToasts(layer);
  const anim = (el: Element, frames: Keyframe[], o: KeyframeAnimationOptions) => el.animate(frames, { fill: 'both', ...o });

  // ---- the question, blown apart and flung to the far side ----
  // One copy of it where it stood, its parts (the heading, the art, each
  // answer or picture) each thrown off on its own, the art cracked in three.
  const w = rect.width;
  if (shown) {
    const copy = piece(layer, { left: px(rect.left), top: px(rect.top), width: px(w), willChange: 'auto' });
    copy.className = 'blast-copy';
    // What the question inherits from where it stood (its type, colours, the zone's custom properties).
    for (const [name, value] of inherited) copy.style.setProperty(name, value);
    Object.assign(copy.style, { font: cs.font, color: cs.color, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign });
    const clone = node.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, { width: px(w), margin: '0', transform: 'none', opacity: '1' });
    copy.append(clone);
    copyPictures(node, clone, looks);
    const parts: Part[] = [];
    let bigPart: Part | null = null;
    for (const f of found.parts) {
      const el = at(clone, f.path);
      if (!el) continue;
      // Only boxes move with a transform.
      if (f.inline) el.style.display = 'inline-block';
      const p: Part = { el, rect: f.rect };
      if (f === big) bigPart = p;
      parts.push(p);
    }
    const hollow = found.hollow.flatMap((path) => at(clone, path) ?? []);
    const holderEl = bigPart?.el.parentElement;
    if (bigPart && holder && holderEl) parts.push(...crackPart(bigPart, { el: holderEl, ...holder }, side, y));
    const blastX = side > 0 ? W : 0;
    for (const p of parts) {
      const r = p.rect;
      if (r.bottom < 0 || r.top > H) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const near = 1 - Math.min(1, Math.abs(cx - blastX) / W);
      const small = Math.min(1, 60000 / Math.max(1, r.width * r.height));
      const reach = W * rand(0.8, 1.3) * (0.7 + 0.3 * near);
      const dx = inward * reach;
      const fy = ((cy - y) / H) * rand(160, 420) + rand(40, 220);
      const spin = (cy >= y ? 1 : -1) * inward * rand(12, 34) * (1 + small * 1.4);
      // The nearer the blast, the sooner it goes.
      const delay = BLAST_IMPACT_MS + (1 - near) * 110 + rand(0, 25);
      p.el.style.transformOrigin = p.origin ?? '50% 50%';
      anim(
        p.el,
        [
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${px(inward * 10)}, ${px(-3)}) rotate(${(spin * 0.08).toFixed(2)}deg) scale(1.02)`, opacity: 1, offset: 0.05 },
          { opacity: 0.95, offset: 0.4 },
          { transform: `translate(${px(dx)}, ${px(fy)}) rotate(${spin.toFixed(1)}deg) scale(0.85)`, opacity: 0 },
        ],
        { delay, duration: rand(620, 880), easing: 'cubic-bezier(0.12, 0.7, 0.3, 1)' },
      );
    }
    // What held the parts together goes with the blow: their frames and fills.
    setTimeout(() => {
      for (const el of hollow) Object.assign(el.style, { background: 'none', borderColor: 'transparent', boxShadow: 'none', outlineColor: 'transparent' });
    }, BLAST_IMPACT_MS);
    // Without the effects overlay, the blast's heat over it as the shockwave hits, from the near side.
    const heat = !fx && piece(layer, {
      left: px(rect.left),
      top: px(Math.max(0, rect.top)),
      width: px(w),
      height: px(Math.min(rect.bottom, H) - Math.max(0, rect.top)),
      background: glare(`radial-gradient(ellipse farthest-side at ${side > 0 ? '100%' : '0%'} 50%, rgba(255, 226, 180, 0.7), rgba(255, 160, 75, 0.32) 35%, rgba(200, 90, 40, 0.08) 65%, rgba(0, 0, 0, 0) 92%)`),
      maskImage: `radial-gradient(ellipse farthest-side at ${side > 0 ? '100%' : '0%'} 50%, #000 65%, transparent 92%)`,
      imageRendering: 'pixelated',
      opacity: '0',
    });
    if (heat) anim(heat, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { delay: BLAST_IMPACT_MS - 60, duration: 360, easing: 'ease-out' });
  }

  // ---- the explosion, from the edge ----
  const S = Math.min(Math.max(Math.min(W, H) * 1.05, 380), 980);
  if (!fx) {
    // Without the effects overlay, the hard flash, washing in from that side.
    const flash = piece(layer, {
      inset: '0',
      width: '100%',
      height: '100%',
      background: glare(`linear-gradient(${side > 0 ? 'to left' : 'to right'}, rgba(255, 244, 222, 0.95), rgba(255, 200, 120, 0.75) 16%, rgba(235, 130, 55, 0.4) 40%, rgba(120, 50, 20, 0) 78%)`),
      maskImage: `linear-gradient(${side > 0 ? 'to left' : 'to right'}, #000 40%, transparent 78%)`,
      imageRendering: 'pixelated',
      opacity: '0',
    });
    anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.5, offset: 0.35 }, { opacity: 0 }], { duration: 560, easing: 'ease-out' });
  }
  // The smoke rolling in after it (and, without the overlay, the fire, the
  // shockwave, the chips and the sparks), drawn as they move: lib/blastSmoke.ts.
  // (Should it load late, it catches up; should it fail to, the layer goes
  // when the blast would have ended.)
  const start = performance.now();
  loadSmoke().then(
    (m) => m.blastSmoke({ layer, W, H, Z, side, y, S, whole: !fx, phone, seconds: BLAST_MS / 1000, start, done: () => layer.remove() }),
    (err) => {
      console.error("The blast's smoke couldn't load", err);
      setTimeout(() => layer.remove(), Math.max(0, BLAST_MS - (performance.now() - start)));
    },
  );

  // The fire and light, and the screen shaking as the shockwave hits (the effects overlay's).
  if (fx) edgeBlast({ side, y: y * Z, target: onScreen, impact: BLAST_IMPACT_MS / 1000, mine, size: S * Z });
  else {
    // Without it, the page shakes by itself (the shell, as the effects' shake moves it).
    const shell = document.querySelector<HTMLElement>('.shell');
    const k = mine ? 1 : 0.75;
    shell?.animate(
      [
        { translate: '0 0' },
        { translate: `${px(inward * 11 * k)} ${px(3 * k)}` },
        { translate: `${px(-inward * 8 * k)} ${px(-4 * k)}` },
        { translate: `${px(inward * 5 * k)} ${px(2 * k)}` },
        { translate: `${px(-inward * 2 * k)} ${px(-1 * k)}` },
        { translate: '0 0' },
      ],
      { delay: BLAST_IMPACT_MS, duration: 340, easing: 'ease-out' },
    );
  }
  // (Should its frames stop coming, a hidden tab say, it goes anyway.)
  setTimeout(() => layer.remove(), BLAST_MS + 8000);
}
