<script lang="ts">
  // Joining: whether getting into a room works. Tries to join by where they
  // started, how many got in, every failure by its cause (opening a room's
  // too), the game's own scripts' errors in a line of their own (they have
  // nothing to do with joining), and the links that bring players in.
  import Bars from './Bars.svelte';
  import { fmt } from './chart';
  import Delta from './Delta.svelte';
  import { chances, failureRate } from './insights';
  import { VIA_NAMES, percent } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';

  let { read, period }: { read: Read; period: Period } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const tried = $derived(L.joins.reduce((n, j) => n + j.tried, 0));
  const joined = $derived(L.joins.reduce((n, j) => n + j.joined, 0));
  const failures = $derived(L.failures.filter((f) => !f.script).map((f) => ({ label: f.host ? `Opening a room: ${f.label.toLowerCase()}` : f.label, count: f.count })));
  const failedOf = (c: typeof L, script: boolean) => c.failures.reduce((n, f) => n + (f.script === script ? f.count : 0), 0);
  const failed = $derived(failedOf(L, false));
  const failedBefore = $derived(failedOf(B, false));
  /** Failures for each 100 games and tries to join, as the overview's warning weighs them: more games bring more failures, and that's no news. */
  const rate = $derived(failureRate(L));
  const rateBefore = $derived(failureRate(B));
  const scripts = $derived(failedOf(L, true));
  const scriptsBefore = $derived(failedOf(B, true));
</script>

<div class="stack">
  <div class="two">
    <Section title="Joining a room" says="Tries to join a room, by where they started.">
      {#if tried}
        <div class="scroll-x">
          <table class="table" aria-label="Joins by where they started">
            <thead>
              <tr>
                <th scope="col">Started from</th>
                <th scope="col" class="n">Tried</th>
                <th scope="col" class="n">Got in</th>
                <th scope="col" class="n">Worked</th>
                <th scope="col" class="bar"><span class="sr">Share that got in</span></th>
              </tr>
            </thead>
            <tbody>
              {#each L.joins as j (j.via)}
                <tr>
                  <th scope="row">{VIA_NAMES[j.via]}</th>
                  <td class="n">{fmt(j.tried)}</td>
                  <td class="n">{fmt(j.joined)}</td>
                  <td class="n strong">{percent(Math.min(j.joined, j.tried), j.tried)}</td>
                  <td class="bar"><span class="meter"><i style:width="{j.tried ? Math.min(100, (100 * j.joined) / j.tried) : 0}%"></i></span></td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All</th>
                <td class="n">{fmt(tried)}</td>
                <td class="n">{fmt(joined)}</td>
                <td class="n">{percent(Math.min(joined, tried), tried)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      {:else}
        <p class="soft">Nobody tried to join a room in these days.</p>
      {/if}
    </Section>

    <Section title="What went wrong" says="Failures joining or opening a room, by cause.">
      {#snippet aside()}
        <div class="total">
          <b class:bad={failed > 0}>{fmt(failed)}</b>
          {#if rate !== null}
            <span class="per">failures; {rate < 10 ? rate.toFixed(1) : Math.round(rate)}% of games and tries to join</span>
            <Delta now={rate} before={rateBefore} rate digits={1} worse="up" of={{ now: chances(L), before: chances(B) }} period={period.before} />
          {:else}
            <Delta now={failed} before={failedBefore} worse="up" period={period.before} />
          {/if}
        </div>
      {/snippet}
      <Bars bars={failures} top={10} tone="down" empty="Nothing went wrong." />
      {#if scripts || scriptsBefore}
        <p class="line"><b class:bad={scripts > 0}>{fmt(scripts)}</b> errors in the game's own scripts, once a page load at most. <Delta now={scripts} before={scriptsBefore} worse="up" period={period.before} /></p>
      {/if}
    </Section>
  </div>

  <Section title="Links opened" says="Links someone shared, each time one was opened.">
    <dl class="links">
      <div><dt>Invite links to a room</dt><dd><b>{fmt(L.links.invite)}</b><Delta now={L.links.invite} before={B.links.invite} period={period.before} /></dd></div>
      <div><dt>Delve challenge links</dt><dd><b>{fmt(L.links.delve)}</b><Delta now={L.links.delve} before={B.links.delve} period={period.before} /></dd></div>
    </dl>
  </Section>
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
    color: var(--a-ink);
  }
  .per {
    color: var(--a-muted);
    text-align: end;
  }
  .total b.bad,
  .line b.bad {
    color: var(--a-down);
  }
  .line {
    margin: 1.2rem 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid var(--a-rule);
    color: var(--a-text);
  }
  .line b {
    font-weight: 650;
    color: var(--a-ink);
  }
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .bar {
    width: 30%;
    min-width: 4rem;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem 4rem;
    margin: 0;
  }
  .links div {
    display: grid;
    gap: 0.2rem;
  }
  .links dt {
    font-size: 1.1rem;
    color: var(--a-muted);
  }
  .links dd {
    display: grid;
    gap: 0.2rem;
    margin: 0;
  }
  .links dd b {
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1.1;
    color: var(--a-ink);
  }
  .soft {
    color: var(--a-muted);
  }
  @media (max-width: 1100px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
