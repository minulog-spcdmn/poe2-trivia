// The fume family (Sulphur Vents and the sulphur marshes past 100; the
// Petrified Forest's stone, which crumbles): a fog of the zone's colour
// swells behind the name and its letters rise out of it, like columns of
// fumes, every other one a little later and lower; as the name locks, puffs
// rise off it (stone: a few glints); while it holds its letters bob on the
// fumes (rich screens) and the fog drifts; it leaves lifted away with the
// fog, blurring as it rises. Stone turns grey instead, and its letters drop
// and turn as they crumble into falling ash.

import { C, glints, puffs } from '../../lib/fx/effects';
import { particle } from '../../lib/fx/core';
import { Shape } from '../../lib/fx/particles';
import { IN, sharp, soft, times, type FamilyMotion } from './family';
import dither from '../../assets/dither.png';

// The fog's mask. Its fade is a Gaussian, the falloff a blur leaves (the
// shape the fog always had), eased to nothing at the edge with no slope left,
// so it ends without a line where it stops (a stop every 2.5%, so the straight
// runs between them leave no kink). So faint a glow over so much of the
// screen bands in 8 bits, so the mask carries the dither too (app.css,
// --dither, imported here: in an inline style the variable's url resolves
// against the page, where the built tile isn't, and with that layer gone the
// fog is the weight's flat ellipse): it stirs the fog's opacity a little, a different amount each
// pixel, and the bands dissolve (a blur would average it away). Mask layers
// composite bottom up, each over what is below: the dither cut by a weight,
// then the fade laid over it. Over the fade, the dither only shows through
// what the fade leaves, so the fade peaks at half (the colour twice as strong
// to match) and the dither stirs the core too. On its own it would also
// brighten the fog by its mean, out to the box's hard edge, so the fade is
// lowered by that mean; in its last wisps, fainter than the mean, the weight
// thins the dither just enough that the two still average to the fade.
const DITHER_MEAN = 5 / 255; // the --dither tile's mean opacity
const PEAK = 0.5;
const fade = (r: number) => PEAK * Math.exp((-r * r) / 0.27) * (1 - r ** 8) ** 2;
const weight = (r: number) => Math.min(1, fade(r) / DITHER_MEAN);
const radial = (f: (r: number) => number) =>
  `radial-gradient(closest-side, ${Array.from({ length: 41 }, (_, i) => `rgb(0 0 0 / ${f(i / 40).toFixed(4)}) ${i * 2.5}%`).join(', ')})`;
const FOG_MASK = [
  radial((r) => {
    const k = DITHER_MEAN * weight(r);
    return (fade(r) - k) / (1 - k);
  }),
  `url(${dither})`,
  radial(weight),
].join(',');

export const fume: FamilyMotion = {
  enter(c) {
    // The fog, soft from the first, only moved and faded: the zone's colour,
    // shaped by the mask above.
    const fog = document.createElement('span');
    fog.className = 'fog';
    fog.style.cssText = [
      'position:absolute;inset:-0.6em -1.2em;pointer-events:none;opacity:0',
      `background:color-mix(in srgb, var(--accent) ${34 / PEAK}%, transparent)`,
      `mask-image:${FOG_MASK}`,
      'mask-size:100% 100%,auto,100% 100%;mask-repeat:no-repeat,repeat,no-repeat;mask-composite:add,intersect;image-rendering:pixelated',
    ].join(';');
    c.word.prepend(fog);
    c.play(fog, [{ opacity: 0, transform: 'scale(0.7, 0.5)' }, { opacity: 0.8, transform: 'scale(1)' }], { at: (c.tl.starts[0] ?? 1700) - 300, ms: 900, easing: 'ease-out' });
    c.play(fog, [{ translate: '0 0', opacity: 0.8 }, { translate: '0.3em -0.08em', opacity: 0.6 }, { translate: '-0.2em 0.05em', opacity: 0.75 }], {
      at: c.tl.lock,
      ms: Math.max(1, c.tl.exit - c.tl.lock),
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    c.play(fog, [{ opacity: 0.75, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.6em) scale(1.3)' }], { at: c.tl.exit, ms: 800, easing: 'ease-in', fill: 'forwards' });
    c.glyphs.forEach((i, k) => {
      const odd = k % 2 === 1;
      c.play(
        c.inner[i],
        [
          { opacity: 0, transform: `translateY(${odd ? 0.8 : 0.6}em) scaleY(1.12)`, ...soft(c.phone ? 5 : 8, c.ink, c.shadows), easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          { offset: 0.55, opacity: 1, ...soft(1.5, c.ink, c.shadows) },
          ...sharp(c.ink, c.shadows, { opacity: 1, transform: 'none' }),
        ],
        { at: c.tl.starts[i] + (odd ? 60 : 0), ms: c.tl.letterMs - (odd ? 60 : 0) },
      );
      // Bobbing on the fumes while it holds (rich screens).
      if (c.rich)
        c.play(c.outer[i], [{ translate: '0 0' }, { translate: '0 -1.5px' }, { translate: '0 1.5px' }, { translate: '0 0' }], {
          at: c.tl.lock + 200 + k * 90,
          ms: 2400,
          easing: 'ease-in-out',
          composite: 'add',
          fill: 'none',
        });
    });
  },

  lock(c) {
    if (c.has('crumble')) glints(c.word, { count: 4, area: 'edge', size: [3, 6], color: c.pale });
    else puffs(c.word, { count: 6, color: times(c.main, 0.4), angle: -Math.PI / 2, spread: 1, speed: [20, 60], life: [0.8, 1.4] });
  },

  exit(c) {
    if (c.has('crumble')) {
      const gap = Math.min(22, 200 / Math.max(1, c.glyphs.length - 1));
      c.glyphs.forEach((i, k) => {
        const at = c.tl.exit + k * gap;
        const turn = (c.rnd() - 0.5) * 10;
        c.play(
          c.inner[i],
          [
            { opacity: 1, transform: 'none', filter: 'none' },
            { offset: 0.25, opacity: 1, transform: 'none', filter: 'grayscale(1) brightness(0.7)', easing: IN },
            { opacity: 0, transform: `translateY(0.35em) rotate(${turn.toFixed(1)}deg)`, filter: 'grayscale(1) brightness(0.5)' },
          ],
          { at, ms: 600, fill: 'forwards' },
        );
        if (!c.phone || k % 2 === 0)
          c.at(at + 160, () => {
            const b = c.inner[i].getBoundingClientRect();
            for (let n = 0; n < 4; n++)
              particle({
                x: b.left + Math.random() * b.width,
                y: b.top + b.height * (0.3 + Math.random() * 0.6),
                vx: (Math.random() - 0.5) * 20,
                vy: 10 + Math.random() * 20,
                life: 0.8 + Math.random() * 0.8,
                size: 0.8 + Math.random() * 1.2,
                color: C.ash,
                gravity: 160,
                drag: 0.8,
                shape: Shape.Mote,
                fadeIn: 0.05,
              });
          });
      });
      return;
    }
    const gap = Math.min(14, 120 / Math.max(1, c.glyphs.length - 1));
    c.glyphs.forEach((i, k) =>
      c.play(c.inner[i], [{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: 'translateY(-0.6em) scaleY(1.15)', filter: 'blur(8px)' }], {
        at: c.tl.exit + (k % 2) * 60 + k * gap,
        ms: 620,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.3)',
        fill: 'forwards',
      }),
    );
    c.at(c.tl.exit + 100, () => puffs(c.word, { count: 8, color: times(c.main, 0.35), angle: -Math.PI / 2, spread: 1.2, speed: [20, 70], life: [0.8, 1.5] }));
  },
};
