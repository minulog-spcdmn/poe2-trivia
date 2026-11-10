<script lang="ts">
  // Delve: the finds a player carries beside their phial (Phial.svelte), each
  // a small engraving with its count: flares and dynamite. (Azurite Wards are
  // on the phial itself, encasing its chambers.) A `moment`
  // plays on them: a find landing, a flare burning, a stick of dynamite going
  // off, one blown up by a Dynamite Cache missed (`blown`). A find on its way (`expect`: its sparks flying to it) has its place
  // kept, unseen, so they have somewhere to land.
  import { untrack } from 'svelte';
  import type { Inventory } from '../lib/delve';
  import { ITEM_TIPS } from '../lib/difficultyText';
  import type { InventoryMoment } from '../lib/inventoryArt';
  import HoverTip, { tipOnHover } from './HoverTip.svelte';
  import ItemGlyph from './ItemGlyph.svelte';

  let { inv, moment = null, expect = null }: { inv: Inventory; moment?: InventoryMoment | null; expect?: 'flare' | 'dynamite' | null } = $props();

  /** A flare or stick a blast just destroyed: it stays to crumble, its count already one down. */
  const blown = $derived(moment?.kind === 'blown' ? moment.item : null);
  let flareEl = $state<HTMLElement>();
  let dynamiteEl = $state<HTMLElement>();
  // Its width as it starts to go, for the close to run from: read as the
  // count goes down, before its 0 is drawn (wider than a 1, it would nudge
  // the other count over), unrounded (offsetWidth would too).
  const keepWidth = (el: HTMLElement | undefined) => el?.style.setProperty('--w', getComputedStyle(el).width);
  /**
   * The last one just used: held a moment, as its moment comes a frame or
   * two after the count goes down (Scoreboard's playMoment), which would
   * otherwise take it away and bring it back meanwhile, the other count
   * jumping over and back.
   */
  const HOLD_MS = 250;
  let flareHeld = $state(false);
  let dynamiteHeld = $state(false);
  let hadFlares = untrack(() => inv.flares);
  let hadDynamite = untrack(() => inv.dynamite);
  $effect.pre(() => {
    const { flares, dynamite } = inv;
    if (hadFlares > 0 && flares === 0) {
      keepWidth(flareEl);
      flareHeld = true;
      setTimeout(() => (flareHeld = false), HOLD_MS);
    }
    if (hadDynamite > 0 && dynamite === 0) {
      keepWidth(dynamiteEl);
      dynamiteHeld = true;
      setTimeout(() => (dynamiteHeld = false), HOLD_MS);
    }
    hadFlares = flares;
    hadDynamite = dynamite;
  });
  /**
   * The last of a find going (its flare burnt, its stick gone off, or blown
   * up): its count lands on 0 at once, read for a moment, then it fades away
   * and beside the other count its place closes up (CSS: .last), so the other
   * slides over by the time the moment is over and it's gone.
   */
  const flareLast = $derived(inv.flares === 0 && (flareHeld || moment?.kind === 'burn' || blown === 'flares'));
  const dynamiteLast = $derived(inv.dynamite === 0 && (dynamiteHeld || moment?.kind === 'blast' || blown === 'dynamite'));
  const counts = $derived(inv.flares > 0 || flareHeld || dynamiteHeld || inv.dynamite > 0 || moment?.kind === 'burn' || moment?.kind === 'blast' || blown === 'flares' || blown === 'dynamite' || !!expect);
</script>

{#if counts}
  <span class="inventory" aria-hidden="true">
    {#if inv.flares > 0 || flareHeld || moment?.kind === 'burn' || blown === 'flares' || expect === 'flare'}
      <span
        class="count flare"
        class:fresh={moment?.kind === 'flare'}
        class:burning={moment?.kind === 'burn'}
        class:blown={blown === 'flares'}
        class:left={inv.flares > 0}
        class:last={flareLast}
        class:kept={expect === 'flare' && inv.flares === 0}
        data-pip="flare"
        bind:this={flareEl}
        use:tipOnHover
      >
        {#key moment?.kind === 'flare' || moment?.kind === 'burn' || blown === 'flares' ? moment?.key : 0}
          <span class="grow"><ItemGlyph kind="flare" /></span>
        {/key}
        <b>{inv.flares}</b>
        <HoverTip tone="#f7a3b3"><strong>{ITEM_TIPS.flares.name}</strong>{ITEM_TIPS.flares.text}</HoverTip>
      </span>
    {/if}
    {#if inv.dynamite > 0 || dynamiteHeld || moment?.kind === 'blast' || blown === 'dynamite' || expect === 'dynamite'}
      <!-- A stick going off: it shudders, flares and is gone, the count already one down. -->
      <span
        class="count dynamite"
        class:fresh={moment?.kind === 'dynamite'}
        class:lit={moment?.kind === 'blast'}
        class:blown={blown === 'dynamite'}
        class:left={inv.dynamite > 0}
        class:last={dynamiteLast}
        class:kept={expect === 'dynamite' && inv.dynamite === 0}
        data-pip="dynamite"
        bind:this={dynamiteEl}
        use:tipOnHover
      >
        {#key moment?.kind === 'dynamite' || moment?.kind === 'blast' || blown === 'dynamite' ? moment?.key : 0}
          <span class="grow"><ItemGlyph kind="dynamite" /></span>
        {/key}
        <b>{inv.dynamite}</b>
        <HoverTip tone="#eebf96"><strong>{ITEM_TIPS.dynamite.name}</strong>{ITEM_TIPS.dynamite.text}</HoverTip>
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
  /* Its rule under it on hover (HoverTip.svelte), over the counts beside it where it shows in place. */
  .count:hover {
    z-index: 5;
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
  /* A find's count, once it has grown. */
  .count.fresh b {
    animation: count-in 0.4s ease-out 0.4s both;
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
  /* The last of it going: its count shows 0 from the first, then the glyph
     (once it has burnt, gone off or crumbled) and its 0 fade, and its place
     closes up beside the other count by the moment's end, its width held
     meanwhile (the glyph and a wider 0 overflow it, centred, never cut). */
  .count.last {
    justify-content: center;
    --close: 0.55s ease-in-out 0.7s;
  }
  .count.lit.last {
    --close: 0.45s ease-in-out 0.8s;
  }
  /* (The last stick's flash ends faint, as the next stands in its place; with none, it goes with its 0.) */
  .count.lit.last .grow > :global(*) {
    /* (Done by 1.05s of its own clock, which starts with the stick lit, a little after its count's.) */
    animation: count-out 0.4s ease-in-out 0.65s both;
  }
  .count.burning.last .grow {
    animation: burn-out 1.25s ease-out both;
  }
  .count.last b {
    animation: count-out var(--close) both;
  }
  .count.last:not(:only-child) {
    animation: close var(--close) both;
  }
  .count.last:not(:last-child) {
    --mr: -5px;
  }
  /* The one on the end: kept where it stands as it goes (nothing after it to slide over). */
  .count.last:last-child {
    justify-content: flex-start;
  }
  @keyframes close {
    from {
      width: var(--w);
    }
    to {
      width: 0;
      margin-right: var(--mr, 0px);
    }
  }
  @keyframes count-out {
    to {
      opacity: 0;
    }
  }
  /* (The flare's own burn, then gone with its 0.) */
  @keyframes burn-out {
    12% {
      opacity: 1;
      transform: scale(1.35);
    }
    56% {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0;
      transform: scale(0.55);
    }
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
    .count.fresh b,
    .count.last,
    .count.last b,
    .count.lit.last .grow > :global(*),
    .count.lit .grow,
    .count.lit b,
    .count.blown .grow,
    .count.blown b {
      animation: none !important;
    }
  }
</style>
