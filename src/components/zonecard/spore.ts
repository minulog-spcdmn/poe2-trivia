// The spore family (Fungal Caverns, the sunken gardens and witchfire groves
// past 100): the letters drift in on the air from where they were scattered,
// in no order, slowly, turning a little as they come; as the name locks,
// spores rise off it (witchfire, green flame); while it holds, its light
// breathes and motes drift (rich screens); it leaves exhaled, each letter
// drifting up and aside into a blur, giving off a few motes.

import { C, embers, emitter } from '../../lib/fx/effects';
import { particle } from '../../lib/fx/core';
import { Shape } from '../../lib/fx/particles';
import { enter, shuffled, startsIn, times, type Ctx, type FamilyMotion } from './family';

/** A mote drifting off `el`, slowly, turning on the air. */
function mote(c: Ctx, el: Element, k = 0.6) {
  const b = el.getBoundingClientRect();
  particle({
    x: b.left + Math.random() * b.width,
    y: b.top + Math.random() * b.height,
    vx: (Math.random() - 0.5) * 30,
    vy: -10 - Math.random() * 25,
    life: 2 + Math.random() * 2,
    size: 1 + Math.random() * 1.8,
    color: times(Math.random() < 0.5 ? c.main : c.pale, k),
    gravity: -6,
    drag: 0.5,
    shape: Shape.Mote,
    fadeIn: 0.25,
    turbulence: 60,
  });
}

export const spore: FamilyMotion = {
  flicker: (ms) => 1 + 0.35 * Math.sin((ms / 2600) * Math.PI * 2),

  enter(c) {
    const at = startsIn(c, shuffled(c, c.glyphs));
    const blur = c.phone ? 5 : 8;
    for (const i of c.glyphs) {
      const [x, y, r] = [(c.rnd() - 0.5) * 1, (c.rnd() - 0.5) * 1, (c.rnd() - 0.5) * 20];
      enter(
        c,
        c.inner[i],
        [
          { opacity: 0, transform: `translate(${x.toFixed(2)}em, ${y.toFixed(2)}em) rotate(${r.toFixed(1)}deg) scale(0.85)`, filter: `blur(${blur}px)`, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
          { offset: 0.6, opacity: 1, filter: 'blur(1px)' },
          { opacity: 1, transform: 'none', filter: 'none' },
        ],
        { at: at.get(i)!, ms: c.tl.letterMs },
      );
    }
    // Its glow breathes while it holds (to where the card's exit fades it from).
    c.play(c.glow, [{ opacity: 0.32 }, { opacity: 0.5 }, { opacity: 0.22 }, { opacity: 0.5 }, { opacity: 0.22 }], {
      at: c.tl.lock + 900,
      ms: Math.max(1, c.tl.exit - c.tl.lock - 900),
      easing: 'ease-in-out',
      fill: 'forwards',
    });
  },

  lock(c) {
    embers(c.word, { count: 20, area: 'fill', colors: [c.main, c.pale], rise: [10, 45], scatter: 30, turbulence: 160, life: [1.2, 2.2], size: [1, 2] });
    if (c.has('witchfire')) embers(c.word, { count: 12, area: 'fill', colors: [C.good, C.goodPale], rise: [40, 110] });
  },

  ambient(c) {
    const drift = emitter(8, () => mote(c, c.plate, 0.45));
    return () => drift.stop();
  },

  exit(c) {
    const order = shuffled(c, c.glyphs);
    const gap = Math.min(24, 200 / Math.max(1, order.length - 1));
    order.forEach((i, k) => {
      const at = c.tl.exit + k * gap;
      const side = (c.rnd() - 0.5) * 0.6;
      c.play(c.inner[i], [{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: `translate(${side.toFixed(2)}em, -0.5em)`, filter: 'blur(8px)' }], {
        at,
        ms: 600,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.4)',
        fill: 'forwards',
      });
      if (!c.phone || k % 2 === 0) c.at(at + 100, () => [0, 1, 2].forEach(() => mote(c, c.inner[i], 0.8)));
    });
  },
};
