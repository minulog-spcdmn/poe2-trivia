<script lang="ts">
  import { onMount } from 'svelte';
  import { startBackdrop } from '../lib/backdrop';
  import { onDescent, type Descent } from '../lib/descent';

  // Ambient backdrop: warm glow, vignette and slowly rising embers. The WebGL
  // backdrop draws its own embers; these CSS ones are for the fallback.
  const embers = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: -((i * 1.7) % 14),
    duration: 11 + ((i * 3) % 9),
    size: 2 + (i % 3),
    drift: ((i % 5) - 2) * 18,
  }));

  // The backdrop is painted by a dithered WebGL canvas (see lib/backdrop.ts);
  // the CSS layers below are the fallback when WebGL is unavailable.
  let canvas: HTMLCanvasElement;
  // Delve: the CSS backdrop follows the depth too (the WebGL one reads it itself).
  let dsc = $state<Descent>({ deep: 0, agit: 0, red: 0, blue: 0, veins: 0, abyss: 0 });
  onMount(() => onDescent((d) => (dsc = d)));
  /** The first this many CSS embers burn blue. */
  const coldEmbers = $derived(Math.round(embers.length * dsc.blue));
  let webgl = $state(false);
  let failed = $state(false);

  onMount(() => {
    const fail = () => {
      webgl = false;
      failed = true;
    };
    const stop = startBackdrop(canvas, fail);
    if (stop) webgl = true;
    else fail();
    return () => stop?.();
  });
</script>

<!-- Behind a dialog the WebGL backdrop darkens itself (lib/behindDialog.ts); the
     CSS one takes the filter, without the blur, which would fade its edges. -->
<div class="bg" class:css={!webgl} data-behind-dialog={webgl ? undefined : 'dim'} aria-hidden="true">
  <canvas bind:this={canvas} class:hidden={failed}></canvas>
  {#if !webgl}
    <div class="glow"></div>
    <div class="grain"></div>
    <div class="embers">
    {#each embers as e, i (i)}
      <span
        class="ember"
        class:cold={i < coldEmbers}
        style:left="{e.left}%"
        style:width="{e.size}px"
        style:height="{e.size}px"
        style:animation-delay="{e.delay}s"
        style:animation-duration="{e.duration}s"
        style:--drift="{e.drift}px"
      ></span>
    {/each}
    </div>
    <div class="deep" style:opacity={dsc.deep * 0.55}></div>
    <div class="azure" style:opacity={dsc.blue}></div>
    <div class="vignette"></div>
  {/if}
</div>

<style>
  /* A fixed height and a layout for --view-h, so a phone's toolbars sliding
     don't move it (see --screen-h in app.css). */
  .bg {
    position: fixed;
    inset: 0;
    height: var(--screen-h);
    z-index: 0;
    overflow: hidden;
  }
  .bg.css {
    background:
      radial-gradient(80% calc(0.6 * var(--view-h)) at 50% calc(1.1 * var(--view-h)), rgba(140, 60, 20, 0.28), transparent 70%),
      radial-gradient(60% calc(0.5 * var(--view-h)) at 50% calc(-0.1 * var(--view-h)), rgba(120, 95, 60, 0.18), transparent 70%),
      linear-gradient(180deg, #0d0b09, #080706 calc(0.6 * var(--view-h)), #0d0907 var(--view-h));
  }
  .glow {
    position: absolute;
    inset: auto -20%;
    top: calc(-0.2 * var(--view-h));
    height: calc(1.4 * var(--view-h));
    background: radial-gradient(circle at 50% 45%, rgba(201, 164, 92, 0.07), transparent 45%);
    animation: breathe 9s ease-in-out infinite;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  canvas.hidden {
    display: none;
  }
  .grain {
    position: absolute;
    inset: 0;
    opacity: 0.06;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .embers {
    position: absolute;
    inset: 0;
  }
  .vignette {
    position: absolute;
    inset: 0;
    /* ellipse at center (farthest-corner) of the --view-h box. */
    background: radial-gradient(
      70.71% calc(0.7071 * var(--view-h)) at 50% calc(0.5 * var(--view-h)),
      transparent 45%,
      rgba(0, 0, 0, 0.75) 100%
    );
  }
  /* Delve: darker deeper down, with a cold light from below once the embers turn blue. */
  .deep,
  .azure {
    position: absolute;
    inset: 0;
    transition: opacity 4s;
  }
  .deep {
    background: linear-gradient(180deg, #020306, #04050a);
  }
  .azure {
    background: radial-gradient(90% calc(0.55 * var(--view-h)) at 50% calc(1.16 * var(--view-h)), rgba(34, 80, 150, 0.24), transparent 70%);
  }
  .ember.cold {
    background: #9cc8ff;
    box-shadow:
      0 0 6px 2px rgba(110, 170, 255, 0.6),
      0 0 14px 4px rgba(60, 110, 230, 0.25);
  }
  .ember {
    position: absolute;
    bottom: -10px;
    border-radius: 50%;
    background: #ffb35c;
    box-shadow:
      0 0 6px 2px rgba(255, 140, 50, 0.6),
      0 0 14px 4px rgba(255, 90, 20, 0.25);
    opacity: 0;
    animation: rise linear infinite;
  }
  @keyframes rise {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0;
    }
    10% {
      opacity: 0.8;
    }
    70% {
      opacity: 0.5;
    }
    100% {
      transform: translate(var(--drift), -105vh) scale(0.3);
      opacity: 0;
    }
  }
  @keyframes breathe {
    50% {
      opacity: 0.6;
      transform: scale(1.08);
    }
  }
</style>
