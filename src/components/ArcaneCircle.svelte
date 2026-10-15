<script module lang="ts">
  import { at as atAbout, f, hatch, joined, lineParts, pt, rad, ringParts, seeded, wear, type Hole, type LineOpts, type Pt, type Strap, type Wear } from '../lib/arcane';
  import { LUNA, LUNA_HATCH, PLANETS, SOL_RAYS } from '../lib/alchemy';
  import { circlePath, engrave, mapPath, stroke, turned } from '../lib/engraver';
  import { inscribe } from '../lib/tongue';
  import type { StageLayer } from './ArcaneStage.svelte';

  // An alchemist's circle, engraved, that draws itself behind the item art
  // and turns slowly, in layers:
  // • the band: the seven planets of the old metals in seals, with lines
  //   of an unreadable alchemical script between them;
  // • a heptagram of double straps woven over and under, one point per
  //   planet, with Sol and Luna sealed between its arms, and a sun whose
  //   long rays run out under the straps into the arms;
  // • at the heart, a hatched compass star around an eye that stays upright.
  // Lines stop short of every seal they meet, as if drawn around it, and
  // carry the odd nick, like a worn plate.
  // `state` colours it at the reveal. It is set on the ArcaneStage, which
  // turns, lights and colours it, as is its sibling the MonadCircle: the
  // same craft in another plate, so the two can take turns.
  const O: Pt = [0, 0];
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number) => atAbout(O, a, r);

  // The band: seals on the planets' circle, the script between each pair.
  const BAND_IN = 81;
  const BAND_OUT = 94;
  const BAND = (BAND_IN + BAND_OUT) / 2;
  const SEAL = 7.2;
  const seals = PLANETS.map((d, k) => {
    const a = (k / 7) * 360;
    const [x, y] = at(a, BAND);
    return { a, x, y, d };
  });
  /** The band's seal holding Luna. */
  const LUNA_SEAL = 1;
  const bandHoles: Hole[] = seals.map(({ x, y }) => ({ c: [x, y], r: SEAL + 1.2 }));

  // Between the seals, a script nobody can read (lib/tongue).
  const rnd = seeded(11);
  const SCRIPT = Array.from({ length: 7 }, (_, k) => inscribe((k / 7) * 360 + 7.5, ((k + 1) / 7) * 360 - 7.5, BAND, rnd, 1.2)).flat();

  // The heptagram {7/2}: seven straps, each a pair of lines, their points
  // just inside the band, half a step round from the planets. Walking the
  // star in one go, the straps go over and under in turn at every crossing.
  const W = 0.8;
  const GAP = 0.7;
  const R = BAND_IN - 1.8;
  const INNER = R * Math.cos((2 * Math.PI) / 7);
  const BIG = 13;
  const sol = at(0, 65.5);
  const luna = at(180, 65.5);
  const starHoles: Hole[] = [sol, luna].map((c) => ({ c, r: BIG + 1.4 }));
  const tips = Array.from({ length: 7 }, (_, k) => at(((k + 0.5) / 7) * 360, R));
  const straps: Strap[] = Array.from({ length: 7 }, (_, i) => ({ p: tips[(i * 2) % 7], q: tips[(i * 2 + 2) % 7], w: W }));
  const cross = (a: Strap, b: Strap) => {
    const [r, s] = [
      [a.q[0] - a.p[0], a.q[1] - a.p[1]],
      [b.q[0] - b.p[0], b.q[1] - b.p[1]],
    ];
    const den = r[0] * s[1] - r[1] * s[0];
    const [ex, ey] = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
    const t = (ex * s[1] - ey * s[0]) / den;
    const u = (ex * r[1] - ey * r[0]) / den;
    return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99 ? t : null;
  };
  // Each strap's crossings in order along it; every second one goes under.
  let turn = 0;
  const unders = straps.map((a, i) =>
    straps
      .map((b, j) => ({ j, t: i === j ? null : cross(a, b) }))
      .filter((c): c is { j: number; t: number } => c.t !== null)
      .sort((x, y) => x.t - y.t)
      .filter(() => turn++ % 2 === 1)
      .map(({ j }) => ({ ...straps[j], w: W + GAP })),
  );
  /** One edge of strap `i`, `side` (±1) of its centre line, mitred to its neighbours at both tips. */
  const edgeOf = (i: number, side: number): [Pt, Pt] => {
    const { p, q } = straps[i];
    const n = (s: Strap): Pt => {
      const len = Math.hypot(s.q[0] - s.p[0], s.q[1] - s.p[1]);
      return [-(s.q[1] - s.p[1]) / len, (s.q[0] - s.p[0]) / len];
    };
    // At a tip both straps' outer edges meet beyond it, their inner edges
    // short of it; each tip turns the star the same way, so the same side
    // of each strap faces out.
    const [nx, ny] = n(straps[i]);
    const miter = (tip: Pt, other: Strap): Pt => {
      const [ox, oy] = n(other);
      const [bx, by] = [nx + ox, ny + oy];
      const k = (side * W) / (nx * bx + ny * by);
      return [tip[0] + bx * k, tip[1] + by * k];
    };
    return [miter(p, straps[(i + 6) % 7]), miter(q, straps[(i + 1) % 7])];
  };
  const STAR_RING = INNER - W - GAP;

  // Sol and Luna (lib/alchemy), kept upright as the star turns (see the layers).

  // The sun: seven long pointed rays out into the star's arms, passing
  // under the inner ring and the straps, and seven short ones between,
  // each hatched down one side.
  const SUN = 31;
  const rayStraps = straps.map((s) => ({ ...s, w: W + GAP }));
  const rays = (worn: Wear) =>
    Array.from({ length: 14 }, (_, k) => {
      const a = ((k + 1) / 14) * 360;
      const long = k % 2 === 0;
      const [base, l, r, tip] = [at(a, SUN), at(a - (long ? 4.5 : 3.6), SUN), at(a + (long ? 4.5 : 3.6), SUN), at(a, long ? R - 8 : STAR_RING - 1.4)];
      const opts: LineOpts = { holes: starHoles, under: rayStraps, rings: [{ c: O, r: STAR_RING, w: GAP }] };
      const delay = 0.7 + k * 0.035;
      return {
        lines: [lineParts(l, tip, { ...opts, wear: worn }), lineParts(r, tip, { ...opts, wear: worn }), lineParts(base, tip, opts)].flatMap((parts) =>
          stroke(parts, delay, long ? 0.6 : 0.4),
        ),
        hatch: hatch(base, l, tip, 0.55, opts),
        delay: delay + 0.25,
      };
    });
  // Fine rays between, half as long.
  const FINE = Array.from({ length: 14 }, (_, k) => {
    const a = ((k + 0.5) / 14) * 360;
    return joined(lineParts(at(a, SUN + 1), at(a, SUN + 10)));
  }).join('');

  // The heart: a compass star of eight points from a ring round the eye,
  // each hatched down one side.
  const EYE = 15;
  const COMPASS = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45;
    const tip = at(a, k % 2 ? 22 : 28.5);
    const base = at(a, EYE);
    const l = at(a - 22.5, EYE / Math.cos(rad(22.5)));
    const r = at(a + 22.5, EYE / Math.cos(rad(22.5)));
    return `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(base)}L${pt(tip)}` + hatch(base, l, tip, 0.6);
  }).join('');

  // The eye, after the Eye of Providence: an almond whose upper lid is cut
  // twice and shades the eyeball below it in fine arcs; the iris half
  // hooded, ringed and streaked, with a catchlight in the pupil; and a glory
  // of fine rays about it. Each lid is an arc of a circle through the
  // corners (±12, 0) and the given height at the middle.
  const lid = (h: number) => {
    const r = (144 + h * h) / (2 * Math.abs(h));
    return { r, cy: h + Math.sign(-h) * r };
  };
  const [UPPER, LOWER, UPPER_RIM, LOWER_RIM] = [lid(-6.6), lid(5.4), lid(-7.7), lid(6.1)];
  const ALMOND = `M-12 0A${f(UPPER.r)} ${f(UPPER.r)} 0 0 1 12 0A${f(LOWER.r)} ${f(LOWER.r)} 0 0 1 -12 0Z`;
  const RIMS = `M-12 0A${f(UPPER_RIM.r)} ${f(UPPER_RIM.r)} 0 0 1 12 0M12 0A${f(LOWER_RIM.r)} ${f(LOWER_RIM.r)} 0 0 1 -12 0`;
  /** How far from `p` along the unit `u` a ray leaves the circle about (0, cy). */
  const exit = (p: Pt, u: Pt, { r, cy }: { r: number; cy: number }) => {
    const [fx, fy] = [p[0], p[1] - cy];
    const b = fx * u[0] + fy * u[1];
    return -b + Math.sqrt(b * b - (fx * fx + fy * fy - r * r));
  };
  // Short strokes across the upper lid, from its edge to its rim.
  const LID_HATCH = Array.from({ length: 23 }, (_, k) => {
    const phi = -44 + k * 4;
    const u: Pt = [Math.sin(rad(phi)), -Math.cos(rad(phi))];
    const p: Pt = [UPPER.r * u[0], UPPER.cy + UPPER.r * u[1]];
    const len = exit(p, u, UPPER_RIM);
    return len > 0.25 ? `M${pt(p)}L${pt([p[0] + u[0] * len, p[1] + u[1] * len])}` : '';
  }).join('');
  // The lid's shadow on the eyeball: arcs under its edge, shorter as they fall.
  const SHADOW = [1, 2, 3, 4]
    .map((k) => {
      const r = UPPER.r - k * 0.75;
      const span = 40 - k * 8;
      const p = (phi: number) => pt([r * Math.sin(rad(phi)), UPPER.cy - r * Math.cos(rad(phi))]);
      return `M${p(-span)}A${f(r)} ${f(r)} 0 0 1 ${p(span)}`;
    })
    .join('');
  const IRIS_Y = -1;
  const IRIS_R = 6.2;
  const STREAKS = Array.from({ length: 44 }, (_, k) => {
    const a = (k / 44) * 360;
    const [p, q] = [at(a, 2.5), at(a, k % 2 ? 4.6 : IRIS_R - 0.9)];
    return `M${pt(p)}L${pt(q)}`;
  }).join('');
  const COLLARETTE =
    'M' +
    Array.from({ length: 73 }, (_, k) => {
      const a = (k / 72) * 360;
      return pt(at(a, 3.5 + 0.28 * Math.sin(rad(a * 9))));
    }).join('L');
  const PUPIL = 'M0 -2.2A2.2 2.2 0 1 1 0 2.2A2.2 2.2 0 1 1 0 -2.2ZM-0.8 -1.45A0.55 0.55 0 1 0 -0.8 -0.35A0.55 0.55 0 1 0 -0.8 -1.45Z';
  // The glory: rays from just off the lids out to the ring, long and short.
  const GLORY = Array.from({ length: 48 }, (_, k) => {
    const a = ((k + 0.5) / 48) * 360;
    const u = at(a, 1);
    const from = exit([0, 0], u, u[1] < 0 ? UPPER_RIM : LOWER_RIM) + 1.4;
    const to = k % 2 ? EYE - 2.6 : EYE - 1.2;
    return to - from > 1 ? `M${pt([u[0] * from, u[1] * from])}L${pt([u[0] * to, u[1] * to])}` : '';
  }).join('');

  // Everything that wears, drawn twice: worn for the lines, whole for
  // the glow under them. The wear is one seeded run through the lines in
  // this order, so every circle is worn alike.
  const drawing = (worn: boolean) => {
    const w = worn ? wear(5) : null;
    return {
      band: [ringParts(O, 97.5, { wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })].map(
        (parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1),
      ),
      straps: straps.flatMap((_, i) =>
        [1, -1].map((side) => stroke(lineParts(...edgeOf(i, side), { holes: starHoles, under: unders[i], wear: w }), 0.4 + i * 0.09, 0.5)),
      ),
      starRing: stroke(ringParts(O, STAR_RING, { holes: starHoles, wear: w }), 0.3, 0.9),
      rays: rays(w),
      sun: stroke(ringParts(O, SUN, { wear: w }), 0.15, 0.8),
      sunInner: stroke(ringParts(O, SUN - 1.6, { wear: w }), 0.2, 0.8),
      eyeRing: stroke(ringParts(O, EYE, { wear: w }), 0.05, 0.7),
    };
  };

  // The layers (lib/engraver), each drawn twice: worn for the lines, whole for the glow under them.
  const layers = (p: ReturnType<typeof drawing>) => ({
    band: engrave((e) => {
      p.band.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
      seals.forEach((seal, k) => {
        // (Luna rides the band upright, in a layer of her own.)
        if (k === LUNA_SEAL) return;
        const turn = turned(seal.a);
        e.seal(0.95 + k * 0.07, (q) => {
          const [x, y] = turn(q);
          return [seal.x + x, seal.y + y];
        }, `translate(${f(seal.x)} ${f(seal.y)}) rotate(${seal.a})`, seal.a, SEAL, 1.2, 0.5, [[seal.d, 'sign', 1.05]]);
      });
      SCRIPT.forEach((m, k) => {
        const turn = turned(m.a);
        e.mark(m.d, 1.15 + (k / SCRIPT.length) * 0.8, `rotate(${f(m.a)}) translate(0 -${BAND})`, (q) => turn([q[0], q[1] - BAND]), m.a);
      });
    }),
    star: engrave((e) => {
      e.pieces(p.starRing, 'thin');
      for (const edge of p.straps) e.pieces(edge, 'thin');
      for (const ray of p.rays) {
        e.pieces(ray.lines, 'hair');
        e.line(ray.hatch, 'hatch', ray.delay, 0.5);
      }
      e.line(FINE, 'hair', 1, 0.6);
    }),
    // The band's Luna, upright on the page as the band carries her round.
    bandLuna: engrave((e) => {
      const seal = seals[LUNA_SEAL];
      e.seal(0.95 + LUNA_SEAL * 0.07, (q) => [seal.x + q[0], seal.y + q[1]], `translate(${f(seal.x)} ${f(seal.y)})`, 0, SEAL, 1.2, 0.5, [[seal.d, 'sign', 1.05]]);
    }),
    // Sol's seal, upright as the star carries it round; his face in it
    // turning slowly sunwise.
    sol: engrave((e) => {
      const [sx, sy] = sol;
      e.seal(1, (q) => [sx + q[0], sy + q[1]], `translate(${f(sx)} ${f(sy)})`, 0, BIG, 1.6, 0.6, []);
    }),
    solFace: engrave((e) => {
      const at = (d: string) => mapPath(d, ([x, y]) => [sol[0] + x, sol[1] + y]);
      e.line(at(circlePath(5)) + at(circlePath(1.1)) + at(SOL_RAYS), 'sign', 1.3, 0.6);
    }),
    luna: engrave((e) => {
      const [lx, ly] = luna;
      e.seal(1.12, (q) => [lx + q[0], ly + q[1]], `translate(${f(lx)} ${f(ly)})`, 0, BIG, 1.6, 0.6, [
        [LUNA, 'sign', 1],
        [LUNA_HATCH, 'sign hatch', 1],
      ]);
    }),
    heart: engrave((e) => {
      e.pieces(p.eyeRing, 'thin');
      e.pieces(p.sun, 'thin');
      e.pieces(p.sunInner, 'hair');
      e.line(COMPASS, 'hair', 0.3, 0.9);
    }),
    glory: engrave((e) => e.line(GLORY, 'hair', 1.35, 0.7)),
  });
  const GLOW = layers(drawing(false));
  const LINES = layers(drawing(true));
  const layer = (name: keyof typeof LINES, spin?: StageLayer['spin'], more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], spin, ...more });
  // Each ring turns its own way and speed, and first winds into place; the
  // glory stays still, and Sol and Luna ride the star upright.
  const LAYERS = [
    layer('band', { turn: 240, from: -24 }),
    layer('star', { turn: 160, from: 40, reverse: true }),
    layer('bandLuna', undefined, { within: 'band', pivot: [seals[LUNA_SEAL].x, seals[LUNA_SEAL].y], upright: true }),
    layer('sol', undefined, { within: 'star', pivot: sol, upright: true }),
    layer('solFace', { turn: 180, from: 0 }, { within: 'sol', pivot: sol }),
    layer('luna', undefined, { within: 'star', pivot: luna, upright: true }),
    layer('heart', { turn: 100, from: -70 }),
    layer('glory'),
  ];

  // The eye, the same while drawn and after (it opens as a whole); `@id@`
  // stands for the circle's own id, which names its clip.
  const eye = (key: string) =>
    `<defs><clipPath id="@id@-${key}"><path d="${ALMOND}"/></clipPath></defs>` +
    `<g clip-path="url(#@id@-${key})"><g transform="translate(0 ${IRIS_Y})">` +
    `<circle r="${IRIS_R}" class="iris"/><circle r="${f(IRIS_R - 0.7)}" class="hatch"/>` +
    `<path d="${STREAKS}" class="hatch"/><path d="${COLLARETTE}" class="hatch"/><path d="${PUPIL}" class="pupil"/>` +
    `</g><path d="${SHADOW}" class="hatch"/></g>` +
    `<path d="${ALMOND}" class="lid"/><path d="${RIMS}" class="hatch"/><path d="${LID_HATCH}" class="hatch"/>`;
  const EYE_GLOW = eye('c');
  const EYE_LINES = eye('w');
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const uid = $props.id();
  const eyeGlow = EYE_GLOW.replaceAll('@id@', uid);
  const eyeLines = EYE_LINES.replaceAll('@id@', uid);
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the rings draw outward from the eye, the heptagram is traced strap by
  strap, the sun's rays shoot out, the planets are stamped round the band
  and the script written after them, and last of all the eye opens. Each
  layer winds into place meanwhile, and the glow swells up under it all.
-->

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength}>
  {#snippet heart()}
    <div class="layer eye">
      <svg class="glow" viewBox="-100 -100 200 200">{@html eyeGlow}</svg>
      <svg viewBox="-100 -100 200 200">{@html eyeLines}</svg>
    </div>
  {/snippet}
</ArcaneStage>

<style>
  .eye :global(.lid) {
    stroke-width: 0.45;
  }
  .eye :global(.iris) {
    stroke-width: 0.35;
  }
  .eye :global(.pupil) {
    fill: currentColor;
    fill-rule: evenodd;
    stroke: none;
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.9s var(--ease-out);
  }
  /* The eye widens at a right answer and narrows at a wrong one. */
  :global(.arcane.good) .eye :global(.pupil) {
    transform: scale(1.3);
  }
  :global(.arcane.bad) .eye :global(.pupil) {
    transform: scale(0.72);
  }

  /* The eye opens last, and now and then it blinks. */
  .eye {
    animation: open 0.8s 1.55s cubic-bezier(0.3, 1.35, 0.5, 1) both;
  }
  .eye svg {
    animation: blink 9s 5s infinite;
  }
  .eye .glow {
    animation:
      arcane-glow-in 1.4s 0.8s ease-out both,
      arcane-breathe 6s 2.2s ease-in-out infinite alternate,
      blink 9s 5s infinite;
  }

  @keyframes open {
    from {
      opacity: 0;
      scale: 1 0.05;
    }
    30% {
      opacity: 1;
    }
  }
  @keyframes blink {
    0%,
    94% {
      scale: 1 1;
    }
    95.5% {
      scale: 1 0.06;
    }
    97.5% {
      scale: 1 1;
    }
  }
</style>
