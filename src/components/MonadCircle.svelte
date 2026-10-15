<script module lang="ts">
  import { at as atAbout, f, hatch, joined, line, lineParts, meeting, pt, ringParts, seeded, wear, wovenPolygons, type Hole, type Pt, type Wear } from '../lib/arcane';
  import { ELEMENTS, MARKS, OUROBOROS, PLANETS, STONE } from '../lib/alchemy';
  import { engrave, mapPath, stroke, turned, type Engraver } from '../lib/engraver';
  import { inscribe } from '../lib/tongue';
  import type { StageLayer } from './ArcaneStage.svelte';
  import { whenIdle } from '../lib/idle';

  // The plate is built once, the first time a circle is mounted, or before
  // that in an idle moment after the page has loaded, so its geometry
  // never weighs on the page's first frames.
  let built: StageLayer[] | undefined;
  const build = (): StageLayer[] => {

    // The rune circle's sibling (ArcaneCircle; docs/arcane-style.md): the same
    // engraving in another plate, the squared circle, so the two can take
    // turns. From the outside in, turning in layers:
    // • the band: the four elements in great seals that break out through its
    //   rings at the quarters, the unreadable script between them;
    // • a square of triple straps over a glory of fine rays, with a seal in
    //   each of the four spaces between it and the band (sulphur, the stone,
    //   salt and the serpent that bites its tail);
    // • inside the square a circle, and in it the Seal of Solomon, its two
    //   triangles woven over and under, its points hatched, the six lesser
    //   planets sealed between them;
    // • at the heart, still and upright, Dee's hieroglyphic monad: the sun
    //   with its point, the moon above, the cross and the ram's horns below,
    //   in a glory of its own, and the point beats now and then.
    // Lines stop short of every seal they meet and carry the odd nick, as on
    // the other plate. It is set on the ArcaneStage, which turns, lights and
    // colours it.
    const O: Pt = [0, 0];
    /** The point at `a` degrees clockwise from the top, `r` from the centre. */
    const at = (a: number, r: number) => atAbout(O, a, r);
    /** A path drawn `k` times its size (signs are drawn on small grids, lib/alchemy). */
    const grown = (d: string, k: number) => mapPath(d, ([x, y]) => [x * k, y * k], 0, k);

    // ---- the band ----------------------------------------------------------
    const BAND_IN = 82;
    const BAND_OUT = 94;
    const BAND = (BAND_IN + BAND_OUT) / 2;
    const RIM = 97.5;
    // The elements' seals (fire, air, water, earth from the top; lib/alchemy), wider than the band.
    const ELEMENT = 9.5;
    const elements = [0, 90, 180, 270].map((a) => ({ a, c: at(a, BAND) }));
    const bandHoles: Hole[] = elements.map(({ c }) => ({ c, r: ELEMENT + 1.2 }));
    const rnd = seeded(23);
    const SCRIPT = elements.flatMap(({ a }) => inscribe(a + 10.5, a + 90 - 10.5, BAND, rnd, 1.2));

    // ---- the square, over its glory -------------------------------------
    const SQUARE = 78;
    const SQ_W = 1.1;
    const GAP = 0.7;
    const square = wovenPolygons([[45, 135, 225, 315].map((a) => at(a, SQUARE))], SQ_W, GAP);
    const sqUnder = square.straps.map((s) => ({ ...s, w: SQ_W + GAP }));
    // A seal in each space between the square and the band.
    const LESSER = 7.2;
    const SIDE = SQUARE * Math.SQRT1_2;
    const spaces = [0, 90, 180, 270].map((a) => ({ a, c: at(a, (SIDE + SQ_W + BAND_IN) / 2) }));
    const spaceHoles: Hole[] = spaces.map(({ c }) => ({ c, r: LESSER + 1.2 }));
    const SPACE_SIGNS: [string, string, number][][] = [
      [[grown(MARKS[5], 1.9), 'sign', 1]], // sulphur
      [[STONE, 'sign', 1]], // the stone
      [[grown(MARKS[4], 2.3), 'sign', 1]], // salt
      [], // the serpent (in a layer of its own, which turns)
    ];
    // The glory: fine rays out from the circle to the band, long and short in
    // turn, passing under the square.
    const CIRCLE = SIDE - SQ_W - GAP - 0.6;
    const GLORY = Array.from({ length: 72 }, (_, k) => {
      const a = ((k + 0.5) / 72) * 360;
      return lineParts(at(a, CIRCLE + 1.4), at(a, k % 2 ? BAND_IN - 6.5 : BAND_IN - 2.2), { under: sqUnder, holes: spaceHoles });
    });

    // ---- the Seal of Solomon ------------------------------------------------
    const W = 0.8;
    const HEX = CIRCLE - 1.4 - 0.8 - W / Math.sin(Math.PI / 6);
    const solomon = wovenPolygons(
      [0, 180].map((turn) => [0, 120, 240].map((a) => at(a + turn, HEX))),
      W,
      GAP,
    );
    // Its points, each with a ridge and hatched down one side, clear of the straps.
    const POINTS = Array.from({ length: 6 }, (_, k) => {
      const a = k * 60;
      const [tip, d] = [HEX - (W + 0.6) / Math.sin(Math.PI / 6), HEX / 2 + W + 0.6];
      const [apex, base] = [at(a, tip), at(a, d)];
      const half = (tip - d) * Math.tan(Math.PI / 6);
      const side = at(a + 90, half);
      const corner: Pt = [base[0] + side[0], base[1] + side[1]];
      return { ridge: line(base, apex), hatch: hatch(base, corner, apex, 0.6) };
    });
    // The six lesser planets between its points (Sol is the monad's).
    const PLANET = 7.2;
    const planets = PLANETS.slice(1).map((d, k) => {
      const a = k * 60 + 30;
      return { a, c: at(a, HEX * 0.84), d };
    });
    const HEART = HEX / 2 - W - GAP;

    // ---- the monad ------------------------------------------------------------
    // After John Dee's Monas Hieroglyphica: the sun (a ring round the point at
    // the very centre of the circle), the moon's crescent resting above it,
    // the cross below, and at its foot the ram's two horns. Lit from the upper
    // left: each stroke has a fine line beside it on its shadow side.
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
      sun: `M0 ${-SUN}A${SUN} ${SUN} 0 1 1 0 ${SUN}A${SUN} ${SUN} 0 1 1 0 ${-SUN}Z`,
      sunInner: `M0 ${-(SUN - 0.7)}A${SUN - 0.7} ${SUN - 0.7} 0 1 1 0 ${SUN - 0.7}A${SUN - 0.7} ${SUN - 0.7} 0 1 1 0 ${-(SUN - 0.7)}Z`,
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
    // Points along the monad, for its glory to stand clear of (and across
    // the moon's horns, so no ray runs in between them).
    const MONAD_PTS: Pt[] = [
      ...Array.from({ length: 48 }, (_, k) => at(k * 7.5, SUN)),
      ...Array.from({ length: 64 }, (_, k): Pt => {
        const p = at(k * 5.625, MOON.r);
        return [p[0], p[1] + MOON.c];
      }).filter(([, y]) => y >= horn[1] - 0.1),
      ...Array.from({ length: 21 }, (_, k): Pt => [horn[0] - (2 * horn[0] * k) / 20, horn[1]]),
      ...Array.from({ length: 41 }, (_, k): Pt => [0, SUN + ((FOOT - SUN) * k) / 40]),
      ...Array.from({ length: 31 }, (_, k): Pt => [-ARM + (2 * ARM * k) / 30, BAR]),
      ...[-1, 1].flatMap((s) => Array.from({ length: 25 }, (_, k): Pt => [s * HORN + s * HORN * Math.cos((Math.PI * k) / 24) * -1, FOOT - HORN * Math.sin((Math.PI * k) / 24)])),
    ];
    // The monad's glory: rays from just clear of it out to the heart's ring.
    // (In two sets, the long rays and the short, which swell and shrink out of step.)
    const MONAD_GLORY = Array.from({ length: 40 }, (_, k) => {
      const a = ((k + 0.5) / 40) * 360;
      const u = at(a, 1);
      let from = 0;
      for (let t = 0; t < 22; t += 0.1) if (MONAD_PTS.some(([x, y]) => Math.hypot(x - u[0] * t, y - u[1] * t) < 1.7)) from = t;
      const to = HEART - (k % 2 ? 4 : 2.4);
      return to - from > 1.2 ? `M${pt(at(a, from))}L${pt(at(a, to))}` : '';
    });
    const MONAD_GLORY_SETS = [0, 1].map((n) => MONAD_GLORY.filter((_, k) => k % 2 === n).join(''));

    // Everything that wears, drawn twice: worn for the lines, whole for the
    // glow under them. The wear is one seeded run through the lines in this
    // order, so every circle is worn alike.
    const drawing = (worn: boolean) => {
      const w: Wear = worn ? wear(17) : null;
      const strap = (s: ReturnType<typeof wovenPolygons>, i: number, side: number, holes: Hole[] = []) =>
        lineParts(...s.edge(i, side), { holes, under: s.unders[i], wear: side ? w : null });
      return {
        band: [ringParts(O, RIM, { holes: bandHoles, wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })].map(
          (parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1),
        ),
        square: square.straps.flatMap((_, i) => [1, 0, -1].map((side) => ({ side, list: stroke(strap(square, i, side), 0.45 + i * 0.1, 0.55) }))),
        circle: stroke(ringParts(O, CIRCLE, { wear: w }), 0.25, 0.9),
        circleInner: stroke(ringParts(O, CIRCLE - 1.3, { wear: w }), 0.3, 0.9),
        solomon: solomon.straps.flatMap((_, i) => [1, -1].map((side) => stroke(strap(solomon, i, side), 0.35 + i * 0.09, 0.5))),
        heart: stroke(ringParts(O, HEART, { wear: w }), 0.05, 0.7),
        heartInner: stroke(ringParts(O, HEART - 1.4, { wear: w }), 0.1, 0.7),
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
        elements.forEach(({ a, c }, k) => seal(e, 1 + k * 0.1, c, a, ELEMENT, [
          [ELEMENTS[k].lines, 'sign', 1],
          [ELEMENTS[k].shade, 'hatch', 1],
        ]));
        SCRIPT.forEach((m, k) => {
          const turn = turned(m.a);
          e.mark(m.d, 1.15 + (k / SCRIPT.length) * 0.8, `rotate(${f(m.a)}) translate(0 -${BAND})`, (q) => turn([q[0], q[1] - BAND]), m.a);
        });
      }),
      square: engrave((e) => {
        for (const { side, list } of p.square) e.pieces(list, side ? 'thin' : 'hair');
        GLORY.forEach((parts, k) => e.pieces(stroke(parts, 0.65 + k * 0.006, 0.35), 'hair'));
        spaces.forEach(({ a, c }, k) => seal(e, 1 + k * 0.09, c, a, LESSER, SPACE_SIGNS[k]));
      }),
      // The serpent in its seal, chasing its tail round head first.
      serpent: engrave((e) => {
        const { a, c } = spaces[3];
        const turn = turned(a);
        e.line(
          mapPath(grown(OUROBOROS, 1.25), (q) => {
            const [x, y] = turn(q);
            return [c[0] + x, c[1] + y];
          }, a),
          'sign',
          1.6,
          0.6,
        );
      }),
      star: engrave((e) => {
        e.pieces(p.circle, 'thin');
        e.pieces(p.circleInner, 'hair');
        for (const edge of p.solomon) e.pieces(edge, 'thin');
        POINTS.forEach((pt, k) => {
          e.line(pt.ridge, 'hair', 0.85 + k * 0.05, 0.4);
          e.line(pt.hatch, 'hatch', 0.95 + k * 0.05, 0.5);
        });
        planets.forEach(({ a, c, d }, k) => k && seal(e, 0.9 + k * 0.07, c, a, PLANET, [[d, 'sign', 1.05]]));
      }),
      // Luna, upright on the page as the star carries her round.
      luna: engrave((e) => seal(e, 0.9, planets[0].c, 0, PLANET, [[planets[0].d, 'sign', 1.05]])),
      glory0: engrave((e) => e.line(MONAD_GLORY_SETS[0], 'hair', 1.3, 0.7)),
      glory1: engrave((e) => e.line(MONAD_GLORY_SETS[1], 'hair', 1.35, 0.7)),
      monad: engrave((e) => {
        e.pieces(p.heart, 'thin');
        e.pieces(p.heartInner, 'hair');
        e.line(MONAD.sun, '', 1.4, 0.5);
        e.line(MONAD.sunInner, 'hair', 1.45, 0.5);
        e.line(MONAD.stem, '', 1.55, 0.35);
        e.line(MONAD.bar, '', 1.65, 0.3);
        e.line(MONAD.horns, '', 1.75, 0.4);
        e.line(CRESCENT, '', 1.85, 0.45);
        e.line(CRESCENT_HATCH, 'hatch', 2, 0.4);
        e.line(MONAD.shadows, 'hair', 2, 0.4);
      }),
    });
    const GLOW = layers(drawing(false));
    const LINES = layers(drawing(true));
    const layer = (name: keyof typeof LINES, spin?: StageLayer['spin'], more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], spin, ...more });
    // Each ring turns its own way and speed (each the other way from the
    // rune circle's), and first winds into place; Luna rides the star
    // upright; the monad stays upright, its glory's long and short rays
    // swelling and shrinking out of step.
    const LAYERS = [
      layer('band', { turn: 220, from: 30, reverse: true }),
      layer('square', { turn: 150, from: -32 }),
      layer('serpent', { turn: 30, from: 0 }, { within: 'square', pivot: spaces[3].c }),
      layer('star', { turn: 110, from: 48, reverse: true }),
      layer('luna', undefined, { within: 'star', pivot: planets[0].c, upright: true }),
      layer('glory0', undefined, { breathe: { low: 0.96, period: 4.4 } }),
      layer('glory1', undefined, { breathe: { low: 0.94, period: 3.5, delay: -1.8 } }),
      layer('monad'),
    ];
    return LAYERS;
  };
  const plate = () => (built ??= build());
  whenIdle(() => plate(), { timeout: 5000, fallback: 1500 });
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS = plate();
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the heart's ring and the great circle draw, the Seal of Solomon is traced
  strap by strap and the planets stamped between its points, the square is
  laid over a glory that shoots out under it, the band's rings sweep round
  and the elements are stamped into them and the script written, and last
  the monad is engraved stroke by stroke and its point set at the centre.
-->

<ArcaneStage layers={LAYERS} point={{ r: 1.2, delay: 2.15 }} {state} {size} {color} {strength} />
