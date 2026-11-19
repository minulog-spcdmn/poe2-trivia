// The Ritual aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { arc, at, line, pt, ring, transform, type Pt } from '../arcane.ts';
import { MARKS } from '../alchemy.ts';
import { disc, sealRing, type Seal, type Sign, type AuraSeal } from './kit.ts';

/**
 * The Ritual's seal: the sacrificial circle seen from above, as the aura
 * lays it on the floor: its runes drawn in blood in a band round it, each
 * turned outward, and at its heart the pool of blood, in level lines (as an
 * engraver draws still liquid) below the light caught on its upper part. It
 * stays in its ring, as a common fossil's seal does: what sets it apart is
 * the band of runes and the pool.
 */
const ritual: Seal = (p, c, R) => {
  const Rb = R * 0.62;
  sealRing(p, c, R);
  p.add(ring(c, Rb), 'thin');
  p.add(ring(c, Rb + 0.9), 'hair');
  // The runes, written round the band, as large as it holds.
  const runeR = (R - 1.1 + Rb + 0.9) / 2;
  const runeK = (R - 1.1 - Rb - 0.9 - 1.1) / 4;
  let runes = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 360 + 8;
    runes += transform(MARKS[(i * 5) % MARKS.length], at(c, a, runeR), runeK, a);
  }
  p.add(runes, 'hair');
  // The pool: its rim, and level lines across it below where the light lies on it.
  const Rp = R * 0.36;
  p.add(ring(c, Rp), 'thin');
  let pool = '';
  for (let y = -Rp * 0.3; y < Rp - 0.8; y += 1.15) {
    const half = Math.sqrt(Math.max(0, (Rp - 0.8) ** 2 - y * y));
    if (half > 0.6) pool += line([c[0] - half, c[1] + y], [c[0] + half, c[1] + y]);
  }
  p.add(pool, 'hatch');
  p.knockout += disc(c, R + 1.4);
};

/**
 * The Ritual's sign: the rune the game marks a Ritual altar with on the
 * minimap (the owner's pick), traced off its icon's pixels (64 px): the
 * middles of its lines, taken from the icon stood upright (it leans a
 * degree) and averaged with its mirror image, since the rune is symmetric
 * and a 64 px icon blurs each side differently; then straightened where a
 * line runs straight. Its ring and the small circle at its crown are fitted
 * circles; the ring keeps the icon's own gaps, open at the upper left and at
 * the foot, and meeting the small circle at the right. Inside: an M, two
 * posts and their slants, crossed by two chevrons; a diamond with an eye at
 * its heart; a V under it, and a bud on a short stem at its foot. In the
 * icon's pixels, y down.
 */
const RUNE = [
  '28.1,28.5 30.8,33.2 33.25,34.5 35.7,33.2 38.4,28.5',
  '33.25,42.4 33.25,34.6',
  '20.4,29.4 22.8,28.8 26.6,26',
  '46.1,29.4 43.7,28.8 39.9,26',
  '31.5,29.1 32.1,27.7 33.25,27.4 34.4,27.7 35,29.1',
  '31.3,52.1 29.8,50.9 30,49.1 31.5,47.5 33.25,47.1 35,47.5 36.5,49.1 36.7,50.9 35.2,52.1',
  '31.6,54.7 31.3,52.2',
  '34.9,54.7 35.2,52.2',
  '19.8,48.4 19.6,39.8 20.2,32.7',
  '46.7,48.4 46.9,39.8 46.3,32.7',
  '21,17.6 20.8,16.4',
  '45.5,17.6 45.7,16.4',
  '26.7,26 28,28.1',
  '39.8,26 38.5,28.1',
  '28.1,28.1 31.5,25.7 33.25,25.2 35,25.7 38.4,28.1',
  '33.25,42.7 33.25,47',
  '33.25,31 33.25,34.4',
  '20.3,32.6 23,31.9 27.9,28.5',
  '46.2,32.6 43.5,31.9 38.6,28.5',
  '26.6,25.7 22.6,18.5 21.1,17.7',
  '39.9,25.7 43.9,18.5 45.4,17.7',
  '27,34.2 31.3,41.7 33.25,42.6 35.2,41.7 39.5,34.2',
  '20.9,17.7 20.3,19.5 20.3,29.3',
  '45.6,17.7 46.2,19.5 46.2,29.3',
  '31.5,29.3 31.8,30.2 33.25,30.9 34.7,30.2 35,29.3',
  '20.2,32.5 20.3,29.5',
  '46.3,32.5 46.2,29.5',
  '26.8,25.7 31.2,22.5 33.25,21.7 35.3,22.5 39.7,25.7',
  '31.4,52.1 33.25,51 35.1,52.1',
  '33.25,51 33.25,47.2',
];
/** The ring: its middle and radius, and the arcs it is drawn in (degrees clockwise from the top). */
const RUNE_RING = { c: [33.28, 32.3] as Pt, r: 23.19, arcs: [[13.8, 162], [204, 317.4]] };
/** The small circle at the rune's crown. */
const RUNE_CROWN = { c: [33.19, 11.08] as Pt, r: 5.69 };
/** Where the rune's middle lies in its icon, and how far from it its furthest point lies. */
const RUNE_AT: Pt = [33.28, 30.4];
const RUNE_R = 25.01;
/** How far past the sign's reach the rune's furthest point goes. */
const RUNE_FIT = 1.08;

/** The altar's rune, engraved along its lines' middles. */
const altarRune: Sign = (p, c, r) => {
  const k = (r * RUNE_FIT) / RUNE_R;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - RUNE_AT[0]) * k, c[1] + (y - RUNE_AT[1]) * k];
  const run = (s: string) => s.split(' ').map((q, i) => (i ? 'L' : 'M') + pt(S(q.split(',').map(Number) as Pt))).join('');
  const rim = RUNE_RING.arcs.map(([a0, a1]) => arc(S(RUNE_RING.c), RUNE_RING.r * k, a0, a1)).join('');
  p.add(RUNE.map(run).join('') + rim + ring(S(RUNE_CROWN.c), RUNE_CROWN.r * k), 'sign');
};

export const seals: AuraSeal = { seal: ritual, sign: altarRune };
