<script lang="ts">
  import { session } from '../lib/session.svelte';
  import { sfx } from '../lib/sound';
  import { timerTick } from '../lib/fx/moments';
  import { questionTimer, veinWindowMs } from '../lib/delve';
  import { claimPressure, pressureOf, type Pressure } from '../lib/darkness';

  /**
   * `deadline` null: the clock hasn't started yet (Delve waits for the art), so
   * the ring stays full. `warnFrom`: the seconds that tick and glow urgent.
   */
  let {
    deadline,
    total,
    stopped = false,
    warnFrom = 5,
  }: { deadline: number | null; total: number; stopped?: boolean; warnFrom?: number } = $props();

  // Delve: the ring spans the time the question started with (a find's is
  // always the shortest, whatever `total` says before its clock starts, and a
  // flare's extra time fills it back up rather than stretching it). On an
  // Azurite Vein its fast window (veinWindowMs: a right answer in it earns a
  // ward) is drawn in azurite at the head of the ring.
  const st = $derived(session.state);
  const q = $derived(st?.delve ? st.question : null);
  const azurite = $derived(q?.find === 'azurite');
  const span = $derived(st?.delve && q ? questionTimer(st) : total);
  /** Milliseconds left on the clock when the fast window closes. */
  const fastMs = $derived(st ? veinWindowMs(st) : 0);
  const fastEnd = $derived(deadline !== null && q?.clockAt !== undefined ? deadline - q.clockAt - fastMs : span * 1000 - fastMs);

  let remaining = $state(Infinity);

  // A flare burnt: the deadline moved on, and the ring flares back up.
  let flaring = $state(false);
  let lastEnd: number | null = null;
  $effect(() => {
    const end = deadline;
    if (end !== null && lastEnd !== null && end > lastEnd + 500) {
      flaring = true;
      const t = setTimeout(() => (flaring = false), 1600);
      lastEnd = end;
      return () => clearTimeout(t);
    }
    lastEnd = end;
  });
  let lastTick = -1;
  let started = false;

  // Delve: while the clock runs, the light shrinks with it (lib/darkness.ts).
  // The ring of the question on screen drives it (a new one takes over from
  // one still fading out), and lets it lift when the clock stops.
  const delve = $derived(!!st?.delve);
  let dark: Pressure | null = null;
  $effect(() => {
    if (!delve || deadline === null || stopped) return;
    const own = claimPressure();
    dark = own;
    return () => {
      own.release();
      if (dark === own) dark = null;
    };
  });

  $effect(() => {
    if (deadline === null) {
      remaining = span * 1000;
      return;
    }
    const end = deadline;
    if (stopped) {
      // Mounted already stopped (a refresh or rejoin during a reveal): show the time that was left.
      // A ring that ran keeps the value it froze at.
      if (!started) remaining = Math.max(0, end - session.hostNow());
      return;
    }
    started = true;
    let raf = 0;
    const loop = () => {
      const left = Math.max(0, end - session.hostNow());
      const secs = Math.ceil(left / 1000);
      dark?.set(pressureOf(left, span * 1000, warnFrom));
      // The ring is redrawn only once its end has moved a third of a pixel
      // (or the number changes): on a 20 s timer about 25 times a second
      // rather than every frame, and each redraw repaints its glow.
      if (secs !== Math.ceil(remaining / 1000) || left === 0 || (Math.abs(remaining - left) * C) / (span * 1000) >= 1 / 3) {
        remaining = left;
      }
      if (secs <= warnFrom && secs > 0 && secs !== lastTick) {
        lastTick = secs;
        sfx('tick');
        if (el) timerTick(el, secs);
      }
      if (left > 0) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });

  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = $derived(Math.min(1, remaining / (span * 1000)));
  const secs = $derived(Number.isFinite(remaining) ? Math.ceil(remaining / 1000) : span);
  const urgent = $derived(remaining <= warnFrom * 1000);
  /** The fast window is still open: from where it closes on the ring up to the ring's head. */
  const fast = $derived(azurite && remaining > fastEnd);
  const fastFrom = $derived(Math.max(0, Math.min(1, fastEnd / (span * 1000))));
  /** Where the window closes, as a notch across the ring (the svg is turned so 0° is the top). */
  const notch = $derived.by(() => {
    const a = fastFrom * 2 * Math.PI;
    const at = (r: number) => `${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;
    return `M${at(R - 4.5)}L${at(R + 4.5)}`;
  });

  let el = $state<HTMLElement>();
</script>

<div
  class="timer"
  bind:this={el}
  class:urgent={urgent && !fast}
  class:stopped
  class:azurite
  class:fast
  class:flaring
  role="timer"
  aria-label={fast ? `${secs} seconds left, ${Math.ceil((remaining - fastEnd) / 1000)} to earn a ward` : `${secs} seconds left`}
>
  <svg viewBox="0 0 64 64">
    <circle class="track" cx="32" cy="32" r={R} />
    <circle class="fill" cx="32" cy="32" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
    {#if fast}
      <circle class="window" cx="32" cy="32" r={R} stroke-dasharray="{C * Math.max(0, frac - fastFrom)} {C}" stroke-dashoffset={-C * fastFrom} />
      <path class="notch" d={notch} />
    {/if}
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
    /* Let the ring's drop-shadow glow extend past the 64px viewBox. */
    overflow: visible;
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
  /* Azurite: the fast window in cold blue at the ring's head, a notch where
     it closes; once it has, the ring goes on in gold. */
  .azurite .track {
    stroke: rgba(110, 170, 240, 0.12);
  }
  .window {
    stroke: #6fb4ff;
    stroke-linecap: round;
    filter: drop-shadow(0 0 5px rgba(80, 150, 255, 0.85));
  }
  .notch {
    stroke: #d4e9ff;
    stroke-width: 1.4;
    filter: drop-shadow(0 0 3px rgba(80, 150, 255, 0.9));
  }
  .fast span {
    color: #d4e9ff;
    text-shadow: 0 0 10px rgba(80, 150, 255, 0.8);
  }
  /* A flare: the ring fills back up in a burst of hot red light. */
  .flaring .fill {
    stroke: #ffb38a;
    filter: drop-shadow(0 0 8px rgba(255, 110, 60, 0.95));
    transition:
      stroke-dashoffset 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2),
      stroke 0.3s;
  }
  .flaring span {
    color: #ffe2cf;
    animation: flare-up 0.8s ease-out;
  }
  .flaring::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 140, 80, 0.55), transparent 65%);
    animation: flare-burst 1.4s ease-out forwards;
    pointer-events: none;
  }
  @keyframes flare-up {
    30% {
      transform: scale(1.45);
      text-shadow: 0 0 14px rgba(255, 120, 60, 0.95);
    }
  }
  @keyframes flare-burst {
    from {
      opacity: 1;
      transform: scale(0.6);
    }
    to {
      opacity: 0;
      transform: scale(1.5);
    }
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
