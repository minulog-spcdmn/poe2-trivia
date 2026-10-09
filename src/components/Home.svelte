<script lang="ts">
  // The start page as a title screen: the way in on the left (a name, three
  // ways to play, a room code, the open rooms) and a question to try on the
  // right, drawn as the game draws it.
  import { onMount, tick } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { NAME_TOO_SHORT, nameHeld, nameTooShort, unlockHeldName } from '../lib/names';
  import { engine, session, savedName, saveName, CODE_LENGTH } from '../lib/session.svelte';
  import OpenRooms from './OpenRooms.svelte';
  import TryOne from './TryOne.svelte';
  import { CREATOR, DONATE_URL, IMPRINT_URL, PRIVACY_URL } from '../lib/site';
  import { connecting as portalFx, refuse, titleGlints } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';
  import { setHomeScene } from '../lib/lights';
  import { openCodex } from '../lib/codexRoute.svelte';
  import { backdropDropShadow } from '../lib/backdropDropShadow';
  import { DELVE_LINK_PARAM } from '../lib/delveShare';
  import { wantDelveBackdrop } from '../lib/backdrop';
  import { BETA } from '../lib/channel';
  import { bestOf, loadRecords } from '../lib/delveRecord';
  import { shownDepth } from '../lib/delve';
  import { zoneOf } from '../lib/codexStats';
  import { zones } from '../lib/backdrops';

  const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

  // ---- arriving: an invite link, the held name's key, a delver's shared link (as Home.svelte) ----
  const params = new URLSearchParams(location.search);
  const invite = cleanCode(params.get('room') ?? '');
  if (params.has('owner')) {
    void unlockHeldName(params.get('owner') ?? '');
    const url = new URL(location.href);
    url.searchParams.delete('owner');
    history.replaceState(history.state, '', url);
  }
  let name = $state(savedName());
  if (params.has(DELVE_LINK_PARAM)) {
    const url = new URL(location.href);
    url.searchParams.delete(DELVE_LINK_PARAM);
    history.replaceState(history.state, '', url);
    session.delveLink = true;
    wantDelveBackdrop();
    const known = savedName().trim();
    if (known && !nameTooShort(known) && !nameHeld(known))
      setTimeout(() => {
        if (session.status === 'idle' && !session.state) session.startDelve(known);
      });
  }
  let code = $state(invite);
  let shaking = $state(false);
  let nameMsg = $state('');

  // ---- what this browser knows: the codex count and the deepest run alone ----
  const total = engine.items.length;
  let discovered = $state<number | null>(null);
  void import('../lib/codex').then(({ loadCodex }) => {
    const seen = loadCodex().items;
    discovered = engine.items.filter((it) => seen[it.id]).length;
  });
  void Promise.all([import('../lib/achievements'), import('../lib/achievementToasts')])
    .then(([{ checkAchievements }, { announceAchievements, payOwed }]) => {
      const here = !session.state;
      announceAchievements(checkAchievements(engine.items), here ? 'start' : 'game');
      if (here) payOwed();
    })
    .catch((err) => console.warn('achievements', err));
  // The deepest run alone, shown under Delve in its zone's colour.
  const best = bestOf(loadRecords(), true);
  const bestZone = best ? zoneOf(best.depth) : null;
  const bestColor = bestZone ? `rgb(${(zones[bestZone.k]?.look.accent ?? [240, 172, 96]).join(' ')})` : '';

  // ---- actions ----
  function needName() {
    const n = name.trim();
    if (!n || nameTooShort(n) || nameHeld(n)) {
      // The held name is turned away without a word, as on the live page.
      nameMsg = !n ? 'Every exile needs a name.' : nameTooShort(n) ? NAME_TOO_SHORT : '';
      shaking = true;
      const field = document.getElementById('name');
      if (field) refuse(field);
      setTimeout(() => (shaking = false), 600);
      field?.focus();
      return null;
    }
    saveName(n);
    return n;
  }
  function host() {
    const n = needName();
    if (n) session.host(n);
  }
  function delve() {
    const n = needName();
    if (n) session.startDelve(n);
  }
  function hotSeat() {
    session.startLocal();
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
  /** Enter in the name field: join when a code is typed (or half typed), otherwise open a room. */
  function enterName(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing || connecting) return;
    if (code) join();
    else host();
  }
  /** A pasted code loses its spaces before the length limit applies; a pasted invite link gives its code. */
  function pasteCode(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text');
    if (text == null) return;
    e.preventDefault();
    const field = e.currentTarget as HTMLInputElement;
    const linked = /[?&]room=([^&#\s]+)/.exec(text)?.[1];
    if (linked) code = cleanCode(linked);
    else code = cleanCode(code.slice(0, field.selectionStart ?? code.length) + text + code.slice(field.selectionEnd ?? code.length));
  }
  const connecting = $derived(session.status === 'connecting');

  // ---- the menu: three ways in, a cursor that glides to the one in hand ----
  type Choice = { id: 'host' | 'delve' | 'local'; title: string; line: string; act: () => void };
  const CHOICES: Choice[] = [
    { id: 'host', title: 'Create a room', line: 'Online with your party, up to twelve exiles.', act: host },
    { id: 'delve', title: 'Delve', line: 'Alone, on three lives. Every question one depth deeper.', act: delve },
    { id: 'local', title: 'Hot-seat', line: 'Everyone on this one device, taking turns.', act: hotSeat },
  ];
  let at = $state(invite ? -1 : 0);
  let navEl: HTMLElement | undefined = $state();
  let itemEls: HTMLButtonElement[] = $state([]);
  let cursorY = $state(0);

  function placeCursor() {
    const t = itemEls[at]?.querySelector('.t');
    if (!t || !navEl) return;
    const a = t.getBoundingClientRect();
    const n = navEl.getBoundingClientRect();
    cursorY = a.top - n.top + a.height / 2;
  }
  $effect(() => {
    void at;
    void tick().then(placeCursor);
  });
  onMount(() => {
    void document.fonts?.ready.then(placeCursor);
  });
  /** Up and down walk the menu, as in a game; Home and End jump to its ends. */
  function menuKeys(e: KeyboardEvent) {
    const n = CHOICES.length;
    const i = itemEls.indexOf(document.activeElement as HTMLButtonElement);
    let to = -1;
    if (e.key === 'ArrowDown') to = (i + 1) % n;
    else if (e.key === 'ArrowUp') to = (i - 1 + n) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    if (to < 0) return;
    e.preventDefault();
    itemEls[to]?.focus();
  }

  function glinting(node: HTMLElement) {
    let h: Handle | null = null;
    setHomeScene(node);
    const t = setTimeout(() => (h = titleGlints(node)), 1200);
    return {
      destroy() {
        clearTimeout(t);
        h?.stop();
        setHomeScene(null);
      },
    };
  }
  function portalOn(node: HTMLElement) {
    const h = portalFx(node);
    return { destroy: () => h.stop(0.3) };
  }
</script>

<svelte:window onresize={placeCursor} />

<div class="home">
  <button class="codex-entry" onclick={openCodex} disabled={connecting} in:fade={{ duration: 600, delay: 700 }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.8v13.4c3.6-.2 6.2.4 8 1.7 1.8-1.3 4.4-1.9 8-1.7V4.8c-3.6-.2-6.2.4-8 1.7zM12 6.5v13.4" /></svg>
    <span class="codex-text">
      <span class="codex-label">Codex</span>
      {#if discovered}<span class="codex-count" in:fade={{ duration: 300 }}>{discovered} / {total}</span>{/if}
    </span>
  </button>

  <div class="cols">
    <div class="left">
      {#if BETA}<p class="beta" in:fade={{ duration: 600, delay: 100 }}>Beta</p>{/if}
      <h1 use:glinting in:fly={{ y: 16, duration: 900, delay: 150 }}>
        <span class="gold" use:backdropDropShadow>PoE2.Quest</span>
        <span class="gleam" aria-hidden="true">PoE2.Quest</span>
      </h1>
      <p class="tag" in:fade={{ duration: 800, delay: 450 }}>Name the unique.</p>
      <div class="rule" aria-hidden="true" in:fade={{ duration: 800, delay: 550 }}><i></i><span></span></div>

      <div class="menu-wrap" in:fly={{ y: 14, duration: 700, delay: 600 }}>
        <label class="lbl" for="name">Your name, Exile</label>
        <input
          id="name"
          class="field name"
          class:shake={shaking}
          class:err={!!nameMsg}
          bind:value={name}
          oninput={() => (nameMsg = '')}
          maxlength="20"
          placeholder="e.g. Doryani"
          autocomplete="nickname"
          spellcheck="false"
          aria-describedby={nameMsg ? 'name-msg' : undefined}
          aria-invalid={nameMsg ? 'true' : undefined}
          onkeydown={enterName}
          disabled={connecting}
        />
        {#if nameMsg}<p class="name-msg" id="name-msg" role="alert" transition:slide={{ duration: 200 }}>{nameMsg}</p>{/if}

        <nav class="menu" aria-label="Play" bind:this={navEl}>
          <span class="cursor" class:gone={at < 0} style:translate="0 {cursorY}px" aria-hidden="true"></span>
          {#each CHOICES as c, i (c.id)}
            <button
              class="mi"
              class:on={at === i}
              bind:this={itemEls[i]}
              onclick={c.act}
              onpointerenter={() => (at = i)}
              onfocus={() => (at = i)}
              onkeydown={menuKeys}
              disabled={connecting}
            >
              <span class="t">{c.title}</span>
              <span class="d">
                {c.line}
                {#if c.id === 'delve' && best && bestZone}
                  <span class="best" style:--z={bestColor}>Your deepest: <b>{shownDepth(best.depth)}</b>, {bestZone.name}.</span>
                {/if}
              </span>
            </button>
          {/each}
        </nav>

        <form class="join" class:invited={!!invite} onsubmit={join}>
          <label for="code">{invite ? 'You are invited' : 'Have a code?'}</label>
          <div class="join-row">
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
              disabled={connecting}
            />
            <button class="btn" class:primary={!!invite} type="submit" disabled={connecting || code.length < CODE_LENGTH}>Join</button>
          </div>
        </form>

        {#if connecting}
          <div class="connecting" role="status" transition:fade={{ duration: 200 }}>
            <span class="rune" use:portalOn></span>
            <span class="going">{session.mode === 'host' ? 'Opening a portal…' : `Travelling to room ${session.code}…`}</span>
            {#if session.mode === 'client'}<span class="slow">Still on the way. Some networks take a little longer.</span>{/if}
            <button class="btn ghost small" onclick={() => session.leave()}>Cancel</button>
          </div>
        {/if}
      </div>

      <div class="listing" in:fly={{ y: 20, duration: 700, delay: 750 }}>
        <OpenRooms onJoin={joinListed} disabled={connecting} />
      </div>
    </div>

    <div class="right" in:fade={{ duration: 900, delay: 400 }}>
      <TryOne onplay={host} />
    </div>
  </div>

  <footer class="muted">
    <p class="credit">
      Made by <a class="maker" href={DONATE_URL} target="_blank" rel="noopener noreferrer" title="Support {CREATOR}">{CREATOR}</a>
    </p>
    <a class="support" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
      Support the project
    </a>
    <p class="support-note">Optional tips help pay for the domain and development. Everything stays free.</p>
    Item data &amp; art from <a href="https://poe2db.tw/us/Unique_item" target="_blank" rel="noreferrer">poe2db.tw</a>.
    Path of Exile is a trademark of Grinding Gear Games. Unofficial fan project, not affiliated with or endorsed by Grinding Gear Games.
    <nav class="legal-links" aria-label="Legal">
      <a href={IMPRINT_URL}>Impressum</a>
      <span aria-hidden="true">·</span>
      <a href={PRIVACY_URL}>Datenschutz / Privacy</a>
    </nav>
  </footer>
</div>

<style>
  .home { position: relative; overflow-x: clip; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; }

  /* ---- the codex, top right (as on the live page) ---- */
  .codex-entry {
    position: absolute; top: 1rem; right: 1.25rem; z-index: 2;
    display: flex; align-items: center; gap: 0.6rem; height: 38px; padding: 0 1rem 0 0.4rem;
    background: rgba(0, 0, 0, 0.35); border: 1px solid var(--line); border-radius: 19px; cursor: pointer; color: var(--muted);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    transition: color 0.2s, border-color 0.2s, box-shadow 0.25s, transform 0.2s var(--ease-out);
  }
  .codex-entry:hover:not(:disabled) { color: var(--gold-hi); border-color: var(--gold-lo); box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.1), 0 0 16px rgba(201, 164, 92, 0.3); transform: translateY(-1px); }
  .codex-entry:active:not(:disabled) { transform: scale(0.96); }
  .codex-entry:disabled { opacity: 0.5; cursor: default; }
  .codex-entry svg {
    width: 28px; height: 28px; padding: 5px; border-radius: 50%;
    background: radial-gradient(circle, rgba(175, 96, 37, 0.35), transparent 70%);
    fill: none; stroke: var(--gold); stroke-width: 1.5; stroke-linejoin: round; filter: drop-shadow(0 0 4px rgba(224, 138, 68, 0.5));
  }
  .codex-text { display: flex; align-items: baseline; gap: 0.55rem; }
  .codex-label { font-family: var(--font-cinzel); font-weight: 700; font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; }
  .codex-count { font-family: var(--font-cinzel); font-size: 0.72rem; letter-spacing: 0.06em; color: var(--gold); }

  /* ---- two columns: the way in, and a question to try ---- */
  .cols {
    width: min(1220px, 100%); padding: 4.5rem 2.5rem 1rem;
    display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; gap: 3rem 5.5rem;
  }
  .left { flex: 1 1 380px; max-width: 470px; display: flex; flex-direction: column; align-items: flex-start; }
  /* Starts level with the title's cap height and only grows downward, so a long answer never moves the page. */
  .right { flex: 1 1 420px; max-width: 500px; display: flex; flex-direction: column; padding-top: 1.6rem; }

  .beta {
    margin: 0 0 0.8rem; padding: 0.15rem 0.6rem 0.1rem 0.8rem; border: 1px solid rgba(224, 138, 68, 0.5); border-radius: 3px;
    font-family: var(--font-cinzel); font-weight: 700; font-size: 0.7rem; letter-spacing: 0.35em; text-transform: uppercase; color: var(--unique-hi);
  }
  h1 { position: relative; display: grid; margin: 0 0 -0.28em -0.04em; font-family: var(--font-title); font-weight: 400; font-size: clamp(3.3rem, 6.2vw, 5.7rem); line-height: 1; letter-spacing: 0.03em; }
  h1 > span { grid-area: 1 / 1; padding-bottom: 0.28em; -webkit-background-clip: text; background-clip: text; color: transparent; }
  .gold {
    background-image: linear-gradient(180deg, #fff1c9 0.1em, #d7b068 0.5em, #8b6526 0.95em);
    /* Drawn by the WebGL backdrop when it can (see lib/backdropDropShadow.ts). */
    --drop-shadow: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 34px rgba(224, 170, 90, 0.36));
    filter: var(--drop-shadow-paint, var(--drop-shadow));
  }
  .gleam {
    will-change: transform;
    background-image: linear-gradient(100deg, transparent 42%, rgba(255, 250, 232, 0.75) 50%, transparent 58%);
    background-repeat: no-repeat; background-size: 250% 100%; background-position: 160% 0;
    animation: gleam 7s ease-in-out 1.6s infinite;
  }
  @keyframes gleam { 0% { background-position: 160% 0; } 22%, 100% { background-position: -60% 0; } }
  .tag { margin: 0.35rem 0 0; font-style: italic; font-size: 1.55rem; color: #e6d6b6; text-shadow: 0 2px 10px #000; }
  /* An engraved rule under the line: a diamond and a hairline running out to nothing. */
  .rule { display: flex; align-items: center; gap: 0.6rem; width: min(330px, 72%); margin: 1rem 0 1.7rem; }
  .rule i { width: 7px; height: 7px; rotate: 45deg; border: 1px solid var(--gold); box-shadow: 0 0 8px rgba(224, 138, 68, 0.6); }
  .rule span { flex: 1; height: 1px; background: linear-gradient(90deg, var(--gold), rgba(201, 164, 92, 0)); }

  .menu-wrap { position: relative; width: 100%; display: flex; flex-direction: column; align-items: flex-start; }
  .lbl { font-family: var(--font-display); font-size: 1.05rem; color: var(--gold); margin-bottom: 0.4rem; }
  .name { max-width: 340px; font-size: 1.15rem; }
  .name.err { border-color: #8e4434; }
  .name-msg { margin: 0.45rem 0 0; font-style: italic; color: #eab3a3; }
  .shake { animation: shake 0.45s; }
  @keyframes shake { 20%, 60% { translate: -6px 0; } 40%, 80% { translate: 6px 0; } }

  /* ---- the menu ---- */
  .menu { position: relative; isolation: isolate; margin-top: 1.5rem; padding-left: 1.6rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem; }
  /* One cursor for the whole menu: a lit diamond that glides to the choice in hand. */
  .cursor {
    position: absolute; left: 0; top: -5px; width: 10px; height: 10px; rotate: 45deg; pointer-events: none;
    background: linear-gradient(135deg, #fff1cf, var(--unique-hi) 55%, #8a4a1c);
    box-shadow: 0 0 10px var(--unique-hi), 0 0 24px rgba(224, 138, 68, 0.45);
    transition: translate 0.35s var(--ease-out), opacity 0.3s;
  }
  .cursor.gone { opacity: 0; }
  .mi {
    position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem; padding: 0.15rem 0 0.25rem; min-height: 48px;
    background: none; border: 0; cursor: pointer; text-align: left;
  }
  .mi:focus-visible { outline: none; }
  /* Behind the choice in hand, a warm light low on the left, as if the cursor's ember lit the stone. */
  .mi::before {
    content: ''; position: absolute; z-index: -1; inset: -0.6rem -2rem -0.6rem -4.5rem; pointer-events: none;
    background: radial-gradient(ellipse 34% 50% at 36% 50%, rgba(224, 138, 68, 0.15), transparent 100%);
    opacity: 0; transition: opacity 0.35s;
  }
  .mi.on::before { opacity: 1; }
  .t {
    font-family: var(--font-display); font-size: 2rem; line-height: 1.1; color: #e2c78d;
    text-shadow: 0 2px 12px #000;
    transition: color 0.25s, text-shadow 0.25s, translate 0.3s var(--ease-out);
  }
  .d { max-width: 24rem; font-style: italic; font-size: 0.98rem; line-height: 1.35; color: var(--muted); transition: color 0.25s; }
  .mi.on .t { color: #fff1cf; translate: 3px 0; text-shadow: 0 0 22px rgba(241, 217, 155, 0.4), 0 2px 12px #000; }
  .mi.on .d { color: #b9ab93; }
  /* Keyboard focus also gets an underline of light, so it reads without the pointer. */
  .mi:focus-visible .t { text-decoration: underline; text-decoration-color: rgba(224, 138, 68, 0.6); text-decoration-thickness: 1px; text-underline-offset: 6px; }
  .mi:disabled { opacity: 0.5; cursor: default; }
  .best { display: block; font-style: normal; color: #a99c86; }
  .best b { font-family: var(--font-cinzel); font-weight: 700; color: var(--z); text-shadow: 0 0 10px color-mix(in srgb, var(--z) 50%, transparent); }

  /* ---- joining with a code ---- */
  .join { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.8rem 0 0.2rem; border-top: 1px solid rgba(125, 99, 51, 0.3); width: min(100%, 380px); }
  .join label { font-style: italic; color: var(--muted); }
  .join-row { display: flex; gap: 0.5rem; }
  .join.invited { padding: 0.7rem 0.9rem 0.8rem; border: 1px solid rgba(224, 160, 96, 0.55); border-radius: 4px; background: linear-gradient(180deg, rgba(92, 58, 23, 0.4), rgba(20, 15, 10, 0.5)); box-shadow: 0 0 26px rgba(224, 138, 68, 0.18); }
  .join.invited label { font-style: normal; font-family: var(--font-display); font-size: 1.05rem; color: var(--gold-hi); }
  .code { flex: 1; min-width: 0; padding: 0.55em 0 0.55em 0.3em; text-align: center; font-family: var(--font-cinzel); font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; }
  .join .btn { min-width: 6rem; }

  /* The open rooms, as a part of joining rather than a panel of their own. */
  .listing { width: min(100%, 380px); margin-top: 1.1rem; }
  .listing :global(.rooms.panel) {
    --bs-fill-a: transparent; --bs-fill-b: transparent; --bs1-color: transparent; --bs2-color: transparent;
    width: 100%; padding: 0; background: none; border: 0; box-shadow: none;
  }
  .listing :global(.rooms.panel::before), .listing :global(.rooms.panel::after) { display: none; }
  .listing :global(.rooms header) { margin-bottom: 0.35rem; }
  .listing :global(.rooms h2) { font-family: var(--font-body); font-style: italic; font-weight: 400; font-size: 1rem; letter-spacing: 0; text-transform: none; color: var(--muted); }
  .listing :global(.rooms .refresh) { width: 30px; height: 30px; }
  .listing :global(.rooms .empty) { font-size: 0.98rem; color: #a99c86; }
  .listing :global(.rooms .note) { margin-top: 0.5rem; font-size: 0.78rem; line-height: 1.35; }

  /* ---- on the way to a room ---- */
  .connecting {
    position: absolute; inset: -3rem -4rem; z-index: 3;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; text-align: center;
    background: radial-gradient(closest-side, rgba(12, 10, 8, 0.97), rgba(12, 10, 8, 0.9) 60%, rgba(12, 10, 8, 0));
    font-family: var(--font-display); color: var(--gold-hi);
  }
  .going { font-size: 1.35rem; }
  .slow { max-width: 22rem; font-family: var(--font-body); font-style: italic; color: var(--muted); opacity: 0; animation: fade-in 0.4s ease 5s forwards; }
  @keyframes fade-in { to { opacity: 1; } }
  .rune { width: 58px; height: 58px; border-radius: 50%; border: 2px solid rgba(201, 164, 92, 0.15); border-top-color: var(--gold); border-bottom-color: var(--unique-hi); animation: spin 1.1s linear infinite; box-shadow: 0 0 25px rgba(201, 164, 92, 0.2); }
  @keyframes spin { to { rotate: 360deg; } }

  /* ---- the footer, as on the live page, kept to the bottom ---- */
  footer { margin-top: auto; padding: 3rem 1rem 1.6rem; font-size: 0.85rem; text-align: center; max-width: 520px; }
  .credit { margin: 0 0 0.5rem; font-family: var(--font-display); font-size: 0.8rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
  .maker { color: var(--gold-hi); letter-spacing: 0.08em; text-transform: none; font-weight: 700; text-decoration: none; border-bottom: 1px dotted var(--gold-lo); transition: color 0.2s, border-color 0.2s; }
  .maker:hover { color: #fff1cf; border-bottom-color: var(--gold); }
  .support {
    display: inline-flex; align-items: center; gap: 0.45em; padding: 0.45em 1em; margin-bottom: 0.4rem;
    border: 1px solid var(--line); border-radius: 999px; background: rgba(0, 0, 0, 0.3);
    font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; text-decoration: none; color: var(--muted);
    transition: all 0.2s;
  }
  .support:hover { color: #ffd7c2; border-color: #8c3a2c; background: rgba(140, 58, 44, 0.2); }
  .support svg { width: 13px; height: 13px; fill: #c0463c; }
  .support-note { margin: 0 0 0.9rem; font-size: 0.8rem; font-style: italic; }
  footer a { color: var(--gold); }
  .legal-links { display: flex; justify-content: center; gap: 0.6rem; margin-top: 0.6rem; }
  .legal-links a { color: var(--muted); }
  .legal-links a:hover { color: var(--gold-hi); }

  @media (max-width: 560px) {
    .cols { padding: 4.25rem 1.25rem 1rem; gap: 3rem; }
    .right { padding-top: 0; }
    .t { font-size: 1.75rem; }
    .name { max-width: none; }
    .join, .listing { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { .gleam, .rune { animation: none; } }
</style>
