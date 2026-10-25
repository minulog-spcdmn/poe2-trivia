<script lang="ts">
  // Games: how many, of which mode, how many played each, and how deep
  // Delve's runs get. A game is counted once, on the device that runs it
  // (the host's), games once counted online and hot-seat apart as one
  // (model.ts currentName).
  import { average, fmt, shortDay } from './chart';
  import Delta from './Delta.svelte';
  import { fitChart } from './fitChart.svelte';
  import { MODES, MODE_NAMES, finishedShare, modesOf, percent, seatsOf, sizeName, sizesOf, dayAverages } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';
  import { hashOf } from './slices';
  import DelveDepths from './DelveDepths.svelte';
  import How from './How.svelte';
  import TrendChart from './TrendChart.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  /** The most played first, as everywhere else. */
  const modes = $derived(modesOf(L.games.rows).sort((a, b) => b.started - a.started));
  const topMode = $derived(Math.max(1, ...modes.map((m) => m.started)));
  /** Games with players at the host's own screen, every mode. */
  const screen = $derived(modes.reduce((n, m) => n + m.screen, 0));
  /** Games a day over the whole days (today's left out), against the period before's. */
  const perDay = $derived(dayAverages(L.games.perDay, read.before.games.perDay));
  const sizes = $derived(sizesOf(L.games.rows));
  const sized = $derived(sizes.reduce((n, s) => n + s.total, 0));
  const topSize = $derived(Math.max(1, ...sizes.map((s) => s.total)));
  const ranges = $derived(sizes.some((s) => s.from !== s.to));
  /** Delve's runs started: those left mid-run (the tab closed) never say how deep they got, so the depths are of the runs that ended. */
  const delveStarted = $derived(modes.find((m) => m.mode === 'delve')?.started ?? 0);
  /** Players a game, one decimal, of the games whose size is known. */
  const perGame = (rows: typeof L.games.rows) => {
    const { seats, games } = seatsOf(rows);
    return games ? (seats / games).toFixed(1) : '–';
  };

  let innerWidth = $state(1400);
  let innerHeight = $state(900);
  /** A big monitor, or one on its side, has the view on one screen: the chart gives up what runs past it. */
  const chart = fitChart({ on: () => innerWidth >= 1900 || (innerHeight > innerWidth && innerWidth >= 900 && innerHeight >= 1500), base: () => 340, least: 180 });
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="stack">
  <Section title="Games a day" says="Games started, every mode; {fmt(L.games.started)} in all.">
    {#snippet aside()}
      <div class="total">
        <b>{perDay.now === null ? '–' : average(perDay.now)}</b>
        <span class="soft">a day on average</span>
        <Delta now={perDay.now} before={perDay.before} digits={1} of={perDay.of} period={period.before} />
      </div>
    {/snippet}
    <TrendChart days={L.days} now={L.games.perDay} before={read.before.games.perDay} {weekly} what="Games" names={{ now: period.now, before: period.before[0].toUpperCase() + period.before.slice(1) }} height={chart.height} />
  </Section>

  <Section title="Modes" says="Games started by mode.">
    <div class="scroll-x">
      <table class="table" aria-label="Games by mode">
        <thead>
          <tr>
            <th scope="col">Mode</th>
            <th scope="col" class="n">Games</th>
            <th scope="col" class="n opt">Share</th>
            <th scope="col" class="n">To the end</th>
            <th scope="col" class="n opt">Players a game</th>
            <th scope="col" class="n opt">Shared a screen</th>
            <th scope="col" class="bar"><span class="sr">Against the most played</span></th>
          </tr>
        </thead>
        <tbody>
          {#each modes as m (m.mode)}
            <tr class:none={!m.started}>
              <th scope="row"><a class="pick" href={hashOf({ mode: m.mode })} title="Where it's played most">{MODE_NAMES[m.mode]}</a><span class="on-phone">{percent(m.started, L.games.started)} of games, {perGame(L.games.rows.filter((r) => r.mode === m.mode))} players each{#if m.screen}; {fmt(m.screen)} shared a screen{/if}</span></th>
              <td class="n strong">{fmt(m.started)}</td>
              <td class="n opt">{percent(m.started, L.games.started)}</td>
              <td class="n">{finishedShare(m.finished, m.started)}</td>
              <td class="n opt">{perGame(L.games.rows.filter((r) => r.mode === m.mode))}</td>
              <td class="n opt" class:soft={!m.screen}>{fmt(m.screen)}</td>
              <td class="bar"><span class="meter"><i style:width="{(100 * m.started) / topMode}%"></i></span></td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All<span class="on-phone">{perGame(L.games.rows)} players each{#if screen}; {fmt(screen)} shared a screen{/if}</span></th>
            <td class="n">{fmt(L.games.started)}</td>
            <td class="n opt">{L.games.started ? '100%' : '–'}</td>
            <td class="n">{finishedShare(L.games.finished, L.games.started)}</td>
            <td class="n opt">{perGame(L.games.rows)}</td>
            <td class="n opt">{fmt(screen)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </Section>

  <div class="two">
    <Section title="How many play" says="Games by how many played them.">
      {#if sized}
        <div class="scroll-x">
          <table class="table" aria-label="Games by how many played">
            <thead>
              <tr>
                <th scope="col">Players</th>
                {#each MODES as m (m)}<th scope="col" class="n">{MODE_NAMES[m]}</th>{/each}
                <th scope="col" class="n">All</th>
                <th scope="col" class="bar"><span class="sr">Against the most common</span></th>
              </tr>
            </thead>
            <tbody>
              {#each sizes as s (sizeName(s))}
                <tr>
                  <th scope="row">{sizeName(s)}{#if s.from !== s.to}<sup>*</sup>{/if}</th>
                  {#each MODES as m (m)}<td class="n" class:soft={!s.modes[m]}>{fmt(s.modes[m] ?? 0)}</td>{/each}
                  <td class="n strong">{fmt(s.total)}</td>
                  <td class="bar"><span class="meter"><i style:width="{(100 * s.total) / topSize}%"></i></span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if ranges}<p class="foot"><sup>*</sup> Counted before games were counted by their exact number of players.</p>{/if}
      {:else}
        <p class="soft">No games in these days.</p>
      {/if}
    </Section>

    <Section
      title="How deep Delve goes"
      says="Runs by the depth they ended at{delveStarted > L.delve.total ? `; ${fmt(delveStarted)} were started` : ''}."
    >
      <DelveDepths ranges={L.delve.ranges} />
    </Section>
  </div>

  <How
    items={[
      "A game counts once, on the device that runs it (the host's).",
      'To the end: the game reached its results, or a Delve run its last life.',
      "Shared a screen: games with a player seated at the host's own screen (before that was counted, the hot-seat games).",
      'Players a game: seats taken, or in Delve those who set out.',
      'A Delve run left mid-run (the tab closed) never says how deep it got, so the depths are of the runs that ended.',
      L.delve.leftOut.length > 0 && `The depths leave out ${L.delve.leftOut.map(shortDay).join(', ')}, when an early build counted some depths twice.`,
    ]}
  />
</div>

<style>
  .stack {
    display: grid;
    gap: 1.25rem;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }
  .total {
    display: grid;
    justify-items: end;
    gap: 0.2rem;
  }
  .total b {
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .none > * {
    color: var(--a-muted);
  }
  .bar {
    width: 30%;
    min-width: 4rem;
  }
  sup {
    margin-left: 0.15rem;
    color: var(--a-muted);
  }
  .foot {
    margin: 1rem 0 0;
    font-size: 1rem;
    color: var(--a-muted);
  }
  .soft {
    color: var(--a-muted);
  }
  @media (max-width: 1100px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* A monitor on its side: the two side by side, so the view is one screen. */
  @media (orientation: portrait) and (min-width: 900px) and (min-height: 1500px) {
    .two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* A big monitor: two columns, so the view is one screen. */
  @media (min-width: 1900px) {
    .stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'chart many'
        'modes deep';
    }
    .two {
      display: contents;
    }
    .stack > :global(.section:nth-child(1)) {
      grid-area: chart;
    }
    .stack > :global(.section:nth-child(2)) {
      grid-area: modes;
    }
    .two > :global(.section:first-child) {
      grid-area: many;
    }
    .two > :global(.section:last-child) {
      grid-area: deep;
    }
  }
</style>
