<!-- A verdict's sign: a small engraved seal in the achievement seals' way
     (AchievementSeal, docs/arcane-style.md), struck in the verdict's colour.
     A worn double ring round its sign, cut from exact geometry
     (lib/verdictMarks.ts): the tick or the cross as burin strokes, lit above
     and hatched below, or the hour run out, an hourglass whose sand is all
     down; the lines sit on a soft glow of themselves. As it lands, its rings
     are cut round from the top and its sign is cut as they close, stroke by
     stroke as a pen would (a cross's second cut after the first). The
     reveal's verdict chip wears it beside its word (QuestionView); a wrong
     answer's face-down token on the scoreboard is the ✕ seal grown to cover
     the avatar (Avatar's wrong, token): opaque, so the letter under it is
     hidden, its rings already there as it turns over, its cross cut as it
     settles. The parent sizes it and sets the colour: --v-icon and --v-tint,
     from app.css's --verdict-* tokens; and, if it lands later than the chip
     does, when its sign is cut: --draw-at (Avatar, as the token turns over). -->
<script lang="ts" module>
  import { CHECK, CROSS, HOURGLASS, SEAL } from '../lib/verdictMarks';

  /** The sign inside the inner ring: the marks drawn at this share of their size. */
  const K = 0.66;
  /** When each stroke of a sign is cut, after --draw-at, and for how long (s). */
  const CUTS = {
    check: [{ at: 0, for: 0.32 }],
    cross: [
      { at: 0, for: 0.15 },
      { at: 0.2, for: 0.15 },
    ],
  };
  /** The outer ring cut round once from the top in this long (s), each worn piece timed to where it sits. */
  const RING = 0.42;
</script>

<script lang="ts">
  let { icon, token = false }: { icon: 'check' | 'cross' | 'clock'; token?: boolean } = $props();

  const uid = $props.id();
  const blades = $derived(icon === 'check' ? CHECK : icon === 'cross' ? CROSS : []);
</script>

{#snippet sign(glow: boolean)}
  {#if icon === 'clock'}
    <g class="hour">
      <path class="frame" d={HOURGLASS.frame} />
      <path class="line" d={HOURGLASS.edge} />
      <path class="line" d={HOURGLASS.sand} />
      {#if !glow}<path class="hatch" d={HOURGLASS.sandHatch} />{/if}
      <path class="line" d={HOURGLASS.grain} />
    </g>
  {:else}
    <g transform="scale({K})" style:--k={K}>
      {#each blades as b, i (i)}
        <g mask={glow ? undefined : `url(#${uid}-${i})`}>
          {#if glow}
            <path class="blade-glow" d={b.edge} />
          {:else}
            <path class="lit" d={b.lit} />
            <path class="hatch" d={b.hatch} />
            <path class="edge" d={b.edge} />
          {/if}
        </g>
      {/each}
    </g>
  {/if}
{/snippet}

<span class="sign" class:token aria-hidden="true">
  <svg class="glow" viewBox="-12 -12 24 24">
    <circle r="11" class="ring" />
    <circle r={SEAL.inner} class="ring inner" />
    {@render sign(true)}
  </svg>
  <svg viewBox="-12 -12 24 24">
    <defs>
      {#each blades as b, i (i)}
        <!-- In the scaled sign's own units, as what it masks is. -->
        <mask id="{uid}-{i}" maskUnits="userSpaceOnUse" x="-14" y="-14" width="28" height="28">
          <path class="pen" d={b.pen} stroke-width={b.reach} pathLength="1" style:--at="{CUTS[icon as 'check' | 'cross'][i].at}s" style:--for="{CUTS[icon as 'check' | 'cross'][i].for}s" />
        </mask>
      {/each}
    </defs>
    <g class="rings">
      {#each SEAL.outer as part, i (i)}
        <path class="ring outer" d={part.d} pathLength="1" style:--at="{part.from * RING}s" style:--for="{(part.to - part.from) * RING}s" />
      {/each}
      <circle r={SEAL.inner} class="ring inner" pathLength="1" transform="rotate(-90)" />
    </g>
    {@render sign(false)}
  </svg>
</span>

<style>
  .sign {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    color: var(--v-icon);
    border-radius: 50%;
    /* A dark medallion the lines are cut into, warmed a little by its colour at the heart. */
    background: radial-gradient(circle, rgba(var(--v-tint), 0.2), rgba(var(--v-tint), 0.06) 55%, rgba(0, 0, 0, 0.55) 80%);
  }
  /* The token hides the letter under it. */
  .token {
    background: radial-gradient(circle, rgba(var(--v-tint), 0.24), rgba(var(--v-tint), 0.07) 60%), #140f0b;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* The rings as fine at any size as the seals' (a pixel and a hair), however large the token grows. */
  .ring {
    vector-effect: non-scaling-stroke;
    stroke-width: 1.1px;
  }
  .ring.inner {
    stroke-width: 0.6px;
  }
  circle {
    stroke-linecap: round;
  }
  /* A sign drawn at k times its size keeps the same line. */
  .lit {
    fill: currentColor;
    stroke: none;
  }
  .edge {
    stroke-width: calc(0.42 / var(--k, 1));
  }
  .hatch {
    stroke-width: calc(0.26 / var(--k, 1));
    stroke-linecap: round;
  }
  .hour .line {
    stroke-width: 0.6;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .hour .frame {
    stroke-width: 0.85;
    stroke-linecap: round;
  }
  .hour .hatch {
    stroke-width: 0.3;
  }

  /* The glow: the same lines, wide and faint, under them. */
  .glow {
    opacity: 0.24;
    filter: blur(0.6px);
  }
  .glow * {
    stroke-width: 1.8;
  }
  .glow .ring {
    stroke-width: 2.6px;
  }
  .glow .ring.inner {
    stroke-width: 1.4px;
  }
  .glow .blade-glow {
    fill: currentColor;
    stroke-width: calc(1.2 / var(--k, 1));
  }
  .token .glow {
    opacity: 0.3;
  }

  /*
   * Landing: the rings cut round from the top, the sign after them, a
   * stroke at a time; the hourglass, with no strokes to cut in turn, struck
   * at once and brightening in. The token's rings are already there as it
   * turns over; only its sign is cut. With motion reduced, app.css's own
   * rule cuts all of it short.
   */
  .rings path,
  .rings circle {
    stroke-dasharray: 1;
    animation: draw var(--for) linear calc(var(--draw-at, 0.22s) - 0.22s + var(--at)) backwards;
  }
  .rings circle {
    --at: 0.12s;
    --for: 0.36s;
  }
  .token .rings path,
  .token .rings circle {
    animation: none;
  }
  .pen {
    fill: none;
    stroke: #fff;
    stroke-dasharray: 1;
    animation: draw var(--for) var(--ease-out) calc(var(--draw-at, 0.22s) + var(--at)) backwards;
  }
  .hour {
    animation: strike 0.4s var(--ease-out) var(--draw-at, 0.22s) backwards;
  }
  .glow {
    animation: glow-in 0.6s ease-out calc(var(--draw-at, 0.22s) + 0.1s) backwards;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
  @keyframes strike {
    from {
      opacity: 0;
      scale: 1.35;
    }
  }
  @keyframes glow-in {
    from {
      opacity: 0;
    }
  }
</style>
