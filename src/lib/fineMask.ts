// Masks drawn from a copy at about the size they're shown at. A CSS mask
// image shrunk to a third or a quarter of its pixels comes out jagged in
// Chrome: its edge goes in hard stair-steps (measured against the same card
// drawn at 4x and averaged down), and the steps crawl as the card tilts or
// its emblem turns. The emblems' clean masks are baked for the largest
// card on the sharpest screen (lib/iconFit), with steep edges, so on a dpr 1
// screen they're shrunk that far. (Item art masked as it comes, as the
// codex's glyphs are, has soft edges and shrinks smoothly enough.) So each
// is shrunk here first, each pixel of the copy the average of the patch of
// the image it covers (as the 4x render averaged down does), to a little
// over the size it's drawn at, in steps of a quarter of an octave so a
// window resized doesn't make a copy for every pixel. The browser then shrinks it by no more than a step and
// the headroom, which it filters smoothly. The copies are made once for
// each image and size, and the element keeps its own mask until its copy
// is ready, or if one can't be made.

import { layoutZoomOf } from './stage';

/** Room over the drawn size: a hovered card's emblem grows 1.1, its card 1.04. */
const HEADROOM = 1.15;
/** Steps between sizes, per octave. */
const STEPS = 4;

type Source = { w: number; h: number; alpha: Uint8Array; sizes: Map<number, Promise<string>> };
const sources = new Map<string, Promise<Source>>();

function source(url: string): Promise<Source> {
  let s = sources.get(url);
  if (!s) {
    s = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const [w, h] = [img.naturalWidth, img.naturalHeight];
      const c = document.createElement('canvas');
      [c.width, c.height] = [w, h];
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const rgba = g.getImageData(0, 0, w, h).data;
      const alpha = new Uint8Array(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
      return { w, h, alpha, sizes: new Map([[0, Promise.resolve(url)]]) };
    })();
    sources.set(url, s);
  }
  return s;
}

/** For each of `n` pixels across a line of `m`, the pixels it covers and by how much of each: an area average. */
function spans(m: number, n: number) {
  const k = m / n;
  return Array.from({ length: n }, (_, j) => {
    const [a, b] = [j * k, (j + 1) * k];
    const out: [number, number][] = [];
    for (let i = Math.floor(a); i < Math.min(m, Math.ceil(b)); i++) out.push([i, (Math.min(b, i + 1) - Math.max(a, i)) / k]);
    return out;
  });
}

/** The mask `q` steps smaller (STEPS to an octave), as a URL to mask with: white, as opaque as the image averaged over each pixel's patch. */
function sizeAt(s: Source, q: number): Promise<string> {
  let made = s.sizes.get(q);
  if (made) return made;
  const f = 2 ** (q / STEPS);
  const [W, H] = [Math.max(1, Math.round(s.w / f)), Math.max(1, Math.round(s.h / f))];
  // Across, then down.
  const across = new Float32Array(W * s.h);
  const xs = spans(s.w, W);
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [i, wt] of xs[x]!) v += s.alpha[y * s.w + i]! * wt;
      across[y * W + x] = v;
    }
  const out = new ImageData(W, H);
  const ys = spans(s.h, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [i, wt] of ys[y]!) v += across[i * W + x]! * wt;
      const o = (y * W + x) * 4;
      out.data.fill(255, o, o + 3);
      out.data[o + 3] = Math.round(Math.min(255, v));
    }
  const c = document.createElement('canvas');
  [c.width, c.height] = [W, H];
  c.getContext('2d')!.putImageData(out, 0, 0);
  made = new Promise<string>((done, fail) => c.toBlob((b) => (b ? done(URL.createObjectURL(b)) : fail(new Error('no blob')))));
  s.sizes.set(q, made);
  return made;
}

/** How many device pixels tall the element's mask image is drawn: its mask-size (px, or contain in its box), zoomed (all of it: a sharp card is drawn at its full zoom, lib/stage), at the screen's density. */
function drawnHeight(node: HTMLElement, s: Source): number {
  const cs = getComputedStyle(node);
  const size = cs.maskSize || cs.getPropertyValue('-webkit-mask-size');
  const px = size.split(' ').map((v) => (v.endsWith('px') ? parseFloat(v) : NaN));
  const h = px.length === 2 && px[1]! > 0 ? px[1]! : Math.min(node.offsetWidth / s.w, node.offsetHeight / s.h) * s.h;
  return h * layoutZoomOf(node) * devicePixelRatio;
}

/**
 * Svelte action: masks `node` with a copy of `url` about the size it's drawn
 * at, through --fine (its CSS masks with `var(--fine, var(--src))`). Looked
 * at again when the window or the element's size changes (a resize, a zoom,
 * another screen).
 */
export function fineMask(node: HTMLElement, url: string) {
  let at = url;
  let run = 0;
  let frame = 0;
  const update = async () => {
    const mine = ++run;
    try {
      const s = await source(at);
      const want = drawnHeight(node, s) * HEADROOM;
      if (!(want > 0)) return;
      // The smallest step still over what's wanted (the image itself, if that's all it has).
      const q = Math.max(0, Math.floor(Math.log2(s.h / want) * STEPS));
      const src = await sizeAt(s, q);
      if (mine === run) node.style.setProperty('--fine', `url('${src}')`);
    } catch {
      if (mine === run) node.style.removeProperty('--fine');
    }
  };
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => void update());
  };
  later();
  addEventListener('resize', later);
  // (Its own size too: an emblem's fit arrives after it's first laid out.)
  const seen = new ResizeObserver(later);
  seen.observe(node);
  return {
    update(next: string) {
      if (next === at) return;
      at = next;
      node.style.removeProperty('--fine');
      later();
    },
    destroy() {
      run++;
      cancelAnimationFrame(frame);
      removeEventListener('resize', later);
      seen.disconnect();
    },
  };
}
