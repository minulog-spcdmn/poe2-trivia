// A fossil kept (docs/gameplay.md, Delve, "Fossils"): the reveal, held to
// the lamp. The card never said which fossil; a right answer is the payoff,
// the biggest moment a right answer has in Delve. The amber light that waited
// at the stage's foot while the question was up (QuestionView's
// .fossil-mark) swells up beside the item; at its brightest the fossil is
// there, whole and lit, in its own art; a band of lamplight sweeps across it
// and its shape goes sharp, glints ringing off its edges; its name is written
// in beneath, letter by letter, as the pen writes a circle's script. A rare
// gets a second sweep in red-gold and a ring of light out over the stage.
// Then it flies to its place in the line under the title (QuestionView's
// .found-fossil), where it stays for the rest of the question.
//
// The motion, in order (ms from the verdict, which marks the answer and
// flares the circle first; green stays the right answer's):
//   300 to 450    the light rises from the stage's foot to the item's middle,
//                 swelling as it comes, fast and then slowing;
//   450           at its brightest the fossil is there, whole: it comes up
//                 overbright and soft and settles to its own light and edge
//                 by 900, as the band of lamplight sweeps across it (450 to
//                 820); the light it came in goes out into it;
//   560           glints ring off its edges, a warm light flashes behind;
//   700 to 1300   its name is written in beneath, letter by letter;
//   1300 to 1550  its count comes in under it ("7 of 25"; "Rare" for a rare);
//   900 to 1300   a rare: the second sweep, red-gold, and a ring of light
//                 running out over the stage;
//   1550 to 2700  held;
//   2700 to 3360  it flies to the line along an arc that rises before it
//                 falls, shrinking to the line's picture; the name and count
//                 fade here as the line's come in there; the veil lifts;
//   3360          it lands: the line's picture takes it with a short swell.
// With reduced motion, nothing moves: the line alone, at 450 ms.
//
// It all hangs on the page's body (fixed, outside the game's transformed
// stage), zoomed as the stage is, built and taken away here.

import { backdropDropShadow } from './backdropDropShadow.ts';
import { glints, puffs, shards } from './fx/effects.ts';
import type { Vec3 } from './fx/core.ts';
import { holdLight, light } from './lights.ts';
import { sfx } from './sound.ts';
import { zoomOf } from './stage.ts';
import { fossilArt, fossilById, type FossilId } from './fossils.ts';
import { FOSSIL_REVEAL, type FindSize } from './fossilReveal.ts';

const { RISE, LIT, SWEPT, SHARP, GLINTS, NAME, COUNT, SHOWN, FLY, LANDS, RARE, RARE_SWEEP, RING, LINE_LEAD } = FOSSIL_REVEAL;

/** Amber's light (direction-a.md), for the fx and the lights (HDR). */
const AMBER: Vec3 = [1, 0.62, 0.22];
const AMBER_HOT: Vec3 = [3.1, 2.2, 0.9];
const RED_GOLD: Vec3 = [3.0, 1.2, 0.35];
const EMBER: Vec3 = [0.5, 0.22, 0.05];

/** The art box (stage px) under which the fossil comes up over the whole question instead. */
const ART_MIN = 120;

const SIZE = FOSSIL_REVEAL.SIZE;

let current: { stop: () => void } | null = null;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** A band of light across the fossil: its copy's mask slides from off the left to off the right (as glint.ts's stripe). */
const SWEEP: Keyframe[] = [
  { opacity: 1, maskPosition: '100% 0', webkitMaskPosition: '100% 0' },
  { opacity: 1, maskPosition: '0% 0', webkitMaskPosition: '0% 0' },
] as Keyframe[];

export type Reveal = {
  id: FossilId;
  /** The fossils held now, this one in it, of `total`. */
  count: number;
  total: number;
  /** The light that waited at the stage's foot (the question's mark), where it rises from (null: the art's foot). */
  from: Element | null;
  /** The item's art, whose middle it comes to, and the question, for art too small or gone. */
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

/** The fossil's art as an image, `cls` its part. */
function picture(id: FossilId, cls: string) {
  const img = document.createElement('img');
  img.className = cls;
  img.src = fossilArt(id, 256);
  img.alt = '';
  img.draggable = false;
  return img;
}

/**
 * Plays it from now, the verdict. Says what stops it (a new one, the
 * question going, Delve Deeper pressed early): all of it goes to the line.
 */
export function revealFossil(u: Reveal): () => void {
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
  let shadow: { destroy(): void } | null = null;
  let lamp: ReturnType<typeof holdLight> | null = null;
  let glow = 0;
  const stop = () => {
    for (const t of timers) clearTimeout(t);
    cancelAnimationFrame(glow);
    lamp?.release();
    lamp = null;
    shadow?.destroy();
    root?.remove();
    root = null;
    say('landed');
    if (current?.stop === stop) current = null;
  };
  current = { stop };

  if (u.still) {
    at(LIT, () => say('landed'));
    return stop;
  }

  at(RISE, () => {
    const artBox = u.art?.getBoundingClientRect();
    const over = artBox && u.art && artBox.height / zoomOf(u.art) >= ART_MIN ? u.art : u.stage;
    const overBox = over?.getBoundingClientRect();
    if (!overBox || !overBox.width) return stop();
    const z = zoomOf(over!);
    const box = own(overBox, z);
    const n = SIZE[u.size];
    const fossil = fossilById(u.id);

    root = document.createElement('div');
    root.className = 'fossil-reveal';
    root.setAttribute('aria-hidden', 'true');
    root.style.zoom = String(z);
    const veil = document.createElement('div');
    veil.className = 'fr-veil';
    Object.assign(veil.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });

    // The fossil, lit; the band of lamplight that sweeps it (a copy of it, overbright, under a sliding stripe); a rare's red-gold one.
    const piece = document.createElement('div');
    piece.className = 'fr-piece';
    const art = picture(u.id, 'fr-art');
    const sweep = picture(u.id, 'fr-sweep');
    piece.append(art, sweep);
    const sweep2 = fossil.rare ? picture(u.id, 'fr-sweep red') : null;
    if (sweep2) piece.append(sweep2);

    // Its name, each letter on its own to be written in; its count; a rare's word.
    const label = document.createElement('div');
    label.className = 'fr-label';
    const name = document.createElement('span');
    name.className = 'fr-name';
    const letters = [...fossil.name].map((ch) => {
      const l = document.createElement('span');
      l.textContent = ch;
      return l;
    });
    name.append(...letters);
    const count = document.createElement('span');
    count.className = 'fr-count';
    count.textContent = u.count >= u.total ? `${u.count} of ${u.total} • every fossil kept` : `${u.count} of ${u.total}`;
    label.append(name, count);
    let rareWord: HTMLElement | null = null;
    if (fossil.rare) {
      rareWord = document.createElement('span');
      rareWord.className = 'fr-rare';
      rareWord.textContent = 'Rare';
      label.append(rareWord);
    }
    const ring = fossil.rare ? document.createElement('div') : null;
    if (ring) ring.className = 'fr-ring';

    // The light that rises: a small bright heart (the big light round it is the backdrop's, dithered: lights.ts).
    const heart = document.createElement('div');
    heart.className = 'fr-heart';

    root.append(veil, ...(ring ? [ring] : []), heart, piece, label);
    document.body.append(root);

    // The fossil and its words centred on the art together (its words measured as laid out), kept inside it.
    const gap = Math.max(4, n * 0.05);
    const group = n + gap + label.offsetHeight;
    const cx = box.x + box.w / 2;
    const top = box.y + Math.max(0, (box.h - group) / 2);
    const cy = top + n / 2;
    Object.assign(piece.style, { left: `${cx - n / 2}px`, top: `${top}px`, width: `${n}px`, height: `${n}px` });
    label.style.left = `${cx}px`;
    label.style.top = `${top + n + gap}px`;
    if (ring) Object.assign(ring.style, { left: `${cx}px`, top: `${cy}px`, width: `${n * 1.2}px`, height: `${n * 1.2}px` });
    shadow = backdropDropShadow(name);

    // ---- the light rises from the stage's foot, swelling, to the item's middle ----
    const fromBox = u.from?.getBoundingClientRect();
    const f = fromBox && fromBox.width ? own(fromBox, z) : { x: cx, y: box.y + box.h - 16, w: 0, h: 0 };
    const hs = n * 0.5;
    Object.assign(heart.style, { left: `${cx - hs / 2}px`, top: `${cy - hs / 2}px`, width: `${hs}px`, height: `${hs}px` });
    const dx = f.x + f.w / 2 - cx;
    const dy = f.y + f.h / 2 - cy;
    const risen = (LIT - RISE) / (LIT + 250 - RISE);
    heart.animate(
      [
        { opacity: 0.85, transform: `translate(${dx}px, ${dy}px) scale(0.35)`, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
        { opacity: 1, transform: 'translate(0, 0) scale(1.6)', offset: risen, easing: 'ease-in' },
        { opacity: 0, transform: 'translate(0, 0) scale(2.1)' },
      ],
      { duration: LIT + 250 - RISE, fill: 'forwards' },
    );
    veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LIT - RISE + 150, easing: 'ease-out', fill: 'forwards' });
    // The backdrop's light follows the heart up and swells with it, then settles on the fossil while it's shown.
    lamp = holdLight(heart, AMBER, n * 1.4);
    const lit = performance.now();
    const breathe = () => {
      const t = performance.now() - lit;
      const up = Math.min(1, t / (LIT - RISE));
      const k = t < LIT - RISE ? 0.25 + 0.55 * up * up : Math.max(0.32, 0.8 - ((t - (LIT - RISE)) / 900) * 0.48);
      lamp?.set(k, n * (1.4 + 1.2 * up));
      if (root && lamp) glow = requestAnimationFrame(breathe);
    };
    glow = requestAnimationFrame(breathe);
    puffs(heart, { count: 4, color: EMBER, speed: [10, 40], size: [8, 16], area: 'centre' });

    // ---- at its brightest, the fossil is there, whole; the lamplight sweeps it and it goes sharp ----
    at(LIT, () => {
      sfx('findReward');
      piece.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 160, easing: OUT, fill: 'forwards' });
      art.animate(
        [
          { filter: 'brightness(2.3) saturate(0.8) blur(3px)' },
          { filter: 'brightness(1.35) blur(0.6px)', offset: 0.55 },
          { filter: 'brightness(1) blur(0)' },
        ],
        { duration: SHARP - LIT, easing: 'ease-out', fill: 'forwards' },
      );
      sweep.animate(SWEEP, { duration: SWEPT - LIT, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' });
      light(piece, { color: AMBER, radius: n * 2.4, intensity: 0.65, hold: 0.25, decay: 1.2 });
    });
    at(GLINTS, () => glints(art, { count: 7, color: AMBER_HOT, area: 'edge', size: [4, 9], life: [0.5, 0.9], delay: [0, 0.22] }));

    // ---- its name, written in letter by letter; then its count ----
    at(NAME, () => {
      label.style.opacity = '1';
      const each = (COUNT - NAME - 300) / Math.max(1, letters.length - 1);
      letters.forEach((l, i) =>
        l.animate(
          [
            { opacity: 0, color: '#fff4cf' },
            { opacity: 1, color: '#fff4cf', offset: 0.3 },
            { opacity: 1, color: '#aa9e82' },
          ],
          { duration: 420, delay: i * each, easing: 'ease-out', fill: 'backwards' },
        ),
      );
    });
    at(COUNT, () => {
      for (const el of [count, rareWord]) el?.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: SHOWN - COUNT, easing: OUT, fill: 'forwards' });
      if (rareWord) at(COUNT + 200, () => glints(rareWord!, { count: 2, color: RED_GOLD, area: 'edge', size: [5, 8] }));
    });

    // ---- a rare: the second sweep, red-gold, and a ring of light out over the stage ----
    if (sweep2 && ring) {
      at(RARE, () => {
        sweep2.animate(SWEEP, { duration: RARE_SWEEP, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' });
        const reach = Math.max(box.w, box.h) / (n * 1.2);
        ring.animate(
          [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
            { opacity: 1, transform: 'translate(-50%, -50%) scale(0.9)', offset: 0.12 },
            { opacity: 0, transform: `translate(-50%, -50%) scale(${(reach * 1.3).toFixed(2)})` },
          ],
          { duration: RING, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
        );
        light(piece, { color: [1, 0.42, 0.14], radius: n * 3.2, intensity: 0.5, hold: 0.15, decay: 1 });
        glints(veil, { count: 8, color: RED_GOLD, area: 'fill', size: [3, 7], delay: [0.05, 0.4] });
      });
    }

    // ---- it flies to the line; the name and count fade here as the line's come in there ----
    at(FLY, () => {
      const dest = u.to()?.getBoundingClientRect();
      label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LANDS - FLY, easing: 'ease-in-out', fill: 'forwards' });
      lamp?.release();
      lamp = null;
      if (!dest || !dest.width) {
        piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
        at(FLY + 400, () => stop());
        return;
      }
      const d = own(dest, z);
      const end = { x: d.x + d.w / 2 - cx, y: d.y + d.h / 2 - cy };
      const ctrl = { x: end.x / 2, y: Math.min(0, end.y) - Math.max(50, Math.abs(end.x) * 0.25) };
      const k = d.w / n;
      const frames: Keyframe[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = easeInOut(i / steps);
        const v = 1 - t;
        const x = 2 * v * t * ctrl.x + t * t * end.x;
        const y = 2 * v * t * ctrl.y + t * t * end.y;
        frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 + (k - 1) * t}) rotate(${-8 * Math.sin(Math.PI * t)}deg)` });
      }
      piece.getAnimations().forEach((x) => x.cancel());
      piece.style.opacity = '1';
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

/**
 * Dynamite: the fossil's light on the question shatters with it, in amber
 * shards (Game.svelte, as the blast takes the question in `node`).
 */
export function shatterFossilMark(node: Element) {
  const box = node.querySelector('.fossil-mark')?.getBoundingClientRect();
  if (!box?.width) return;
  shards(box, { count: 14, colors: [AMBER_HOT, [2.6, 1.2, 0.3], [1.6, 0.6, 0.12]], cool: [0.4, 0.14, 0.03], speed: [120, 380], size: [2.5, 5.5], area: 'centre' });
}
