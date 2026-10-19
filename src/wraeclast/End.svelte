<script lang="ts">
  // The run's end: won or lost, where, the run in numbers and item by item,
  // and the Copy run log button (every run kept, as JSON, for the owner).
  import { backdropShadow } from '../lib/backdropShadow';
  import { ITEMS_IN_RUN, SUPPLIES, SUPPLY_NAMES, ZONE_NAMES, type Run } from './rules';
  import { logText } from './runLog';
  import { play } from './play.svelte';
  import { times } from './markup';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const log = $derived(s.log);
  const won = $derived(log.result === 'win');
  const named = $derived(log.items.filter((it) => it.submits.at(-1)?.right).length);
  const bought = $derived(SUPPLIES.filter((sup) => log.bought[sup]).map((sup) => `${SUPPLY_NAMES[sup]} × ${log.bought[sup]}`));
  const used = $derived(SUPPLIES.filter((sup) => log.used[sup]).map((sup) => `${SUPPLY_NAMES[sup]} × ${log.used[sup]}`));
  const text = $derived(logText(play.runs));

  let copied = $state<'yes' | 'no' | null>(null);
  let box = $state<HTMLTextAreaElement>();
  let showLog = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = 'yes';
    } catch {
      // No clipboard here (an old browser, a page not in focus): the log shown, selected, to copy by hand.
      copied = 'no';
      showLog = true;
      queueMicrotask(() => box?.select());
    }
  }
  const zoneOf = (z: string, no: number) => (z === 'boss' ? 'Boss' : `Zone ${no} • ${ZONE_NAMES[z as keyof typeof ZONE_NAMES]}`);
</script>

<div class="end">
  <header class="screen-title">
    <p class="kicker">{won ? 'The boss is beaten' : `Fell on item ${(log.endedOn?.n ?? 0) + 1} of ${ITEMS_IN_RUN}`}</p>
    <h1 class:lost={!won}>{won ? 'The run is won' : 'The run is lost'}</h1>
    <p class="sub">
      {#if won}All <span class="n">{ITEMS_IN_RUN}</span> items named, with <span class="n">{log.lifeEnd}</span> life left.{:else}{log.endedOn?.name} took the last of your life.{/if}
    </p>
  </header>

  <section class="panel sums" aria-label="The run in numbers" use:backdropShadow>
    <dl>
      <div><dt>Named</dt><dd><span class="n">{named}</span> of <span class="n">{ITEMS_IN_RUN}</span></dd></div>
      <div><dt>Misses</dt><dd class="n">{log.misses}</dd></div>
      <div><dt>Named with no supply</dt><dd class="n">{log.noSupply}</dd></div>
      <div><dt>Life at the end</dt><dd class="n">{log.lifeEnd}</dd></div>
      <div><dt>Gold earned</dt><dd class="n">{log.goldEarned}</dd></div>
      <div><dt>Gold spent</dt><dd class="n">{log.goldSpent}</dd></div>
      <div><dt>Flask drinks</dt><dd class="n">{log.drinks}</dd></div>
      <div><dt>Bought</dt><dd>{bought.join(' • ') || 'Nothing'}</dd></div>
      <div><dt>Used</dt><dd>{used.join(' • ') || 'Nothing'}</dd></div>
    </dl>
  </section>

  <section class="panel items" aria-labelledby="items-h" use:backdropShadow>
    <h2 id="items-h">Item by item</h2>
    <ol>
      {#each log.items as it, i (i)}
        {@const right = it.submits.at(-1)?.right}
        <li class:lost={!right}>
          <span class="no n">{i + 1}</span>
          <span class="what">
            <span class="name">{it.name}</span>
            <span class="where">{zoneOf(it.zone, it.zoneNo)} • {it.category} <span class="n">{times(it.multiplier)}</span> • <span class="n">{it.names}</span> names</span>
          </span>
          <span class="res">
            {#if right}{#if it.submits.length > 1}<span class="n">{it.submits.length - 1}</span> {it.submits.length - 1 === 1 ? 'miss' : 'misses'} • {/if}<span class="n">+{it.gold}</span> gold{:else}Lost here{/if}
            {#if it.supplies.length} • <span class="n">{it.supplies.length}</span> {it.supplies.length === 1 ? 'supply' : 'supplies'}{/if}
          </span>
        </li>
      {/each}
    </ol>
  </section>

  {#if showLog}
    <section class="panel" aria-labelledby="log-h">
      <h2 id="log-h">Run log</h2>
      <p class="note">{copied === 'no' ? "It couldn't be copied here: select it all and copy it by hand." : 'Every run kept on this device, newest last.'}</p>
      <textarea bind:this={box} readonly rows="8" value={text}></textarea>
    </section>
  {/if}

  <div class="go dock">
    <button class="btn primary big" onclick={copy}>{copied === 'yes' ? 'Copied' : 'Copy run log'}</button>
    <button class="btn ghost" onclick={() => play.start()}>New run</button>
  </div>
  <p class="foot">
    {#if copied === 'yes'}The log of the last <span class="n">{play.runs.length}</span> {play.runs.length === 1 ? 'run' : 'runs'} is on the clipboard: paste it to the owner.{:else}The log holds the last <span class="n">{play.runs.length}</span> {play.runs.length === 1 ? 'run' : 'runs'} on this device.{/if}
    {#if !showLog}<button class="link" onclick={() => (showLog = true)}>Show it</button>{/if}
  </p>
</div>

<style>
  .end {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 44rem;
    margin: 0 auto;
  }
  h1.lost {
    color: #e0a090;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.5rem 1.2rem;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.8rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.2);
    padding-bottom: 0.25rem;
  }
  dt {
    color: var(--muted);
    font-size: 0.95rem;
  }
  dd {
    margin: 0;
    text-align: right;
  }
  ol {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  li {
    display: grid;
    grid-template-columns: 1.6rem minmax(0, 1fr);
    gap: 0 0.6rem;
    padding: 0.4rem 0;
    border-top: 1px solid rgba(125, 99, 51, 0.2);
  }
  li:first-child {
    border-top: 0;
  }
  .no {
    grid-row: span 2;
    color: var(--muted);
  }
  .what {
    display: flex;
    flex-direction: column;
  }
  .name {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--unique-hi);
  }
  li.lost .name {
    color: #e0a090;
  }
  .where,
  .res {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .res {
    grid-column: 2;
  }
  .note {
    margin: 0.3rem 0 0.5rem;
    font-size: 0.92rem;
    color: var(--muted);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
    color: var(--text);
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.5rem;
    user-select: text;
    cursor: text;
  }
  .foot {
    margin: 0;
    text-align: center;
    font-size: 0.92rem;
    color: var(--muted);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--gold);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
</style>
