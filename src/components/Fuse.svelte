<script lang="ts">
  // Delve: a stick of dynamite's fuse, burning down as a countdown to its
  // blast at half the clock. A cord runs round the art from its foot, up the
  // left side and along the top to the stick at the middle. It is lit as the
  // clock starts and burns toward the stick, a small fizzing light at its
  // burning end; the effects layer spits a trickle of sparks off it that
  // grows to a fizz in the last moments (dynamiteFuse in lib/fx/moments.ts).
  // Every screen burns it on the host's clock. It sits over the art's edge,
  // quiet, so the countdown can be read at a glance without pulling the eye.
  import { onMount } from 'svelte';
  import { FUSE_MS, dynamiteFuse } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';
  import ItemGlyph from './ItemGlyph.svelte';

  /** `lit` and `at`: when the cord was lit and when it reaches the stick, on `now`'s clock (the host's). */
  let { lit, at, now }: { lit: number; at: number; now: () => number } = $props();

  /** How far in from the art's edge the cord runs (px). */
  const INSET = 7;
  let host = $state<HTMLElement>();
  let w = $state(0);
  let h = $state(0);
  const up = $derived(Math.max(0, h - 2 * INSET));
  /** The cord ends at the stick's fuse, short of the middle where the stick lies. */
  const STICK = 7;
  const along = $derived(Math.max(0, w / 2 - STICK - INSET));
  const path = $derived(`M${INSET} ${h - INSET}V${INSET}H${w / 2 - STICK}`);

  let cord = $state<SVGPathElement>();
  let spark = $state<HTMLElement>();

  /** How much of the cord has burnt (0 to 1), and how hot the end is (0 to 1, in the last FUSE_MS). */
  const burnt = () => Math.min(1, Math.max(0, (now() - lit) / Math.max(1, at - lit)));
  const heat = () => Math.min(1, Math.max(0, 1 - (at - now()) / FUSE_MS));

  /** The burning end at `u` along the cord, in the art's box. */
  function end(u: number) {
    const d = u * (up + along);
    return d < up ? { x: INSET, y: h - INSET - d } : { x: INSET + d - up, y: INSET };
  }

  onMount(() => {
    const el = host!;
    const ro = new ResizeObserver(() => {
      w = el.clientWidth;
      h = el.clientHeight;
    });
    ro.observe(el);
    let frame = 0;
    const draw = () => {
      const u = burnt();
      if (cord) {
        // pathLength 1000: what is left of it runs from the burning end to the stick.
        cord.style.strokeDasharray = `${(1 - u) * 1000} 2000`;
        cord.style.strokeDashoffset = `${-u * 1000}`;
      }
      if (spark) {
        const p = end(u);
        spark.style.transform = `translate(${p.x}px, ${p.y}px) scale(${1 + 0.7 * heat()})`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    // The sparks, in page coordinates.
    const fx: Handle = dynamiteFuse(
      () => {
        if (!w || !h) return null;
        const r = el.getBoundingClientRect();
        const p = end(burnt());
        return { x: r.left + p.x, y: r.top + p.y };
      },
      heat,
    );
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      fx.stop();
    };
  });
</script>

<div class="fuse" bind:this={host} aria-hidden="true">
  {#if w && h}
    <svg width={w} height={h} viewBox="0 0 {w} {h}">
      <!-- Where it has burnt: a faint scorch. -->
      <path class="scorch" d={path} />
      <path class="cord" bind:this={cord} pathLength="1000" d={path} />
    </svg>
    <span class="stick" style:left="{w / 2 + 1}px" style:top="{INSET}px"><ItemGlyph kind="dynamite" /></span>
    <span class="spark" bind:this={spark}></span>
  {/if}
</div>

<style>
  .fuse {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    animation: fuse-in 0.4s ease-out both;
  }
  @keyframes fuse-in {
    from {
      opacity: 0;
    }
  }
  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .scorch {
    stroke: rgba(70, 40, 24, 0.55);
    stroke-width: 1.4px;
  }
  /* A braided cord: tan over a dark edge so it reads on light art and dark. */
  .cord {
    stroke: #b38a58;
    stroke-width: 1.6px;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.95));
  }
  /* The stick it burns toward, lying at the end of the cord. */
  .stick {
    position: absolute;
    --h: 15px;
    translate: -50% -50%;
    rotate: -90deg;
  }
  /* The burning end: a white-hot point in an orange glow, flickering. */
  .spark {
    position: absolute;
    left: -5px;
    top: -5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: radial-gradient(closest-side, #fff8e8 0, #ffd27a 30%, rgba(255, 120, 30, 0.75) 55%, rgba(255, 90, 20, 0) 100%);
    will-change: transform;
  }
  .spark::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 170, 70, 0.45), rgba(255, 120, 40, 0));
    animation: flicker 0.16s steps(2) infinite alternate;
  }
  @keyframes flicker {
    from {
      opacity: 0.45;
      scale: 0.8;
    }
    to {
      opacity: 1;
      scale: 1.15;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spark::after {
      animation: none;
    }
  }
  :global(html[data-still]) .spark::after {
    animation: none;
  }
</style>
