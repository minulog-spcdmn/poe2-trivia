// The ember family (Magma Fissure, Primeval Ruins in blue, the forges and
// reliquaries past 100): the divider's upper rule opens first, a fissure,
// and the letters rise out of it white-hot, cooling as they settle; as the
// name locks, embers burst off its top and sparks off its edges; while it
// holds, heat shimmers in its glow and embers keep rising (rich screens);
// it leaves burning away from left to right, each letter flaring, charring
// and rising off as ash and embers.

import { C, embers, emitter, puffs, sparks } from '../../lib/fx/effects';
import { IN, OUT, enter, startsIn, times, topOf, type Ctx, type FamilyMotion } from './family';

const SVG = 'http://www.w3.org/2000/svg';

/** The fire's colours: the zone's own, or (blue) Primeval Ruins' blue fire. */
const fire = (c: Ctx) => (c.has('blue') ? [C.portal, C.portalPale] : [c.main, c.pale]);

export const ember: FamilyMotion = {
  fissure: true,

  flicker: (ms) => 1 + 0.06 * Math.sin(ms / 70) + 0.05 * Math.sin(ms / 37 + 1.3),

  enter(c) {
    // Out of the fissure: the letters are cut off at its line until the name locks.
    c.play(c.letters, [{ clipPath: 'inset(-1em -0.6em 0 -0.6em)' }, { clipPath: 'inset(-1em -0.6em 0 -0.6em)' }], { at: 0, ms: c.tl.lock, fill: 'backwards' });
    const at = startsIn(c, c.glyphs);
    for (const i of c.glyphs)
      enter(c,
        c.inner[i],
        [
          { opacity: 0, transform: 'translateY(0.45em)', filter: 'brightness(2.4) blur(3px)', easing: OUT },
          { offset: 0.5, opacity: 1, filter: 'brightness(1.8) blur(1px)', easing: 'ease-out' },
          { opacity: 1, transform: 'none', filter: 'none' },
        ],
        { at: at.get(i)!, ms: c.tl.letterMs },
      );
  },

  lock(c) {
    const [main, pale] = fire(c);
    embers(topOf(c.word), { count: 24, rise: [60, 170], scatter: 40, colors: [main, pale], life: [0.8, 1.6] });
    sparks(c.word, { count: 18, area: 'edge', colors: [main, pale], speed: [80, 320], gravity: 200, life: [0.4, 0.9] });
    // Blue fire licks up off the whole name.
    if (c.has('blue')) embers(c.word, { count: 18, area: 'fill', colors: [C.portal, C.portalPale], rise: [70, 190], scatter: 20, life: [0.5, 1.1], size: [1, 2.2] });
  },

  ambient(c) {
    const [main, pale] = fire(c);
    // Heat shimmer in the glow under the name (never the letters, which stay crisp).
    const id = `zc-heat-${Math.floor(c.rnd() * 1e9)}`;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="${id}" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="3"><animate attributeName="baseFrequency" dur="2.4s" values="0.012 0.06;0.016 0.09;0.012 0.06" repeatCount="indefinite" /></feTurbulence><feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G" /></filter>`;
    c.plate.append(svg);
    c.glow.style.filter = `url(#${id}) blur(var(--glow-blur))`;
    const rising = emitter(12, () => embers(topOf(c.word, 0.85, 0.25), { count: 1, colors: [main, pale], rise: [40, 120], life: [0.8, 1.6], size: [1, 2] }));
    return () => {
      rising.stop();
      c.glow.style.filter = '';
      svg.remove();
    };
  },

  exit(c) {
    const ash = c.has('blue') ? [C.portal, C.portalPale, C.ash] : [C.ember, C.emberDeep, C.ash];
    const gap = Math.min(30, 280 / Math.max(1, c.glyphs.length - 1));
    c.glyphs.forEach((i, k) => {
      const at = c.tl.exit + k * gap;
      c.play(
        c.inner[i],
        [
          { opacity: 1, transform: 'none', filter: 'none' },
          { offset: 0.23, opacity: 1, filter: 'brightness(2.2)' },
          { offset: 0.42, opacity: 1, transform: 'none', filter: 'brightness(0.35) grayscale(0.6)', easing: IN },
          { opacity: 0, transform: 'translateY(-0.3em)', filter: 'brightness(0.2) grayscale(0.6) blur(2px)' },
        ],
        { at, ms: 520, fill: 'forwards' },
      );
      if (!c.phone || k % 2 === 0) c.at(at + 160, () => embers(c.inner[i], { count: 4, area: 'fill', colors: ash, rise: [30, 90], life: [0.6, 1.2], size: [0.8, 1.8] }));
    });
    c.at(c.tl.exit + 200, () => puffs(c.word, { count: 3, color: times(fire(c)[0], 0.12), speed: [10, 40], angle: -Math.PI / 2, spread: 0.8, life: [0.8, 1.4] }));
  },
};
