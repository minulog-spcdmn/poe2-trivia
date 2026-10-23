<script lang="ts">
  // Who keeps coming back, by the week they first played (model.ts
  // cohortsOf): a row for each of the latest weeks the columns reach
  // (insights.ts recentCohorts), a column for each week after it. A cell is that week's visits from them for each 100 who first
  // played then; a week that began before the period has no count of those
  // who started, so its visits alone, and a week the period holds none of
  // says "–". Shaded by the share, so the fall from
  // week to week shows at a glance.
  import { fmt, shortDay } from './chart';
  import type { Cohort } from './model';

  // `cohorts`: those to show (insights.ts recentCohorts), `cols` weeks at most.
  let { cohorts, cols = 8 }: { cohorts: Cohort[]; cols?: number } = $props();

  const span = $derived(Math.min(cols, Math.max(1, ...cohorts.map((c) => c.weeks.length))));
  const share = (c: Cohort, n: number) => (c.started ? (100 * n) / c.started : null);
</script>

<div class="scroll-x">
  <table class="table cohorts" aria-label="Visits by the week they first played, each week after">
    <thead>
      <tr>
        <th scope="col">First played</th>
        <th scope="col" class="n">Started</th>
        {#each Array.from({ length: span }, (_, k) => k) as k (k)}<th scope="col" class="n">{k === 0 ? 'Same week' : `+${k}`}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each cohorts as c (c.week)}
        <tr>
          <th scope="row">Week of {shortDay(c.monday)}</th>
          <td class="n soft">{c.started === null ? '–' : fmt(c.started)}</td>
          {#each Array.from({ length: span }, (_, k) => k) as k (k)}
            {@const n = c.weeks[k]}
            {@const s = n == null ? null : share(c, n)}
            <td class="n cell" class:empty={n == null} title={n == null ? undefined : `${fmt(n)} visits`} style:--lit={s === null ? (n ? 0.15 : 0) : Math.min(1, s / 100)}>
              {n === undefined ? '' : n === null ? '–' : s === null ? fmt(n) : `${Math.round(s)}%`}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .cohorts th[scope='col']:not(:first-child),
  .cohorts td {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  /* A cell lit gold as far as its share goes. */
  .cell {
    color: var(--a-ink);
    background: rgba(217, 176, 98, calc(0.06 + 0.34 * var(--lit, 0)));
    border-left: 2px solid var(--a-surface);
  }
  /* A week still to come, or one before the period. */
  .cell.empty {
    color: var(--a-muted);
    background: none;
  }
</style>
