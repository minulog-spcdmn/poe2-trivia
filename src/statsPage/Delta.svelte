<script lang="ts">
  // A figure's change against the period before, said once: an arrow and the
  // change, green where it's better and red where it's worse (a count going
  // up is better; for failures, `worse="up"`; neither, for a change that's
  // no better or worse, `worse="neither"`), then what it was before: short,
  // "from 1,785", the period it's from in its title (the page's header says
  // it once for all).
  // `rate`: the figures are percents, the change in points.
  // A change chance could have made (insights.ts beyondChanceOf) is said
  // but not coloured: 3 visitors against 1 is no news. Counts are weighed
  // by themselves; a rate by `of`, how many each period's percent is of; an
  // average by `of` too, the counts behind it (the period before's brought
  // to as many days). Without `of`, a rate or an average is taken as sure.
  import { fmt } from './chart';
  import { beyondChanceOf, rateBeyondChance } from './insights';

  let {
    now,
    before,
    rate = false,
    worse = 'down',
    period,
    digits = 0,
    of,
  }: { now: number | null; before: number | null; rate?: boolean; worse?: 'up' | 'down' | 'neither'; period: string; digits?: number; of?: { now: number; before: number } } = $props();

  // The figure before, as precise as the figure itself is shown (chart.ts average: one decimal under 10, whole above).
  // A rate with `digits` keeps them (a failure rate of 1.6%).
  const show = (v: number) => (rate ? `${digits ? v.toFixed(digits) : Math.round(v)}%` : fmt(Number(v.toFixed(digits && v < 10 ? digits : 0))));
  const step = $derived.by(() => {
    if (now === null || before === null) return null;
    // A rate's change is what its two figures, as shown, differ by.
    const shown = (v: number) => (digits ? Number(v.toFixed(digits)) : Math.round(v));
    if (rate) return Number((shown(now) - shown(before)).toFixed(digits));
    if (before <= 0) return null;
    return Math.round((100 * (now - before)) / before);
  });
  const sure = $derived.by(() => {
    if (now === null || before === null) return false;
    if (rate) return of ? rateBeyondChance(now, of.now, before, of.before) : true;
    if (of) return beyondChanceOf(of.now, of.before);
    return digits ? true : beyondChanceOf(now, before);
  });
  const tone = $derived(step === null || step === 0 || worse === 'neither' || !sure ? 'flat' : (step > 0) === (worse === 'down') ? 'up' : 'down');
</script>

{#if now !== null && before !== null && (now > 0 || before > 0)}
  <span class="delta">
    {#if step !== null}
      <b class={tone} title={sure ? undefined : 'Within what chance alone moves a count this size'}><span aria-hidden="true">{step > 0 ? '▲' : step < 0 ? '▼' : '='}</span> {step > 0 ? '+' : step < 0 ? '−' : ''}{Math.abs(step)}{rate ? (Math.abs(step) === 1 ? ' pt' : ' pts') : '%'}</b>
      <span class="was" title={period ? `In ${period}` : undefined}>from {show(before)}</span>
    {:else}
      <span class="was" title={period ? `In ${period}` : undefined}>none before</span>
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
