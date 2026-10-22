// The rime family (Frozen Hollow, the frozen abysses and the glacial pyres
// past 100): the letters condense from above, from the middle out, bright
// and frosted, each catching a glint as it settles (rich screens); as the
// name locks, a ring of cold light and glints run off it (fire under the
// ice, the pyre, throws sparks too); while it holds, a glint catches one
// letter after another and snow drifts down; it leaves shattering, each
// letter split on a jagged seam, its halves falling and turning apart.

import { C, emitter, glints, ring, shards, sparks } from '../../lib/fx/effects';
import { particle } from '../../lib/fx/core';
import { Shape } from '../../lib/fx/particles';
import { IN, enter, fromMiddle, startsIn, type Ctx, type FamilyMotion } from './family';

const ICE = C.azuritePale;

/** A jagged seam down a letter, as polygon points (%), from the top to the bottom. */
function seam(c: Ctx): string[] {
  const x = (base: number) => `${(base + (c.rnd() - 0.5) * 16).toFixed(1)}%`;
  return [`${x(50)} -10%`, `${x(44)} 30%`, `${x(56)} 62%`, `${x(48)} 110%`];
}

export const rime: FamilyMotion = {
  enter(c) {
    const at = startsIn(c, fromMiddle(c));
    for (const i of c.glyphs) {
      enter(c,
        c.inner[i],
        [
          { opacity: 0, transform: 'translate(0, -0.18em) scale(1.08)', filter: `brightness(1.6) blur(${c.phone ? 3 : 5}px)`, easing: 'cubic-bezier(0.12, 0.9, 0.25, 1)' },
          { offset: 0.55, opacity: 1, filter: 'brightness(1.3) blur(0.6px)', easing: 'ease-out' },
          { opacity: 1, transform: 'none', filter: 'none' },
        ],
        { at: at.get(i)!, ms: c.tl.letterMs },
      );
      if (c.rich) c.at(at.get(i)! + c.tl.letterMs * 0.6, () => glints(c.inner[i], { count: 1, area: 'centre', size: [4, 7], color: ICE }));
    }
    // The halves each letter shatters into, made now (hidden) so the exit only moves them.
    for (const i of c.glyphs) {
      const s = seam(c);
      for (const side of [0, 1]) {
        const half = c.inner[i].cloneNode(true) as HTMLElement;
        half.classList.add('half');
        half.style.cssText = `position:absolute;left:0;top:0;opacity:0;clip-path:polygon(${side ? `100% -10%, ${s.join(', ')}, 100% 110%` : `0 -10%, ${s.join(', ')}, 0 110%`})`;
        c.outer[i].append(half);
      }
    }
  },

  lock(c) {
    const w = c.word.getBoundingClientRect().width;
    ring(c.word, { radius: w * 0.6, from: w * 0.2, thickness: 2, breakup: 0.5, color: ICE, intensity: 0.6, life: 0.8 });
    glints(c.word, { count: 10, area: 'edge', size: [4, 9], color: ICE, delay: [0, 0.6] });
    if (c.has('pyre')) sparks(c.word, { count: 16, area: 'edge', colors: [C.ember, C.gold], speed: [80, 300], gravity: 160 });
  },

  ambient(c) {
    const glint = emitter(1 / 0.9, () => glints(c.inner[c.glyphs[Math.floor(Math.random() * c.glyphs.length)]], { count: 1, area: 'centre', size: [3, 6], color: ICE }));
    const snow = emitter(6, () => {
      const b = c.plate.getBoundingClientRect();
      particle({
        x: b.left + Math.random() * b.width,
        y: b.top + Math.random() * b.height * 0.3,
        vx: (Math.random() - 0.5) * 14,
        vy: 12 + Math.random() * 14,
        life: 3 + Math.random() * 2,
        size: 1 + Math.random() * 1.6,
        color: [ICE[0] * 0.5, ICE[1] * 0.5, ICE[2] * 0.5],
        gravity: 18,
        drag: 0.4,
        shape: Shape.Mote,
        fadeIn: 0.2,
        turbulence: 18,
      });
    });
    return () => {
      glint.stop();
      snow.stop();
    };
  },

  exit(c) {
    fromMiddle(c).forEach((i, k) => {
      const at = c.tl.exit + k * 18;
      c.play(c.inner[i], [{ opacity: 1 }, { opacity: 0 }], { at, ms: 1, fill: 'forwards' });
      [...c.outer[i].querySelectorAll<HTMLElement>('.half')].forEach((half, side) => {
        const dir = side ? 1 : -1;
        const fall = 14 + c.rnd() * 10;
        c.play(
          half,
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: `translate(${dir * (3 + c.rnd() * 4)}px, ${fall}px) rotate(${dir * (4 + c.rnd() * 3)}deg)` },
          ],
          { at, ms: 450, easing: IN, fill: 'forwards' },
        );
      });
    });
    c.at(c.tl.exit, () => shards(c.word, { count: 14, colors: [ICE, C.azurite], area: 'fill', speed: [40, 160] }));
  },
};
