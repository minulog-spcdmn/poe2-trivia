<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { session, engine, AUTO_NEXT_SECONDS } from '../lib/session.svelte';
  import { itemImage, itemName } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import { rulesFor } from '../lib/game';
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

  const rules = $derived(rulesFor(s.settings.difficulty));

  // Merciless and up: the art hides under tiles that lift one by one, in an
  // order every player shares. Late joiners skip ahead by the elapsed time.
  const elapsed = Math.max(0, (session.hostNow() - (session.state?.question?.askedAt ?? 0)) / 1000);
  const veilDelays = $derived.by(() => {
    const v = q.veil;
    if (!v) return [];
    const count = v.size * v.size;
    const order = seededShuffle(count, v.seed);
    const step = v.seconds / count;
    const delays: number[] = [];
    order.forEach((cell, rank) => (delays[cell] = 0.4 + rank * step - elapsed));
    return delays;
  });

  function seededShuffle(n: number, seed: number) {
    let t = seed >>> 0;
    const rand = () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

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

{#snippet stamp()}
  {#if reveal}
    <div class="stamp" class:good={reveal.correct} in:scale={{ start: 2.2, duration: 450, opacity: 0 }}>
      {#if reveal.correct}Correct{:else if reveal.timedOut}Time's up{:else}Wrong{/if}
    </div>
  {/if}
{/snippet}

{#snippet footer()}
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
    <p class="spectate muted">Tip: press 1–{q.options.length} to answer.</p>
  {/if}
{/snippet}

<div class="question">
  <div class="topline">
    <span class="chip">{q.category}</span>
    <span class="who">
      {#if mine && session.mode !== 'local'}Your question{:else}{active.name}'s question{/if}
      {#if q.mode === 'art'}<span class="mode">· find the art</span>{/if}
    </span>
    {#if q.deadline}
      <TimerRing deadline={q.deadline} total={s.settings.timer} stopped={!!reveal} />
    {/if}
  </div>

  {#if q.mode === 'art'}
    <!-- Name given, pick the matching art. -->
    <div class="tooltip wide" class:good={reveal?.correct} class:bad={reveal && !reveal.correct}>
      <div class="head">
        <div class="head-text">
          <span class="iname">{item.name}</span>
          {#if reveal}
            <span class="ibase" in:fade>{item.base}</span>
          {:else}
            <span class="ibase">Which one is it?</span>
          {/if}
        </div>
      </div>
      <div class="tiles" class:many={q.options.length > 4} class:six={q.options.length === 6} class:gray={rules.grayscale && !reveal}>
        {#each q.options as id, i (id)}
          {@const st = optionState(id)}
          {@const opt = engine.byId.get(id)!}
          <button
            class="tile {st}"
            class:mine
            disabled={!mine || !!reveal || !!chosen}
            onclick={() => answer(id)}
            in:scale={{ start: 0.85, duration: 450, delay: 250 + i * 80 }}
          >
            <span class="key">{i + 1}</span>
            <img src={itemImage(id)} alt="Option {i + 1}" class:gem={opt.kind === 'gem'} draggable="false" />
            {#if reveal}
              <span class="caption" in:fly={{ y: 6, duration: 300, delay: 150 }}>{opt.name}</span>
            {/if}
            {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
            {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
          </button>
        {/each}
        {@render stamp()}
      </div>
    </div>
    <div class="art-footer">{@render footer()}</div>
  {:else}
    <div class="stage">
      <div class="tooltip" class:good={reveal?.correct} class:bad={reveal && !reveal.correct}>
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
          <div class="frame" class:gem={item.kind === 'gem'}>
            <img
              src={itemImage(q.itemId)}
              alt="The item to identify"
              class:loaded
              onload={() => (loaded = true)}
              draggable="false"
            />
            {#if q.veil}
              <div class="veil" class:lifted={!!reveal} style:--n={q.veil.size} aria-hidden="true">
                {#each veilDelays as delay, i (i)}
                  <span style:animation-delay="{delay}s"></span>
                {/each}
              </div>
            {/if}
          </div>
          {@render stamp()}
        </div>
      </div>

      <div class="options" class:compact={q.options.length > 6}>
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
        {@render footer()}
      </div>
    </div>
  {/if}
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
  .mode {
    margin-left: 0.3em;
    color: var(--unique-hi);
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
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 72%;
    height: 80%;
  }
  .frame.gem {
    width: 42%;
    height: 50%;
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    transform: scale(0.85);
    filter: blur(8px) brightness(2);
    transition:
      opacity 0.6s,
      transform 0.8s var(--ease-out),
      filter 0.9s;
  }
  /* Tiles of fog over the art that lift one by one. */
  .veil {
    position: absolute;
    inset: -4%;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    grid-template-rows: repeat(var(--n), 1fr);
    transition: opacity 0.7s;
  }
  .veil span {
    background:
      radial-gradient(circle at 30% 25%, rgba(201, 164, 92, 0.1), transparent 60%),
      linear-gradient(160deg, #1a1611, #0a0907);
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 0 12px rgba(0, 0, 0, 0.8);
    animation: lift 0.7s var(--ease-out) both;
  }
  .veil.lifted {
    opacity: 0;
  }
  @keyframes lift {
    0% {
      opacity: 1;
      transform: none;
    }
    100% {
      opacity: 0;
      transform: scale(0.6) rotate(8deg);
    }
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
    z-index: 2;
    pointer-events: none;
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
  .compact .option {
    padding-top: 0.7rem;
    padding-bottom: 0.7rem;
  }
  .compact {
    gap: 0.55rem;
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

  /* "find the art" questions */
  .tooltip.wide {
    width: 100%;
  }
  .tiles {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: #2a1d10;
  }
  .tiles.six {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 250px;
    padding: 1.2rem 0.8rem 0.8rem;
    border: 1px solid transparent;
    background:
      radial-gradient(ellipse at center, rgba(175, 96, 37, 0.1), transparent 70%),
      repeating-linear-gradient(0deg, rgba(90, 100, 140, 0.07) 0 1px, transparent 1px 47px),
      repeating-linear-gradient(90deg, rgba(90, 100, 140, 0.07) 0 1px, transparent 1px 47px),
      #07080c;
    cursor: default;
    transition:
      background 0.3s,
      border-color 0.3s,
      opacity 0.4s,
      box-shadow 0.3s;
  }
  .tiles.many .tile {
    height: 200px;
  }
  .tiles.gray .tile img {
    filter: grayscale(1) contrast(1.1) drop-shadow(0 10px 20px rgba(0, 0, 0, 0.8));
  }
  .tile img {
    flex: 1;
    min-height: 0;
    width: 90%;
    object-fit: contain;
    filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.8));
    transition: transform 0.35s var(--ease-out);
  }
  .tile img.gem {
    flex: none;
    width: 78px;
    height: 78px;
    margin: auto;
  }
  .tile .key {
    position: absolute;
    top: 8px;
    left: 8px;
  }
  .tile .mark {
    position: absolute;
    top: 8px;
    right: 12px;
  }
  .tile.mine:not(:disabled) {
    cursor: pointer;
  }
  .tile.mine:not(:disabled):hover {
    border-color: var(--gold);
    box-shadow: inset 0 0 30px rgba(201, 164, 92, 0.18);
  }
  .tile.mine:not(:disabled):hover img {
    transform: scale(1.07);
  }
  .tile.pending {
    border-color: var(--gold);
  }
  .tile.right {
    border-color: var(--good);
    background: radial-gradient(ellipse at center, rgba(111, 207, 115, 0.22), rgba(10, 25, 10, 0.95) 75%);
    box-shadow: inset 0 0 0 1px var(--good);
  }
  .tile.right .mark {
    color: var(--good);
  }
  .tile.wrong {
    border-color: var(--bad);
    background: radial-gradient(ellipse at center, rgba(224, 85, 63, 0.2), rgba(30, 8, 5, 0.95) 75%);
    animation: shake 0.5s;
  }
  .tile.wrong .mark {
    color: var(--bad);
  }
  .tile.dim {
    opacity: 0.4;
  }
  .caption {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.85rem;
    text-align: center;
    color: #e9c8a2;
    line-height: 1.2;
  }
  .tile.right .caption {
    color: #c9f5c3;
  }
  .art-footer {
    margin-top: 1rem;
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
    .tiles,
    .tiles.six {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tile,
    .tiles.many .tile {
      height: 150px;
    }
  }
</style>
