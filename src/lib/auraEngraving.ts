// The engraved plates of an aura's card (a try-out: ChooseCategory's auraAt,
// on the QA desk), cut by the same hand as the finds' and the fossils'
// (lib/findEngraving; docs/arcane-style.md: exact geometry, one-sided
// hatching, lines stopping short of what they meet, a soft glow under them).
// The aura burns in the window, round the item; what the plate gives it is
// its own seals in the spandrels, where a plain card has Sol and Luna: in
// Sol's place the aura's seal, drawn from the aura's own form (its light in
// lib/fx/auras), so large that part of it may break out over the arch, as a
// rare's does; in Luna's, its sign, with the reason it's that aura's. The
// back holds the seal at the mandorla's heart, in its glory.
//
// Each aura's seal and sign are in a file of their own (auraSeals/<aura>.ts,
// its comment saying what they show and why), drawn with the pieces they
// share (auraSeals/kit.ts). An aura without its own yet shows the common
// seal (auraSeals/common.ts), so no aura's card is a plain one.
// Laid in a row (phones) a face has no spandrels, so an aura's row is a
// plain card's; its back holds the seal.

import { at, type Hole, type Pt } from './arcane.ts';
import type { BackLayout, Plate, Variant } from './cardEngraving.ts';
import type { AuraKind } from './auraKinds.ts';
import { common } from './auraSeals/common.ts';
import type { AuraSeal } from './auraSeals/kit.ts';
import { seals as breach } from './auraSeals/breach.ts';
import { seals as delirium } from './auraSeals/delirium.ts';
import { seals as ritual } from './auraSeals/ritual.ts';
import { seals as expedition } from './auraSeals/expedition.ts';
import { seals as abyss } from './auraSeals/abyss.ts';
import { seals as azmeri } from './auraSeals/azmeri.ts';
import { seals as tower } from './auraSeals/tower.ts';
import { seals as chronomancer } from './auraSeals/chronomancer.ts';
import { seals as chayula } from './auraSeals/chayula.ts';
import { seals as lich } from './auraSeals/lich.ts';
import { seals as divine } from './auraSeals/divine.ts';
import { seals as corrupted } from './auraSeals/corrupted.ts';
import { seals as mirror } from './auraSeals/mirror.ts';
import { seals as ice } from './auraSeals/ice.ts';
import { seals as blacksun } from './auraSeals/blacksun.ts';
import { seals as runeseal } from './auraSeals/runeseal.ts';
import { seals as twilight } from './auraSeals/twilight.ts';
import { seals as slayer } from './auraSeals/slayer.ts';
import { seals as shadow } from './auraSeals/shadow.ts';

/** Each aura's seal and sign, null where it has none of its own yet. */
const AURA_SEALS: Record<AuraKind, AuraSeal | null> = {
  breach,
  delirium,
  ritual,
  expedition,
  abyss,
  azmeri,
  tower,
  chronomancer,
  chayula,
  lich,
  divine,
  corrupted,
  mirror,
  ice,
  blacksun,
  runeseal,
  twilight,
  slayer,
  shadow,
};

// ---- the plates -----------------------------------------------------------------

/** How far, on a card 218 wide, what breaks out of a seal in Sol's place reaches at most (the vein's and the flare's reach). */
const REACH = 30;
/** The seal's ring in Sol's place, on a card 218 wide (a little larger than Sol, as the fossil's is). */
const SEAL_R = 15.5;

/** How far along `u` from `c` a ray runs before it enters the box `b` (x0, y0, x1, y1), if it does. */
function intoBox(c: Pt, u: Pt, [x0, y0, x1, y1]: [number, number, number, number]): number | null {
  let [t0, t1] = [0, Infinity];
  for (const [o, d, lo, hi] of [
    [c[0], u[0], x0, x1],
    [c[1], u[1], y0, y1],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const [a, b] = [(lo - o) / d, (hi - o) / d];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : null;
}

/** The spandrels of an aura's tall face: its seal in Sol's place, its sign in Luna's. */
function spandrels(kind: AuraKind, p: Plate, sol: Hole, luna: Hole, w: number) {
  const { seal, sign } = AURA_SEALS[kind] ?? common;
  const k = w / 218;
  // What breaks out stops short of the card's edges and of the plaque over the keystone (ChooseCategory's tag).
  const plaque: [number, number, number, number] = [w / 2 - Math.min(52, w * 0.24), -50, w / 2 + Math.min(52, w * 0.24), 30];
  const room = (a: number) => {
    const u = at([0, 0], a, 1);
    const ts = [REACH * k];
    if (u[0] < -1e-9) ts.push((9 - sol.c[0]) / u[0]);
    if (u[1] < -1e-9) ts.push((9 - sol.c[1]) / u[1]);
    const t = intoBox(sol.c, u, plaque);
    if (t !== null) ts.push(t - 1.5);
    return Math.max(0, Math.min(...ts));
  };
  seal(p, sol.c, Math.min(sol.r * 1.2, SEAL_R * k), room);
  sign(p, luna.c, luna.r * 0.86);
}

/** An aura's back: its seal at the mandorla's heart, in the glory. */
function back(kind: AuraKind, p: Plate, g: BackLayout) {
  const { seal } = AURA_SEALS[kind] ?? common;
  // As large as the finds' seals stand there, short of the mandorla's moons.
  const r = Math.min(g.room(0) - 6, g.row ? 20 : 34) * (g.row ? 0.58 : 0.74);
  const room = (a: number) => Math.min(r * 2.1, g.room(a) - 2, ...g.holes.map((h) => (intoDisc(g.c, a, h) ?? Infinity) - 1.5));
  seal(p, g.c, r, room);
  // The glory sits back with the plate, not the motif.
  p.motif = false;
  p.glory(g.c, g.row ? 64 : 88, r + 3, (deg) => g.room(deg) + 1, 0.62, { holes: g.holes });
  p.motif = true;
}

/** How far along the heading `a` from `c` a ray runs before it meets the disc `h`, if it does. */
function intoDisc(c: Pt, a: number, h: Hole): number | null {
  const u = at([0, 0], a, 1);
  const [fx, fy] = [c[0] - h.c[0], c[1] - h.c[1]];
  const b = fx * u[0] + fy * u[1];
  const disc2 = b * b - (fx * fx + fy * fy - h.r * h.r);
  if (disc2 < 0) return null;
  const t = -b - Math.sqrt(disc2);
  return t > 0 ? t : null;
}

const variants = new Map<AuraKind, Variant>();

/** The plate of an aura's card: one object per aura, so its plates are kept (cardEngraving's engrave). */
export function auraVariant(kind: AuraKind): Variant {
  let v = variants.get(kind);
  if (!v) {
    v = {
      spandrels: (p, sol, luna, w) => spandrels(kind, p, sol, luna, w),
      back: (p, g) => back(kind, p, g),
    };
    variants.set(kind, v);
  }
  return v;
}
