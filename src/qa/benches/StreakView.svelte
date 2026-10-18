<script lang="ts">
  // The streak bench's view (./streak.ts): the badge as Today's unique shows
  // it, under its answers. Answer right plays what the start page plays for
  // a right answer: the badge comes in burning for yesterday's run and grows
  // into today's. Miss ends the run in a puff of smoke.
  import { onDestroy, untrack } from 'svelte';
  import DailyStreak, { BADGE_IN_MS } from '../../components/DailyStreak.svelte';
  import { doused } from '../../lib/fx/moments';
  import { DAILY_LADDER, dailyFlameOf, dailyHeatOf } from '../../lib/fx/streaks';
  import { nextIn } from '../../lib/daily';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, set, small }: PieceProps = $props();

  const days = $derived(Number(v.days));
  /** Yesterday's run, while an answer lands (as Today's unique keeps it). */
  let growingFrom = $state<number | null>(null);
  /** The run a miss just ended (0: no miss shown). */
  let ended = $state(0);
  /** Brings the badge in again, as the answer lands. */
  let entrance = $state(0);
  let growTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(growTimer));

  // The run moved by the panel, not by an answer here: shown as it stands.
  let mine: number | null = null;
  $effect(() => {
    const d = days;
    untrack(() => {
      if (d === mine) return void (mine = null);
      clearTimeout(growTimer);
      growingFrom = null;
      ended = 0;
    });
  });
  onAction('right', () => {
    clearTimeout(growTimer);
    ended = 0;
    growingFrom = days;
    mine = days + 1;
    set({ days: days + 1 });
    entrance++;
    growTimer = setTimeout(() => (growingFrom = null), BADGE_IN_MS + 900);
  });
  onAction('miss', () => {
    if (days < 1) return;
    clearTimeout(growTimer);
    growingFrom = null;
    ended = days;
    mine = 0;
    set({ days: 0 });
    entrance++;
  });

  const burning = $derived(growingFrom ?? days);
  const flame = $derived(dailyFlameOf(burning));
  const next = $derived(DAILY_LADDER.find((f) => f.from > days));
  /** Svelte action: a run just ended goes out in a puff of smoke, as on the start page. */
  const douse = (node: HTMLElement) => void requestAnimationFrame(() => doused(node));
</script>

<div class="page" class:small>
  {#if !small}
    <div class="answers" aria-hidden="true">
      {#each [0, 1, 2, 3] as i (i)}<span class="option"></span>{/each}
    </div>
  {/if}
  <div class="after">
    {#key entrance}
      <p class="tally">
        {#if days >= 1}
          <DailyStreak {days} {burning} />
        {:else if ended >= 1}
          <span use:douse>Streak ended at <span class="n">{ended}</span> {ended === 1 ? 'day' : 'days'}</span>
        {:else}
          <span>Missed today</span>
        {/if}
        {#if !small}
          <span aria-hidden="true">·</span>
          <span>{nextIn(Date.now())}</span>
        {/if}
      </p>
    {/key}
  </div>
  {#if !small}
    <p class="hint">
      {#if days < 1}No run{:else}{flame.name}, heat {dailyHeatOf(burning).toFixed(2)}{next ? `; ${next.name} in ${next.from - days} ${next.from - days === 1 ? 'day' : 'days'}` : '; the top of the ladder'}{/if}
    </p>
  {/if}
</div>

<style>
  /* A mock of Today's unique: the answers' row, then the tally as it sits under them. */
  .page {
    width: min(760px, 100vw - 32px);
  }
  .page.small {
    width: auto;
  }
  .answers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .option {
    height: 56px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
  }
  .after {
    display: flex;
    justify-content: center;
    min-height: 62px;
    padding-top: 26px;
  }
  .small .after {
    padding-top: 30px;
    min-height: 40px;
  }
  /* Today's unique's .tally. */
  .tally {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0;
    font-style: italic;
    font-size: 15px;
    color: #a99c86;
  }
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 0.9em;
  }
  .hint {
    margin: 2.5rem 0 0;
    text-align: center;
    color: var(--muted);
    font-style: italic;
  }
  @media (max-width: 640px) {
    .answers {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
