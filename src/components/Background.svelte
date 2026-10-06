<script lang="ts">
  import { onMount } from 'svelte';
  import { startBackdrop } from '../lib/backdrop';
  import { ENVIRONMENTS, descent, lookOf, onDescent, type Descent } from '../lib/descent';

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
  // Delve: the CSS backdrop follows the stratum too (the WebGL one reads it itself).
  let dsc = $state<Descent>(descent(0));
  onMount(() => onDescent((d) => (dsc = d)));
  const look = $derived(dsc.look);
  const css = (c: readonly number[], a = 1) => `rgba(${c.map(Math.round).join(', ')}, ${a})`;
  /** Ember colours (0-1) as CSS, the halo dimmed to `a`. */
  const glow = (c: readonly number[], a: number) => css(c.map((v) => v * 255), a);
  /** The first this many CSS embers burn in the stratum turning in, the rest in the one before. */
  const turned = $derived(Math.round(embers.length * dsc.turn));
  const emberLooks = $derived([lookOf(dsc.stratum - 1), lookOf(dsc.stratum)]);
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
    <div class="floor" style:--floor={css(look.floor, look.floorK)} style:--floor-h={look.floorH}></div>
    <div class="mist" style:--mist={css(look.mist, 1)} style:opacity={look.mistK * 3}></div>
    <!-- Each stratum's environment, roughly (lib/backdrop.ts draws them properly). -->
    {#each ENVIRONMENTS as name, i (name)}
      {#if look.env[i] > 0}
        <div class="env env-{name}" style:opacity={look.env[i]}></div>
      {/if}
    {/each}
    <div class="dark" style:opacity={look.dark}></div>
    <div class="dark close" style:opacity={dsc.close}></div>
    <!-- Deeper down the light only ever dims, a little with every depth
         (descent.ts's dim: its `light` is the WebGL hall's, and swings with
         what each stratum's features add). -->
    <div class="dim" style:opacity={dsc.dim}></div>
    <div class="grain"></div>
    <div class="embers">
    {#each embers as e, i (i)}
      {@const l = emberLooks[i < turned ? 1 : 0]}
      <span
        class="ember"
        style:--core={glow(l.ember.map((v, k) => v + (l.core[k] - v) * l.coreMix), 1)}
        style:--halo={glow(l.ember, 0.6)}
        style:--halo-far={glow(l.ember, 0.25)}
        style:left="{e.left}%"
        style:width="{e.size}px"
        style:height="{e.size}px"
        style:animation-delay="{e.delay}s"
        style:animation-duration="{e.duration}s"
        style:--drift="{e.drift}px"
      ></span>
    {/each}
    </div>
    <div class="vignette" style:opacity={1 - 0.6 * look.dark}></div>
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
    /* Deep in a Delve the stratum's uneven dark takes over from it. */
    transition: opacity 4s;
  }
  /* The light from below: the usual ember glow, or a Delve stratum's own. The
     colour eases where the browser can animate a registered property. */
  @property --floor {
    syntax: '<color>';
    inherits: false;
    initial-value: rgba(140, 60, 20, 0.28);
  }
  @property --mist {
    syntax: '<color>';
    inherits: false;
    initial-value: transparent;
  }
  .floor,
  .mist,
  .dark {
    position: absolute;
    inset: 0;
    transition:
      opacity 4s,
      --floor 4s,
      --mist 4s;
  }
  .floor {
    background: radial-gradient(
      80% calc(0.6 * var(--floor-h, 1) * var(--view-h)) at 50% calc(1.1 * var(--view-h)),
      var(--floor),
      transparent 70%
    );
  }
  /* Delve: smoke of the stratum's colour, and an uneven dark heavier toward
     the edges: overlapping off-centre patches, so it never reads as one
     ellipse. */
  .mist {
    background:
      radial-gradient(38% 30% at 18% 64%, color-mix(in srgb, var(--mist) 22%, transparent), transparent),
      radial-gradient(30% 26% at 79% 38%, color-mix(in srgb, var(--mist) 18%, transparent), transparent),
      radial-gradient(44% 22% at 58% 86%, color-mix(in srgb, var(--mist) 20%, transparent), transparent);
  }
  .dark {
    background:
      radial-gradient(46% 38% at 4% 12%, rgba(0, 0, 0, 0.85), transparent),
      radial-gradient(34% 52% at 97% 30%, rgba(0, 0, 0, 0.8), transparent),
      radial-gradient(52% 30% at 70% 0%, rgba(0, 0, 0, 0.7), transparent),
      radial-gradient(30% 40% at 0% 78%, rgba(0, 0, 0, 0.75), transparent),
      radial-gradient(40% 30% at 88% 96%, rgba(0, 0, 0, 0.7), transparent),
      radial-gradient(26% 22% at 34% 30%, rgba(0, 0, 0, 0.35), transparent);
  }
  .env {
    position: absolute;
    inset: 0;
  }
  .dim {
    position: absolute;
    inset: 0;
    background: #000;
    transition: opacity 4s;
  }
  .env-lamps {
    background:
      radial-gradient(14% 18% at 6% 34%, rgba(255, 140, 50, 0.12), transparent),
      radial-gradient(12% 16% at 93% 52%, rgba(255, 140, 50, 0.1), transparent),
      radial-gradient(10% 14% at 10% 74%, rgba(255, 140, 50, 0.08), transparent);
  }
  .env-magma {
    background:
      radial-gradient(30% 22% at 22% 104%, rgba(255, 80, 16, 0.22), transparent),
      radial-gradient(26% 30% at 78% 102%, rgba(255, 60, 10, 0.18), transparent),
      radial-gradient(8% 40% at 4% 90%, rgba(200, 30, 6, 0.14), transparent);
  }
  .env-frost {
    background:
      radial-gradient(14% 60% at 0% 40%, rgba(150, 176, 208, 0.12), transparent),
      radial-gradient(12% 50% at 100% 30%, rgba(150, 176, 208, 0.11), transparent),
      radial-gradient(50% 9% at 50% 0%, rgba(150, 176, 208, 0.09), transparent),
      radial-gradient(70% 16% at 40% 100%, rgba(116, 140, 172, 0.08), transparent);
  }
  .env-spores {
    background:
      radial-gradient(16% 12% at 6% 88%, rgba(84, 140, 130, 0.12), transparent),
      radial-gradient(14% 10% at 92% 80%, rgba(84, 140, 130, 0.1), transparent),
      radial-gradient(22% 9% at 34% 100%, rgba(84, 140, 130, 0.08), transparent);
  }
  .env-shafts {
    background: repeating-linear-gradient(-70deg, transparent 0 9%, rgba(255, 200, 110, 0.06) 13%, transparent 18% 27%);
    mask-image: linear-gradient(to bottom, #000, transparent 85%);
  }
  .env-void {
    background:
      radial-gradient(22% 26% at 17% 64%, rgba(140, 60, 255, 0.14), transparent),
      radial-gradient(20% 24% at 82% 33%, rgba(140, 60, 255, 0.12), transparent);
  }
  .env-mist {
    background:
      linear-gradient(to bottom, transparent 18%, rgba(140, 150, 156, 0.08) 30%, transparent 42%, rgba(140, 150, 156, 0.1) 58%, transparent 70%, rgba(140, 150, 156, 0.1) 86%, transparent);
  }
  .env-plumes {
    background:
      radial-gradient(9% 60% at 26% 100%, rgba(170, 190, 70, 0.14), transparent),
      radial-gradient(11% 70% at 64% 100%, rgba(170, 190, 70, 0.12), transparent),
      radial-gradient(7% 45% at 90% 100%, rgba(170, 190, 70, 0.1), transparent);
  }
  .env-city {
    background:
      radial-gradient(circle, rgba(150, 170, 255, 0.5) 0.6px, transparent 1.4px) 0 0 / 53px 37px,
      radial-gradient(circle, rgba(150, 170, 255, 0.3) 0.5px, transparent 1.2px) 17px 11px / 31px 43px,
      rgba(0, 0, 0, 0.3);
    mask-image: linear-gradient(to bottom, transparent, #000 50%);
  }
  .env-heat {
    background:
      radial-gradient(70% 34% at 50% 108%, rgba(255, 240, 200, 0.2), transparent),
      radial-gradient(90% 50% at 40% 110%, rgba(255, 100, 24, 0.18), transparent);
  }
  /* The light about you drawing in with the depth (descent.ts's close): a
     soft falloff from each edge, eased like a Gaussian so it shows no line,
     the corners darkest where the two meet. */
  .close {
    --edge: rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.62) 6%, rgba(0, 0, 0, 0.36) 13%, rgba(0, 0, 0, 0.14) 21%, rgba(0, 0, 0, 0.03) 29%, transparent 36%;
    background:
      linear-gradient(to right, var(--edge)),
      linear-gradient(to left, var(--edge)),
      linear-gradient(to bottom, var(--edge)),
      linear-gradient(to top, var(--edge));
  }
  .ember {
    position: absolute;
    bottom: -10px;
    border-radius: 50%;
    background: var(--core, #ffb35c);
    box-shadow:
      0 0 6px 2px var(--halo, rgba(255, 140, 50, 0.6)),
      0 0 14px 4px var(--halo-far, rgba(255, 90, 20, 0.25));
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
