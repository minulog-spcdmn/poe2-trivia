<!-- An answer tile's ✓ or ✕ at the reveal: a fine line drawn on by a pen
     (lib/verdictMarks.ts), the tick in one movement, the cross in two cuts.
     Sized by the font, about as big as the glyph it stands for, its line in
     step with it; in the tile's colour. The tile answers it (QuestionView,
     DailyUnique): a right one brightens as the tick lands (0.3 s in), a
     wrong one jolts as the first cut strikes (0.12 s in). -->
<script lang="ts" module>
  import { CHECK, CROSS } from '../lib/verdictMarks';

  /** Each stroke's pen: when it starts and how long it runs (s). */
  const PENS = {
    check: [{ at: 0, for: 0.3 }],
    cross: [
      { at: 0, for: 0.14 },
      { at: 0.2, for: 0.14 },
    ],
  };
</script>

<script lang="ts">
  let { shape }: { shape: 'check' | 'cross' } = $props();

  const strokes = $derived(shape === 'check' ? CHECK : CROSS);
</script>

<svg viewBox="-12 -12 24 24" aria-hidden="true">
  {#each strokes as d, i (i)}
    <path {d} pathLength="1" style:--at="{PENS[shape][i].at}s" style:--for="{PENS[shape][i].for}s" />
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 1.05em;
    height: 1.05em;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Its line about a fourteenth of the font, as the glyph's was (with motion reduced, app.css cuts the pen short). */
  path {
    stroke-width: 1.7;
    stroke-dasharray: 1;
    animation: cut var(--for) cubic-bezier(0.45, 0, 0.25, 1) var(--at) backwards;
  }
  @keyframes cut {
    from {
      stroke-dashoffset: 1;
    }
  }
</style>
