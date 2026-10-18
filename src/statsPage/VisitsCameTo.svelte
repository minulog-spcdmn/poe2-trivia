<script lang="ts">
  // What a visit comes to: the counts set against each other (model.ts
  // visitsCameTo), each against the period before. `across`: the four in a
  // row (the board), not two by two.
  import { fmt } from './chart';
  import Delta from './Delta.svelte';
  import { visitsCameTo } from './model';
  import type { Period, Read } from './read';

  let { read, period, across = false }: { read: Read; period: Period; across?: boolean } = $props();

  const now = $derived(visitsCameTo(read.now));
  const was = $derived(visitsCameTo(read.before));
  const one = (v: number | null) => (v === null ? '–' : v.toFixed(1));
</script>

<dl class="came" class:across>
  <div>
    <dt>Seats filled</dt>
    <dd><b>{fmt(now.seats)}</b><span class="means">players in every game, added up</span><Delta now={now.seats} before={was.seats} period={period.before} /></dd>
  </div>
  <div>
    <dt>Players a game</dt>
    <dd><b>{one(now.perGame)}</b><span class="means">on average, every mode</span><Delta now={now.perGame} before={was.perGame} digits={1} worse="neither" period={period.before} /></dd>
  </div>
  <div>
    <dt>Games a visitor</dt>
    <dd><b>{one(now.perVisitor)}</b><span class="means">seats filled for each visitor</span><Delta now={now.perVisitor} before={was.perVisitor} digits={1} period={period.before} /></dd>
  </div>
  <div>
    <dt>Answered Today's unique</dt>
    <dd><b>{now.daily === null ? '–' : `${Math.round(now.daily)}%`}</b><span class="means">of visitors, on the days it asked</span><Delta now={now.daily} before={was.daily} rate period={period.before} /></dd>
  </div>
</dl>
{#if now.perGame === null && now.daily === null}
  <p class="soft">Nothing to set against the visits in these days.</p>
{/if}

<style>
  .came {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.4rem 2rem;
    margin: 0;
  }
  .came.across {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .came div {
    min-width: 0;
  }
  dt {
    font-weight: 600;
    color: var(--a-ink);
  }
  dd {
    display: grid;
    gap: 0.15rem;
    margin: 0.2rem 0 0;
  }
  b {
    font-size: 2.4rem;
    font-weight: 650;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--a-ink);
  }
  .means,
  .soft {
    font-size: 1rem;
    color: var(--a-muted);
  }
  .soft {
    margin: 1rem 0 0;
  }
  @media (max-width: 600px) {
    .came {
      gap: 1.1rem 1rem;
    }
    b {
      font-size: 1.9rem;
    }
  }
</style>
