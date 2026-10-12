<script lang="ts">
  // The streak's test page: the daily's streak badge (components/DailyStreak)
  // under a mock of Today's unique's answers, burning for a run of days set
  // by a slider, a box or a step of the ladder (lib/fx/streaks). "Answer
  // right" plays what the start page plays when today's answer is right: the
  // badge comes in burning for yesterday's run and grows into today's,
  // bursting when it reaches a new colour. "Miss" ends the run in a puff of
  // smoke. Every step also burns side by side below. The address can set the
  // run too: streak.html?days=30.
  import { onDestroy } from 'svelte';
  import DailyStreak, { BADGE_IN_MS } from '../components/DailyStreak.svelte';
  import FxLayer from '../components/FxLayer.svelte';
  import { doused } from '../lib/fx/moments';
  import { DAILY_LADDER, dailyFlameOf, dailyHeatOf } from '../lib/fx/streaks';
  import { nextIn } from '../lib/daily';

  const MAX = 730;
  const query = new URLSearchParams(location.search);
  const asked = Number(query.get('days'));

  /** The run the badge counts (0: none). */
  let days = $state(query.has('days') && Number.isFinite(asked) ? Math.max(0, Math.min(9999, Math.floor(asked))) : 1);
  /** Yesterday's run, while an answer lands (as Today's unique keeps it). */
  let growingFrom = $state<number | null>(null);
  /** The run a miss just ended (0: no miss shown). */
  let ended = $state(0);
  /** Mounts the badge again, for its entrance. */
  let replay = $state(0);
  let growTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(growTimer));

  const burning = $derived(growingFrom ?? days);
  const flame = $derived(dailyFlameOf(burning));
  /** The next step up the ladder, if any. */
  const next = $derived(DAILY_LADDER.find((f) => f.from > days));

  function settle() {
    clearTimeout(growTimer);
    growingFrom = null;
  }
  /** Sets the run quietly, as a page loaded on that day shows it. */
  function show(n: number) {
    settle();
    ended = 0;
    days = n;
    replay++;
  }
  /** Today's answer is right: the badge comes in at yesterday's run and grows into today's. */
  function right() {
    clearTimeout(growTimer);
    ended = 0;
    growingFrom = days;
    days += 1;
    replay++;
    growTimer = setTimeout(() => (growingFrom = null), BADGE_IN_MS + 900);
  }
  /** Today's answer is wrong: the run ends. */
  function miss() {
    settle();
    ended = days;
    days = 0;
    replay++;
  }
  /** Svelte action: a run just ended goes out in a puff of smoke, as on the start page. */
  function douse(node: HTMLElement) {
    requestAnimationFrame(() => doused(node));
  }
</script>

<FxLayer />

<main>
  <header class="controls">
    <h1>The daily streak</h1>
    <div class="row">
      <label for="days">Days in a row</label>
      <input id="days" type="range" min="0" max={MAX} step="1" bind:value={days} oninput={() => (settle(), (ended = 0))} />
      <input class="num" type="number" min="0" max="9999" bind:value={days} oninput={() => (settle(), (ended = 0))} aria-label="Days in a row" />
      <span class="hint">
        {#if days < 1}no run{:else}{flame.name}, heat {dailyHeatOf(burning).toFixed(2)}{next ? `; ${next.name} in ${next.from - days} ${next.from - days === 1 ? 'day' : 'days'}` : '; the top of the ladder'}{/if}
      </span>
    </div>
    <div class="row">
      <span class="what">Steps</span>
      {#each DAILY_LADDER as f (f.name)}
        <button class="step" class:on={flame === f && days >= 1} style:--swatch="rgb({f.css})" onclick={() => show(f.from)}>
          <span class="swatch"></span>{f.name} <span class="from">{f.from}</span>
        </button>
      {/each}
      <span class="sep"></span>
      {#each DAILY_LADDER.slice(1) as f (f.name)}
        <button onclick={() => show(f.from - 1)} title="The day before {f.name}: answer right to see it turn">{f.from - 1}</button>
      {/each}
    </div>
    <div class="row">
      <span class="what">Today</span>
      <button class="go" onclick={right}>Answer right <span class="from">+1 day</span></button>
      <button onclick={miss} disabled={days < 1}>Miss</button>
      <button onclick={() => show(days)}>Replay entrance</button>
    </div>
  </header>

  <section class="page">
    <span class="size">As the start page shows it, under the answers</span>
    <div class="answers" aria-hidden="true">
      {#each [0, 1, 2, 3] as i (i)}<span class="option"></span>{/each}
    </div>
    <div class="after">
      {#key replay}
        <p class="tally">
          {#if days >= 1}
            <DailyStreak {days} {burning} />
          {:else if ended >= 1}
            <span use:douse>Streak ended at <span class="n">{ended}</span> {ended === 1 ? 'day' : 'days'}</span>
          {:else}
            <span>Missed today</span>
          {/if}
          <span aria-hidden="true">·</span>
          <span>{nextIn(Date.now())}</span>
        </p>
      {/key}
    </div>
  </section>

  <section>
    <span class="size">Every step of the ladder, from its first day</span>
    <div class="ladder">
      {#each DAILY_LADDER as f (f.name)}
        <div class="rung">
          <DailyStreak days={f.from} />
          <span class="hint">{f.name}, from day {f.from}</span>
        </div>
      {/each}
    </div>
  </section>
</main>

<style>
  main {
    padding: 0 1.2rem 4rem;
    display: grid;
    gap: 2.5rem;
  }
  .controls {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    gap: 0.5rem;
    margin: 0 -1.2rem;
    padding: 0.8rem 1.2rem;
    background: rgba(10, 9, 8, 0.95);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: normal;
    font-size: 1.1rem;
    color: var(--gold-hi);
    letter-spacing: 0.08em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
  }
  .row label,
  .what {
    font-family: var(--font-display);
    color: var(--muted);
  }
  input[type='range'] {
    flex: 1 1 14rem;
    min-width: 10rem;
    accent-color: var(--gold);
  }
  .num {
    width: 5rem;
    font-family: var(--font-cinzel);
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
  }
  .hint {
    color: var(--muted);
    font-style: italic;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    font: inherit;
    font-size: 0.85rem;
    color: var(--gold-hi);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.15rem 0.55rem;
    cursor: pointer;
  }
  button.on {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 22%, var(--bg));
  }
  button:hover:not(:disabled) {
    border-color: var(--gold);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .go {
    border-color: var(--gold-lo);
  }
  .swatch {
    width: 0.7em;
    height: 0.7em;
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 6px var(--swatch);
  }
  .from {
    font-family: var(--font-cinzel);
    color: var(--muted);
  }
  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--line);
  }
  .size {
    display: block;
    margin-bottom: 0.6rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  /* A mock of Today's unique: the answers' row, then the tally as it sits under them. */
  .page {
    width: min(760px, 100%);
    margin: 3rem auto 0;
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
  .ladder {
    display: flex;
    flex-wrap: wrap;
    gap: 3.5rem 2.5rem;
    padding: 2.5rem 1.5rem 0;
  }
  .rung {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    font-size: 15px;
  }
  @media (max-width: 640px) {
    .answers {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
