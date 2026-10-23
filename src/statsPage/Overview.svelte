<script lang="ts">
  // The overview: how it's going, at a glance, on one screen where it's big
  // enough (a 1440p or 4K monitor, or one on its side). Four figures for the
  // period; one chart of how busy it was, its busiest days ringed, beside
  // today so far (with what the last update brought) and what happened; and
  // a row of short answers (when they come, where they are, what they play),
  // each opening its view. Joining only shows when it's going worse than
  // usual, as a line above it all. Room is left between the parts on
  // purpose: what's here is what's worth a glance, the rest is a click away.
  // The monitor button shows it full screen, kept awake.
  import Bars from './Bars.svelte';
  import { freshOf } from './changes';
  import { average, fmt, shortDay } from './chart';
  import Delta from './Delta.svelte';
  import { fitChart } from './fitChart.svelte';
  import { backShare, comersOf, spikesOf, troubleOf } from './insights';
  import Kpi from './Kpi.svelte';
  import { DAILY_FROM, MODE_NAMES, answersPerDay, asked, dailyAverage, deviceOf, finishedShare, modesOf, percent, weekAverage, type Counts } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import Seg from './Seg.svelte';
  import { deviceLink, modeLink, placeLink } from './slices';
  import Spark from './Spark.svelte';
  import Steps from './Steps.svelte';
  import Today from './Today.svelte';
  import TrendChart from './TrendChart.svelte';
  import WeekHours from './WeekHours.svelte';
  import WhatHappened from './WhatHappened.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const dailyNow = $derived(dailyAverage(L));
  const dailyBefore = $derived(dailyAverage(B));

  /** Joining worse than usual (insights.ts troubleOf), and what failed most there (the scripts' errors aren't joining's). */
  const trouble = $derived(troubleOf(L, B));
  const worst = $derived(L.failures.find((f) => !f.script));
  /** Of the visits that found a save or none, those that found one (insights.ts backShare). */
  const back = $derived(backShare(comersOf(L)));

  const METRICS = [
    { value: 'visitors', name: 'Visitors' },
    { value: 'games', name: 'Games' },
    { value: 'daily', name: 'Daily players' },
  ] as const;
  let metric = $state<(typeof METRICS)[number]['value']>('visitors');
  const series = (c: Counts) => (metric === 'visitors' ? c.visitors.perDay : metric === 'games' ? c.games.perDay : answersPerDay(c));

  const WEEK = [
    { value: 'visitors', name: 'Visitors' },
    { value: 'games', name: 'Games' },
  ] as const;
  let weekOf = $state<(typeof WEEK)[number]['value']>('visitors');
  const week = $derived(L.week[weekOf]);

  let innerHeight = $state(900);
  let innerWidth = $state(1400);
  /** A monitor on its side (taller than wide, wider than a phone): the overview fitted to it as to a big one. */
  const sideways = $derived(innerHeight > innerWidth && innerWidth >= 900);
  const oneScreen = $derived(innerWidth > 1500 || sideways);
  /** A big monitor the usual way round: what happened joins the short answers below, so the chart has the height beside today's box. */
  const big = $derived(innerWidth >= 1900 && !sideways);
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
</script>

<svelte:window bind:innerHeight bind:innerWidth />

{#if trouble}
  <a class="problem" href="#joining">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18v.01" /></svg>
    <span>
      <b>Joining fails more than usual.</b>
      {#if trouble.today}{fmt(trouble.today.failed)} failures today so far, where about {fmt(Math.round(trouble.today.expected))} would be usual.{/if}
      {#if trouble.period}{fmt(trouble.period.failed)} in {period.now.toLowerCase()}, where about {fmt(Math.round(trouble.period.expected))} would be usual for as many games.{/if}
      {#if worst}Most often: {worst.host ? 'opening a room, ' : ''}{worst.label.toLowerCase()}.{/if}
    </span>
    <span class="go">See why ›</span>
  </a>
{/if}

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
      {#snippet spark()}<Spark days={L.days.filter(asked)} values={answersPerDay(L).filter((_, i) => asked(L.days[i]))} {weekly} label="Players of Today's unique a day" />{/snippet}
      {#snippet change()}{#if dailyNow !== null && dailyBefore === null}<span class="soft">Nothing to compare: it began {shortDay(DAILY_FROM)}</span>{:else}<Delta now={dailyNow} before={dailyBefore} digits={1} period={before} />{/if}{/snippet}
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
  {#snippet happened()}
    <div class="happened">
      <Section title="What happened" says={oneScreen ? '' : 'What the numbers bear out by themselves.'}>
        <WhatHappened {read} {period} />
      </Section>
    </div>
  {/snippet}
  <div class="now"><Today {read} tall={big && innerHeight >= 1500 && !trouble} /></div>
  {#if !big}{@render happened()}{/if}
  <div class="answers" class:four={big}>
    {#if big}{@render happened()}{/if}
    <Section title="When they come">
      {#snippet aside()}<Seg label="Counted" options={WEEK} value={weekOf} onpick={(v) => (weekOf = v)} />{/snippet}
      {#if week}
        <WeekHours grid={weekAverage(week, L.days)} what={weekOf === 'visitors' ? 'Visitors' : 'Games'} zone={read.zone} />
      {:else}
        <p class="soft">GoatCounter gave no hours for these days.</p>
      {/if}
    </Section>

    <Section title="Where they are">
      {#snippet aside()}<a class="to-view" href="#visitors">Visitors ›</a>{/snippet}
      <Bars bars={countries} top={5} empty="No visitors in these days." link={placeLink} fresh={freshOf(read.changes, read.at, 'countries')} />
      {#if phones.all || back !== null}
        <p class="line">
          {#if phones.all}<b>{percent(phones.phone, phones.all)}</b> came on a <a class="pick" href={deviceLink('Phone or tablet')}>phone or tablet</a>.{/if}
          {#if back !== null}<b>{Math.round(back)}%</b> came back to a save.{/if}
        </p>
      {/if}
    </Section>

    <Section title="What they play">
      {#snippet aside()}<a class="to-view" href="#games">Games ›</a>{/snippet}
      <Bars bars={modes} empty="No games in these days." link={modeLink} fresh={freshOf(read.changes, read.at, 'modes')} />
      {#if L.games.started}
        <p class="line"><b>{finishedShare(L.games.finished, L.games.started)}</b> of games were played to the end.</p>
      {/if}
    </Section>
  </div>
</div>

<style>
  /* Joining going worse than usual: a line above everything, opening Joining. */
  .problem {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: var(--gap);
    padding: 1rem 1.4rem;
    font-size: 1.15rem;
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
   * One grid: the figures, then the chart with what happened under it and
   * today so far beside both; the short answers in a row below. Today's
   * box is as tall as the two together; the chart's row (1fr) takes
   * whatever more it needs. Narrower, they take rows of their own, today
   * first. --gap is the room between the parts, the same everywhere.
   */
  .problem,
  .ov {
    --gap: 1.75rem;
  }
  .ov {
    display: grid;
    grid-template-columns: minmax(0, 2.3fr) minmax(0, 1fr);
    grid-template-rows: auto 1fr auto auto;
    grid-template-areas:
      'kpis kpis'
      'chart now'
      'happened now'
      'answers answers';
    gap: var(--gap);
  }
  .kpis {
    grid-area: kpis;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gap);
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
  /* (A grid, so today's box fills the room its row gives it.) */
  .now {
    grid-area: now;
    display: grid;
  }
  .happened {
    grid-area: happened;
    display: grid;
  }
  .answers {
    grid-area: answers;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--gap);
  }
  .answers.four {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .answers > .happened {
    grid-area: auto;
  }
  /* A list's top few only: the rest is in its view. */
  .answers :global(.more) {
    display: none;
  }
  .line {
    margin: 1rem 0 0;
    color: var(--a-text);
  }
  .line b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .soft {
    color: var(--a-muted);
  }
  /* A big monitor: the chart is right below the figures, so their small lines would only say it twice. */
  @media (min-width: 1900px) {
    .ov {
      grid-template-rows: auto 1fr auto;
      grid-template-areas:
        'kpis kpis'
        'chart now'
        'answers answers';
    }
    .kpis :global(.spark) {
      display: none;
    }
  }
  @media (max-width: 1500px) {
    .ov {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-template-areas:
        'now now'
        'kpis kpis'
        'chart chart'
        'happened happened'
        'answers answers';
    }
  }
  /* Two to a row, the last on its own across both. */
  @media (max-width: 1200px) {
    .problem,
    .ov {
      --gap: 1.25rem;
    }
    .kpis,
    .answers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .answers > :global(:last-child) {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 900px) {
    .ov {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'now'
        'kpis'
        'chart'
        'happened'
        'answers';
    }
    .answers {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 600px) {
    .problem,
    .ov {
      --gap: 1rem;
    }
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
  /* A monitor on its side: everything stacked in the screen's height, the four figures in a row, the short answers two by two. */
  @media (orientation: portrait) and (min-width: 900px) {
    .problem,
    .ov {
      --gap: 1.4rem;
    }
    /* The time zone goes without saying. */
    .answers :global(.zone) {
      display: none;
    }
    /* Today down the left of the top row, what happened beside it: the chart keeps the room a row of its own would take. */
    .ov {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-template-areas:
        'now happened'
        'kpis kpis'
        'chart chart'
        'answers answers';
    }
    .kpis {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .answers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .answers > :global(:last-child) {
      grid-column: 1 / -1;
    }
  }
</style>
