<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Scoreboard from './Scoreboard.svelte';
  import ChooseCategory from './ChooseCategory.svelte';
  import QuestionView from './QuestionView.svelte';
  import Avatar from './Avatar.svelte';
  import { sfx } from '../lib/sound';

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const local = $derived(session.mode === 'local');


  const race = $derived(s.settings.mode === 'race');

  // Countdown to the automatic skip of a disconnected player's turn.
  let now = $state(Date.now());
  $effect(() => {
    if (!session.skipAt) return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });
  const skipIn = $derived(session.skipAt ? Math.max(0, Math.ceil((session.skipAt - now) / 1000)) : 0);

  // New turn or question: bring the scoreboard and banner back into view
  // (on phones the previous reveal is often scrolled down).
  let lastTurn = -1;
  $effect(() => {
    const t = s.turnCount;
    if (lastTurn !== -1 && t !== lastTurn) window.scrollTo({ top: 0, behavior: 'smooth' });
    lastTurn = t;
  });
  const dm = $derived(s.deathmatch);
  const nameOf = (id: string) => s.players.find((p) => p.id === id);

  // Play the deathmatch intro once per deathmatch, on every device.
  let introFor = $state<number | null>(null);
  let introTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const start = dm?.startedAt;
    if (start === undefined || start === introFor) return;
    introFor = start;
    showIntro = true;
    sfx('deathmatch');
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(() => (showIntro = false), 2600);
  });
  let showIntro = $state(false);
  const bannerTitle = $derived(
    race ? `Question ${s.turnCount + 1}` : mine && !local ? 'Your turn' : `${active.name}'s turn`,
  );
</script>

<div class="game">
  <Scoreboard />

  <!-- The outgoing and incoming turn share one grid cell while they cross-fade,
       instead of stacking (which briefly doubled the page height). -->
  <div class="turns">
    {#key s.turnCount}
      <div class="stage" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 180 }}>
        {#if dm}
          <div class="dm-strip" in:fly={{ y: -10, duration: 400 }}>
            <span class="dm-title">⚔ Deathmatch · round {dm.round}</span>
            <span class="dm-duelists">
              {#each dm.alive as id (id)}
                {@const p = nameOf(id)}
                {#if p}
                  <span class="duelist" class:done={id in dm.results} title={p.name}>
                    <Avatar name={p.name} hue={p.hue} size={24} />
                    {#if id in dm.results}<i class:ok={dm.results[id]}>{dm.results[id] ? '✓' : '✕'}</i>{/if}
                  </span>
                {/if}
              {/each}
            </span>
            <span class="dm-rule">
              {#if dm.eliminated.length}
                <b>{dm.eliminated.map((id) => nameOf(id)?.name).join(', ')} {dm.eliminated.length === 1 ? 'is' : 'are'} out.</b>
              {/if}
              Answer right to survive. Anyone who misses while another duelist scores is out.
            </span>
          </div>
        {/if}
        <div class="banner" class:dm={!!dm} style:--c={dm ? '#e0553f' : race ? 'var(--unique-hi)' : playerColor(active.hue)}>
          <span class="rule"></span>
          <h2>{bannerTitle}</h2>
          <span class="rule"></span>
        </div>

        {#if s.phase === 'choosing'}
          <ChooseCategory />
        {:else}
          <!-- A new question on the same turn (the host asked another) starts fresh. -->
          {#key s.question?.askedAt}
            <QuestionView />
          {/key}
        {/if}

        {#if session.isHost && !local && !race && !active.connected && s.phase !== 'reveal'}
          <div class="skip" transition:fade>
            <span class="muted">{active.name} is disconnected{skipIn ? ` — skipping in ${skipIn}s` : ''}.</span>
            <button class="btn small" onclick={() => session.dispatch({ type: 'skip' })}>Skip their turn</button>
          </div>
        {/if}
        {#if session.artMissing}
          <div class="skip" transition:fade>
            <span class="muted">The art for this question couldn't be loaded.</span>
            <button class="btn small" onclick={() => session.dispatch({ type: 'reask' })}>Ask another question</button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>

{#if showIntro && dm}
  <div class="dm-intro" transition:fade={{ duration: 400 }} aria-live="polite">
    <div class="dm-intro-inner" in:scale={{ start: 1.6, duration: 600, opacity: 0 }}>
      <p class="dm-kicker">It's a tie</p>
      <h1>Deathmatch</h1>
      <div class="dm-faces">
        {#each dm.entrants as id, i (id)}
          {@const p = nameOf(id)}
          {#if p}
            {#if i > 0}<span class="vs">vs</span>{/if}
            <span class="face" in:fly={{ y: 20, duration: 500, delay: 300 + i * 150 }}>
              <Avatar name={p.name} hue={p.hue} size={56} />
              <b>{p.name}</b>
            </span>
          {/if}
        {/each}
      </div>
      <p class="dm-sub">Sudden death. Random categories, harder questions.</p>
    </div>
  </div>
{/if}

<style>
  .game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1rem 2.5rem;
  }
  .turns {
    display: grid;
  }
  .stage {
    grid-area: 1 / 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    margin: 0.6rem 0 1.1rem;
  }
  .banner h2 {
    font-size: clamp(1.5rem, 4.5vw, 2.4rem);
    font-weight: 900;
    color: var(--gold-hi);
    text-shadow:
      0 0 24px color-mix(in srgb, var(--c), transparent 40%),
      0 3px 12px rgba(0, 0, 0, 0.9);
    animation: arrive 0.9s var(--ease-out) both;
    text-align: center;
    white-space: nowrap;
  }
  .rule {
    flex: 0 1 140px;
    min-width: 16px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--c));
    animation: grow 0.9s var(--ease-out) both;
  }
  .rule:last-child {
    background: linear-gradient(270deg, transparent, var(--c));
  }
  @keyframes arrive {
    from {
      opacity: 0;
      letter-spacing: 0.4em;
      filter: blur(6px);
    }
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .dm-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 1rem;
    margin: 0 auto 0.4rem;
    padding: 0.5rem 1rem;
    max-width: 760px;
    border: 1px solid rgba(224, 85, 63, 0.45);
    border-radius: 4px;
    background: linear-gradient(90deg, rgba(60, 12, 8, 0.2), rgba(90, 18, 10, 0.55), rgba(60, 12, 8, 0.2));
    box-shadow: 0 0 30px rgba(224, 85, 63, 0.12);
  }
  .dm-title {
    font-family: var(--font-display);
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 0.85rem;
    color: #ff9c86;
  }
  .dm-duelists {
    display: inline-flex;
    gap: 0.35rem;
  }
  .duelist {
    position: relative;
  }
  .duelist.done :global(.avatar) {
    opacity: 0.6;
  }
  .duelist i {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    font-style: normal;
    font-size: 0.6rem;
    font-weight: 700;
    color: #fff;
    background: var(--bad);
    border-radius: 50%;
  }
  .duelist i.ok {
    background: #3f8f43;
  }
  .dm-rule {
    flex-basis: 100%;
    text-align: center;
    font-size: 0.9rem;
    font-style: italic;
    color: #d9b3a8;
  }
  .dm-rule b {
    font-style: normal;
    color: #ff9c86;
    margin-right: 0.3em;
  }
  .banner.dm h2 {
    color: #ffd7c9;
  }

  .dm-intro {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: radial-gradient(ellipse at center, rgba(90, 14, 8, 0.85), rgba(0, 0, 0, 0.92) 70%);
    pointer-events: none;
  }
  .dm-intro-inner {
    text-align: center;
  }
  .dm-kicker {
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: 0.5em;
    padding-left: 0.5em;
    text-transform: uppercase;
    color: #ff9c86;
  }
  .dm-intro h1 {
    font-size: clamp(2.8rem, 12vw, 6rem);
    font-weight: 900;
    letter-spacing: 0.08em;
    background: linear-gradient(180deg, #ffe0d4 10%, #ff6a45 55%, #7a1408 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 30px rgba(224, 85, 63, 0.55));
  }
  .dm-faces {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.8rem 1.2rem;
    margin: 1.2rem 0 0.6rem;
  }
  .face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .face b {
    font-family: var(--font-display);
    color: #ffe0d4;
  }
  .vs {
    font-family: var(--font-display);
    font-style: italic;
    color: #ff7a5c;
  }
  .dm-sub {
    margin: 0;
    font-style: italic;
    color: #e6b8aa;
  }
  .skip {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: center;
    margin-top: 1.5rem;
  }
</style>
