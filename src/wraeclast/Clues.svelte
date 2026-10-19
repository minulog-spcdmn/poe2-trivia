<script lang="ts">
  // What is known of the item, set as its own tooltip lines (ItemDetails.svelte:
  // Fontin small capitals, blue mods, orange flavour text), each under a small
  // label that says what gave it: the zone's free clue, or a supply. No counts:
  // nothing says how many lines are still hidden. Under them, the names tried
  // and wrong. Once named, the whole tooltip.
  import { CLUES, SUPPLY_NAMES, baseText, nameOf, type DeckClue, type Run } from './rules';
  import { verses } from './markup';
  import ClueText from './ClueText.svelte';
  import { DECK_DREW, FREE_LABEL } from './words';

  let { run }: { run: Run } = $props();
  const it = $derived(run.state.item!);
  const named = $derived(run.state.phase === 'solved');
  const clues = $derived(CLUES[it.itemId]);
  const free = $derived(it.freeClue);
  const mods = $derived(named ? clues.mods.map((_, i) => i) : it.shown.mods);
  const flavor = $derived((named || it.shown.flavor) && clues.flavor !== null);
  const gem = $derived(clues.support !== null);
  const tried = $derived(it.log.submits.filter((sub) => !sub.right));
  /** Whether a Stacked Deck gave this clue (it never draws one already shown), and the mod lines it gave. */
  const dealt = (clue: DeckClue) => it.deck.some((d) => d.clue === clue);
  const dealtMods = $derived(new Set(it.deck.flatMap((d) => (d.mod === undefined ? [] : [d.mod]))));
  const fromDeck = (clue: DeckClue) => `${SUPPLY_NAMES.deck} • ${DECK_DREW[clue].toLowerCase()}`;
  const nothing = $derived(!named && !mods.length && !flavor && !it.shown.category && !it.shown.base && free !== 'burn' && free !== 'lengths' && !it.deck.length);
</script>

<div class="lines">
  {#if named}
    <p class="tline cat">{clues.category}</p>
  {:else if it.shown.category}
    <p class="tline cat"><span class="lbl-t">{dealt('category') ? SUPPLY_NAMES.deck : SUPPLY_NAMES.category}</span>{it.sibling ? `${nameOf(it.sibling)} • the same kind as this one` : clues.category}</p>
  {/if}
  {#if it.shown.base && !named}
    <p class="tline base"><span class="lbl-t">{free === 'base' ? `${FREE_LABEL} • ${gem ? 'its support text' : 'the base type'}` : dealt('base') ? fromDeck('base') : gem ? `${SUPPLY_NAMES.base} • support text` : SUPPLY_NAMES.base}</span><ClueText text={baseText(clues)} /></p>
  {/if}
  {#each mods as i, k (i)}
    {@const [kind, line] = clues.mods[i]}
    {#if k === 0 && (named || it.shown.category || it.shown.base)}<div class="rule" aria-hidden="true"></div>{/if}
    <p class="tline mod {kind}">
      {#if !named}<span class="lbl-t">{k === 0 && free === 'mod' ? `${FREE_LABEL} • a common mod line` : dealtMods.has(i) ? fromDeck('mod') : SUPPLY_NAMES.wisdom}</span>{/if}<ClueText text={line} />
    </p>
  {/each}
  {#if flavor}
    {#if mods.length || it.shown.category || it.shown.base}<div class="rule" aria-hidden="true"></div>{/if}
    <p class="tline flav">
      {#if !named}<span class="lbl-t">{free === 'flavor' ? `${FREE_LABEL} • flavor text` : dealt('flavor') ? fromDeck('flavor') : SUPPLY_NAMES.lore}</span>{/if}
      {#each verses(clues.flavor!) as v, k (k)}<span class="verse"><ClueText text={v} /></span>{/each}
    </p>
  {/if}
  {#if free === 'lengths' && !named}
    <p class="tline plain"><span class="lbl-t">{FREE_LABEL} • word lengths</span>On the line: a dot for each tile, grouped by word.</p>
  {/if}
  {#if dealt('lengths') && !named}
    <p class="tline plain"><span class="lbl-t">{fromDeck('lengths')}</span>On the line: a dot for each tile, grouped by word.</p>
  {/if}
  {#if dealt('burn') && !named}
    <p class="tline plain"><span class="lbl-t">{fromDeck('burn')}</span>A patch of the art burned in.</p>
  {/if}
  {#if free === 'burn' && !named}
    <p class="tline plain"><span class="lbl-t">{it.boss !== null ? 'Boss' : FREE_LABEL} • a burn-in</span>{it.boss !== null ? 'The boss' : 'The zone'} burned in a patch of the art.</p>
  {/if}
  {#if nothing}
    <p class="tline plain">Nothing is known of it yet.</p>
  {/if}
  {#if !named}
    {#each tried as sub, k (k)}
      <div class="tried"><span class="x" aria-hidden="true">✕</span><s>{sub.tiles.join('·')}</s><span class="cost">−{sub.lost}</span></div>
    {/each}
  {/if}
</div>

<style>
  .lines {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    min-width: 0;
    padding: 10px 12px 12px;
    text-align: center;
    font-family: var(--font-tooltip);
    font-variant-numeric: lining-nums;
  }
  .tline {
    margin: 0;
    font-size: 14px;
    line-height: 1.3;
    color: #8c8c8c;
    text-wrap: pretty;
  }
  /* Explicit mods blue; properties, requirements and a gem's text grey with white values. */
  .tline.mod.e {
    color: #8888ff;
  }
  /* Implicit and enchant lines, as the game sets them apart. */
  .tline.mod.i {
    color: #b6b6ff;
  }
  .tline.flav {
    font-family: var(--font-tooltip-italic);
    font-style: italic;
    color: #af6025;
  }
  .verse {
    display: block;
  }
  .tline.cat {
    color: #c8c8c8;
  }
  .tline.base {
    color: #e2dccf;
  }
  .tline.plain {
    font-family: var(--font-body);
    font-style: italic;
    color: var(--muted);
  }
  /* What each line is: the zone's free clue, or the supply that showed it. */
  .lbl-t {
    display: block;
    margin-bottom: 2px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8a7a62;
    font-style: normal;
  }
  .rule {
    flex: none;
    height: 1px;
    margin: 1px auto;
    width: 84%;
    background: linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.75) 22%, rgba(175, 96, 37, 0.75) 78%, transparent);
  }
  /* A name tried and wrong (an answer row, struck), and what it cost. */
  .tried {
    align-self: center;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px 4px 6px;
    border: 1px solid #8e4434;
    border-radius: 4px;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    line-height: 1.1;
    color: #eab3a3;
    white-space: nowrap;
  }
  .tried s {
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration-thickness: 1px;
    text-decoration-color: rgba(234, 179, 163, 0.7);
  }
  .tried .x {
    font-size: 12px;
    color: #f0a68c;
  }
  .tried .cost {
    font-family: var(--font-cinzel);
    font-size: 11.5px;
    color: #f0a68c;
  }
  @container item (min-width: 700px) {
    .tline {
      font-size: 16px;
    }
    .lbl-t {
      font-size: 10.5px;
    }
  }
</style>
