<script lang="ts">
  import { DELVE_LIVES } from '../../lib/delve';
  import { zoneOf, type FindStats, type RunStory } from '../../lib/codexStats';
  import type { DelveRun } from '../../lib/delveRecord';
  import { itemImage } from '../../lib/ui';
  import { backdropShadow } from '../../lib/backdropShadow';
  import type { Item } from '../../lib/game';
  import Num from './Num.svelte';

  // The latest run: how deep, where each life went and what took it, the
  // finds it took, and how it compares with your typical depth.
  let { run, story, median, best, onopen }: { run: DelveRun; story: RunStory; median: number | null; best: number | null; onopen: (item: Item) => void } =
    $props();

  const when = (t: number) =>
    new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const typical = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));

  const who = $derived(
    run.hot ? `Hot-seat, ${run.players} players: the group's deepest` : run.players < 2 ? 'Alone' : `${run.players} players${run.won ? ', delved deepest' : ''}`,
  );
  const zone = $derived(zoneOf(run.depth));
  /** Lives still in the phial when a run was left. */
  const kept = $derived(run.left ? DELVE_LIVES - story.lives.length : 0);
  const diff = $derived(median === null || run.left ? null : run.depth - median);

  const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
  /** What the run's finds came to: a count and what it counts, then how it ended. */
  function findsOf(f: FindStats): { n: number; what: string; how?: string }[] {
    const v = f.finds.azurite;
    const c = f.finds.flare;
    const d = f.finds.dynamite;
    const out: { n: number; what: string; how?: string }[] = [];
    if (v.taken) {
      const how = [v.gained.wards ? plural(v.gained.wards, 'ward') : '', v.gained.shards ? plural(v.gained.shards, 'shard') : '', v.taken - v.ok ? `${v.taken - v.ok} caved in` : '']
        .filter(Boolean)
        .join(', ');
      out.push({ n: v.taken, what: word(v.taken, 'Azurite Vein'), how });
    }
    if (c.taken) out.push({ n: c.taken, what: word(c.taken, 'Flare Cache'), how: c.gained.flares ? plural(c.gained.flares, 'flare') : 'missed' });
    if (d.taken) out.push({ n: d.taken, what: word(d.taken, 'Dynamite Cache') });
    if (f.wardsBroke) out.push({ n: f.wardsBroke, what: `${word(f.wardsBroke, 'ward')} broke in place of a life` });
    if (f.flaresBurnt) out.push({ n: f.flaresBurnt, what: `${word(f.flaresBurnt, 'flare')} burnt` });
    return out;
  }
  const finds = $derived(findsOf(story.finds));
</script>

<section class="panel wide last" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="last-h">
  <header>
    <h2 id="last-h">Last run</h2>
    <span class="when n">{when(run.at)}</span>
  </header>
  <div class="body">
    <div class="depth" class:left={run.left}>
      <span class="big n">{run.depth}</span>
      <span class="label">{run.left ? 'left at' : 'fell at'}</span>
    </div>
    <div class="info">
      <p class="lead">
        {who}. {run.left ? 'Left' : 'Fell'} in <span class="zname">{zone.name}</span>{#if run.left}, with <b class="n">{kept}</b> {kept === 1 ? 'life' : 'lives'} to spare{/if}.
        {#if !run.left && best === run.depth}
          <span class="cmp up">Your best.</span>
        {:else if diff !== null && median !== null}
          <span class="cmp" class:up={diff > 0}>
            {#if diff > 0}<b class="n">{typical(diff)}</b> deeper than{:else if diff < 0}<b class="n">{typical(-diff)}</b> short of{:else}Right at{/if} your typical
            <b class="n">{typical(median)}</b>.
          </span>
        {/if}
      </p>
      {#if story.lives.length}
        <ol class="lives" aria-label="Where each life went">
          {#each story.lives as l, i (i)}
            {@const fall = !run.left && i === story.lives.length - 1}
            <li>
              <span class="pip" class:fall aria-hidden="true"></span>
              <span class="l-depth n">{l.depth}</span>
              {#if l.item}
                {@const it = l.item}
                <button class="took" onclick={() => onopen(it)} aria-label="{fall ? 'Your last life' : `Life ${i + 1}`}, depth {l.depth}: {it.name}{l.caveIn ? ', a cave-in' : ''}">
                  <span class="thumb"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
                  <span class="took-name"><span>{it.name}</span><small>in {l.zone.name}{l.caveIn ? ' • a cave-in' : ''}</small></span>
                </button>
              {:else}
                <span class="took none"><span class="thumb none" aria-hidden="true">?</span><span class="took-name"><span class="faint">not logged</span><small>in {l.zone.name}</small></span></span>
              {/if}
            </li>
          {/each}
        </ol>
      {:else if run.left}
        <p class="quiet">Not a life lost.</p>
      {/if}
      <p class="quiet">
        {#if finds.length}{#each finds as f, i (i)}{i ? ' • ' : ''}<span class="n">{f.n}</span> {f.what}{#if f.how}&nbsp;(<Num text={f.how} />){/if}{/each}.{:else if story.answers}No finds taken.{:else if run.hot}Hot-seat answers with several players aren't written into the codex.{:else}No answer of yours was logged for this run.{/if}
      </p>
    </div>
  </div>
</section>

<style>
  .when {
    font-size: 0.78rem;
    font-weight: 400;
    color: var(--muted);
  }
  .body {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .depth {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 0.2rem;
  }
  .big {
    font-size: 2.8rem;
    line-height: 1;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .label {
    margin-top: 0.3rem;
    font-family: var(--font-display);
    font-size: 0.66rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .lead {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.4;
  }
  .zname {
    font-family: var(--font-display);
    letter-spacing: 0.04em;
    color: var(--gold-hi);
  }
  .cmp {
    font-style: italic;
    color: var(--muted);
  }
  .cmp.up {
    color: #e8a36a;
  }
  .cmp .n {
    font-size: 0.9em;
  }
  .lives {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 12px 2.2rem minmax(0, 1fr);
    align-items: center;
    column-gap: 0.6rem;
    row-gap: 0.4rem;
  }
  .lives li {
    display: contents;
  }
  .pip {
    justify-self: center;
    width: 8px;
    height: 8px;
    rotate: 45deg;
    border: 1px solid #e6c47e;
    background: #1a120a;
  }
  .pip.fall {
    width: 10px;
    height: 10px;
    border-color: #ffd59a;
    background: radial-gradient(circle, #fff1c9, #ff8a32 45%, #c22a10);
    box-shadow: 0 0 8px rgba(255, 120, 50, 0.8);
  }
  .l-depth {
    font-size: 0.9rem;
    text-align: right;
    color: var(--gold-hi);
  }
  .faint {
    font-style: italic;
    color: var(--muted);
  }
  .took {
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 2px 0.6rem 2px 2px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    color: var(--text);
    font-size: 0.98rem;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s;
  }
  button.took:hover {
    border-color: var(--gold-lo);
    background: rgba(0, 0, 0, 0.35);
  }
  .took.none {
    cursor: default;
  }
  .took-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .took-name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .took-name small {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .quiet .n,
  .lead .n {
    font-size: 0.85em;
  }
  .quiet {
    margin: 0;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }

  @media (max-width: 560px) {
    .body {
      grid-template-columns: 3.6rem minmax(0, 1fr);
      gap: 0.7rem;
    }
    .big {
      font-size: 2.2rem;
    }
  }
</style>
