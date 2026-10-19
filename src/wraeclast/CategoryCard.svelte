<script lang="ts">
  // One category card as the game deals it (ChooseCategory.svelte's look,
  // which is bound to the game's session): the engraved plate, the category's
  // emblem, its name, slid in face down and turned up. On top, a plaque
  // with the card's multiplier.
  import { cubicInOut, cubicOut } from 'svelte/easing';
  import CardEngraving from '../components/CardEngraving.svelte';
  import { categoryArt } from '../lib/categoryArt';
  import { fits, fitStyle, maskOf, measure } from '../lib/iconFit.svelte';
  import { motion } from '../lib/motion.svelte';
  import { ITEMS, type Card } from './rules';
  import { times } from './markup';

  let {
    card,
    i,
    n,
    chosen = false,
    faded = false,
    disabled = false,
    onpick,
  }: { card: Card; i: number; n: number; chosen?: boolean; faded?: boolean; disabled?: boolean; onpick?: () => void } = $props();

  const abs = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
  const art = $derived(ART.get(card.category));
  const icon = $derived(art ? abs(art.icon) : '');
  $effect(() => {
    if (icon) measure(icon);
  });

  // The deal, as the game's (ChooseCategory.svelte's TURN and timings, copied:
  // importing it would pull in the game's session): in face down one after
  // another, then turned up.
  const TURN = { seconds: 0.46, lift: 16, swell: 0.05, perspective: 1200, across: '(max-width: 700px)' };
  const DEAL = 0.42;
  const FLIP = TURN.seconds;
  const dealAt = (k: number) => 0.15 + k * 0.07;
  const flipAt = (k: number) => 0.62 + k * 0.12;
  const narrow = matchMedia(TURN.across);

  function appear(_node: Element, { i }: { i: number }) {
    if (motion.still) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return { delay: Math.round(dealAt(i) * 1000), duration: DEAL * 400, css: (t: number) => `opacity:${t}` };
  }
  function deal(node: Element, { i, n }: { i: number; n: number }) {
    if (motion.still) return {};
    node.classList.add('dealt');
    const cardEl = node.parentElement;
    cardEl?.classList.add('down');
    setTimeout(() => cardEl?.classList.remove('down'), (flipAt(i) + FLIP / 2) * 1000);
    const start = dealAt(i);
    const turn = flipAt(i) - start;
    const total = turn + FLIP;
    const rot = (i - (n - 1) / 2) * 7;
    const axis = narrow.matches ? 'X' : 'Y';
    return {
      delay: Math.round(start * 1000),
      duration: Math.round(total * 1000),
      css: (t: number) => {
        const u = t * total;
        const d = cubicOut(Math.min(1, u / DEAL));
        const f = cubicInOut(Math.min(1, Math.max(0, (u - turn) / FLIP)));
        const lift = Math.sin(Math.PI * f);
        const y = (1 - d) * 90 - lift * TURN.lift;
        return `transform:perspective(${TURN.perspective}px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotate${axis}(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + TURN.swell * lift).toFixed(4)})`;
      },
    };
  }
</script>

<script module lang="ts">
  // Every category's emblem, as the game picks it (lib/categoryArt).
  const byCategory = new Map<string, typeof ITEMS>();
  for (const it of ITEMS) byCategory.set(it.category, [...(byCategory.get(it.category) ?? []), it]);
  const ART = categoryArt(byCategory);
</script>

<button
  class="card"
  class:mine={!disabled}
  class:chosen
  class:faded
  data-m={card.multiplier}
  {disabled}
  onclick={() => onpick?.()}
  style:--face="{Math.round((flipAt(i) + FLIP / 2) * 1000)}ms"
  in:appear|global={{ i }}
>
  <span class="turn" in:deal|global={{ i, n }}>
    <span class="back" aria-hidden="true">
      <CardEngraving side="back" />
      <span class="filigree"></span>
    </span>
    <span class="frame">
      <CardEngraving side="face" />
      <span class="sheen"></span>
      <span class="filigree"></span>
      <span class="tag" aria-label="Multiplier {card.multiplier}">{times(card.multiplier)}</span>
      <span class="icon">
        <span class="lit"><span class="glyph" class:fit={!!fits[icon]} style={art ? fitStyle(icon, art.tweak) : ''} style:--src="url('{maskOf(icon)}')"></span></span>
      </span>
      <span class="title">{card.category}</span>
    </span>
  </span>
</button>

<style>
  .card {
    --ink: #c9a05a;
    --warm: #c8682a;
    --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .86 0 0 0 0 .62 .08 0 0 0 -.025'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")
      0 0 / 180px;
    /* The plaque's colours, warmer the bigger the multiplier. */
    --t: var(--gold-lo);
    --t-hi: var(--gold-hi);
    --t-glow: transparent;
    padding: 0;
    border: 0;
    background: none;
    cursor: default;
  }
  .card[data-m='1.25'] {
    --t: #b07a3a;
    --t-glow: rgba(224, 138, 68, 0.18);
  }
  .card[data-m='1.5'] {
    --t: #d08a3c;
    --t-hi: #ffe0a8;
    --t-glow: rgba(224, 138, 68, 0.32);
  }
  .card[data-m='2'] {
    --t: #f0a24a;
    --t-hi: #fff1cf;
    --t-glow: rgba(255, 170, 90, 0.5);
  }
  .turn {
    position: relative;
    display: block;
    transform-style: preserve-3d;
  }
  .frame,
  .back {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }
  .back {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    overflow: clip;
    border: 1px solid var(--gold-lo);
    background:
      var(--grain),
      radial-gradient(circle at 50% 50%, rgba(175, 96, 37, 0.2), transparent 90px),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px rgba(125, 99, 51, 0.35);
    transform: rotateY(180deg);
    pointer-events: none;
  }
  .frame > :global(.engraving),
  .back > :global(.engraving) {
    opacity: 0.6;
    transition: opacity 0.4s;
  }
  .frame {
    position: relative;
    display: block;
    height: 300px;
    overflow: clip;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      var(--grain),
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
    --at: 1px;
    --end: 30px;
    --rule: linear-gradient(rgba(201, 164, 92, 0.26), rgba(201, 164, 92, 0.26));
    --rules:
      var(--rule) var(--end) var(--at) / calc(100% - 2 * var(--end)) 1px no-repeat,
      var(--rule) var(--end) calc(100% - var(--at)) / calc(100% - 2 * var(--end)) 1px no-repeat,
      var(--rule) var(--at) var(--end) / 1px calc(100% - 2 * var(--end)) no-repeat,
      var(--rule) calc(100% - var(--at)) var(--end) / 1px calc(100% - 2 * var(--end)) no-repeat;
    position: absolute;
    inset: 5px;
    background: var(--filigree), var(--rules);
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(224, 138, 68, 0.35));
    pointer-events: none;
  }
  /* The multiplier, on a plaque over the keystone (the game's find plaque). */
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
  .icon {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(132px - 75px);
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
  }
  .lit {
    position: relative;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.8));
  }
  .glyph {
    width: 130px;
    height: 150px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.4s;
  }
  .glyph.fit {
    --e-k: var(--e-kin, 1);
    --u: calc(var(--e-s, 1) * var(--e-k) * 1px);
    translate: calc(var(--e-left, 0) * var(--e-s, 1) * -1px)
      calc(min(0px, (1 - var(--e-k)) * var(--e-h) * var(--e-s, 1) * 0.5px) - var(--e-up, 0) * var(--e-s, 1) * 1px);
    width: calc(var(--e-w) * var(--u));
    height: calc(var(--e-h) * var(--u));
    -webkit-mask-size: calc(var(--e-iw) * var(--u)) calc(var(--e-ih) * var(--u));
    mask-size: calc(var(--e-iw) * var(--u)) calc(var(--e-ih) * var(--u));
    -webkit-mask-position: calc(var(--e-x) * var(--u) * -1) calc(var(--e-y) * var(--u) * -1);
    mask-position: calc(var(--e-x) * var(--u) * -1) calc(var(--e-y) * var(--u) * -1);
  }
  .turn:global(.dealt) .glyph {
    animation: kindle 0.9s ease-out var(--face, 0ms) backwards;
  }
  .turn:global(.dealt) .sheen::before {
    animation: sheen 0.8s var(--ease-out) calc(var(--face, 0ms) + 80ms) backwards;
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
  .sheen::before {
    content: '';
    position: absolute;
    inset: -10% auto -10% -80%;
    width: 50%;
    background: linear-gradient(100deg, transparent, rgba(255, 232, 180, 0.18), transparent);
    transform: skewX(-14deg);
    opacity: 0;
  }
  @keyframes sheen {
    from {
      opacity: 1;
      translate: 0 0;
    }
    to {
      opacity: 1;
      translate: 420% 0;
    }
  }
  .title {
    position: absolute;
    left: 22px;
    right: 22px;
    top: 238px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.04em;
    color: var(--gold-hi);
    text-align: center;
    line-height: 1.2;
    transition:
      color 0.3s,
      text-shadow 0.3s;
  }
  .card:global(.down) .frame,
  .card:not(:global(.down)) .back {
    visibility: hidden;
  }
  .card.mine {
    cursor: pointer;
  }
  .card.mine:not(:global(.down)):hover .frame,
  .card.mine:not(:global(.down)):focus-visible .frame {
    transform: translateY(-10px) scale(1.04);
    border-color: var(--gold);
  }
  .card.mine:not(:global(.down)):hover .frame > :global(.engraving),
  .card.chosen .frame > :global(.engraving) {
    opacity: 0.85;
  }
  .card.mine:not(:global(.down)):hover .glyph {
    transform: scale(1.1) rotate(-3deg);
    filter: brightness(1.15);
  }
  .card.mine:not(:global(.down)):hover .title {
    color: #fff1cf;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.6);
  }
  .card.mine:not(:global(.down)):hover .filigree {
    opacity: 1;
    filter: brightness(1.25) drop-shadow(0 0 5px rgba(255, 170, 90, 0.6));
  }
  .card:focus-visible {
    outline: none;
  }
  .card.chosen .frame {
    transform: translateY(-4px) scale(1.05);
    border-color: var(--gold);
    transition: transform 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.15);
  }
  .card.faded .frame {
    opacity: 0.35;
    filter: saturate(0.6);
  }

  /* Narrow screens: the cards are wide rows, the emblem at the left. */
  @media (max-width: 700px) {
    .frame {
      display: flex;
      align-items: center;
      height: auto;
      min-height: 96px;
      padding: 15px 22px;
      gap: 32px;
      background:
        var(--grain),
        radial-gradient(circle at 62px 50%, color-mix(in srgb, var(--warm) 28%, transparent), transparent 74px),
        radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
        linear-gradient(170deg, #211912, #0d0a07 70%);
    }
    .icon {
      position: relative;
      top: auto;
      flex: none;
      width: 80px;
      height: 80px;
      --e-s: 0.58;
    }
    .glyph {
      width: 74px;
      height: 74px;
    }
    .glyph.fit {
      --e-k: min(var(--e-kin, 1), 1);
    }
    .title {
      position: static;
      display: block;
      height: auto;
      flex: 1;
      text-align: left;
    }
    /* The plaque on the row's right end. */
    .tag {
      top: 50%;
      left: auto;
      right: 14px;
      translate: 0 -50%;
      margin: 0;
    }
    .filigree {
      --at: 0.5px;
      --end: 20px;
      inset: 3px;
      background-size:
        20px 20px,
        20px 20px,
        20px 20px,
        20px 20px,
        calc(100% - 2 * var(--end)) 1px,
        calc(100% - 2 * var(--end)) 1px,
        1px calc(100% - 2 * var(--end)),
        1px calc(100% - 2 * var(--end));
    }
    .card.mine:not(:global(.down)):hover .frame,
    .card.mine:not(:global(.down)):focus-visible .frame {
      transform: translateY(-3px) scale(1.02);
    }
    .card.chosen .frame {
      transform: scale(1.02);
    }
  }
</style>
