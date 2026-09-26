<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { session, engine, AUTO_NEXT_SECONDS } from '../lib/session.svelte';
  import { itemImage, itemName } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import TimerRing from './TimerRing.svelte';

  const s = $derived(session.state!);
  const q = $derived(s.question!);
  const reveal = $derived(s.phase === 'reveal' ? s.reveal : null);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const item = $derived(engine.byId.get(q.itemId)!);
  const canNext = $derived(!!reveal && (mine || session.isHost));

  let chosen = $state<string | null>(null);
  let loaded = $state(false);

  function answer(id: string) {
    if (!mine || reveal || chosen) return;
    chosen = id;
    sfx('click');
    session.dispatch({ type: 'answer', optionId: id });
    setTimeout(() => {
      if (!session.state?.reveal) chosen = null;
    }, 2500);
  }

  function next() {
    sfx('click');
    session.dispatch({ type: 'next' });
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const n = Number(e.key);
    if (!reveal && n >= 1 && n <= q.options.length) answer(q.options[n - 1]);
    else if (reveal && canNext && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  }

  function optionState(id: string) {
    if (!reveal) return chosen === id ? 'pending' : '';
    if (id === reveal.correctId) return 'right';
    if (id === reveal.chosenId) return 'wrong';
    return 'dim';
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="question">
  <div class="topline">
    <span class="chip">{q.category}</span>
    <span class="who">
      {#if mine && session.mode !== 'local'}Your question{:else}{active.name}'s question{/if}
    </span>
    {#if q.deadline}
      <TimerRing deadline={q.deadline} total={s.settings.timer} stopped={!!reveal} />
    {/if}
  </div>

  <div class="stage">
    <div class="tooltip" class:revealed={!!reveal} class:good={reveal?.correct} class:bad={reveal && !reveal.correct}>
      <div class="head">
        {#if reveal}
          <div class="head-text" in:fly={{ y: 10, duration: 450 }}>
            <span class="iname">{item.name}</span>
            <span class="ibase">{item.base}</span>
          </div>
        {:else}
          <div class="head-text" out:fade={{ duration: 150 }}>
            <span class="iname unknown">Unidentified</span>
            <span class="ibase">{q.category}</span>
          </div>
        {/if}
      </div>
      <div class="art">
        {#key q.itemId}
          <img
            src={itemImage(q.itemId)}
            alt="The unique item to identify"
            class:loaded
            onload={() => (loaded = true)}
            draggable="false"
          />
        {/key}
        {#if reveal}
          <div class="stamp" class:good={reveal.correct} in:scale={{ start: 2.2, duration: 450, opacity: 0 }}>
            {#if reveal.correct}Correct{:else if reveal.timedOut}Time's up{:else}Wrong{/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="options">
      {#each q.options as id, i (id)}
        {@const st = optionState(id)}
        <button
          class="option {st}"
          class:mine
          disabled={!mine || !!reveal || !!chosen}
          onclick={() => answer(id)}
          in:fly={{ x: 40, duration: 450, delay: 300 + i * 90 }}
        >
          <span class="key">{i + 1}</span>
          <span class="text">{itemName(id)}</span>
          {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
          {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
        </button>
      {/each}

      {#if reveal}
        <div class="result" in:fly={{ y: 16, duration: 400, delay: 250 }}>
          <p>
            {#if reveal.correct}
              <b class="good">+1</b> for {active.name}!
            {:else if reveal.timedOut}
              {active.name} ran out of time.
            {:else}
              No point for {active.name}.
            {/if}
          </p>
          {#if canNext}
            <button class="btn primary" onclick={next}>
              Next turn
              {#if session.mode === 'host'}
                <span class="auto" style:animation-duration="{AUTO_NEXT_SECONDS}s"></span>
              {/if}
            </button>
          {:else}
            <div class="autobar"><span style:animation-duration="{AUTO_NEXT_SECONDS}s"></span></div>
          {/if}
        </div>
      {:else if !mine}
        <p class="spectate muted">{active.name} is deciding…</p>
      {:else}
        <p class="spectate muted">Tip: press 1–4 to answer.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .question {
    width: min(980px, 100%);
    margin: 0 auto;
  }
  .topline {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 64px;
    margin-bottom: 1rem;
  }
  .chip {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 0.4em 1em;
    color: var(--gold-hi);
    border: 1px solid var(--gold-lo);
    background: rgba(0, 0, 0, 0.4);
    border-radius: 2px;
  }
  .who {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-style: italic;
    color: var(--muted);
  }

  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: center;
  }

  /* PoE-style item tooltip */
  .tooltip {
    border: 1px solid #5a3a1c;
    background: rgba(5, 4, 3, 0.92);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.7),
      0 0 0 1px #000;
    transition:
      box-shadow 0.6s,
      border-color 0.6s;
  }
  .tooltip.good {
    border-color: #4f8c4f;
    box-shadow:
      0 0 50px rgba(111, 207, 115, 0.25),
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .tooltip.bad {
    border-color: #8c3a2c;
    box-shadow:
      0 0 50px rgba(224, 85, 63, 0.18),
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .head {
    position: relative;
    display: grid;
    height: 64px;
    place-items: center;
    background:
      linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.35) 20%, rgba(175, 96, 37, 0.35) 80%, transparent),
      linear-gradient(180deg, #3b2412, #1c1008);
    border-bottom: 1px solid #6b4520;
    overflow: hidden;
  }
  .head::before,
  .head::after {
    content: '◆';
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    color: var(--unique);
    font-size: 0.9rem;
    opacity: 0.8;
  }
  .head::before {
    left: 14px;
  }
  .head::after {
    right: 14px;
  }
  .head-text {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
  }
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.2rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .iname.unknown {
    color: #c8c8c8;
    letter-spacing: 0.1em;
    font-size: 1.05rem;
    text-shadow: none;
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.85rem;
    color: #d8a26a;
    opacity: 0.85;
  }

  .art {
    position: relative;
    display: grid;
    place-items: center;
    height: 360px;
    background:
      radial-gradient(ellipse at center, rgba(175, 96, 37, 0.12), transparent 65%),
      repeating-linear-gradient(0deg, rgba(90, 100, 140, 0.08) 0 1px, transparent 1px 47px),
      repeating-linear-gradient(90deg, rgba(90, 100, 140, 0.08) 0 1px, transparent 1px 47px),
      #07080c;
    overflow: hidden;
  }
  .art img {
    /* Scale small items (rings, flasks) up so every question reads well. */
    position: absolute;
    inset: 0;
    margin: auto;
    width: 72%;
    height: 80%;
    object-fit: contain;
    opacity: 0;
    transform: scale(0.85);
    filter: blur(8px) brightness(2);
    transition:
      opacity 0.6s,
      transform 0.8s var(--ease-out),
      filter 0.9s;
  }
  .art img.loaded {
    opacity: 1;
    transform: scale(1);
    filter: drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8));
    animation: hover 5s ease-in-out 1s infinite;
  }
  @keyframes hover {
    50% {
      translate: 0 -6px;
    }
  }
  .stamp {
    position: absolute;
    bottom: 18px;
    right: 18px;
    padding: 0.2em 0.7em;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.1rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #ff8f78;
    border: 2px solid currentColor;
    border-radius: 3px;
    rotate: -8deg;
    background: rgba(0, 0, 0, 0.55);
  }
  .stamp.good {
    color: var(--good);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    padding: 0.95rem 1.1rem;
    text-align: left;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: default;
    transition:
      transform 0.25s var(--ease-out),
      border-color 0.25s,
      box-shadow 0.25s,
      opacity 0.4s,
      background 0.4s;
  }
  .option.mine:not(:disabled) {
    cursor: pointer;
  }
  .option.mine:not(:disabled):hover {
    transform: translateX(6px);
    border-color: var(--gold);
    box-shadow: 0 0 20px rgba(201, 164, 92, 0.18);
  }
  .key {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--gold);
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
  }
  .text {
    flex: 1;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.08rem;
    color: #e9c8a2;
    letter-spacing: 0.02em;
  }
  .mark {
    font-size: 1.3rem;
    font-weight: 700;
  }
  .option.pending {
    border-color: var(--gold);
    animation: glow 1s ease-in-out infinite;
  }
  .option.right {
    border-color: var(--good);
    background: linear-gradient(90deg, rgba(47, 90, 45, 0.85), rgba(20, 35, 18, 0.9));
    box-shadow: 0 0 30px rgba(111, 207, 115, 0.3);
    transform: scale(1.03);
  }
  .option.right .text,
  .option.right .mark {
    color: #c9f5c3;
  }
  .option.right .key {
    border-color: var(--good);
    color: var(--good);
  }
  .option.wrong {
    border-color: var(--bad);
    background: linear-gradient(90deg, rgba(100, 32, 22, 0.85), rgba(40, 14, 10, 0.9));
    animation: shake 0.5s;
  }
  .option.wrong .text,
  .option.wrong .mark {
    color: #ffb3a4;
  }
  .option.dim {
    opacity: 0.35;
  }
  .option:disabled {
    color: inherit;
  }

  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.6rem;
    min-height: 48px;
  }
  .result p {
    margin: 0;
    font-size: 1.15rem;
  }
  .result .good {
    font-family: var(--font-display);
    color: var(--good);
    font-size: 1.4rem;
  }
  .result .btn {
    overflow: hidden;
  }
  .auto,
  .autobar span {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 100%;
    background: var(--gold-hi);
    transform-origin: left;
    animation: drain linear forwards;
  }
  .autobar {
    position: relative;
    width: 120px;
    height: 2px;
    background: rgba(255, 255, 255, 0.08);
  }
  .spectate {
    margin: 0.6rem 0 0;
    font-style: italic;
    text-align: center;
  }

  @keyframes drain {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
  @keyframes glow {
    50% {
      box-shadow: 0 0 22px rgba(201, 164, 92, 0.35);
    }
  }
  @keyframes shake {
    15%,
    55% {
      translate: -7px 0;
    }
    35%,
    75% {
      translate: 7px 0;
    }
  }

  @media (max-width: 760px) {
    .stage {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .art {
      height: 230px;
    }
    .topline {
      margin-bottom: 0.6rem;
    }
    .option {
      padding: 0.75rem 0.9rem;
    }
  }
</style>
