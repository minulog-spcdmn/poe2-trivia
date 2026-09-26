<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { session } from '../lib/session.svelte';
  import { categoryIcon } from '../lib/ui';
  import { LOCKOUT_TURNS } from '../lib/game';
  import { sfx } from '../lib/sound';

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
        return `opacity:${Math.min(1, t * 2)};transform:translateY(${(1 - e) * 120}px) rotate(${(1 - e) * rot}deg) rotateY(${(1 - e) * 90}deg)`;
      },
    };
  }

  function pick(category: string) {
    if (!mine || picked) return;
    picked = category;
    sfx('click');
    session.dispatch({ type: 'pick', category });
    // Allow a retry if the host rejected the pick.
    setTimeout(() => (picked = null), 2500);
  }
</script>

<div class="choose">
  <p class="prompt">
    {#if mine}
      Choose your category{#if active.recent.length}<span class="muted"> — locked: {active.recent.join(', ')}</span>{/if}
    {:else}
      <span class="muted">Waiting for</span> {active.name} <span class="muted">to choose a category…</span>
    {/if}
  </p>

  <div class="cards">
    {#each s.offered as cat, i (cat)}
      <button
        class="card"
        class:mine
        class:chosen={picked === cat}
        class:faded={picked && picked !== cat}
        disabled={!mine}
        onclick={() => pick(cat)}
        in:deal={{ i }}
      >
        <span class="frame">
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
          <span class="icon"><span class="glyph" style:--src="url('{categoryIcon(cat)}')"></span></span>
          <span class="title">{cat}</span>
        </span>
      </button>
    {/each}
  </div>

  {#if mine}
    <p class="note muted">A category you choose stays locked for your next {LOCKOUT_TURNS} turns.</p>
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
    perspective: 1200px;
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
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px rgba(125, 99, 51, 0.35),
      0 16px 40px rgba(0, 0, 0, 0.6);
    transition:
      transform 0.35s var(--ease-out),
      box-shadow 0.35s,
      border-color 0.35s,
      opacity 0.4s,
      filter 0.4s;
  }
  .corner {
    position: absolute;
    width: 18px;
    height: 18px;
    border: 2px solid var(--gold);
    opacity: 0.7;
  }
  .tl {
    top: 8px;
    left: 8px;
    border-right: 0;
    border-bottom: 0;
  }
  .tr {
    top: 8px;
    right: 8px;
    border-left: 0;
    border-bottom: 0;
  }
  .bl {
    bottom: 8px;
    left: 8px;
    border-right: 0;
    border-top: 0;
  }
  .br {
    bottom: 8px;
    right: 8px;
    border-left: 0;
    border-top: 0;
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
  .title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.06em;
    color: var(--gold-hi);
    text-align: center;
    line-height: 1.2;
  }

  .card.mine {
    cursor: pointer;
  }
  .card.mine:hover .frame,
  .card.mine:focus-visible .frame {
    transform: translateY(-10px) scale(1.03);
    border-color: var(--gold);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px rgba(201, 164, 92, 0.6),
      0 0 40px rgba(224, 138, 68, 0.3),
      0 24px 50px rgba(0, 0, 0, 0.7);
  }
  .card.mine:hover .glyph {
    transform: scale(1.08) rotate(-3deg);
    opacity: 1;
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
    box-shadow: 0 0 60px rgba(255, 170, 90, 0.5);
  }
  .card.faded .frame {
    opacity: 0.2;
    transform: scale(0.94);
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
    .corner {
      display: none;
    }
    .card.mine:hover .frame {
      transform: translateX(6px);
    }
  }
</style>
