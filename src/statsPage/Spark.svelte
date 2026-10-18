<script lang="ts">
  // A figure's days in a line, small, under a headline figure: the shape of
  // the period at a glance, no axis. The newest point isn't over, so its
  // last stretch is drawn faint, as on the big chart.
  import { grouped } from './model';

  let { days, values, weekly, label }: { days: string[]; values: number[]; weekly: boolean; label: string } = $props();

  const vs = $derived(grouped(days, values, weekly ? 7 : 1).values);
  const n = $derived(vs.length);
  const W = 200;
  const H = 40;
  const top = $derived(Math.max(1, ...vs));
  const x = (i: number) => (n > 1 ? (W * i) / (n - 1) : W / 2);
  const y = (v: number) => H - 2 - ((H - 4) * v) / top;
  const line = (from: number, to: number) =>
    vs
      .slice(from, to)
      .map((v, i) => `${i ? 'L' : 'M'}${x(from + i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join('');
</script>

{#if n > 1}
  <svg class="spark" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label={label}>
    <path class="area" d="{line(0, n)}L{W} {H}L0 {H}Z" />
    <path class="line" d={line(0, n - 1)} />
    <path class="line so-far" d={line(n - 2, n)} />
  </svg>
{/if}

<style>
  .spark {
    display: block;
    width: 100%;
    height: 2.4rem;
    overflow: visible;
  }
  .line {
    fill: none;
    stroke: var(--a-now);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .so-far {
    opacity: 0.45;
    stroke-dasharray: 2 5;
  }
  .area {
    fill: var(--a-now);
    opacity: 0.08;
  }
</style>
