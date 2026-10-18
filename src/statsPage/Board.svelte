<script lang="ts">
  // The board (stats.html#board): the overview for a monitor of its own,
  // most of all one turned on its side, read from across a room and left
  // to update by itself. One screen, nothing to scroll or click: today so
  // far against the same time a period ago (and what the last update brought
  // in, where from and on what), the period's four figures, its
  // days drawn as large as the screen leaves room for, what happened and
  // how far a visit gets. Everything is sized from the screen
  // (Analytics sets the root's size), so a bigger monitor reads the same.
  import { onMount } from 'svelte';
  import { average, fmt, longDay } from './chart';
  import { withDailyItems, type DailyItem } from './dailyItems';
  import Delta from './Delta.svelte';
  import Kpi from './Kpi.svelte';
  import NewSince from './NewSince.svelte';
  import { asked, dailyAverage, percent, sharePerDay } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import Spark from './Spark.svelte';
  import TrendChart from './TrendChart.svelte';
  import Steps from './Steps.svelte';
  import WhatHappened from './WhatHappened.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const last = <T,>(vs: T[]) => vs[vs.length - 1];
  const answers = (c: typeof L) => c.daily.rightPerDay.map((r, i) => r + (c.daily.wrongPerDay[i] ?? 0));
  const tries = (c: typeof L) => c.joins.reduce((n, j) => n + j.tried, 0);
  const joins = (c: typeof L) => c.joins.reduce((n, j) => n + j.joined, 0);
  const rate = (part: number, whole: number) => (whole ? (100 * part) / whole : null);
  const names = $derived({ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) });

  /** Today so far, and the period before's last day by the same time of day (load() cuts it there). */
  const today = $derived({
    visitors: [last(L.visitors.perDay) ?? 0, last(B.visitors.perDay) ?? 0],
    games: [last(L.games.perDay) ?? 0, last(B.games.perDay) ?? 0],
    daily: [last(answers(L)) ?? 0, last(answers(B)) ?? 0],
    named: last(L.daily.rightPerDay) ?? 0,
  });
  const failedToday = $derived(last(L.failuresPerDay) ?? 0);
  const failed = $derived(L.failures.reduce((n, f) => n + f.count, 0));
  const sameTime = $derived(`${longDay(read.toBefore)} at this time`);
  /** What the newest update brought, while it's the newest (marked on today's figures). */
  const lit = $derived(read.changes && read.changes.at === read.at ? read.changes : null);

  let itemOf = $state<((day: string) => DailyItem | null) | null>(null);
  onMount(() => withDailyItems((f) => (itemOf = f)));
  const item = $derived(itemOf?.(read.to) ?? null);
  const dailyNow = $derived(dailyAverage(L));
  const dailyBefore = $derived(dailyAverage(B));


  /** The deltas said short, so each keeps to a line: "from 1,658 before". */
  const short = $derived({ ...period, before: 'before' });

  /** The room each chart has (what the rest leaves of the screen, split between the two), less its legend above. */
  let visitorsH = $state(0);
  let gamesH = $state(0);
  /** The legend's height, in the root's size (the board sizes its type from the screen). */
  const legend = $derived(visitorsH ? 3 * parseFloat(getComputedStyle(document.documentElement).fontSize) : 48);
  const fit = (h: number) => Math.max(120, Math.floor(h - legend));
</script>

<div class="board">
  <section class="today" aria-label="Today so far">
    <h2>Today so far <span>against {sameTime}</span></h2>
    <div class="figures">
      <div>
        <span class="name">Visitors</span>
        <b>{fmt(today.visitors[0])}{#if lit?.visitors}<span class="added">+{fmt(lit.visitors)}</span>{/if}</b>
        <Delta now={today.visitors[0]} before={today.visitors[1]} period="" />
      </div>
      <div>
        <span class="name">Games</span>
        <b>{fmt(today.games[0])}{#if lit?.games}<span class="added">+{fmt(lit.games)}</span>{/if}</b>
        <Delta now={today.games[0]} before={today.games[1]} period="" />
      </div>
      <div>
        <span class="name">Today's unique</span>
        <b>{fmt(today.daily[0])}{#if lit?.answers}<span class="added">+{fmt(lit.answers)}</span>{/if}</b>
        <span class="soft">{today.daily[0] ? `${percent(today.named, today.daily[0])} named ${item ? item.name : 'it'}` : item ? item.name : 'nobody yet'}</span>
      </div>
      <div class:bad={failedToday > 0}>
        <span class="name">Failures</span>
        <b>{fmt(failedToday)}{#if lit?.failures}<span class="added">+{fmt(lit.failures)}</span>{/if}</b>
        <span class="soft">{fmt(failed)} in {period.now.toLowerCase()}</span>
      </div>
    </div>
  </section>

  {#if read.changes}
    <div class="since"><NewSince changes={read.changes} at={read.at} /></div>
  {/if}

  <div class="kpis">
    <Kpi label="Visitors" value={fmt(L.visitors.total)} means="opened the game" href="#visitors">
      {#snippet spark()}<Spark days={L.days} values={L.visitors.perDay} {weekly} label="Visitors a day" />{/snippet}
      {#snippet change()}<Delta now={L.visitors.total} before={B.visitors.total} period={short.before} />{/snippet}
    </Kpi>
    <Kpi label="Games played" value={fmt(L.games.started)} means="started, every mode" href="#games">
      {#snippet spark()}<Spark days={L.days} values={L.games.perDay} {weekly} label="Games a day" />{/snippet}
      {#snippet change()}<Delta now={L.games.started} before={B.games.started} period={short.before} />{/snippet}
    </Kpi>
    <Kpi label="Daily players" value={dailyNow === null ? '–' : average(dailyNow)} means="a day, Today's unique" href="#daily">
      {#snippet spark()}<Spark days={L.days.filter(asked)} values={answers(L).filter((_, i) => asked(L.days[i]))} {weekly} label="Players of Today's unique a day" />{/snippet}
      {#snippet change()}<Delta now={dailyNow} before={dailyBefore} digits={1} period={short.before} />{/snippet}
    </Kpi>
    <Kpi label="Joins worked" value={tries(L) ? percent(joins(L), tries(L)) : '–'} means="of {fmt(tries(L))} tries" href="#joining">
      {#snippet spark()}<Spark days={L.days} values={sharePerDay(L.joinsPerDay.joined, L.joinsPerDay.tried)} {weekly} label="Share of joins that worked, a day" />{/snippet}
      {#snippet change()}<Delta now={rate(joins(L), tries(L))} before={rate(joins(B), tries(B))} rate period={short.before} />{/snippet}
    </Kpi>
  </div>


  <div class="charts">
    <Section title="Visitors">
      <div class="fill" bind:clientHeight={visitorsH}>
        <TrendChart days={L.days} now={L.visitors.perDay} before={B.visitors.perDay} {weekly} what="Visitors" {names} height={fit(visitorsH)} />
      </div>
    </Section>
    <Section title="Games">
      <div class="fill" bind:clientHeight={gamesH}>
        <TrendChart days={L.days} now={L.games.perDay} before={B.games.perDay} {weekly} what="Games" {names} height={fit(gamesH)} />
      </div>
    </Section>
  </div>

  <div class="two">
    <Section title="What happened">
      <WhatHappened {read} {period} top={2} />
    </Section>
    <Steps {read} period={short} />
  </div>
</div>

<style>
  /* The screen's height, split: the charts take whatever the rest leaves. */
  .board {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    min-height: 0;
  }
  .board > * {
    flex: none;
  }
  .board :global(.more) {
    display: none;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  h2 span {
    font-family: var(--font-data);
    font-size: 1rem;
    font-weight: 400;
    color: var(--a-muted);
  }
  .today {
    padding: 1.2rem 1.5rem 1.3rem;
    background: var(--a-surface);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem 1.5rem;
  }
  .figures > div {
    display: grid;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    color: var(--a-ink);
  }
  .figures b {
    font-size: 3.6rem;
    font-weight: 650;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .added {
    margin-left: 0.6rem;
    font-size: 0.45em;
    font-weight: 650;
    letter-spacing: 0;
    vertical-align: 0.6em;
    color: var(--a-now);
  }
  .figures .bad b {
    color: var(--a-down);
  }
  .soft {
    color: var(--a-muted);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
  }
  .charts {
    flex: 1 1 0;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem;
  }
  /* Each chart's panel a column, the chart (with its legend) filling what its heading leaves. */
  .charts > :global(.section) {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .fill {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: stretch;
  }
  .board :global(.section) {
    padding: 1.1rem 1.4rem 1.2rem;
  }
  .board :global(.section header) {
    margin-bottom: 0.7rem;
  }
  /* A monitor the usual way round: the charts down the left, the rest on the right. */
  @media (orientation: landscape) {
    .board {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto auto auto auto minmax(0, 1fr);
      grid-template-areas:
        'today today'
        'since since'
        'kpis kpis'
        'charts two'
        'charts two';
    }
    .today {
      grid-area: today;
    }
    /* Before an update has brought anything, no row is kept for it. */
    .board:not(:has(.since)) {
      grid-template-rows: auto auto auto minmax(0, 1fr);
      grid-template-areas:
        'today today'
        'kpis kpis'
        'charts two'
        'charts two';
    }
    .since {
      grid-area: since;
    }
    .kpis {
      grid-area: kpis;
    }
    .charts {
      grid-area: charts;
      min-height: 30rem;
    }
    .two {
      grid-area: two;
    }
  }
</style>
