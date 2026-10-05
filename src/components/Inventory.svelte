<script lang="ts">
  // Delve: what a player carries, beside their phial (Phial.svelte). Azurite
  // Wards stand as crystals at the phial's tip, where a lost life would pour
  // out, as it is a ward that breaks first (the last one, the top of the
  // stack), and a shard toward the next ward as half a crystal after them.
  // Upright (phones), they grow from the tip as a small cluster. Flares and
  // dynamite are small engravings with their count. A `moment` plays on them:
  // a crystal forming (mined or forged), shattering into two pieces, a find
  // landing, a flare burning.
  import type { Inventory } from '../lib/delve';
  import type { InventoryMoment } from '../lib/inventoryArt';
  import ItemGlyph from './ItemGlyph.svelte';

  let {
    inv,
    vertical = false,
    part = 'all',
    moment = null,
  }: {
    inv: Inventory;
    vertical?: boolean;
    /** Only the crystals, only the counted finds, or both. */
    part?: 'all' | 'crystals' | 'counts';
    moment?: InventoryMoment | null;
  } = $props();

  type Pip = { kind: 'ward' | 'shard' | 'ghost'; fresh: boolean };
  /** The crystals in order from the phial out: wards, a ward shattering, a shard. */
  const pips = $derived.by((): Pip[] => {
    const m = moment?.kind;
    const out: Pip[] = [];
    for (let k = 0; k < inv.wards; k++) out.push({ kind: 'ward', fresh: (m === 'ward' || m === 'forge') && k === inv.wards - 1 });
    if (m === 'shatter') for (let k = 0; k < (moment?.n ?? 1); k++) out.push({ kind: 'ghost', fresh: true });
    if (inv.shards) out.push({ kind: 'shard', fresh: m === 'shard' });
    return out;
  });
  /** Upright, the cluster's crystals lean out from the middle: the first stands straight, then left, then right. */
  const LEAN = [0, -30, 30];
  const crystals = $derived(part !== 'counts' && pips.length > 0);
  const counts = $derived(part !== 'crystals' && (inv.flares > 0 || inv.dynamite > 0 || moment?.kind === 'burn'));
</script>

{#if crystals || counts}
  <span class="inventory" class:vertical aria-hidden="true">
    {#if crystals}
      <span class="crystals">
        {#each pips as pip, i (pip.kind === 'ghost' ? `ghost${moment?.key}-${i}` : `${pip.kind}${i}`)}
          <span
            class="pip {pip.kind}"
            class:fresh={pip.fresh}
            class:forged={pip.fresh && moment?.kind === 'forge'}
            data-pip={pip.kind}
            style:--lean="{vertical ? (LEAN[i] ?? 0) : 0}deg"
          >
            {#if pip.kind === 'ghost'}
              <span class="piece l"><ItemGlyph kind="ward" piece="left" /></span>
              <span class="piece r"><ItemGlyph kind="ward" piece="right" /></span>
            {:else}
              {#key pip.fresh ? moment?.key : 0}
                <span class="grow"><ItemGlyph kind={pip.kind} /></span>
              {/key}
            {/if}
          </span>
        {/each}
      </span>
    {/if}
    {#if counts}
      <span class="counts">
        {#if inv.flares > 0 || moment?.kind === 'burn'}
          <span class="count flare" class:fresh={moment?.kind === 'flare'} class:burning={moment?.kind === 'burn'} data-pip="flare">
            {#key moment?.kind === 'flare' || moment?.kind === 'burn' ? moment.key : 0}
              <span class="grow"><ItemGlyph kind="flare" /></span>
            {/key}
            <b>{inv.flares}</b>
          </span>
        {/if}
        {#if inv.dynamite > 0}
          <span class="count dynamite" class:fresh={moment?.kind === 'dynamite'} data-pip="dynamite">
            {#key moment?.kind === 'dynamite' ? moment.key : 0}
              <span class="grow"><ItemGlyph kind="dynamite" /></span>
            {/key}
            <b>{inv.dynamite}</b>
          </span>
        {/if}
      </span>
    {/if}
  </span>
{/if}

<style>
  /* --inv-h: how tall a crystal stands (and the counted finds). */
  .inventory {
    --h: var(--inv-h, 12px);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    line-height: 1;
  }
  .crystals {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }
  .pip {
    position: relative;
    display: block;
  }
  /* A shard is the lower half of a crystal: it stands on the same foot. */
  .pip.shard {
    --h: calc(var(--inv-h, 12px) * 8.4 / 13.6);
    align-self: flex-end;
    opacity: 0.92;
  }
  .grow {
    display: block;
    transform-origin: 50% 100%;
  }

  /* Upright, on the tip of a phial standing beside an avatar: the crystals
     grow out of one point, leaning apart. */
  .inventory.vertical {
    --h: var(--inv-h, 10px);
    position: absolute;
    left: 50%;
    bottom: calc(100% - 1px);
    display: block;
    width: 0;
    height: 0;
  }
  .vertical .crystals {
    display: block;
  }
  .vertical .pip {
    position: absolute;
    bottom: 0;
    translate: -50% 0;
    transform-origin: 50% 100%;
    rotate: var(--lean);
  }
  .vertical .pip.shard {
    --h: calc(var(--inv-h, 10px) * 8.4 / 13.6);
  }

  .counts {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .count {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 1px;
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

  /* A crystal forms: it grows up out of the phial, overshoots and settles,
     lit from within for a moment (a glint from the effects layer with it). */
  .pip.fresh .grow,
  .count.fresh .grow {
    animation: form 0.75s cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
  }
  .pip.fresh::after,
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
    background: radial-gradient(closest-side, rgba(225, 240, 255, 0.95), rgba(110, 175, 255, 0.45) 45%, rgba(110, 175, 255, 0) 100%);
    animation: glow 0.9s ease-out 0.15s both;
  }
  /* Forged from two shards: slower, and brighter. */
  .pip.forged .grow {
    animation-duration: 1s;
  }
  .pip.forged::after {
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    animation-duration: 1.2s;
  }
  .count.fresh::after,
  .count.burning::after {
    background: radial-gradient(closest-side, rgba(255, 244, 220, 0.95), rgba(255, 150, 60, 0.5) 45%, rgba(255, 120, 40, 0) 100%);
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

  /* A ward shattering in place of a life: it splits along its crack and the
     two pieces fall apart and fade (the effects layer throws its splinters). */
  .pip.ghost {
    width: calc(var(--h) * 0.5);
    height: var(--h);
  }
  .piece {
    position: absolute;
    inset: 0;
    display: block;
    transform-origin: 50% 80%;
  }
  .piece.l {
    animation: fall-l 0.7s cubic-bezier(0.3, 0, 0.7, 1) both;
  }
  .piece.r {
    animation: fall-r 0.7s cubic-bezier(0.3, 0, 0.7, 1) both;
  }
  @keyframes fall-l {
    0%,
    12% {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0;
      transform: translate(-5px, 5px) rotate(-38deg);
    }
  }
  @keyframes fall-r {
    0%,
    12% {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0;
      transform: translate(5px, 6px) rotate(30deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .grow,
    .pip::after,
    .count::after {
      animation: none !important;
    }
    .pip.fresh::after,
    .count::after,
    .pip.ghost {
      display: none;
    }
  }
</style>
