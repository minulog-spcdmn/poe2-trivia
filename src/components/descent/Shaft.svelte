<script lang="ts">
  import { star8 } from '../../lib/arcane';
  import { DELVE_LIVES, DELVE_MIN_TIMER, FINDS_FROM, delveTimer } from '../../lib/delve';
  import {
    bestOf,
    f,
    glory,
    LAST,
    OUT,
    WALL,
    NOTE_LINE,
    NUM_RISE,
    pen,
    reachedOf,
    serpentLight,
    shaftLayout,
    STAR_R,
    starAt,
    ZONES,
  } from '../../lib/descentShaft';
  import { sigilOf } from '../../lib/zoneSigils';

  // The descent, engraved as a shaft (lib/descentShaft lays it out): sunk
  // from the surface through the ten zones, a band of rock each, down to an
  // ouroboros knotted in a sideways figure eight, for no end past 100. A
  // zone you have reached is named beside the shaft and its rock takes its
  // colour; the rest lie under one bracket, "uncharted", so nothing is
  // spoiled. An eight-pointed star in a glory marks your deepest in the
  // shaft, its depth set over it: in its zone's band, clear of the seams;
  // in the serpent's lap past 100, where the serpent lights up from under
  // it, further the deeper; at the mouth, unlit, before a first run. A few
  // notes in the margin say what lies ahead.
  // In the arcane style (docs/arcane-style.md): fine exact lines that stop
  // short of each other and of every word, one-sided hatching, a few nicks
  // of wear, a soft glow under the lines, breathing. It inks itself in from
  // the surface down; after that a new deepest only moves the star.
  let { deepest = null }: { deepest?: number | null } = $props();

  let w = $state(0);
  let h = $state(0);

  const LIVES = ['no', 'one', 'two', 'three', 'four', 'five'][DELVE_LIVES] ?? String(DELVE_LIVES);
  /** The first depth on the shortest clock. */
  const FAST_FROM = Array.from({ length: 200 }, (_, i) => i + 1).find((d) => delveTimer(d) <= DELVE_MIN_TIMER) ?? 100;
  const START = delveTimer(1);

  const L = $derived(w > 0 && h > 0 ? shaftLayout(w, h, LIVES, FINDS_FROM, FAST_FROM, START, DELVE_MIN_TIMER) : null);
  const best = $derived(bestOf(deepest));
  const reached = $derived(reachedOf(deepest));
  const star = $derived(L ? starAt(L, deepest) : null);
  const lit = $derived(serpentLight(deepest));
  const STAR = star8([0, 0], STAR_R);
  /** A reached zone's sigil, wide: its radius. */
  const SIGIL_R = 5.6;
  const GLORY = glory();
  /** The depth over the star: in the shaft it has the lining's width (100 just fits); past 100 it is set under the shaft, where there is room. */
  const depthSize = $derived(best === null ? 11 : best === LAST ? 10 : best < 1000 ? 11 : 10);

  /** The zones not reached yet, under one bracket. */
  const uncharted = $derived.by(() => {
    if (!L || reached >= ZONES.length) return null;
    const [y0, y1] = [L.S + reached * L.band + 2.2, L.foot - 2.2];
    const x = L.nameX - 1.5;
    const tick = (y: number) => `M${f(x)} ${f(y)}H${f(L.nameX + 1.6)}`;
    return { d: y1 - y0 > L.band * 1.2 ? `${tick(y0)}${tick(y1)}M${f(x)} ${f(y0)}V${f(y1)}` : '', x: y1 - y0 > L.band * 1.2 ? x - 4.5 : L.nameX, y: (y0 + y1) / 2 };
  });

  // The entrance: the surface, then the walls down, the rock band by band behind the pen, the serpent round, the star last.
  const WALLS_AT = 0.15;
  const WALLS_T = 1.15;
  const SERPENT_AT = 0.95;
  const STAR_AT = 1.75;
  const sec = (s: number) => `${s.toFixed(3)}s`;
  // Once in, what a new deepest brings (a zone's name and sigil, the depth over the star) fades in at once, not in the entrance's turn.
  let settled = $state(false);
  $effect(() => {
    const t = setTimeout(() => (settled = true), 2600);
    return () => clearTimeout(t);
  });
  const late = (s: number) => (settled ? '0s' : sec(s));
  /** When the pen going down the walls passes `y`. */
  const passes = (y: number) => (L ? WALLS_AT + (1 - Math.sqrt(1 - Math.min(1, Math.max(0, y / L.h)))) * WALLS_T : 0);

  const uid = $props.id();
  const words = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
  const summary = $derived(
    [
      'The descent: ten zones of ten depths, then on without end.',
      `${LIVES[0].toUpperCase() + LIVES.slice(1)} lives each; finds from depth ${FINDS_FROM}; ${START} seconds to answer at first, ${DELVE_MIN_TIMER} from depth ${FAST_FROM}, and trickier questions the deeper you go.`,
      reached === 0
        ? 'All ten zones are uncharted.'
        : reached === ZONES.length
          ? `Zones reached: all ten, ${ZONES.map((z) => z.name).join(', ')}.`
          : `Zones reached: ${ZONES.slice(0, reached)
              .map((z) => z.name)
              .join(', ')}; ${words(ZONES.length - reached)} more uncharted.`,
      best ? `Your deepest: depth ${best}${best > LAST ? ', past the zones' : ''}.` : 'No run yet.',
    ].join(' '),
  );
</script>

{#snippet frame(worn: boolean)}
  {#if L}
    {#each worn ? pen(L.surface, 0, 0.5) : [{ d: L.surface.map((p) => p.d).join(''), delay: 0, t: 0.5 }] as s, i (i)}
      <path class="main draw" d={s.d} pathLength="100" style:--d={sec(s.delay)} style:--t={sec(s.t)} />
    {/each}
    {#each worn ? pen(L.walls, WALLS_AT, WALLS_T) : [{ d: L.walls.map((p) => p.d).join(''), delay: WALLS_AT, t: WALLS_T }] as s, i (i)}
      <path class="main draw" d={s.d} pathLength="100" style:--d={sec(s.delay)} style:--t={sec(s.t)} />
    {/each}
    <path class="thin draw" d={L.lining} pathLength="100" style:--d={sec(WALLS_AT + 0.1)} style:--t={sec(WALLS_T)} />
  {/if}
{/snippet}

<figure class="shaft" role="img" aria-label={summary} bind:clientWidth={w} bind:clientHeight={h}>
  {#if L && star}
    {@const sp = L.serpent}
    <!-- The glow: the main lines again, whole, wide and soft, under the plate; on the serpent only where it is lit. It breathes. -->
    <svg class="glow" viewBox="0 0 {f(L.w)} {f(L.h)}" aria-hidden="true">
      <defs>
        <mask id="{uid}-glowlit" maskUnits="userSpaceOnUse" x="0" y="0" width={L.w} height={L.h}>
          {#each sp.light as d, i (i)}
            <path class="light" {d} pathLength="100" style:stroke-dashoffset={100 - lit * 100} />
          {/each}
        </mask>
      </defs>
      {@render frame(false)}
      <path class="hair" d={L.seams} />
      {#if lit > 0}
        <g class="lit-in" style:--d={sec(SERPENT_AT + 0.9)} mask="url(#{uid}-glowlit)">
          <path class="main" d={sp.outline.map((p) => p.d).join('')} />
        </g>
      {/if}
    </svg>

    <svg class="plate" viewBox="0 0 {f(L.w)} {f(L.h)}" aria-hidden="true">
      <defs>
        <mask id="{uid}-lit" maskUnits="userSpaceOnUse" x="0" y="0" width={L.w} height={L.h}>
          {#each sp.light as d, i (i)}
            <path class="light" {d} pathLength="100" style:stroke-dashoffset={100 - lit * 100} />
          {/each}
        </mask>
      </defs>

      <!-- The rock beside the shaft, a band per zone: in the zone's colour once reached, dull rock until then, darker deeper down. -->
      {#each L.rock as r, k (k)}
        {@const known = k < reached}
        <g class="band" class:known class:here={star.zone === k} style:--c={known ? ZONES[k].color : null} style:--k={k} style:--d={sec(passes(r.y0) + 0.05)}>
          <path class="tint" d="M{f(L.X - OUT)} {f(r.y0)}H{f(L.X - WALL)}V{f(r.y1)}H{f(L.X - OUT)}zM{f(L.X + WALL)} {f(r.y0)}H{f(L.X + OUT)}V{f(r.y1)}H{f(L.X + WALL)}z" />
          <path class="hatch" d={r.hatch} />
        </g>
      {/each}
      <path class="hair edge" d={L.seams + L.edges} style:--d={sec(passes(L.S) + 0.1)} />
      {@render frame(true)}

      <!-- The zones reached, named; the rest under one bracket. -->
      {#each ZONES as z, k (k)}
        {#if k < reached}
          <text class="name" class:here={star.zone === k} x={f(L.nameX)} y={f(L.S + (k + 0.5) * L.band + 3.3)} style:--c={z.color} style:--d={late(passes(L.S + k * L.band) + 0.2)}>{z.name}</text>
          {#if L.sigilX !== null}
            {@const g = sigilOf(z.name)}
            <g class="sigil" style:--c={z.color} style:--d={late(passes(L.S + k * L.band) + 0.3)} transform="translate({f(L.sigilX)} {f(L.S + (k + 0.5) * L.band)}) scale({f(SIGIL_R / 10)})">
              {#if g.shade}<path class="s-shade" d={g.shade} />{/if}
              <path class="s-fine" d={g.fine} />
              <path d={g.lines} />
            </g>
          {/if}
        {/if}
      {/each}
      {#if uncharted}
        <g class="uncharted" style:--d={sec(passes(L.foot) + 0.1)}>
          {#if uncharted.d}<path d={uncharted.d} />{/if}
          <text style:transform="translate({f(uncharted.x)}px, {f(uncharted.y + 3.6)}px)">uncharted</text>
        </g>
      {/if}

      <!-- The ouroboros, dull until a run has passed 100, then lit from under the star outward, further the deeper. -->
      {#snippet serpent(cls: string, draw: boolean)}
        <g class="serpent {cls}">
          {#each draw ? pen(sp.outline, SERPENT_AT, 1.0) : [{ d: sp.outline.map((p) => p.d).join(''), delay: 0, t: 0 }] as s, i (i)}
            <path class="main" class:draw d={s.d} pathLength={draw ? 100 : undefined} style:--d={sec(s.delay)} style:--t={sec(s.t)} />
          {/each}
          <g class="detail" style:--d={sec(SERPENT_AT + 0.75)}>
            <path class="scales" d={sp.scales} />
            <path class="belly" d={sp.belly} />
            <path class="scales" d={sp.head} />
            <circle class="eye" cx={f(sp.eye[0])} cy={f(sp.eye[1])} r={f(sp.eyeR)} />
            <path class="pupil" d={sp.pupil} />
          </g>
        </g>
      {/snippet}
      {@render serpent('dull', true)}
      {#if lit > 0}
        <g class="lit-in" style:--d={sec(SERPENT_AT + 0.9)}><g mask="url(#{uid}-lit)">{@render serpent('lit', false)}</g></g>
      {/if}

      <!-- What lies ahead, in a few words: italic words and Cinzel figures on one baseline. -->
      {#each L.notes as n (n.id)}
        <g class="note" style:--d={sec(0.4 + (n.y / L.h) * 1.1)}>
          {#each n.lines as line, i (i)}
            <text x={f(n.x)} y={f(n.y + i * NOTE_LINE)} text-anchor={n.anchor}>
              {#each line as run, j (j)}<tspan class:num={run.num}>{run.text}</tspan>{/each}
            </text>
          {/each}
        </g>
      {/each}

      <!-- Your deepest: an eight-pointed star in a glory of fine rays, its depth over it. It moves; nothing else is drawn again. -->
      <g class="star {star.at}" style:transform="translate({f(star.p[0])}px, {f(star.p[1])}px)">
        <g class="stamp" style:--d={sec(STAR_AT)}>
          <circle class="halo" r="7.5" />
          <path class="glory" d={GLORY} />
          <path class="ground" d={STAR.outline} />
          <path class="star-hatch" d={STAR.hatch} />
          <path class="star-line" d={STAR.outline} />
          <path class="star-ridge" d={STAR.ridges} />
        </g>
        {#if best}
          <text class="depth" y={f(-NUM_RISE)} style:font-size="{depthSize}px" style:letter-spacing={best < 100 ? null : '0'} style:--d={late(STAR_AT + 0.25)}>{best}</text>
        {/if}
      </g>
    </svg>
  {/if}
</figure>

<style>
  /* As wide as its column; as tall as the finds beside it, or its min-height when stacked. The plate is drawn to fit. */
  .shaft {
    position: relative;
    flex: 1 1 auto;
    min-height: 13.5rem;
    margin: 0;
    color: var(--gold);
    --dull: #6f6453;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .main {
    stroke-width: 0.8;
  }
  .thin {
    stroke-width: 0.5;
  }
  .hair {
    stroke-width: 0.4;
  }

  /* The glow: the same lines, wide and faint, under them, breathing. */
  .glow {
    opacity: 0.28;
    filter: blur(0.6px);
    animation:
      glow-in 1.3s 0.8s ease-out both,
      breathe 6s 2.1s ease-in-out infinite alternate;
  }
  .glow .main {
    stroke-width: 2.4;
  }
  .glow .thin,
  .glow .hair {
    stroke-width: 1.3;
  }
  .light {
    stroke: #fff;
    stroke-width: 14;
    stroke-linecap: round;
    stroke-dasharray: 100 100;
    transition: stroke-dashoffset 0.9s var(--ease-out);
  }

  /* The rock: hatched down one way, in a reached zone's colour, dull and darker deeper where uncharted. */
  .band {
    animation: carve 0.45s var(--d) var(--ease-out) both;
  }
  .hatch {
    stroke: var(--dull);
    stroke-width: 0.36;
    stroke-linecap: round;
    opacity: calc(0.62 - var(--k) * 0.03);
    transition:
      stroke 0.6s,
      opacity 0.6s;
  }
  .known .hatch {
    stroke: color-mix(in srgb, var(--c) 62%, #d9b878);
    opacity: 0.85;
  }
  .tint {
    stroke: none;
    fill: var(--c, transparent);
    opacity: 0;
    transition: opacity 0.6s;
  }
  .known .tint {
    opacity: 0.1;
  }
  .here .tint {
    opacity: 0.2;
  }
  .edge {
    stroke: var(--gold-lo);
    animation: carve 0.6s var(--d) var(--ease-out) both;
  }

  text {
    font-family: var(--font-body);
  }
  /* A reached zone's name, in the display face, in a pale wash of its colour; the star's zone brighter. */
  .name {
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.04em;
    text-anchor: end;
    fill: color-mix(in srgb, var(--c) 48%, #d9c9a8);
    animation: carve 0.5s var(--d) var(--ease-out) both;
    transition: fill 0.4s;
  }
  .name.here {
    fill: color-mix(in srgb, var(--c) 32%, #fbecc6);
  }
  /* A reached zone's sigil (lib/zoneSigils), fine lines in a pale wash of its colour. */
  .sigil {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .sigil path {
    stroke: color-mix(in srgb, var(--c) 55%, #e8d6ae);
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sigil .s-fine {
    stroke-width: 0.45px;
  }
  .sigil .s-shade {
    stroke: color-mix(in srgb, var(--c) 45%, #b08a4c);
    stroke-width: 0.35px;
  }
  .uncharted {
    animation: carve 0.6s var(--d) var(--ease-out) both;
  }
  .uncharted path {
    stroke: var(--muted);
    stroke-width: 0.45;
    opacity: 0.8;
  }
  .uncharted text {
    font-style: italic;
    font-size: 12px;
    text-anchor: end;
    fill: var(--muted);
    transition: transform 0.5s var(--ease-out);
  }

  /* The serpent: dull, its lines in the rock's colour; lit, in gold. */
  .serpent .main {
    stroke-width: 0.75;
  }
  .serpent.dull {
    color: #8a7a5c;
  }
  .serpent.lit {
    color: var(--gold-hi);
  }
  .scales,
  .belly,
  .pupil {
    stroke-width: 0.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .belly {
    stroke-width: 0.34;
    opacity: 0.85;
  }
  .eye {
    stroke-width: 0.45;
  }
  .lit-in {
    animation: carve 0.8s var(--d) ease-out both;
  }
  .detail {
    animation: carve 0.6s var(--d) var(--ease-out) both;
  }

  /* The notes: words in the body's italic, figures in Cinzel, on one baseline. */
  .note {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .note text {
    font-size: 12px;
    font-style: italic;
    fill: #cbbd9f;
  }
  .note .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 10.5px;
    fill: var(--gold);
  }

  /* The star: the brightest thing on the plate; it moves to a new deepest, eased. */
  .star {
    transition: transform 0.55s var(--ease-out);
  }
  .halo {
    stroke: none;
    fill: var(--gold-hi);
    opacity: 0.22;
    filter: blur(3px);
    transition: opacity 0.5s;
  }
  .glory {
    stroke: var(--gold-hi);
    stroke-width: 0.4;
    transition: opacity 0.5s;
  }
  .ground {
    fill: var(--bg);
    stroke: none;
  }
  .star-line {
    stroke: var(--gold-hi);
    stroke-width: 0.6;
  }
  .star-ridge {
    stroke: var(--gold-hi);
    stroke-width: 0.4;
  }
  .star-hatch {
    stroke: var(--gold-hi);
    stroke-width: 0.3;
    stroke-linecap: round;
  }
  .star path {
    transition: stroke 0.5s;
  }
  /* Before a first run: a dull impression at the mouth, unlit. */
  .rest .halo,
  .rest .glory {
    opacity: 0;
  }
  .rest .star-line,
  .rest .star-ridge,
  .rest .star-hatch {
    stroke: var(--gold-lo);
  }
  .depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.02em;
    text-anchor: middle;
    fill: var(--gold-hi);
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }

  /* Lines draw themselves (each piece in its turn, lib/descentShaft pen()); the star is stamped in. */
  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) linear both;
  }
  .stamp {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.55s var(--d) var(--ease-out) both;
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
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.6);
    }
  }
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.45;
    }
    to {
      opacity: 0.28;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.28;
    }
    to {
      opacity: 0.12;
    }
  }
</style>
