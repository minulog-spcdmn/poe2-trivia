<script lang="ts">
  import { FINDS_IN_ORDER, type FindKind } from '../lib/delve';
  import { FINDS_LABEL, FINDS_UNSAFE, FIND_RULES, FIND_TEXT } from '../lib/difficultyText';
  import DelveLadder from './DelveLadder.svelte';
  import ItemGlyph from './ItemGlyph.svelte';

  // Delve's rules block: the descent (DelveLadder) and the finds, one
  // diagram. Side by side once the card is wide enough, the plate is a
  // column as tall as the finds beside it, and a fine line runs from the
  // wall where each find you have met first turns up to its heading. On a
  // phone or a tablet the finds' text would be squeezed beside it, so the
  // plate takes the card's whole width at a height of its own, with each
  // find's item and name on its right (tied to the pit the same way), and
  // the finds' rules follow under it. The lobby passes this browser's
  // records (the deepest, the last run, the finds met); the descent page
  // (descent.html) drives them directly.
  let {
    deepest = null,
    last = null,
    label = 'Your deepest',
    met = [],
  }: { deepest?: number | null; last?: number | null; label?: string; met?: FindKind[] } = $props();

  // The finds that turn up, in the order they first do.
  const FIND_KINDS = FINDS_IN_ORDER.map((f) => f.kind);
  /** Each find's item, as the game draws it. */
  const FIND_GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;

  let caption: HTMLElement | null = $state(null);
  let finds: HTMLElement | null = $state(null);
  /** Stacked (the finds under the plate), and the height the plate asks for then. */
  let stacked = $state(true);
  let natural = $state(0);
</script>

<!-- Two columns once the card is wide enough: the descent beside the finds. -->
<div class="setting delve-rules">
  <div class="delve-cols">
    <div class="descent-col" style:min-height={stacked && natural ? `${natural}px` : null}>
      <span class="label" bind:this={caption}>The descent</span>
      {#if caption && finds}
        <DelveLadder {deepest} {last} {label} {met} {caption} {finds} bind:stacked bind:natural />
      {/if}
    </div>
    <div class="finds-col" bind:this={finds}>
      <span class="label">{FINDS_LABEL}</span>
      <!-- Each find in its own colour, with its item as the game draws it, in a line: what it gives, then what it risks. -->
      <dl class="finds">
        {#each FIND_KINDS as kind (kind)}
          {@const r = FIND_RULES[kind]}
          <div data-find={kind}>
            <dt><span class="find-glyph"><ItemGlyph kind={FIND_GLYPH[kind]} /></span>{FIND_TEXT[kind].name}</dt>
            <dd>{r.gives} <span class="miss">{r.miss}</span></dd>
          </div>
        {/each}
      </dl>
      <p class="finds-unsafe">{FINDS_UNSAFE}</p>
    </div>
  </div>
</div>

<style>
  .setting {
    margin-bottom: 1.2rem;
  }
  /* Side by side from a 400 px card: the descent a column as tall as the finds beside it (the plate fills it, its caption included,
     and its lines run across the gap to the headings). Stacked on phones and tablets: the descent the card's whole width, at the
     height it asks for, the finds' rules under it. */
  .delve-rules {
    container-type: inline-size;
  }
  .delve-cols {
    display: grid;
    gap: 0.9rem 1.25rem;
  }
  .descent-col {
    position: relative;
    min-height: 12rem;
  }
  .descent-col .label {
    width: fit-content;
  }
  @container (min-width: 400px) {
    .delve-cols {
      grid-template-columns: 11rem minmax(0, 1fr);
    }
    .descent-col {
      min-height: 15rem;
    }
  }
  /* A wider card gives the descent a little more width, so the pit can widen. */
  @container (min-width: 440px) {
    .delve-cols {
      grid-template-columns: 12.25rem minmax(0, 1fr);
    }
  }
  .finds {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }
  /* Each find in its colour (as its note under the cards), with its item beside its name. */
  .finds [data-find='azurite'] {
    --find: #a9cdf5;
  }
  .finds [data-find='flare'] {
    --find: #f7a3b3;
  }
  .finds [data-find='dynamite'] {
    --find: #eebf96;
  }
  .finds dt {
    display: flex;
    align-items: center;
    gap: 0.45em;
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--find);
  }
  .find-glyph {
    --h: 13px;
    display: inline-flex;
    justify-content: center;
    width: 14px;
  }
  .finds dd {
    margin: 0.1rem 0 0;
    font-size: 0.93rem;
    line-height: 1.1;
    color: var(--muted);
  }
  .finds .miss {
    color: color-mix(in srgb, var(--find) 45%, var(--muted));
  }
  /* Under the finds: why flares and dynamite never work on one. */
  .finds-unsafe {
    margin: 0.55rem 0 0;
    font-size: 0.93rem;
    font-style: italic;
    line-height: 1.1;
    color: var(--muted);
  }
</style>
