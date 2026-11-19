// The common seal and sign: what an aura's card shows until its aura has
// seals of its own (lib/auraEngraving), so no aura's card is a plain one.

import { at, type Pt } from '../arcane.ts';
import { bow, disc, engraveStar, fourStar, poly, sealRing, type AuraSeal, type Seal, type Sign } from './kit.ts';

/**
 * The common seal: a token in its aura. Its ring, and round it the aura's
 * flames, each a tongue swept round the way the aura turns, its two edges
 * bowed, rising longer above than below, as light rises.
 */
const seal: Seal = (p, c, R, room) => {
  sealRing(p, c, R);
  let edges = '';
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + 6;
    const tipA = a + 16;
    const up = 0.5 + 0.5 * Math.cos((tipA * Math.PI) / 180);
    const reach = Math.min(R * (1.32 + 0.3 * up), room(tipA) - 0.8);
    if (reach < R + 2) continue;
    const tip = at(c, tipA, reach);
    const [l, r]: Pt[] = [at(c, a - 5, R + 1.2), at(c, a + 5, R + 1.2)];
    const left = bow(l, tip, -(reach - R) * 0.14, 10);
    const right = bow(r, tip, -(reach - R) * 0.1, 10);
    edges += poly([...left, ...right.slice(0, -1).reverse()]).replace('Z', '');
    p.knockout += poly([at(c, a - 7, R), ...left.slice(1), ...right.slice(1, -1).reverse(), at(c, a + 7, R)]);
  }
  p.add(edges, 'hair');
  p.knockout += disc(c, R + 1.4);
};

/** The common sign: a glint, a four-pointed star, as light catches on an aura. */
const sign: Sign = (p, c, r) => {
  engraveStar(p, fourStar(c, () => r * 0.95, r * 0.42, r * 0.13), true);
};

export const common: AuraSeal = { seal, sign };
