<script lang="ts">
  // The pack's stacks, as the vendor and the loot show them: every stack in
  // its slot (its supply's mark and how many, up to STACK_MAX), the empty
  // slots dashed. With `onpick`, each stack is a button, outlined as a target
  // (the loot's swap, or a ware bought into a full pack: the supply that
  // didn't fit replaces the stack picked). For the vendor's: `row` keeps every
  // space in one row, `compact` makes them lower and unlabelled on phones,
  // `tall` taller on wider screens, and `lit` lights the space a ware just
  // went into.
  import { PACK_STACKS, SUPPLY_NAMES, type Run } from './rules';
  import Glyph from './Glyph.svelte';
  import { SHORT, does } from './words';

  let {
    run,
    onpick,
    row = false,
    compact = false,
    tall = false,
    lit = null,
  }: { run: Run; onpick?: (slot: number) => void; row?: boolean; compact?: boolean; tall?: boolean; lit?: number | null } = $props();
  const s = $derived(run.state);
</script>

<ul class="stacks" class:row class:compact class:tall aria-label="Your pack: {s.pack.length} of {PACK_STACKS} spaces used">
  {#each Array.from({ length: PACK_STACKS }, (_, i) => i) as i (i)}
    {@const st = s.pack[i]}
    <li>
      {#if st && onpick}
        <button class="stack target" onclick={() => onpick(i)} aria-label="Replace {st.n} {SUPPLY_NAMES[st.supply]} with the new supply">
          <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span><span class="lbl">{SHORT[st.supply]}</span><span class="n">{st.n}</span>
        </button>
      {:else if st}
        {@const said = `${SUPPLY_NAMES[st.supply]}: ${st.n} in your pack. ${does(run, st.supply)}`}
        <span class="stack" class:gets={lit === i} role="img" title={said} aria-label={said}>
          <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span><span class="lbl">{SHORT[st.supply]}</span><span class="n">{st.n}</span>
        </span>
      {:else}
        <span class="stack empty" role="img" aria-label="Empty space"></span>
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
  /* The space a ware just went into. */
  .stack.gets {
    border-color: #8fb57a;
    box-shadow:
      inset 0 0 0 1px rgba(169, 207, 143, 0.25),
      0 0 14px rgba(150, 190, 110, 0.3);
    color: #e4f2d4;
  }
  /* Picking a space to replace: every stack a dashed target, pulsing. */
  .stack.target {
    border-color: var(--gold);
    border-style: dashed;
    box-shadow:
      0 0 0 1px rgba(241, 217, 155, 0.18),
      0 0 12px rgba(241, 190, 90, 0.25);
    animation: target 1.4s ease-in-out infinite;
  }
  @keyframes target {
    50% {
      box-shadow:
        0 0 0 1px rgba(241, 217, 155, 0.32),
        0 0 16px rgba(241, 190, 90, 0.42);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stack.target {
      animation: none;
    }
  }
  :global(html[data-still]) .stack.target {
    animation: none;
  }
  .stacks.row {
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px 4px;
  }
  @media (max-width: 699px) {
    .compact .stack {
      height: 40px;
    }
    .compact .lbl {
      display: none;
    }
  }
  @media (min-width: 700px) {
    .stacks {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
    .tall .stack {
      height: 60px;
    }
    .tall .ic {
      width: 25px;
      height: 25px;
    }
    .tall .lbl {
      font-size: 13px;
    }
  }
</style>
