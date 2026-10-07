<script lang="ts">
  import { DELVE_LIVES, shownDepth } from '../../lib/delve';
  import { zoneOf, type RunStory } from '../../lib/codexStats';
  import { isTogether, runKey, type DelveRun } from '../../lib/delveRecord';
  import { itemImage } from '../../lib/ui';
  import type { Item } from '../../lib/game';

  // The latest run in one row: how deep, where, when and how it compares
  // (with runs of its kind: `median` and `best` are alone's or together's;
  // only the best run itself is "your deepest", one as deep is level with
  // it), together your part in it, and a small picture of each item that cost
  // you a life, its depth beneath.
  let { run, story, median, best, onopen }: { run: DelveRun; story: RunStory; median: number | null; best: DelveRun | null; onopen: (item: Item) => void } =
    $props();

  const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const usual = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));

  const team = $derived(isTogether(run));
  const who = $derived(team ? `${run.players} together` : 'Alone');
  const zone = $derived(zoneOf(run.depth));
  /** Lives still in the phial when a run was left (together, give and take). */
  const kept = $derived(run.left ? Math.max(0, DELVE_LIVES - (run.losses?.length ?? story.lives.length) - (run.given ?? 0) + (run.revived ?? 0)) : 0);
  const how = $derived(run.left ? 'left' : team ? 'perished together' : 'perished');
  const diff = $derived(median === null || run.left ? null : run.depth - median);
  const isBest = $derived(!run.left && !!best && runKey(best) === runKey(run));
  const level = $derived(!run.left && !isBest && best?.depth === run.depth);
  /** Finds it took, in a few words. */
  const found = $derived.by(() => {
    const f = story.finds.finds;
    const out: [number, string][] = [];
    if (f.azurite.taken) out.push([f.azurite.taken, f.azurite.taken === 1 ? 'vein' : 'veins']);
    if (f.flare.taken) out.push([f.flare.taken, f.flare.taken === 1 ? 'flare cache' : 'flare caches']);
    if (f.dynamite.taken) out.push([f.dynamite.taken, f.dynamite.taken === 1 ? 'dynamite cache' : 'dynamite caches']);
    if (story.finds.wardsBroke) out.push([story.finds.wardsBroke, story.finds.wardsBroke === 1 ? 'ward broke' : 'wards broke']);
    // Together: your part in it.
    if (run.revived) out.push([run.revived, run.revived === 1 ? 'time brought back' : 'times brought back']);
    if (run.given) out.push([run.given, run.given === 1 ? 'life given' : 'lives given']);
    return out;
  });
</script>

<section class="last" aria-labelledby="last-h">
  <div class="depth">
    <span class="label" id="last-h">Last run</span>
    <span class="value">{shownDepth(run.depth)}</span>
  </div>
  <div class="text">
    <p class="lead">
      {who} • {how} in <span class="zname">{zone.name}</span>{#if run.left && kept}, <span class="n">{kept}</span>
        {kept === 1 ? 'life' : 'lives'} to spare{/if}{#if isBest}{' • '}<span class="up">your deepest</span>{:else if level}{' • '}<span class="up"
          >level with your deepest</span
        >{/if}
    </p>
    <p class="note">
      <span class="n">{when(run.at)}</span>{#if diff !== null && median !== null && !isBest && !level}{' • '}{#if diff > 0}<span class="n">{usual(diff)}</span> deeper than{:else if diff < 0}<span class="n">{usual(-diff)}</span> short of{:else}right at{/if}
        your usual <span class="n">{usual(shownDepth(median))}</span>{/if}{#each found as [n, w] (w)}{' • '}<span class="n">{n}</span> {w}{/each}
    </p>
  </div>
  {#if story.lives.length}
    <ol class="lost" aria-label="Lives lost">
      {#each story.lives as l, i (i)}
        <li>
          {#if l.item}
            {@const it = l.item}
            <button class="thumb" onclick={() => onopen(it)} title="Depth {shownDepth(l.depth)}, {l.zone.name}: {it.name}{l.caveIn ? ' (a cave-in)' : ''}" aria-label="Life lost at depth {shownDepth(l.depth)} to {it.name}{l.caveIn ? ', a cave-in' : ''}">
              <img src={itemImage(it.id)} alt="" loading="lazy" />
            </button>
          {:else}
            <span class="thumb none" title="Depth {shownDepth(l.depth)}: not logged" role="img" aria-label="Life lost at depth {shownDepth(l.depth)}, item not logged">?</span>
          {/if}
          <span class="at n" aria-hidden="true">{shownDepth(l.depth)}</span>
        </li>
      {/each}
    </ol>
  {:else if run.left}
    <p class="note">No life lost</p>
  {/if}
</section>

<style>
  /* As the Collection's rows: a dark strip with a fine border. */
  .last {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.4rem 1.1rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(59, 48, 36, 0.6);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .depth {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 4.2rem;
  }
  .label {
    font-family: var(--font-display);
    font-size: 0.66rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .value {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.7rem;
    line-height: 1.05;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .text {
    min-width: 0;
  }
  .text p {
    margin: 0;
  }
  .lead {
    font-size: 1rem;
    line-height: 1.3;
  }
  .zname {
    color: var(--gold-hi);
  }
  .up {
    color: var(--gold);
    font-style: italic;
  }
  .note {
    font-size: 0.88rem;
    font-style: italic;
    line-height: 1.3;
    color: var(--muted);
  }
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 0.85em;
  }
  .lost {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .lost li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }
  .at {
    font-size: 0.7rem;
    line-height: 1;
    color: var(--muted);
  }
  /* A small art stage, as the Collection's. */
  .thumb {
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
  }
  button.thumb {
    cursor: pointer;
    transition: box-shadow 0.2s;
  }
  button.thumb:hover {
    box-shadow:
      inset 0 0 0 1px var(--gold-lo),
      0 0 10px rgba(201, 164, 92, 0.25);
  }
  .thumb img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
  }
  .thumb.none {
    font-family: var(--font-cinzel);
    color: var(--muted);
  }

  @media (max-width: 560px) {
    .last {
      grid-template-columns: auto minmax(0, 1fr);
      padding: 0.55rem 0.7rem;
      column-gap: 0.8rem;
    }
    .depth {
      grid-row: span 2;
      align-self: start;
      min-width: 3.6rem;
    }
  }
</style>
