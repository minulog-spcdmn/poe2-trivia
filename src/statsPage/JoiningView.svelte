<script lang="ts">
  // Joining: whether getting into a room works. Tries to join by where they
  // started, how many got in, every failure by its cause (opening a room's
  // too), and the links that bring players in.
  import Bars from './Bars.svelte';
  import { fmt } from './chart';
  import Delta from './Delta.svelte';
  import { VIA_NAMES, percent } from './model';
  import type { Period, Read } from './read';
  import Section from './Section.svelte';

  let { read, period }: { read: Read; period: Period } = $props();

  const L = $derived(read.now);
  const B = $derived(read.before);
  const tried = $derived(L.joins.reduce((n, j) => n + j.tried, 0));
  const joined = $derived(L.joins.reduce((n, j) => n + j.joined, 0));
  const failures = $derived(L.failures.map((f) => ({ label: f.host ? `Opening a room: ${f.label.toLowerCase()}` : f.label, count: f.count })));
  const failed = $derived(L.failures.reduce((n, f) => n + f.count, 0));
  const failedBefore = $derived(B.failures.reduce((n, f) => n + f.count, 0));
</script>

<div class="stack">
  <div class="two">
    <Section title="Joining a room" says="Tries to join someone's room, by where they started, and how many got in.">
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
                  <td class="n strong">{percent(j.joined, j.tried)}</td>
                  <td class="bar"><span class="meter"><i style:width="{j.tried ? Math.min(100, (100 * j.joined) / j.tried) : 0}%"></i></span></td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All</th>
                <td class="n">{fmt(tried)}</td>
                <td class="n">{fmt(joined)}</td>
                <td class="n">{percent(joined, tried)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      {:else}
        <p class="soft">Nobody tried to join a room in these days.</p>
      {/if}
    </Section>

    <Section title="What went wrong" says="Every failure, joining a room or opening one, by its cause.">
      {#snippet aside()}
        <div class="total">
          <b class:bad={failed > 0}>{fmt(failed)}</b>
          <Delta now={failed} before={failedBefore} worse="up" period={period.before} />
        </div>
      {/snippet}
      <Bars bars={failures} top={10} tone="down" empty="Nothing went wrong." />
    </Section>
  </div>

  <Section title="Links opened" says="Players who arrived by a link someone shared.">
    <dl class="links">
      <div><dt>Invite links to a room</dt><dd>{fmt(L.links.invite)}</dd><Delta now={L.links.invite} before={B.links.invite} period={period.before} /></div>
      <div><dt>Delve challenge links</dt><dd>{fmt(L.links.delve)}</dd><Delta now={L.links.delve} before={B.links.delve} period={period.before} /></div>
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
    align-items: start;
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
  .total b.bad {
    color: var(--a-down);
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
    margin: 0;
    font-size: 2.6rem;
    font-weight: 650;
    line-height: 1.1;
    color: var(--a-ink);
  }
  .soft {
    color: var(--a-muted);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  @media (max-width: 1100px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
