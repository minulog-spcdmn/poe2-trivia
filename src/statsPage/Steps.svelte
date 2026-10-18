<script lang="ts">
  // From visit to game, as one of the overview's figures: the share of the
  // people who opened the game that played a game, then, each a bar as long
  // as its share, those who finished one and those who answered Today's
  // unique (insights.ts stepsOf), against the period before. Visits and steps
  // are both counted once a person in eight hours, so these are shares of
  // people, not of games.
  import { shortDay } from './chart';
  import Delta from './Delta.svelte';
  import { stepsOf } from './insights';
  import type { Period, Read } from './read';

  let { read, period }: { read: Read; period: Period } = $props();

  const now = $derived(stepsOf(read.now));
  const was = $derived(stepsOf(read.before));
  const share = (part: number, whole: number) => (whole ? Math.min(100, (100 * part) / whole) : null);
  const played = $derived(share(now.played, now.visitors));
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
  const rows = $derived([
    { name: 'Finished a game', share: now.from ? share(now.finished, now.visitors) : null },
    { name: "Answered Today's unique", share: share(now.answered, now.askedVisitors) },
  ]);
  /** Marked only from a day inside the period: the shares cover the days since. */
  const late = $derived(now.from && now.from > read.from ? now.from : null);
</script>

<div class="steps">
  <span class="name">From visit to game</span>
  <b class="value">{now.from ? pct(played) : '–'}</b>
  <span class="means">{now.from ? `of visitors played a game${late ? `, since ${shortDay(late)}` : ''}` : 'played a game: counted from the next release'}</span>
  {#each rows as r (r.name)}
    <div class="row">
      <span class="step">{r.name}</span>
      <span class="bar" aria-hidden="true"><i style:width="{r.share ?? 0}%"></i></span>
      <b>{pct(r.share)}</b>
    </div>
  {/each}
  <span class="change">
    {#if now.from}
      <Delta now={played} before={was.from ? share(was.played, was.visitors) : null} rate period={period.before} />
    {/if}
  </span>
</div>

<style>
  .steps {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    padding: 1.4rem 1.5rem 1.5rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--a-ink);
  }
  .value {
    font-size: clamp(2.6rem, 3.4vw, 4rem);
    font-weight: 650;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .means {
    font-size: 1.05rem;
    color: var(--a-muted);
  }
  /* Each further step a line: its name, a bar as long as its share, the share. */
  .row {
    display: grid;
    grid-template-columns: auto minmax(2rem, 1fr) auto;
    align-items: center;
    column-gap: 0.7rem;
    margin-top: 0.2rem;
  }
  .step {
    font-size: 0.95rem;
    color: var(--a-text);
  }
  .bar {
    display: block;
    height: 0.45rem;
    background: var(--a-track);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar > i {
    display: block;
    height: 100%;
    background: var(--a-now);
    border-radius: 2px;
  }
  .row b {
    font-size: 1.15rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  .change {
    margin-top: auto;
    padding-top: 0.6rem;
  }
</style>
