<script lang="ts">
  // The pack on an item, as the design's row: its stacks (8 at most, up to 5
  // each; a supply may fill several), each with its mark and short name, the
  // count on a badge.
  // A slot that would do nothing here is set back, dimmed and struck, and says
  // why when held or focused; a tap uses one. The flask is the dock's.
  import { SUPPLY_NAMES, type Run, type Supply } from './rules';
  import Glyph from './Glyph.svelte';
  import { SHORT, does, why } from './words';

  let { run, onuse }: { run: Run; onuse?: (supply: Supply) => void } = $props();
  const s = $derived(run.state);
  const stacks = $derived(s.pack);

  function use(sp: Supply, slot: number) {
    if (run.use(sp, slot)) onuse?.(sp);
  }
</script>

{#if stacks.length}
  <div class="pack" class:compact={stacks.length > 6} role="group" aria-label="Your pack">
    {#each stacks as st, i (i)}
      {@const sp = st.supply}
      {@const off = why(run, sp)}
      <button class="slot" class:off={!!off} disabled={!!off} onclick={() => use(sp, i)} title={off ?? `${SUPPLY_NAMES[sp]}: ${does(run, sp)}`} aria-label="{SUPPLY_NAMES[sp]}, a stack of {st.n}{off ? `: ${off}` : `. ${does(run, sp)}`}">
        <span class="n" aria-hidden="true">{st.n}</span>
        <span class="ic" aria-hidden="true"><Glyph of={sp} /></span>
        <span class="lbl" aria-hidden="true">{SHORT[sp]}</span>
      </button>
    {/each}
  </div>
{:else}
  <p class="empty">{s.item?.boss !== null && s.item ? 'Your pack is empty. Only Flares work here.' : 'Your pack is empty.'}</p>
{/if}

<style>
  .pack {
    display: flex;
    gap: 7px;
    padding-top: 5px;
  }
  .slot {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    max-width: 92px;
    height: 52px;
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
  .slot:hover:not(:disabled) {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .ic {
    width: 22px;
    height: 22px;
  }
  .lbl {
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
    right: -5px;
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11.5px;
    line-height: 1;
    color: var(--gold-hi);
    background: #0c0a08;
    border: 1px solid var(--gold-lo);
    border-radius: 9px;
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
  /* Seven or eight supplies on a phone: their marks and counts only. */
  .compact .slot {
    height: 42px;
  }
  .compact .lbl {
    display: none;
  }
  @container item (min-width: 700px) {
    .compact .slot {
      height: 52px;
    }
    .compact .lbl {
      display: block;
    }
  }
  .empty {
    margin: 0;
    padding: 4px 0;
    text-align: center;
    font-style: italic;
    font-size: 14px;
    color: var(--muted);
  }
</style>
