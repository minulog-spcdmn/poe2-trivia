<script lang="ts">
  // The pack on an item, as the design's row: all its spaces, each stack (up
  // to five of one supply; a supply may fill several) with its mark and short
  // name, the count on a badge, and the spaces still free dashed. On a phone
  // the row shows marks and counts only. A slot that would do nothing here is
  // set back, dimmed and struck, and says why when held or focused; a tap
  // uses one. The flask is the dock's.
  // `tray`: the pack in the dock's tray (a short phone), four spaces a row,
  // taller, with their names.
  import { PACK_STACKS, SUPPLY_NAMES, type Run, type Supply } from './rules';
  import Glyph from './Glyph.svelte';
  import { SHORT, does, why } from './words';

  let { run, onuse, tray = false }: { run: Run; onuse?: (supply: Supply) => void; tray?: boolean } = $props();
  const stacks = $derived(run.state.pack);
  const free = $derived(Math.max(0, PACK_STACKS - stacks.length));

  function use(sp: Supply, slot: number) {
    if (run.use(sp, slot)) onuse?.(sp);
  }
</script>

{#if stacks.length}
  <div class="pack" class:tray role="group" aria-label="Your pack: {stacks.length} of {PACK_STACKS} spaces used">
    {#each stacks as st, i (i)}
      {@const sp = st.supply}
      {@const off = why(run, sp)}
      <button class="slot" class:off={!!off} disabled={!!off} onclick={() => use(sp, i)} title={off ?? `${SUPPLY_NAMES[sp]}: ${does(run, sp)}`} aria-label="{SUPPLY_NAMES[sp]}: {st.n} in your pack. {off ?? does(run, sp)}">
        <span class="n" aria-hidden="true">{st.n}</span>
        <span class="ic" aria-hidden="true"><Glyph of={sp} /></span>
        <span class="lbl" aria-hidden="true">{SHORT[sp]}</span>
      </button>
    {/each}
    {#each Array.from({ length: free }, (_, k) => k) as k (k)}
      <span class="slot empty" role="img" aria-label="Empty space"></span>
    {/each}
  </div>
{:else}
  <p class="empty-pack">Your pack is empty.</p>
{/if}

<style>
  .pack {
    display: flex;
    gap: 4px;
    padding-top: 5px;
  }
  .slot {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    max-width: 92px;
    height: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.05);
    color: var(--gold);
    cursor: pointer;
  }
  .slot:hover:not(:disabled):not(.empty) {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .ic {
    width: 20px;
    height: 20px;
  }
  /* On a phone's row the marks and counts only; the names come back in the tray and on wide screens. */
  .lbl {
    display: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12.5px;
    line-height: 1;
    color: #e9c8a2;
  }
  .n {
    position: absolute;
    top: -6px;
    right: -4px;
    display: grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 10.5px;
    line-height: 1;
    color: var(--gold-hi);
    background: #0c0a08;
    border: 1px solid var(--gold-lo);
    border-radius: 8px;
  }
  /* Can't be used here: set back as a dimmed answer, struck through. */
  .slot.off {
    opacity: 0.35;
    filter: saturate(0.5);
    cursor: not-allowed;
  }
  .slot.off::after {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    top: 50%;
    height: 1px;
    rotate: -28deg;
    background: rgba(233, 200, 162, 0.6);
  }
  /* A space still free: dashed, empty. */
  .slot.empty {
    background: rgba(0, 0, 0, 0.25);
    border-style: dashed;
    border-color: #3b3024;
    box-shadow: none;
    cursor: default;
  }
  /* In the dock's tray: four a row, taller, named. */
  .pack.tray {
    flex-wrap: wrap;
    padding-top: 4px;
  }
  .tray .slot {
    flex: 0 0 calc((100% - 12px) / 4);
    max-width: none;
    height: 56px;
  }
  .tray .lbl {
    display: block;
    font-size: 11.5px;
  }
  @container item (min-width: 700px) {
    .pack {
      gap: 7px;
    }
    .slot {
      height: 52px;
    }
    .ic {
      width: 22px;
      height: 22px;
    }
    .lbl {
      display: block;
    }
  }
  .empty-pack {
    margin: 0;
    padding: 4px 0;
    text-align: center;
    font-style: italic;
    font-size: 14px;
    color: var(--muted);
  }
</style>
