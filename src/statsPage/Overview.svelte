<script lang="ts">
  // The overview: how it's going, at a glance, on one screen where it's big
  // enough (a 1440p or 4K monitor). What the last update brought and anything
  // wrong first, then the four figures that matter beside what happened and
  // how far a visit gets; one chart of how busy it was, its busiest days
  // ringed; and a row of short answers, each opening its view.
  import { onMount } from 'svelte';
  import Bars from './Bars.svelte';
  import { freshOf } from './changes';
  import { average, fmt, shortDay } from './chart';
  import { withDailyItems, type DailyItem } from './dailyItems';
  import DailyTable from './DailyTable.svelte';
  import Delta from './Delta.svelte';
  import { fitChart } from './fitChart.svelte';
  import Kpi from './Kpi.svelte';
  import NewSince from './NewSince.svelte';
  import { DAILY_FROM, MODE_NAMES, asked, finishedShare, dailyAverage, dailyDays, deviceOf, hardestAndEasiest, modesOf, percent, sharePerDay, weekAverage, type Counts } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import Seg from './Seg.svelte';
  import { deviceLink, modeLink, placeLink } from './slices';
  import Spark from './Spark.svelte';
  import TrendChart from './TrendChart.svelte';
  import WeekHours from './WeekHours.svelte';
  import WhatHappened from './WhatHappened.svelte';
  import Steps from './Steps.svelte';
  import { spikesOf } from './insights';

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

  const WEEK = [
    { value: 'visitors', name: 'Visitors' },
    { value: 'games', name: 'Games' },
  ] as const;
  let weekOf = $state<(typeof WEEK)[number]['value']>('visitors');
  const week = $derived(L.week[weekOf]);

  let innerHeight = $state(900);
  let innerWidth = $state(1400);
  /** Wide (the side column beside it): about what one screen leaves it; narrower, a good height of its own. */
  /** A monitor on its side (taller than wide, wider than a phone): the overview fitted to it as to a big one. */
  const sideways = $derived(innerHeight > innerWidth && innerWidth >= 900);
  const oneScreen = $derived(innerWidth > 1500 || sideways);
  /** The figures' comparisons said short where the cards are narrow (a monitor on its side): "from 1,861 before". */
  const before = $derived(sideways ? 'before' : period.before);
  const chartBase = $derived(Math.round(oneScreen ? Math.max(200, innerHeight * (sideways ? 0.2 : 0.18)) : Math.min(560, Math.max(260, innerHeight * 0.27))));
  /** Wide or on its side, the chart's height fitted to the screen, so the whole overview is one screen: smaller where the rest runs past it, taller where it leaves room. */
  const chart = fitChart({ on: () => oneScreen, base: () => chartBase, most: () => innerHeight * 0.42 });
  /** The chart's panel ends level with the column beside it: the chart takes whatever its panel has past its own height (less its legend above). */
  let fillH = $state(0);
  let fillEl = $state<HTMLElement>();
  let legendH = $state(48);
  $effect(() => {
    void fillH;
    void metric;
    const l = fillEl?.querySelector<HTMLElement>('.legend');
    if (l) legendH = l.offsetHeight + parseFloat(getComputedStyle(l).marginBottom);
  });
  const drawnH = $derived(Math.max(chart.height, Math.floor(fillH - legendH)));
  /** The days far busier than usual, ringed on the chart (only on the visitors' line, which they're read from). */
  const spikes = $derived(metric === 'visitors' ? spikesOf(L.days, L.visitors.perDay).map((s) => s.day) : []);

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
  const hardest = $derived(hardestAndEasiest(days.filter((d) => asked(d.day)), 3, 2).hardest);
  const named = $derived(rate(L.daily.right, L.daily.right + L.daily.wrong));
  onMount(() => withDailyItems((f) => (itemOf = f)));
</script>

<svelte:window bind:innerHeight bind:innerWidth />

<div class="ov">
  <div class="kpis">
    <Kpi label="Visitors" value={fmt(L.visitors.total)} means="people who opened the game" href="#visitors">
      {#snippet spark()}<Spark days={L.days} values={L.visitors.perDay} {weekly} label="Visitors a day" />{/snippet}
      {#snippet change()}<Delta now={L.visitors.total} before={B.visitors.total} period={before} />{/snippet}
    </Kpi>
    <Kpi label="Games played" value={fmt(L.games.started)} means="games started, every mode" href="#games">
      {#snippet spark()}<Spark days={L.days} values={L.games.perDay} {weekly} label="Games a day" />{/snippet}
      {#snippet change()}<Delta now={L.games.started} before={B.games.started} period={before} />{/snippet}
    </Kpi>
    <Kpi label="Daily players" value={dailyNow === null ? '–' : average(dailyNow)} means="a day, answering Today's unique" href="#daily">
      {#snippet spark()}<Spark days={L.days.filter(asked)} values={answers(L).filter((_, i) => asked(L.days[i]))} {weekly} label="Players of Today's unique a day" />{/snippet}
      {#snippet change()}{#if dailyNow !== null && dailyBefore === null}<span class="soft">Nothing to compare: it began {shortDay(DAILY_FROM)}</span>{:else}<Delta now={dailyNow} before={dailyBefore} digits={1} period={before} />{/if}{/snippet}
    </Kpi>
    <Kpi
      label="Joins worked"
      value={tries(L) ? percent(joins(L), tries(L)) : '–'}
      means={tries(L) ? `of ${fmt(tries(L))} ${tries(L) === 1 ? 'try' : 'tries'} to join a room` : 'nobody tried to join a room'}
      href="#joining"
    >
      {#snippet spark()}<Spark days={L.days} values={sharePerDay(L.joinsPerDay.joined, L.joinsPerDay.tried)} {weekly} label="Share of joins that worked, a day" />{/snippet}
      {#snippet change()}<Delta now={rate(joins(L), tries(L))} before={rate(joins(B), tries(B))} rate period={before} />{/snippet}
    </Kpi>
    <Steps {read} period={{ ...period, before }} />
  </div>
  <div class="chart">
    <Section title="How busy it was" says={oneScreen ? '' : 'Each day against the same day of the period before.'}>
      {#snippet aside()}<Seg label="Drawn" options={METRICS} value={metric} onpick={(v) => (metric = v)} />{/snippet}
      <div class="fill" bind:this={fillEl} bind:clientHeight={fillH} style:min-height="{chart.height + legendH}px">
        <TrendChart days={L.days} now={series(L)} before={series(B)} {weekly} what={METRICS.find((m) => m.value === metric)?.name ?? ''} names={{ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) }} height={drawnH} marks={spikes} />
      </div>
    </Section>
  </div>
  <div class="side">
    {#if read.changes || failed}
    <div class="alerts">
      {#if read.changes}
        <div class="since"><NewSince changes={read.changes} at={read.at} /></div>
      {/if}

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
    </div>
    {/if}
    <div class="happened">
      <Section title="What happened" says={oneScreen ? '' : 'What the numbers bear out by themselves.'}>
        <WhatHappened {read} {period} />
      </Section>
    </div>
  </div>
  <div class="four">
  <Section title="When they come">
    {#snippet aside()}<Seg label="Counted" options={WEEK} value={weekOf} onpick={(v) => (weekOf = v)} />{/snippet}
    {#if week}
      <WeekHours grid={weekAverage(week, L.days)} what={weekOf === 'visitors' ? 'Visitors' : 'Games'} zone={read.zone} />
    {:else}
      <p class="soft">GoatCounter gave no hours for these days.</p>
    {/if}
  </Section>

  <Section title="What they play">
    {#snippet aside()}<a class="to-view" href="#games">Games ›</a>{/snippet}
    <Bars bars={modes} empty="No games in these days." link={modeLink} fresh={freshOf(read.changes, read.at, 'modes')} />
    {#if L.games.started}
      <p class="line"><b>{finishedShare(L.games.finished, L.games.started)}</b> of games were played to the end.</p>
    {/if}
  </Section>

  <Section title="Where they are">
    {#snippet aside()}<a class="to-view" href="#visitors">Visitors ›</a>{/snippet}
    <Bars bars={countries} top={5} empty="No visitors in these days." link={placeLink} fresh={freshOf(read.changes, read.at, 'countries')} />
    {#if phones.all}
      <p class="line"><b>{percent(phones.phone, phones.all)}</b> came on a <a class="pick" href={deviceLink('Phone or tablet')}>phone or tablet</a>.</p>
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
  /* (A grid, so what's new fills the room its row gives it.) */
  .since {
    display: grid;
  }
  .problem {
    display: flex;
    align-items: center;
    gap: 1rem;
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
  /*
   * One grid: the figures and the chart, and beside them what the last
   * update brought, anything wrong, what happened and how far a visit gets;
   * the short answers in a row below. Narrower, the side's parts take rows
   * of their own (display: contents), what's new and wrong first.
   */
  .ov {
    display: grid;
    grid-template-columns: minmax(0, 2.3fr) minmax(0, 1fr);
    grid-template-areas:
      'kpis kpis'
      'chart side'
      'four four';
    gap: 1.25rem;
  }
  .kpis {
    grid-area: kpis;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1.25rem;
  }
  /* The chart's panel as tall as its row (the column beside it may be taller); the chart fills it, never under its own height (the min-height set above). */
  .chart {
    grid-area: chart;
    display: flex;
    min-width: 0;
  }
  .chart > :global(.section) {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
  }
  .fill {
    flex: 1 1 0;
  }
  .side {
    grid-area: side;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
  }
  .alerts {
    grid-area: alerts;
    display: grid;
    gap: 1.25rem;
  }
  .happened {
    grid-area: happened;
    flex: 1 1 auto;
    display: grid;
  }
  .four {
    grid-area: four;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.25rem;
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
  /* A big monitor: the chart is right below the figures, so their small lines would only say it twice. */
  @media (min-width: 1900px) {
    .ov,
    .kpis,
    .side,
    .four {
      gap: 1rem;
    }
    .kpis :global(.spark) {
      display: none;
    }
  }
  @media (max-width: 1500px) {
    .ov {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'alerts alerts'
        'kpis kpis'
        'chart chart'
        'happened happened'
        'four four';
    }
    .side {
      display: contents;
    }
    .four {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 1200px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.9rem;
    }
    /* The fifth figure a row of its own. */
    .kpis > :global(:last-child) {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 900px) {
    .ov {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'alerts'
        'kpis'
        'chart'
        'happened'
        'four';
    }
    .four {
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
  /* A monitor on its side: everything stacked in the screen's height, the five figures in a row, the short answers two by two. */
  @media (orientation: portrait) and (min-width: 900px) {
    /* What a list hides stays hidden, and the time zone goes without saying. */
    .four :global(.more),
    .four :global(.zone) {
      display: none;
    }
    /* What's new and what went wrong down the left of the top row, what happened beside them: the chart keeps the room a row of its own would take. */
    .ov {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'alerts happened'
        'kpis kpis'
        'chart chart'
        'four four';
      gap: 1rem;
    }
    .ov:not(:has(.alerts)) {
      grid-template-areas:
        'happened happened'
        'kpis kpis'
        'chart chart'
        'four four';
    }
    .side {
      display: contents;
    }
    /* The last of them takes what What happened leaves beside them, so the two columns end level. */
    .alerts {
      grid-template-rows: auto minmax(0, 1fr);
      gap: 1rem;
    }
    .alerts:not(:has(> :nth-child(2))) {
      grid-template-rows: minmax(0, 1fr);
    }
    .kpis {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.8rem;
    }
    .kpis > :global(:last-child) {
      grid-column: auto;
    }
    .four {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }
  }
</style>
