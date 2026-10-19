<script lang="ts">
  // The pack's stacks, as the vendor and the loot show them: every stack in
  // its slot (its supply's mark and how many, up to STACK_MAX), the empty
  // slots dashed. With `onpick`, each stack is a button (the loot's swap: a
  // supply that didn't fit replaces the stack picked).
  import { PACK_STACKS, STACK_MAX, SUPPLY_NAMES, type Run } from './rules';
  import Glyph from './Glyph.svelte';
  import { SHORT } from './words';

  let { run, onpick }: { run: Run; onpick?: (slot: number) => void } = $props();
  const s = $derived(run.state);
</script>

<ul class="stacks" aria-label="The pack: {s.pack.length} of {PACK_STACKS} stacks, up to {STACK_MAX} each">
  {#each Array.from({ length: PACK_STACKS }, (_, i) => i) as i (i)}
    {@const st = s.pack[i]}
    <li>
      {#if st && onpick}
        <button class="stack" onclick={() => onpick(i)} aria-label="Replace {SUPPLY_NAMES[st.supply]} × {st.n}">
          <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span><span class="lbl">{SHORT[st.supply]}</span><span class="n">{st.n}</span>
        </button>
      {:else if st}
        <span class="stack" title="{SUPPLY_NAMES[st.supply]} × {st.n}">
          <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span><span class="lbl">{SHORT[st.supply]}</span><span class="n">{st.n}</span>
        </span>
      {:else}
        <span class="stack empty" aria-label="Empty"></span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .stacks {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 7px;
  }
  .stack {
    position: relative;
    width: 100%;
    height: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--gold);
    font: inherit;
  }
  button.stack {
    cursor: pointer;
  }
  button.stack:hover {
    border-color: #e0553f;
    color: #ff9c86;
  }
  .stack.empty {
    background: rgba(0, 0, 0, 0.3);
    border-style: dashed;
  }
  .ic {
    width: 20px;
    height: 20px;
  }
  .lbl {
    font-size: 12px;
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
  @media (min-width: 700px) {
    .stacks {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }
</style>
