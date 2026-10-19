<script lang="ts">
  // What the item's tooltip shows so far, in the game's tooltip font and
  // colours (ItemDetails.svelte): the requirements, the mod lines in tooltip
  // order, the flavour text; each part not shown yet as a quiet line that
  // says what's still hidden.
  import { CLUES, type Run } from './rules';
  import { verses } from './markup';
  import ClueText from './ClueText.svelte';
  import { plural } from './words';

  let { run }: { run: Run } = $props();
  const it = $derived(run.state.item!);
  const clues = $derived(CLUES[it.itemId]);
  const ritual = $derived(run.zoneType(it.zoneNo) === 'ritual');
  const hiddenMods = $derived(clues.mods.length - it.shown.mods);
</script>

<div class="tooltip-body">
  {#if clues.req.length}
    <div class="section">
      {#if it.shown.req}
        {#each clues.req as line, i (i)}<p class="line r"><ClueText text={line} /></p>{/each}
      {:else}
        <p class="line hidden">Requirements hidden</p>
      {/if}
    </div>
  {/if}
  {#if clues.mods.length}
    <div class="rule" aria-hidden="true"></div>
    <div class="section">
      {#each clues.mods.slice(0, it.shown.mods) as [kind, line], i (i)}
        <p class="line {kind}"><ClueText text={line} /></p>
      {/each}
      {#if hiddenMods}<p class="line hidden">{it.shown.mods ? `${plural(hiddenMods, 'more line')} hidden` : `${plural(hiddenMods, 'mod line')} hidden`}</p>{/if}
    </div>
  {/if}
  {#if clues.flavor !== null}
    <div class="rule" aria-hidden="true"></div>
    <div class="section">
      {#if it.shown.flavor}
        <p class="line f">
          {#each verses(clues.flavor) as v, k (k)}<span class="verse"><ClueText text={v} /></span>{/each}
        </p>
      {:else}
        <p class="line hidden">Flavour text hidden{ritual ? ': Lore reveals don\'t work in Ritual' : ''}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The game's tooltip (ItemDetails.svelte): centred Fontin small capitals,
     grey labels with white values, blue mods, orange flavour text. */
  .tooltip-body {
    padding: 0.7rem 1rem 0.9rem;
    text-align: center;
    font-family: var(--font-tooltip);
    font-weight: 400;
    font-variant-numeric: lining-nums;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }
  .line {
    margin: 0;
    font-size: 1rem;
    line-height: 1.3;
    white-space: pre-line;
    text-wrap: pretty;
    color: #8c8c8c;
  }
  .i,
  .e {
    color: #8888ff;
  }
  .d {
    font-family: var(--font-tooltip-italic);
    font-style: italic;
    color: #c4beb4;
  }
  .c {
    color: #d20000;
  }
  .f {
    font-style: italic;
    color: #af6025;
    white-space: normal;
  }
  .verse {
    display: block;
    text-wrap: pretty;
  }
  .t {
    color: #f2efe8;
    font-size: 1.15rem;
    margin-bottom: 0.15rem;
  }
  /* What's still hidden: quiet, in the page's own letters, not the tooltip's. */
  .hidden {
    font-family: var(--font-body, inherit);
    font-style: italic;
    font-size: 0.92rem;
    color: #5f5850;
  }
  .rule {
    height: 1px;
    margin: 0.5rem auto;
    width: 84%;
    background: linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.75) 22%, rgba(175, 96, 37, 0.75) 78%, transparent);
  }
  .tooltip-body > .rule:first-child {
    display: none;
  }
</style>
