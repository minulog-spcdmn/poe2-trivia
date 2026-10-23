<!-- A verdict's sign: a small seal in the achievement seals' way
     (AchievementSeal, docs/arcane-style.md), cut in the verdict's colour on a
     dark disc: a worn ring and a hairline ring round its sign, a fine line
     (lib/verdictMarks.ts): the tick, the cross, or the hour run out. As it
     lands its outer ring is cut round from the top and its sign drawn on as
     a pen would (a cross's second cut after the first). The reveal's
     verdict chip wears it beside its word (QuestionView); a wrong answer's
     face-down token on the scoreboard is the ✕ seal grown to cover the
     avatar (Avatar's wrong, token): opaque, so the letter under it is
     hidden, its rings already there as it turns over, its cross drawn as it
     settles. The parent sizes it and sets the colour: --v-icon and --v-tint,
     from app.css's --verdict-* tokens; and, if it lands later than the chip
     does, when its sign is drawn: --draw-at (Avatar, as the token turns over). -->
<script lang="ts" module>
  import { CHECK, CROSS, HOURGLASS, SEAL } from '../lib/verdictMarks';

  const SIGNS = { check: CHECK, cross: CROSS, clock: HOURGLASS };
  /** The tick and the cross sit inside the inner ring at this share of their size; the hourglass is drawn to fit it. */
  const K = { check: 0.7, cross: 0.7, clock: 1 };
  /** When each stroke of a sign is drawn, after --draw-at, and for how long (s). */
  const PENS = {
    check: [{ at: 0, for: 0.3 }],
    cross: [
      { at: 0, for: 0.14 },
      { at: 0.2, for: 0.14 },
    ],
    clock: [
      { at: 0, for: 0.3 },
      { at: 0.05, for: 0.35 },
      { at: 0.3, for: 0.2 },
    ],
  };
  /** The outer ring cut round once from the top in this long (s), each worn piece timed to where it sits. */
  const RING = 0.42;
</script>

<script lang="ts">
  let { icon, token = false }: { icon: 'check' | 'cross' | 'clock'; token?: boolean } = $props();
</script>

<span class="sign" class:token aria-hidden="true">
  <svg viewBox="-12 -12 24 24">
    {#each SEAL.outer as part, i (i)}
      <path class="ring" d={part.d} pathLength="1" style:--at="{part.from * RING}s" style:--for="{(part.to - part.from) * RING}s" />
    {/each}
    <circle class="ring inner" r={SEAL.inner} />
    <g transform="scale({K[icon]})" style:--k={K[icon]}>
      {#each SIGNS[icon] as d, i (i)}
        <path class="mark" {d} pathLength="1" style:--at="{PENS[icon][i].at}s" style:--for="{PENS[icon][i].for}s" />
      {/each}
    </g>
  </svg>
</span>

<style>
  .sign {
    display: block;
    width: 100%;
    height: 100%;
    color: var(--v-icon);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
  }
  /* The token hides the letter under it. */
  .token {
    background: #140f0b;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* About a pixel on the chip, the sign a little stronger than its rings. */
  .ring {
    stroke-width: 0.95;
    stroke-linecap: butt;
  }
  .ring.inner {
    stroke-width: 0.5;
    opacity: 0.7;
  }
  /* The same line whatever the sign's scale. */
  .mark {
    stroke-width: calc(1.55 / var(--k));
  }

  /* Landing: the outer ring cut round from the top, the sign drawn on as it closes (with motion reduced, app.css cuts it short). */
  .ring:not(.inner),
  .mark {
    stroke-dasharray: 1;
  }
  .ring:not(.inner) {
    animation: draw var(--for) linear calc(var(--draw-at, 0.22s) - 0.22s + var(--at)) backwards;
  }
  .token .ring:not(.inner) {
    animation: none;
  }
  .mark {
    animation: draw var(--for) cubic-bezier(0.45, 0, 0.25, 1) calc(var(--draw-at, 0.22s) + var(--at)) backwards;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
</style>
