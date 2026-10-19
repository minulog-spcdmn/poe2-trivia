<script lang="ts">
  // The pack, as the vendor shows it: a slot for each of the four supplies,
  // its mark, short name and how many (no stacks, no cap); a supply with none
  // is dimmed. `lit` lights the supply just bought.
  import { SUPPLIES, SUPPLY_NAMES, type Run, type Supply } from './rules';
  import Glyph from './Glyph.svelte';
  import { SHORT, does } from './words';

  let { run, lit = null }: { run: Run; lit?: Supply | null } = $props();
  const s = $derived(run.state);
</script>

<ul class="stacks" aria-label="Your pack">
  {#each SUPPLIES as sp (sp)}
    {@const n = s.pack[sp]}
    {@const said = `${SUPPLY_NAMES[sp]}: ${n} in your pack. ${does(run, sp)}`}
    <li>
      <span class="stack" class:none={!n} class:gets={lit === sp && n > 0} role="img" title={said} aria-label={said}>
        <span class="ic" aria-hidden="true"><Glyph of={sp} /></span><span class="lbl">{SHORT[sp]}</span><span class="n">{n}</span>
      </span>
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
  .stack.none {
    background: rgba(0, 0, 0, 0.3);
    border-style: dashed;
    color: #6f6555;
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
  @media (min-width: 700px) {
    .stack {
      height: 60px;
    }
    .ic {
      width: 25px;
      height: 25px;
    }
    .lbl {
      font-size: 13px;
    }
  }
</style>
