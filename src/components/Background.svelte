<script lang="ts">
  import { onMount } from 'svelte';

  // Ambient backdrop: warm glow, vignette and slowly rising embers.
  const embers = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: -((i * 1.7) % 14),
    duration: 11 + ((i * 3) % 9),
    size: 2 + (i % 3),
    drift: ((i % 5) - 2) * 18,
  }));

  // Dither grain, rendered at device resolution so each physical pixel gets its
  // own noise value. A CSS-pixel texture gets smoothed on high-DPI screens, which
  // averages the noise away and lets gradient banding show through again.
  let grain = $state('');
  let grainSize = $state(0);

  function makeGrain() {
    const dpr = window.devicePixelRatio || 1;
    const px = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(px, px);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 256;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    grain = `url(${canvas.toDataURL()})`;
    grainSize = px / dpr;
  }

  onMount(() => {
    makeGrain();
    // Regenerate when the pixel ratio changes (zoom, moving between monitors).
    let mq: MediaQueryList;
    const watch = () => {
      mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener('change', onChange, { once: true });
    };
    const onChange = () => {
      makeGrain();
      watch();
    };
    watch();
    return () => mq.removeEventListener('change', onChange);
  });
</script>

<div class="bg" aria-hidden="true">
  <div class="glow"></div>
  {#each embers as e, i (i)}
    <span
      class="ember"
      style:left="{e.left}%"
      style:width="{e.size}px"
      style:height="{e.size}px"
      style:animation-delay="{e.delay}s"
      style:animation-duration="{e.duration}s"
      style:--drift="{e.drift}px"
    ></span>
  {/each}
  <div class="vignette"></div>
</div>
<!-- Grain sits above the whole UI (not just the backdrop) so it dithers every
     gradient and shadow on the page, which is what prevents banding. -->
<div
  class="grain"
  aria-hidden="true"
  style:background-image={grain}
  style:background-size="{grainSize}px"
></div>

<style>
  .bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background:
      radial-gradient(ellipse 80% 60% at 50% 110%, rgba(140, 60, 20, 0.28), transparent 70%),
      radial-gradient(ellipse 60% 50% at 50% -10%, rgba(120, 95, 60, 0.18), transparent 70%),
      linear-gradient(180deg, #0d0b09, #080706 60%, #0d0907);
  }
  .glow {
    position: absolute;
    inset: -20%;
    background: radial-gradient(circle at 50% 45%, rgba(201, 164, 92, 0.07), transparent 45%);
    animation: breathe 9s ease-in-out infinite;
  }
  .grain {
    position: fixed;
    inset: 0;
    z-index: 1000;
    opacity: 0.04;
    pointer-events: none;
    image-rendering: pixelated;
  }
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.75) 100%);
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
