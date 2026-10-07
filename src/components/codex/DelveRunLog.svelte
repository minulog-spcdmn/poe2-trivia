<script lang="ts">
  import { engine } from '../../lib/session.svelte';
  import type { Answer } from '../../lib/codex';
  import { answersFor, runLog, runStory, zoneOf, type RulesGroup } from '../../lib/codexStats';
  import { RUN_LIMIT, isTogether, runKey, type DelveRun } from '../../lib/delveRecord';
  import { shownDepth } from '../../lib/delve';
  import { itemImage } from '../../lib/ui';
  import { backdropShadow } from '../../lib/backdropShadow';
  import type { Item } from '../../lib/game';

  // Every run kept in full, newest first, as the Collection's table: the
  // latest SHORT rows, then all of them when asked. Runs under other rules (or
  // whose rules changed as they were resumed) follow, each group with its own
  // bests, never compared with today's, and the short list's rows are shared
  // with them. Together, a run's depth is the team's and its lives are yours.
  let {
    runs,
    others,
    byRun,
    total,
    onopen,
  }: { runs: DelveRun[]; others: RulesGroup[]; byRun: Map<number, Answer[]>; total: number; onopen: (item: Item) => void } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const SHORT = 10;
  let all = $state(false);
  const otherCount = $derived(others.reduce((n, g) => n + g.runs.length, 0));
  const listed = $derived(runs.length + otherCount);
  /** The rows: in the short list SHORT runs at most, under these rules and others alike. */
  const log = $derived(runLog(runs, others, all ? Infinity : SHORT));

  const who = (r: DelveRun) => (isTogether(r) ? `${r.players} together` : 'Alone');
  /** Lives a row shows: three at most, the last of more standing for the rest. */
  const MAX_LIVES = 3;
</script>

{#snippet row(r: DelveRun)}
  {@const story = runStory(r, answersFor(byRun, r), engine.byId).lives}
  {@const lives = story.length > MAX_LIVES ? story.slice(0, MAX_LIVES - 1) : story}
  <tr class:left={r.left}>
    <td class="num depth">{shownDepth(r.depth)}</td>
    <td class="run">
      <span class="r-main"><span class="r-zone">{zoneOf(r.depth).name}</span></span>
      <small
        >{who(r)}{#if r.left}{' • '}left early{/if}<span class="narrow">{' • '}<span class="n">{date(r.at)}</span></span></small
      >
    </td>
    <td class="lives">
      {#if lives.length}
        <span class="took">
          {#each lives as l, k (k)}
            {#if l.item}
              {@const it = l.item}
              <button class="mini" onclick={() => onopen(it)} title="Depth {shownDepth(l.depth)}: {it.name}" aria-label="Life lost at depth {shownDepth(l.depth)} to {it.name}">
                <img src={itemImage(it.id)} alt="" loading="lazy" />
                <span class="at n" aria-hidden="true">{shownDepth(l.depth)}</span>
              </button>
            {:else}
              <span class="mini none" title="Depth {shownDepth(l.depth)}: not logged" role="img" aria-label="Life lost at depth {shownDepth(l.depth)}, item not logged">
                ?<span class="at n" aria-hidden="true">{shownDepth(l.depth)}</span>
              </span>
            {/if}
          {/each}
          {#if story.length > lives.length}
            <span class="mini none" title="{story.length - lives.length} more: depths {story.slice(lives.length).map((l) => shownDepth(l.depth)).join(', ')}" role="img" aria-label="{story.length - lives.length} more lives lost"
              >+{story.length - lives.length}</span
            >
          {/if}
        </span>
      {/if}
    </td>
    <td class="num wide when">{date(r.at)}</td>
  </tr>
{/snippet}

<section class="log" aria-labelledby="log-h">
  <div class="bar">
    <h2 id="log-h">Run log</h2>
    <span class="muted"
      >{#if runs.length}{listed} {listed === 1 ? 'run' : 'runs'}{otherCount ? `, ${otherCount} under other rules` : ''}{:else}{otherCount}
        {otherCount === 1 ? 'run' : 'runs'} under other rules{/if}</span
    >
  </div>

  <div class="ledger" use:backdropShadow={{ fill: 'linear' }}>
    <table>
      <thead>
        <tr>
          <th class="num">Depth</th>
          <th>Run</th>
          <th>Lives lost</th>
          <th class="num wide">When</th>
        </tr>
      </thead>
      {#if log.shown.length}
        <tbody>
          {#each log.shown as r (runKey(r))}{@render row(r)}{/each}
        </tbody>
      {/if}
      {#each log.others as { group: g, runs: list } (g.ruleset ?? 'mixed')}
        <tbody class="other">
          <tr class="group">
            <td colspan="4">
              {#if g.ruleset === null}
                Rules changed mid-run<small>: resumed by a build with other rules, never counted</small>
              {:else}
                Other rules<small
                  >: never compared with today's{#if g.solo !== null}{' • '}deepest alone <span class="n">{shownDepth(g.solo)}</span>{/if}{#if g.together !== null}{' • '}together <span
                      class="n">{shownDepth(g.together)}</span
                    >{/if}</small
                >
              {/if}
            </td>
          </tr>
          {#each list as r (runKey(r))}{@render row(r)}{/each}
        </tbody>
      {/each}
    </table>
  </div>

  {#if listed > SHORT}
    <button class="more" onclick={() => (all = !all)}>{all ? 'Show the latest 10' : `Show all ${listed} runs`}</button>
  {/if}
  {#if total > runs.length && (all || runs.length <= SHORT)}
    <p class="foot">The last {RUN_LIMIT} runs are kept here; all {total} count in the numbers above.</p>
  {/if}
</section>

<style>
  .log {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.6rem;
  }
  /* As the Collection's title bar. */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem 1rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  .bar h2 {
    margin: 0;
    font-size: 1.05rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .bar .muted {
    font-size: 0.92rem;
    font-style: italic;
  }

  /* The Collection's table. */
  .ledger {
    border: 1px solid #5a3a1c;
    --bs-fill-a: rgba(5, 4, 3, 0.92);
    --bs-fill-b: rgba(5, 4, 3, 0.92);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs2, 0 0) var(--bs2-color, transparent));
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  th {
    padding: 0.75rem 0.8rem;
    text-align: left;
    background: linear-gradient(180deg, #3b2412, #1c1008);
    border-bottom: 1px solid #6b4520;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
    white-space: nowrap;
  }
  th:nth-child(1) {
    width: 5.2rem;
  }
  th:nth-child(3) {
    width: 10.5rem;
  }
  th:nth-child(4) {
    width: 6.5rem;
  }
  .num {
    text-align: right;
  }
  td {
    padding: 0.3rem 0.8rem;
    border-bottom: 1px solid #1d150c;
    vertical-align: middle;
  }
  tbody tr {
    transition: background 0.2s;
  }
  tbody tr:not(.group):hover {
    background: rgba(175, 96, 37, 0.08);
  }
  tbody:last-child tr:last-child td {
    border-bottom: 0;
  }
  td.num {
    font-family: var(--font-cinzel);
    font-size: 0.88rem;
  }
  td.depth {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .left td.depth {
    color: var(--muted);
  }
  .run {
    overflow: hidden;
  }
  .run > * {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .r-main {
    font-size: 1rem;
    line-height: 1.2;
  }
  .run small {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .when {
    color: var(--muted);
  }
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 0.88em;
  }
  .narrow {
    display: none;
  }
  .took {
    display: flex;
    gap: 0.3rem;
  }
  /* A small art stage, as the Collection's, with the depth the life went at in its corner. */
  .mini {
    position: relative;
    flex: none;
    width: 40px;
    height: 40px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 3px;
    background:
      radial-gradient(ellipse 60% 55% at 50% 50%, rgba(175, 96, 37, 0.22), transparent 70%),
      linear-gradient(180deg, #0c0d12, #060709);
    box-shadow: inset 0 0 0 1px rgba(90, 58, 28, 0.6);
    color: var(--muted);
    font-family: var(--font-cinzel);
  }
  button.mini {
    cursor: pointer;
    transition: box-shadow 0.2s;
  }
  button.mini:hover {
    box-shadow:
      inset 0 0 0 1px var(--gold-lo),
      0 0 10px rgba(201, 164, 92, 0.25);
  }
  .mini img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
  }
  .at {
    position: absolute;
    right: 1px;
    bottom: 0;
    padding: 0 2px;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text);
    background: rgba(5, 4, 3, 0.8);
    border-radius: 2px;
  }
  .group td {
    padding: 0.55rem 0.8rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    color: var(--gold);
    background: rgba(59, 48, 36, 0.18);
  }
  .group small {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-style: italic;
    letter-spacing: 0;
    color: var(--muted);
  }
  .other tr:not(.group) {
    opacity: 0.75;
  }
  .more {
    align-self: center;
    min-height: 44px;
    padding: 0 1rem;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    text-decoration: underline 1px rgba(201, 164, 92, 0.4);
    text-underline-offset: 0.35em;
    cursor: pointer;
    transition: color 0.2s;
  }
  .more:hover {
    color: var(--gold-hi);
    text-decoration-color: var(--gold-hi);
  }
  .foot {
    margin: -0.4rem 0 0;
    text-align: center;
    font-size: 0.9rem;
    font-style: italic;
    color: var(--muted);
  }

  @media (max-width: 560px) {
    .wide {
      display: none;
    }
    .narrow {
      display: inline;
    }
    th {
      padding: 0.7rem 0.4rem;
      letter-spacing: 0.08em;
    }
    td {
      padding: 0.3rem 0.4rem;
    }
    th:nth-child(1) {
      width: 3.4rem;
    }
    th:nth-child(3) {
      width: 8.6rem;
    }
    .took {
      gap: 0.15rem;
    }
  }
</style>
