<script lang="ts">
  // When they come: a week as seven rows of 24 hours, each hour as bright
  // as its average against the busiest (model.ts weekAverage), so the
  // evenings and the weekend show at a glance. A line below reads the
  // busiest hour, or the one pointed at; it sits over its longest wording,
  // kept hidden, so pointing never changes its height and moves what's below.
  import { average } from './chart';
  import { busiest } from './model';

  let { grid, what, zone }: { grid: number[][]; what: string; zone: string } = $props();

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const top = $derived(busiest(grid));
  let at = $state<{ day: number; hour: number } | null>(null);
  const shown = $derived(at ? { ...at, value: grid[at.day][at.hour] } : top);
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
  /** Brightness of a cell: its share of the busiest, with a floor so an empty hour still shows as a cell. */
  const level = (v: number) => (top ? Math.round((100 * v) / top.value) : 0);
  /** The widest a figure in the line gets: the busiest hour's, or one with a decimal. */
  const widest = $derived([top ? average(top.value) : '', '0.0'].reduce((a, b) => (b.length > a.length ? b : a)));

  function point(e: PointerEvent) {
    const cell = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-h]') : null;
    at = cell ? { day: Number(cell.dataset.d), hour: Number(cell.dataset.h) } : null;
  }
</script>

<div class="week">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="grid"
    role="img"
    aria-label="{what} by weekday and hour, on average.{top ? ` Busiest on ${DAYS[top.day]}s at ${hour(top.hour)}.` : ''}"
    onpointerover={point}
    onpointerdown={point}
    onpointerleave={() => (at = null)}
  >
    {#each grid as row, d (d)}
      <span class="day" aria-hidden="true">{DAYS[d].slice(0, 3)}</span>
      {#each row as v, h (h)}
        <i data-d={d} data-h={h} class:on={at?.day === d && at.hour === h} style:--l="{level(v)}%"></i>
      {/each}
    {/each}
    <span></span>
    {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
      <span class="hour" aria-hidden="true">{h % 3 === 0 ? h : ''}</span>
    {/each}
  </div>
  <p class="read">
    <span aria-live="polite">
      {#if shown && shown.value > 0}
        <b>{DAYS[shown.day]}s, {hour(shown.hour)} to {hour((shown.hour + 1) % 24)}</b>: {average(shown.value)} {what.toLowerCase()} an hour on average{at ? '' : ', the busiest'}.
      {:else if shown}
        <b>{DAYS[shown.day]}s, {hour(shown.hour)} to {hour((shown.hour + 1) % 24)}</b>: none.
      {:else}
        Nothing counted in these days.
      {/if}
    </span>
    {#if top}
      <span class="sizer" aria-hidden="true"><b>Wednesdays, 00:00 to 00:00</b>: {widest} {what.toLowerCase()} an hour on average, the busiest.</span>
    {/if}
  </p>
  <p class="zone">Hours in {zone.replace(/_/g, ' ')} time, where GoatCounter counts them.</p>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 2.6rem repeat(24, minmax(0, 1fr));
    gap: 3px;
    touch-action: pan-y;
  }
  .grid i {
    display: block;
    aspect-ratio: 1;
    min-height: 0.9rem;
    border-radius: 2px;
    background: color-mix(in srgb, var(--a-now) var(--l), var(--a-track));
    cursor: default;
  }
  .grid i.on {
    outline: 2px solid var(--a-ink);
    outline-offset: 1px;
  }
  .day,
  .hour {
    font-size: 0.85rem;
    line-height: 1;
    color: var(--a-muted);
  }
  .day {
    align-self: center;
  }
  .hour {
    padding-top: 0.35rem;
  }
  .read {
    display: grid;
    margin: 1rem 0 0;
    color: var(--a-text);
  }
  .read > span {
    grid-area: 1 / 1;
  }
  .sizer {
    visibility: hidden;
  }
  .read b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .zone {
    margin: 0.3rem 0 0;
    font-size: 0.95rem;
    color: var(--a-muted);
  }
  @media (max-width: 600px) {
    .grid {
      grid-template-columns: 2.2rem repeat(24, minmax(0, 1fr));
      gap: 2px;
    }
    .grid i {
      min-height: 0;
    }
    .day,
    .hour {
      font-size: 0.75rem;
    }
  }
</style>
