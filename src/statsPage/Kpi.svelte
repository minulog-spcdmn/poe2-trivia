<script lang="ts">
  // A headline figure: what it counts, the number, its change against the
  // period before as a badge (gold up, red down), a line saying more, and its
  // days as a trace along the foot, the same height on every card so a row of
  // them lines up.
  import { fmt } from './chart';

  let {
    label,
    value,
    unit = '',
    delta = null,
    deltaUnit = '%',
    sub = '',
    trend = [],
  }: { label: string; value: number | null; unit?: string; delta?: number | null; deltaUnit?: string; sub?: string; trend?: number[] } = $props();

  const W = 200;
  const H = 34;
  const max = $derived(Math.max(1, ...trend));
  const pts = $derived(trend.map((v, i) => [trend.length > 1 ? (W * i) / (trend.length - 1) : W, H - 3 - ((H - 6) * v) / max] as const));
  const line = $derived(pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''));
</script>

<div class="kpi">
  <div class="label">{label}</div>
  <div class="value-row">
    <span class="value">{value === null ? '–' : fmt(value)}{#if unit && value !== null}<small>{unit}</small>{/if}</span>
    {#if delta !== null}
      <span class="delta" class:up={delta > 0} class:down={delta < 0}>
        <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '■'}</span>{delta > 0 ? '+' : ''}{delta}{deltaUnit}
      </span>
    {/if}
  </div>
  <div class="sub">{sub}</div>
  <svg class="trend" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
    {#if pts.length > 1}
      <path class="wash" d="{line}L{W} {H}L0 {H}Z" />
      <path class="line" d={line} vector-effect="non-scaling-stroke" />
    {/if}
  </svg>
</div>

<style>
  .kpi {
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 16px 18px 0;
    background: var(--plate);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 220, 150, 0.06);
    overflow: hidden;
  }
  .label {
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .value-row {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem 0.7rem;
    margin-top: 0.4rem;
  }
  .value {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 2.2rem;
    line-height: 1;
    color: var(--gold-hi);
  }
  .value small {
    font-size: 0.55em;
    margin-left: 0.05em;
    color: var(--gold);
  }
  .delta {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    padding: 0.15em 0.5em;
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
    background: rgba(150, 138, 119, 0.12);
    border-radius: 999px;
  }
  .delta span {
    font-size: 0.75em;
  }
  .delta.up {
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.16);
  }
  .delta.down {
    color: #f0a08c;
    background: rgba(224, 85, 63, 0.14);
  }
  .sub {
    min-height: 1.3em;
    margin-top: 0.35rem;
    font-size: 0.88rem;
    color: var(--muted);
  }
  .trend {
    display: block;
    width: calc(100% + 36px);
    height: 34px;
    margin: 10px -18px 0;
  }
  .wash {
    fill: var(--gold);
    opacity: 0.08;
  }
  .line {
    fill: none;
    stroke: var(--gold);
    stroke-width: 1.5;
    stroke-linejoin: round;
    opacity: 0.8;
  }
  @media (max-width: 520px) {
    .kpi {
      padding: 12px 12px 0;
    }
    .value {
      font-size: 1.7rem;
    }
    .trend {
      width: calc(100% + 24px);
      margin: 8px -12px 0;
      height: 26px;
    }
  }
</style>
