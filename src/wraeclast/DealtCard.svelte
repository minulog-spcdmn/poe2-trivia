<script lang="ts">
  // One card as the game deals them (ChooseCategory.svelte's look and deal,
  // by way of v1's category card): the engraved plate, a mark, its name and
  // what it does, slid in face down and turned up, a plaque on top (a ware's
  // price, a loot card's gold). An unidentified loot card stays face down
  // until it's taken (`down`), then turns up. Used for the vendor's wares and
  // the loot deal.
  import { cubicInOut, cubicOut } from 'svelte/easing';
  import CardEngraving from '../components/CardEngraving.svelte';
  import { motion } from '../lib/motion.svelte';
  import Glyph from './Glyph.svelte';
  import type { LootKind, Supply } from './rules';

  let {
    mark,
    title,
    line = '',
    tag = '',
    label,
    i,
    n,
    down = false,
    unid = false,
    rare = false,
    chosen = false,
    faded = false,
    disabled = false,
    onpick,
  }: {
    mark: Supply | LootKind | 'unid' | 'corrupt';
    title: string;
    line?: string;
    tag?: string;
    /** What a screen reader says it does when picked. */
    label: string;
    i: number;
    n: number;
    /** Face down (an unidentified card not taken yet). */
    down?: boolean;
    /** Dealt face down: its back stays, for it to turn up from. */
    unid?: boolean;
    /** A rarer card: a warmer plaque. */
    rare?: boolean;
    chosen?: boolean;
    faded?: boolean;
    disabled?: boolean;
    onpick?: () => void;
  } = $props();

  // The deal, as the game's (ChooseCategory.svelte's TURN and timings): in
  // face down one after another, then turned up (a face-down card stays down).
  const TURN = { seconds: 0.46, lift: 16, swell: 0.05, perspective: 1200, across: '(max-width: 700px)' };
  const DEAL = 0.42;
  const FLIP = TURN.seconds;
  const dealAt = (k: number) => 0.15 + k * 0.07;
  const flipAt = (k: number) => 0.62 + k * 0.12;
  const narrow = matchMedia(TURN.across);
  const axis = narrow.matches ? 'X' : 'Y';

  function appear(_node: Element, { i }: { i: number }) {
    if (motion.still) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return { delay: Math.round(dealAt(i) * 1000), duration: DEAL * 400, css: (t: number) => `opacity:${t}` };
  }
  function deal(node: Element, { i, n, stay }: { i: number; n: number; stay: boolean }) {
    if (motion.still) return {};
    node.classList.add('dealt');
    const cardEl = node.parentElement;
    if (!stay) {
      cardEl?.classList.add('turning');
      setTimeout(() => cardEl?.classList.remove('turning'), (flipAt(i) + FLIP / 2) * 1000);
    }
    const start = dealAt(i);
    const turn = flipAt(i) - start;
    const total = stay ? DEAL : turn + FLIP;
    const rot = (i - (n - 1) / 2) * 7;
    return {
      delay: Math.round(start * 1000),
      duration: Math.round(total * 1000),
      css: (t: number) => {
        const u = t * total;
        const d = cubicOut(Math.min(1, u / DEAL));
        const f = stay ? 0 : cubicInOut(Math.min(1, Math.max(0, (u - turn) / FLIP)));
        const lift = Math.sin(Math.PI * f);
        const y = (1 - d) * 90 - lift * TURN.lift;
        return `transform:perspective(${TURN.perspective}px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotate${axis}(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + TURN.swell * lift).toFixed(4)})`;
      },
    };
  }
</script>

<button
  class="card"
  class:mine={!disabled}
  class:chosen
  class:faded
  class:down
  class:unid
  class:rare
  data-axis={axis}
  {disabled}
  aria-label={label}
  onclick={() => onpick?.()}
  style:--face="{Math.round((flipAt(i) + FLIP / 2) * 1000)}ms"
  in:appear|global={{ i }}
>
  <span class="turn" in:deal|global={{ i, n, stay: down }}>
    <span class="back" aria-hidden="true">
      <CardEngraving side="back" />
      <span class="filigree"></span>
      <span class="mark back-mark"><Glyph of="unid" /></span>
      <span class="title">Unidentified</span>
    </span>
    <span class="frame" aria-hidden="true">
      <CardEngraving side="face" />
      <span class="sheen"></span>
      <span class="filigree"></span>
      {#if tag}<span class="tag">{tag}</span>{/if}
      <span class="mark"><Glyph of={mark} /></span>
      <span class="words">
        <span class="title">{title}</span>
        {#if line}<span class="line">{line}</span>{/if}
      </span>
    </span>
  </span>
</button>

<style>
  .card {
    --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .86 0 0 0 0 .62 .08 0 0 0 -.025'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")
      0 0 / 180px;
    --t: var(--gold-lo);
    --t-hi: var(--gold-hi);
    --t-glow: transparent;
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: inherit;
    cursor: default;
  }
  .card.rare {
    --t: #d08a3c;
    --t-hi: #ffe0a8;
    --t-glow: rgba(224, 138, 68, 0.32);
  }
  .turn {
    position: relative;
    display: block;
    transform-style: preserve-3d;
    transition: transform 0.46s cubic-bezier(0.45, 0, 0.55, 1);
  }
  /* Face down until taken; taken, it turns up. */
  .card.down .turn {
    transform: perspective(1200px) rotateY(180deg);
  }
  .card.down[data-axis='X'] .turn {
    transform: perspective(1200px) rotateX(180deg);
  }
  .frame,
  .back {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }
  .back {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    border-radius: 8px;
    overflow: clip;
    border: 1px solid var(--gold-lo);
    background:
      var(--grain),
      radial-gradient(circle at 50% 45%, rgba(175, 96, 37, 0.22), transparent 90px),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px rgba(125, 99, 51, 0.35);
    transform: rotateY(180deg);
  }
  .card[data-axis='X'] .back {
    transform: rotateX(180deg);
  }
  .frame > :global(.engraving),
  .back > :global(.engraving) {
    opacity: 0.6;
    transition: opacity 0.4s;
  }
  .frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    height: 250px;
    padding: 46px 16px 18px;
    overflow: clip;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      var(--grain),
      radial-gradient(circle at 50% 38%, rgba(175, 96, 37, 0.16), transparent 80px),
      radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px rgba(125, 99, 51, 0.35),
      0 10px 22px rgba(0, 0, 0, 0.55);
    transition:
      transform 0.35s var(--ease-out),
      border-color 0.35s,
      opacity 0.4s,
      filter 0.4s;
  }
  .filigree {
    position: absolute;
    inset: 5px;
    background: var(--filigree);
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(224, 138, 68, 0.35));
    pointer-events: none;
  }
  /* The price or the gold, on a plaque over the keystone (the game's find plaque). */
  .tag {
    position: absolute;
    top: 8px;
    left: -50%;
    right: -50%;
    width: fit-content;
    margin-inline: auto;
    padding: 3px 12px 4px;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    white-space: nowrap;
    color: var(--t-hi);
    background: linear-gradient(#1a140e, #0a0806);
    border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent);
    box-shadow:
      inset 0 0 0 2px #0a0806,
      inset 0 0 0 2.5px color-mix(in srgb, var(--t) 70%, transparent),
      0 0 12px var(--t-glow);
  }
  .mark {
    position: relative;
    flex: none;
    width: 64px;
    height: 64px;
    color: #e9c58a;
    filter: drop-shadow(0 0 10px rgba(224, 138, 68, 0.45));
  }
  .back-mark {
    width: 54px;
    height: 54px;
    color: rgba(201, 164, 92, 0.75);
  }
  .words {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    text-align: center;
  }
  .title {
    position: relative;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.02rem;
    letter-spacing: 0.04em;
    color: var(--gold-hi);
    line-height: 1.2;
    transition:
      color 0.3s,
      text-shadow 0.3s;
  }
  .line {
    font-size: 0.9rem;
    line-height: 1.3;
    color: var(--muted);
  }
  .turn:global(.dealt) .mark {
    animation: kindle 0.9s ease-out var(--face, 0ms) backwards;
  }
  @keyframes kindle {
    from {
      opacity: 0.2;
      filter: brightness(0.4);
    }
    40% {
      opacity: 1;
      filter: brightness(1.45);
    }
  }
  .sheen {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
  }
  .card:global(.turning) .frame,
  .card:not(:global(.turning)):not(.unid) .back {
    visibility: hidden;
  }
  .card.mine {
    cursor: pointer;
  }
  .card.mine:not(:global(.turning)):hover .frame,
  .card.mine:not(:global(.turning)):focus-visible .frame {
    transform: translateY(-8px) scale(1.03);
    border-color: var(--gold);
  }
  .card.mine.down:hover .back,
  .card.mine.down:focus-visible .back {
    border-color: var(--gold);
  }
  .card.mine:not(:global(.turning)):hover .title {
    color: #fff1cf;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.6);
  }
  .card:focus-visible {
    outline: none;
  }
  .card:focus-visible .frame,
  .card:focus-visible .back {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .card.chosen .frame {
    transform: translateY(-4px) scale(1.04);
    border-color: var(--gold);
  }
  .card.faded .frame,
  .card.faded .back {
    opacity: 0.35;
    filter: saturate(0.6);
  }

  /* Narrow screens: the cards are wide rows, the mark at the left. */
  @media (max-width: 700px) {
    /* The face's engraving is drawn for a tall card: on a row card its arch and plinth cross the words. The frame keeps its own gilt. */
    .frame > :global(.engraving) {
      display: none;
    }
    .frame {
      flex-direction: row;
      height: auto;
      min-height: 84px;
      padding: 12px 18px;
      gap: 18px;
    }
    .back {
      flex-direction: row;
      gap: 18px;
      padding: 12px 18px;
      justify-content: flex-start;
    }
    .mark {
      width: 48px;
      height: 48px;
    }
    .back-mark {
      width: 44px;
      height: 44px;
    }
    .words {
      flex: 1;
      align-items: flex-start;
      text-align: left;
      /* Clear of the plaque. */
      padding-right: 4.8rem;
    }
    .tag {
      top: 50%;
      left: auto;
      right: 14px;
      translate: 0 -50%;
      margin: 0;
    }
    .card.mine:not(:global(.turning)):hover .frame,
    .card.mine:not(:global(.turning)):focus-visible .frame {
      transform: translateY(-2px) scale(1.01);
    }
    .card.chosen .frame {
      transform: scale(1.02);
    }
  }
</style>
