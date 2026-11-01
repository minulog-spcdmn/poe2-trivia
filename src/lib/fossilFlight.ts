// A fossil unearthed (docs/gameplay.md, Delve, "Fossils"). Its card said
// only that a fossil was in the stone; a right answer is the payoff, the
// moment it is split out and which one it is shows. The nodule (the card's
// stone: an exact ellipse, two growth rings, hatched on the side turned from
// the light, a fine seam across) comes up out of the right answer to the
// middle of the item's art, is struck, splits along its seam, and the
// fossil lies in the hollow in its own art and colours, the first amber the
// player sees. Its name comes up under it, then it flies to its place in
// the line under the title (QuestionView's .found-fossil), where it stays
// for the rest of the question.
//
// The motion, in order (ms from the verdict, which marks the answer and
// flares the circle first):
//   450 to 830    it comes up: out of the right answer to the art's middle,
//                 growing from 0.35, fast and then slowing, as a thing lifted
//                 out; a veil darkens the art behind it;
//   830 to 950    it hangs, settling 4 px, its weight felt;
//   950 to 1110   the strike: the stone jolts, the seam is drawn across by
//                 the pen, bright;
//   1110 to 1430  it splits along the seam: the upper half tips off to the
//                 right, the lower drops away to the left (16 px out, 14
//                 degrees, falling 10, fading), stone shards and dust fly, a
//                 warm light behind; the fossil grows from 0.85 between them;
//   1430 to 1700  its name (Fontin SmallCaps, the currency colour) rises
//                 6 px under it as it fades in, the count under that in
//                 Cinzel, "Rare" for a rare, catching the gold glint once;
//   1700 to 2900  held;
//   2900 to 3560  it flies to the line along an arc that rises before it
//                 falls, shrinking to the line's picture; the name and count
//                 fade here as the line's fade in there; the veil lifts;
//   3560          it lands: the line's picture takes it with a short swell.
// With reduced motion, nothing comes up: the line alone, at 450 ms.
//
// It all hangs on the page's body (fixed, outside the game's transformed
// stage), zoomed as the stage is, built and taken away here.

import { backdropDropShadow } from './backdropDropShadow.ts';
import { drawIn } from './drawIn.ts';
import { glints, puffs, shards } from './fx/effects.ts';
import type { Vec3 } from './fx/core.ts';
import { light } from './lights.ts';
import { sfx } from './sound.ts';
import { zoomOf } from './stage.ts';
import { fossilArt, fossilById, type FossilId } from './fossils.ts';

/** When each beat starts (ms from the verdict). */
const RISE = 450;
const HANG = 830;
const STRIKE = 950;
const SPLIT = 1110;
const NAME = 1430;
const HOLD = 1700;
const FLY = 2900;
const LANDS = 3560;

/** The line's words fade in this long before the fossil lands in it. */
const LINE_LEAD = 260;

/** Shards of the stone (bone) and of what it held (amber), for the fx (HDR). */
const SHARD_BONE: Vec3 = [1.9, 1.8, 1.6];
const SHARD_AMBER: Vec3 = [2.6, 1.35, 0.45];
const DUST: Vec3 = [0.34, 0.32, 0.28];

/** The art box (stage px) under which the fossil comes up over the whole question instead. */
const ART_MIN = 120;

export type FindSize = 'desk' | 'upright' | 'flat';
/** The stone's size (stage px): 96 on a desk, 72 on a phone upright, 56 on its side. */
const STONE: Record<FindSize, number> = { desk: 96, upright: 72, flat: 56 };

// ---- the stone ------------------------------------------------------------

/**
 * The stone, as its card engraves it (findEngraving.ts nodule: the same
 * proportions, rings, shading and seam, so the stone that comes up is the
 * one the card showed), in a 100-unit box: an exact ellipse, 23 across to 16
 * down; two growth rings about a core a little toward the light (the upper
 * left); lines leaning 28 degrees over the side turned from it; and the seam
 * across, 8 degrees aslant (its right end the higher), kinked three times.
 */
const CX = 50;
const CY = 50;
const RX = 44;
const RY = (RX * 16) / 23;
type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const SEAM_TILT = -8;
const SEAM_KINKS: P[] = [
  [0.22, 0.09],
  [0.48, -0.07],
  [0.74, 0.05],
];
/** The seam's points, left end to right, on the rim at either end. */
const SEAM: P[] = (() => {
  const u: P = [Math.cos(rad(SEAM_TILT)), Math.sin(rad(SEAM_TILT))];
  const v: P = [-u[1], u[0]];
  const k = 1 / Math.hypot(u[0] / RX, u[1] / RY);
  const along = (t: number, off: number): P => [CX + u[0] * k * (2 * t - 1) + v[0] * off * RY, CY + u[1] * k * (2 * t - 1) + v[1] * off * RY];
  return [along(0, 0), ...SEAM_KINKS.map(([t, off]) => along(t, off)), along(1, 0)];
})();
const f = (n: number) => n.toFixed(2);
const pathOf = (pts: P[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`;
const SEAM_D = pathOf(SEAM);
/** The seam run on past the rim either way, along its own slant, to cut the halves apart. */
const SEAM_CUT: P[] = (() => {
  const [a, b] = [SEAM[0], SEAM.at(-1)!];
  const u: P = [Math.cos(rad(SEAM_TILT)), Math.sin(rad(SEAM_TILT))];
  return [[a[0] - u[0] * 30, a[1] - u[1] * 30], ...SEAM, [b[0] + u[0] * 30, b[1] + u[1] * 30]];
})();
const ellipse = (cx: number, cy: number, rx: number, ry: number, cls: string, more = '') =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" class="${cls}"${more}/>`;

let uid = 0;

/**
 * One half of the stone (`side` -1 the upper, 1 the lower) as an SVG: the
 * whole stone drawn and cut along the seam. Engraved bone on unlit slate;
 * the rings break where the seam crosses them (a slate line under it).
 */
function half(side: -1 | 1): SVGSVGElement {
  const id = `ff${++uid}`;
  const cut = `${pathOf(SEAM_CUT)}L${side < 0 ? '130 -30L-30 -30' : '130 130L-30 130'}Z`;
  const lean: P = [Math.sin(rad(28)), Math.cos(rad(28))];
  let hatch = '';
  for (let o = -90; o <= 90; o += 2.3) {
    const m: P = [CX + lean[1] * o, CY - lean[0] * o];
    hatch += `M${f(m[0] - lean[0] * 80)} ${f(m[1] - lean[1] * 80)}L${f(m[0] + lean[0] * 80)} ${f(m[1] + lean[1] * 80)}`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', `ff-half ${side < 0 ? 'up' : 'down'}`);
  svg.innerHTML = `<defs>
    <clipPath id="${id}c"><path d="${cut}"/></clipPath>
    <linearGradient id="${id}g" x1="0.25" y1="0" x2="0.75" y2="1"><stop offset="0" stop-color="#1b2027"/><stop offset="0.7" stop-color="#08090b"/></linearGradient>
    <mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      ${ellipse(CX, CY, RX - 2.2, RY - 2.2, '', ' fill="#fff"')}
      ${ellipse(CX - RX * 0.2, CY - RY * 0.26, RX * 0.98, RY * 0.94, '', ' fill="#000"')}
    </mask>
  </defs>
  <g clip-path="url(#${id}c)">
    ${ellipse(CX, CY, RX, RY, 'body', ` fill="url(#${id}g)"`)}
    <path d="${hatch}" mask="url(#${id}m)" class="hatch"/>
    ${[0.66, 0.36].map((g) => ellipse(CX - RX * 0.04 * (1 - g), CY - RY * 0.06 * (1 - g), RX * g, RY * g, 'ring')).join('')}
    <path d="${SEAM_D}" class="parting"/>
    <path d="${SEAM_D}" class="seam"/>
    ${ellipse(CX, CY, RX, RY, 'rim')}
  </g>`;
  return svg;
}

/** The seam struck, drawn across by the pen (drawIn.ts) from `at` (s into the moment), bright. */
function strikeLine(at: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'ff-strike');
  svg.innerHTML = `<path d="${SEAM_D}" pathLength="100" class="draw" style="--d: ${at}; --t: ${(SPLIT - STRIKE) / 1000}"/>`;
  return svg;
}

// ---- the moment -------------------------------------------------------------

let current: { stop: () => void } | null = null;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export type Unearthing = {
  id: FossilId;
  /** The fossils held now, this one in it, of `total`. */
  count: number;
  total: number;
  /** The right answer it comes up out of (null: it comes up where it hangs). */
  from: Element | null;
  /** The item's art, whose middle it hangs over, and the question, for art too small or gone. */
  art: Element | null;
  stage: Element | null;
  /** Its place in the line, once there is one to fly to. */
  to: () => Element | null;
  size: FindSize;
  /** Reduced motion: the line alone. */
  still: boolean;
  /** The line's words are due (`words`), then its picture (`landed`). Both come, cut short or not. */
  onLine: (phase: 'words' | 'landed') => void;
};

/** A box in the overlay's own px (the page's over `z`). */
const own = (r: DOMRect, z: number) => ({ x: r.left / z, y: r.top / z, w: r.width / z, h: r.height / z });

/**
 * Plays it from now, the verdict. Says what stops it (a new one, the
 * question going, Delve Deeper pressed early): all of it goes to the line.
 */
export function unearth(u: Unearthing): () => void {
  current?.stop();
  const t0 = performance.now();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, f: () => void) => timers.push(setTimeout(f, Math.max(0, ms - (performance.now() - t0))));
  let said: 'none' | 'words' | 'landed' = 'none';
  const say = (phase: 'words' | 'landed') => {
    if (said === 'landed' || said === phase) return;
    if (phase === 'landed' && said === 'none') u.onLine('words');
    said = phase;
    u.onLine(phase);
  };
  let root: HTMLElement | null = null;
  let pen: ReturnType<typeof drawIn> | null = null;
  let shadow: { destroy(): void } | null = null;
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    pen?.stop();
    shadow?.destroy();
    root?.remove();
    root = null;
    say('landed');
    if (current?.stop === stop) current = null;
  };
  current = { stop };

  if (u.still) {
    at(RISE, () => say('landed'));
    return stop;
  }

  at(RISE, () => {
    const answer = u.from?.getBoundingClientRect();
    const artBox = u.art?.getBoundingClientRect();
    const over = artBox && u.art && artBox.height / zoomOf(u.art) >= ART_MIN ? u.art : u.stage;
    const overBox = over?.getBoundingClientRect();
    if (!overBox || !overBox.width) return stop();
    const z = zoomOf(over!);
    const box = own(overBox, z);
    const n = STONE[u.size];
    const fossil = fossilById(u.id);

    root = document.createElement('div');
    root.className = 'fossil-find';
    root.setAttribute('aria-hidden', 'true');
    root.style.zoom = String(z);
    const veil = document.createElement('div');
    veil.className = 'ff-veil';
    Object.assign(veil.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });

    const label = document.createElement('div');
    label.className = 'ff-label';
    label.classList.toggle('rare', fossil.rare);
    const name = document.createElement('span');
    name.className = 'ff-name';
    name.textContent = fossil.name;
    const count = document.createElement('span');
    count.className = 'ff-count';
    count.textContent = `${u.count} of ${u.total}`;
    label.append(name, count);
    if (fossil.rare) {
      const rare = document.createElement('span');
      rare.className = 'ff-rare';
      rare.innerHTML = '<span class="word">Rare</span><span class="sheen" aria-hidden="true">Rare</span>';
      label.append(rare);
    }
    if (u.count >= u.total) {
      const all = document.createElement('span');
      all.className = 'ff-all';
      all.textContent = 'Every fossil unearthed';
      label.append(all);
    }
    const piece = document.createElement('div');
    piece.className = 'ff-piece';
    const stone = document.createElement('div');
    stone.className = 'ff-stone';
    const art = document.createElement('img');
    art.className = 'ff-art';
    art.src = fossilArt(u.id, 256);
    art.alt = '';
    art.draggable = false;
    const upper = half(-1);
    const lower = half(1);
    const seam = strikeLine(STRIKE / 1000);
    stone.append(lower, upper, seam);
    piece.append(art, stone);
    root.append(veil, piece, label);
    document.body.append(root);
    // The stone and its words centred on the art together (its words measured as laid out), kept inside it.
    const gap = Math.max(4, n * 0.06);
    const group = n + gap + label.offsetHeight;
    const cx = box.x + box.w / 2;
    const top = box.y + Math.max(0, (box.h - group) / 2);
    const cy = top + n / 2;
    Object.assign(piece.style, { left: `${cx - n / 2}px`, top: `${top}px`, width: `${n}px`, height: `${n}px` });
    label.style.left = `${cx}px`;
    label.style.top = `${top + n + gap}px`;
    shadow = backdropDropShadow(name);
    pen = drawIn(t0);
    pen.add(seam);

    // It comes up out of the answer, growing, fast and then slowing; the veil comes with it.
    const a = answer && answer.width ? own(answer, z) : { x: cx, y: cy + n, w: 0, h: 0 };
    const dx = a.x + a.w / 2 - cx;
    const dy = a.y + a.h / 2 - cy;
    veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: HANG - RISE, easing: 'ease-out', fill: 'forwards' });
    piece.animate(
      [
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.35)`, easing: 'cubic-bezier(0.15, 0.85, 0.35, 1)' },
        { opacity: 1, transform: 'translate(0, 0) scale(1)', offset: (HANG - RISE) / (STRIKE - RISE), easing: 'ease-in-out' },
        { opacity: 1, transform: 'translate(0, 4px) scale(1)' },
      ],
      { duration: STRIKE - RISE, fill: 'forwards' },
    );
    art.animate([{ opacity: 0, transform: 'scale(0.85)' }], { duration: 1, fill: 'forwards' });

    // The strike: the stone jolts under it as the seam runs across.
    at(STRIKE, () => {
      sfx('veinStrike');
      stone.animate(
        [{ transform: 'none' }, { transform: 'translate(1.5px, 1px) rotate(1.5deg)', offset: 0.2 }, { transform: 'translate(-1px, 0) rotate(-1deg)', offset: 0.55 }, { transform: 'none' }],
        { duration: SPLIT - STRIKE, easing: 'ease-out' },
      );
    });

    // It splits along the seam: the upper half tips off to the right, the lower drops away to the left, both falling; what it held lies between.
    at(SPLIT, () => {
      // The halves are seen to part whole, and only then fade; what they held comes up between them.
      const open = { duration: NAME - SPLIT, easing: OUT, fill: 'forwards' as const };
      const gone = { duration: 170, delay: 150, easing: 'ease-in', fill: 'forwards' as const };
      upper.animate([{ transform: 'none' }, { transform: 'translate(16px, 10px) rotate(14deg)' }], open);
      lower.animate([{ transform: 'none' }, { transform: 'translate(-16px, 10px) rotate(-14deg)' }], open);
      for (const h of [upper, lower]) h.animate([{ opacity: 1 }, { opacity: 0 }], gone);
      seam.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      art.animate(
        [
          { opacity: 0, transform: 'scale(0.85)' },
          { opacity: 1, transform: 'scale(0.93)', offset: 0.45 },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { ...open, delay: 40, duration: NAME - SPLIT - 40 },
      );
      shards(stone, { count: 12, colors: [SHARD_BONE, SHARD_BONE, SHARD_AMBER], cool: [0.3, 0.27, 0.22], speed: [60, 240], size: [2, 4.5], area: 'centre' });
      puffs(stone, { count: 5, color: DUST, speed: [10, 50], size: [8, 16] });
      light(piece, { color: [1, 0.62, 0.26], radius: 140, intensity: 0.5, hold: 0.5, decay: 1.4 });
    });

    // Its name, the count under it; a rare's word catches the gold glint once.
    at(NAME, () => {
      sfx('findReward');
      label.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: HOLD - NAME, easing: OUT, fill: 'forwards' });
      const sheen = label.querySelector<HTMLElement>('.ff-rare .sheen');
      if (sheen) {
        sheen.animate([{ maskPosition: '100% 0', webkitMaskPosition: '100% 0' }, { maskPosition: '0% 0', webkitMaskPosition: '0% 0' }] as Keyframe[], {
          duration: 1100,
          delay: 250,
          easing: 'ease-in-out',
          fill: 'both',
        });
        const word = label.querySelector('.ff-rare .word');
        if (word) at(NAME + 250 + 600, () => glints(word, { count: 1, color: [2.7, 1.95, 0.85], area: 'edge', size: [5, 8] }));
      }
    });

    // It flies to its place in the line; the name and count fade here as the line's come in there.
    at(FLY, () => {
      const dest = u.to()?.getBoundingClientRect();
      label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LANDS - FLY, easing: 'ease-in-out', fill: 'forwards' });
      if (!dest || !dest.width) {
        piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
        at(FLY + 400, () => stop());
        return;
      }
      const d = own(dest, z);
      const start = { x: 0, y: 4 };
      const end = { x: d.x + d.w / 2 - cx, y: d.y + d.h / 2 - cy };
      const ctrl = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - Math.max(50, Math.abs(end.x - start.x) * 0.25) };
      const k = d.w / n;
      const frames: Keyframe[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const v = 1 - t;
        const x = v * v * start.x + 2 * v * t * ctrl.x + t * t * end.x;
        const y = v * v * start.y + 2 * v * t * ctrl.y + t * t * end.y;
        frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 + (k - 1) * t}) rotate(${-8 * Math.sin(Math.PI * t)}deg)` });
      }
      piece.getAnimations().forEach((x) => x.cancel());
      piece.animate(frames, { duration: LANDS - FLY, easing: 'linear', fill: 'forwards' });
    });
    at(LANDS - LINE_LEAD, () => say('words'));
    at(LANDS, () => {
      const dest = u.to();
      stop();
      dest?.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(0.94)', offset: 0.6 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    });
  });
  return stop;
}

/** Stops one under way, all of it going to the line (the game screen going: Game.svelte). */
export const stopFossilFlight = () => current?.stop();

/** The moment's timing, for the benches and tests (ms from the verdict). */
export const FOSSIL_FIND = { RISE, HANG, STRIKE, SPLIT, NAME, HOLD, FLY, LANDS, LINE_LEAD, STONE } as const;
