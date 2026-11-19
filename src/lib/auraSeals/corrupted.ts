// The Corruption aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { angleOf, at, f, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { blade, cutLine, disc, dist, inPoly, LIGHT, piecesOf, poly, ringCuts, type AuraSeal, type Clear, type Seal, type Sign } from './kit.ts';

/** A body along `spine`, `width(t)` either side at `t` of the way along: its two edges. */
function body(spine: Pt[], width: (t: number) => number) {
  const n = spine.length - 1;
  const [left, right]: Pt[][] = [[], []];
  spine.forEach((m, i) => {
    const [a, b] = [spine[Math.max(0, i - 1)], spine[Math.min(n, i + 1)]];
    const L = dist(a, b) || 1;
    const nrm: Pt = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const w = width(i / n);
    left.push([m[0] + nrm[0] * w, m[1] + nrm[1] * w]);
    right.push([m[0] - nrm[0] * w, m[1] - nrm[1] * w]);
  });
  return { left, right, outline: [...left, ...right.slice(0, -1).reverse()] };
}

/**
 * The Corruption seal: the aura's tendrils taking hold of the token. In
 * the seal's ring the token's face; a tendril, swollen where the blood
 * pulses along it, grows out from behind the ring on the right and hooks
 * in over the rim to grip the face; two more sprawl out from behind below,
 * one long, down over the arch, one short, to the left, their tips curled.
 * From where it grips, the corruption spreads over the face in veins,
 * forking as they go, stopping short of the ring.
 */
const corrupted: Seal = (p, c, R, room) => {
  // A tendril's way, through points about the ring (heading, reach), smoothly (Catmull and Rom's curve), its tip curling by `curl` (degrees a step, clockwise if positive); swollen in three places, where the blood pulses along it, and narrowing to its tip.
  const grow = (pts: (readonly [number, number])[], hw: number, curl: number) => {
    const keys = pts.map(([a, r]) => at(c, a, Math.min(r, room(a) - 2.6)));
    const spine: Pt[] = [];
    for (let k = 0; k + 1 < keys.length; k++) {
      const [a0, a1, a2, a3] = [keys[Math.max(0, k - 1)], keys[k], keys[k + 1], keys[Math.min(keys.length - 1, k + 2)]];
      for (let i = 0; i < 7; i++) {
        const t = i / 7;
        const [t2, t3] = [t * t, t * t * t];
        spine.push([0, 1].map((j) => 0.5 * (2 * a1[j] + (a2[j] - a0[j]) * t + (2 * a0[j] - 5 * a1[j] + 4 * a2[j] - a3[j]) * t2 + (3 * a1[j] - a0[j] - 3 * a2[j] + a3[j]) * t3)) as Pt);
      }
    }
    spine.push(keys[keys.length - 1]);
    let h = angleOf(spine[spine.length - 2], spine[spine.length - 1]);
    let q = spine[spine.length - 1];
    for (let i = 1; i <= 8; i++) {
      h += curl * (1 + i * 0.4);
      q = at(q, h, R * 0.06);
      spine.push(q);
    }
    const width = (t: number) => hw * (1 - t) ** 0.55 * (1 + 0.3 * Math.max(0, Math.sin(t * Math.PI * 5.4 - 0.6)) ** 2) + 0.25;
    const far = spine.reduce((k, x, i) => (dist(c, x) > dist(c, spine[k]) ? i : k), 0);
    return { spine, width, far, n: spine.length - 1, ...body(spine, width) };
  };
  // The one that takes hold: from behind the ring on the right, a little way out, and in over the rim onto the face, its tip hooked. Two more sprawl out from behind below, as the aura's sprawl sideways: a long one down to the right over the arch, a short one to the left.
  const holds = grow(
    [
      [112, R - 1],
      [100, R * 1.32],
      [78, R * 1.3],
      [62, R * 0.9],
      [50, R * 0.55],
    ],
    R * 0.15,
    -6,
  );
  const sprawls = [
    grow(
      [
        [150, R - 1],
        [146, R * 1.4],
        [130, R * 1.8],
      ],
      R * 0.13,
      -2.5,
    ),
    grow(
      [
        [214, R - 1],
        [222, R * 1.35],
        [240, R * 1.6],
      ],
      R * 0.11,
      2.5,
    ),
  ];
  // Where the one that takes hold lies over the face: past its farthest, back within the ring.
  const inAt = holds.spine.findIndex((x, i) => i > holds.far && dist(c, x) < R + 1);
  const over: Clear = { polys: piecesOf(holds.left.slice(inAt - 2), holds.right.slice(inAt - 2)), holes: [], pad: 0.6 };
  // The ring, broken where it crosses over.
  const cuts = ringCuts(c, R - 0.65, { ...over, pad: 1.3 });
  p.add(ring(c, R, { cuts }), 'thin');
  p.add(ring(c, R - 1.3, { cuts }), 'hair');
  let [edges, shade] = ['', ''];
  for (const t of [holds, ...sprawls]) {
    // Behind the ring, at its root, it is hidden.
    const behind = (i: number): Clear => (i < t.far ? { polys: [], holes: [{ c, r: R + 0.9 }], pad: 0.6 } : { polys: [], holes: [], pad: 0.6 });
    for (let i = 0; i < t.n; i++) edges += cutLine(t.left[i], t.left[i + 1], behind(i)) + cutLine(t.right[i], t.right[i + 1], behind(i));
    edges += line(t.left[t.n], t.right[t.n]);
    // Its side away from the light shaded, in lines along it, closer toward that edge, as sinew is drawn.
    const away = t.spine.map((m, i) => ((t.left[i][0] - m[0]) * LIGHT[0] + (t.left[i][1] - m[1]) * LIGHT[1] < 0 ? t.left[i] : t.right[i]));
    for (const k of [0.38, 0.68]) {
      for (let i = 1; i < t.n * (k < 0.5 ? 0.86 : 0.78); i++) shade += cutLine(lerp(t.spine[i], away[i], k), lerp(t.spine[i + 1], away[i + 1], k), behind(i));
    }
  }
  p.add(edges, 'thin');
  p.add(shade, 'hatch');
  const { spine, n } = holds;
  // The veins, out from under the tendril's grip across the face: each forks twice, narrowing.
  const tendril: Clear = { polys: piecesOf(holds.left, holds.right), holes: [], pad: 0.5 };
  const inside = (x: Pt) => dist(c, x) < R - 2.4;
  let [main, fine] = ['', ''];
  const vein = (from: Pt, a: number, len: number, depth: number) => {
    let x = from;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const y = at(x, a + (s % 2 ? 9 : -9), len / steps);
      if (!inside(y)) return;
      const d = cutLine(x, y, tendril);
      if (depth === 0) main += d;
      else fine += d;
      x = y;
    }
    if (depth < 2) {
      vein(x, a - 32, len * 0.62, depth + 1);
      vein(x, a + 28, len * 0.58, depth + 1);
    }
  };
  const grip = spine[n - 6];
  for (const [a, len] of [
    [228, R * 0.5],
    [272, R * 0.42],
    [190, R * 0.38],
  ])
    vein(grip, a, len, 0);
  p.add(main, 'thin');
  p.add(fine, 'hair');
  p.knockout += disc(c, R + 1.4) + [holds, ...sprawls].map((t) => poly(body(t.spine, (u) => t.width(u) + 1.1).outline)).join('');
};

/**
 * The Vaal Catalyst, as the game's icon shows it: an upright egg of
 * tendrils wound round on themselves, a shard of red light glowing
 * through near its top where they part. Its lumpy outline; the tendrils winding over and
 * under one another; the shard of light in solid ink, its glow in fine
 * lines;
 * each tendril and the egg's edge shaded by a line on the side away from
 * the light.
 */
const vaalCatalystSign: Sign = (p, c, r) => {
  const P = (x: number, y: number): Pt => [c[0] + x * r, c[1] + y * r];
  // The egg: pointed above, broad below, lumpy with the tendrils that make it.
  const egg = Array.from({ length: 96 }, (_, i): Pt => {
    const t = (i / 96) * 2 * Math.PI;
    const lump = 1 + 0.04 * Math.sin(9 * t) + 0.025 * Math.sin(14 * t + 1);
    return P(0.74 * Math.sin(t) * (0.8 - 0.2 * Math.cos(t)) * lump, (-1.06 * Math.cos(t) + 0.04) * lump);
  });
  const mid = P(0, 0.05);
  const inner = egg.map((q) => lerp(mid, q, 1 - 1 / Math.max(1, dist(mid, q))));
  // The glow: a jagged shard of red light showing through near the top, where the tendrils part, leaning a little.
  const sc = P(0.0, -0.35);
  const shard: Pt[] = [[0.02, -0.75], [0.12, -0.51], [0.07, -0.4], [0.17, -0.16], [0.04, -0.23], [-0.05, -0.05], [-0.07, -0.3], [-0.15, -0.42], [-0.05, -0.54]].map(([x, y]) => P(x, y));
  const slit = shard;
  const parted = shard.map((q) => lerp(sc, q, 1.55));
  // The tendrils: five wrapping the egg, crossing over and under one another, the ends curling, each set by hand through points (in parts of the sign's reach), smoothly (Catmull and Rom's curve); drawn as lines that break where a later one lies over them, and short of the light's shard.
  const ways: [number, number][][] = [
    [[-0.56, -0.02], [-0.18, 0.14], [0.22, 0.42], [0.51, 0.58], [0.46, 0.73], [0.34, 0.68]],
    [[0.54, -0.12], [0.24, 0.14], [-0.1, 0.49], [-0.37, 0.77], [-0.24, 0.89], [-0.15, 0.82]],
    [[-0.44, -0.42], [-0.29, -0.14], [-0.27, 0.16], [-0.41, 0.4], [-0.54, 0.35]],
    [[0.37, -0.49], [0.27, -0.21], [0.37, 0.09], [0.51, 0.26], [0.59, 0.16]],
    [[-0.49, 0.58], [-0.12, 0.73], [0.27, 0.87], [0.1, 0.98], [-0.02, 0.91]],
  ];
  const spines = ways.map((w) => {
    const ps = w.map(([x, y]) => P(x, y));
    const out: Pt[] = [];
    for (let k = 0; k + 1 < ps.length; k++) {
      const [a0, a1, a2, a3] = [ps[Math.max(0, k - 1)], ps[k], ps[k + 1], ps[Math.min(ps.length - 1, k + 2)]];
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        const [t2, t3] = [t * t, t * t * t];
        out.push([0, 1].map((j) => 0.5 * (2 * a1[j] + (a2[j] - a0[j]) * t + (2 * a0[j] - 5 * a1[j] + 4 * a2[j] - a3[j]) * t2 + (3 * a1[j] - a0[j] - 3 * a2[j] + a3[j]) * t3)) as Pt);
      }
    }
    out.push(ps[ps.length - 1]);
    // Wavering, as living things do: each point stepped aside a little, in waves along it.
    const alive = out.map((q, j): Pt => {
      const [a, b] = [out[Math.max(0, j - 1)], out[Math.min(out.length - 1, j + 1)]];
      const L = dist(a, b) || 1;
      const o = r * 0.045 * Math.sin(j * 0.75 + ps.length);
      return [q[0] - ((b[1] - a[1]) / L) * o, q[1] + ((b[0] - a[0]) / L) * o];
    });
    return alive.filter((x) => inPoly(x, inner) && !inPoly(x, parted));
  });
  // Each a tube: its two edges, narrowing to its curled end.
  const tubes = spines.map((sp) => blade(sp, r * 0.095, 0.5));
  let edges = '';
  tubes.forEach((t, i) => {
    const over: Clear = { polys: tubes.slice(i + 1).flatMap((u) => piecesOf(u.left, u.right)), holes: [], pad: 0.3 };
    for (const side of [t.left, t.right]) for (let j = 0; j + 1 < side.length; j++) edges += cutLine(side[j], side[j + 1], over);
    edges += cutLine(t.left[0], t.right[0], over);
  });
  p.add(edges, 'thin');
  // The shade: a line inside each tendril along its side away from the light, and inside the egg's edge on its dark side.
  let shade = '';
  tubes.forEach((t, i) => {
    const over: Clear = { polys: tubes.slice(i + 1).flatMap((u) => piecesOf(u.left, u.right)), holes: [], pad: 0.3 };
    const sp = spines[i];
    for (let j = 1; j + 2 < sp.length; j++) {
      const away = (k: number) => ((t.left[k][0] - sp[k][0]) * LIGHT[0] + (t.left[k][1] - sp[k][1]) * LIGHT[1] < 0 ? t.left[k] : t.right[k]);
      shade += cutLine(lerp(sp[j], away(j), 0.45), lerp(sp[j + 1], away(j + 1), 0.45), over);
    }
  });
  const rim = egg.map((q) => lerp(mid, q, 1 - 1.3 / Math.max(1, dist(mid, q))));
  for (let i = 0; i < rim.length; i++) {
    const [a, b] = [rim[i], rim[(i + 1) % rim.length]];
    if ((a[0] - mid[0]) * 0.6 + (a[1] - mid[1]) * 0.8 > r * 0.25 && !tubes.some((t) => inPoly(a, t.outline))) shade += line(a, b);
  }
  p.add(shade, 'hair');
  p.add(poly(egg), 'sign');
  p.add(poly(slit), 'fill');
  // The glow, in fine lines out from the shard between the parted tendrils.
  let glow = '';
  for (let i = 0; i < 10; i++) {
    const a = 20 + i * 32;
    if (a > 150 && a < 210) continue;
    glow += line(at(sc, a, r * 0.13 + (i % 2) * r * 0.05), at(sc, a, r * 0.2 + (i % 2) * r * 0.06));
  }
  p.add(glow, 'hair');
};

export const seals: AuraSeal = { seal: corrupted, sign: vaalCatalystSign };
