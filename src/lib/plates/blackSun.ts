// The plate of Delve's black sun (src/components/BlackSunCircle.svelte; see
// docs/arcane-style.md): its geometry, built away from the page, in a
// worker, and kept (lib/plateStore.svelte.ts).
import { angleOf, at as atAbout, f, joined, lineParts, pointedRay, pt, ringParts, seeded, wear, type Cut, type Hole, type Pt, type Wear } from '../arcane.ts';
import { Plate } from '../cardEngraving.ts';
import { engrave, engraveFrame, FRAME_SPIN, hollowFrame, mapPath, stroke, turned, type Plate as Engraved, type StageLayer } from '../engraver.ts';
import { inscribe } from '../tongue.ts';
import { burst, crystalCrown, crystalSeal, shattered } from '../findEngraving.ts';

export const build = (): StageLayer[] => {

  // Delve's circle, a sibling of the rune circle (ArcaneCircle; see
  // docs/arcane-style.md) in the same craft, built of great sweeping rings
  // rather than straight lines:
  // • three great bands, interlaced as the Borromean rings are (each over
  //   the next and under the one after, so no two hold together but all
  //   three do), the script written along each between its edges, passing
  //   under the band above it;
  // • where each band swings out furthest, a find's seal, as on its card
  //   (lib/findEngraving), set into the band like a stone in a ring and
  //   breaking the rim, each find breaking out of its seal's ring as on its
  //   card: a burst of azurite crystals, a flare's burst, a small ring
  //   blown apart;
  // • a fine line echoing each band along its outside;
  // • a glory of fine rays in three lengths out from the heart as far as the
  //   bands reach, under them;
  // • in the rim between the finds, the sun going dark in three
  //   phases, bitten, half gone, nearly gone, each in a seal of its own, a
  //   double line between them for their path, under the bands, a few
  //   words of the script outside it either side of each sun, run out
  //   to the band or seal in a double rule;
  // • at the heart, where all three bands meet, the black sun, the eclipse
  //   whole: a void ringed in light, only its corona about it.
  // Lines stop short of every seal and of whatever passes over them, and
  // carry the odd nick. It is set on the ArcaneStage, which turns, lights
  // and colours it.
  const O: Pt = [0, 0];
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number) => atAbout(O, a, r);
  const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  /** `fn`, remembering its answers (the cuts are asked for twice: for the lines and for the glow). */
  const cached = <A extends number[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>();
    return (...args: A): R => {
      const key = args.join(',');
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key)!;
    };
  };
  /** The find cards' classes (lib/cardEngraving) as the circle's own. */
  const CLS: Record<string, string> = { main: '', ray: 'hair', shade: 'hatch', lattice: 'hair', fill: 'hatch' };
  /** What one of the find cards' routines engraves, as [path, class, scale] for a seal. */
  const carved = (draw: (p: Plate) => void): [string, string, number][] => {
    const p = new Plate();
    draw(p);
    return p.out.map(({ d, cls }) => [d, CLS[cls] ?? cls, 1]);
  };

  // ---- the rim ----------------------------------------------------------------
  const RIM = 97.5;
  const RIM_IN = 95;

  // ---- the three bands -----------------------------------------------------------
  // Each a circle of radius `BAND` about a centre `OFF` out from the plate's,
  // its edges `HALF` either side; band k passes over band k + 1.
  const BAND = 55;
  const OFF = 30;
  const HALF = 4.2;
  const GAP = 0.8;
  /** How far outside each band its echo runs. */
  const ECHO = 2.2;
  const bands = [0, 120, 240].map((a) => ({ a, c: at(a, OFF) }));
  // The finds' seals, where each band swings out furthest.
  const SEAL = 16.5;
  // (Set a little in from the band's furthest point, so the seal stays inside the rim.)
  const seals = bands.map(({ a }) => ({ a, c: at(a, OFF + BAND - 4) }));
  // (sealHoles below: the seal and whatever of its find breaks out of it.)
  const FIND_SEALS = [
    // The vein's, built as the burst and the broken ring are: a crystal seen
    // end on at its heart, and a crown of prisms bursting out of the ring
    // round it, long and short in turn (the vein card's crown).
    carved((p) =>
      crystalCrown(
        p,
        O,
        8.4,
        Array.from({ length: 8 }, (_, i) => ({ a: i * 45 + 22.5, end: i % 2 ? 15.5 : 20.5, hw: i % 2 ? 1.8 : 2.4 })),
        { polys: [], holes: [] },
        0.55,
      ),
    ),
    carved((p) => burst(p, O, 20.5)),
    carved((p) => shattered(p, O, 9.6, (q) => Math.hypot(q[0], q[1]) < 21, 2)),
  ];
  // The hearts of the vein's and the dynamite's seals, which turn on their own:
  // the crystal seen end on, and the flash at the centre of the broken ring.
  const FIND_CORES = [carved((p) => crystalSeal(p, O, 5.2)), [], carved((p) => p.star(O, 4.2))];
  /** Points along a path (absolute M, L, H, V, C, A, Z), `step` apart; arcs and curves taken as straight. */
  const along = (d: string, step = 0.4): Pt[] => {
    const out: Pt[] = [];
    let cur: Pt = [0, 0];
    let start: Pt = [0, 0];
    const to = (q: Pt) => {
      const n = Math.max(1, Math.ceil(dist(cur, q) / step));
      for (let i = 1; i <= n; i++) out.push([cur[0] + ((q[0] - cur[0]) * i) / n, cur[1] + ((q[1] - cur[1]) * i) / n]);
      cur = q;
    };
    for (const [, cmd, args] of d.matchAll(/([MLHVCAZ])([^MLHVCAZ]*)/g)) {
      const n = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
      if (cmd === 'M') (cur = [n[0], n[1]]), (start = cur), out.push(cur);
      else if (cmd === 'L') to([n[0], n[1]]);
      else if (cmd === 'H') to([n[0], cur[1]]);
      else if (cmd === 'V') to([cur[0], n[0]]);
      else if (cmd === 'C') to([n[4], n[5]]);
      else if (cmd === 'A') to([n[5], n[6]]);
      else if (cmd === 'Z') to(start);
    }
    return out;
  };
  // Each seal's find, turned and set in place; where it breaks out of its
  // ring, the ring is cut round it, and everything else stops short of it.
  const placedSeals = seals.map(({ a, c }, k) => {
    const turn = turned(a);
    const place = (q: Pt): Pt => {
      const [x, y] = turn(q);
      return [c[0] + x, c[1] + y];
    };
    const signs = FIND_SEALS[k].map(([d, cls]) => ({ d: mapPath(d, place, a), cls }));
    const core = FIND_CORES[k].map(([d, cls]) => ({ d: mapPath(d, place, a), cls }));
    const pts = signs.flatMap(({ d }) => along(d));
    /** The cuts in the seal's ring of radius `r` where the find crosses it, in degrees. */
    const ringCuts = cached((r: number): Cut[] =>
      pts.filter((q) => Math.abs(dist(q, c) - r) < 1.1).map((q) => {
        const t = angleOf(c, q);
        const half = (1.1 / r) * (180 / Math.PI);
        return [t - half, t + half] as Cut;
      }),
    );
    // What lies outside the ring, for other lines to stop short of.
    const out = pts.filter((q, i) => i % 3 === 0 && dist(q, c) > SEAL + 0.4).map((q) => ({ c: q, r: 1.3 }));
    return { a, c, signs, core, ringCuts, holes: [{ c, r: SEAL + 1.4 }, ...out] as Hole[] };
  });
  const sealHoles: Hole[] = placedSeals.flatMap((s) => s.holes);
  /** The band that lies over band `k`. */
  const above = (k: number) => (k + 2) % 3;
  /** Whether `q` lies under band `j` (within its width, and clearance). */
  const underBand = (q: Pt, j: number, pad = 0) => {
    // (Its echo outside it included.)
    const d = dist(q, bands[j].c) - BAND;
    return d > -(HALF + GAP + pad) && d < HALF + ECHO + GAP + pad;
  };
  /** Where a circle about band `k`'s centre of radius `r` passes under the band above it, in degrees round that centre. */
  const underCuts = cached((k: number, r: number): Cut[] => {
    const cuts: Cut[] = [];
    let from: number | null = null;
    for (let t = 0; t <= 360.01; t += 0.2) {
      const inside = underBand(atAbout(bands[k].c, t, r), above(k));
      if (inside && from === null) from = t;
      if (!inside && from !== null) cuts.push([from, t]), (from = null);
    }
    if (from !== null) cuts.push([from, 360]);
    return cuts;
  });
  // The script along each band's middle, round from its seal, in words of
  // two to four; no mark where the band passes under another.
  const rnd = seeded(59);
  const SCRIPT = bands.flatMap(({ a, c }, k) => {
    const clear = (Math.asin(23 / BAND) * 180) / Math.PI;
    return inscribe(a + clear, a + 360 - clear, BAND, rnd, 1.1)
      .filter(({ a: t }) => !underBand(atAbout(c, t, BAND), above(k), 2.2))
      .map(({ a: t, d }) => ({ k, t, d }));
  });

  // ---- the black sun --------------------------------------------------------------
  // In the heart where the bands meet, the eclipse whole: a void ringed
  // twice, no light left in it, only its corona: pointed rays and fine
  // ones out to the bands' inner edges.
  const SUN = 11;
  const SUN_IN = SUN - 1.2;
  /** How far out a ray from the heart at `a` leaves the circle of radius `R` about `c` (the heart lies inside every band). */
  const leaves = (a: number, c: Pt, R: number) => {
    const u = at(a, 1);
    const s = u[0] * c[0] + u[1] * c[1];
    return s + Math.sqrt(s * s - c[0] * c[0] - c[1] * c[1] + R * R);
  };
  /** The first of the steps `from`, `from + step`, ... (short of `cap`) past `r`: where a search stepping out from `from` would stop. */
  const stepPast = (from: number, r: number, cap: number, step = 0.1) => {
    let t = from;
    while (t <= r && t < cap) t += step;
    return t;
  };
  /** Where a ray out from the heart at `a` first meets a band's inner edge. */
  const reach = (a: number) => Math.min(60, stepPast(SUN, Math.min(...bands.map(({ c }) => leaves(a, c, BAND - HALF - 1.4))), 60));
  // The corona turns on its own against the rings, so its rays are even,
  // long and short in turn, the long ones as far as the heart's narrowest
  // reach: they fit wherever the turn brings them.
  const NEAREST = Math.min(...Array.from({ length: 360 }, (_, a) => reach(a))) - 1.2;
  const RAYS = Array.from({ length: 12 }, (_, k) => pointedRay(O, k * 30, SUN + 0.8, k % 2 ? NEAREST - 4.5 : NEAREST, k % 2 ? 4 : 5.5, 0.5));
  const FINE = Array.from({ length: 24 }, (_, k) => {
    const a = k * 15 + 7.5;
    return joined(lineParts(at(a, SUN + 1.6), at(a, k % 2 ? NEAREST - 3 : NEAREST - 6.5)));
  }).join('');

  // The eclipse, in the gaps between the bands: the sun going dark round
  // toward the black sun at the heart, bitten, half gone, nearly gone. In
  // each, what light is left is cut in close strokes and the moon over it
  // left dark, its edge drawn across the sun; round it a corona of pointed
  // rays, ridged and hatched down one side, and fine ones between, shorter
  // as the light fails.
  // Each sun in a seal of its own set into the rim between the finds',
  // breaking the rim's inner line; its corona inside the seal.
  const ECL = 5.8;
  const ECL_AT = 84;
  const SUN_SEAL = 11.5;
  // (The darkest stands opposite the dynamite.)
  const eclipses = [180, 300, 60].map((a, k) => {
    const c = at(a, ECL_AT);
    // The moon, coming in across the sun from the lower left (in the plate's turn).
    const off = [9.6, 6.2, 3.3][k] * (ECL / 6.4);
    // As an eclipse is watched: the moon comes in from the right, the light
    // left on the left (the eclipses ride the rings upright: see the layers).
    const dir = 90;
    const m = atAbout(c, dir, off);
    const lit = (q: Pt) => dist(q, c) < ECL - 0.45 && dist(q, m) > ECL + 0.45;
    // The light left, across the sun, at right angles to the moon's way.
    let light = '';
    for (let u = -ECL + 0.5; u < ECL; u += 0.5) {
      let run: Pt[] = [];
      const flush = () => {
        if (run.length > 1) light += `M${pt(run[0])}L${pt(run.at(-1)!)}`;
        run = [];
      };
      for (let v = -ECL; v <= ECL; v += 0.1) {
        const q = atAbout(atAbout(c, dir, u), dir + 90, v);
        if (lit(q)) run.push(q);
        else flush();
      }
      flush();
    }
    // The moon's edge, where it lies across the sun.
    let edge = '';
    let open = false;
    for (let t = 0; t <= 360; t += 1.5) {
      const q = atAbout(m, t, ECL);
      const on = dist(q, c) < ECL - 0.1;
      edge += on ? `${open ? 'L' : 'M'}${pt(q)}` : '';
      open = on;
    }
    // The corona: shorter as the light fails.
    // (All within the seal's inner ring.)
    const reach = [1, 0.72, 0.45][k];
    const rays = Array.from({ length: 12 }, (_, i) => pointedRay(c, i * 30 + 15, ECL + 1.1, ECL + 1.1 + (i % 2 ? 1.3 : 2.4) * reach, i % 2 ? 7.5 : 9.5, 0.45));
    const fine = Array.from({ length: 12 }, (_, i) => joined(lineParts(atAbout(c, i * 30, ECL + 1.5), atAbout(c, i * 30, ECL + 1.5 + 1.9 * reach)))).join('');
    return { c, light, edge, rays, fine };
  });
  const sunHoles: Hole[] = eclipses.map(({ c }) => ({ c, r: SUN_SEAL + 1.2 }));
  // The sun's path: a double line on the circle through the suns, from seal
  // to seal, passing under the bands.
  const PATH = ECL_AT;
  /** The path's half-width. */
  const LANE = 0.9;
  /** Where the script runs, outside the path, short of the rim. */
  const SCRIPT_OUT = 90;
  /** Where a circle about the centre of radius `r` passes under a band, in degrees. */
  const pathCuts = cached((r: number): Cut[] => {
    const cuts: Cut[] = [];
    let from: number | null = null;
    for (let t = 0; t <= 360.01; t += 0.2) {
      const under = bands.some((_, j) => underBand(at(t, r), j));
      if (under && from === null) from = t;
      if (!under && from !== null) cuts.push([from, t]), (from = null);
    }
    if (from !== null) cuts.push([from, 360]);
    return cuts;
  });

  // The script outside the path either side of each sun, and nowhere else,
  // as far as its letters clear the bands and the finds' seals; from there
  // the line runs on as a double rule to the band or seal, as a scribe
  // fills out a short line.
  const pathRnd = seeded(83);
  const RULE_GAP = 0.7;
  /** Each rule line: its radius and where it starts and ends (degrees). */
  const fillers: [number, number, number][] = [];
  const PATH_SCRIPT = eclipses.flatMap(({ c }) => {
    const a = angleOf(O, c);
    const clear = (Math.asin((SUN_SEAL + 2.2) / SCRIPT_OUT) * 180) / Math.PI;
    /** How far from `t0` (in `dir`) something clears the bands and seals: `ok` says whether it does at an angle. */
    const span = (t0: number, dir: number, ok: (t: number) => boolean) => {
      let d = 0;
      while (d < 60 && ok(t0 + dir * (d + 0.25))) d += 0.25;
      return d;
    };
    const letters = (t: number) =>
      !bands.some((_, j) => underBand(at(t, SCRIPT_OUT - 2), j, 1.2) || underBand(at(t, SCRIPT_OUT + 2), j, 1.2)) &&
      sealHoles.every((h) => dist(at(t, SCRIPT_OUT), h.c) > h.r + 1.6);
    /** Whether a rule line of radius `r` runs clear at `t`. */
    const rule = (r: number) => (t: number) => {
      const q = at(t, r);
      return !bands.some((_, j) => underBand(q, j, 0.2)) && sealHoles.every((h) => dist(q, h.c) > h.r + 0.6);
    };
    return [-1, 1].flatMap((dir) => {
      const t0 = a + dir * clear;
      const words = inscribe(...((dir < 0 ? [t0 - span(t0, -1, letters), t0] : [t0, t0 + span(t0, 1, letters)]) as [number, number]), SCRIPT_OUT, pathRnd, 0.8);
      // The rule, from just past the last letter to the band or seal.
      const last = words.length ? (dir < 0 ? Math.min(...words.map((m) => m.a)) : Math.max(...words.map((m) => m.a))) : t0;
      const start = last + dir * 1.5;
      // Each line as far as it runs clear: the outer one on past the inner.
      for (const r of [SCRIPT_OUT - RULE_GAP, SCRIPT_OUT + RULE_GAP]) {
        const end = start + dir * span(start, dir, rule(r));
        if (Math.abs(end - start) > 1.5) fillers.push(dir < 0 ? [r, end, start] : [r, start, end]);
      }
      return words;
    });
  });
  const RULES = fillers
    .map(([r, a0, a1]) => {
      const n = Math.ceil((a1 - a0) / 0.5);
      return `M${Array.from({ length: n + 1 }, (_, i) => pt(at(a0 + ((a1 - a0) * i) / n, r))).join('L')}`;
    })
    .join('');

  // The glory: fine rays from the heart out to the rim in three lengths, as
  // on the flare's card (long, short, middling, short), passing under the
  // bands and their echoes, stopping short of the seals.
  const bandsOver = bands.map(({ c }) => ({ c, r: BAND + ECHO / 2, w: HALF + ECHO / 2 + GAP }));
  // Close in the curved triangles where two rings overlap, half as close
  // where only one ring holds them.
  const GLORY = Array.from({ length: 144 }, (_, k) => {
    const a = ((k + 0.5) / 144) * 360;
    const from = reach(a) + 1.2;
    // Out only as far as the bands reach: beyond them the plate is left plain.
    const end = stepPast(from, Math.max(...bands.map(({ c }) => leaves(a, c, BAND + HALF + ECHO + GAP))), RIM_IN);
    let to = [end - GAP, end - 7, end - 3.5, end - 7][(k >> 1) % 4];
    if (k % 2) {
      // The rays between: only within two rings.
      // (Within two rings as far as the second furthest of them reaches.)
      const second = bands.map(({ c }) => leaves(a, c, BAND)).sort((x, y) => y - x)[1];
      let inner = from;
      while (inner < to && inner < second) inner += 0.1;
      // (Only part way in, so the triangles grow lighter outward rather than solid.)
      to = Math.min(to, from + (inner - HALF - GAP - from) * 0.5);
    }
    return to - from > 1 ? joined(lineParts(at(a, from), at(a, to), { rings: bandsOver, holes: [...sealHoles, ...sunHoles] })) : '';
  }).join('');


  // Everything that wears, drawn twice: worn for the lines, whole for the
  // glow under them. The wear is one seeded run through the lines in this
  // order, so every circle is worn alike.
  const drawing = (worn: boolean) => {
    const w: Wear = worn ? wear(61) : null;
    return {
      rim: [RIM, RIM_IN].map((r, k) => stroke(ringParts(O, r, { holes: k ? [...sealHoles, ...sunHoles] : sealHoles, wear: k ? w : null }), 0.5 + k * 0.08, 1.1)),
      path: [PATH + LANE, PATH - LANE].map((r) => stroke(ringParts(O, r, { holes: [...sealHoles, ...sunHoles], cuts: pathCuts(r) }), 1, 1.2)),
      sunSeals: eclipses.flatMap(({ c }, k) => [SUN_SEAL, SUN_SEAL - 1.6].map((r, i) => stroke(ringParts(c, r, { wear: i ? null : w }), 1.05 + k * 0.12, 0.6))),
      bands: bands.flatMap(({ c }, k) =>
        [BAND + HALF, BAND - HALF].map((r) => stroke(ringParts(c, r, { holes: sealHoles, cuts: underCuts(k, r), wear: w }), 0.3 + k * 0.15, 1.1)),
      ),
      rules: bands.flatMap(({ c }, k) =>
        [BAND + HALF - 1, BAND - HALF + 1].map((r) => stroke(ringParts(c, r, { holes: sealHoles, cuts: underCuts(k, r) }), 0.4 + k * 0.15, 1.1)),
      ),
      // A fine line echoing each band along its outside, passing under as the band does.
      eclipses: eclipses.map(({ c }, k) => stroke(ringParts(c, ECL, { wear: w }), 1.1 + k * 0.12, 0.6)),
      echoes: bands.map(({ c }, k) => stroke(ringParts(c, BAND + HALF + ECHO, { holes: sealHoles, cuts: underCuts(k, BAND + HALF + ECHO) }), 0.55 + k * 0.15, 1.1)),
      // Each seal's double ring, cut where its find breaks out.
      seals: placedSeals.flatMap(({ c, ringCuts }, k) => [SEAL, SEAL - 1.6].map((r, i) => stroke(ringParts(c, r, { cuts: ringCuts(r), wear: i ? null : w }), 0.95 + k * 0.12, 0.6))),
      sun: stroke(ringParts(O, SUN, { wear: w }), 0.05, 0.6),
      sunIn: stroke(ringParts(O, SUN_IN), 0.1, 0.6),
      // Hollow, the hollow frame round the avatar, the black sun hidden under it.
      hollowRing: hollowFrame(w),
    };
  };


  const layers = (p: ReturnType<typeof drawing>): Record<string, Engraved> => ({
    rings: engrave((e) => {
      p.rim.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
      p.bands.forEach((list) => e.pieces(list, ''));
      p.rules.forEach((list) => e.pieces(list, 'hair'));
      p.echoes.forEach((list) => e.pieces(list, 'hair'));
      e.line(GLORY, 'hair', 0.8, 0.7);
      // The eclipse, round from the bite to nearly gone.
      p.sunSeals.forEach((list, i) => e.pieces(list, i % 2 ? 'hair' : ''));
      p.path.forEach((list) => e.pieces(list, 'hair'));
      p.seals.forEach((list, i) => e.pieces(list, i % 2 ? 'hair' : ''));
      e.line(RULES, 'hair', 1.9, 0.4);
      PATH_SCRIPT.forEach((m, i) => {
        const turn = turned(m.a);
        e.mark(m.d, 1.4 + (i / PATH_SCRIPT.length) * 0.6, `rotate(${f(m.a)}) translate(0 -${SCRIPT_OUT})`, (q) => turn([q[0], q[1] - SCRIPT_OUT]), m.a);
      });
      SCRIPT.forEach((m, i) => {
        const { c } = bands[m.k];
        const turn = turned(m.t);
        e.mark(m.d, 1.2 + (i / SCRIPT.length) * 0.8, `translate(${f(c[0])} ${f(c[1])}) rotate(${f(m.t)}) translate(0 -${BAND})`, (q) => {
          const [x, y] = turn([q[0], q[1] - BAND]);
          return [c[0] + x, c[1] + y];
        }, m.t);
      });
    }),
    // The finds.
    ...Object.fromEntries(placedSeals.map(({ signs, core }, k) => [`find${k}`, engrave((e) => [...signs, ...core].forEach(({ d, cls }) => e.line(d, cls, 1.05 + k * 0.12, 0.6)))])),
    // Each eclipse: the sun and the moon across it; and its corona in two
    // sets, rays and fine ones, which swell and shrink out of step.
    ...Object.fromEntries(
      eclipses.flatMap(({ light, edge, rays, fine }, k) => [
        [
          `eclipse${k}`,
          engrave((e) => {
            e.pieces(p.eclipses[k], 'thin');
            e.line(light, 'hatch', 1.3 + k * 0.12, 0.4);
            e.line(edge, 'thin', 1.25 + k * 0.12, 0.4);
          }),
        ],
        [
          `rays${k}`,
          engrave((e) =>
            rays.forEach((ray) => {
              e.line(ray.lines, 'hair', 1.35 + k * 0.12, 0.4);
              e.line(ray.hatch, 'hatch', 1.5 + k * 0.12, 0.3);
            }),
          ),
        ],
        [`fine${k}`, engrave((e) => e.line(fine, 'hair', 1.45 + k * 0.12, 0.35))],
      ]),
    ),
    sunRays: engrave((e) =>
      RAYS.forEach((ray, k) => {
        e.line(ray.lines, 'thin', 0.5 + k * 0.03, 0.4);
        e.line(ray.hatch, 'hatch', 0.7 + k * 0.03, 0.4);
      }),
    ),
    sunFine: engrave((e) => e.line(FINE, 'hair', 0.7, 0.5)),
    hollowRing: engraveFrame(p.hollowRing),
    sun: engrave((e) => {
      e.pieces(p.sun, '');
      e.pieces(p.sunIn, 'hair');
    }),
  });
  const GLOW = layers(drawing(false));
  const LINES = layers(drawing(true));
  const layer = (name: string, more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], ...more });
  // The rings turn slowly as one; the black sun at their heart turns slowly
  // against them, its corona's rays and fine rays swelling and shrinking out
  // of step; the eclipses ride the rings upright, their coronas turning
  // slowly sunwise and breathing. The finds stay as they are set: their breaking out is cut to
  // their rings.
  const LAYERS = [
    // (Hollow, the bands, which meet in the heart, stop short of the hollow frame.)
    layer('rings', { spin: { turn: 240, from: 30, reverse: true }, cut: true }),
    layer('sun', { within: 'rings', pivot: O, spin: { turn: 120, from: 0 }, inner: true }),
    layer('hollowRing', { spin: FRAME_SPIN, hollow: true }),
    ...placedSeals.map((_, k) => layer(`find${k}`, { within: 'rings' })),
    layer('sunRays', { within: 'sun', breathe: { low: 0.95, period: 4.6 }, inner: true }),
    layer('sunFine', { within: 'sun', breathe: { low: 0.9, period: 3.7, delay: -2.1 }, inner: true }),
    ...eclipses.flatMap(({ c }, k) => [
      layer(`eclipse${k}`, { within: 'rings', pivot: c, upright: true }),
      // The corona turns slowly sunwise in the upright eclipse: its fine rays
      // with it, its pointed rays riding it and breathing.
      layer(`fine${k}`, { within: `eclipse${k}`, pivot: c, spin: { turn: [70, 80, 90][k], from: 0 } }),
      layer(`rays${k}`, { within: `fine${k}`, pivot: c, breathe: { low: 0.94, period: 3.9 + k * 0.6, delay: -k * 1.3 } }),
    ]),
  ];
  return LAYERS;
};
