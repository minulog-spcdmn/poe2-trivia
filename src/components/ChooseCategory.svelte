<script lang="ts">
  import { cubicInOut, cubicOut } from 'svelte/easing';
  import { session } from '../lib/session.svelte';
  import { categoryIcon } from '../lib/ui';
  import { difficultyOf, rulesFor } from '../lib/game';
  import { deathmatchText, lockoutText } from '../lib/difficultyText';
  import { sfx } from '../lib/sound';
  import { backdropShadow } from '../lib/backdropShadow';
  import { cardHover, cardPicked, cardRevealed } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const lockout = $derived(rulesFor(s.settings).lockout);

  let picked = $state<string | null>(null);

  // The deal: the cards slide in face down one after another, then turn face
  // up from left to right. Seconds from when they appear.
  const DEAL = 0.42;
  const FLIP = 0.46;
  const dealAt = (i: number) => 0.15 + i * 0.07;
  const flipAt = (i: number) => 0.62 + i * 0.12;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** When the deal began; null when the cards appeared without one (as after a refresh). */
  let dealtAt: number | null = null;
  /** Whether card i lies face up yet (it can't be picked or catch fire before). */
  const faceUp = (i: number) => dealtAt === null || performance.now() - dealtAt >= (flipAt(i) + FLIP) * 1000;

  // The transitions are global: the cards are created with the screen, which
  // a local transition skips. The card fades in, and its inner part moves:
  // an opacity on the element that turns would flatten it, and its back
  // would show through the face.
  function appear(_node: Element, { i }: { i: number }) {
    if (still) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return { delay: Math.round(dealAt(i) * 1000), duration: DEAL * 400, css: (t: number) => `opacity:${t}` };
  }
  function deal(node: Element, { i, n }: { i: number; n: number }) {
    if (still) return {};
    dealtAt ??= performance.now();
    // The face's own entrance (see .dealt below) plays with the deal only.
    node.classList.add('dealt');
    const start = dealAt(i);
    const turn = flipAt(i) - start;
    const total = turn + FLIP;
    const rot = (i - (n - 1) / 2) * 7;
    return {
      delay: Math.round(start * 1000),
      duration: Math.round(total * 1000),
      css: (t: number) => {
        const u = t * total;
        const d = cubicOut(Math.min(1, u / DEAL));
        const f = cubicInOut(Math.min(1, Math.max(0, (u - turn) / FLIP)));
        // Lifted off the table while it turns.
        const lift = Math.sin(Math.PI * f);
        const y = (1 - d) * 90 - lift * 16;
        return `transform:perspective(1200px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotateY(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + 0.05 * lift).toFixed(4)})`;
      },
    };
  }

  /** Svelte action: the card's moment as it lands face up. */
  function revealed(node: HTMLElement, i: number) {
    if (still) return;
    const t = setTimeout(() => {
      if (dealtAt !== null) cardRevealed(node.querySelector('.frame') ?? node, !!s.deathmatch);
    }, (flipAt(i) + FLIP) * 1000);
    return { destroy: () => clearTimeout(t) };
  }

  let cardEls = $state<HTMLElement[]>([]);
  let burning: Handle | null = null;

  function enter(e: PointerEvent, i: number) {
    if (!mine || picked || e.pointerType !== 'mouse' || !faceUp(i)) return;
    burning?.stop();
    const card = cardEls[i];
    const frame = card?.querySelector('.frame');
    if (frame) burning = cardHover(frame, card, !!s.deathmatch);
  }
  function leave(e: PointerEvent) {
    burning?.stop();
    burning = null;
    const frame = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.frame');
    frame?.style.removeProperty('--rx');
    frame?.style.removeProperty('--ry');
  }
  /** Tilts the card toward the pointer, and moves the glare with it. */
  function tilt(e: PointerEvent) {
    if (!mine || picked || e.pointerType !== 'mouse') return;
    const frame = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.frame');
    if (!frame) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    frame.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`);
    frame.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(2)}deg`);
    frame.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    frame.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  }
  $effect(() => () => burning?.stop());

  function pick(category: string) {
    const i = s.offered.indexOf(category);
    if (!mine || picked || !faceUp(i)) return;
    picked = category;
    burning?.stop();
    burning = null;
    const frame = cardEls[i]?.querySelector('.frame');
    if (frame) cardPicked(frame, cardEls[i], cardEls.filter((_, j) => j !== i).map((c) => c.querySelector('.frame') ?? c), !!s.deathmatch);
    sfx('pick');
    session.dispatch({ type: 'pick', category });
    // Allow a retry if the host rejected the pick.
    setTimeout(() => (picked = null), 2500);
  }
</script>

<div class="choose">
  <p class="prompt">
    {#if s.deathmatch}
      {#if mine}Sudden death: your category is drawn at random.{:else}<span class="muted">Sudden death for</span> {active.name}<span class="muted">…</span>{/if}
    {:else if mine}
      Choose your category
    {:else}
      <span class="muted">Waiting for</span> {active.name} <span class="muted">to choose a category…</span>
    {/if}
  </p>

  <div class="cards" class:single={s.offered.length === 1}>
    {#each s.offered as cat, i (cat)}
      <button
        class="card"
        data-sfx="none"
        data-fx="none"
        class:dm={!!s.deathmatch}
        class:mine
        class:chosen={picked === cat}
        class:faded={picked && picked !== cat}
        disabled={!mine}
        onclick={() => pick(cat)}
        onpointerenter={(e) => enter(e, i)}
        onpointerleave={leave}
        onpointermove={tilt}
        bind:this={cardEls[i]}
        style:--face="{Math.round((flipAt(i) + FLIP / 2) * 1000)}ms"
        use:revealed={i}
        in:appear|global={{ i }}
      >
        <span class="turn" in:deal|global={{ i, n: s.offered.length }}>
          <span class="back" aria-hidden="true">
            <span class="filigree"></span>
            <span class="seal">
              <svg class="emblem" viewBox="20 0 400 391"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" /></svg>
            </span>
          </span>
          <span class="frame" use:backdropShadow>
            <span class="glare"></span>
            <span class="sheen"></span>
            <span class="filigree"></span>
            <span class="icon"><span class="glyph" style:--src="url('{categoryIcon(cat)}')"></span></span>
            <span class="title">{cat}</span>
          </span>
        </span>
      </button>
    {/each}
  </div>

  {#if s.deathmatch}
    <p class="note muted">{mine ? 'Tap the card when you are ready.' : deathmatchText(difficultyOf(s.settings.difficulty))}</p>
  {:else if mine && lockout > 0}
    <p class="note muted">A category you choose stays locked for {lockoutText(lockout)}.</p>
  {/if}
</div>

<style>
  .choose {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.6rem;
  }
  .prompt {
    margin: 0;
    font-size: 1.2rem;
    text-align: center;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 220px));
    gap: 1.4rem;
  }
  .card {
    padding: 0;
    border: 0;
    background: none;
    cursor: default;
  }
  .turn {
    position: relative;
    display: block;
    transform-style: preserve-3d;
  }
  /* The card's two sides: the deal turns it from its back to its face. */
  .frame,
  .back {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }
  .back {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      radial-gradient(circle at 50% 50%, rgba(175, 96, 37, 0.28), transparent 55%),
      repeating-linear-gradient(45deg, rgba(201, 164, 92, 0.07) 0 1px, transparent 1px 16px),
      repeating-linear-gradient(-45deg, rgba(201, 164, 92, 0.07) 0 1px, transparent 1px 16px),
      linear-gradient(170deg, #2a2016, #120e0a 70%);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px rgba(125, 99, 51, 0.35),
      0 16px 40px rgba(0, 0, 0, 0.6);
    transform: rotateY(180deg);
    pointer-events: none;
  }
  .seal {
    display: grid;
    place-items: center;
    width: 108px;
    height: 108px;
    border-radius: 50%;
    border: 1px solid rgba(201, 164, 92, 0.55);
    background: radial-gradient(circle, rgba(18, 14, 10, 0.9) 55%, rgba(18, 14, 10, 0.4));
    box-shadow:
      0 0 0 5px rgba(0, 0, 0, 0.35),
      0 0 0 6px rgba(125, 99, 51, 0.4),
      inset 0 0 24px rgba(224, 138, 68, 0.18);
  }
  .emblem {
    width: 46px;
    height: 46px;
    fill: #c9a45c;
    filter: drop-shadow(0 0 10px rgba(224, 138, 68, 0.55));
  }
  .frame {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    height: 290px;
    padding: 1.6rem 1rem 1.2rem;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      radial-gradient(ellipse at 50% 35%, rgba(175, 96, 37, 0.25), transparent 60%),
      linear-gradient(170deg, #2a2016, #120e0a 70%);
    --bs1: 16px 40px;
    --bs1-color: rgba(0, 0, 0, 0.6);
    --bs-shade: rgba(0, 0, 0, 0.5);
    --bs-ring: rgba(125, 99, 51, 0.35);
    box-shadow:
      inset 0 0 0 4px var(--bs-shade),
      inset 0 0 0 5px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      transform 0.35s var(--ease-out),
      --bs-shade 0.35s,
      --bs-ring 0.35s,
      --bs1 0.35s,
      --bs1-color 0.35s,
      --bs2 0.35s,
      --bs2-color 0.35s,
      border-color 0.35s,
      opacity 0.4s,
      filter 0.4s;
  }
  /* The same gold filigree as the panels, on all four corners. */
  .filigree {
    position: absolute;
    inset: 5px;
    background: var(--filigree);
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(224, 138, 68, 0.35));
    pointer-events: none;
    transition:
      opacity 0.3s,
      filter 0.3s;
  }
  .icon {
    flex: 1;
    filter: drop-shadow(0 0 12px rgba(224, 138, 68, 0.45)) drop-shadow(0 4px 6px rgba(0, 0, 0, 0.8));
    display: grid;
    place-items: center;
    width: 100%;
  }
  .glyph {
    width: 130px;
    height: 150px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
    opacity: 0.85;
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.4s;
  }
  /* As the face turns up in the deal, its emblem kindles and light runs across it. */
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
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.06em;
    color: var(--gold-hi);
    text-align: center;
    line-height: 1.2;
    transition:
      color 0.3s,
      text-shadow 0.3s;
  }

  @media (min-width: 701px) {
    .cards.single {
      grid-template-columns: minmax(0, 220px);
    }
  }
  .card.dm .frame {
    border-color: #8c3a2c;
    background:
      radial-gradient(ellipse at 50% 35%, rgba(224, 85, 63, 0.3), transparent 60%),
      linear-gradient(170deg, #2a1410, #120a08 70%);
  }
  .card.dm .filigree {
    filter: hue-rotate(-32deg) saturate(1.6) drop-shadow(0 0 3px rgba(224, 85, 63, 0.4));
  }
  .card.dm .glyph {
    background: linear-gradient(180deg, #ffd7c9 0%, #e0553f 50%, #6d1a10 100%);
  }
  .card.dm .back {
    border-color: #8c3a2c;
    background:
      radial-gradient(circle at 50% 50%, rgba(224, 85, 63, 0.3), transparent 55%),
      repeating-linear-gradient(45deg, rgba(224, 85, 63, 0.08) 0 1px, transparent 1px 16px),
      repeating-linear-gradient(-45deg, rgba(224, 85, 63, 0.08) 0 1px, transparent 1px 16px),
      linear-gradient(170deg, #2a1410, #120a08 70%);
  }
  .card.dm .back .filigree {
    filter: hue-rotate(-32deg) saturate(1.6) drop-shadow(0 0 3px rgba(224, 85, 63, 0.4));
  }
  .card.dm .seal {
    border-color: rgba(224, 85, 63, 0.55);
  }
  .card.dm .emblem {
    fill: #e0553f;
    filter: drop-shadow(0 0 10px rgba(224, 85, 63, 0.6));
  }
  .card.dm.mine .frame {
    animation: menace 2.4s ease-in-out infinite;
  }
  @keyframes menace {
    50% {
      --bs-ring: transparent;
      --bs1: 0px 45px;
      --bs1-color: rgba(224, 85, 63, 0.45);
    }
  }
  .card.mine {
    cursor: pointer;
  }
  .card.mine:hover .frame,
  .card.mine:focus-visible .frame {
    transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(-10px) scale(1.04);
    border-color: var(--gold);
    --bs-ring: rgba(201, 164, 92, 0.6);
    --bs1: 0px 40px;
    --bs1-color: rgba(224, 138, 68, 0.3);
    --bs2: 24px 50px;
    --bs2-color: rgba(0, 0, 0, 0.7);
  }
  .card.mine:hover .glyph {
    transform: scale(1.1) rotate(-3deg);
    opacity: 1;
    filter: brightness(1.15);
  }
  /* A soft highlight that follows the pointer across the card. */
  .glare {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at var(--gx, 50%) var(--gy, 30%), rgba(255, 226, 170, 0.07), transparent 45%);
    mix-blend-mode: screen;
    opacity: 0;
    transition: opacity 0.35s;
    pointer-events: none;
  }
  .card.mine:hover .glare {
    opacity: 1;
  }
  .card.mine:hover .title {
    color: #fff1cf;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.6);
  }
  .card.mine:hover .filigree {
    opacity: 1;
    filter: brightness(1.25) drop-shadow(0 0 5px rgba(255, 170, 90, 0.6));
  }
  .card.dm.mine:hover .filigree {
    filter: hue-rotate(-32deg) saturate(1.6) brightness(1.2) drop-shadow(0 0 5px rgba(224, 85, 63, 0.6));
  }
  .card:focus-visible {
    outline: none;
  }
  .card:disabled .frame,
  .card:disabled .back {
    filter: saturate(0.6) brightness(0.8);
  }
  .card.chosen .frame {
    transform: translateY(-14px) scale(1.08);
    border-color: var(--gold-hi);
    --bs-shade: transparent;
    --bs-ring: transparent;
    --bs1: 0px 60px;
    --bs1-color: rgba(255, 170, 90, 0.5);
    --bs2: 0px 0px;
    --bs2-color: transparent;
  }
  .card.faded .frame {
    opacity: 0.2;
    transform: scale(0.92) translateY(8px);
    filter: grayscale(0.8) brightness(0.6) blur(1px);
  }

  .note {
    margin: 0;
    font-style: italic;
    font-size: 0.95rem;
  }

  @media (max-width: 700px) {
    .cards {
      grid-template-columns: 1fr;
      width: min(360px, 100%);
      gap: 0.7rem;
    }
    .frame {
      height: auto;
      flex-direction: row;
      padding: 0.8rem 1.2rem;
      gap: 1rem;
    }
    .icon {
      flex: none;
      width: 64px;
      height: 64px;
    }
    .glyph {
      width: 60px;
      height: 60px;
    }
    .title {
      flex: 1;
      text-align: left;
    }
    .filigree {
      inset: 3px;
      background-size: 20px 20px;
    }
    .seal {
      width: 52px;
      height: 52px;
    }
    .emblem {
      width: 24px;
      height: 24px;
    }
    .card.mine:hover .frame {
      transform: translateX(6px);
    }
  }
</style>
