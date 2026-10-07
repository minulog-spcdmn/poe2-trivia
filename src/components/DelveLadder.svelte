<script lang="ts">
  import { SOL_RAYS, HEPTAGRAM } from '../lib/alchemy';
  import { DELVE_LIVES, FINDS_FROM, FINDS_IN_ORDER, shownDepth, type FindKind } from '../lib/delve';
  import { descentPlate, f, LINE, ZONES } from '../lib/descentPlate';
  import ItemGlyph from './ItemGlyph.svelte';

  // The descent, engraved (lib/descentPlate draws it): Sol over the mouth of
  // a pit that narrows down through the ten zones, a terrace each, to its
  // floor, and below it the ouroboros, a serpent in a figure eight on its
  // side biting its tail, for no end past 100. A zone you have reached
  // holds its sigil in a seal struck in its colour, and is named in the
  // margin; one you haven't is a dull, empty impression, and those are
  // bracketed together under the one word "uncharted", so nothing is
  // spoiled. A star in a glory of rays marks your deepest (at the mouth
  // before a first run), its number beside it among the notes, which say
  // what lies ahead. Each find you have met (`met`) gets a callout in the
  // left margin: a fine leader in its colour from the wall where it first
  // turns up to its item and that depth; one you haven't met shows nothing.
  // In the arcane style (docs/arcane-style.md): fine exact lines that stop
  // short of every seal, sign and word, one-sided hatching, a little wear, a
  // soft glow under the lit lines. It draws itself in from the surface down
  // as one sweep of the pen; the seals are stamped in as it passes them, the
  // serpent is drawn round from its tail to its head, and the star lights
  // last. Then a few things stay alive, on a layer of their own and only in
  // opacity, transforms and a dash's offset: the glows breathe, a sheen runs
  // down the serpent's back from tail to head, its eye glints now and then,
  // the star's glory turns slowly and the star twinkles. Still (reduced
  // motion, or data-still) none of that loops.
  // The plate is laid out for the box it is given: as tall as the finds
  // beside it, or (stacked on a phone) as its min-height.
  let { deepest = null, label = 'Your deepest', met = [] }: { deepest?: number | null; label?: string; met?: FindKind[] } = $props();

  let w = $state(0);
  let h = $state(0);

  const LIVES = ['no', 'one', 'two', 'three', 'four', 'five'][DELVE_LIVES] ?? String(DELVE_LIVES);
  /** The finds you have met, with the depth each first turns up at. */
  const metFinds = $derived(FINDS_IN_ORDER.filter((x) => met.includes(x.kind)).map((x) => ({ kind: x.kind, from: x.from })));
  const plate = $derived(w > 0 && h > 0 ? descentPlate(w, h, deepest, LIVES, FINDS_FROM, metFinds) : null);
  /** Each find's item, as the game draws it. */
  const GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;
  const FIND_NAME = { azurite: 'Azurite Veins', flare: 'Flare Caches', dynamite: 'Dynamite Caches' } as const;

  // The sheen down the serpent's back: a short bright dash running from the tail to the head at SHEEN_SPEED, then a rest
  // while it would run on past the head (the dash pattern repeats every SHEEN_EVERY of the back line's length).
  const SHEEN_SPEED = 30;
  const SHEEN_EVERY = 1.7;
  /** The dash, in three lengths, brightest in the middle, so its light comes and goes softly. */
  const SHEEN_DASHES: [number, string][] = [
    [34, '#3a3a3a'],
    [22, '#7a7a7a'],
    [11, '#e2e2e2'],
  ];
  const uid = $props.id();
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
      ...metFinds.map((x) => `${FIND_NAME[x.kind]} turn up from depth ${shownDepth(x.from)}.`),
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
      {#if p.ouro.lit}<circle class="light sun" cx={p.ouro.loop[0]} cy={p.ouro.loop[1]} r={p.ouro.inner * 0.8} />{/if}
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
      <!-- The zones not reached yet, bracketed under one word. -->
      {#if p.uncharted}
        <g class="uncharted" style:--d={sec(p.uncharted.delay)}>
          {#if p.uncharted.d}<path d={p.uncharted.d} />{/if}
          <text x={f(p.uncharted.x)} y={f(p.uncharted.y)}>uncharted</text>
        </g>
      {/if}

      <!-- The finds you have met: a station on the rock where each first turns up, and at the leader's end its item and that depth. -->
      {#each p.callouts as c (c.num)}
        <g class="callout" style:--c="var(--find-{c.kinds[0]})" style:--d={sec(c.delay + 0.3)}>
          <circle class="station" cx={f(c.dot[0])} cy={f(c.dot[1])} r="0.95" />
          {#each c.kinds as k, i (k)}
            <ItemGlyph kind={GLYPH[k]} place={{ x: c.x + i * 6.6, y: c.y - 4.6, h: 9.2 }} />
          {/each}
          <text class="callout-num" x={f(c.numX)} y={f(c.y)}>{c.num}</text>
        </g>
      {/each}

      <!-- The serpent's eye: a ring and a slit, turned with the head; and the {7/2} star of the seven metals in its right loop until your star is there. -->
      <g class="ouro" class:lit={p.ouro.lit} style:--d={sec(p.ouro.done - 0.2)}>
        <circle class="eye" cx={f(p.ouro.eye.c[0])} cy={f(p.ouro.eye.c[1])} r={f(p.ouro.eye.r)} />
        <ellipse
          class="pupil"
          rx={f(p.ouro.eye.r * 0.3)}
          ry={f(p.ouro.eye.r * 0.78)}
          transform="translate({f(p.ouro.eye.c[0])} {f(p.ouro.eye.c[1])}) rotate({f(p.ouro.eye.angle)})"
        />
        {#if !p.ouro.lit}
          <path class="sign inner" d={HEPTAGRAM} transform="translate({f(p.ouro.loop[0])} {f(p.ouro.loop[1])}) scale({f((p.ouro.inner * 0.62) / 4.2)})" />
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

    </svg>

    <!-- What stays alive, on a layer of its own: the sheen down the serpent's back, its eye's glint, and your star. -->
    {@const every = p.ouro.sheenLen * SHEEN_EVERY}
    <svg class="live" viewBox="0 0 {f(p.w)} {f(p.h)}" aria-hidden="true" style:--sheen-t={sec(every / SHEEN_SPEED)} style:--sheen-d={sec(p.ouro.done + 0.6)}>
      <!-- The sheen: the serpent's own lines again, in a pale light, seen only where a soft dash running down its back lets them through. -->
      <mask id="{uid}-sheen" maskUnits="userSpaceOnUse" x="0" y="0" width={f(p.w)} height={f(p.h)}>
        {#each p.ouro.sheen as s, i (i)}
          {#each SHEEN_DASHES as [len, tone] (len)}
            <path
              class="sheen"
              d={s.d}
              style:stroke={tone}
              stroke-width={f(p.ouro.sheenW)}
              style:--o0={f(s.from + (SHEEN_DASHES[0][0] - len) / 2)}
              style:--o1={f(s.from + (SHEEN_DASHES[0][0] - len) / 2 - every)}
              style:--dash="{len} {f(every - len)}"
            />
          {/each}
        {/each}
      </mask>
      <g class="sheen-lit" class:lit={p.ouro.lit} mask="url(#{uid}-sheen)"><path d={p.ouro.lines} /></g>
      <circle class="glint" cx={f(p.ouro.eye.glint[0])} cy={f(p.ouro.eye.glint[1])} r={f(Math.max(0.32, p.ouro.eye.r * 0.26))} style:--d={sec(p.ouro.done + 1.4)} />

      <!-- Your deepest: an eight-pointed star, hatched down one side of each point, in a glory of fine rays that slowly turns. -->
      <g class="star" transform="translate({f(p.star.c[0])} {f(p.star.c[1])})" style:--d={sec(p.star.delay)}>
        <circle class="halo" r="7.5" />
        <g class="turn">
          <path class="glory draw" d={p.star.glory} pathLength="100" style:--d={sec(p.star.delay + 0.15)} style:--t="0.45s" />
        </g>
        <g class="stamp" style:--d={sec(p.star.delay)}>
          <path class="star-ground" d={p.star.outline} />
          <path class="star-hatch" d={p.star.hatch} />
          <path class="star-line" d={p.star.outline} />
          <path class="star-ridge" d={p.star.ridges} />
        </g>
        <!-- A glint crossing the star now and then, turned between its points. -->
        <path
          class="twinkle"
          d="M0 {f(-p.star.r * 1.9)}L{f(p.star.r * 0.16)} 0L0 {f(p.star.r * 1.9)}L{f(-p.star.r * 0.16)} 0ZM{f(-p.star.r * 1.9)} 0L0 {f(p.star.r * 0.16)}L{f(p.star.r * 1.9)} 0L0 {f(-p.star.r * 0.16)}Z"
          style:--d={sec(p.star.delay + 1.6)}
        />
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
    /* The serpent before you are past 100: a dark gold, an impression not yet lit, but clear. */
    --dim: color-mix(in srgb, var(--gold) 62%, #3a3128);
    --find-dynamite: #eebf96;
    --find-flare: #f7a3b3;
    --find-azurite: #a9cdf5;
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
  .dim path,
  path.dim {
    stroke: var(--dim);
  }
  .find path {
    stroke: color-mix(in srgb, var(--c) 70%, transparent);
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
  .shade.dim {
    stroke: var(--dim);
    opacity: 0.85;
  }

  /* Signs, drawn at a scale, keep a fine line. */
  .sign,
  .sign *,
  .sigil path {
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

  /* "Uncharted": a quiet word in the margin, its bracket a hairline. */
  .uncharted {
    opacity: 0.8;
    animation: carve 0.6s var(--d) var(--ease-out) both;
  }
  .uncharted path {
    stroke: var(--muted);
    stroke-width: 0.35;
  }
  .uncharted text {
    font-style: italic;
    font-size: 10px;
    letter-spacing: 0.03em;
    text-anchor: middle;
    fill: var(--muted);
  }

  /* A find's callout: a station ring on the rock, its item, and the depth in its colour. */
  .callout {
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }
  .station {
    fill: var(--bg);
    stroke: var(--c);
    stroke-width: 0.5;
  }
  .callout-num {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 8.5px;
    fill: var(--c);
  }

  /* The serpent's eye, ringed, its pupil a slit; the {7/2} star in its loop until your star is there. */
  .ouro {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .eye {
    stroke: var(--dim);
    stroke-width: 0.4;
  }
  .pupil {
    fill: var(--dim);
    stroke: none;
  }
  .inner {
    stroke: var(--dim);
    opacity: 0.8;
  }
  .ouro.lit .eye {
    stroke: var(--gold);
  }
  .ouro.lit .pupil {
    fill: var(--gold-hi);
  }

  /* The live layer is composited on its own, so what moves on it never repaints the plate under it. */
  .live {
    will-change: transform;
    pointer-events: none;
  }
  /* The sheen: a soft dash running down the back line in the mask, letting through a pale copy of the serpent's lines. Hidden until it runs. */
  .sheen {
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: var(--dash);
    opacity: 0;
    animation: sheen var(--sheen-t) var(--sheen-d) linear infinite;
  }
  @keyframes sheen {
    from {
      stroke-dashoffset: var(--o0);
      opacity: 1;
    }
    to {
      stroke-dashoffset: var(--o1);
      opacity: 1;
    }
  }
  .sheen-lit path {
    stroke: #f6e2b2;
    stroke-width: 0.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sheen-lit.lit path {
    stroke: #fff4d4;
  }
  /* The eye's glint: a point of light, brightening for a moment every few seconds. */
  .glint {
    fill: #fff3d6;
    stroke: none;
    opacity: 0.35;
    transform-box: fill-box;
    transform-origin: center;
    animation:
      carve 0.4s var(--d) var(--ease-out) both,
      glint 7s calc(var(--d) + 2s) ease-in-out infinite;
  }
  @keyframes glint {
    0%,
    86%,
    100% {
      opacity: 0.35;
      transform: scale(1);
    }
    91% {
      opacity: 1;
      transform: scale(1.7);
    }
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
  /* The glory turns about the star, once in two minutes. */
  .turn {
    animation: turn 120s calc(var(--d) + 0.6s) linear infinite;
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  .twinkle {
    fill: #fff3d6;
    stroke: none;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: twinkle 5.5s var(--d) ease-in-out infinite;
  }
  @keyframes twinkle {
    0%,
    80%,
    100% {
      opacity: 0;
      transform: scale(0.3) rotate(45deg);
    }
    88% {
      opacity: 0.85;
      transform: scale(1) rotate(45deg);
    }
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
  /* Still: nothing loops. */
  :global(html[data-still]) .descent :is(.sheen, .twinkle, .sheen-lit) {
    animation: none;
    opacity: 0;
  }
  :global(html[data-still]) .descent :is(.turn, .glint, .halo, .glow) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheen,
    .sheen-lit,
    .twinkle {
      animation: none;
      opacity: 0;
    }
    .turn,
    .glint {
      animation: none;
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
