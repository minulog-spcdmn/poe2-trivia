<script lang="ts">
  // The overview: how it's going, at a glance. Anything wrong first (joins
  // that failed), then the four figures that matter, each against the period
  // before; one chart of how busy it was; and a line of short answers, each
  // opening its view.
  import { onMount } from 'svelte';
  import Bars from './Bars.svelte';
  import { average, fmt } from './chart';
  import { withDailyItems, type DailyItem } from './dailyItems';
  import DailyTable from './DailyTable.svelte';
  import Delta from './Delta.svelte';
  import Kpi from './Kpi.svelte';
  import { MODE_NAMES, asked, finishedShare, dailyAverage, dailyDays, deviceOf, hardestAndEasiest, modesOf, percent, type Counts } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import Seg from './Seg.svelte';
  import TrendChart from './TrendChart.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  let itemOf = $state<((day: string) => DailyItem | null) | null>(null);
  const L = $derived(read.now);
  const B = $derived(read.before);
  const answers = (c: Counts) => c.daily.rightPerDay.map((r, i) => r + (c.daily.wrongPerDay[i] ?? 0));
  const tries = (c: Counts) => c.joins.reduce((n, j) => n + j.tried, 0);
  const joins = (c: Counts) => c.joins.reduce((n, j) => n + j.joined, 0);
  const rate = (part: number, whole: number) => (whole ? (100 * part) / whole : null);
  const dailyNow = $derived(dailyAverage(L));
  const dailyBefore = $derived(dailyAverage(B));

  const failed = $derived(L.failures.reduce((n, f) => n + f.count, 0));
  const worst = $derived(L.failures[0]);

  const METRICS = [
    { value: 'visitors', name: 'Visitors' },
    { value: 'games', name: 'Games' },
    { value: 'daily', name: 'Daily players' },
  ] as const;
  let metric = $state<(typeof METRICS)[number]['value']>('visitors');
  const series = (c: Counts) => (metric === 'visitors' ? c.visitors.perDay : metric === 'games' ? c.games.perDay : answers(c));

  let innerHeight = $state(900);
  /** Taller on a tall window (a monitor on its side), so the overview fills it. */
  const chartH = $derived(Math.round(Math.min(560, Math.max(280, innerHeight * 0.22))));

  const modes = $derived(
    modesOf(L.games.rows)
      .filter((m) => m.started)
      .sort((a, b) => b.started - a.started)
      .map((m) => ({ label: MODE_NAMES[m.mode], count: m.started })),
  );
  const countries = $derived(read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })));
  const phones = $derived.by(() => {
    let phone = 0;
    let all = 0;
    for (const s of read.systems) {
      all += s.count;
      if (deviceOf(s.name) === 'Phone or tablet') phone += s.count;
    }
    return { phone, all };
  });

  const days = $derived(dailyDays(L));
  const hardest = $derived(hardestAndEasiest(days.filter((d) => asked(d.day)), 3, 3).hardest);
  const named = $derived(rate(L.daily.right, L.daily.right + L.daily.wrong));
  onMount(() => withDailyItems((f) => (itemOf = f)));
</script>

<svelte:window bind:innerHeight />

{#if failed}
  <a class="problem" href="#joining">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18v.01" /></svg>
    <span>
      <b>{fmt(failed)} {failed === 1 ? 'try' : 'tries'} to join or open a room failed.</b>
      Most often: {worst.host ? 'opening a room, ' : ''}{worst.label.toLowerCase()} ({fmt(worst.count)}).
    </span>
    <span class="go">See why ›</span>
  </a>
{/if}

<div class="kpis">
  <Kpi label="Visitors" value={fmt(L.visitors.total)} means="people who opened the game" href="#visitors">
    {#snippet change()}<Delta now={L.visitors.total} before={B.visitors.total} period={period.before} />{/snippet}
  </Kpi>
  <Kpi label="Games played" value={fmt(L.games.started)} means="games started, every mode" href="#games">
    {#snippet change()}<Delta now={L.games.started} before={B.games.started} period={period.before} />{/snippet}
  </Kpi>
  <Kpi label="Daily players" value={dailyNow === null ? '–' : average(dailyNow)} means="a day, answering Today's unique" href="#daily">
    {#snippet change()}<Delta now={dailyNow} before={dailyBefore} digits={1} period={period.before} />{/snippet}
  </Kpi>
  <Kpi
    label="Joins that worked"
    value={tries(L) ? percent(joins(L), tries(L)) : '–'}
    means={tries(L) ? `of ${fmt(tries(L))} ${tries(L) === 1 ? 'try' : 'tries'} to join a room` : 'nobody tried to join a room'}
    href="#joining"
  >
    {#snippet change()}<Delta now={rate(joins(L), tries(L))} before={rate(joins(B), tries(B))} rate period={period.before} />{/snippet}
  </Kpi>
</div>

<div class="stack">
  <Section title="How busy it was" says="Each day against the same day of the period before.">
    {#snippet aside()}<Seg label="Drawn" options={METRICS} value={metric} onpick={(v) => (metric = v)} />{/snippet}
    <TrendChart days={L.days} now={series(L)} before={series(B)} {weekly} what={METRICS.find((m) => m.value === metric)?.name ?? ''} names={{ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) }} height={chartH} />
  </Section>

  <div class="three">
    <Section title="What they play">
      {#snippet aside()}<a class="to-view" href="#games">Games ›</a>{/snippet}
      <Bars bars={modes} empty="No games in these days." />
      {#if L.games.started}
        <p class="line"><b>{finishedShare(L.games.finished, L.games.started)}</b> of games were played to the end.</p>
      {/if}
    </Section>

    <Section title="Where they are">
      {#snippet aside()}<a class="to-view" href="#visitors">Visitors ›</a>{/snippet}
      <Bars bars={countries} top={5} empty="No visitors in these days." />
      {#if phones.all}
        <p class="line"><b>{percent(phones.phone, phones.all)}</b> came on a phone or tablet.</p>
      {/if}
    </Section>

    <Section title="Today's unique">
      {#snippet aside()}<a class="to-view" href="#daily">Every day ›</a>{/snippet}
      {#if named === null}
        <p class="soft">Nobody answered in these days.</p>
      {:else}
        <p class="big"><b>{Math.round(named)}%</b> named the day's item.</p>
        {#if hardest.length}
          <h3>Hardest items</h3>
          <DailyTable days={hardest} {itemOf} compact label="The hardest items of these days" />
        {/if}
      {/if}
    </Section>
  </div>
</div>

<style>
  .problem {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
    padding: 1rem 1.4rem;
    font-size: 1.2rem;
    color: var(--a-ink);
    text-decoration: none;
    background: var(--a-surface);
    border: 1px solid rgba(236, 102, 80, 0.45);
    border-left: 5px solid var(--a-down);
    border-radius: 4px;
    cursor: pointer;
  }
  .problem:hover {
    border-color: var(--a-down);
  }
  .problem svg {
    flex: none;
    width: 28px;
    height: 28px;
    fill: none;
    stroke: var(--a-down);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .problem b {
    font-weight: 650;
  }
  .go {
    margin-left: auto;
    font-weight: 600;
    white-space: nowrap;
    color: var(--a-down);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.25rem;
  }
  .stack {
    display: grid;
    gap: 1.25rem;
    margin-top: 1.25rem;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: start;
  }
  .line {
    margin: 1rem 0 0;
    color: var(--a-text);
  }
  .line b,
  .big b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .big {
    margin: 0 0 1.2rem;
    font-size: 1.3rem;
  }
  .big b {
    font-size: 2.6rem;
    letter-spacing: -0.02em;
  }
  h3 {
    margin: 0 0 0.6rem;
    font-family: var(--font-data);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--a-muted);
  }
  .soft {
    color: var(--a-muted);
  }
  @media (max-width: 1180px) {
    .three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 900px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.9rem;
    }
    .three {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 600px) {
    .problem {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      font-size: 1rem;
      padding: 0.9rem 1rem;
    }
    .go {
      grid-column: 2;
      margin-left: 0;
    }
  }
</style>
