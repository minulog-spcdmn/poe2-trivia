// The Runic Seals aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is a Runic Seal as the wearer breaks it (fx/auras/runeseal.ts:
// each right answer breaks one): the seal stone, a binding star of seven
// points cut in its face (the rune circle's own), with a piece broken out of
// it and flung clear over the arch. The sign is the coin she was bought with, tossed as she frees
// herself: a Djinn Barya, its rim scalloped, ridges running in to a beaded boss.

import { angleOf, at, lerp, line, pt, type Pt } from '../arcane.ts';
import { poly, disc, dist, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** `q` turned `deg` degrees (clockwise on screen) about `o`. */
const turnAbout = (q: Pt, o: Pt, deg: number): Pt => {
  const k = (deg * Math.PI) / 180;
  const [dx, dy] = [q[0] - o[0], q[1] - o[1]];
  return [o[0] + dx * Math.cos(k) - dy * Math.sin(k), o[1] + dx * Math.sin(k) + dy * Math.cos(k)];
};
const run = (ps: Pt[]) => `M${ps.map(pt).join('L')}`;

/**
 * The Runic Seals' seal: a seal stone with a piece broken out of it. The
 * stone is the ring and its face, the star cut in it; the piece, a wedge from its rim to near its heart along a jagged
 * break, is lifted out and away over the arch, turned a little, so the gap
 * it leaves gapes. The piece stands clear of the stone; the stone's lines
 * stop at the break.
 */
const runeseal: Seal = (p, c, R, room) => {
  // The break: from the rim at `a0`, in along a jagged line to near the heart, out again to the rim at `a1`.
  const [a0, a1] = [12, 84];
  const deep = R * 0.3;
  const tipA = (a0 + a1) / 2;
  const inner = at(c, tipA, deep);
  const jagged = (from: Pt, to: Pt, k: number[]) =>
    k.map((j, i) => {
      const q = lerp(from, to, i / (k.length - 1));
      const L = dist(from, to);
      return [q[0] - ((to[1] - from[1]) / L) * j * R, q[1] + ((to[0] - from[0]) / L) * j * R] as Pt;
    });
  const edgeA = jagged(at(c, a0, R + 0.4), inner, [0, 0.07, -0.05, 0]);
  const edgeB = jagged(inner, at(c, a1, R + 0.4), [0, -0.06, 0.04, 0]);
  const rim = (r: number, from: number, to: number, n = 24) => Array.from({ length: n + 1 }, (_, i) => at(c, from + ((to - from) * i) / n, r));
  // The piece: the wedge, lifted out along its middle and turned, as far as the room lets it.
  const pivot = at(c, tipA, R * 0.6);
  const piece = [...edgeA, ...edgeB.slice(1), ...rim(R, a1, a0).slice(1, -1)];
  // As far as every point of the moved piece stays short of the room at its heading.
  const moved = (lift: number) => (q: Pt): Pt => at(turnAbout(q, pivot, 12), tipA, lift);
  let lift = R * 0.58;
  while (lift > 0 && piece.some((q) => {
    const m = moved(lift)(q);
    return dist(c, m) > room(angleOf(c, m)) - 1.6;
  })) lift -= 0.25;
  const move = moved(Math.max(0, lift));
  // What of the stone lies in the wedge is left out; the piece carries its own part of each line.
  const inWedge = (q: Pt) => {
    const a = (((Math.atan2(q[0] - c[0], -(q[1] - c[1])) * 180) / Math.PI) + 360) % 360;
    const d = dist(q, c);
    // Within the wedge's angle and further out than the break runs there.
    if (a < a0 - 2 || a > a1 + 2) return false;
    const u = Math.abs(a - tipA) / ((a1 - a0) / 2);
    return d > deep + (R - deep) * u - 0.2;
  };
  const keep = (ps: Pt[], want: boolean) => {
    const parts: Pt[][] = [];
    let cur: Pt[] = [];
    for (const q of ps) {
      if (inWedge(q) === want) cur.push(q);
      else if (cur.length) (parts.push(cur), (cur = []));
    }
    if (cur.length) parts.push(cur);
    return parts.filter((x) => x.length > 1);
  };
  const circle = (r: number) => Array.from({ length: 241 }, (_, i) => at(c, i * 1.5, r));
  const fine = (p0: Pt, p1: Pt) => Array.from({ length: 41 }, (_, i) => lerp(p0, p1, i / 40));
  // The binding: the seven-pointed star, sharp, one unbroken stroke, as the rune circle binds with it.
  const rr = R * 0.58;
  const star = [0, 3, 6, 2, 5, 1, 4, 0].map((k) => at(c, (k * 360) / 7, rr));
  const rune = star.slice(1).map((q, i) => fine(star[i], q));
  // The break's faces on the stone, set back from the gap a little.
  const back = (ps: Pt[]) => ps.map((q) => lerp(q, c, 0.03));
  const stone = { thin: [...keep(circle(R), false), back(edgeA), back(edgeB)], hair: [...keep(circle(R - 1.3), false), ...keep(circle(R * 0.72), false)], sign: rune.flatMap((r) => keep(r, false)) };
  const bit = { thin: [...keep(circle(R), true), edgeA, edgeB].map((ps) => ps.map(move)), hair: [...keep(circle(R - 1.3), true), ...keep(circle(R * 0.72), true)].map((ps) => ps.map(move)), sign: rune.flatMap((r) => keep(r, true)).map((ps) => ps.map(move)) };
  for (const cls of ['thin', 'hair', 'sign'] as const) p.add([...stone[cls], ...bit[cls]].map(run).join(''), cls);
  let h = '';
  // The stone's rim, a band between its outer and inner rings, shaded on its lower right where it turns from the light.
  for (let a = 95; a <= 255; a += 4.5) {
    const len = (R * 0.28 - 1.6) * Math.min(1, 1.6 * Math.cos(((a - 175) * Math.PI) / 180));
    if (len < 0.6) continue;
    const [q0, q1] = [at(c, a, R - 1.9), at(c, a, R - 1.9 - len)];
    if (!inWedge(q0) && !inWedge(q1)) h += line(q0, q1);
  }
  p.add(h, 'hatch');
  p.knockout += disc(c, R + 1.4) + poly(piece.map(move).map((q) => lerp(move(pivot), q, 1 + 1.6 / R)));
};

/**
 * The djinn's barya, the coin she was bought with: a bronze coin with a
 * scalloped rim of fourteen lobes, a ridge running in from each lobe to a
 * round boss at its heart, the boss beaded. Turned in the air, seen as a
 * flattened round with its edge showing below; the edge, turned from the
 * light, hatched upright.
 */
const barya: Sign = (p, c, r) => {
  const [a, b, t, n] = [r * 0.98, r * 0.6, r * 0.22, 14];
  const turn = -16;
  const rot = (q: Pt): Pt => turnAbout(q, c, turn);
  /** The face's rim at `th`: a lobe's crown between notches. */
  const lobe = (th: number) => 0.9 + 0.1 * Math.sqrt(Math.abs(Math.cos((n * th) / 2)));
  const E = (th: number, drop = 0, kk = 1): Pt => rot([c[0] + a * kk * Math.cos(th), c[1] - t / 2 + b * kk * Math.sin(th) + drop]);
  const N = 168;
  const face = Array.from({ length: N }, (_, i) => E((i / N) * Math.PI * 2, 0, lobe((i / N) * Math.PI * 2)));
  const under = Array.from({ length: N / 2 + 1 }, (_, i) => E((i / (N / 2)) * Math.PI, t, lobe((i / (N / 2)) * Math.PI)));
  p.add(poly(face) + run(under) + line(E(0, 0, lobe(0)), E(0, t, lobe(0))) + line(E(Math.PI, 0, lobe(Math.PI)), E(Math.PI, t, lobe(Math.PI))), 'sign');
  let h = '';
  for (let i = 2; i < N / 2 - 1; i += 3) {
    const th = (i / (N / 2)) * Math.PI;
    h += line(E(th, 0.45, lobe(th)), E(th, t - 0.45, lobe(th)));
  }
  p.add(h, 'hatch');
  // The ridges: one in from each notch to the boss.
  let ridges = '';
  for (let k = 0; k < n; k++) {
    const th = ((2 * k + 1) * Math.PI) / n;
    ridges += line(E(th, 0, 0.84), E(th, 0, 0.42));
  }
  p.add(ridges, 'hair');
  // The boss, beaded: its ring and a few beads on it.
  p.add(poly(Array.from({ length: 40 }, (_, i) => E((i / 40) * Math.PI * 2, 0, 0.36))), 'sign');
  const beads = [E(0, 0, 0), ...Array.from({ length: 6 }, (_, i) => E((i / 6) * Math.PI * 2 + 0.3, 0, 0.2))];
  p.add(beads.map((q) => disc(q, r * 0.045)).join(''), 'fill');
};

export const seals: AuraSeal = { seal: runeseal, sign: barya };
