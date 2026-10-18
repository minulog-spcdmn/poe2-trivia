<script lang="ts">
  // The board (stats.html#board): the overview for a monitor of its own,
  // read from across a room and left to update by itself. One screen,
  // nothing to scroll or click, the liveliest first: today so far against
  // the same time a period ago, and what the last update brought in, where
  // from and on what; what happened and how far a visit gets; the period's
  // four figures; its visitors a day, as large as the screen leaves room
  // for; and where they are and what they play, what's new marked. Sized
  // from the screen (Analytics sets the root's size).
  import { onMount } from 'svelte';
  import { average, fmt, longDay, shortDay } from './chart';
  import { withDailyItems, type DailyItem } from './dailyItems';
  import Delta from './Delta.svelte';
  import Kpi from './Kpi.svelte';
  import NewSince from './NewSince.svelte';
  import Bars from './Bars.svelte';
  import { freshOf } from './changes';
  import { spikesOf } from './insights';
  import { DAILY_FROM, MODE_NAMES, asked, dailyAverage, modesOf, percent, sharePerDay } from './model';
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

  const modes = $derived(
    modesOf(L.games.rows)
      .filter((m) => m.started)
      .map((m) => ({ label: MODE_NAMES[m.mode], count: m.started })),
  );
  const countries = $derived(read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })));
  /** The days far busier than usual, ringed on the chart. */
  const spikes = $derived(spikesOf(L.days, L.visitors.perDay).map((x) => x.day));

  /** The room the chart has (what the rest leaves of the screen), less its legend above. */
  let visitorsH = $state(0);
  /** The legend's height, in the root's size (the board sizes its type from the screen). */
  const legend = $derived(visitorsH ? 3 * parseFloat(getComputedStyle(document.documentElement).fontSize) : 48);
  let innerWidth = $state(1400);
  /** On a phone the board scrolls, so its chart has a height of its own (and its legend, three lines, the room it needs). */
  const fit = (h: number) => (innerWidth <= 600 ? 220 : Math.max(120, Math.floor(h - legend)));
</script>

<svelte:window bind:innerWidth />

<div class="board" class:has-since={!!read.changes}>
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

  <div class="happened">
    <Section title="What happened">
      <WhatHappened {read} {period} top={2} />
    </Section>
  </div>
  <div class="steps"><Steps {read} period={short} /></div>

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
      {#snippet change()}{#if dailyNow !== null && dailyBefore === null}<span class="soft">began {shortDay(DAILY_FROM)}</span>{:else}<Delta now={dailyNow} before={dailyBefore} digits={1} period={short.before} />{/if}{/snippet}
    </Kpi>
    <Kpi label="Joins worked" value={tries(L) ? percent(joins(L), tries(L)) : '–'} means="of {fmt(tries(L))} tries" href="#joining">
      {#snippet spark()}<Spark days={L.days} values={sharePerDay(L.joinsPerDay.joined, L.joinsPerDay.tried)} {weekly} label="Share of joins that worked, a day" />{/snippet}
      {#snippet change()}<Delta now={rate(joins(L), tries(L))} before={rate(joins(B), tries(B))} rate period={short.before} />{/snippet}
    </Kpi>
  </div>

  <div class="chart">
    <Section title="Visitors a day">
      <div class="fill" bind:clientHeight={visitorsH}>
        <TrendChart days={L.days} now={L.visitors.perDay} before={B.visitors.perDay} {weekly} what="Visitors" {names} height={fit(visitorsH)} marks={spikes} />
      </div>
    </Section>
  </div>

  <div class="where">
    <Section title="Where they are">
      <Bars bars={countries} top={5} empty="No visitors in these days." fresh={freshOf(read.changes, read.at, 'countries')} />
    </Section>
  </div>
  <div class="play">
    <Section title="What they play">
      <Bars bars={modes} top={3} empty="No games in these days." fresh={freshOf(read.changes, read.at, 'modes')} />
    </Section>
  </div>
</div>

<style>
  /*
   * One grid, the screen's height split: the chart takes whatever the rest
   * leaves. A monitor on its side stacks it; the usual way round puts
   * what's new beside today and the chart beside the rest.
   */
  .board {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    grid-template-areas:
      'today today'
      'since since'
      'happened steps'
      'kpis kpis'
      'chart chart'
      'where play';
    gap: 1rem;
    height: 100%;
    min-height: 0;
  }
  .board:not(.has-since) {
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    grid-template-areas:
      'today today'
      'happened steps'
      'kpis kpis'
      'chart chart'
      'where play';
  }
  .today {
    grid-area: today;
  }
  .since {
    grid-area: since;
    display: grid;
  }
  .happened {
    grid-area: happened;
    display: grid;
  }
  .steps {
    grid-area: steps;
    display: grid;
  }
  .kpis {
    grid-area: kpis;
  }
  .chart {
    grid-area: chart;
    display: flex;
    min-height: 0;
  }
  .where {
    grid-area: where;
    display: grid;
  }
  .play {
    grid-area: play;
    display: grid;
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
  /* The chart's panel a column, the chart (with its legend) filling what its heading leaves. */
  .chart > :global(.section) {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .fill {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }
  .board :global(.section) {
    padding: 1.1rem 1.4rem 1.2rem;
  }
  .board :global(.section header) {
    margin-bottom: 0.7rem;
  }
  @media (orientation: landscape) {
    .board {
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas:
        'today today today since'
        'kpis kpis kpis steps'
        'chart chart happened where'
        'chart chart happened play';
    }
    .board:not(.has-since) {
      grid-template-areas:
        'today today today today'
        'kpis kpis kpis steps'
        'chart chart happened where'
        'chart chart happened play';
    }
  }
  /* A phone isn't what the board is for, but it opens there: one column that scrolls, today two by two. */
  @media (max-width: 600px) {
    .board,
    .board:not(.has-since) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas: 'today' 'since' 'happened' 'steps' 'kpis' 'chart' 'where' 'play';
      height: auto;
    }
    .board:not(.has-since) {
      grid-template-areas: 'today' 'happened' 'steps' 'kpis' 'chart' 'where' 'play';
    }
    .today {
      padding: 1rem 1.1rem;
    }
    .figures,
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .figures b {
      font-size: 2.6rem;
    }
    .fill {
      flex: none;
      overflow: visible;
    }
  }
</style>
