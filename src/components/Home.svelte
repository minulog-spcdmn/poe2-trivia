<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { NAME_TOO_SHORT, nameHeld, nameTooShort, unlockHeldName } from '../lib/names';
  import { toasts } from '../lib/toasts.svelte';
  import { engine, session, savedName, saveName, CODE_LENGTH } from '../lib/session.svelte';
  import { shuffle } from '../lib/game';
  import { itemImage } from '../lib/ui';
  import OpenRooms from './OpenRooms.svelte';
  import { CREATOR, DONATE_URL, IMPRINT_URL, PRIVACY_URL } from '../lib/site';
  import { backdropShadow } from '../lib/backdropShadow';
  import { backdropDropShadow } from '../lib/backdropDropShadow';
  import { connecting as portalFx, refuse, titleGlints } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';
  import { setHomeScene } from '../lib/lights';
  import { openCodex } from '../lib/codexRoute.svelte';
  import { BETA } from '../lib/channel';

  /** Keeps a room code's letters and digits, uppercased, up to its length. */
  const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

  const params = new URLSearchParams(location.search);
  const invite = cleanCode(params.get('room') ?? '');
  if (params.has('owner')) {
    void unlockHeldName(params.get('owner') ?? '');
    // Out of the address bar and history either way; other params stay.
    const url = new URL(location.href);
    url.searchParams.delete('owner');
    history.replaceState(history.state, '', url);
  }

  let name = $state(savedName());
  let code = $state(invite);
  let nameError = $state(false);

  const total = engine.items.length;
  /** Null until the codex is read. */
  let discovered = $state<number | null>(null);
  void import('../lib/codex').then(({ loadCodex }) => {
    const seen = loadCodex().items;
    discovered = engine.items.filter((it) => seen[it.id]).length;
  });
  const showcase = shuffle(engine.items, Math.random).slice(0, 7);

  function needName() {
    const n = name.trim();
    if (!n || nameTooShort(n) || nameHeld(n)) {
      if (n && nameTooShort(n)) toasts.show(NAME_TOO_SHORT, 'error');
      nameError = true;
      const field = document.getElementById('name');
      if (field) refuse(field);
      setTimeout(() => (nameError = false), 600);
      document.getElementById('name')?.focus();
      return null;
    }
    saveName(n);
    return n;
  }

  function host() {
    const n = needName();
    if (!n) return;
    session.host(n);
  }

  function join(e?: Event) {
    e?.preventDefault();
    const n = needName();
    if (!n) return;
    if (code.length < CODE_LENGTH) {
      document.getElementById('code')?.focus();
      return;
    }
    if (invite) history.replaceState(null, '', location.pathname);
    session.join(code, n);
  }

  function joinListed(roomCode: string) {
    code = roomCode;
    join();
  }

  /** Enter in the name field: join if a room code has been entered (or is still missing letters), otherwise open a room. */
  function enterName(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing || connecting) return;
    if (code) join();
    else host();
  }

  /**
   * A paste is cleaned before the field's length limit applies, so spaces or
   * line breaks copied along with a code (e.g. from the lobby's big letters)
   * don't use up its six places. A pasted invite link gives its room code.
   */
  function pasteCode(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text');
    if (text == null) return;
    e.preventDefault();
    const field = e.currentTarget as HTMLInputElement;
    const linked = /[?&]room=([^&#\s]+)/.exec(text)?.[1];
    if (linked) code = cleanCode(linked);
    else code = cleanCode(code.slice(0, field.selectionStart ?? code.length) + text + code.slice(field.selectionEnd ?? code.length));
  }

  function local() {
    session.startLocal();
  }

  const connecting = $derived(session.status === 'connecting');

  /**
   * Svelte action: the title's light. The backdrop throws god rays from above
   * and a royal glow behind it (lib/lights.ts), and it glints now and then.
   */
  function glinting(node: HTMLElement) {
    let h: Handle | null = null;
    setHomeScene(node);
    // Wait for the title's entrance to finish.
    const t = setTimeout(() => (h = titleGlints(node)), 1200);
    return {
      destroy() {
        clearTimeout(t);
        h?.stop();
        setHomeScene(null);
      },
    };
  }

  /** Svelte action: a portal swirls on the rune while connecting. */
  function portalOn(node: HTMLElement) {
    const h = portalFx(node);
    return { destroy: () => h.stop(0.3) };
  }
</script>

<div class="home">
  <!-- Out of the way of starting a game, where the in-game header keeps its tools. -->
  <button class="codex-entry" onclick={openCodex} disabled={connecting} in:fade={{ duration: 600, delay: 700 }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.8v13.4c3.6-.2 6.2.4 8 1.7 1.8-1.3 4.4-1.9 8-1.7V4.8c-3.6-.2-6.2.4-8 1.7zM12 6.5v13.4" /></svg
    >
    <span class="codex-text">
      <span class="codex-label">Codex</span>
      {#if discovered}<span class="codex-count" in:fade={{ duration: 300 }}>{discovered} / {total}</span>{/if}
    </span>
  </button>

  <div class="hero">
    <div class="showcase" aria-hidden="true">
      {#each showcase as it, i (it.id)}
        <img
          use:backdropDropShadow
          src={itemImage(it.id)}
          alt=""
          style:--i={i}
          style:--x="{(i - 3) * 15}vw"
          style:--r="{(i - 3) * 6}deg"
        />
      {/each}
    </div>
    {#if BETA}
      <p class="beta" in:fade={{ duration: 600, delay: 100 }}>Beta</p>
    {/if}
    <p class="kicker" in:fly={{ y: -10, duration: 600, delay: 100 }}>Unique Item Trivia</p>
    <h1 use:glinting in:fly={{ y: 20, duration: 800, delay: 200 }}>
      <span class="gold" use:backdropDropShadow><span class="line"></span>PoE2.Quest<span class="line"></span></span>
      <span class="gleam" aria-hidden="true"><span class="line"></span>PoE2.Quest<span class="line"></span></span>
    </h1>
    <p class="tagline" in:fade={{ duration: 800, delay: 500 }}>
      Name the unique. {total} uniques and lineage gems. Can you tell them apart?
    </p>
  </div>

  <div class="card panel" use:backdropShadow={{ fill: 'linear' }} in:fly={{ y: 30, duration: 700, delay: 400 }}>
    <label class="label" for="name">Your name, Exile</label>
    <input
      id="name"
      class="field"
      class:shake={nameError}
      bind:value={name}
      maxlength="20"
      placeholder="e.g. Doryani"
      autocomplete="nickname"
      spellcheck="false"
      onkeydown={enterName}
    />

    <div class="modes">
      <section class="mode">
        <h2>Host a game</h2>
        <p class="muted">Open a room and share the code with your party, or play alone.</p>
        <button class="btn primary" onclick={host} disabled={connecting}>Create room</button>
      </section>

      <section class="mode">
        <h2>Join a game</h2>
        <p class="muted">Enter the code your host shared to join their room.</p>
        <form onsubmit={join}>
          <input
            id="code"
            class="field code"
            bind:value={code}
            oninput={() => (code = cleanCode(code))}
            onpaste={pasteCode}
            placeholder="CODE"
            maxlength={CODE_LENGTH}
            autocomplete="off"
            spellcheck="false"
            aria-label="Room code"
          />
          <button class="btn" class:primary={!!invite} type="submit" disabled={connecting || code.length < CODE_LENGTH}>
            Join
          </button>
        </form>
      </section>
    </div>

    <div class="or"><span>or</span></div>
    <button class="btn ghost wide" onclick={local} disabled={connecting}>
      Play hot-seat on this device
    </button>

    {#if connecting}
      <div class="connecting" transition:fade={{ duration: 200 }}>
        <span class="rune" use:portalOn></span>
        <span>{session.mode === 'host' ? 'Opening a portal…' : `Travelling to room ${session.code}…`}</span>
        <button class="btn ghost small" onclick={() => session.leave()}>Cancel</button>
      </div>
    {/if}
  </div>

  <div class="listing" in:fly={{ y: 30, duration: 700, delay: 550 }}>
    <OpenRooms onJoin={joinListed} disabled={connecting} />
  </div>

  <footer class="muted">
    <p class="credit">
      Made by <a class="maker" href={DONATE_URL} target="_blank" rel="noopener noreferrer" title="Support {CREATOR}">{CREATOR}</a>
    </p>
    <a class="support" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg
      >
      Support the project
    </a>
    <p class="support-note">Optional tips help pay for the domain and development. Everything stays free.</p>
    Item data &amp; art from <a href="https://poe2db.tw/us/Unique_item" target="_blank" rel="noreferrer">poe2db.tw</a>.
    Path of Exile is a trademark of Grinding Gear Games. Unofficial fan project, not affiliated with or endorsed by Grinding Gear Games.
    <nav class="legal-links">
      <a href={IMPRINT_URL}>Impressum</a>
      <span aria-hidden="true">·</span>
      <a href={PRIVACY_URL}>Datenschutz / Privacy</a>
    </nav>
  </footer>
</div>

<style>
  .codex-entry {
    position: absolute;
    top: 1rem;
    right: 1.25rem;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 38px;
    padding: 0 1rem 0 0.4rem;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 19px;
    cursor: pointer;
    color: var(--muted);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    transition:
      color 0.2s,
      border-color 0.2s,
      box-shadow 0.25s,
      transform 0.2s var(--ease-out);
  }
  .codex-entry:hover:not(:disabled) {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.3);
    transform: translateY(-1px);
  }
  .codex-entry:active:not(:disabled) {
    transform: scale(0.96);
  }
  .codex-entry:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .codex-entry svg {
    width: 28px;
    height: 28px;
    padding: 5px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(175, 96, 37, 0.35), transparent 70%);
    fill: none;
    stroke: var(--gold);
    stroke-width: 1.5;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 4px rgba(224, 138, 68, 0.5));
  }
  .codex-text {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
  }
  .codex-label {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .codex-count {
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    color: var(--gold);
  }

  .home {
    position: relative;
    /* The floating showcase items reach past the screen edges; never scroll sideways for them. */
    overflow-x: clip;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2.5rem 1rem 1.5rem;
    gap: 2rem;
  }

  .hero {
    position: relative;
    text-align: center;
    padding: 2rem 0 0.5rem;
  }
  .showcase {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .showcase img {
    position: absolute;
    width: 110px;
    height: 110px;
    object-fit: contain;
    left: -55px;
    top: -75px;
    opacity: 0;
    /* Drawn by the WebGL backdrop when it can (see lib/backdropDropShadow.ts). */
    --drop-shadow: drop-shadow(0 0 20px rgba(0, 0, 0, 0.9));
    filter: blur(0.1px) saturate(0.7) var(--drop-shadow-paint, var(--drop-shadow));
    transform: translate(var(--x), 0) rotate(var(--r));
    animation:
      appear 1.4s var(--ease-out) forwards,
      float 7s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.12s), calc(var(--i) * -1.1s);
  }
  @keyframes appear {
    to {
      opacity: 0.22;
    }
  }
  @keyframes float {
    50% {
      translate: 0 -14px;
    }
  }

  /* Marks the beta build (poe2.quest/beta/) so testers know where they are. */
  .beta {
    display: inline-block;
    margin: 0 0 0.8rem;
    padding: 0.2rem 0.6rem 0.15rem 0.85rem;
    border: 1px solid rgba(224, 138, 68, 0.5);
    border-radius: 3px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .kicker {
    position: relative;
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.5em;
    padding-left: 0.5em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  h1 {
    position: relative;
    /* The gold and the gleam are two copies of the title, stacked. */
    display: grid;
    font-family: var(--font-title);
    font-size: clamp(2.9rem, 9vw, 5.6rem);
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.06em;
    margin-bottom: -0.3em;
  }
  h1 > span {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    justify-content: center;
    /* The text is painted by its background, which ends at the padding box,
       so give the Q's tail room below the line box (the h1's negative margin
       keeps everything else in place). */
    padding-bottom: 0.3em;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  /* The gold and its shadow, painted once. The gleam is a separate copy: on
     this one, every frame of the sweep would blur the shadow again. (Unlike
     the victory headline's, this shadow can't move to a text-shadow: its glow
     is cast by the text and its dark shadow together.) */
  .gold {
    background-image: linear-gradient(180deg, #fff1c9 0.1em, #d7b068 0.5em, #8b6526 0.95em);
    /* Drawn by the WebGL backdrop when it can (see lib/backdropDropShadow.ts). */
    --drop-shadow: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 34px rgba(224, 170, 90, 0.36));
    filter: var(--drop-shadow-paint, var(--drop-shadow));
  }
  /* A band of light sweeps across the gold every few seconds, on a layer of
     its own so its repaints leave the gold and its shadow alone. */
  .gleam {
    will-change: transform;
    background-image: linear-gradient(100deg, transparent 42%, rgba(255, 250, 232, 0.75) 50%, transparent 58%);
    background-repeat: no-repeat;
    background-size: 250% 100%;
    background-position: 160% 0;
    animation: gleam 7s ease-in-out 1.6s infinite;
  }
  .gleam .line {
    visibility: hidden;
  }
  @keyframes gleam {
    0% {
      background-position: 160% 0;
    }
    22%,
    100% {
      background-position: -60% 0;
    }
  }
  .line {
    display: block;
    width: clamp(30px, 8vw, 90px);
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold));
  }
  .line:last-child {
    background: linear-gradient(270deg, transparent, var(--gold));
  }
  .tagline {
    position: relative;
    margin: 1rem 0 0;
    font-style: italic;
    font-size: 1.15rem;
    color: #b8ab95;
  }

  .card {
    width: min(620px, 100%);
    padding: 1.8rem;
  }

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1.4rem;
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.04);
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .mode:hover,
  .mode:focus-within {
    border-color: rgba(125, 99, 51, 0.8);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.06),
      inset 0 0 24px rgba(201, 164, 92, 0.06);
  }
  .mode h2 {
    font-size: 1.06rem;
    color: var(--gold-hi);
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.2);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .mode p {
    margin: -0.3rem 0 0.5rem;
    font-size: 0.98rem;
    flex: 1;
  }
  .mode form {
    display: flex;
    gap: 0.5rem;
    margin-top: auto;
  }
  .code {
    font-family: var(--font-cinzel);
    font-weight: 700;
    letter-spacing: 0.35em;
    text-align: center;
    text-transform: uppercase;
    min-width: 0;
    /* Stretched to the Join button's height, so this row matches Create room. */
    padding-block: 0;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin: 1.1rem 0 0.8rem;
    color: var(--muted);
    font-style: italic;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .wide {
    width: 100%;
  }

  .connecting {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: rgba(12, 10, 8, 0.92);
    border-radius: var(--radius);
    font-family: var(--font-display);
    letter-spacing: 0.08em;
    color: var(--gold-hi);
  }
  .rune {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    border-bottom-color: var(--unique-hi);
    animation: spin 1.1s linear infinite;
    box-shadow: 0 0 25px rgba(201, 164, 92, 0.2);
  }

  .shake {
    animation: shake 0.45s;
    border-color: var(--bad);
  }

  .listing {
    width: min(620px, 100%);
    display: flex;
    justify-content: center;
    margin-top: -0.8rem;
  }
  .credit {
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .maker {
    color: var(--gold-hi);
    letter-spacing: 0.08em;
    text-transform: none;
    font-weight: 700;
    text-decoration: none;
    border-bottom: 1px dotted var(--gold-lo);
    transition: color 0.2s, border-color 0.2s;
  }
  .maker:hover {
    color: #fff1cf;
    border-bottom-color: var(--gold);
  }
  .support {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    padding: 0.45em 1em;
    margin-bottom: 0.4rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.3);
    transition: all 0.2s;
  }
  .support:hover {
    color: #ffd7c2;
    border-color: #8c3a2c;
    background: rgba(140, 58, 44, 0.2);
  }
  .support svg {
    width: 13px;
    height: 13px;
    fill: #c0463c;
  }
  .support-note {
    margin: 0 0 0.9rem;
    font-size: 0.8rem;
    font-style: italic;
  }
  footer {
    font-size: 0.85rem;
    text-align: center;
    max-width: 520px;
  }
  footer a {
    color: var(--gold);
  }
  .legal-links {
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    margin-top: 0.6rem;
  }
  .legal-links a {
    color: var(--muted);
  }
  .legal-links a:hover {
    color: var(--gold-hi);
  }

  @media (max-width: 560px) {
    .modes {
      grid-template-columns: 1fr;
    }
    .card {
      padding: 1.3rem;
    }
    .showcase img {
      width: 80px;
      height: 80px;
    }
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  @keyframes shake {
    20%,
    60% {
      translate: -6px 0;
    }
    40%,
    80% {
      translate: 6px 0;
    }
  }
</style>
