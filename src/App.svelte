<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { session } from './lib/session.svelte';
  import { getVolume, isMuted, setMuted, setVolume, sfx } from './lib/sound';
  import { fxAvailable, fxUserOn, onFxChange, setFxOn, shakeTarget } from './lib/fx/core';
  import { IMPRINT_URL, PRIVACY_URL } from './lib/site';
  import { dialogBackdrop } from './lib/behindDialog';
  import Background from './components/Background.svelte';
  import FxLayer from './components/FxLayer.svelte';
  import Toasts from './components/Toasts.svelte';
  import Home from './components/Home.svelte';
  import Lobby from './components/Lobby.svelte';
  import Game from './components/Game.svelte';
  import GameOver from './components/GameOver.svelte';
  import { closeCodex, codexRoute } from './lib/codexRoute.svelte';

  let muted = $state(isMuted());
  let volume = $state(getVolume());
  const silent = $derived(muted || volume === 0);
  let confirmLeave = $state(false);
  let fxOn = $state(fxUserOn());
  let fxCan = $state(fxAvailable());
  let headerHeight = $state(0);
  let shell: HTMLElement;

  /**
   * Dev only: when a shake starts, warns about anything position: fixed in the
   * shell. The shake's translate makes the shell its containing block, so it
   * would shake along and be placed against the scrolled shell, not the viewport.
   */
  function warnFixedInShell(shell: HTMLElement) {
    const warned = new WeakSet<Element>();
    let moving = false;
    const watch = new MutationObserver(() => {
      const was = moving;
      moving = !!shell.style.translate;
      if (!moving || was) return;
      for (const el of shell.querySelectorAll('*')) {
        if (warned.has(el) || getComputedStyle(el).position !== 'fixed') continue;
        warned.add(el);
        console.warn('A fixed element inside .shell moves with camera shake; render it with use:portal (lib/portal.ts).', el);
      }
    });
    watch.observe(shell, { attributes: true, attributeFilter: ['style'] });
    return () => watch.disconnect();
  }

  onMount(() => {
    session.resume();
    // Camera shake moves the UI (#app clips it, so it can't add scrolling).
    // Anything fixed to the viewport must live outside .shell: App's own
    // overlays sit after it, and the screens' go to <body> with use:portal.
    const undo = shakeTarget(shell, 1);
    const unwatch = import.meta.env.DEV ? warnFixedInShell(shell) : () => {};
    const off = onFxChange((on) => {
      fxOn = on;
      fxCan = fxAvailable();
    });
    fxCan = fxAvailable();
    return () => {
      undo();
      unwatch();
      off();
    };
  });

  function toggleFx() {
    setFxOn(!fxOn);
  }

  const gs = $derived(session.state);
  // The codex opens from the start page only: in a room it would be a cheat sheet.
  const codexAllowed = $derived(!session.mode || !gs);
  const screen = $derived(
    codexRoute.open && codexAllowed
      ? 'codex'
      : !session.mode || !gs
        ? 'home'
        : gs.phase === 'lobby'
          ? 'lobby'
          : gs.phase === 'over'
            ? 'over'
            : 'game',
  );
  // A room was joined or resumed meanwhile: back to it.
  $effect(() => {
    if (codexRoute.open && !codexAllowed) closeCodex();
  });
  const codex = $derived(screen === 'codex');

  /** How long the outgoing screen takes to fade (the .screen transition below). */
  const SCREEN_OUT_MS = 150;
  /**
   * The header comes and goes with the start page, but only once the
   * outgoing screen has faded: in the meantime it would push that screen
   * down (or let it jump up) by its own height.
   */
  let headerOn = $state(untrack(() => screen !== 'home'));
  $effect(() => {
    const want = screen !== 'home';
    if (want === untrack(() => headerOn)) return;
    const t = setTimeout(() => (headerOn = want), SCREEN_OUT_MS);
    return () => clearTimeout(t);
  });

  // The codex page is its own chunk: fetch it ahead, so opening it doesn't wait.
  let codexPage: Promise<typeof import('./components/Codex.svelte')> | null = null;
  const loadCodexPage = () => (codexPage ??= import('./components/Codex.svelte'));
  onMount(() => {
    const t = setTimeout(loadCodexPage, 2000);
    return () => clearTimeout(t);
  });

  // Each screen starts at the top (a guest who scrolled down to the join
  // form shouldn't land halfway down the lobby).
  $effect(() => {
    void screen;
    window.scrollTo({ top: 0 });
  });

  function toggleMute() {
    if (silent) {
      // Unmuting with the slider all the way down would still be silent.
      if (volume === 0) setVolume((volume = 0.5));
      setMuted((muted = false));
      sfx('click');
    } else {
      setMuted((muted = true));
    }
  }

  function slide(e: Event) {
    setVolume((volume = (e.currentTarget as HTMLInputElement).valueAsNumber));
    if (muted && volume > 0) setMuted((muted = false));
  }

  function leave() {
    confirmLeave = false;
    session.leave();
  }
</script>

<Background />

<div class="shell" data-behind-dialog bind:this={shell}>
  {#if headerOn}
    <header in:fade={{ duration: 300 }} bind:offsetHeight={headerHeight}>
      <button class="brand" onclick={() => (codex ? closeCodex() : (confirmLeave = true))} title={codex ? 'Back to the start' : 'Leave game'}>
        <svg class="brand-mark" viewBox="20 0 400 391" aria-hidden="true"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" fill="currentColor" /></svg>
        <span>PoE2.Quest</span>
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
        {:else if session.code && screen !== 'lobby'}
          <!-- The lobby shows the code in big letters. -->
          <span>Room <b>{session.hideCode ? '••••••' : session.code}</b></span>
        {/if}
      </div>
      <div class="tools">
        <div class="volume">
          <button class="icon-btn" data-sfx="none" onclick={toggleMute} title={silent ? 'Unmute' : 'Mute'} aria-label="Toggle sound">
            {#if silent}
              <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>
            {:else}
              <svg viewBox="0 0 24 24"
                ><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" />{#if volume > 0.5}<path
                    d="M19 6a8.5 8.5 0 0 1 0 12"
                  />{/if}</svg
              >
            {/if}
          </button>
          <!-- Desktop only: shows while the pointer is over the button. Phones keep the plain mute toggle. -->
          <div class="volume-pop">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              oninput={slide}
              onchange={() => sfx('click')}
              aria-label="Volume"
              style:--fill="{(muted ? 0 : volume) * 100}%"
            />
          </div>
        </div>
        {#if fxCan}
          <button
            class="icon-btn"
            class:off={!fxOn}
            onclick={toggleFx}
            title={fxOn ? 'Turn visual effects off' : 'Turn visual effects on'}
            aria-label="Toggle visual effects"
            aria-pressed={fxOn}
          >
            <svg viewBox="0 0 24 24"
              ><path d="M10.5 3.25c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z" /><path
                d="M17 15.75c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"
              />{#if !fxOn}<path d="M4 20 20 4" />{/if}</svg
            >
          </button>
        {/if}
        {#if codex}
          <button class="icon-btn" onclick={closeCodex} title="Close the codex" aria-label="Close the codex">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        {:else}
          <button class="icon-btn" onclick={() => (confirmLeave = true)} title="Leave" aria-label="Leave game">
            <svg viewBox="0 0 24 24"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /></svg>
          </button>
        {/if}
      </div>
    </header>
  {/if}

  <main>
    {#key screen}
      <div class="screen" in:fade={{ duration: 350, delay: SCREEN_OUT_MS }} out:fade={{ duration: SCREEN_OUT_MS }}>
        {#if screen === 'home'}
          <Home />
        {:else if screen === 'lobby'}
          <Lobby />
        {:else if screen === 'game'}
          <Game />
        {:else if screen === 'codex'}
          <!-- Loaded when first opened: most visits never do. -->
          {#await loadCodexPage() then { default: Codex }}
            <Codex />
          {/await}
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

<Toasts headerHeight={headerOn ? headerHeight : 0} />

<FxLayer />

{#if confirmLeave}
  <div class="modal-backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={() => (confirmLeave = false)}
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
    /* Room at the end for a bar fixed to the bottom of the screen (lib/layout.ts). */
    padding-bottom: var(--dock, 0px);
  }

  header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    position: relative;
    padding: 0.8rem 1.25rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
  }
  /* A gold hairline, brightest in the middle, over the header's lower edge. */
  header::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
    pointer-events: none;
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
    text-shadow: 0 0 14px rgba(201, 164, 92, 0.25);
    transition:
      color 0.25s,
      text-shadow 0.25s;
  }
  .brand:hover {
    color: var(--gold-hi);
    text-shadow: 0 0 16px rgba(241, 217, 155, 0.55);
  }
  .brand-mark {
    color: var(--unique-hi);
    width: 0.8rem;
    height: 0.72rem;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
    animation: kindle 3.2s ease-in-out infinite;
  }
  @keyframes kindle {
    50% {
      filter: drop-shadow(0 0 10px rgba(255, 150, 70, 0.95)) brightness(1.2);
    }
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
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    transition:
      color 0.2s,
      border-color 0.2s,
      box-shadow 0.25s,
      transform 0.2s var(--ease-out);
  }
  .icon-btn:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.3);
    transform: translateY(-1px);
  }
  .icon-btn:active {
    transform: scale(0.94);
  }
  .volume {
    position: relative;
  }
  .volume-pop {
    display: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .volume-pop {
      display: block;
      position: absolute;
      top: 100%;
      left: 50%;
      z-index: 20;
      /* The padding bridges the gap to the button, so the pointer can travel down without it closing. */
      padding-top: 0.4rem;
      translate: -50% -4px;
      opacity: 0;
      visibility: hidden;
      transition:
        opacity 0.2s,
        translate 0.2s var(--ease-out),
        visibility 0s 0.2s;
    }
    .volume:hover .volume-pop,
    .volume:focus-within .volume-pop {
      opacity: 1;
      visibility: visible;
      translate: -50% 0;
      transition:
        opacity 0.2s,
        translate 0.2s var(--ease-out);
    }
  }
  .volume-pop input {
    display: block;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 38px;
    height: 120px;
    margin: 0;
    padding: 0.8rem 0;
    appearance: none;
    background: rgba(10, 9, 8, 0.9);
    backdrop-filter: blur(4px);
    border: 1px solid var(--gold-lo);
    border-radius: 19px;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.08),
      0 0 16px rgba(201, 164, 92, 0.2);
    cursor: pointer;
  }
  .volume-pop input::-webkit-slider-runnable-track {
    width: 4px;
    border-radius: 2px;
    background: linear-gradient(0deg, var(--gold) var(--fill), var(--line) var(--fill));
  }
  .volume-pop input::-moz-range-track {
    width: 4px;
    border-radius: 2px;
    background: var(--line);
  }
  .volume-pop input::-moz-range-progress {
    width: 4px;
    border-radius: 2px;
    background: var(--gold);
  }
  .volume-pop input::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    margin-left: -4px;
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }
  .volume-pop input::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 0;
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }
  .icon-btn.off {
    opacity: 0.6;
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
  .modal-backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer (z-index 95), so the dialog's buttons get their
       effects; the page behind dims itself (lib/behindDialog.ts). */
    z-index: 94;
    display: grid;
    place-items: center;
    padding: 1rem;
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
      padding: 0.4rem 0.8rem;
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

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
