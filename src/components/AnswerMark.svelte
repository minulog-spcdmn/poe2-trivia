<!-- An answer tile's ✓ or ✕ at the reveal, engraved (lib/verdictMarks.ts):
     each stroke a blade cut by a pen that runs along it, lit above and
     shaded below, on a soft glow of itself. The tick is one movement, down
     into the turn and on up out of it; the cross two cuts, the second passing
     under the first. Sized by the font: about as big as the glyph it stands
     for, in the tile's colour. The tile answers it (QuestionView,
     DailyUnique): a right one lights as the tick's long stroke lands (0.3 s
     in), a wrong one jolts as the first cut strikes (0.12 s in). -->
<script lang="ts" module>
  import { CHECK, CROSS } from '../lib/verdictMarks';

  /** Each stroke's pen: when it starts and how long it runs (s), and how it moves. */
  const PENS = {
    // The tick in one movement, gathering speed into the turn and easing out up the long arm.
    check: [{ at: 0, for: 0.32, ease: 'cubic-bezier(0.55, 0, 0.3, 1)' }],
    // Two cuts, the second after a beat.
    cross: [
      { at: 0, for: 0.15, ease: 'cubic-bezier(0.3, 0, 0.4, 1)' },
      { at: 0.21, for: 0.15, ease: 'cubic-bezier(0.3, 0, 0.4, 1)' },
    ],
  };
</script>

<script lang="ts">
  let { shape }: { shape: 'check' | 'cross' } = $props();

  const uid = $props.id();
  const blades = $derived(shape === 'check' ? CHECK : CROSS);
</script>

<svg viewBox="-12 -12 24 24" aria-hidden="true">
  <defs>
    <filter id="{uid}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.9" /></filter>
    {#each blades as b, i (i)}
      <mask id="{uid}-{i}" maskUnits="userSpaceOnUse" x="-14" y="-14" width="28" height="28">
        <path class="pen" d={b.pen} stroke-width={b.reach} pathLength="1" style:--at="{PENS[shape][i].at}s" style:--for="{PENS[shape][i].for}s" style:--ease={PENS[shape][i].ease} />
      </mask>
    {/each}
  </defs>
  {#each blades as b, i (i)}
    <g mask="url(#{uid}-{i})">
      <path class="glow" d={b.edge} filter="url(#{uid}-glow)" />
      <path class="shade" d={b.shade} />
      <path class="lit" d={b.lit} />
      <path class="edge" d={b.edge} />
    </g>
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 1.05em;
    height: 1.05em;
    overflow: visible;
    fill: currentColor;
  }
  .glow {
    opacity: 0.38;
    stroke: currentColor;
    stroke-width: 1.2;
  }
  .shade {
    opacity: 0.42;
  }
  /* A fine cut line all round, so the shaded side keeps a sharp edge. */
  .edge {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.4;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* The pen: a broad stroke along the blade, uncovering it as it runs (with motion reduced, app.css cuts it short). */
  .pen {
    fill: none;
    stroke: #fff;
    stroke-linecap: butt;
    stroke-dasharray: 1;
    animation: cut var(--for) var(--ease) var(--at) backwards;
  }
  @keyframes cut {
    from {
      stroke-dashoffset: 1;
    }
  }
</style>
