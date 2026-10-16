// The plate of the monad (src/components/MonadCircle.svelte; see
// docs/arcane-style.md): its geometry, worked out when the site is built
// (vite.config.ts, plates) rather than in every browser, and read by the
// circle as `virtual:plate/monad`.
import { at as atAbout, clearFrom, f, hatch, line, lineParts, meeting, pt, ring as round, ringParts, seeded, wear, wovenPolygons, type Hole, type Pt, type Wear } from '../arcane.ts';
import { engrave, mapPath, stroke, turned, type Engraver, type StageLayer } from '../engraver.ts';
import { inscribe } from '../tongue.ts';
import * as ouro from '../ouroborosArt.ts';

export const build = (): StageLayer[] => {

  // The rune circle's sibling (ArcaneCircle; docs/arcane-style.md): the same
  // engraving in another plate, the squared circle, so the two can take
  // turns. From the outside in, turning in layers:
  // • the band: the archangels of the four quarters in great seals that
  //   break out through its rings, the unreadable script between them;
  // • a square of triple straps over a glory of fine rays, with a seal in
  //   each of the four spaces between it and the band, the monad taken
  //   apart, and over its upper left corner the great seal of the squared
  //   circle;
  // • inside the square a circle, and in it the Seal of Solomon, its two
  //   triangles woven over and under, its points hatched, and sealed
  //   between them six letters of Dee's angelic alphabet;
  // • at the heart, inside the descent's ouroboros, two snakes each biting
  //   the other's tail, coiled over the star's middle and turning slowly,
  //   still and upright and large, Dee's hieroglyphic monad: the sun with its point,
  //   streaked within and turning slowly sunwise about its point, the moon
  //   above rocking gently on it, the cross and the ram's horns below, in a
  //   glory round which a slow swell of light runs.
  // Lines stop short of every seal they meet and carry the odd nick, as on
  // the other plate. It is set on the ArcaneStage, which turns, lights and
  // colours it.
  const O: Pt = [0, 0];
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number) => atAbout(O, a, r);

  // ---- the band ----------------------------------------------------------
  const BAND_IN = 82;
  const BAND_OUT = 94;
  const BAND = (BAND_IN + BAND_OUT) / 2;
  const RIM = 97.5;
  /** A circle about (`x`, `y`), as path data. */
  const ring = (x: number, y: number, r: number) => round([x, y], r);
  // The four archangels of the quarters in great seals, wider than the band
  // and upright as it turns: Michael, Gabriel, Samael and Raphael, each by
  // the character the Heptameron (1559) gives him, written on a line, as a
  // name is signed (drawn on a grid of about ±6 and set down 1.15 times).
  const ANGEL = 8.8;
  const ANGEL_K = 1.15;
  const angels = [0, 90, 180, 270].map((a) => ({ a, c: at(a, BAND) }));
  const bandHoles: Hole[] = angels.map(({ c }) => ({ c, r: ANGEL + 1.2 }));
  const ANGELS = [
      // Michael
      'M-5.5 -1.1C-5.4 -2.3 -3.8 -2.3 -3.9 -1.2C-4 -0.3 -5.1 0.5 -5.6 1.2H-3.6M-4.6 0.4V2.1' +
        'M-3 0.4C-2.6 -0.8 -2 1.4 -1.5 0.3L-0.8 -0.7L-0.1 0.3L-0.8 1.3L-1.5 0.3M-0.1 0.3C0.3 -0.6 0.8 1.2 1.2 0.2' +
        'M1.6 1.3L2.4 -0.9H3.4L4.2 1.3M4.5 -1.5L5.8 1.6M4.6 1.6L5.9 -1.7',
      // Gabriel
      'M-5.4 -1.9V1.9M-6 -0.9H-4.2M-6 0.6H-4.2M-5.4 1.9C-5 2.3 -4.5 2.1 -4.4 1.7' +
        'M-3.3 -1.5H-0.5V1.5H-3.3ZM-1.9 -1.5V1.5M-3.3 0H-0.5' +
        'M0.2 1.4L1.2 -1.4L2.2 1.4L3.2 -1.4L4.2 1.4L5.2 -1.4C5.6 -1.8 6 -1.4 5.8 -1',
      // Samael
      'M-6 -1.6H-4.6M-5.3 -1.6V1' +
        'M-4.4 0.4H-4C-3.4 0.4 -3.4 1.8 -2.6 1.8C-1.8 1.8 -1.8 0.4 -1.2 0.4C-0.6 0.4 -0.6 1.8 0.2 1.8C1 1.8 1 0.4 1.6 0.4H2.4' +
        'M2.7 -1.3L4.1 1.3M2.7 1.3L4.1 -1.3M4.1 0H5.9M5.1 -0.8L5.9 0L5.1 0.8',
      // Raphael
      'M-5.9 1.2C-5.9 1.9 -4.8 1.9 -4.9 1C-5 0.2 -5.9 -0.2 -5.8 -1C-5.7 -1.8 -4.7 -1.8 -4.7 -1.1' +
        'M-4.2 0H-3.6' + ring(-2.9, 0, 0.7) + 'M-2.2 0H-1.6M-1.6 -1.2V1.2' + ring(-0.9, 0, 0.7) + 'M-0.2 0H0.4M0.4 -1.2V1.2' + ring(1.1, 0, 0.7) +
        'M1.8 0H2.3M2.3 -1.3H4V1.3H2.3ZM2.9 -1.3V1.3M3.45 -1.3V1.3M4.5 -1.5V1.5M5.9 -1.5L4.5 0L5.9 1.5',
  ].map((d) => mapPath(d + 'M-5.6 2.7H5.6', ([x, y]) => [x * ANGEL_K, y * ANGEL_K], 0, ANGEL_K));
  const rnd = seeded(23);
  const SCRIPT = angels.flatMap(({ a }) => inscribe(a + 10.5, a + 90 - 10.5, BAND, rnd, 1.2));

  // ---- the square, over its glory -------------------------------------
  // (Its corners, mitred, come no further out than 77.6, well short of
  // the band's seals, which turn past them the other way.)
  const SQUARE = 76;
  const SQ_W = 1.1;
  const GAP = 0.7;
  const square = wovenPolygons([[45, 135, 225, 315].map((a) => at(a, SQUARE))], SQ_W, GAP);
  const sqUnder = square.straps.map((s) => ({ ...s, w: SQ_W + GAP }));
  // A seal in each space between the square and the band.
  const LESSER = 7.2;
  const SIDE = SQUARE * Math.SQRT1_2;
  const spaces = [0, 90, 180, 270].map((a) => ({ a, c: at(a, (SIDE + SQ_W + BAND_IN) / 2) }));
  const spaceHoles: Hole[] = spaces.map(({ c }) => ({ c, r: LESSER + 1.2 }));
  // In the four spaces, the monad taken apart, as Dee builds it in his
  // theorems: the moon's cup over it, the sun with its point (ringed by a
  // compass's marks) to its right, the ram's horns at its foot, and to its
  // left the cross of the elements, a point in each of its quarters.
  const CUP = (() => {
    const d = 'M-3.8 -1.6A3.8 3.8 0 0 0 3.8 -1.6A4.6 4.6 0 0 1 -3.8 -1.6Z';
    let h = '';
    const c2y = -1.6 - Math.sqrt(4.6 * 4.6 - 3.8 * 3.8);
    for (let y = -0.4; y < 2.0; y += 0.45) {
      const xo = Math.sqrt(3.8 * 3.8 - (y + 1.6) ** 2) - 0.4;
      const yy = y - c2y;
      const xi = yy < 5 ? Math.sqrt(Math.max(0, 25 - yy * yy)) : 0;
      if (xo - xi > 0.3) h += `M${f(-xo)} ${f(y)}H${f(-xi)}M${f(xi)} ${f(y)}H${f(xo)}`;
    }
    return { lines: d, shade: h };
  })();
  const SOLAR = {
    lines: ring(0, 0, 3.2) + ring(0, 0, 0.6),
    shade: [0, 1, 2, 3].map((i) => `M${pt(at(45 + i * 90, 3.9))}L${pt(at(45 + i * 90, 4.8))}`).join('') + ring(0, 0, 4.4),
  };
  const HORNS = 'M0 4.2V0.4M0 0.4C0 -2.6 -1.2 -3.9 -2.6 -3.9C-4 -3.9 -4.6 -2.5 -3.9 -1.3C-3.2 -0.3 -1.9 -0.7 -2 -1.7M0 0.4C0 -2.6 1.2 -3.9 2.6 -3.9C4 -3.9 4.6 -2.5 3.9 -1.3C3.2 -0.3 1.9 -0.7 2 -1.7M-1.2 4.2H1.2';
  const ELEMENTS_CROSS =
    'M-0.55 -4.3V-0.55H-4.3V0.55H-0.55V4.3H0.55V0.55H4.3V-0.55H0.55V-4.3ZM-1.2 -4.3H1.2M-1.2 4.3H1.2M-4.3 -1.2V1.2M4.3 -1.2V1.2' +
    [
      [-2.2, -2.2],
      [2.2, -2.2],
      [-2.2, 2.2],
      [2.2, 2.2],
    ]
      .map(([x, y]) => ring(x, y, 0.35))
      .join('');
  const SPACE_SIGNS: [string, string, number][][] = [
    [
      [CUP.lines, 'sign', 1],
      [CUP.shade, 'hatch', 1],
    ],
    [
      [SOLAR.lines, 'sign', 1],
      [SOLAR.shade, 'hair', 1],
    ],
    [[HORNS, 'sign', 1]],
    [[ELEMENTS_CROSS, 'sign', 1]],
  ];
  // The great seal, over the square's upper left corner, larger than any
  // other and the one thing in the plate set off the quarters: the squared
  // circle the plate is named for, as Maier set it out (Atalanta fugiens,
  // emblem XXI): a circle, in it a triangle, in that a square, in that a
  // circle, and its point; the triangle's sides doubled, the space to the
  // right of the square cut down in strokes. It stays upright as the square
  // carries it round.
  // (Within 54.2 to 77.4 of the centre: clear of the circle inside the
  // square and of the band's seals, which turn past it.)
  const GREAT = 11.6;
  const great = { a: 315, c: at(315, 65.8) };
  const greatHole: Hole = { c: great.c, r: GREAT + 1.2 };
  const SQUARED = (() => {
    const R = 8.65;
    const tri = (r: number) => [at(0, r), at(120, r), at(240, r)];
    const base = R / 2;
    const t30 = Math.tan(Math.PI / 6);
    const side = ((base + R) * 2 * t30) / (1 + 2 * t30);
    const h = side / 2;
    const top = base - side;
    const lines =
      `M${tri(R).map(pt).join('L')}Z` +
      `M${tri(R - 1.3).map(pt).join('L')}Z` +
      `M${f(-h)} ${f(base - 0.65)}V${f(top)}H${f(h)}V${f(base - 0.65)}Z` +
      ring(0, base - 0.65 - (side - 0.65) / 2, (side - 0.65) / 2 - 0.15) +
      ring(0, base - 0.65 - (side - 0.65) / 2, 0.45);
    const [bx, by] = at(120, R - 1.3);
    const shade = hatch([h + 0.35, by - 0.35], [bx - 0.6, by - 0.35], [h + 0.35, top + 0.6], 0.45);
    return { lines, shade };
  })();
  // The glory: fine rays out from the circle to the band, long and short in
  // turn, passing under the square.
  const CIRCLE = SIDE - SQ_W - GAP - 0.6;
  const GLORY = Array.from({ length: 72 }, (_, k) => {
    const a = ((k + 0.5) / 72) * 360;
    // (Where a seal of the band passes over them, the layer's mask stops
    // them short of it as it goes by.)
    return lineParts(at(a, CIRCLE + 1.4), at(a, k % 2 ? BAND_IN - 6.5 : BAND_IN - 2.2), { under: sqUnder, holes: [...spaceHoles, greatHole] });
  });

  // ---- the Seal of Solomon ------------------------------------------------
  const W = 0.8;
  const HEX = CIRCLE - 1.4 - 0.8 - W / Math.sin(Math.PI / 6);
  const solomon = wovenPolygons(
    [0, 180].map((turn) => [0, 120, 240].map((a) => at(a + turn, HEX))),
    W,
    GAP,
  );
  // The heart: the ouroboros coiled round the star's middle (see below),
  // the straps passing under it, so the monad can stand large inside it.
  const REACH = 32.6;
  const heartHole: Hole = { c: O, r: REACH + 1.2 };
  // Its points, each with a ridge and hatched down one side, clear of the straps.
  const POINTS = Array.from({ length: 6 }, (_, k) => {
    const a = k * 60;
    const [tip, d] = [HEX - (W + 0.6) / Math.sin(Math.PI / 6), HEX / 2 + W + 0.6];
    const [apex, base] = [at(a, tip), at(a, d)];
    const half = (tip - d) * Math.tan(Math.PI / 6);
    const side = at(a + 90, half);
    const corner: Pt = [base[0] + side[0], base[1] + side[1]];
    return { ridge: line(base, apex, { holes: [heartHole] }), hatch: hatch(base, corner, apex, 0.6, { holes: [heartHole] }) };
  });
  // Between its points, six letters of the angelic alphabet the angels
  // gave Dee and Kelley in 1583, drawn after Dee's own hand in his
  // manuscript, each upright as the star turns.
  const ENOCH = [
      'M-3.4 -3.6C-3.9 -2.6 -2.9 -2 -2.2 -2.6C-0.6 -1.4 0.8 1.6 1.6 3.4C2 4.2 3 4 3.2 3.2M3 -3.4C1.4 -2.8 -1.2 0.6 -3.2 3.6',
      'M2.8 -3.9C0.2 -4.3 -2.9 -2.8 -2.9 0.6C-2.9 3.3 -0.9 4.2 0.6 4.2C2.4 4.2 3.3 2.9 3.3 1.5C3.3 -0.3 1.6 -1.2 0.2 -0.6C-0.8 -0.2 -1.1 0.9 -0.6 1.6',
      'M-3 -3.4H2.4L0.2 3C-0.2 4 -1.4 4.2 -1.8 3.4M-1.2 -0.2H1.8M-3 -3.4V-2.4',
      'M-3.6 -3.6C-0.6 -4 2.9 -2.6 2.9 0.2C2.9 2.9 0.4 4.1 -2.6 3.6M-3.6 0.2H3.9M-3.6 -3.6C-4.2 -3 -3.9 -2.4 -3.2 -2.6',
      'M-3.2 -3.4V3.2H3.2V-3.4M0 -2.4V3.2M-3.2 3.2C-3.7 3.9 -4.6 3.7 -4.5 3M-3.9 -3.4H-2.5M2.5 -3.4H3.9M-0.7 -2.4H0.7',
      'M-3 -3.6L0 0L3 -3.6M0 0V3.4M-2.2 1.6H2.2M0 3.4C0.4 4.3 1.6 4.1 1.5 3.2M-3 -3.6L-3.6 -3.1M3 -3.6L3.6 -3.1',
  ];
  const FIGURE = 7.2;
  const figures = ENOCH.map((d, k) => {
    const a = k * 60 + 30;
    return { a, c: at(a, HEX * 0.84), d };
  });

  // ---- the ouroboros --------------------------------------------------------
  // Round the monad, the descent's ouroboros (lib/ouroborosArt) as the
  // woodcut has it: two snakes making one ring, each biting the other's
  // tail, a line along each body between back and belly; drawn in gold at
  // the woodcut's own weights (its bodies' edges and the line along them
  // stroked, its heads cut solid, their lines as wide as the body's), mirrored
  // so the snakes run clockwise, and laid across the plate's diagonal, so
  // their heads keep to no quarter.
  const OURO_K = REACH / 248.9;
  const OURO_TURN = -52;
  /** A point of the woodcut, as the plate has it, for the snake turned `turn`. */
  const ouroAt = ([x, y]: Pt, turn: number): Pt => {
    const a = ((turn + OURO_TURN) * Math.PI) / 180;
    const [rx, ry] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    return [-rx * OURO_K, ry * OURO_K];
  };
  /** The woodcut's path (M, l and z only), as the plate has it. */
  const ouroPath = (d: string, turn: number) => {
    const tok = d.match(/[Mlz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
    let out = '';
    let cur: Pt = [0, 0];
    let cmd = '';
    for (let i = 0; i < tok.length; ) {
      if (/[Mlz]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'z') {
        out += 'Z';
        cmd = '';
        continue;
      }
      const [a, b] = [Number(tok[i++]), Number(tok[i++])];
      cur = cmd === 'M' ? [a, b] : [cur[0] + a, cur[1] + b];
      const q = ouroAt(cur, turn);
      out += `${cmd === 'M' ? 'M' : 'L'}${pt(q)}`;
      if (cmd === 'M') cmd = 'l';
    }
    return { d: out };
  };
  const both = (d: string) => [0, 180].map((turn) => ouroPath(d, turn));
  const OURO = {
    edges: both(ouro.BODY_EDGES).map((q) => q.d),
    dividers: both(ouro.BODY_DIVIDER).map((q) => q.d),
    inks: both(ouro.HEAD_INK).map((q) => q.d),
    eyes: both(ouro.HEAD_EYE).map((q) => q.d),
  };
  /** How near the centre the ring's body comes (the hole's radius, to the outside of its line). */
  const OURO_BODY_IN = 197.8 * OURO_K;
  /** The heads, for the glory to give way to as they pass. */
  const OURO_HEADS = both(ouro.HEAD_FILL).map((q) => q.d).join('');

  // ---- the monad ------------------------------------------------------------
  // After John Dee's Monas Hieroglyphica: the sun (a ring round the point at
  // the very centre of the circle), the moon's crescent resting above it,
  // the cross below, and at its foot the ram's two horns. Lit from the upper
  // left: each stroke has a fine line beside it on its shadow side.
  // Drawn on a grid of its own and set down at `MK` of it.
  const MK = 1.32;
  const SUN = 5.3;
  // The moon: a cup, its horns up, the space between two circles (the
  // inner one wider and higher), resting just above the sun.
  const MOON = { c: -12.1, r: 5.75 };
  const MOON_IN = { c: -14.5, r: 6.2 };
  const [horn] = meeting([0, MOON.c], MOON.r, [0, MOON_IN.c], MOON_IN.r).sort((p, q) => p[0] - q[0]);
  // Its two arcs apart, so the horns end sharp (joined, they would be mitred into spikes).
  const cup = ({ c, r }: { c: number; r: number }) => `M${pt(horn)}A${r} ${r} 0 ${horn[1] < c ? 1 : 0} 0 ${pt([-horn[0], horn[1]])}`;
  const CRESCENT = cup(MOON) + cup(MOON_IN);
  // Shaded across in hatching, as Luna is on the other plate.
  const CRESCENT_HATCH = Array.from({ length: Math.floor((MOON.c + MOON.r - 0.45 - horn[1]) / 0.6) }, (_, i) => {
    const y = horn[1] + 0.6 + i * 0.6;
    const xo = Math.sqrt(MOON.r ** 2 - (y - MOON.c) ** 2) - 0.45;
    const di = Math.abs(y - MOON_IN.c);
    if (di >= MOON_IN.r + 0.45) return `M${f(-xo)} ${f(y)}H${f(xo)}`;
    const xi = Math.sqrt((MOON_IN.r + 0.45) ** 2 - di ** 2);
    return xo - xi > 0.3 ? `M${f(-xo)} ${f(y)}H${f(-xi)}M${f(xi)} ${f(y)}H${f(xo)}` : '';
  }).join('');
  const FOOT = 15.6;
  const BAR = 9.9;
  const ARM = 5;
  const HORN = 2.75;
  const SHADE = 0.9;
  /** An arc about `c` of radius `r` over the top from `x0` to `x1` (its ends level with `c`). */
  const over = (c: Pt, r: number, x0: number, x1: number) => `M${f(x0)} ${f(c[1])}A${f(r)} ${f(r)} 0 0 ${x0 < x1 ? 1 : 0} ${f(x1)} ${f(c[1])}`;
  const MONAD = {
    sun: round([0, 0], SUN),
    sunInner: round([0, 0], SUN - 0.7),
    // Within the sun, fine streaks out from round its point, long and short in turn.
    streaks: Array.from({ length: 32 }, (_, k) => `M${pt(at((k / 32) * 360, 1.35))}L${pt(at((k / 32) * 360, k % 2 ? SUN - 1.9 : SUN - 1.25))}`).join(''),
    stem: `M0 ${SUN}V${FOOT}`,
    bar: `M${-ARM} ${BAR}H${ARM}`,
    horns: over([-HORN, FOOT], HORN, 0, -2 * HORN) + over([HORN, FOOT], HORN, 0, 2 * HORN),
    // The shadows: right of the stem (above and below the bar), under the
    // bar (either side of the stem), and inside each horn.
    shadows:
      `M${SHADE} ${f(SUN + 0.9)}V${f(BAR - 0.75)}M${SHADE} ${f(BAR + SHADE)}V${f(FOOT - Math.sqrt(HORN ** 2 - (HORN - SHADE) ** 2) - 0.7)}` +
      `M${-ARM} ${f(BAR + SHADE)}H-0.7M${SHADE} ${f(BAR + SHADE)}H${ARM}` +
      over([-HORN, FOOT], HORN - SHADE, -SHADE, -2 * HORN + SHADE) +
      over([HORN, FOOT], HORN - SHADE, SHADE, 2 * HORN - SHADE),
  };
  // Points along the monad, for its glory to stand clear of.
  const MONAD_PTS_AT: Pt[] = [
    ...Array.from({ length: 48 }, (_, k) => at(k * 7.5, SUN)),
    ...Array.from({ length: 64 }, (_, k): Pt => {
      const p = at(k * 5.625, MOON.r);
      return [p[0], p[1] + MOON.c];
    }).filter(([, y]) => y >= horn[1] - 0.1),
    // (The cup's inner curve too, so rays run down into it as far as its floor.)
    ...Array.from({ length: 64 }, (_, k): Pt => {
      const p = at(k * 5.625, MOON_IN.r);
      return [p[0], p[1] + MOON_IN.c];
    }).filter(([, y]) => y >= horn[1] - 0.1),
    ...Array.from({ length: 41 }, (_, k): Pt => [0, SUN + ((FOOT - SUN) * k) / 40]),
    ...Array.from({ length: 31 }, (_, k): Pt => [-ARM + (2 * ARM * k) / 30, BAR]),
    ...[-1, 1].flatMap((s) => Array.from({ length: 25 }, (_, k): Pt => [s * HORN + s * HORN * Math.cos((Math.PI * k) / 24) * -1, FOOT - HORN * Math.sin((Math.PI * k) / 24)])),
  ];
  const MONAD_PTS = MONAD_PTS_AT.map(([x, y]): Pt => [x * MK, y * MK]);
  const sized = (d: string) => mapPath(d, ([x, y]) => [x * MK, y * MK], 0, MK);
  // The monad's glory: rays from just clear of it out to the heart's ring.
  // (In two sets, the long rays and the short, which swell and shrink out of step.)
  const MONAD_GLORY = Array.from({ length: 64 }, (_, k) => {
    const a = ((k + 0.5) / 64) * 360;
    const u = at(a, 1);
    const from = clearFrom(u, MONAD_PTS, 2.1, REACH);
    // (Short of the ring's body; where a head passes, the layer's mask
    // stops them short of it as it goes by.)
    const to = OURO_BODY_IN - 1.3 - (k % 2 ? 3 : 0);
    return to - from > 1.2 ? `M${pt(at(a, from))}L${pt(at(a, to))}` : '';
  });
  // (In eight sectors of eight rays, which swell one after another, so a
  // slow swell of light runs round the sun.)
  const SECTORS = 8;
  const MONAD_GLORY_SETS = Array.from({ length: SECTORS }, (_, n) => MONAD_GLORY.slice(n * 8, n * 8 + 8).join(''));

  // Everything that wears, drawn twice: worn for the lines, whole for the
  // glow under them. The wear is one seeded run through the lines in this
  // order, so every circle is worn alike.
  const drawing = (worn: boolean) => {
    const w: Wear = worn ? wear(17) : null;
    const strap = (s: ReturnType<typeof wovenPolygons>, i: number, side: number, holes: Hole[] = s === solomon ? [heartHole] : [greatHole]) =>
      lineParts(...s.edge(i, side), { holes, under: s.unders[i], wear: side ? w : null });
    return {
      band: [ringParts(O, RIM, { holes: bandHoles, wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })].map(
        (parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1),
      ),
      square: square.straps.flatMap((_, i) => [1, 0, -1].map((side) => ({ side, list: stroke(strap(square, i, side), 0.45 + i * 0.1, 0.55) }))),
      circle: stroke(ringParts(O, CIRCLE, { wear: w }), 0.25, 0.9),
      circleInner: stroke(ringParts(O, CIRCLE - 1.3, { wear: w }), 0.3, 0.9),
      solomon: solomon.straps.flatMap((_, i) => [1, -1].map((side) => stroke(strap(solomon, i, side), 0.35 + i * 0.09, 0.5))),
    };
  };

  /** A seal at `c`, `a` degrees round, stamped in at `delay` (lib/engraver). */
  const seal = (e: Engraver, delay: number, c: Pt, a: number, r: number, signs: [string, string, number][]) => {
    const turn = turned(a);
    e.seal(delay, (q) => {
      const [x, y] = turn(q);
      return [c[0] + x, c[1] + y];
    }, `translate(${f(c[0])} ${f(c[1])}) rotate(${f(a)})`, a, r, 1.2, 0.5, signs);
  };

  const layers = (p: ReturnType<typeof drawing>) => ({
    band: engrave((e) => {
      p.band.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
      SCRIPT.forEach((m, k) => {
        const turn = turned(m.a);
        e.mark(m.d, 1.15 + (k / SCRIPT.length) * 0.8, `rotate(${f(m.a)}) translate(0 -${BAND})`, (q) => turn([q[0], q[1] - BAND]), m.a);
      });
    }),
    square: engrave((e) => {
      for (const { side, list } of p.square) e.pieces(list, side ? 'thin' : 'hair');
      spaces.forEach(({ a, c }, k) => seal(e, 1 + k * 0.09, c, a, LESSER, SPACE_SIGNS[k]));
    }),
    // The square's glory, turning with it, on a layer of its own so only
    // its rays give way to the band's seals as they pass.
    squareGlory: engrave((e) => GLORY.forEach((parts, k) => e.pieces(stroke(parts, 0.65 + k * 0.006, 0.35), 'hair'))),
    // The archangels and the great seal, upright as their rings carry them.
    ...Object.fromEntries(angels.map(({ c }, k) => [`angel${k}`, engrave((e) => seal(e, 1 + k * 0.1, c, 0, ANGEL, [[ANGELS[k], 'sign', 1]]))])),
    great: engrave((e) =>
      e.seal(1.05, (q) => [great.c[0] + q[0], great.c[1] + q[1]], `translate(${f(great.c[0])} ${f(great.c[1])})`, 0, GREAT, 1.6, 0.6, [
        [SQUARED.lines, 'sign', 1],
        [SQUARED.shade, 'hatch', 1],
      ]),
    ),
    star: engrave((e) => {
      e.pieces(p.circle, 'thin');
      e.pieces(p.circleInner, 'hair');
      for (const edge of p.solomon) e.pieces(edge, 'thin');
      POINTS.forEach((pt, k) => {
        e.line(pt.ridge, 'hair', 0.85 + k * 0.05, 0.4);
        e.line(pt.hatch, 'hatch', 0.95 + k * 0.05, 0.5);
      });

    }),
    // Luna, upright on the page as the star carries her round.
    // The six letters, each upright on the page as the star carries it round.
    ...Object.fromEntries(
      figures.map(({ c, d }, k) => [`figure${k}`, engrave((e) => seal(e, 0.9 + k * 0.07, c, 0, FIGURE, [[d, 'sign', 1]]))]),
    ),
    // The ouroboros: each snake's body draws from its neck round to the
    // other's mouth, both at once, the line along it with it; then the
    // heads are cut, and last the eyes open.
    serpent: engrave((e) => {
      OURO.edges.forEach((d) => e.line(d, 'ouro', 0.2, 1.1));
      OURO.dividers.forEach((d) => e.line(d, 'ouro-divider', 0.3, 1.05));
      OURO.inks.forEach((d) => e.line(d, 'ink', 1.25, 0.3));
      OURO.eyes.forEach((d) => e.line(d, 'ink', 1.7, 0.2));
    }),
    ...Object.fromEntries(MONAD_GLORY_SETS.map((d, n) => [`glory${n}`, engrave((e) => e.line(d, 'hair', 1.3 + (n / SECTORS) * 0.12, 0.7))])),
    monad: engrave((e) => {
      e.line(sized(MONAD.sun), '', 1.4, 0.5);
      e.line(sized(MONAD.sunInner), 'hair', 1.45, 0.5);
      e.line(sized(MONAD.stem), '', 1.55, 0.35);
      e.line(sized(MONAD.bar), '', 1.65, 0.3);
      e.line(sized(MONAD.horns), '', 1.75, 0.4);
      e.line(sized(MONAD.shadows), 'hair', 2, 0.4);
    }),
    // The sun's face: its streaks, and the point at the heart of all.
    sunFace: engrave((e) => {
      e.line(sized(MONAD.streaks), 'hatch', 2.05, 0.4);
      e.line(sized('M0 -0.6A0.6 0.6 0 1 1 0 0.6A0.6 0.6 0 1 1 0 -0.6Z'), 'ink', 2.2, 0.3);
    }),
    // The moon's cup, resting on the sun.
    moon: engrave((e) => {
      e.line(sized(CRESCENT), '', 1.85, 0.45);
      e.line(sized(CRESCENT_HATCH), 'hatch', 2, 0.4);
    }),
  });
  const GLOW = layers(drawing(false));
  const LINES = layers(drawing(true));
  const layer = (name: string, spin?: StageLayer['spin'], more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name as keyof typeof LINES], glow: GLOW[name as keyof typeof GLOW], spin, ...more });
  // Each ring turns its own way and speed (each the other way from the
  // rune circle's), and first winds into place; the letters ride the star
  // upright; the monad stays upright, its sun's face turning, its moon
  // rocking, and its glory's rays swelling one sector after the next, a
  // swell running round; where a head of the ouroboros passes, the rays
  // give way to it (the stage's masks).
  const LAYERS = [
    layer('band', { turn: 220, from: 30, reverse: true }),
    ...angels.map(({ c }, k) => layer(`angel${k}`, undefined, { within: 'band', pivot: c, upright: true })),
    layer('squareGlory', { turn: 150, from: -32 }, { mask: { d: angels.map(({ c }) => ring(c[0], c[1], ANGEL)).join(''), grow: 1.3, with: 'band' } }),
    layer('square', { turn: 150, from: -32 }),
    layer('great', undefined, { within: 'square', pivot: great.c, upright: true }),
    layer('star', { turn: 110, from: 48, reverse: true }),
    ...figures.map(({ c }, k) => layer(`figure${k}`, undefined, { within: 'star', pivot: c, upright: true })),
    layer('serpent', { turn: 300, from: -20 }),
    ...MONAD_GLORY_SETS.map((_, n) =>
      layer(`glory${n}`, undefined, { breathe: { low: 0.93, period: 4.5, delay: -(n / SECTORS) * 9 }, mask: { d: OURO_HEADS, grow: 1.3, with: 'serpent' } }),
    ),
    layer('monad'),
    layer('sunFace', { turn: 80, from: 0 }),
    layer('moon', undefined, { pivot: [0, (MOON.c + MOON.r) * MK], sway: { swing: 2.2, period: 6.5 } }),
  ];
  return LAYERS;
};
