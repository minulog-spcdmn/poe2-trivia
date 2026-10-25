<script lang="ts">
  // When they come: a week as seven rows of 24 hours, each hour as bright
  // as its average against the busiest (model.ts weekAverage), so the
  // evenings and the weekend show at a glance. An hour no day has had yet (a
  // week's today, later than now) is left out, not drawn as an empty one.
  // `once`: each weekday had a single day, so a figure is that day's, not
  // an average. A line below reads the busiest hour, or the one pointed at;
  // it sits over its longest wording, kept hidden, so pointing never changes
  // its height and moves what's below.
  // Without `byDay`, the grid is a single row, every day's hours together
  // (too few counted to tell the weekdays apart), drawn as bars in the room
  // the seven rows take, so the panel keeps its height either way. `sure`:
  // the busiest hour is busier than chance would make it; if not, the line
  // says no hour stands out yet (pointing still reads any).
  import { average } from './chart';
  import { busiest } from './model';

  let {
    grid,
    what,
    zone,
    once = false,
    byDay = true,
    sure = true,
  }: { grid: (number | null)[][]; what: string; zone: string; once?: boolean; byDay?: boolean; sure?: boolean } = $props();

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const top = $derived(busiest(grid));
  let at = $state<{ day: number; hour: number } | null>(null);
  const shown = $derived<{ day: number; hour: number; value: number | null } | null>(at ? { ...at, value: grid[at.day][at.hour] } : top);
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
  /** An hour of the grid in words: "Wednesdays, 04:00 to 05:00", or the hours alone where the days are together. */
  const when = (d: number, h: number) => `${byDay ? `${DAYS[d]}s, ` : ''}${hour(h)} to ${hour((h + 1) % 24)}`;
  /** Brightness of a cell: its share of the busiest. */
  const level = (v: number | null) => (top && v ? Math.round((100 * v) / top.value) : 0);
  const per = $derived(once ? 'in that hour' : 'an hour on average');
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
    aria-label="{what} by {byDay ? 'weekday and hour' : 'hour of the day'}, on average.{top ? ` Busiest ${byDay ? `on ${DAYS[top.day]}s ` : ''}at ${hour(top.hour)}.` : ''}"
    onpointerover={point}
    onpointerdown={point}
    onpointerleave={() => (at = null)}
  >
    {#each grid as row, d (d)}
      <span class="day" aria-hidden="true">{byDay ? DAYS[d].slice(0, 3) : 'Every day'}</span>
      {#each row as v, h (h)}
        {#if byDay}
          <i data-d={d} data-h={h} class:on={at?.day === d && at.hour === h} class:yet={v === null} style:--l="{level(v)}%"></i>
        {:else}
          <i class="bar" data-d={d} data-h={h} class:on={at?.hour === h} class:yet={v === null}><b style:height="{Math.max(level(v), v ? 4 : 0)}%"></b></i>
        {/if}
      {/each}
    {/each}
    <span></span>
    {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
      <span class="hour" aria-hidden="true">{h % 3 === 0 ? h : ''}</span>
    {/each}
  </div>
  <p class="read">
    <span aria-live="polite">
      {#if shown && shown.value === null}
        <b>{when(shown.day, shown.hour)}</b>: not yet in these days.
      {:else if !at && top && !sure}
        No hour stands out beyond what chance makes of so few yet.
      {:else if shown && shown.value !== null && shown.value > 0}
        <b>{when(shown.day, shown.hour)}</b>: {average(shown.value)} {what.toLowerCase()} {per}{at ? '' : ', the busiest'}.
      {:else if shown}
        <b>{when(shown.day, shown.hour)}</b>: none.
      {:else}
        Nothing counted in these days.
      {/if}
    </span>
    {#if top}
      <span class="sizer" aria-hidden="true"><b>{byDay ? 'Wednesdays, ' : ''}00:00 to 00:00</b>: {widest} {what.toLowerCase()} {per}, the busiest.</span>
    {/if}
  </p>
  <p class="zone">{byDay ? '' : 'Every day together, till there are four weeks to tell weekdays apart. '}Hours in {zone.replace(/_/g, ' ')} time, where GoatCounter counts them.</p>
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
  /* An hour not yet had: its place kept, an outline where the cell would be. */
  .grid i.yet {
    background: none;
    box-shadow: inset 0 0 0 1px var(--a-rule);
  }
  /* Every day's hours as bars, in the height seven rows of cells take. */
  .grid i.bar {
    display: flex;
    align-items: flex-end;
    aspect-ratio: 1 / 7.6;
    min-height: 6.6rem;
    background: var(--a-track);
  }
  .grid i.bar b {
    display: block;
    width: 100%;
    border-radius: 2px 2px 0 0;
    background: var(--a-now);
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
  .grid:has(.bar) .day {
    align-self: end;
    line-height: 1.15;
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
