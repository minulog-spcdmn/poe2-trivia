<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { NAME_TOO_SHORT, MAX_NAME, nameHeld, nameTooShort, unlockHeldName } from '../lib/names';
  import { toasts } from '../lib/toasts.svelte';
  import { engine, session, savedName, saveName, CODE_LENGTH } from '../lib/session.svelte';
  import { CREATOR, DONATE_URL, IMPRINT_URL, PRIVACY_URL } from '../lib/site';
  import { refuse } from '../lib/fx/moments';
  import { openCodex, codexRoute } from '../lib/codexRoute.svelte';
  import { DELVE_LINK_PARAM } from '../lib/delveShare';
  import { wantDelveBackdrop } from '../lib/backdrop';
  import { BETA } from '../lib/channel';
  import { deepestEver, loadRecords } from '../lib/delveRecord';
  import { shownDepth } from '../lib/delve';
  import { ENTRIES, codexLine, cursorKey, lastEntry, rememberEntry, type Entry } from '../lib/startMenu';
  import GameTitle from './GameTitle.svelte';
  import Connecting from './Connecting.svelte';
  import DailyUnique from './DailyUnique.svelte';
  import InviteScreen from './InviteScreen.svelte';
  import OpenRooms from './OpenRooms.svelte';

  /** Keeps a room code's letters and digits, uppercased, up to its length. */
  const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

  const params = new URLSearchParams(location.search);
  /** An invite link's room (?room=CODE): its own screen until joined or left. */
  let invite = $state(cleanCode(params.get('room') ?? ''));
  if (params.has('owner')) {
    void unlockHeldName(params.get('owner') ?? '');
    // Out of the address bar and history either way; other params stay.
    const url = new URL(location.href);
    url.searchParams.delete('owner');
    history.replaceState(history.state, '', url);
  }

  /** The name this browser plays under; empty on a first visit (it is asked once, then greeted). */
  let known = $state(savedName().trim());

  // A delver's shared link (?delve): someone who has played here before (a
  // name is saved) goes straight into a run alone; anyone else finds Delve
  // chosen in the lobby they open. Not over a game that's being resumed:
  // App resumes it on mount, after this, so look once that's had its turn.
  if (params.has(DELVE_LINK_PARAM)) {
    const url = new URL(location.href);
    url.searchParams.delete(DELVE_LINK_PARAM);
    history.replaceState(history.state, '', url);
    session.delveLink = true;
    // Either way Delve is on its way: the backdrop gets its Delve programs ready.
    wantDelveBackdrop();
    const n = savedName().trim();
    if (n && !nameTooShort(n) && !nameHeld(n))
      setTimeout(() => {
        if (session.status === 'idle' && !session.state) session.startDelve(n);
      });
  }

  const total = engine.items.length;
  /** Null until the codex is read. */
  let discovered = $state<number | null>(null);
  void import('../lib/codex').then(({ loadCodex }) => {
    const seen = loadCodex().items;
    discovered = engine.items.filter((it) => seen[it.id]).length;
  });
  const deepest = shownDepth(deepestEver(loadRecords()));
  // Achievements catch up with the codex here: the first time quietly (those
  // earned in games from before them get one notice, here or owed from a game),
  // and any missed since. Not once a game has taken over the screen.
  void Promise.all([import('../lib/achievements'), import('../lib/achievementToasts')])
    .then(([{ checkAchievements }, { announceAchievements, payOwed }]) => {
      const here = !session.state;
      announceAchievements(checkAchievements(engine.items), here ? 'start' : 'game');
      if (here) payOwed();
    })
    .catch((err) => console.warn('achievements', err));

  const connecting = $derived(session.status === 'connecting');

  // ---- names ----

  /** A name fit to play under (saved, and the greeting's from now on), or null after saying what's wrong with it. */
  function checkName(raw: string, field: HTMLInputElement | undefined): string | null {
    const n = raw.trim();
    if (!n || nameTooShort(n) || nameHeld(n)) {
      if (n && nameTooShort(n)) toasts.show(NAME_TOO_SHORT, 'error', { title: 'Name too short' });
      if (field) {
        refuse(field);
        field.focus();
      }
      return null;
    }
    saveName(n);
    known = n;
    return n;
  }

  let renaming = $state(false);
  let draft = $state('');
  let renameField = $state<HTMLInputElement>();
  async function startRename() {
    if (connecting) return;
    draft = known;
    renaming = true;
    await tick();
    renameField?.focus();
    renameField?.select();
  }
  function saveRename(e?: Event) {
    e?.preventDefault();
    if (checkName(draft, renameField)) renaming = false;
  }
  function renameKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      renaming = false;
    }
  }

  // ---- the menu ----

  /** The keyboard cursor: arrows move it, Enter chooses, it follows the mouse. */
  let cursor = $state(lastEntry());
  /** The entry whose row (fields in place of its description) is open. */
  let open = $state<Entry | null>(null);
  let entryEls: HTMLButtonElement[] = $state([]);

  let nameInput = $state(''); // first visit: the name asked with Create or Join
  let code = $state('');
  let codeError = $state(false);
  let nameField = $state<HTMLInputElement>();
  let codeField = $state<HTMLInputElement>();
  /** The entry that set off the connection, whose row shows it. */
  let busy = $state<Entry | null>(null);

  async function choose(e: Entry) {
    if (connecting) return;
    cursor = ENTRIES.indexOf(e);
    rememberEntry(e);
    renaming = false;
    if (e === 'hotseat') return session.startLocal();
    if (e === 'codex') return openCodex();
    if (e === 'create' && known) return host();
    open = e;
    await tick();
    (known ? codeField : nameField)?.focus();
  }

  function closeRow() {
    if (!open) return;
    const i = ENTRIES.indexOf(open);
    open = null;
    codeError = false;
    entryEls[i]?.focus();
  }

  function host(e?: Event) {
    e?.preventDefault();
    const n = known || checkName(nameInput, nameField);
    if (!n) return;
    busy = 'create';
    session.host(n);
  }

  function join(e?: Event) {
    e?.preventDefault();
    const n = known || checkName(nameInput, nameField);
    if (!n) return;
    if (code.length < CODE_LENGTH) {
      codeError = true;
      if (codeField) refuse(codeField);
      codeField?.focus();
      toasts.show(`Room codes have ${CODE_LENGTH} letters and digits.`, 'error', { title: 'Code too short' });
      return;
    }
    startJoin(code, n);
  }

  /** A room joined from the Open rooms list: its row is Join's. */
  function joinListed(roomCode: string) {
    if (connecting) return;
    if (!known) {
      code = roomCode;
      open = 'join';
      cursor = ENTRIES.indexOf('join');
      void tick().then(() => nameField?.focus());
      toasts.show('Name yourself first, then join.', 'info', { title: 'Your name' });
      return;
    }
    code = roomCode;
    startJoin(roomCode, known);
  }

  // A join that ends back here without a room (no such room, no answer):
  // its code is the one to check, and the toast (session.fail) says why.
  let joining: string | null = null;
  function startJoin(roomCode: string, n: string) {
    joining = roomCode;
    busy = 'join';
    session.join(roomCode, n);
    // Turned down on the spot (a code that can't be one).
    if (!connecting) settle();
  }
  function settle() {
    if (joining && !session.state) {
      code = joining;
      codeError = true;
      if (!invite) open = 'join';
    }
    joining = null;
    busy = null;
  }
  $effect(() => {
    if (!connecting) untrack(settle);
  });

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
    codeError = false;
  }

  /** Arrows, Enter and Escape on the menu; not while typing (but Escape), in a dialog, or once something else has the screen. */
  function keys(e: KeyboardEvent) {
    if (invite || session.state || codexRoute.open || document.querySelector('[aria-modal="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') {
      if (open && !connecting) {
        e.preventDefault();
        closeRow();
      }
      return;
    }
    if (typing || connecting || renaming) return;
    const next = cursorKey(e.key, cursor);
    if (next !== null) {
      e.preventDefault();
      cursor = next;
      entryEls[next]?.focus();
    } else if (e.key === 'Enter' && (!t || t === document.body)) {
      e.preventDefault();
      void choose(ENTRIES[cursor]);
    }
  }

  /** The cursor follows the mouse (touch has none). */
  function hover(e: PointerEvent, i: number) {
    if (e.pointerType !== 'mouse') return;
    hovered = true;
    if (!connecting) cursor = i;
  }
  /** The mouse is over an entry. */
  let hovered = $state(false);
  /** An entry has the keyboard's focus (not a click's). */
  let keyFocus = $state(false);
  function focusIn(e: FocusEvent) {
    keyFocus = (e.target as HTMLElement).matches('.pick:focus-visible');
  }
  /** The cursor shows while an entry is pointed at or chosen; otherwise it fades away. */
  const lit = $derived(!renaming && (hovered || keyFocus || !!open || connecting));

  // ---- the invite link's screen ----

  let inviteName = $state(savedName());
  function joinInvite(field: HTMLInputElement) {
    const n = checkName(inviteName, field);
    if (!n) return;
    startJoin(invite, n);
  }
  function leaveInvite() {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(history.state, '', url);
    invite = '';
  }
  // Joined: the link has done its job (a reload shouldn't ask again).
  $effect(() => {
    if (session.state && invite) leaveInvite();
  });

  const MENU: Record<Entry, string> = {
    create: 'Create a room',
    join: 'Join a room',
    hotseat: 'Play hot-seat',
    codex: 'Codex',
  };
  const about = $derived<Record<Entry, string>>({
    create: 'Host your party, or play on your own.',
    join: 'With the code a friend sent you.',
    hotseat: 'Everyone at one screen, passing it around.',
    codex: codexLine(discovered, total, deepest),
  });
</script>

<svelte:window onkeydown={keys} />

{#if invite}
  <InviteScreen code={invite} bind:name={inviteName} {connecting} onjoin={joinInvite} onback={leaveInvite} />
{:else}
  <div class="home">
    <div class="intro">
      <div class="title">
        <GameTitle />
        {#if BETA}<span class="beta" in:fade={{ duration: 600, delay: 100 }}>Beta</span>{/if}
      </div>
      <p class="motto" in:fade={{ duration: 700, delay: 350 }}>Name the unique.</p>
      <p class="blurb" in:fade={{ duration: 700, delay: 450 }}>
        Path of Exile 2 item trivia, alone or with <span class="wide">up to eleven</span> friends.
      </p>

      <!-- The greeting: the name is asked once, then greeted (and changed here). -->
      <div class="greeting" in:fade={{ duration: 600, delay: 500 }}>
        {#if renaming}
          <form class="row" onsubmit={saveRename}>
            <input
              class="field name"
              bind:this={renameField}
              bind:value={draft}
              maxlength={MAX_NAME}
              placeholder="Your name"
              aria-label="Your name"
              autocomplete="nickname"
              spellcheck="false"
              onkeydown={renameKeys}
            />
            <button class="btn" type="submit">Save</button>
            <button class="link" type="button" onclick={() => (renaming = false)}>Cancel</button>
          </form>
        {:else}
          <p class="hello">
            {known ? 'Welcome back,' : 'Welcome,'}
            <button class="who" onclick={startRename} disabled={connecting} title="Change your name">{known || 'Exile'}.</button>
            <button class="quill" onclick={startRename} disabled={connecting} tabindex="-1" aria-hidden="true">
              <span class="ring"><svg viewBox="0 0 24 24"><path d="M5 19l2.5-.6L18 7.9a1.9 1.9 0 0 0-2.7-2.7L4.8 15.7 4.2 18.2zM14 6.5l3.2 3.2" /></svg></span>
              <i>Change your name</i>
            </button>
          </p>
        {/if}
      </div>

      <nav class="menu" class:renaming class:lit aria-label="Start" onfocusin={focusIn} onfocusout={() => (keyFocus = false)}>
        <!-- One cursor for the menu: it slides to the entry under the mouse (or the
             keyboard's), and fades away slowly once nothing is pointed at. -->
        <span class="diamond" aria-hidden="true" style:translate="0 {cursor * 108}px"></span>
        {#each ENTRIES as e, i (e)}
          {@const isOpen = open === e && !connecting}
          {@const isBusy = connecting && (busy ?? (session.mode === 'host' ? 'create' : 'join')) === e}
          <div
            class="entry"
            role="presentation"
            class:cur={cursor === i}
            class:dimmed={connecting && !isBusy}
            inert={connecting && !isBusy}
            onpointerenter={(ev) => hover(ev, i)}
            onpointerleave={(ev) => ev.pointerType === 'mouse' && (hovered = false)}
            in:fly={{ y: 12, duration: 500, delay: 450 + i * 70 }}
          >
            <button class="pick" bind:this={entryEls[i]} onclick={() => choose(e)} onfocus={() => (cursor = i)} aria-expanded={e === 'create' || e === 'join' ? isOpen : undefined}>
              {MENU[e]}
            </button>
            {#if isBusy}
              <div class="slot"><Connecting /></div>
            {:else if isOpen && e === 'create'}
              <form class="slot row" onsubmit={host}>
                <input class="field name" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="nickname" spellcheck="false" />
                <button class="btn primary" type="submit">Create room</button>
              </form>
            {:else if isOpen && e === 'join'}
              <form class="slot row" onsubmit={join}>
                {#if !known}
                  <input class="field name short" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="nickname" spellcheck="false" />
                {/if}
                <input
                  class="field code"
                  class:short={!known}
                  class:bad={codeError}
                  bind:this={codeField}
                  bind:value={code}
                  oninput={() => ((code = cleanCode(code)), (codeError = false))}
                  onpaste={pasteCode}
                  placeholder="Code"
                  maxlength={CODE_LENGTH}
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Room code"
                  aria-invalid={codeError}
                />
                <button class="btn primary" type="submit">Join</button>
              </form>
            {:else}
              <p class="about">{about[e]}</p>
            {/if}
          </div>
        {/each}
      </nav>
    </div>

    <div class="today" in:fade={{ duration: 900, delay: 300 }}>
      <DailyUnique />
    </div>

    <div class="rooms" class:dimmed={connecting} inert={connecting} in:fly={{ y: 20, duration: 600, delay: 600 }}>
      <OpenRooms onJoin={joinListed} disabled={connecting} />
    </div>

    <footer>
      <div class="rule" aria-hidden="true"><span></span></div>
      <div class="band">
        <div class="made">
          <p class="credit">Made by <a class="maker" href={DONATE_URL} target="_blank" rel="noopener noreferrer" title="Support {CREATOR}">{CREATOR}</a></p>
          <a class="support" href={DONATE_URL} target="_blank" rel="noopener noreferrer" aria-describedby="support-note">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
            Support the project
            <span class="tip" id="support-note" role="tooltip">Optional tips help pay for the domain and development. Everything stays free.</span>
          </a>
        </div>
        <p class="fine">
          Unofficial fan project. Path of Exile is a trademark of Grinding Gear Games, who do not endorse this site. Item data and art from
          <a href="https://poe2db.tw/us/Unique_item" target="_blank" rel="noreferrer">poe2db.tw</a>.
        </p>
        <nav class="legal" aria-label="Legal">
          <a href={IMPRINT_URL}>Impressum</a>
          <span aria-hidden="true">·</span>
          <a href={PRIVACY_URL}>Datenschutz / Privacy</a>
        </nav>
      </div>
    </footer>
  </div>
{/if}

<style>
  /* Two columns (the menu, Today's unique) pushed apart, then the open rooms
     across the page, then the footer. Phones stack them, the rooms before
     Today's unique. */
  .home {
    --pad-x: clamp(16px, 8.4vw, 120px);
    /* Wide screens keep the 1440 px layout, centred. */
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(0, 452px) minmax(0, 510px);
    /* The last row takes what's left, so the footer sits at the bottom of a short page. */
    grid-template-rows: auto auto 1fr;
    grid-template-areas:
      'intro today'
      'rooms rooms'
      'foot foot';
    justify-content: space-between;
    align-content: start;
    column-gap: 40px;
    padding: 26px var(--pad-x) 22px;
  }
  .intro {
    grid-area: intro;
    min-width: 0;
  }
  .today {
    grid-area: today;
    min-width: 0;
    padding-top: 6px;
  }
  .rooms {
    grid-area: rooms;
    margin-top: 44px;
    transition: opacity 0.3s;
  }
  footer {
    grid-area: foot;
    align-self: end;
    margin-top: 32px;
  }

  /* ---- the title ---- */
  .title {
    --title-size: 92px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  /* Marks the beta build (poe2.quest/beta/) so testers know where they are. */
  .beta {
    margin-top: 10px;
    padding: 0.2rem 0.4rem 0.15rem 0.6rem;
    border: 1px solid rgba(224, 138, 68, 0.5);
    border-radius: 3px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .motto {
    position: relative;
    margin: 0;
    font-style: italic;
    font-size: 24px;
    line-height: 1.3;
    color: #ecdcbc;
  }
  .blurb {
    position: relative;
    margin: 2px 0 0;
    font-size: 17px;
    color: #a99c86;
  }

  /* ---- the greeting ---- */
  .greeting {
    height: 44px;
    margin: 16px 0;
    display: flex;
    align-items: center;
  }
  .hello {
    display: flex;
    align-items: center;
    gap: 0.3em;
    margin: 0;
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--gold);
  }
  .who {
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    color: #f1d99b;
  }
  .who:disabled {
    cursor: default;
  }
  /* The rename affordance shows on hovering the greeting with a mouse, never at rest. */
  .quill {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 6px;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--gold);
    opacity: 0;
    visibility: hidden;
    translate: -4px 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out),
      visibility 0s 0.2s;
  }
  .hello:hover .quill:not(:disabled) {
    opacity: 1;
    visibility: visible;
    translate: 0 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out);
  }
  .ring {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
  }
  .ring svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .quill i {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .row .field {
    height: 40px;
    padding: 0 12px;
    font-size: 17px;
  }
  .row .btn {
    height: 40px;
    flex: none;
  }
  .greeting .name {
    width: 240px;
  }
  .link {
    min-height: 40px;
    padding: 0 4px;
    background: none;
    border: 0;
    cursor: pointer;
    font-style: italic;
    font-size: 15px;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
  }
  .link:hover {
    color: var(--gold-hi);
  }

  /* ---- the menu ---- */
  .menu {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  /* Every entry in a slot of its own, so nothing moves when one opens. */
  .entry {
    position: relative;
    height: 108px;
    transition: opacity 0.3s;
  }
  .pick {
    display: block;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 32px;
    line-height: 36px;
    letter-spacing: 0;
    text-align: left;
    color: #d9c08a;
    transition:
      color 1.2s ease,
      text-shadow 1.2s ease;
  }
  .pick:focus-visible {
    outline-offset: 4px;
  }
  .about {
    margin: 6px 0 0;
    font-style: italic;
    font-size: 16px;
    color: #ab9d88;
  }
  .slot {
    margin-top: 10px;
  }
  .name {
    width: 300px;
  }
  .name.short {
    width: 216px;
  }
  .code {
    width: 170px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    letter-spacing: 0.35em;
    text-align: center;
    text-transform: uppercase;
  }
  .code.short {
    width: 140px;
  }
  .code::placeholder {
    letter-spacing: 0.35em;
  }
  .code.bad,
  .code.bad:focus {
    border-color: var(--bad);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.55),
      0 0 0 3px rgba(224, 85, 63, 0.14);
  }
  /* The cursor: a glowing diamond beside the entry, its title lit. It slides
     from entry to entry and fades out slowly when nothing is pointed at. A
     pointer that can hover has one; touch never shows it. */
  .diamond {
    position: absolute;
    left: -26px;
    top: 14px;
    width: 9px;
    height: 9px;
    rotate: 45deg;
    background: #e08a44;
    box-shadow:
      0 0 8px rgba(224, 138, 68, 0.9),
      0 0 18px rgba(224, 138, 68, 0.45);
    opacity: 0;
    scale: 0.6;
    pointer-events: none;
    transition:
      opacity 1.2s ease,
      scale 1.2s ease,
      translate 0.35s var(--ease-out);
  }
  @media (hover: hover) {
    .lit .diamond {
      opacity: 1;
      scale: 1;
      transition:
        opacity 0.2s,
        scale 0.25s var(--ease-out),
        translate 0.35s var(--ease-out);
    }
    .lit .cur .pick {
      color: #fff1cf;
      text-shadow: 0 0 18px rgba(241, 217, 155, 0.35);
      transition:
        color 0.2s,
        text-shadow 0.25s;
    }
  }
  .dimmed {
    opacity: 0.45;
    pointer-events: none;
  }

  /* ---- the footer band ---- */
  .rule {
    position: relative;
    height: 1px;
    margin: 0 6%;
    --l: rgba(125, 99, 51, 0.6);
    /* Broken in the middle, round the diamond. */
    background: linear-gradient(
      90deg,
      transparent,
      var(--l) 20%,
      var(--l) calc(50% - 16px),
      transparent calc(50% - 16px),
      transparent calc(50% + 16px),
      var(--l) calc(50% + 16px),
      var(--l) 80%,
      transparent
    );
  }
  .rule span {
    position: absolute;
    left: 50%;
    top: -5px;
    width: 9px;
    height: 9px;
    translate: -50% 0;
    rotate: 45deg;
    border: 1px solid var(--gold-lo);
  }
  .band {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 24px;
    margin-top: 26px;
  }
  .made {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .credit {
    margin: 0;
    white-space: nowrap;
    font-family: var(--font-cinzel);
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .maker {
    font-family: var(--font-display);
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: none;
    color: var(--gold-hi);
    text-decoration: none;
    border-bottom: 1px solid var(--gold-lo);
    transition:
      color 0.2s,
      border-color 0.2s;
  }
  .maker:hover {
    color: #fff1cf;
    border-bottom-color: var(--gold);
  }
  .support {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
    padding: 0.5em 1.1em;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--font-cinzel);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    white-space: nowrap;
    color: var(--gold);
    background: rgba(0, 0, 0, 0.3);
    transition:
      color 0.2s,
      border-color 0.2s,
      background 0.2s;
  }
  .support:hover {
    color: #ffd7c2;
    border-color: #8c3a2c;
    background: rgba(140, 58, 44, 0.2);
  }
  .support svg {
    width: 11px;
    height: 11px;
    fill: #c0463c;
  }
  /* Its note as a tooltip, over the pill. */
  .tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 10px);
    width: 260px;
    translate: -50% 4px;
    padding: 0.55rem 0.8rem;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 400;
    font-style: italic;
    letter-spacing: 0;
    text-transform: none;
    line-height: 1.35;
    color: var(--text);
    background: rgba(12, 10, 8, 0.96);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out),
      visibility 0s 0.2s;
  }
  .support:hover .tip {
    opacity: 1;
    visibility: visible;
    translate: -50% 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out);
  }
  .support:focus-visible .tip {
    opacity: 1;
    visibility: visible;
    translate: -50% 0;
  }
  .fine {
    max-width: 380px;
    margin: 0;
    text-align: center;
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted);
  }
  .fine a,
  .legal a {
    color: inherit;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
  }
  .legal {
    justify-self: end;
    display: flex;
    gap: 0.6rem;
    font-size: 13px;
    color: var(--muted);
  }
  .fine a:hover,
  .legal a:hover {
    color: var(--gold-hi);
  }

  /* Narrower screens: one column, the menu above Today's unique. */
  @media (max-width: 1080px) {
    .home {
      grid-template-columns: minmax(0, 560px);
      grid-template-rows: auto auto auto 1fr;
      grid-template-areas:
        'intro'
        'today'
        'rooms'
        'foot';
      justify-content: center;
    }
    .today {
      padding-top: 32px;
    }
    .band {
      grid-template-columns: 1fr;
      justify-items: center;
      gap: 14px;
    }
    .legal {
      justify-self: center;
    }
  }
  /* Phones: the menu, the open rooms, then Today's unique; no cursor. */
  @media (max-width: 640px) {
    .home {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'intro'
        'rooms'
        'today'
        'foot';
      padding: 28px 16px 20px;
    }
    .title {
      --title-size: 54px;
    }
    .motto {
      font-size: 20px;
    }
    .blurb {
      font-size: 15px;
    }
    .wide {
      display: none;
    }
    .greeting {
      margin: 8px 0 4px;
    }
    .hello {
      font-size: 17px;
    }
    .greeting .name {
      width: auto;
      flex: 1;
      min-width: 0;
    }
    .entry {
      height: auto;
      min-height: 98px;
      padding-bottom: 12px;
    }
    .diamond {
      display: none;
    }
    .pick {
      font-size: 28px;
      line-height: 34px;
    }
    .about {
      font-size: 15px;
    }
    .row {
      flex-wrap: wrap;
    }
    .slot.row .field {
      flex: 1 1 140px;
      width: auto;
      min-width: 0;
    }
    .slot.row .btn {
      flex: 1 0 auto;
    }
    .rooms {
      margin-top: 16px;
    }
    .today {
      padding-top: 40px;
    }
    .made {
      flex-direction: column;
      gap: 14px;
    }
  }
  @media (pointer: coarse) {
    .row .field,
    .row .btn {
      height: 44px;
    }
    .support {
      min-height: 44px;
    }
  }
</style>
