// The Ritual aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { at, line, pt, ring, transform, type Pt } from '../arcane.ts';
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
 * middles of its lines, joined where a line runs on through a crossing. A
 * ring broken at its crown by a small circle; inside it an M, two posts and
 * their slants, a diamond with an eye at its heart, crossed by an X; a V
 * under it, and a bud on a short stem at its foot. In the icon's pixels, y
 * down.
 */
const RUNE = [
  '33.5,42.8 35.3,41.8 37.5,37 39.8,33.7',
  '33.2,50.8 33.3,47 33.3,43 32.5,41.5 30.5,40.3 27.3,34.3',
  '25.7,54.5 21,52.3 19.5,51 19.3,50.2 19.8,48.7 19.7,41.3 20.5,33.2 20.2,30 20,19.2 20.7,17.8 20.5,16',
  '32,27.3 33.7,27.3 35,26.2',
  '31.8,27.5 31.2,29.2 29.3,30.3',
  '45.7,15.8 45.2,17.5 43.3,18.7 41.2,23.3 39.5,25.3 38,27.7 35.3,33.5 33.3,34.7',
  '45.2,17.5 45.8,18.8 45.5,22.8 46,28.8 46.3,31.8 46.8,35.2 46.8,47.2 48.5,49.5',
  '33.8,27.5 34.5,28.7 34.3,30 33,31 32.7,33.8',
  '28,28 30.2,26.5 31.3,26.3 32.7,25.2 35.2,26 38,27.7 43.3,31.3 46.2,32',
  '31.3,54.5 31.2,52 29.5,50.5 29.8,49.3 31.3,47.5 33.5,47.2 35.3,47.7 36.5,49.3 36.5,51 35.2,52.2 34.7,54.8',
  '21,17.8 22,18.2 23.2,19.7 26.3,25.8 27.7,28',
  '33,51 31.3,52',
  '27.8,28.8 29.2,30.3 30,31.5 30.3,32.8 32.5,34',
  '38.5,10.3 37.3,8 35.7,6.3 32.5,5.2 30.7,5.5 28.5,7 27.5,8.3 27,11.3 27.5,13.2 29,15.2 30.7,16.3 33.3,16.7 35.7,16.2 37.2,15 38.2,13.3 38.5,10.7',
  '46,28.8 43.5,28.2 39.2,25.3 32.8,21.5 26.7,25.8 22.7,29.3 20.3,30',
  '33.3,51 35,52.2',
  '38.7,10.5 41.3,10.5 48.8,14.5 53.3,20 55.3,25.2 56.2,31 56,37.3 54.3,42.3 52.3,45.7 48.7,49.5 46.5,51.5 41.2,54.3',
  '32.5,41.3 33,40.8 33.2,34.8',
  '17.3,14.8 13.3,20 11.5,23.5 10.3,28.3 10,33.2 10.7,37.3 13.5,44.7 17.7,49.7 19.2,50',
  '32.8,31 31.5,30.5',
  '30.2,31.5 31.3,30.5',
  '27.7,28.8 22.8,32.5 20.5,33.2',
];
/** Where the rune's middle lies in its icon, and how far from it its furthest point lies. */
const RUNE_AT: Pt = [33.2, 30.4];
const RUNE_R = 25.2;
/** How far past the sign's reach the rune's furthest point goes. */
const RUNE_FIT = 1.08;

/** The altar's rune, engraved along its lines' middles. */
const altarRune: Sign = (p, c, r) => {
  const k = (r * RUNE_FIT) / RUNE_R;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - RUNE_AT[0]) * k, c[1] + (y - RUNE_AT[1]) * k];
  const run = (s: string) => s.split(' ').map((q, i) => (i ? 'L' : 'M') + pt(S(q.split(',').map(Number) as Pt))).join('');
  p.add(RUNE.map(run).join(''), 'sign');
};

export const seals: AuraSeal = { seal: ritual, sign: altarRune };
