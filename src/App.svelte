<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { session } from './lib/session.svelte';
  import { isMuted, setMuted, sfx } from './lib/sound';
  import { IMPRINT_URL, PRIVACY_URL } from './lib/site';
  import Background from './components/Background.svelte';
  import Home from './components/Home.svelte';
  import Lobby from './components/Lobby.svelte';
  import Game from './components/Game.svelte';
  import GameOver from './components/GameOver.svelte';

  let muted = $state(isMuted());
  let confirmLeave = $state(false);

  onMount(() => session.resume());

  const gs = $derived(session.state);
  const screen = $derived(
    !session.mode || !gs ? 'home' : gs.phase === 'lobby' ? 'lobby' : gs.phase === 'over' ? 'over' : 'game',
  );

  // Each screen starts at the top (a guest who scrolled down to the join
  // form shouldn't land halfway down the lobby).
  $effect(() => {
    void screen;
    window.scrollTo({ top: 0 });
  });

  function toggleMute() {
    muted = !muted;
    setMuted(muted);
    if (!muted) sfx('click');
  }

  function leave() {
    confirmLeave = false;
    session.leave();
  }
</script>

<Background />

<div class="shell">
  {#if screen !== 'home'}
    <header in:fade={{ duration: 300 }}>
      <button class="brand" onclick={() => (confirmLeave = true)} title="Leave game">
        <svg class="brand-mark" viewBox="20 0 400 391" aria-hidden="true"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" fill="currentColor" /></svg>
        <span>Poe2.Quest</span>
      </button>
      <div class="meta">
        {#if gs && screen === 'game'}
          {#if session.code && !session.hideCode}
            <span>Room <b>{session.code}</b></span>
            <span class="dot">•</span>
          {/if}
          {#if session.spectating}
            <span class="spectating" title="You joined mid-game. You'll play in the next game.">Spectating</span>
            <span class="dot">•</span>
          {/if}
          {#if gs.deathmatch}
            <span class="deathmatch">⚔ Deathmatch</span>
            <span class="dot">•</span>
            <span>Round {gs.deathmatch.round}</span>
          {:else}
            <span>{gs.settings.mode === 'race' ? 'Question' : 'Round'} {gs.round}</span>
            <span class="dot">•</span>
            <span>First to <b>{gs.settings.targetScore}</b></span>
          {/if}
        {:else if session.mode === 'local'}
          <span>Hot-seat</span>
        {:else if session.code}
          <span>Room <b>{session.hideCode ? '••••••' : session.code}</b></span>
        {/if}
      </div>
      <div class="tools">
        <button class="icon-btn" onclick={toggleMute} title={muted ? 'Unmute' : 'Mute'} aria-label="Toggle sound">
          {#if muted}
            <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>
          {:else}
            <svg viewBox="0 0 24 24"
              ><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg
            >
          {/if}
        </button>
        <button class="icon-btn" onclick={() => (confirmLeave = true)} title="Leave" aria-label="Leave game">
          <svg viewBox="0 0 24 24"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /></svg>
        </button>
      </div>
    </header>
  {/if}

  <main>
    {#key screen}
      <div class="screen" in:fade={{ duration: 350, delay: 150 }} out:fade={{ duration: 150 }}>
        {#if screen === 'home'}
          <Home />
        {:else if screen === 'lobby'}
          <Lobby />
        {:else if screen === 'game'}
          <Game />
        {:else}
          <GameOver />
        {/if}
      </div>
    {/key}
  </main>

  {#if screen !== 'home'}
    <nav class="legal">
      <a href={IMPRINT_URL} target="_blank" rel="noopener">Impressum</a>
      <span aria-hidden="true">·</span>
      <a href={PRIVACY_URL} target="_blank" rel="noopener">Datenschutz</a>
    </nav>
  {/if}
</div>

{#if session.mode === 'client' && session.status === 'lost'}
  <div class="banner" transition:fly={{ y: -40, duration: 300 }}>
    {#if session.gaveUp}
      Can't reach the host. The room may have closed.
    {:else}
      <span class="spinner"></span>
      Connection to the host lost; reconnecting…
    {/if}
    <button class="btn small" onclick={() => session.reconnect()}>Retry</button>
    <button class="btn small ghost" onclick={() => session.leave()}>Leave</button>
  </div>
{/if}

{#if session.toast}
  {#key session.toast}
    <div class="toast" in:fly={{ y: 30, duration: 300 }} out:fade={{ duration: 200 }}>{session.toast}</div>
  {/key}
{/if}

{#if confirmLeave}
  <div class="modal-backdrop" transition:fade={{ duration: 150 }} onclick={() => (confirmLeave = false)}
    onkeydown={(e) => e.key === 'Escape' && (confirmLeave = false)}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal panel"
      transition:fly={{ y: 20, duration: 250 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <h3>Leave the game?</h3>
      <p class="muted">
        {#if session.mode === 'host'}
          You are the host. Leaving closes the room for everyone.
        {:else if session.mode === 'local'}
          The current game will be lost.
        {:else}
          You can rejoin with the same code while the game is running.
        {/if}
      </p>
      <div class="modal-actions">
        <button class="btn ghost" onclick={() => (confirmLeave = false)}>Stay</button>
        <button class="btn primary" onclick={leave}>Leave</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .shell {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.8rem 1.25rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.25);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
  }

  .brand {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-title);
    font-weight: 900;
    letter-spacing: 0.14em;
    font-size: 0.9rem;
    color: var(--gold);
    padding: 0.25rem 0;
  }
  .brand-mark {
    color: var(--unique-hi);
    width: 0.95rem;
    height: 0.85rem;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
  }

  .meta {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .meta b {
    color: var(--gold-hi);
  }
  .dot {
    color: var(--gold-lo);
  }
  .spectating {
    color: var(--gold-hi);
  }
  .deathmatch {
    color: #ff7a5c;
    font-weight: 700;
    text-shadow: 0 0 12px rgba(224, 85, 63, 0.6);
    animation: pulse 1.6s ease-in-out infinite;
  }

  .tools {
    justify-self: end;
    display: flex;
    gap: 0.4rem;
  }
  .icon-btn {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 50%;
    cursor: pointer;
    color: var(--muted);
    transition:
      color 0.2s,
      border-color 0.2s;
  }
  .icon-btn:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .icon-btn svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  main {
    flex: 1;
    display: grid;
  }
  .screen {
    grid-area: 1 / 1;
    min-width: 0;
  }

  .legal {
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem 1rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .legal a {
    color: var(--muted);
    text-decoration: none;
  }
  .legal a:hover {
    color: var(--gold-hi);
  }
  .banner {
    position: fixed;
    top: 12px;
    left: 50%;
    translate: -50% 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem 0.8rem 0.6rem 1.1rem;
    background: #2a1410;
    border: 1px solid #7a3326;
    border-radius: 4px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    font-size: 0.95rem;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--gold-hi);
    animation: spin 0.8s linear infinite;
  }

  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    translate: -50% 0;
    z-index: 60;
    padding: 0.6rem 1.2rem;
    background: rgba(18, 14, 10, 0.95);
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    font-size: 1rem;
    color: var(--gold-hi);
    white-space: nowrap;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(3px);
  }
  .modal {
    width: min(420px, 100%);
    padding: 1.6rem;
    text-align: center;
  }
  .modal h3 {
    color: var(--gold-hi);
    font-size: 1.2rem;
  }
  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1.2rem;
  }

  @media (max-width: 640px) {
    header {
      grid-template-columns: auto 1fr auto;
      gap: 0.5rem;
      padding: 0.6rem 0.8rem;
    }
    .brand span:last-child {
      display: none;
    }
    .meta {
      justify-content: center;
      flex-wrap: wrap;
      font-size: 0.66rem;
      gap: 0.1rem 0.35rem;
    }
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
