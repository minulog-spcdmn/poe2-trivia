<script lang="ts">
  import { onMount } from 'svelte';
  import { onPressure, pressing, pressureLevel } from '../lib/darkness';

  // Delve, on the CSS backdrop (Background.svelte, without WebGL): the dark
  // of a question's clock running down (lib/darkness.ts), as the WebGL
  // backdrop draws it (tendrils() in lib/backdrop.ts). Soft fingers of dark
  // reach in from every side, longer as the clock runs out, over a faint
  // shade along the edges and a dimming of the whole scene. Each finger is
  // a half ellipse of dark from its edge, falling off like a Gaussian both
  // along and across it, so none shows an edge; they sway slowly, each on
  // its own cycle (still with reduced motion or the effects off). Only
  // opacity, a custom property and transforms change, so nothing is laid
  // out again; holding still it follows the clock in steps of a twentieth.

  type Side = 'top' | 'right' | 'bottom' | 'left';
  /** Along its side (%), how far it can reach (half screens, at the dark's fullest), how wide (vmin), its sway (s, and how far into it). */
  const FINGERS: { side: Side; at: number; reach: number; width: number; dur: number; delay: number }[] = [
    { side: 'top', at: 14, reach: 0.62, width: 26, dur: 9.5, delay: -2 },
    { side: 'top', at: 47, reach: 0.38, width: 22, dur: 12, delay: -7 },
    { side: 'top', at: 78, reach: 0.72, width: 28, dur: 10.5, delay: -4 },
    { side: 'right', at: 22, reach: 0.5, width: 24, dur: 11, delay: -1 },
    { side: 'right', at: 66, reach: 0.78, width: 30, dur: 8.5, delay: -5 },
    { side: 'bottom', at: 24, reach: 0.7, width: 30, dur: 12.5, delay: -3 },
    { side: 'bottom', at: 58, reach: 0.42, width: 22, dur: 9, delay: -8 },
    { side: 'bottom', at: 88, reach: 0.56, width: 24, dur: 11.5, delay: -6 },
    { side: 'left', at: 36, reach: 0.74, width: 28, dur: 10, delay: -9 },
    { side: 'left', at: 80, reach: 0.46, width: 22, dur: 13, delay: -2.5 },
  ];
  const TURN: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: -90 };
  /** A finger's place and length: its root on the edge, pointing in. */
  function place(f: (typeof FINGERS)[number]) {
    const across = f.side === 'top' || f.side === 'bottom';
    // Twice its reach: the Gaussian has all but gone by then.
    const len = `${(2 * (0.05 + f.reach) * 50).toFixed(1)}${across ? 'vh' : 'vw'}`;
    const left = f.side === 'left' ? '0%' : f.side === 'right' ? '100%' : `${f.at}%`;
    const top = f.side === 'top' ? '0%' : f.side === 'bottom' ? '100%' : `${f.at}%`;
    return { left, top, len, turn: `${TURN[f.side]}deg` };
  }

  let el: HTMLDivElement;
  let dim: HTMLDivElement;

  onMount(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => reduceMotion.matches || document.documentElement.hasAttribute('data-still');
    let raf = 0;
    let shown = -1;

    function frame(now: number) {
      raf = 0;
      const p = pressureLevel(now);
      if (Math.abs(p - shown) > (still() ? 0.05 : 0.004) || (p === 0 && shown !== 0)) {
        shown = p;
        const on = p > 0.001;
        el.style.visibility = on ? 'visible' : 'hidden';
        // Faint while the clock has long to run (as the WebGL backdrop's).
        el.style.opacity = on ? Math.min(1, 3 * p).toFixed(3) : '0';
        el.style.setProperty('--reach', on ? p.toFixed(3) : '0');
        dim.style.opacity = on ? (0.35 * p).toFixed(3) : '0';
      }
      if (pressing() || shown > 0) raf = requestAnimationFrame(frame);
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const off = onPressure(wake);
    wake();
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  });
</script>

<div class="dimmed" bind:this={dim} aria-hidden="true"></div>
<div class="tendrils" bind:this={el} aria-hidden="true">
  <div class="rim"></div>
  {#each FINGERS as f, i (i)}
    {@const at = place(f)}
    <span
      class="finger"
      style:left={at.left}
      style:top={at.top}
      style:width="{f.width}vmin"
      style:height={at.len}
      style:rotate={at.turn}
      style:animation-duration="{f.dur}s"
      style:animation-delay="{f.delay}s"
    ></span>
  {/each}
</div>

<style>
  .tendrils,
  .dimmed {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
  }
  .tendrils {
    --reach: 0;
    visibility: hidden;
    overflow: hidden;
  }
  .dimmed {
    background: #000;
  }
  /* The shade along the edges every finger grows out of, eased like a
     Gaussian so it shows no line. */
  .rim {
    position: absolute;
    inset: 0;
    --edge: rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.4) 4%, rgba(0, 0, 0, 0.2) 9%, rgba(0, 0, 0, 0.06) 15%, transparent 21%;
    background:
      linear-gradient(to right, var(--edge)),
      linear-gradient(to left, var(--edge)),
      linear-gradient(to bottom, var(--edge)),
      linear-gradient(to top, var(--edge));
  }
  /* A finger: its root on the edge (the top of its box, turned to point
     in), as long as the dark has come in. The stops follow exp(-5.6 t²). */
  .finger {
    position: absolute;
    translate: -50% 0;
    transform-origin: 50% 0;
    scale: 1 calc(0.06 + 0.94 * var(--reach));
    background: radial-gradient(
      50% 100% at 50% 0%,
      rgba(0, 0, 0, 0.85),
      rgba(0, 0, 0, 0.75) 15%,
      rgba(0, 0, 0, 0.51) 30%,
      rgba(0, 0, 0, 0.27) 45%,
      rgba(0, 0, 0, 0.11) 60%,
      rgba(0, 0, 0, 0.03) 75%,
      transparent
    );
    will-change: transform, scale;
    animation: writhe ease-in-out infinite alternate;
  }
  @keyframes writhe {
    0% {
      transform: rotate(-7deg) skewX(5deg) scaleX(1.1);
    }
    50% {
      transform: rotate(2deg) skewX(-2deg) scaleX(0.9);
    }
    100% {
      transform: rotate(8deg) skewX(-6deg) scaleX(1.05);
    }
  }
  :global(html[data-still]) .finger {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .finger {
      animation: none;
    }
  }
</style>
