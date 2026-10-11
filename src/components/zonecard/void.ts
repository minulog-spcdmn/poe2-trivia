// The void family (Abyssal Depths, the void blooms and blood eclipses past
// 100): the glyphs are pulled together out of fragments flung round a
// spiral, each trailed by two ghosts of itself in split colours that close
// in on it as it comes and are gone as the name locks; then particles are
// drawn into it from all round and a ring breaks out; while it holds, its
// seal turns and now and then the ghosts split out for a moment (rich
// screens); it leaves unmade, its letters drawn into the seal's centre, the
// ends first, as the seal shrinks after them.

import { C, flash, implode, ring } from '../../lib/fx/effects';
import { IN, type Ctx, type FamilyMotion } from './family';

/** The ghosts' two colours: the zone's colour run toward red and toward cyan (an eclipse's, toward crimson and gold). */
function ghosts(c: Ctx): [string, string] {
  if (c.has('eclipse')) return ['color-mix(in srgb, var(--accent) 40%, #e0283a)', 'color-mix(in srgb, var(--accent) 40%, #f0c060)'];
  return ['color-mix(in srgb, var(--accent) 50%, #ff3a5a)', 'color-mix(in srgb, var(--accent) 50%, #3ad0ff)'];
}

export const voidFamily: FamilyMotion = {
  enter(c) {
    const [a, b] = ghosts(c);
    c.glyphs.forEach((i, k) => {
      // Flung round a spiral, further out the further along the name.
      const ang = k * 2.4 + c.rnd() * 0.6;
      const r = 1.2 + c.rnd() * 0.8;
      const [x, y] = [Math.cos(ang) * r, Math.sin(ang) * r * 0.6];
      const turn = (c.rnd() - 0.5) * 60;
      c.play(
        c.inner[i],
        [
          { opacity: 0, transform: `translate(${x.toFixed(2)}em, ${y.toFixed(2)}em) rotate(${turn.toFixed(0)}deg) scale(0.6)`, filter: 'blur(4px)', easing: 'cubic-bezier(0.7, 0, 0.2, 1)' },
          { offset: 0.5, opacity: 0.9, filter: 'blur(1.5px)' },
          { opacity: 1, transform: 'none', filter: 'none' },
        ],
        { at: c.tl.starts[i], ms: c.tl.letterMs },
      );
      // Its ghosts, in split colours, closing in on it as it comes and gone as the name locks.
      for (const [side, colour] of [
        [-1, a],
        [1, b],
      ] as const) {
        const g = document.createElement('span');
        g.className = 'ghost';
        g.textContent = c.inner[i].textContent;
        g.style.cssText = `position:absolute;left:0;top:0;color:${colour};mix-blend-mode:screen;pointer-events:none`;
        c.inner[i].style.position = 'relative';
        c.inner[i].append(g);
        const from = c.tl.starts[i];
        c.play(g, [{ opacity: 0.45, transform: `translateX(${side * 0.18}em)` }, { opacity: 0.45, transform: `translateX(${side * 0.06}em)`, offset: 0.7 }, { opacity: 0, transform: 'none' }], {
          at: from,
          ms: Math.max(1, c.tl.lock + 120 - from),
          easing: 'cubic-bezier(0.3, 0, 0.3, 1)',
        });
        // Now and then they split out again while it holds (rich screens).
        if (c.rich)
          for (let t = c.tl.lock + 900 + k * 37; t < c.tl.exit - 200; t += 1300)
            c.play(g, [{ opacity: 0, transform: 'none' }, { opacity: 0.4, transform: `translateX(${side * 0.06}em)`, offset: 0.4 }, { opacity: 0, transform: 'none' }], { at: t, ms: 160, fill: 'none' });
      }
    });
  },

  lock(c) {
    const w = c.word.getBoundingClientRect().width;
    implode(c.word, { count: 30, radius: w * 0.55, color: c.pale, life: 0.5 });
    ring(c.word, { radius: w * 0.7, from: w * 0.1, thickness: 6, breakup: 0.6, color: c.main, intensity: 0.7, delay: 0.1 });
  },

  ambient(c) {
    // The spiral seal turns, a turn in 40 s.
    const turn = c.play(c.seal.querySelector('.lines')!, [{ rotate: '0deg' }, { rotate: '360deg' }], { at: c.tl.lock + 400, ms: 40000, fill: 'none' });
    return () => turn.cancel();
  },

  exit(c) {
    // The ends first.
    const order = [...c.glyphs].sort((a, b) => Math.abs(c.dx[b]) - Math.abs(c.dx[a]));
    order.forEach((i, k) => {
      const [x, y] = [c.toSeal[0] - c.dx[i], c.toSeal[1]];
      c.play(c.inner[i], [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) scale(0.3)` }], {
        at: c.tl.exit + k * 22,
        ms: 500,
        easing: 'cubic-bezier(0.6, 0, 0.9, 0.4)',
        fill: 'forwards',
      });
    });
    c.play(c.seal, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.6 }], { at: c.tl.exit + 300, ms: 500, easing: IN, fill: 'forwards' });
    c.at(c.tl.exit + 250, () => {
      implode(c.seal, { count: 26, color: c.pale, life: 0.5 });
      flash(c.seal, { radius: 24, intensity: 0.15, color: c.main });
    });
  },
};
