// The light family (Vaal Outpost; Abyssal City, the lantern necropolises and
// the starfall abysses, lit as lanterns by unseen hands; the drowned temples,
// whose tide moves them): each letter is lit like a lamp, flickering alight,
// left to right or (lanterns) in no order; a shaft of light crosses the name
// as it locks, a slanted slit holding a pale copy of it that slides across
// while the copy slides back, so nothing repaints (as a glint passes over
// the achievements' seals, lib/glint.ts); falling stars, for a starfall;
// while it holds a lamp gutters now and then, and dust settles (rich
// screens); it leaves as the lamps go out, the last lit first. A drowned
// temple's letters ripple while it holds and drip away as it leaves.

import { emitter, flash, glints, sparks } from '../../lib/fx/effects';
import { particle } from '../../lib/fx/core';
import { Shape } from '../../lib/fx/particles';
import { IN, shuffled, startsIn, times, type Ctx, type FamilyMotion } from './family';

/** The order the lamps are lit in (the same for a card's exit as for its entrance). */
const orders = new WeakMap<Ctx, number[]>();
function lit(c: Ctx): number[] {
  let order = orders.get(c);
  if (!order) orders.set(c, (order = c.has('lanterns') ? shuffled(c, c.glyphs) : c.glyphs));
  return order;
}

export const light: FamilyMotion = {
  enter(c) {
    const order = lit(c);
    const at = startsIn(c, order);
    for (const i of c.glyphs)
      c.play(
        c.inner[i],
        [
          { opacity: 0, filter: 'brightness(1.8)' },
          { offset: 0.3, opacity: 0.8, filter: 'brightness(1.8)' },
          { offset: 0.5, opacity: 0.3, filter: 'brightness(1.5)' },
          { offset: 0.75, opacity: 1, filter: 'brightness(1.3)' },
          { opacity: 1, filter: 'none' },
        ],
        { at: at.get(i)!, ms: c.tl.letterMs },
      );
    // The shaft of light, crossing the name as it locks.
    const shaft = document.createElement('span');
    shaft.className = 'shaft';
    const copy = document.createElement('span');
    copy.className = 'shaft-copy';
    copy.textContent = c.letters.textContent;
    shaft.append(copy);
    c.word.append(shaft);
    const w = c.word.getBoundingClientRect().width;
    const slit = Math.max(40, w * 0.12);
    // Both slanted about the slit's top left, so the copy's slant undoes the slit's exactly.
    shaft.style.cssText = `position:absolute;top:-0.2em;bottom:-0.2em;left:0;width:${slit}px;overflow:hidden;transform:skewX(-18deg);transform-origin:0 0;opacity:0;pointer-events:none`;
    copy.style.cssText = `position:absolute;left:0;top:0.2em;white-space:pre;color:#fff8e8;padding-left:var(--track);transform:skewX(18deg);transform-origin:0 -0.2em;text-shadow:0 0 12px var(--accent)`;
    const from = c.tl.lock - 300;
    c.play(shaft, [{ opacity: 0, transform: `translateX(${-slit}px) skewX(-18deg)` }, { opacity: 0.85, offset: 0.2 }, { opacity: 0.85, offset: 0.8 }, { opacity: 0, transform: `translateX(${w}px) skewX(-18deg)` }], { at: from, ms: 600, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' });
    c.play(copy, [{ transform: `translateX(${slit}px) skewX(18deg)` }, { transform: `translateX(${-w}px) skewX(18deg)` }], { at: from, ms: 600, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' });
    // Now and then a lamp gutters while it holds.
    for (let t = c.tl.lock + 1400, k = 0; t < c.tl.exit - 300; t += 1400, k++) {
      const i = c.glyphs[Math.floor(c.rnd() * c.glyphs.length)];
      c.play(c.inner[i], [{ opacity: 1 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0.6, offset: 0.7 }, { opacity: 1 }], { at: t, ms: 260, fill: 'none', composite: 'replace' });
    }
    // A drowned temple's tide.
    if (c.has('tide'))
      c.glyphs.forEach((i, k) =>
        c.play(c.outer[i], [{ translate: '0 0' }, { translate: '0 -0.05em' }, { translate: '0 0.05em' }, { translate: '0 0' }], {
          at: c.tl.lock + 300 + k * 60,
          ms: 1600,
          easing: 'ease-in-out',
          composite: 'add',
          fill: 'none',
        }),
      );
  },

  lock(c) {
    flash(c.word, { intensity: 0.22, color: c.main, radius: c.word.getBoundingClientRect().width * 0.6 });
    if (c.has('starfall'))
      for (let k = 0; k < 6; k++)
        sparks({ x: c.word.getBoundingClientRect().left + Math.random() * c.word.getBoundingClientRect().width, y: c.word.getBoundingClientRect().top - 120 }, {
          count: 1,
          angle: Math.PI / 2 + (Math.random() - 0.5) * 0.4,
          spread: 0.1,
          speed: [260, 420],
          gravity: 300,
          colors: [c.pale],
          life: [0.6, 1],
          delay: Math.random() * 0.5,
        });
  },

  ambient(c) {
    const dust = emitter(5, () => {
      const b = c.plate.getBoundingClientRect();
      particle({
        x: b.left + Math.random() * b.width,
        y: b.top + Math.random() * b.height * 0.4,
        vx: (Math.random() - 0.5) * 8,
        vy: 6 + Math.random() * 10,
        life: 3 + Math.random() * 2,
        size: 0.8 + Math.random() * 1.2,
        color: times(c.pale, 0.35),
        gravity: 4,
        drag: 0.6,
        shape: Shape.Mote,
        fadeIn: 0.3,
        turbulence: 10,
      });
    });
    return () => dust.stop();
  },

  exit(c) {
    const order = [...lit(c)].reverse();
    if (c.has('tide')) {
      const drip = Math.min(20, 300 / Math.max(1, order.length - 1));
      order.forEach((i, k) => {
        const at = c.tl.exit + k * drip;
        c.play(c.inner[i], [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(0.3em) scaleY(1.6)' }], { at, ms: 500, easing: IN, fill: 'forwards' });
      });
      c.at(c.tl.exit + 150, () => sparks(c.word, { count: c.phone ? 3 : 6, area: 'fill', colors: [c.pale], angle: Math.PI / 2, spread: 0.4, speed: [20, 60], gravity: 700, life: [0.5, 0.9] }));
      return;
    }
    const gap = Math.min(28, 300 / Math.max(1, order.length - 1));
    order.forEach((i, k) => {
      const at = c.tl.exit + k * gap;
      c.play(
        c.inner[i],
        [
          { opacity: 1, filter: 'none' },
          { offset: 0.25, opacity: 1, filter: 'brightness(1.6)' },
          { opacity: 0, filter: 'brightness(0.4)' },
        ],
        { at, ms: 330, easing: IN, fill: 'forwards' },
      );
      if (!c.phone || k % 3 === 0) c.at(at + 60, () => glints(c.inner[i], { count: 1, area: 'centre', size: [3, 6], color: c.pale }));
    });
  },
};
