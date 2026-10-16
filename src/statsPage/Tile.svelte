<script lang="ts">
  // One of the headline figures: what it counts, the number, how it moved
  // against the period before (when there was one), a line under it saying
  // more, and its days as a small trace in the corner, the last day lit.
  import { change } from './model';

  let {
    label,
    value,
    before = null,
    days = 0,
    sub = '',
    trend = [],
  }: { label: string; value: string | number; before?: number | null; days?: number; sub?: string; trend?: number[] } = $props();

  const delta = $derived(typeof value === 'number' && before !== null ? change(value, before) : null);
  const max = $derived(Math.max(1, ...trend));
  const W = 84;
  const H = 26;
  const trace = $derived(
    trend.length > 1 ? trend.map((v, i) => `${i ? 'L' : 'M'}${((W * i) / (trend.length - 1)).toFixed(1)} ${(H - 2 - ((H - 4) * v) / max).toFixed(1)}`).join('') : '',
  );
  const last = $derived(trend.length > 1 ? { x: W, y: H - 2 - ((H - 4) * trend.at(-1)!) / max } : null);
</script>

<div class="tile">
  <div class="caption">{label}</div>
  <div class="value">{typeof value === 'number' ? value.toLocaleString('en') : value}</div>
  <div class="foot">
    {#if delta !== null}
      <span class="delta" class:up={delta > 0} class:down={delta < 0}>
        <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '●'}</span>
        {delta > 0 ? '+' : ''}{delta}% <span class="vs">vs the {days} days before</span>
      </span>
    {/if}
    {#if sub}<span class="sub">{sub}</span>{/if}
  </div>
  {#if trace}
    <svg class="trend" width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true">
      <path d={trace} />
      {#if last}<circle cx={last.x} cy={last.y} r="3" />{/if}
    </svg>
  {/if}
</div>

<style>
  .tile {
    position: relative;
    min-width: 0;
    padding: 1rem 1.1rem 0.9rem;
    background: var(--plate);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
  }
  .caption {
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .value {
    margin-top: 0.35rem;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: clamp(1.8rem, 5vw, 2.5rem);
    line-height: 1;
    color: var(--gold-hi);
  }
  .foot {
    margin-top: 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.88rem;
    line-height: 1.3;
    color: var(--muted);
  }
  .delta {
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text);
  }
  .delta span[aria-hidden] {
    font-size: 0.6rem;
  }
  .up span[aria-hidden] {
    color: var(--gold);
  }
  .down span[aria-hidden] {
    color: var(--bad);
  }
  .vs {
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .trend {
    position: absolute;
    top: 1rem;
    right: 1rem;
    overflow: visible;
  }
  .trend path {
    fill: none;
    stroke: var(--dim);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .trend circle {
    fill: var(--gold);
    stroke: var(--plate);
    stroke-width: 2;
  }
  /* A phone: two tiles a row, no room for the trace. */
  @media (max-width: 520px) {
    .tile {
      padding: 0.85rem 0.85rem 0.8rem;
    }
    .trend {
      display: none;
    }
  }
</style>
