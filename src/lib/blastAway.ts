// Delve: dynamite blasts the question away for a new one at the same depth,
// the explosion bursting in from the screen edge the new question comes
// from (Question.blast.side). The page's part of it, over everything but the
// effects overlay: a hard flash and a fireball from that edge, a shockwave
// front running across, rock chips and sparks flying over, the old question
// broken into shards flung to the far side, the screen shaking, and smoke
// rolling in for the new question to come through as it clears. The fire
// and light are the effects overlay's (fx/blast.ts edgeBlast).
//
// Only transform and opacity move, each piece painted once: one burst that
// a phone composites without a hitch.

import { edgeBlast } from './fx/blast';
import { fxActive } from './fx/core';
import { zoomOf } from './stage';

/** When the shockwave reaches the question (ms after it goes off): its shards fly, the screen shakes, the scene swings. */
export const BLAST_IMPACT_MS = 110;
/** When the new question starts coming in from the blast's side (ms after it goes off), and how long it takes. */
export const BLAST_IN_DELAY_MS = 420;
export const BLAST_IN_MS = 680;
/** How long the whole of it lasts (ms), the last of the smoke included. */
const BLAST_MS = 2300;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const px = (n: number) => `${n.toFixed(1)}px`;
/** A box on screen in the blast layer's own px: the layer is zoomed as the page is (lib/stage.ts). */
const unzoom = (r: DOMRect, z: number) => (z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z));

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
/** A part as measured on the question itself: where it is in its tree, its box, and whether it is inline. */
type Found = { path: number[]; rect: DOMRect; inline: boolean };

/**
 * The parts a question is blown into, measured on `src` before anything on
 * the page changes (so nothing is laid out twice): its children, and the
 * children of anything big (half the question) or a list of answers or
 * pictures (three or more side by side, a tenth of it), whose own frame and
 * fill (`hollow`) go as its parts fly.
 */
function measure(src: Element, area: number, z: number, path: number[] = [], parts: Found[] = [], hollow: number[][] = []) {
  Array.from(src.children).forEach((k, i) => {
    const at = [...path, i];
    const r = unzoom(k.getBoundingClientRect(), z);
    const a = r.width * r.height;
    if (!a) {
      // display: contents and the like: what is inside it counts.
      if (k.children.length) measure(k, area, z, at, parts, hollow);
      return;
    }
    if (a > area * 0.5 || (k.children.length >= 3 && a > area * 0.1)) {
      hollow.push(at);
      measure(k, area, z, at, parts, hollow);
      return;
    }
    parts.push({ path: at, rect: r, inline: getComputedStyle(k).display === 'inline' });
  });
  return { parts, hollow };
}

/** The element at `path` in `root`'s tree. */
function at(root: Element, path: number[]): HTMLElement | null {
  let el: Element | undefined = root;
  for (const i of path) el = el?.children[i];
  return (el as HTMLElement) ?? null;
}

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
  const rect = unzoom(onScreen, Z);
  const shown = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < H;
  const cs = getComputedStyle(node);
  const inherited = shown ? Array.from(cs).flatMap((name) => (name.startsWith('--') ? [[name, cs.getPropertyValue(name)]] : [])) : [];
  const found = shown ? measure(node, rect.width * rect.height, Z) : { parts: [], hollow: [] };
  const looks = shown ? pictureLooks(node) : [];
  // The biggest part (the art, as a rule) cracks where the blast strikes it, and its parent holds the pieces.
  const big = found.parts.reduce<Found | null>((m, p) => (!m || p.rect.width * p.rect.height > m.rect.width * m.rect.height ? p : m), null);
  const bigParent = big && big.rect.width * big.rect.height > rect.width * Math.min(rect.height, H) * 0.12 ? at(node, big.path)?.parentElement : null;
  const holder = bigParent
    ? { rect: unzoom(bigParent.getBoundingClientRect(), Z), static: getComputedStyle(bigParent).position === 'static', border: [bigParent.clientLeft, bigParent.clientTop] as [number, number] }
    : null;
  const phone = W < 600;
  // The blast's height: the question's middle, as far as it is on screen.
  const top = Math.max(0, rect.top);
  const bottom = Math.min(H, rect.bottom);
  const y = bottom > top ? Math.min(top + (bottom - top) * 0.45, top + H * 0.35) : H * 0.4;
  const edgeX = side > 0 ? W : 0;
  const inward = -side;

  shardStyle();
  const layer = document.createElement('div');
  layer.className = 'blast-layer';
  layer.setAttribute('aria-hidden', 'true');
  // It dims behind an open dialog like the page's other overlays (lib/portal.ts).
  layer.dataset.behindDialog = 'dim';
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '90', pointerEvents: 'none', overflow: 'hidden', contain: 'strict' });
  if (Z !== 1) layer.style.zoom = String(Z);
  document.body.append(layer);
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
      const fx = inward * reach;
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
          { transform: `translate(${px(fx)}, ${px(fy)}) rotate(${spin.toFixed(1)}deg) scale(0.85)`, opacity: 0 },
        ],
        { delay, duration: rand(620, 880), easing: 'cubic-bezier(0.12, 0.7, 0.3, 1)' },
      );
    }
    // What held the parts together goes with the blow: their frames and fills.
    setTimeout(() => {
      for (const el of hollow) Object.assign(el.style, { background: 'none', borderColor: 'transparent', boxShadow: 'none', outlineColor: 'transparent' });
    }, BLAST_IMPACT_MS);
    // The blast's heat over it as the shockwave hits, from the near side.
    const heat = piece(layer, {
      left: px(rect.left),
      top: px(Math.max(0, rect.top)),
      width: px(w),
      height: px(Math.min(rect.bottom, H) - Math.max(0, rect.top)),
      background: `radial-gradient(ellipse farthest-side at ${side > 0 ? '100%' : '0%'} 50%, rgba(255, 226, 180, 0.7), rgba(255, 160, 75, 0.32) 35%, rgba(200, 90, 40, 0.08) 65%, rgba(0, 0, 0, 0) 92%)`,
      opacity: '0',
    });
    anim(heat, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { delay: BLAST_IMPACT_MS - 60, duration: 360, easing: 'ease-out' });
  }

  // ---- the explosion, from the edge ----
  const S = Math.min(Math.max(Math.min(W, H) * 1.05, 380), 980);
  // The hard flash, washing in from that side.
  const flash = piece(layer, {
    inset: '0',
    width: '100%',
    height: '100%',
    background: `linear-gradient(${side > 0 ? 'to left' : 'to right'}, rgba(255, 244, 222, 0.95), rgba(255, 200, 120, 0.75) 16%, rgba(235, 130, 55, 0.4) 40%, rgba(120, 50, 20, 0) 78%)`,
    opacity: '0',
  });
  anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.5, offset: 0.35 }, { opacity: 0 }], { duration: 560, easing: 'ease-out' });
  // The shockwave: the front of a ring far bigger than the screen, running across from the edge.
  const R = Math.hypot(W, H) * 1.1;
  const ring = piece(layer, {
    left: px(edgeX - R),
    top: px(y - R),
    width: px(2 * R),
    height: px(2 * R),
    borderRadius: '50%',
    boxShadow: '0 0 0 2px rgba(255, 238, 205, 0.85), 0 0 26px 8px rgba(255, 170, 80, 0.5), inset 0 0 40px 10px rgba(255, 190, 110, 0.4)',
  });
  anim(ring, [{ transform: 'scale(0.02)', opacity: 1 }, { opacity: 0.85, offset: 0.4 }, { transform: 'scale(1)', opacity: 0 }], {
    duration: 760,
    easing: 'cubic-bezier(0.15, 0.6, 0.35, 1)',
  });
  // The fireball, billowing in from off screen.
  for (let i = 0; i < 3; i++) {
    const size = S * rand(0.9, 1.2) * (i ? 0.8 : 1);
    const oy = i ? rand(-0.32, 0.32) * size : 0;
    const ball = piece(layer, {
      left: px(edgeX - size / 2),
      top: px(y + oy - size / 2),
      width: px(size),
      height: px(size),
      borderRadius: '50%',
      background:
        'radial-gradient(circle, rgba(255, 249, 228, 1) 0%, rgba(255, 218, 140, 0.95) 15%, rgba(255, 155, 62, 0.8) 33%, rgba(196, 74, 26, 0.45) 51%, rgba(90, 32, 14, 0) 68%)',
      opacity: '0',
    });
    const go = inward * size * rand(0.28, 0.5);
    anim(
      ball,
      [
        { transform: `translate(${px(-inward * size * 0.22)}, 0) scale(0.25)`, opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { opacity: 0.85, offset: 0.4 },
        { transform: `translate(${px(go)}, ${px(-size * rand(0.04, 0.14))}) scale(${rand(1.05, 1.3).toFixed(2)})`, opacity: 0 },
      ],
      { delay: i * 45, duration: rand(620, 820), easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)' },
    );
  }
  // Rock chips and sparks flying across.
  for (let i = 0; i < (phone ? 10 : 16); i++) {
    const size = rand(5, phone ? 11 : 14);
    const pts = Array.from({ length: 5 }, (_, k) => {
      const a = (k / 5) * Math.PI * 2 + rand(-0.4, 0.4);
      const r = rand(0.55, 1) * 50;
      return `${(50 + Math.cos(a) * r).toFixed(0)}% ${(50 + Math.sin(a) * r).toFixed(0)}%`;
    });
    const chip = piece(layer, {
      left: px(edgeX - size / 2),
      top: px(y + rand(-0.25, 0.25) * S - size / 2),
      width: px(size),
      height: px(size),
      background: Math.random() < 0.3 ? 'linear-gradient(135deg, #ffd9a0, #e2793a 55%, #5a2a14)' : 'linear-gradient(135deg, #8a6c52, #3b2b20 60%, #1c140f)',
      clipPath: `polygon(${pts.join(',')})`,
    });
    const dist = W * rand(0.6, 1.25);
    const lift = rand(-0.45, 0.25) * H * 0.4;
    const turn = rand(-540, 540);
    anim(
      chip,
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${px(inward * dist * 0.6)}, ${px(lift)}) rotate(${(turn * 0.6).toFixed(0)}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${px(inward * dist)}, ${px(lift + rand(120, 320))}) rotate(${turn.toFixed(0)}deg)`, opacity: 0 },
      ],
      { delay: rand(0, 70), duration: rand(700, 1100), easing: 'cubic-bezier(0.1, 0.6, 0.4, 1)' },
    );
  }
  for (let i = 0; i < (phone ? 10 : 16); i++) {
    const a = (side > 0 ? Math.PI : 0) + rand(-0.45, 0.45);
    const len = rand(40, 110);
    const streak = piece(layer, {
      left: px(edgeX),
      top: px(y + rand(-0.2, 0.2) * S),
      width: px(len),
      height: '2px',
      borderRadius: '1px',
      transformOrigin: '0 50%',
      background: 'linear-gradient(to right, rgba(255, 150, 60, 0), rgba(255, 190, 100, 0.85) 60%, rgba(255, 248, 225, 1))',
    });
    const deg = ((a * 180) / Math.PI).toFixed(1);
    const dist = W * rand(0.45, 1.1);
    anim(streak, [{ transform: `rotate(${deg}deg) translateX(0)`, opacity: 1 }, { transform: `rotate(${deg}deg) translateX(${px(dist)})`, opacity: 0 }], {
      delay: rand(0, 90),
      duration: rand(320, 560),
      easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
    });
  }
  // Smoke rolling in after it, for the new question to come through as it clears.
  for (let i = 0; i < (phone ? 8 : 11); i++) {
    const size = S * rand(0.4, 0.8);
    const puff = piece(layer, {
      left: px(edgeX - size / 2),
      top: px(y + rand(-0.55, 0.55) * Math.min(H * 0.45, S * 0.6) - size / 2),
      width: px(size),
      height: px(size),
      borderRadius: '50%',
      background:
        i % 3 === 0
          ? 'radial-gradient(circle, rgba(128, 92, 64, 0.62) 0%, rgba(100, 74, 54, 0.42) 32%, rgba(70, 52, 40, 0.18) 52%, rgba(40, 30, 23, 0) 70%)'
          : 'radial-gradient(circle, rgba(92, 76, 64, 0.62) 0%, rgba(76, 63, 53, 0.44) 30%, rgba(56, 46, 39, 0.2) 52%, rgba(36, 29, 24, 0) 70%)',
      opacity: '0',
    });
    const go = inward * W * rand(0.3, 0.75);
    anim(
      puff,
      [
        { transform: `translate(${px(-inward * size * 0.15)}, 0) scale(0.3)`, opacity: 0 },
        { opacity: 0.85, offset: 0.14 },
        { opacity: 0.5, offset: 0.5 },
        { transform: `translate(${px(go)}, ${px(rand(-90, 30))}) scale(${rand(1.4, 2).toFixed(2)})`, opacity: 0 },
      ],
      { delay: rand(50, 200), duration: rand(1300, 1900), easing: 'cubic-bezier(0.15, 0.75, 0.3, 1)' },
    );
  }

  // The fire and light, and the screen shaking as the shockwave hits (the effects overlay's).
  if (fxActive()) edgeBlast({ side, y: y * Z, target: onScreen, impact: BLAST_IMPACT_MS / 1000, mine });
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
  setTimeout(() => layer.remove(), BLAST_MS);
}
