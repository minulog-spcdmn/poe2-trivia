<script lang="ts">
  import { SOL_RAYS, HEPTAGRAM } from '../lib/alchemy';
  import { DELVE_LIVES, FINDS_FROM, shownDepth } from '../lib/delve';
  import { descentPlate, f, LINE, ZONES } from '../lib/descentPlate';

  // The descent, engraved (lib/descentPlate draws it): Sol over the mouth of
  // a pit that narrows down through the ten zones, a terrace each, to an
  // ouroboros under its foot, for no end past 100. A zone you have reached
  // holds its sigil in a seal struck in its colour, and is named in the
  // margin; one you haven't is a dull, empty impression, its name still in
  // a script nobody can read, so nothing is spoiled. A star in a glory of
  // rays marks your deepest (at the mouth before a first run), its number
  // beside it among the notes, which say what lies ahead.
  // In the arcane style (docs/arcane-style.md): fine exact lines that stop
  // short of every seal, sign and word, one-sided hatching, a little wear, a
  // soft glow under the lit lines. It draws itself in from the surface down
  // as one sweep of the pen; the seals are stamped in as it passes them, the
  // ouroboros is drawn round, and the star lights last, its glow breathing.
  // The plate is laid out for the box it is given: as tall as the finds
  // beside it, or (stacked on a phone) as its min-height.
  let { deepest = null, label = 'Your deepest' }: { deepest?: number | null; label?: string } = $props();

  let w = $state(0);
  let h = $state(0);

  const LIVES = ['no', 'one', 'two', 'three', 'four', 'five'][DELVE_LIVES] ?? String(DELVE_LIVES);
  const plate = $derived(w > 0 && h > 0 ? descentPlate(w, h, deepest, LIVES, FINDS_FROM) : null);
  const best = $derived(deepest && deepest > 0 ? Math.floor(deepest) : null);
  const reached = $derived(ZONES.filter((z) => best !== null && best >= z.from).length);

  /** How far (px) the italic words of a note sit above its depths' baseline: EB Garamond's italic reads low beside Cinzel's lining figures. */
  const RISE = 0.75;
  /** How far (px) a note's bullet drops, onto the middle of its words. */
  const DOT_DROP = 1.05;
  const sec = (s: number) => `${s.toFixed(3)}s`;

  const words = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
  const summary = $derived(
    [
      `The descent: ten zones of ten depths, then it goes on forever.`,
      `You have ${LIVES} lives. Finds turn up from depth ${shownDepth(FINDS_FROM)}. The deeper you go, the less time you get and the trickier the questions.`,
      reached === 0
        ? 'All ten zones are uncharted.'
        : reached === ZONES.length
          ? `Zones reached: all ten, ${ZONES.map((z) => z.name).join(', ')}.`
          : `Zones reached: ${ZONES.slice(0, reached)
              .map((z) => z.name)
              .join(', ')}. ${ZONES.length - reached === 1 ? 'The last one is' : `The other ${words(ZONES.length - reached)} are`} uncharted.`,
      best ? `${label}: depth ${shownDepth(best)}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<figure class="descent" role="img" aria-label={summary} bind:clientWidth={w} bind:clientHeight={h}>
  {#if plate}
    {@const p = plate}
    <!-- The glow: the lit lines again, whole, wide and soft, under the plate. It breathes. -->
    <svg class="glow" viewBox="0 0 {f(p.w)} {f(p.h)}" aria-hidden="true">
      {#each p.parts as part, i (i)}
        {#each part.glow as g, j (j)}<path d={g.d} class="{g.kind} {part.tone}" style:--c={part.color} />{/each}
      {/each}
      {#each p.seals as s (s.k)}
        {#if s.known}<circle class="light" cx={s.c[0]} cy={s.c[1]} r={s.r} style:--c={s.color} />{/if}
      {/each}
      <circle class="light sun" cx={p.sol.c[0]} cy={p.sol.c[1]} r={p.sol.r} />
      {#if p.ouro.lit}<circle class="light sun" cx={p.ouro.c[0]} cy={p.ouro.c[1]} r={p.ouro.inner} />{/if}
    </svg>

    <svg class="plate" viewBox="0 0 {f(p.w)} {f(p.h)}" aria-hidden="true">
      {#each p.shades as s, i (i)}
        <path class="shade draw {s.tone}" d={s.d} style:--c={s.color} style:--d={sec(s.delay)} style:--t={sec(s.t)} pathLength="100" />
      {/each}
      {#each p.parts as part, i (i)}
        <g class={part.tone} style:--c={part.color}>
          {#each part.strokes as s, j (j)}
            <path d={s.d} class="draw {s.kind}" style:--d={sec(s.delay)} style:--t={sec(s.t)} pathLength="100" />
          {/each}
        </g>
      {/each}

      <!-- Sol over the mouth: a disc with a point at its heart and twelve rays, long and short in turn (lib/alchemy). -->
      <g class="stamp" style:--d="0.05s">
        <g class="sign sol" transform="translate({f(p.sol.c[0])} {f(p.sol.c[1])}) scale({f((p.sol.r - 1.3) / 11.4)})">
          <circle r="5" />
          <circle r="1.1" class="point" />
          <path d={SOL_RAYS} />
        </g>
      </g>

      <!-- The seals: a reached zone's sigil, struck in its colour; an empty hollow for one not reached. -->
      {#each p.seals as s (s.k)}
        <g class="stamp" style:--d={sec(s.delay)}>
          {#if s.sigil}
            <g class="sigil" style:--c={s.color} transform="translate({f(s.c[0])} {f(s.c[1])}) scale({f((s.r - 2.2) / 10)})">
              {#if s.sigil.shade}<path class="s-shade" d={s.sigil.shade} />{/if}
              <path class="s-fine" d={s.sigil.fine} />
              <path d={s.sigil.lines} />
            </g>
          {:else}
            <path class="hollow" d={s.hollow} />
          {/if}
        </g>
      {/each}
      {#each p.names as n (n.text)}
        <text class="name" x={f(n.x)} y={f(n.y)} style:--c={n.color} style:--d={sec(n.delay)}>{n.text}</text>
      {/each}
      {#each p.marks as m, i (i)}
        <path class="mark" d={m.d} transform="translate({f(m.x)} {f(m.y)})" style:--d={sec(m.delay)} />
      {/each}

      <!-- The ouroboros: its scales and eye; the {7/2} star of the seven metals inside it until your star is there. -->
      <g class="ouro" class:lit={p.ouro.lit} style:--d={sec(p.ouro.delay + 0.75)}>
        <path class="scales" d={p.ouro.scales} />
        <circle class="eye" cx={f(p.ouro.eye[0])} cy={f(p.ouro.eye[1])} r="0.6" />
        {#if !p.ouro.lit}
          <path class="sign inner" d={HEPTAGRAM} transform="translate({f(p.ouro.c[0])} {f(p.ouro.c[1])}) scale({f((p.ouro.inner - 1.6) / 4.2)})" />
        {/if}
      </g>

      <!-- What lies ahead, in a few words; and your deepest, beside the star. -->
      {#each p.notes as n (n.id)}
        <g class="note" class:best={n.best} style:--d={sec(n.best ? p.star.delay + 0.2 : 0.45 + (n.y / p.h) * 0.9)}>
          <!-- The italic words ride RISE above the Cinzel depths' baseline, where they line up by eye. -->
          <text x={f(n.best ? p.bestX : p.noteX)} y={f(n.y - RISE)}>
            {#if n.word}<tspan class="key">{n.word}</tspan>{/if}
            {#if n.num}<tspan class="num" dy={RISE}>{n.word ? ' ' : ''}{n.num}</tspan>{/if}
            {#if n.lines.length}<tspan class="dot" dy={(n.num ? -RISE : 0) + DOT_DROP}>{' • '}</tspan><tspan class="say" dy={-DOT_DROP}>{n.lines[0]}</tspan>{/if}
          </text>
          {#each n.lines.slice(1) as l, i (i)}
            <text class="say" x={f(p.noteX)} y={f(n.y - RISE + (i + 1) * LINE)}>{l}</text>
          {/each}
        </g>
      {/each}
      {#each p.pips as q, i (i)}
        <path class="pip" d="M{f(q[0] - 1.7)} {f(q[1])}l1.7 -1.7l1.7 1.7l-1.7 1.7z" style:--d={sec(0.45 + (q[1] / p.h) * 0.9)} />
      {/each}

      <!-- Your deepest: an eight-pointed star, hatched down one side of each point, in a glory of fine rays. -->
      <g class="star" style:--d={sec(p.star.delay)}>
        <circle class="halo" cx={f(p.star.c[0])} cy={f(p.star.c[1])} r="7.5" />
        <path class="glory draw" d={p.star.glory} pathLength="100" style:--d={sec(p.star.delay + 0.15)} style:--t="0.45s" />
        <g class="stamp" style:--d={sec(p.star.delay)}>
          <path class="star-ground" d={p.star.outline} />
          <path class="star-hatch" d={p.star.hatch} />
          <path class="star-line" d={p.star.outline} />
          <path class="star-ridge" d={p.star.ridges} />
        </g>
      </g>
    </svg>
  {/if}
</figure>

<style>
  /* As wide as its column, as tall as it is let grow (beside the finds) or its min-height; the plate is drawn to fit, outside the flow. */
  .descent {
    position: relative;
    flex: 1 1 auto;
    min-height: var(--descent-min, 15.5rem);
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
  .gold {
    stroke: var(--gold);
  }
  .dull,
  .dull path {
    stroke: var(--dull);
  }
  .zone path,
  path.zone {
    stroke: color-mix(in srgb, var(--c) 55%, #d9a45a);
  }
  .main {
    stroke-width: 0.8;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.42;
  }

  /* The glow: the same lines, wide and faint, under them, breathing; a soft light in each reached seal and in Sol. */
  .glow {
    opacity: 0.28;
    filter: blur(0.5px);
    animation:
      glow-in 1.2s 0.9s ease-out both,
      breathe 6s 2.1s ease-in-out infinite alternate;
  }
  .glow path {
    stroke-width: 2.2;
  }
  .glow .thin,
  .glow .hair {
    stroke-width: 1.2;
  }
  .light {
    stroke: none;
    fill: color-mix(in srgb, var(--c, var(--gold)) 70%, transparent);
    filter: blur(2.5px);
    opacity: 0.55;
  }
  .light.sun {
    fill: var(--gold);
    opacity: 0.4;
  }

  /* Shading: in a reached zone's colour, dull below, gold on the ground. */
  .shade {
    stroke-width: 0.36;
    stroke-linecap: round;
    stroke: var(--dull);
    opacity: 0.75;
  }
  .shade.zone {
    stroke: color-mix(in srgb, var(--c) 45%, #b08a4c);
    opacity: 0.85;
  }
  .shade.gold {
    stroke: var(--gold);
    opacity: 0.7;
  }

  /* Signs, drawn at a scale, keep a fine line. */
  .sign,
  .sign *,
  .sigil path,
  .mark {
    stroke-width: 0.55px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sol * {
    stroke: var(--gold-hi);
  }
  .sol .point {
    fill: var(--gold-hi);
  }
  .sigil path {
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.6px;
    animation: carve 0.5s calc(var(--d) + 0.3s) var(--ease-out) both;
  }
  .sigil .s-fine {
    stroke-width: 0.42px;
  }
  .sigil .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.32px;
  }
  .hollow {
    stroke: var(--dull);
    stroke-width: 0.32;
    stroke-linecap: round;
  }
  .mark {
    stroke: var(--dull);
    stroke-width: 0.5px;
    animation: carve 0.3s var(--d) var(--ease-out) both;
  }

  text {
    dominant-baseline: central;
  }
  /* A reached zone's name, in the display face's small spaced capitals, in a pale wash of its colour. */
  .name {
    font-family: var(--font-display);
    font-size: 7.6px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-anchor: end;
    fill: color-mix(in srgb, var(--c) 55%, #e3d3b4);
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }

  .ouro {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .scales {
    stroke: var(--dull);
    stroke-width: 0.36;
    stroke-linecap: round;
  }
  .eye {
    fill: var(--dull);
    stroke: none;
  }
  .inner {
    stroke: var(--dull);
  }
  .ouro.lit .scales {
    stroke: var(--gold);
  }
  .ouro.lit .eye {
    fill: var(--gold-hi);
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
  .best .num {
    font-size: 10px;
    fill: var(--gold-hi);
  }
  .pip {
    fill: var(--bg);
    stroke: var(--gold);
    stroke-width: 0.6;
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }

  /* The star: the brightest thing on the plate, its halo breathing. */
  .halo {
    stroke: none;
    fill: var(--gold-hi);
    opacity: 0.2;
    filter: blur(3px);
    animation:
      carve 0.6s var(--d) var(--ease-out) both,
      breathe-halo 6s calc(var(--d) + 0.6s) ease-in-out infinite alternate;
  }
  .glory {
    stroke: var(--gold-hi);
    stroke-width: 0.42;
  }
  .star-ground {
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

  /* Lines draw themselves (each piece in its turn: see lib/descentPlate's pen()); seals and the star are stamped in. */
  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) linear both;
  }
  .shade.draw {
    animation-timing-function: ease-out;
  }
  .stamp {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.5s var(--d) var(--ease-out) both;
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
      opacity: 0.1;
    }
  }
  @keyframes breathe-halo {
    from {
      opacity: 0.22;
    }
    to {
      opacity: 0.08;
    }
  }
</style>
