<script lang="ts">
  // A figure's change against the period before, said once: an arrow and the
  // change, green where it's better and red where it's worse (a count going
  // up is better; for failures, `worse="up"`; neither, for a change that's
  // no better or worse, `worse="neither"`), then what it was before.
  // `rate`: the figures are percents, the change in points.
  import { fmt } from './chart';

  let {
    now,
    before,
    rate = false,
    worse = 'down',
    period,
    digits = 0,
  }: { now: number | null; before: number | null; rate?: boolean; worse?: 'up' | 'down' | 'neither'; period: string; digits?: number } = $props();

  const show = (v: number) => (rate ? `${Math.round(v)}%` : fmt(Number(v.toFixed(digits))));
  const step = $derived.by(() => {
    if (now === null || before === null) return null;
    if (rate) return Math.round(now) - Math.round(before);
    if (before <= 0) return null;
    return Math.round((100 * (now - before)) / before);
  });
  const tone = $derived(step === null || step === 0 || worse === 'neither' ? 'flat' : (step > 0) === (worse === 'down') ? 'up' : 'down');
</script>

{#if now !== null && before !== null && (now > 0 || before > 0)}
  <span class="delta">
    {#if step !== null}
      <b class={tone}><span aria-hidden="true">{step > 0 ? '▲' : step < 0 ? '▼' : '='}</span> {step > 0 ? '+' : step < 0 ? '−' : ''}{Math.abs(step)}{rate ? ' pts' : '%'}</b>
      <span class="was">from {show(before)} {period}</span>
    {:else}
      <span class="was">none {period}</span>
    {/if}
  </span>
{/if}

<style>
  .delta {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.55rem;
  }
  b {
    font-weight: 650;
    white-space: nowrap;
  }
  b span {
    font-size: 0.8em;
  }
  .was {
    color: var(--a-muted);
  }
</style>
