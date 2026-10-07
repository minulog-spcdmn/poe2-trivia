<script lang="ts">
  import { STRATA } from '../lib/descent';
  import { DELVE_LIVES, FINDS_FROM } from '../lib/delve';
  import { at, f, line, lerp, pt, ring, star8, subtract, wear, type Cut, type Hole, type Pt } from '../lib/arcane';
  import { sigilOf } from '../lib/zoneSigils';

  // The descent, as an alchemist would set it out on a plate: a measured
  // scheme, not a picture. An axis falls from a small sun at the top (the
  // surface) through ten roundels, one for each zone, strung on it like the
  // spheres of a cosmology, and ends in an ouroboros: past 100 the descent
  // has no end. The plate's right border is a graduated scale of the
  // depths, a tick for each, every fifth longer, every tenth (where one zone
  // gives way to the next) longest, with a dotted guide across to the axis;
  // 1, 50 and 100 are numbered. A zone you have reached is inked: a double
  // ring holding its sigil (the one on the zone gate's keystone,
  // lib/zoneSigils), its name in small spaced capitals on a label line. A
  // zone you haven't is still only set out in construction: a dotted circle
  // round a pricked centre, a dotted line where its name will go, so the
  // names stay a surprise. Your deepest is a small radiant mark on the scale
  // (at its top before a first run), a dotted index line running from it to
  // the roundel it lies in.
  // In the margin beyond the scale, a few short notes say what lies ahead
  // (three lives, finds, a new zone every ten, less time and trickier
  // questions deeper down, no end), never exactly what gets harder.
  // Drawn in the arcane style (docs/arcane-style.md): hairlines of exact
  // geometry, lines stopping short of what they meet, a little wear, a soft
  // glow under the inked lines; it inks itself in from the top down.
  // The plate is drawn in px at the size it's given: as wide as its column,
  // and as tall as the figure (which grows to the finds' height beside them,
  // and keeps its min-height when stacked), so it never leaves a gap.
  let { deepest = null, label = 'Your deepest' }: { deepest?: number | null; label?: string } = $props();

  let w = $state(0);
  let h = $state(0);

  /** The notes run from noteX to the plate's right edge; their pips sit just outside the scale. */
  const NOTE_W = 88;
  const noteX = $derived(w - NOTE_W);
  const pipX = $derived(noteX - 5);
  /** The scale: the plate's right border. The frame's other sides, a hair in from the figure's edges. */
  const SX = $derived(pipX - 5);
  const FL = 0.5;
  const FT = 0.5;
  const FB = $derived(h - 0.5);
  /** The frame's inner rule, IN inside the outer, its corners notched by an arc of radius NOTCH about the outer's. */
  const IN = 1.8;
  const NOTCH = 5;
  /** Depth 0, the surface, and the room below depth 100 for the ouroboros. */
  const TOP = 19;
  const BEYOND = 34;
  const BOTTOM = $derived(h - BEYOND);
  const band = $derived((BOTTOM - TOP) / 10);
  const step = $derived(band / 10);
  /** The roundels' radius, and the axis: just clear of the scale's numbers, and on a wide plate nearer the middle. */
  const R = $derived(Math.min(12, Math.max(6, band / 2 - 2.6)));
  const AX = $derived(Math.min(SX - 20 - R, Math.max(100 + R, SX * 0.56)));
  /** The ouroboros: its centre, and the middle of its body. */
  const OY = $derived(BOTTOM + BEYOND / 2 - 0.5);
  const OR = $derived(Math.min(BEYOND / 2 - 5, R + 2));
  /** The small sun at the top, where the descent begins. */
  const SUN_Y = (FT + TOP) / 2;
  const SUN_R = 3;

  /** Where depth `d` sits on the scale (the middle of its division); past 100, level with the ouroboros. */
  const y = (d: number) => (d > 100 ? OY : TOP + (d - 0.5) * step);
  /** The scale's division between depth `d` and the next. */
  const T = (d: number) => TOP + d * step;

  const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
  const ZONES = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), from: 10 * k + 1, sigil: sigilOf(z.name) }));

  const best = $derived(deepest && deepest > 0 ? Math.floor(deepest) : null);
  /** A zone is reached once a run has been as deep as its first depth; only then is it named, coloured and given its sigil. */
  const reached = $derived(ZONES.filter((z) => best !== null && best >= z.from).length);
  /** Your deepest on the scale: at its depth, or at the top before a first run. */
  const mark = $derived(best ? y(best) : TOP);
  /** The mark's radius. */
  const STAR = 4.8;

  /** When the pen, inking the axis from the top down, reaches `yy`. */
  const pen = (yy: number) => 0.25 + (1.15 * (yy - TOP)) / Math.max(1, h - TOP);

  /** Dots `gap` apart along the line from `p` to `q` (each a zero-length stroke, round-capped), none inside a hole. */
  function dotted(p: Pt, q: Pt, gap: number, holes: Hole[] = []): string {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.floor(len / gap);
    const pad = (len - n * gap) / 2;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const c = lerp(p, q, (pad + i * gap) / len);
      if (!holes.some((o) => Math.hypot(c[0] - o.c[0], c[1] - o.c[1]) < o.r)) d += `M${pt(c)}h0`;
    }
    return d;
  }
  /** Dots round a circle, about `gap` apart. */
  const dottedRing = (c: Pt, r: number, gap: number) => {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / gap));
    return Array.from({ length: n }, (_, i) => `M${pt(at(c, (i / n) * 360, r))}h0`).join('');
  };

  /** A straight line drawn as its pieces (between cuts and nicks), each timed by where it sits, so the pen sweeps once along the whole. */
  type Piece = { d: string; delay: number; dur: number };
  const pieces = (p: Pt, q: Pt, cuts: Cut[], when: (t: number) => number): Piece[] =>
    subtract(0, 1, cuts).map(([a, b]) => ({ d: `M${pt(lerp(p, q, a))}L${pt(lerp(p, q, b))}`, delay: when(a), dur: Math.max(0.02, when(b) - when(a)) }));

  /** The numbered depths on the scale, and the box (left, right) each number takes, which lines stop short of. */
  const NUMBERED = [1, 50, 100];
  const NUM_RIGHT = 6.5;
  const numBox = (d: number): [number, number] => [SX - NUM_RIGHT - (String(d).length * 3.9 + 1.4), SX - NUM_RIGHT + 1.2];
  /** A horizontal line from x0 to x1 at yy, as cuts round any number it would run through. */
  const numCuts = (x0: number, x1: number, yy: number): Cut[] =>
    NUMBERED.filter((d) => Math.abs(y(d) - yy) < 3.4).map((d) => {
      const [a, b] = numBox(d);
      return [(a - x0) / (x1 - x0), (b - x0) / (x1 - x0)];
    });

  /**
   * The ouroboros past 100: a serpent round the axis's end, its body
   * swelling from the tail to the neck, scaled down its outer side, its
   * head at the upper left with the tail's tip in its open jaws.
   * Angles run clockwise from the top; the body runs clockwise from the tail.
   */
  function ouroboros(c: Pt, rm: number) {
    const TAIL = 312;
    const NECK = 654;
    const SNOUT = 322 + 360;
    const hw = (a: number) => 0.22 + 1.3 * Math.pow((a - TAIL) / (NECK - TAIL), 0.8);
    const n = 96;
    const edge = (side: number) =>
      'M' +
      Array.from({ length: n + 1 }, (_, i) => {
        const a = TAIL + ((NECK - TAIL) * i) / n;
        return pt(at(c, a, rm + side * hw(a)));
      }).join('L');
    // The head: wider than the neck, tapering to the jaws, which open round the tail.
    const P = (a: number, dr: number) => at(c, a, rm + dr);
    const nw = hw(NECK);
    const head =
      `M${pt(P(NECK, nw))}Q${pt(P(NECK + 7, 2.9))} ${pt(P(NECK + 15, 2.3))}L${pt(P(SNOUT, 1.05))}` +
      `M${pt(P(NECK, -nw))}Q${pt(P(NECK + 7, -2.9))} ${pt(P(NECK + 15, -2.3))}L${pt(P(SNOUT, -1.05))}` +
      `M${pt(P(SNOUT, 1.05))}L${pt(P(NECK + 13, 0.2))}M${pt(P(SNOUT, -1.05))}L${pt(P(NECK + 13, -0.2))}`;
    const eye = P(NECK + 9, 1.2);
    // Scales: short strokes in from the outer edge, on the body's broader part.
    let scales = '';
    for (let a = TAIL + 40; a < NECK - 6; a += 10) {
      const t = hw(a);
      if (t > 0.55) scales += `M${pt(P(a, t - 0.25))}L${pt(P(a + 3, 0.05))}`;
    }
    return { body: edge(1) + edge(-1) + head, scales, eye };
  }

  const plate = $derived.by(() => {
    if (!w || !h) return null;
    // The roundels: centred on their zone, holes the axis and guides stop short of.
    const zones = ZONES.map((z, k) => {
      const yc = TOP + (k + 0.5) * band;
      const known = k < reached;
      return { ...z, k, yc, known, at: pen(yc - R) };
    });
    const holes: Hole[] = zones.map((z) => ({ c: [AX, z.yc], r: R + 1.4 }));
    // The axis, from the sun to the ouroboros, broken at every roundel: inked as far as you've been, dotted on from there.
    const axisTop = SUN_Y + SUN_R + 1.2;
    const axisEnd = OY - OR - 3.4;
    const inkTo = reached === 0 ? axisTop : reached === 10 && best! > 100 ? axisEnd : zones[reached - 1].yc;
    const len = axisEnd - axisTop;
    const cutsAt = (list: Hole[]): Cut[] => list.map((o) => [(o.c[1] - o.r - axisTop) / len, (o.c[1] + o.r - axisTop) / len]);
    const inked = (worn: boolean): Piece[] =>
      inkTo <= axisTop
        ? []
        : pieces([AX, axisTop], [AX, inkTo], [...cutsAt(holes), ...(worn ? wear(11)!(inkTo - axisTop) : [])], (t) => pen(axisTop + t * (inkTo - axisTop)));
    const axisDots = dotted([AX, Math.max(axisTop, inkTo)], [AX, axisEnd], 2.2, holes);
    // Inside the ouroboros the axis runs on, dotted, to a pricked centre.
    const innerAxis = dotted([AX, OY - OR + 2.2], [AX, OY - 1.6], 2);
    // The scale: the border's line, broken at your mark; a tick for every depth.
    const ruler = (worn: boolean) =>
      pieces([SX, FT], [SX, FB], [[(mark - STAR - 1 - FT) / (FB - FT), (mark + STAR + 1 - FT) / (FB - FT)], ...(worn ? wear(17)!(FB - FT) : [])], (t) => pen(FT + t * (FB - FT)));
    // The scale's divisions, zone by zone (the last also closing the scale at 100): a tick for every depth, every fifth longer;
    // every tenth, where one zone gives way to the next, longest, with a dotted guide across to the axis between the roundels.
    const clear = (yy: number) => Math.abs(yy - mark) >= STAR + 0.8;
    const tick = (yy: number, l: number) => (clear(yy) ? `M${f(SX)} ${f(yy)}H${f(SX - l)}` : '');
    const ticks = Array.from({ length: 11 }, (_, k) => {
      let minor = '';
      if (k < 10) for (let d = 10 * k + 1; d < 10 * k + 10; d++) minor += tick(T(d), d % 5 === 0 ? 2.8 : 1.7);
      const yy = T(10 * k);
      const [x0, x1] = [AX + 1.6, SX - 6.4];
      const guide =
        k === 0 || k === 10 || x1 - x0 < 3
          ? ''
          : subtract(0, 1, numCuts(x0, x1, yy))
              .map(([a, b]) => dotted([x0 + a * (x1 - x0), yy], [x0 + b * (x1 - x0), yy], 2.2))
              .join('');
      return { minor, major: tick(yy, 4.6), guide, at: pen(yy) };
    });
    // The surface: a hairline across the plate at depth 0, stopping short of the scale's "1".
    const surface = (worn: boolean) =>
      pieces([FL, TOP], [SX, TOP], [...numCuts(FL, SX, TOP + 2), ...(worn ? wear(5)!(SX - FL) : [])], (t) => 0.1 + 0.6 * t);
    // The frame's other three sides, ruled twice. The pen runs once round the outer rule, from the scale's head to its foot.
    const frame = (worn: boolean) => {
      const sides: [Pt, Pt][] = [
        [[SX, FT], [FL, FT]],
        [[FL, FT], [FL, FB]],
        [[FL, FB], [SX, FB]],
      ];
      const lens = sides.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]));
      const total = lens.reduce((a, b) => a + b);
      let run = 0;
      return sides.flatMap(([p, q], i) => {
        const [s0, l] = [run, lens[i]];
        run += l;
        return pieces(p, q, worn ? wear(3 + i)!(l) : [], (t) => (1.1 * (s0 + t * l)) / total);
      });
    };
    // The inner rule, its corners notched by a compass arc about the outer's.
    const [ix, iy0, iy1] = [FL + IN, FT + IN, FB - IN];
    const nx = Math.sqrt(NOTCH * NOTCH - IN * IN);
    const rule = [
      `M${f(SX)} ${f(iy0)}H${f(FL + nx)}`,
      `A${NOTCH} ${NOTCH} 0 0 1 ${f(ix)} ${f(FT + nx)}`,
      `V${f(FB - nx)}`,
      `A${NOTCH} ${NOTCH} 0 0 1 ${f(FL + nx)} ${f(iy1)}`,
      `H${f(SX)}`,
    ].join('');
    // Each zone's label line, from the frame to its roundel: inked under its name once reached, dotted until then.
    const labels = zones.map((z) => {
      const [x0, x1] = [FL + IN + 2.2, AX - R - 1.6];
      return z.known ? `M${f(x1)} ${f(z.yc)}H${f(x0)}` : dotted([x0, z.yc], [x1, z.yc], 2.2);
    });
    // The sun: a glory of sixteen fine rays about its ring, long and short in turn, none on the axis below it.
    const sunRays = Array.from({ length: 16 }, (_, k) => {
      const a = (k + 0.5) * 22.5;
      return line(at([AX, SUN_Y], a, SUN_R + 1.1), at([AX, SUN_Y], a, SUN_R + (k % 2 ? 2.2 : 3.4)));
    }).join('');
    // Your mark: an eight-pointed star on the scale, the scale stopping short of its points; and a dotted index line from it to the axis.
    const star = star8([SX, mark], STAR);
    const idxEnd = (() => {
      if (best === null) return null;
      if (best > 100) return AX + OR + 3.4;
      const z = zones[Math.min(9, Math.floor((best - 1) / 10))];
      const dy = Math.abs(mark - z.yc);
      return dy < R + 1.4 ? AX + Math.sqrt((R + 1.4) ** 2 - dy * dy) : AX + 1.4;
    })();
    const index = idxEnd !== null && SX - STAR - 1.6 - idxEnd > 2 ? dotted([SX - STAR - 1.6, mark], [idxEnd, mark], 1.6) : '';
    return { zones, inked, axisDots, innerAxis, rule, sunRays, ruler, ticks, surface, frame, labels, star, index };
  });

  const ouro = $derived(ouroboros([AX, OY], OR));

  // The notes: a few words each at about the depth they're about, nudged
  // apart where they would touch (the deepest's number never moves).
  const LINE = 10.5;
  /** How far (px) the italic words of a note sit above its depths' baseline: EB Garamond's italic reads low beside Cinzel's lining figures. */
  const RISE = 0.75;
  /** How far (px) a note's bullet drops, onto the middle of its words. */
  const DOT_DROP = 1.05;
  const GAP = 11.5;
  const LIVES = ['no', 'one', 'two', 'three', 'four', 'five'][DELVE_LIVES] ?? String(DELVE_LIVES);
  /** A note: its key (a word in italic, a depth in Cinzel), its few words (a line each), and the `y` it belongs at. */
  type Note = { id: string; word?: string; num?: string; lines: string[]; at: number; best?: boolean };
  const NOTES: Note[] = $derived([
    { id: 'lives', num: '1', lines: [`${LIVES} lives`], at: TOP - 8 },
    { id: 'finds', num: String(FINDS_FROM), lines: ['finds appear'], at: y(FINDS_FROM) },
    { id: 'zones', word: 'every', num: '10', lines: ['a new zone'], at: TOP + 2 * band },
    { id: 'deeper', word: 'deeper', lines: ['less time,', 'trickier questions'], at: y(60) },
    { id: 'endless', num: '100+', lines: ['endless'], at: BOTTOM + 3 },
  ]);
  /** The notes and your deepest, top to bottom, each at its `y`, none closer than GAP to the next. */
  function spread(notes: Note[]): (Note & { y: number })[] {
    const out = notes.map((n) => ({ ...n, y: n.at })).sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 80; pass++) {
      let moved = false;
      for (let i = 1; i < out.length; i++) {
        const [a, b] = [out[i - 1], out[i]];
        const over = a.y + Math.max(0, a.lines.length - 1) * LINE + GAP - b.y;
        if (over < 0.01) continue;
        moved = true;
        if (a.best) b.y += over;
        else if (b.best) a.y -= over;
        else [a.y, b.y] = [a.y - over / 2, b.y + over / 2];
      }
      if (!moved) break;
    }
    return out;
  }
  const notes = $derived(spread(best ? [...NOTES, { id: 'best', num: String(best), lines: [], at: mark, best: true }] : NOTES));

  const words = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
  const summary = $derived(
    [
      `The descent: ten zones of ten depths each, then on for ever.`,
      `${LIVES[0].toUpperCase() + LIVES.slice(1)} lives; finds turn up from depth ${FINDS_FROM}; the deeper, the less time and the trickier the questions.`,
      reached === 0
        ? 'No zone reached yet.'
        : reached === ZONES.length
          ? `Zones reached: all ten, ${ZONES.map((z) => z.name).join(', ')}.`
          : `Zones reached: ${ZONES.slice(0, reached)
              .map((z) => z.name)
              .join(', ')}; ${words(ZONES.length - reached)} more to find.`,
      best ? `${label}: depth ${best}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<!-- The inked lines, drawn twice: worn on top, whole and soft for the glow under them. -->
{#snippet ink(worn: boolean)}
  {#if plate}
    {#each [plate.frame(worn), plate.surface(worn), plate.ruler(worn)] as list, k (k)}
      {#each list as p, i (i)}
        <path class={['draw piece', k < 2 && 'hair', k === 0 && 'frame']} d={p.d} pathLength="100" style:--d="{p.delay.toFixed(3)}s" style:--t="{p.dur.toFixed(3)}s" />
      {/each}
    {/each}
    <path class="draw ring" d={ring([AX, SUN_Y], SUN_R)} pathLength="100" style:--d="0.1s" style:--t="0.4s" />
    {#each plate.inked(worn) as p, i (i)}
      <path class="draw piece" d={p.d} pathLength="100" style:--d="{p.delay.toFixed(3)}s" style:--t="{p.dur.toFixed(3)}s" />
    {/each}
    {#each plate.zones as z (z.k)}
      {#if z.known}
        <path class="draw ring" d={ring([AX, z.yc], R)} pathLength="100" style:--d="{z.at.toFixed(2)}s" style:--t="0.45s" />
      {/if}
    {/each}
    {#if best !== null && best > 100}
      <path class="draw" d={ouro.body} pathLength="100" style:--d="1.3s" style:--t="0.8s" />
    {/if}
  {/if}
{/snippet}

<figure class="descent" role="img" aria-label={summary} bind:clientWidth={w} bind:clientHeight={h}>
  {#if plate}
    <svg viewBox="0 0 {w} {h}" width={w} height={h} aria-hidden="true">
      <g class="glow">{@render ink(false)}</g>
      <g class="lines">{@render ink(true)}</g>

      <path class="draw rule" d={plate.rule} pathLength="100" style:--d="0.2s" style:--t="1.1s" />

      <!-- The sun at the top, where the descent begins: a ring round a point, in a glory of fine rays. -->
      <circle class="point" cx={AX} cy={SUN_Y} r="0.75" style:--d="0.3s" />
      <path class="sun-rays" d={plate.sunRays} />

      <!-- The scale's ticks, zone by zone as the pen comes down, and its numbers. -->
      {#each plate.ticks as t, k (k)}
        <g style:--d="{t.at.toFixed(2)}s">
          <path class="tick" d={t.minor} />
          <path class="tick major" d={t.major} />
          <path class="dots guide" d={t.guide} />
        </g>
      {/each}
      {#each NUMBERED as d (d)}
        {#if Math.abs(y(d) - mark) > 4}
          <text class="scale-num" x={SX - NUM_RIGHT} y={y(d)} style:--d="{pen(y(d)).toFixed(2)}s">{d}</text>
        {/if}
      {/each}

      <!-- The axis on from where you've been, still only dotted. -->
      <path class="dots axis-dots" d={plate.axisDots} style:--d="0.9s" />

      <!-- The zones: reached, a double ring round its sigil and its name on its line; not yet, a dotted circle round a pricked centre. -->
      {#each plate.zones as z (z.k)}
        {#if z.known}
          <g class="zone" style:--c={z.color} style:--d="{z.at.toFixed(2)}s">
            <path class="draw label" d={plate.labels[z.k]} pathLength="100" style:--d="{(z.at + 0.15).toFixed(2)}s" style:--t="0.5s" />
            <circle class="inner" cx={AX} cy={z.yc} r={R - 1.25} />
            <g class="sigil" transform="translate({f(AX)} {f(z.yc)}) scale({f((R - 2.7) / 10)})">
              <path class="fine" d={z.sigil.fine} />
              <path d={z.sigil.lines} />
            </g>
            <text class="name" x={AX - R - 5} y={z.yc - 1.9}>{z.name}</text>
          </g>
        {:else}
          <g class="unknown" style:--dim={(0.75 - (0.35 * (z.k - reached)) / Math.max(1, 9 - reached)).toFixed(3)} style:--d="{z.at.toFixed(2)}s">
            <path class="dots" d={dottedRing([AX, z.yc], R, 1.9)} />
            <path class="dots" d={plate.labels[z.k]} />
            <path class="dots centre" d="M{f(AX)} {f(z.yc)}h0" />
          </g>
        {/if}
      {/each}

      <!-- Past 100: the ouroboros, inked once you've been past it, else set out in dots; the axis runs on inside it. -->
      {#if best !== null && best > 100}
        <path class="scales" d={ouro.scales} />
        <circle class="eye" cx={ouro.eye[0]} cy={ouro.eye[1]} r="0.42" />
      {:else}
        <g class="unknown" style:--dim="0.4" style:--d="1.3s">
          <path class="dots" d={dottedRing([AX, OY], OR + 1, 1.9)} />
          <path class="dots" d={dottedRing([AX, OY], OR - 1, 1.9)} />
        </g>
      {/if}
      <path class="dots inner-axis" d={plate.innerAxis} style:--d="1.5s" />
      <path class="dots centre" d="M{f(AX)} {f(OY)}h0" style:--d="1.5s" />

      <!-- What lies ahead, in a few words. -->
      {#each notes as n (n.id)}
        <g class="note" class:best={n.best} style:--d="{n.best ? 1.7 : (0.45 + (n.y / h) * 0.9).toFixed(2)}s">
          {#if !n.best}<path class="pip" d="M{f(pipX - 1.6)} {f(n.y)}l1.6 -1.6l1.6 1.6l-1.6 1.6z" />{/if}
          <!-- The italic words ride RISE above the Cinzel depths' baseline, where they line up by eye. -->
          <text x={noteX} y={n.y - RISE}>
            {#if n.word}<tspan class="key">{n.word}</tspan>{/if}
            {#if n.num}<tspan class="num" dy={RISE}>{n.word ? ' ' : ''}{n.num}</tspan>{/if}
            {#if n.lines.length}<tspan class="dot" dy={(n.num ? -RISE : 0) + DOT_DROP}>{' • '}</tspan><tspan class="say" dy={-DOT_DROP}>{n.lines[0]}</tspan>{/if}
          </text>
          {#each n.lines.slice(1) as l, i (i)}
            <text class="say" x={noteX} y={n.y - RISE + (i + 1) * LINE}>{l}</text>
          {/each}
        </g>
      {/each}

      <!-- Your deepest: a radiant mark on the scale, and a dotted index line from it to where it lies. -->
      <path class="dots index" d={plate.index} />
      <g class="mark">
        <circle class="halo" cx={SX} cy={mark} r="5" />
        <path class="star" d={plate.star.outline} />
        <path class="ridges" d={plate.star.ridges} />
      </g>
    </svg>
  {/if}
</figure>

<style>
  /* As wide as its column; as tall as it's let grow (beside the finds), else its min-height. The plate is laid out to fit, so it isn't part of the flow. */
  .descent {
    position: relative;
    flex: 1 1 auto;
    min-height: var(--descent-min, 14.5rem);
    margin: 0;
    color: var(--gold);
  }
  svg {
    position: absolute;
    inset: 0;
    display: block;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.5;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .frame {
    opacity: 0.5;
  }
  .hair {
    stroke-width: 0.3;
    opacity: 0.7;
  }
  /* A ring has no ends, but its dash for the drawing does. */
  .ring {
    stroke-linecap: round;
  }
  .rule {
    stroke-width: 0.3;
    opacity: 0.35;
  }
  .sun-rays {
    stroke-width: 0.3;
    animation: carve 0.5s 0.4s var(--ease-out) both;
  }
  .glow path {
    stroke-width: 2;
    opacity: 0.13;
  }
  .glow .frame,
  .glow .hair {
    stroke-width: 1;
  }
  text {
    dominant-baseline: central;
  }

  /* The sun's point, and a construction's pricked centres. */
  .point {
    fill: currentColor;
    stroke: none;
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }

  /* The scale: hairline ticks, the tenths stronger; its numbers small in Cinzel. */
  .tick {
    stroke-width: 0.36;
    opacity: 0.9;
    animation: carve 0.35s var(--d) var(--ease-out) both;
  }
  .tick.major {
    stroke-width: 0.45;
    opacity: 1;
  }
  .scale-num {
    font-family: var(--font-cinzel);
    font-size: 5.6px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-anchor: end;
    fill: var(--gold-lo);
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }

  /* Construction not yet inked: dots, round-capped, faint. */
  .dots {
    stroke-width: 0.6;
    stroke-linecap: round;
    stroke: var(--muted);
    animation: carve 0.6s var(--d, 1s) var(--ease-out) both;
  }
  .guide {
    stroke: currentColor;
    stroke-width: 0.45;
    opacity: 0.4;
  }
  .axis-dots {
    stroke: currentColor;
    opacity: 0.55;
  }
  .inner-axis {
    stroke: currentColor;
    opacity: 0.45;
  }
  .dots.centre {
    stroke-width: 0.95;
  }
  .unknown {
    opacity: var(--dim);
    animation: dim-in 0.6s var(--d) var(--ease-out) both;
  }

  /* A zone reached: its rings in gold, its sigil and name in a pale wash of its colour. */
  .zone .inner {
    stroke-linecap: round;
    stroke-width: 0.3;
    opacity: 0.75;
    animation: carve 0.4s calc(var(--d) + 0.2s) var(--ease-out) both;
  }
  .label {
    stroke-width: 0.3;
    stroke: color-mix(in srgb, var(--c) 40%, var(--gold));
    opacity: 0.7;
  }
  .sigil {
    animation: carve 0.5s calc(var(--d) + 0.3s) var(--ease-out) both;
  }
  .sigil path {
    stroke: color-mix(in srgb, var(--c) 60%, #e3d3b4);
    stroke-width: 0.55px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sigil .fine {
    stroke-width: 0.38px;
  }
  .name {
    font-family: var(--font-display);
    font-size: 6.3px;
    letter-spacing: 0.17em;
    text-transform: uppercase;
    text-anchor: end;
    fill: color-mix(in srgb, var(--c) 55%, #d8c9a8);
    animation: carve 0.5s calc(var(--d) + 0.35s) var(--ease-out) both;
  }

  /* The ouroboros, inked. */
  .scales {
    stroke-width: 0.25;
    stroke-linecap: round;
    opacity: 0.8;
    animation: carve 0.5s 1.8s var(--ease-out) both;
  }
  .eye {
    fill: currentColor;
    stroke: none;
    animation: carve 0.5s 1.9s var(--ease-out) both;
  }

  /* The notes: a key in gold (depths in Cinzel), a few words in the body's italic. */
  .note {
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }
  .note text {
    font-size: 10.5px;
  }
  .num {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9px;
    fill: var(--gold);
  }
  .key {
    font-style: italic;
    fill: var(--gold);
  }
  /* The bullet sits high in the type's x-height: it is set DOT_DROP lower (dy), the words after back on the line. */
  .dot {
    fill: var(--gold-lo);
  }
  .say {
    font-style: italic;
    fill: #cfc2a8;
  }
  .pip {
    fill: var(--bg);
    stroke: var(--gold);
    stroke-width: 0.6;
  }
  .best .num {
    font-size: 10px;
    fill: var(--gold-hi);
  }

  /* Your deepest: the brightest thing on the plate. */
  .index {
    stroke: var(--gold-hi);
    stroke-width: 0.7;
    opacity: 0.75;
    animation-delay: 1.75s;
  }
  .mark {
    color: var(--gold-hi);
    animation: carve 0.5s 1.65s var(--ease-out) both;
  }
  .star {
    fill: var(--gold-hi);
    stroke: #fff4d6;
    stroke-width: 0.3;
  }
  .ridges {
    stroke: #8a6a2e;
    stroke-width: 0.25;
  }
  .halo {
    fill: var(--gold-hi);
    stroke: none;
    opacity: 0.18;
    filter: blur(2px);
    transform-box: fill-box;
    transform-origin: center;
    animation: breathe 5s 2.2s ease-in-out infinite alternate;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  /* A piece of a broken line: drawn at an even pace, so the pen runs on across the gaps. */
  .draw.piece {
    animation-timing-function: linear;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes dim-in {
    from {
      opacity: 0;
    }
  }
  @keyframes breathe {
    to {
      opacity: 0.3;
      transform: scale(1.15);
    }
  }
</style>
