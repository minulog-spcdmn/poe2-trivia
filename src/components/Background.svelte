<script lang="ts">
  // Ambient backdrop: warm glow, vignette and slowly rising embers.
  const embers = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: -((i * 1.7) % 14),
    duration: 11 + ((i * 3) % 9),
    size: 2 + (i % 3),
    drift: ((i % 5) - 2) * 18,
  }));
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
  <!-- Grain goes last so it dithers every gradient beneath it (prevents banding). -->
  <div class="grain"></div>
</div>

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
    position: absolute;
    inset: 0;
    opacity: 0.04;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
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
