<script lang="ts">
  // Today's unique: one item a day, the same for everyone, answered once.
  // So its answers a day are the players who came back for it (the habit
  // the game is building), and the share who named the item is how hard
  // that day's item was. Which item each day asked is worked out as the
  // game does (dailyItems.ts).
  import { onMount } from 'svelte';
  import { fmt } from './chart';
  import { dailyItems, type DailyItem } from './dailyItems';
  import DailyTable from './DailyTable.svelte';
  import DayColumns from './DayColumns.svelte';
  import Delta from './Delta.svelte';
  import { asked, dailyAverage, dailyDays, hardestAndEasiest } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';

  let { read, period, weekly }: { read: Read; period: Period; weekly: boolean } = $props();

  const L = $derived(read.now);
  let itemOf = $state<((day: string) => DailyItem | null) | null>(null);
  /** The days Today's unique asked something. */
  const days = $derived(dailyDays(L).filter((d) => asked(d.day)));
  const answered = $derived(days.filter((d) => d.answers));
  const ranked = $derived(hardestAndEasiest(days));
  const now = $derived(dailyAverage(L));
  const before = $derived(dailyAverage(read.before));
  const total = $derived(L.daily.right + L.daily.wrong);
  const named = $derived(total ? Math.round((100 * L.daily.right) / total) : null);
  const namedBefore = $derived.by(() => {
    const t = read.before.daily.right + read.before.daily.wrong;
    return t ? (100 * read.before.daily.right) / t : null;
  });
  const best = $derived(answered.reduce<(typeof days)[number] | null>((b, d) => (!b || d.answers > b.answers ? d : b), null));
  const oneDecimal = (v: number) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : fmt(Math.round(v)));

  onMount(() => {
    dailyItems()
      .then((f) => (itemOf = f))
      .catch(() => undefined);
  });
  let all = $state(false);
  const newestFirst = $derived([...answered].reverse());
</script>

<div class="stack">
  <p class="what">
    Everyone gets the same item each day and can answer it once. So the <b>players a day</b> are the people who came back for it, which shows whether playing it is becoming a habit; the share who <b>named the item</b> shows how hard that day's item was.
  </p>

  <div class="figures">
    <div class="figure">
      <span class="name">Players a day</span>
      <b>{now === null ? '–' : oneDecimal(now)}</b>
      <Delta now={now} before={before} digits={1} period={period.before} />
    </div>
    <div class="figure">
      <span class="name">Named the item</span>
      <b>{named === null ? '–' : `${named}%`}</b>
      <Delta now={named} before={namedBefore} rate worse="neither" period={period.before} />
    </div>
    <div class="figure">
      <span class="name">Busiest day</span>
      <b>{best ? fmt(best.answers) : '–'}</b>
      {#if best}<span class="soft">players, on {new Date(`${best.day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>{/if}
    </div>
  </div>

  <Section title="Players a day" says="Each column is a day's players: those who named the item at its foot, those who missed it above.">
    <DayColumns
      days={L.days}
      gold={L.daily.rightPerDay}
      grey={L.daily.wrongPerDay}
      names={{ gold: 'Named it', grey: 'Missed it' }}
      {weekly}
      label="Players of Today's unique a {weekly ? 'week' : 'day'}, named and missed"
      note={(d) => itemOf?.(d)?.name ?? ''}
      height={340}
    />
  </Section>

  {#if ranked.hardest.length}
    <div class="two">
      <Section title="Hardest items" says="The fewest named these; days with at least 3 players, today left out.">
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

  {#if read.zone !== 'UTC'}
    <p class="foot">The item changes at midnight UTC, but these days are cut at midnight in {read.zone.replace(/_/g, ' ')} (GoatCounter's setting), so a few answers near midnight may count toward the day beside theirs.</p>
  {/if}
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
    align-items: start;
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
</style>
