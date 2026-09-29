<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { session, engine, AUTO_NEXT_SECONDS } from '../lib/session.svelte';
  import { shown, gridCells } from '../lib/media.svelte';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import TimerRing from './TimerRing.svelte';
  import Avatar from './Avatar.svelte';
  import ArtImage from './ArtImage.svelte';
  import { backdropShadow } from '../lib/backdropShadow';

  const s = $derived(session.state!);
  const q = $derived(s.question!);
  const reveal = $derived(s.phase === 'reveal' ? s.reveal : null);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const me = $derived(session.myPlayerId);
  // Guests only learn the answer (and the items behind the options) at the reveal.
  const item = $derived(q.itemId ? engine.byId.get(q.itemId) : undefined);
  const race = $derived(s.settings.mode === 'race');
  const canNext = $derived(!!reveal && (race ? session.isHost : mine || session.isHost));
  const myMiss = $derived(race && me ? q.misses.find((m) => m.playerId === me) : undefined);
  const winner = $derived(reveal?.winnerId ? s.players.find((p) => p.id === reveal.winnerId) : undefined);
  const iWon = $derived(race ? !!me && reveal?.winnerId === me : !!reveal?.correct);
  const timerTotal = $derived(q.deadline ? Math.round((q.deadline - q.askedAt) / 1000) : 0);
  const count = $derived(q.labels.length);
  // Pictures the host has sent for this question.
  const media = $derived(shown.qid === q.askedAt ? shown : null);

  /** Veiled art: the grid cells, uncovered or not. */
  const cells = $derived(media?.grid ? gridCells(media.grid) : []);
  // Size of the art shown during the question: keeps the reveal from jumping.
  const hint = $derived(media?.grid ?? media?.art ?? null);

  /** Race mode: who guessed which option wrong (and, once revealed, who won). */
  function markers(index: number) {
    if (!race) return [];
    const ids = q.misses.filter((m) => m.index === index).map((m) => m.playerId);
    if (reveal?.winnerId && index === reveal.correctIndex) ids.unshift(reveal.winnerId);
    return ids.map((pid) => s.players.find((p) => p.id === pid)).filter((p) => !!p);
  }

  /**
   * Which pictures get their name at the reveal: the answer, the wrong pick of
   * the player whose turn it was, and (in a race) your own wrong guess.
   * Untouched decoys stay anonymous so they don't spoil later questions.
   */
  function named(index: number) {
    if (!reveal) return false;
    if (index === reveal.correctIndex) return true;
    if (race) return myMiss?.index === index;
    return index === reveal.chosenIndex;
  }

  /** Revealed: was this picture (option index, or 0 for a name question's art) shown mirrored? */
  function mirrored(index: number) {
    return !!reveal && !!q.mirrored?.[index];
  }

  function optionName(index: number) {
    return q.labels[index] ?? (q.options[index] ? engine.byId.get(q.options[index])?.name : undefined) ?? '';
  }

  let chosen = $state<number | null>(null);

  function answer(index: number) {
    if (!mine || reveal || chosen !== null) return;
    // Time's up: the host only waits a moment longer for answers already on their way.
    if (q.deadline && session.hostNow() > q.deadline) return;
    chosen = index;
    sfx('click');
    session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
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
    // Browser shortcuts (Ctrl/Cmd+1 switches tabs), held keys, and an open dialog aren't answers.
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('[aria-modal="true"]')) return;
    const n = Number(e.key);
    if (!reveal && n >= 1 && n <= count) answer(n - 1);
    else if (reveal && canNext && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  }

  function optionState(index: number) {
    if (myMiss?.index === index) return 'wrong';
    if (!reveal) return chosen === index ? 'pending' : '';
    if (index === reveal.correctIndex) return 'right';
    if (index === reveal.chosenIndex) return 'wrong';
    return 'dim';
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet stamp(inHead = false)}
  {#if reveal}
    <div class="stamp" class:in-head={inHead} class:good={iWon} in:scale={{ start: 2.2, duration: 450, opacity: 0 }}>
      {#if iWon}Correct{:else if race && winner}{session.spectating ? 'Solved' : 'Too slow'}{:else if reveal.timedOut}Time's up{:else if race}No one{:else}Wrong{/if}
    </div>
  {/if}
{/snippet}

{#snippet mirrorLine()}
  <span class="mirrored" in:fade={{ duration: 300, delay: 450 }}>Mirrored</span>
{/snippet}

{#snippet who(index: number)}
  {@const ps = markers(index)}
  {#if ps.length}
    <span class="who-picked">
      {#each ps as p (p.id)}
        <span in:scale={{ start: 0.3, duration: 300 }} title={p.name}><Avatar name={p.name} hue={p.hue} size={22} /></span>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet footer()}
  {#if reveal}
    <div class="result" in:fly={{ y: 16, duration: 400, delay: 250 }}>
      <p>
        {#if race}
          {#if winner}
            <b class="good">+1</b> {winner.id === me ? 'You were' : `${winner.name} was`} fastest!
          {:else if reveal.timedOut}
            Time's up • nobody got it.
          {:else}
            Nobody got it.
          {/if}
          {#if q.misses.length}
            <span class="minus">−1 {q.misses.map((m) => s.players.find((p) => p.id === m.playerId)?.name).join(', ')}</span>
          {/if}
        {:else if reveal.correct}
          <b class="good">+1</b> for {active.name}!
        {:else if reveal.timedOut}
          {active.name} ran out of time.
        {:else}
          No point for {active.name}.
        {/if}
      </p>
      {#if canNext}
        <button class="btn primary" onclick={next}>
          {race ? 'Next question' : 'Next turn'}
          {#if session.mode === 'host'}
            <span class="auto" style:animation-duration="{AUTO_NEXT_SECONDS}s"></span>
          {/if}
        </button>
      {:else}
        <div class="autobar"><span style:animation-duration="{AUTO_NEXT_SECONDS}s"></span></div>
      {/if}
    </div>
  {:else if session.spectating}
    <p class="spectate muted">You're watching. You'll play in the next game.</p>
  {:else if race && myMiss}
    <p class="spectate out">Wrong • −1. You're out until the next question.</p>
  {:else if race}
    <p class="spectate muted">First correct answer wins. Wrong costs a point! Press 1–{count}.</p>
  {:else if !mine}
    <p class="spectate muted">{active.name} is deciding…</p>
  {:else}
    <p class="spectate muted">Tip: press 1–{count} to answer.</p>
  {/if}
{/snippet}

<div class="question">
  <div class="topline">
    <span class="chip">{q.category}</span>
    <span class="task">{q.mode === 'art' ? 'Pick the art that matches the name' : 'Name this item'}</span>
    {#if q.deadline}
      <TimerRing deadline={q.deadline} total={timerTotal} stopped={!!reveal} />
    {/if}
  </div>

  {#if q.mode === 'art'}
    <!-- Name given, pick the matching art. -->
    <div class="tooltip wide" use:backdropShadow class:good={reveal && iWon} class:bad={reveal && !iWon}>
      <div class="head">
        <div class="head-text">
          <span class="iname">{q.prompt}</span>
          {#if reveal && item}
            <span class="ibase" in:fade>{item.base}</span>
          {:else}
            <span class="ibase">Which one is it?</span>
          {/if}
        </div>
        {@render stamp(true)}
      </div>
      <div class="tiles" class:many={count > 4} class:six={count === 6}>
        {#each q.labels as _, i (i)}
          {@const st = optionState(i)}
          {@const src = reveal && q.options[i] ? itemImage(q.options[i]) : media?.options[i]}
          <button
            class="tile {st}"
            class:mine
            disabled={!mine || !!reveal || chosen !== null}
            onclick={() => answer(i)}
            in:scale={{ start: 0.85, duration: 450, delay: 250 + i * 80 }}
          >
            <span class="key">{i + 1}</span>
            {#if src}
              <!-- Named pictures switch to the original art, so a mirrored one turns round. -->
              <span class="pic"><ArtImage {src} alt="Option {i + 1}" scale={1.6} unflip={mirrored(i) && !!q.options[i]} /></span>
            {:else}
              <span class="loading" aria-label="Loading"></span>
            {/if}
            {#if reveal && named(i)}
              <span class="caption" in:fly={{ y: 6, duration: 300, delay: 150 }}>
                {optionName(i)}
                {#if mirrored(i)}{@render mirrorLine()}{/if}
              </span>
            {/if}
            {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
            {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
            {@render who(i)}
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="stage">
      <div class="tooltip" use:backdropShadow class:good={reveal && iWon} class:bad={reveal && !iWon}>
        <div class="head">
          {#if reveal && item}
            <div class="head-text" in:fly={{ y: 10, duration: 450 }}>
              <span class="iname">{item.name}</span>
              <span class="ibase">{item.base}</span>
              {#if mirrored(0)}{@render mirrorLine()}{/if}
            </div>
          {:else}
            <div class="head-text" out:fade={{ duration: 150 }}>
              <span class="iname unknown">Unidentified</span>
              <span class="ibase">{q.category}</span>
            </div>
          {/if}
        </div>
        <div class="art">
          <div class="frame">
            {#if reveal && item}
              <ArtImage src={itemImage(item.id)} alt={item.name} w={hint?.w} h={hint?.h} float unflip={mirrored(0)} />
            {:else if media?.grid}
              <span class="art-slot">
              <span class="art-fit veil" style:--w={media.grid.w} style:--h={media.grid.h} style:--s={1.8}>
                {#each cells as c (c.i)}
                  {@const t = media.tiles[c.i]}
                  <span
                    class="cell"
                    style:left="{(c.x / media.grid.w) * 100}%"
                    style:top="{(c.y / media.grid.h) * 100}%"
                    style:width="{(c.w / media.grid.w) * 100}%"
                    style:height="{(c.h / media.grid.h) * 100}%"
                  >
                    {#if t}<img src={t.url} alt="" draggable="false" />{/if}
                  </span>
                {/each}
              </span>
              </span>
            {:else if media?.art}
              <ArtImage src={media.art.url} alt="The item to identify" w={media.art.w} h={media.art.h} float />
            {:else}
              <span class="loading big" aria-label="Loading"></span>
            {/if}
          </div>
          {@render stamp()}
        </div>
      </div>

      <div class="options" class:compact={count > 6}>
        {#each q.labels as label, i (i)}
          {@const st = optionState(i)}
          <button
            class="option {st}"
            class:mine
            disabled={!mine || !!reveal || chosen !== null}
            onclick={() => answer(i)}
            in:fly={{ x: 40, duration: 450, delay: 300 + i * 90 }}
          >
            <span class="key">{i + 1}</span>
            <span class="text">{label ?? optionName(i)}</span>
            {@render who(i)}
            {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
            {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="footer">{@render footer()}</div>
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
  .task {
    flex: 1;
    min-width: 0;
    line-height: 1.25;
    font-style: italic;
    color: var(--muted);
  }

  /* Art and answers share one row: same top, same bottom, whatever the
     number of options. The art grows with a long list; a short list spreads
     its answers over the art's height. */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: stretch;
  }

  /* PoE-style item tooltip */
  .tooltip {
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    background: rgba(5, 4, 3, 0.92);
    /* --bs1 carries the right/wrong glow, --bs2 the drop shadow. */
    --bs1-color: transparent;
    --bs1: 0px 50px;
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      --bs1-color 0.6s,
      border-color 0.6s;
  }
  .tooltip.good {
    border-color: #4f8c4f;
    --bs1-color: rgba(111, 207, 115, 0.25);
  }
  .tooltip.bad {
    border-color: #8c3a2c;
    --bs1-color: rgba(224, 85, 63, 0.18);
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    height: 64px;
    place-items: center;
    background:
      linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.35) 20%, rgba(175, 96, 37, 0.35) 80%, transparent),
      linear-gradient(180deg, #3b2412, #1c1008);
    border-bottom: 1px solid #6b4520;
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
  /* An extra tooltip line, cool against the warm name and base. */
  .mirrored {
    display: block;
    font-family: var(--font-body);
    font-weight: 400;
    font-variant: small-caps;
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    line-height: 1.1;
    color: #a9c3dc;
  }
  .caption .mirrored {
    font-size: 0.9rem;
  }

  .art {
    position: relative;
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 300px;
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
    width: 84%;
    height: 86%;
    display: grid;
    place-items: center;
  }
  .frame > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }
  .veil {
    /* Tiles are absolutely positioned inside the box. */
    position: relative;
  }
  .cell {
    position: absolute;
    overflow: hidden;
    background:
      radial-gradient(circle at 30% 25%, rgba(201, 164, 92, 0.1), transparent 60%),
      linear-gradient(160deg, #1a1611, #0a0907);
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 0 12px rgba(0, 0, 0, 0.8);
  }
  .cell img {
    display: block;
    /* A hair larger than the cell so neighbouring pieces meet without seams. */
    width: calc(100% + 1px);
    height: calc(100% + 1px);
    animation: uncover 0.6s var(--ease-out) both;
  }
  @keyframes uncover {
    from {
      opacity: 0;
      transform: scale(1.4);
      filter: brightness(2.5);
    }
  }
  .loading {
    width: 28px;
    height: 28px;
    margin: auto;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    animation: spin 0.9s linear infinite;
  }
  .loading.big {
    width: 44px;
    height: 44px;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
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
  .stamp.in-head {
    bottom: auto;
    top: 50%;
    right: 44px;
    translate: 0 -50%;
    font-size: 0.95rem;
  }
  .stamp.good {
    color: var(--good);
  }

  .options {
    display: grid;
    grid-auto-rows: 1fr;
    gap: 0.75rem;
  }
  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    padding: 0.95rem 2.6rem 0.95rem 1.1rem;
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
    /* Cinzel's line box sits its digits a pixel high; nudge them to the optical centre. */
    padding-top: 2px;
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
  /* The ✓/✕ sits in room kept free on the right, so it can't widen, heighten
     or rewrap the answer when it appears at the reveal. */
  .option .mark {
    position: absolute;
    top: 50%;
    right: 0.9rem;
    translate: 0 -50%;
    line-height: 1;
  }
  .compact .option {
    padding-top: 0.7rem;
    padding-bottom: 0.7rem;
  }
  .compact {
    gap: 0.6rem;
  }
  .option.pending {
    border-color: var(--gold);
    animation: glow 1s ease-in-out infinite;
  }
  .option.right {
    border-color: var(--good);
    background: linear-gradient(90deg, rgba(47, 90, 45, 0.85), rgba(20, 35, 18, 0.9));
    box-shadow: 0 0 30px rgba(111, 207, 115, 0.3);
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
  .pic {
    display: block;
    flex: 1;
    width: 92%;
    min-height: 0;
    transition: transform 0.35s var(--ease-out);
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
  .tile.mine:not(:disabled):hover .pic {
    transform: scale(1.06);
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
  /* Same height with a tip, a result or nothing, so the page doesn't jump at the reveal. */
  .footer {
    display: grid;
    align-items: center;
    min-height: 52px;
    margin-top: 1.25rem;
  }

  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
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
  .who-picked {
    display: inline-flex;
    gap: 2px;
    margin-left: auto;
  }
  /* Race avatars sit on the row's top edge as overlapping badges: they come
     and go mid-question and at the reveal, and must not squeeze the answer. */
  .option .who-picked {
    position: absolute;
    top: 0;
    right: 0.7rem;
    translate: 0 -50%;
    gap: 0;
  }
  .option .who-picked > span + span {
    margin-left: -6px;
  }
  .tile .who-picked {
    position: absolute;
    bottom: 8px;
    right: 8px;
  }
  .minus {
    margin-left: 0.6em;
    font-family: var(--font-display);
    font-size: 0.9rem;
    color: #ff9c86;
  }
  .spectate.out {
    color: #ff9c86;
    font-style: italic;
  }
  .spectate {
    margin: 0;
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
      flex: none;
      height: 230px;
      min-height: 0;
    }
    .options {
      grid-auto-rows: auto;
    }
    .topline {
      flex-wrap: wrap;
      row-gap: 0.4rem;
      min-height: 0;
      margin-bottom: 0.8rem;
    }
    .task {
      order: 3;
      flex-basis: 100%;
      font-size: 0.95rem;
    }
    .footer {
      margin-top: 1rem;
    }
    .chip {
      margin-right: auto;
    }
    .stamp.in-head {
      top: -10px;
      right: 6px;
      translate: none;
      font-size: 0.72rem;
    }
    .option {
      padding: 0.75rem 2.3rem 0.75rem 0.9rem;
    }
    .option .mark {
      right: 0.7rem;
    }
    .option .who-picked {
      right: 0.5rem;
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
