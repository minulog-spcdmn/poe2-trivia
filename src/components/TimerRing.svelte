<script lang="ts">
  import { session } from '../lib/session.svelte';
  import { sfx } from '../lib/sound';

  let { deadline, total, stopped = false }: { deadline: number; total: number; stopped?: boolean } = $props();

  let remaining = $state(Infinity);
  let lastTick = -1;

  $effect(() => {
    if (stopped) return;
    let raf = 0;
    const loop = () => {
      remaining = Math.max(0, deadline - session.hostNow());
      const secs = Math.ceil(remaining / 1000);
      if (secs <= 5 && secs > 0 && secs !== lastTick) {
        lastTick = secs;
        sfx('tick');
      }
      if (remaining > 0) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });

  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = $derived(Math.min(1, remaining / (total * 1000)));
  const secs = $derived(Number.isFinite(remaining) ? Math.ceil(remaining / 1000) : total);
  const urgent = $derived(remaining <= 5000);
</script>

<div class="timer" class:urgent class:stopped role="timer" aria-label="{secs} seconds left">
  <svg viewBox="0 0 64 64">
    <circle class="track" cx="32" cy="32" r={R} />
    <circle class="fill" cx="32" cy="32" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
  </svg>
  <span>{secs}</span>
</div>

<style>
  .timer {
    position: relative;
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
  }
  svg {
    position: absolute;
    inset: 0;
    rotate: -90deg;
  }
  circle {
    fill: none;
    stroke-width: 4;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.08);
    fill: rgba(0, 0, 0, 0.6);
  }
  .fill {
    stroke: var(--gold);
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(201, 164, 92, 0.6));
    transition: stroke 0.3s;
  }
  span {
    position: relative;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.35rem;
    color: var(--gold-hi);
  }
  .urgent .fill {
    stroke: var(--bad);
    filter: drop-shadow(0 0 6px rgba(224, 85, 63, 0.8));
  }
  .urgent span {
    color: #ff9c86;
    animation: throb 1s ease-in-out infinite;
  }
  .stopped {
    opacity: 0.4;
  }
  .stopped span {
    animation: none;
  }
  @keyframes throb {
    50% {
      transform: scale(1.2);
    }
  }
</style>
