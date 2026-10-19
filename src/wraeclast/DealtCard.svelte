<script lang="ts">
  // A vendor's ware as the v4 design draws it: a small engraved card, its
  // mark and name, what it does, and the price (the coin saying gold). Each
  // tap buys one. Too dear, the price goes red. The cards are dealt in one
  // after another as the vendor opens.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../lib/motion.svelte';
  import Glyph from './Glyph.svelte';
  import type { Supply } from './rules';

  let {
    mark,
    title,
    line,
    price,
    label,
    i,
    dear = false,
    disabled = false,
    onpick,
  }: {
    mark: Supply;
    title: string;
    line: string;
    price: number;
    /** What a screen reader says it does when picked. */
    label: string;
    /** Its place on the table, for the deal's order. */
    i: number;
    /** More than the gold there is: the price goes red. */
    dear?: boolean;
    disabled?: boolean;
    onpick?: () => void;
  } = $props();
</script>

<button
  class="ware"
  class:dear
  {disabled}
  aria-label={label}
  onclick={() => onpick?.()}
  in:fly|global={{ y: motion.still ? 0 : 14, duration: motion.still ? 0 : 320, delay: motion.still ? 0 : 60 + i * 45, easing: cubicOut }}
>
  <span class="hd"><span class="ic" aria-hidden="true"><Glyph of={mark} /></span><span class="nm">{title}</span></span>
  <span class="does">{line}</span>
  <span class="pr" aria-hidden="true">
    <b><span class="coin"><Glyph of="gold" /></span>{price}</b>
  </span>
</button>

<style>
  .ware {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 3px;
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: 6px 7px 5px;
    text-align: left;
    font: inherit;
    color: inherit;
    background: linear-gradient(180deg, rgba(40, 31, 22, 0.95), rgba(18, 14, 10, 0.95));
    border: 1px solid var(--line);
    border-radius: 5px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    cursor: pointer;
    transition:
      border-color 0.25s,
      background 0.25s;
  }
  .ware:hover:not(:disabled) {
    border-color: var(--gold-lo);
    background: linear-gradient(180deg, rgba(52, 40, 26, 0.95), rgba(22, 17, 12, 0.95));
  }
  .ware:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .ware:disabled {
    cursor: default;
  }
  .ware.dear {
    cursor: not-allowed;
  }
  .hd {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .ic {
    flex: none;
    width: 20px;
    height: 20px;
    color: var(--gold);
  }
  .nm {
    min-width: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
    line-height: 1.08;
    color: #f6e7c6;
  }
  .does {
    font-size: 12px;
    line-height: 1.1;
    color: #b5a993;
  }
  .pr {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 16px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .pr b {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: var(--gold-hi);
  }
  .coin {
    width: 12px;
    height: 12px;
    color: #d9a45a;
  }
  .dear .pr b {
    color: #f0a68c;
  }
  .dear .coin {
    color: #c97a62;
  }

  /* Wider screens: the bigger cards of the desktop board. */
  @media (min-width: 700px) {
    .ware {
      min-height: 138px;
      padding: 12px 12px 10px;
      gap: 6px;
    }
    .ic {
      width: 26px;
      height: 26px;
    }
    .nm {
      font-size: 15px;
    }
    .does {
      font-size: 15px;
      line-height: 1.2;
    }
    .pr {
      font-size: 14.5px;
    }
    .coin {
      width: 14px;
      height: 14px;
    }
  }
</style>
