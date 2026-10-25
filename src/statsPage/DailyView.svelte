<script lang="ts">
  // Today's unique: one item a day, the same for everyone, answered once.
  // So its answers a day are the players who came back for it (the habit
  // the game is building), and the share who named the item is how hard
  // that day's item was. Which item each day asked is worked out as the
  // game does (dailyItems.ts).
  import { onMount } from 'svelte';
  import { average, fmt } from './chart';
  import { withDailyItems, type DailyItem } from './dailyItems';
  import DailyTable from './DailyTable.svelte';
  import DayColumns from './DayColumns.svelte';
  import Delta from './Delta.svelte';
  import { fitChart } from './fitChart.svelte';
  import { asked, dailyAverage, dailyDays, hardestAndEasiest } from './model';
  import type { Period, Read } from './read';
  import How from './How.svelte';
  import Section from './Section.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  let itemOf = $state<((day: string) => DailyItem | null) | null>(null);
  /** The days Today's unique asked something. */
  const days = $derived(dailyDays(L).filter((d) => asked(d.day)));
  /** The chart starts on the first day it asked: the days before it would only be empty. */
  const from = $derived(Math.max(0, L.days.findIndex(asked)));
  const answered = $derived(days.filter((d) => d.answers));
  let innerWidth = $state(1400);
  let innerHeight = $state(900);
  /** A big monitor, or one on its side, fits the view on one screen: three of each, and the chart gives up what runs past it. */
  const big = $derived(innerWidth >= 1900 || (innerHeight > innerWidth && innerWidth >= 900));
  const chart = fitChart({ on: () => big, base: () => (big ? 236 : 340), least: 160 });
  const ranked = $derived(hardestAndEasiest(days, 3, big ? 3 : 5));
  const now = $derived(dailyAverage(L));
  /** The whole days the average is over (the last, still going, left out), to weigh its change. */
  const wholeDays = $derived(L.days.slice(0, -1).filter(asked).length);
  const before = $derived(dailyAverage(read.before));
  const total = $derived(L.daily.right + L.daily.wrong);
  const named = $derived(total ? Math.round((100 * L.daily.right) / total) : null);
  const namedBefore = $derived.by(() => {
    const t = read.before.daily.right + read.before.daily.wrong;
    return t ? (100 * read.before.daily.right) / t : null;
  });
  const best = $derived(answered.reduce<(typeof days)[number] | null>((b, d) => (!b || d.answers > b.answers ? d : b), null));

  onMount(() => withDailyItems((f) => (itemOf = f)));
  let all = $state(false);
  const newestFirst = $derived([...answered].reverse());
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="stack">
  <p class="what">
    One item a day, the same for everyone, answered once. <b>Players a day</b> shows whether it's becoming a habit; the share who <b>named the item</b>, how hard it was.
  </p>

  <div class="figures">
    <div class="figure">
      <span class="name">Players a day</span>
      <b>{now === null ? '–' : average(now)}</b>
      <Delta now={now} before={before} digits={1} of={now !== null && before !== null ? { now: now * wholeDays, before: before * wholeDays } : undefined} period={period.before} />
    </div>
    <div class="figure">
      <span class="name">Named the item</span>
      <b>{named === null ? '–' : `${named}%`}</b>
      <Delta now={named} before={namedBefore} rate worse="neither" of={{ now: total, before: read.before.daily.right + read.before.daily.wrong }} period={period.before} />
    </div>
    <div class="figure">
      <span class="name">Busiest day</span>
      <b>{best ? fmt(best.answers) : '–'}</b>
      {#if best}<span class="soft">players, on {new Date(`${best.day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>{/if}
    </div>
  </div>

  <Section title="Players a day" says="Named it in gold, missed it in grey.">
    <DayColumns
      days={L.days.slice(from)}
      gold={L.daily.rightPerDay.slice(from)}
      grey={L.daily.wrongPerDay.slice(from)}
      names={{ gold: 'Named it', grey: 'Missed it' }}
      {weekly}
      label="Players of Today's unique a {weekly ? 'week' : 'day'}, named and missed"
      note={(d) => itemOf?.(d)?.name ?? ''}
      height={chart.height}
    />
  </Section>

  {#if ranked.hardest.length}
    <div class="two">
      <Section title="Hardest items" says="The fewest named these.">
        <DailyTable days={ranked.hardest} {itemOf} label="The hardest items" />
      </Section>
      <Section title="Easiest items" says="The most named these.">
        {#if ranked.easiest.length}
          <DailyTable days={ranked.easiest} {itemOf} label="The easiest items" />
        {:else}
          <p class="soft">Not enough days yet.</p>
        {/if}
      </Section>
    </div>
  {/if}

  <Section title="Every day" says="Newest first.">
    {#if newestFirst.length}
      <DailyTable days={all ? newestFirst : newestFirst.slice(0, 14)} {itemOf} label="Today's unique, every day" today={read.to} />
      {#if newestFirst.length > 14}
        <button type="button" class="more" onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show all ${newestFirst.length} days`}</button>
      {/if}
    {:else}
      <p class="soft">Nobody answered in these days.</p>
    {/if}
  </Section>

  <div class="foot">
  <How
    items={[
      "The game's days run from midnight to midnight UTC, when the item changes.",
      'Hardest and easiest: days with at least 3 players, today left out, each share weighed by how many played, so a day of 3 says less than a day of 30.',
    ]}
  />
  </div>
</div>

<style>
  .stack {
    display: grid;
    gap: 1.25rem;
  }
  .what {
    margin: 0;
    max-width: 62rem;
    font-size: 1.2rem;
    color: var(--a-text);
  }
  .what b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.25rem;
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 1.4rem 1.5rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .figure .name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--a-ink);
  }
  .figure b {
    font-size: 3.4rem;
    font-weight: 650;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }
  .soft {
    color: var(--a-muted);
  }
  .more {
    margin-top: 0.8rem;
    padding: 0.3rem 0;
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
    color: var(--gold);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .more:hover {
    color: var(--gold-hi);
    text-decoration: underline;
  }
  .foot {
    margin: 0;
    font-size: 1rem;
    color: var(--a-muted);
  }
  @media (max-width: 1100px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* A monitor on its side: the two side by side, so the view is one screen. */
  @media (orientation: portrait) and (min-width: 900px) {
    .two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* Half a screen leaves their bars a sliver; the share beside them says it. */
    .two :global(.table .bar) {
      display: none;
    }
  }
  @media (max-width: 760px) {
    .figures {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.9rem;
    }
    .figure b {
      font-size: 2.6rem;
    }
    .what {
      font-size: 1.05rem;
    }
  }
  /* A big monitor: every day down the right, the rest on the left, so the view is one screen. */
  @media (min-width: 1900px) {
    .stack {
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      grid-template-areas:
        'what what'
        'figures every'
        'chart every'
        'two every'
        'foot foot';
      align-items: start;
    }
    .what {
      grid-area: what;
    }
    .figures {
      grid-area: figures;
    }
    .two {
      grid-area: two;
    }
    .foot {
      grid-area: foot;
    }
    .stack > :global(.section:nth-of-type(1)) {
      grid-area: chart;
    }
    .stack > :global(.section:last-of-type) {
      grid-area: every;
      align-self: stretch;
    }
  }
</style>
