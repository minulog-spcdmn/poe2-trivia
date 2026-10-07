<script lang="ts" module>
  /** The item tooltip open now, on any player's pill: closes it at once (one shows at a time). */
  let closeOpenTip: (() => void) | null = null;
</script>

<script lang="ts">
  // Delve: the finds a player carries beside their phial (Phial.svelte), each
  // a small engraving with its count: flares and dynamite. (Azurite Wards and
  // their shards are on the phial itself, encasing its chambers.) A `moment`
  // plays on them: a find landing, a flare burning, a stick of dynamite going
  // off, one blown up by a Dynamite Cache missed (`blown`). A find on its way (`expect`: its sparks flying to it) has its place
  // kept, unseen, so they have somewhere to land.
  import type { Inventory } from '../lib/delve';
  import { ITEM_TIPS } from '../lib/difficultyText';
  import type { InventoryMoment } from '../lib/inventoryArt';
  import ItemGlyph from './ItemGlyph.svelte';

  let { inv, moment = null, expect = null }: { inv: Inventory; moment?: InventoryMoment | null; expect?: 'flare' | 'dynamite' | null } = $props();

  /** A flare or stick a blast just destroyed: it stays to crumble, its count already one down. */
  const blown = $derived(moment?.kind === 'blown' ? moment.item : null);
  /**
   * Its tooltip in the browser's top layer (a popover), over everything,
   * the effects layer's light included: under the count, its arrow on it,
   * kept on the screen; only for a mouse. It fades in and out, and stays
   * while the pointer is on the count or on the tooltip itself (the short
   * wait before it goes lets the pointer cross the gap). Where popovers
   * aren't supported it shows in place on hover (CSS).
   */
  const TIP_GAP = 9;
  const TIP_EDGE = 8;
  const TIP_LINGER_MS = 140;
  const TIP_FADE_MS = 160;
  function tipOnHover(count: HTMLElement) {
    const tip = count.querySelector<HTMLElement>('.tip');
    if (!tip || typeof tip.showPopover !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => tip.matches(':popover-open');
    const place = () => {
      const r = count.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      const w = tip.offsetWidth;
      const left = Math.max(TIP_EDGE, Math.min(mid - w / 2, innerWidth - w - TIP_EDGE));
      tip.style.left = `${left}px`;
      tip.style.top = `${r.bottom + TIP_GAP}px`;
      tip.style.setProperty('--arrow-x', `${mid - left}px`);
    };
    /** Gone at once, no fade: another item's tooltip takes its place. */
    const close = () => {
      clearTimeout(timer);
      tip.classList.remove('on');
      if (open()) tip.hidePopover();
      if (closeOpenTip === close) closeOpenTip = null;
    };
    const show = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      // Moving from one item to the next swaps the tooltip outright, so the
      // old one never fades out under the new one; only the first fades in.
      const swap = closeOpenTip !== null && closeOpenTip !== close;
      if (swap) closeOpenTip!();
      closeOpenTip = close;
      if (!open()) {
        tip.showPopover();
        place();
        if (swap) {
          tip.classList.add('instant', 'on');
          requestAnimationFrame(() => tip.classList.remove('instant'));
        } else {
          // A frame shown at 0 first, so the fade has somewhere to start from.
          requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add('on')));
        }
      } else tip.classList.add('on');
    };
    const hide = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        tip.classList.remove('on');
        timer = setTimeout(close, TIP_FADE_MS);
      }, TIP_LINGER_MS);
    };
    // The tooltip is the count's child in the DOM (if not on the screen), so
    // entering it enters the count again and keeps it up.
    count.addEventListener('pointerenter', show);
    count.addEventListener('pointerleave', hide);
    return {
      destroy() {
        count.removeEventListener('pointerenter', show);
        count.removeEventListener('pointerleave', hide);
        close();
      },
    };
  }
  const counts = $derived(inv.flares > 0 || inv.dynamite > 0 || moment?.kind === 'burn' || moment?.kind === 'blast' || blown === 'flares' || blown === 'dynamite' || !!expect);
</script>

{#if counts}
  <span class="inventory" aria-hidden="true">
    {#if inv.flares > 0 || moment?.kind === 'burn' || blown === 'flares' || expect === 'flare'}
      <span
        class="count flare"
        class:fresh={moment?.kind === 'flare'}
        class:burning={moment?.kind === 'burn'}
        class:blown={blown === 'flares'}
        class:left={inv.flares > 0}
        class:kept={expect === 'flare' && inv.flares === 0}
        data-pip="flare"
        use:tipOnHover
      >
        {#key moment?.kind === 'flare' || moment?.kind === 'burn' || blown === 'flares' ? moment?.key : 0}
          <span class="grow"><ItemGlyph kind="flare" /></span>
        {/key}
        <b>{inv.flares}</b>
        <span class="tip flare-tip" popover="manual"><strong>{ITEM_TIPS.flares.name}</strong>{ITEM_TIPS.flares.text}</span>
      </span>
    {/if}
    {#if inv.dynamite > 0 || moment?.kind === 'blast' || blown === 'dynamite' || expect === 'dynamite'}
      <!-- A stick going off: it shudders, flares and is gone, the count already one down. -->
      <span
        class="count dynamite"
        class:fresh={moment?.kind === 'dynamite'}
        class:lit={moment?.kind === 'blast'}
        class:blown={blown === 'dynamite'}
        class:left={inv.dynamite > 0}
        class:kept={expect === 'dynamite' && inv.dynamite === 0}
        data-pip="dynamite"
        use:tipOnHover
      >
        {#key moment?.kind === 'dynamite' || moment?.kind === 'blast' || blown === 'dynamite' ? moment?.key : 0}
          <span class="grow"><ItemGlyph kind="dynamite" /></span>
        {/key}
        <b>{inv.dynamite}</b>
        <span class="tip dynamite-tip" popover="manual"><strong>{ITEM_TIPS.dynamite.name}</strong>{ITEM_TIPS.dynamite.text}</span>
      </span>
    {/if}
  </span>
{/if}

<style>
  /* --inv-h: how tall the counted finds stand. */
  .inventory {
    --h: var(--inv-h, 12px);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    line-height: 1;
  }
  .grow {
    display: block;
    transform-origin: 50% 100%;
  }

  .count {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }
  /* How it works, under it on hover (a pointer's; the counts are hidden
     from screen readers, whose players read the rules in the lobby). */
  .tip {
    position: absolute;
    z-index: 5;
    top: calc(100% + 9px);
    left: 50%;
    translate: -50% 0;
    width: max-content;
    max-width: 16rem;
    padding: 0.45em 0.7em 0.5em;
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.3;
    text-align: left;
    white-space: normal;
    color: var(--text);
    background: #100c09;
    border: 1px solid color-mix(in srgb, var(--tip) 55%, transparent);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    opacity: 0;
    transform: translateY(-3px);
    transition:
      opacity 0.15s,
      transform 0.15s var(--ease-out);
    pointer-events: none;
  }
  /* Its name first, in its colour, as the finds are named on the rules page. */
  .tip strong {
    display: block;
    margin-bottom: 0.2em;
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--tip);
  }
  .flare-tip {
    --tip: #f7a3b3;
  }
  .dynamite-tip {
    --tip: #eebf96;
  }
  .count:hover {
    z-index: 5;
  }
  .count:hover .tip {
    opacity: 1;
    transform: none;
  }
  /* In the top layer: fixed under the count (tipOnHover sets left, top and
     the arrow's place), faded in once it is open and out before it closes. */
  .tip:popover-open {
    position: fixed;
    inset: auto;
    margin: 0;
    overflow: visible;
    translate: none;
    opacity: 0;
    transform: translateY(-4px);
    transition:
      opacity 0.16s ease,
      transform 0.16s var(--ease-out);
    pointer-events: auto;
  }
  .tip:popover-open:global(.instant) {
    transition: none;
  }
  .tip:popover-open:global(.on) {
    opacity: 1;
    transform: none;
  }
  /* Its arrow, pointing up at the item. */
  .tip::before {
    content: '';
    position: absolute;
    top: -6px;
    left: var(--arrow-x, 50%);
    width: 10px;
    height: 10px;
    background: #100c09;
    border-left: 1px solid color-mix(in srgb, var(--tip) 55%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--tip) 55%, transparent);
    transform: translateX(-50%) rotate(45deg);
  }
  /* Kept for a find on its way. */
  .count.kept {
    visibility: hidden;
  }
  .count b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.66rem;
    line-height: 1;
    color: var(--gold-hi);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }
  .count.flare b {
    color: #f6cf98;
  }
  .count.dynamite b {
    color: #f0b8a4;
  }

  /* A find lands: it grows up, overshoots and settles, lit from within for a
     moment (a glint from the effects layer with it). */
  .count.fresh .grow {
    animation: form 0.75s cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
  }
  .count.fresh::after,
  .count.burning::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -11px;
    border-radius: 50%;
    pointer-events: none;
    background: radial-gradient(closest-side, rgba(255, 244, 220, 0.95), rgba(255, 150, 60, 0.5) 45%, rgba(255, 120, 40, 0) 100%);
    animation: glow 0.9s ease-out 0.15s both;
  }
  /* A flare burns: its glyph flares up and its light fades. */
  .count.burning::after {
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    animation: glow 1.1s ease-out both;
  }
  .count.burning .grow {
    animation: burn 1s ease-out both;
  }
  /* A stick of dynamite goes off: it shudders as the fuse burns down, swells
     in a white-hot flash and is gone; the flash lingers as a red glow. */
  .count.lit::after {
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    background: radial-gradient(closest-side, rgba(255, 246, 228, 1), rgba(255, 120, 50, 0.6) 40%, rgba(200, 40, 20, 0) 100%);
    animation: glow 1s ease-out 0.45s both;
  }
  .count.lit .grow {
    animation: lit 1.1s ease-in both;
  }
  .count.lit b {
    animation: count-in 0.4s ease-out 0.7s both;
  }
  /* A blast takes it (a Dynamite Cache missed): caught in a flash of fire, it
     cracks, tips over and crumbles away as it falls; the count is one down
     already. The effects layer throws the sparks, chips and smoke (itemBlown). */
  .count.blown::after {
    width: 26px;
    height: 26px;
    margin: -13px 0 0 -13px;
    background: radial-gradient(closest-side, rgba(255, 246, 228, 1), rgba(255, 120, 50, 0.6) 40%, rgba(200, 40, 20, 0) 100%);
    animation: glow 0.8s ease-out both;
  }
  .count.blown .grow {
    animation: crumble 0.85s cubic-bezier(0.3, 0.2, 0.6, 1) both;
  }
  /* With more of it left, the one blown away crumbles and the next stands in its place. */
  .count.blown.left .grow {
    animation:
      crumble 0.85s cubic-bezier(0.3, 0.2, 0.6, 1) backwards,
      form 0.42s cubic-bezier(0.2, 0.9, 0.3, 1.25) 0.85s;
  }
  .count.blown b {
    animation: count-in 0.4s ease-out 0.5s both;
  }
  @keyframes crumble {
    0% {
      opacity: 1;
      transform: none;
      filter: none;
    }
    16% {
      opacity: 1;
      transform: scale(1.3);
      filter: brightness(2.4) sepia(0.6);
    }
    32% {
      transform: rotate(-14deg) scale(1.05);
      filter: brightness(1.2) sepia(0.5);
    }
    to {
      opacity: 0;
      transform: translateY(5px) rotate(24deg) scale(0.45, 0.3);
      filter: brightness(0.4) sepia(0.8);
    }
  }
  @keyframes form {
    from {
      opacity: 0;
      transform: scale(0.15, 0.05);
    }
    40% {
      opacity: 1;
    }
  }
  @keyframes glow {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    25% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.2);
    }
  }
  @keyframes burn {
    15% {
      transform: scale(1.35);
    }
  }
  @keyframes lit {
    0%,
    36% {
      transform: none;
    }
    6%,
    18%,
    30% {
      transform: translateX(-0.6px) rotate(-6deg);
    }
    12%,
    24% {
      transform: translateX(0.6px) rotate(6deg);
    }
    48% {
      opacity: 1;
      transform: scale(1.45);
      filter: brightness(2.2);
    }
    to {
      opacity: 0.2;
      transform: scale(0.6);
      filter: brightness(0.6);
    }
  }
  @keyframes count-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .grow,
    .count::after {
      animation: none !important;
    }
    .count::after {
      display: none;
    }
    .count.lit .grow,
    .count.lit b,
    .count.blown .grow,
    .count.blown b {
      animation: none !important;
    }
  }
</style>
