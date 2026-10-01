<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { session } from '../lib/session.svelte';
  import { categoryGroups, categoryIcon } from '../lib/ui';
  import { rulesFor } from '../lib/game';
  import { sfx } from '../lib/sound';
  import { backdropShadow } from '../lib/backdropShadow';
  import { cardHover, cardLanded, cardPicked } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);

  let picked = $state<string | null>(null);

  function deal(_node: Element, { i }: { i: number }) {
    const rot = (i - 1) * 8;
    return {
      delay: 250 + i * 120,
      duration: 650,
      css: (t: number) => {
        const e = cubicOut(t);
        return `opacity:${Math.min(1, t * 2)};transform:perspective(1200px) translateY(${(1 - e) * 120}px) rotate(${(1 - e) * rot}deg) rotateY(${(1 - e) * 90}deg)`;
      },
    };
  }

  /** Svelte action: the card's landing, when its deal animation touches down. */
  function dealt(node: HTMLElement, i: number) {
    const t = setTimeout(() => cardLanded(node), 250 + i * 120 + 420);
    return { destroy: () => clearTimeout(t) };
  }

  let cardEls = $state<HTMLElement[]>([]);
  let burning: Handle | null = null;

  function enter(e: PointerEvent, i: number) {
    if (!mine || picked || e.pointerType !== 'mouse') return;
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
    if (!mine || picked) return;
    picked = category;
    burning?.stop();
    burning = null;
    const i = s.offered.indexOf(category);
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
      Choose your category{#if active.recent.length}{' '}<span class="muted">(locked: {active.recent.join(', ')})</span>{/if}
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
        use:dealt={i}
        in:deal={{ i }}
      >
        <span class="frame" use:backdropShadow>
          <span class="glare"></span>
          <span class="filigree"></span>
          <span class="icon"><span class="glyph" style:--src="url('{categoryIcon(cat)}')"></span></span>
          <span class="label">
            <span class="title">{cat}</span>
            {#if categoryGroups(cat).length}
              <span class="groups">{#each categoryGroups(cat) as group (group)}<span>{group}</span>{/each}</span>
            {/if}
          </span>
        </span>
      </button>
    {/each}
  </div>

  {#if s.deathmatch}
    <p class="note muted">{mine ? 'Tap the card when you are ready.' : 'Questions are one difficulty harder.'}</p>
  {:else if mine}
    <p class="note muted">A category you choose stays locked for your next {rulesFor(s.settings.difficulty).lockout} turns.</p>
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
    transform-style: preserve-3d;
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
  .label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
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
  /* What the category holds, so a quiver under Off-Hands is no surprise.
     Spaced words rather than bullets, which would end up at a line's start. */
  .groups {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.1rem 0.75em;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: var(--gold);
    line-height: 1.35;
  }
  .groups > span {
    white-space: nowrap;
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
  .card:disabled .frame {
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
    .label {
      flex: 1;
      align-items: flex-start;
      gap: 0.15rem;
    }
    .title {
      text-align: left;
    }
    .groups {
      justify-content: flex-start;
    }
    .filigree {
      inset: 3px;
      background-size: 20px 20px;
    }
    .card.mine:hover .frame {
      transform: translateX(6px);
    }
  }
</style>
