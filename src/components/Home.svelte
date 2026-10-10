<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { NAME_TOO_SHORT, MAX_NAME, nameHeld, nameTooShort, unlockHeldName } from '../lib/names';
  import { toasts } from '../lib/toasts.svelte';
  import { engine, session, savedName, saveName, CODE_LENGTH } from '../lib/session.svelte';
  import { CREATOR, CREATOR_URL, DONATE_URL, IMPRINT_URL, PRIVACY_URL } from '../lib/site';
  import { refuse } from '../lib/fx/moments';
  import { openCodex, codexRoute } from '../lib/codexRoute.svelte';
  import { DELVE_LINK_PARAM } from '../lib/delveShare';
  import { wantDelveBackdrop } from '../lib/backdrop';
  import { BETA, LOCAL } from '../lib/channel';
  import { deepestEver, loadRecords } from '../lib/delveRecord';
  import { shownDepth } from '../lib/delve';
  import { ENTRIES, codexLine, cursorKey, lastEntry, rememberEntry, type Entry } from '../lib/startMenu';
  import GameTitle from './GameTitle.svelte';
  import Connecting from './Connecting.svelte';
  import DailyUnique from './DailyUnique.svelte';
  import InviteRoom from './InviteRoom.svelte';
  import MenuCursor from './MenuCursor.svelte';
  import OpenRooms from './OpenRooms.svelte';
  import { probeRoom, type RoomInfo } from '../lib/rooms';

  /** Keeps a room code's letters and digits, uppercased, up to its length. */
  const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

  const params = new URLSearchParams(location.search);
  /** An invite link's room (?room=CODE): the start page shows it until it is joined or left. */
  let invite = $state(cleanCode(params.get('room') ?? ''));
  if (params.has('owner')) {
    void unlockHeldName(params.get('owner') ?? '');
    // Out of the address bar and history either way; other params stay.
    const url = new URL(location.href);
    url.searchParams.delete('owner');
    history.replaceState(history.state, '', url);
  }

  /**
   * Beta and dev server only: ?room=CODE&first shows an invite as a first
   * visit sees it, to test it with a name saved; for this visit the saved
   * name is set aside (nothing saved changes, unless you join).
   */
  const firstLook = (BETA || LOCAL) && !!params.get('room') && params.has('first');
  /** The name this browser plays under; empty on a first visit (it is asked once, then greeted). */
  let known = $state(firstLook ? '' : savedName().trim());

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

  /**
   * The saved name, if it can still be played under; otherwise it is let go
   * (null), and the name is asked as on a first visit. A held name needs this
   * device unlocked, and a name saved by an older build may be too short now.
   */
  function knownName(): string | null {
    if (!known) return null;
    if (!nameTooShort(known) && !nameHeld(known)) return known;
    known = '';
    return null;
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

  /** An entry's description giving way to its fields, and back. */
  const SWAP_IN = { y: 4, duration: 240, delay: 90 };
  const SWAP_OUT = { duration: 140 };

  /** The keyboard cursor: arrows move it, Enter chooses, it follows the mouse. */
  let cursor = $state(untrack(() => invite) ? 0 : lastEntry());
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
    if (e === 'create' && knownName()) return host();
    open = e;
    await tick();
    (known ? codeField : nameField)?.focus();
  }

  /** The open row's element (its fields and button). */
  const rowEl = () => (open ? entryEls[ENTRIES.indexOf(open)]?.parentElement?.querySelector('.slot') : null);
  /** Whether the open row has the focus (its field is being typed in). */
  const rowHasFocus = () => !!rowEl()?.contains(document.activeElement);

  /**
   * Closes the open row. Its entry takes the focus back: always from the
   * keyboard (Escape), only if the row had it when it closes on its own,
   * never when a click elsewhere closes it (the click decides the focus).
   */
  function closeRow(refocus: 'always' | 'if-focused' | 'never' = 'always') {
    if (!open) return;
    const i = ENTRIES.indexOf(open);
    const hadFocus = rowHasFocus();
    open = null;
    codeError = false;
    rowFocus = false;
    clearTimeout(idleTimer);
    if (refocus === 'always' || (refocus === 'if-focused' && hadFocus)) entryEls[i]?.focus({ preventScroll: true });
  }

  /** A click anywhere but the open row's entry closes the row at once (what was typed is kept for next time). */
  function outside(e: PointerEvent) {
    if (!open || connecting) return;
    const entry = entryEls[ENTRIES.indexOf(open)]?.parentElement;
    if (entry && !entry.contains(e.target as Node)) closeRow('never');
  }

  /** How long an untouched row stays open once the mouse has left its entry. */
  const ROW_IDLE_MS = 4000;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(idleTimer));
  /**
   * The mouse left an entry: the open row closes after a while, unless the
   * mouse comes back to its entry first, or something is being typed in it.
   */
  function leave(ev: PointerEvent) {
    if (ev.pointerType !== 'mouse') return;
    hovered = false;
    const e = open;
    if (!e) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (open === e && !connecting && (!rowHasFocus() || (!code && !nameInput.trim()))) closeRow('if-focused');
    }, ROW_IDLE_MS);
  }

  function host(e?: Event) {
    e?.preventDefault();
    const n = knownName() ?? checkName(nameInput, nameField);
    if (!n) return;
    busy = 'create';
    session.host(n);
  }

  function join(e?: Event) {
    e?.preventDefault();
    const n = knownName() ?? checkName(nameInput, nameField);
    if (!n) {
      // A saved name just let go: the row now asks for one.
      if (!nameField) void tick().then(() => nameField?.focus());
      return;
    }
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
    const n = knownName();
    if (!n) {
      code = roomCode;
      open = 'join';
      cursor = ENTRIES.indexOf('join');
      void tick().then(() => nameField?.focus());
      toasts.show('Name yourself first, then join.', 'info', { title: 'Your name' });
      return;
    }
    code = roomCode;
    startJoin(roomCode, n);
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
    if (open === ENTRIES[i]) clearTimeout(idleTimer);
    if (!connecting) cursor = i;
  }
  /** The mouse is over an entry. */
  let hovered = $state(false);
  /** An entry has the keyboard's focus (not a click's). */
  let keyFocus = $state(false);
  /** The open row's field has the focus. */
  let rowFocus = $state(false);
  function focusIn(e: FocusEvent) {
    const t = e.target as HTMLElement;
    keyFocus = t.matches('.pick:focus-visible');
    rowFocus = !!t.closest('.slot');
  }
  function focusOut() {
    keyFocus = false;
    rowFocus = false;
  }
  /** The cursor shows while an entry is pointed at, chosen from the keyboard, typed in or connecting; otherwise it fades away. */
  const lit = $derived(!renaming && (hovered || keyFocus || ((!!open || !!invite) && rowFocus) || connecting));

  // ---- the invite link's screen ----

  // An invite is the start page with the choice already made: the menu holds
  // the one room to join (and a way to everything else), the right-hand
  // column the room as the lobby will show it (InviteRoom).
  let inviteName = $state(firstLook ? '' : savedName());
  /** What the room said when asked: its info, 'gone', null (no answer), or undefined while asking. */
  let inviteInfo = $state<RoomInfo | 'gone' | null | undefined>(undefined);
  const inviteHost = $derived(inviteInfo && inviteInfo !== 'gone' ? inviteInfo.host : '');
  let inviteField = $state<HTMLInputElement>();
  function joinInvite(e?: Event) {
    e?.preventDefault();
    const n = checkName(inviteName, inviteField);
    if (!n) return;
    startJoin(invite, n);
  }
  function leaveInvite() {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    // Older invite links named their host (?by=): the room says that now.
    url.searchParams.delete('by');
    url.searchParams.delete('first');
    history.replaceState(history.state, '', url);
    invite = '';
  }
  // Joined: the link has done its job (a reload shouldn't ask again).
  $effect(() => {
    if (session.state && invite) leaveInvite();
  });
  // The invite screen is for a first visit, when there is no name yet. A
  // player with a name goes straight on to the room: the start page shows the
  // join on its way in Join a room's row, and a join that fails leaves the
  // code there with the toast, to try again. Not over a game being resumed
  // (App resumes it on mount, after this).
  const opened = untrack(() => ({ code: invite, name: known }));
  if (opened.code && opened.name && !nameTooShort(opened.name) && !nameHeld(opened.name)) {
    const { code, name } = opened;
    leaveInvite();
    cursor = ENTRIES.indexOf('join');
    setTimeout(() => {
      if (session.status === 'idle' && !session.state) startJoin(code, name);
    });
  } else if (opened.code) {
    // A first visit: the room is asked whose it is and how it stands, so the
    // screen shows the room as it is (nothing a link says about it is taken
    // on trust). Undefined while it is asked (lib/rooms.ts probeRoom).
    void probeRoom(opened.code).then((r) => {
      if (invite === opened.code) inviteInfo = r;
    });
  }

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

<svelte:window onkeydown={keys} onpointerdown={outside} />

<div class="home" class:invited={!!invite}>
  <div class="intro">
    <div class="title">
      <GameTitle />
      {#if BETA || LOCAL}<span class="beta" in:fade={{ duration: 600, delay: 100 }}>{BETA ? 'Beta' : 'Local'}</span>{/if}
    </div>
    <p class="kicker" in:fade={{ duration: 700, delay: 350 }}>Unique item trivia</p>
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
          {#if invite}
            <!-- An invite asks the name in its own row: the greeting only greets. -->
            <span class="who">{known || 'Exile'}.</span>
          {:else}
            <button class="who" onclick={startRename} disabled={connecting} title="Change your name">{known || 'Exile'}.</button>
            <button class="quill" onclick={startRename} disabled={connecting} tabindex="-1" aria-hidden="true">
              <span class="ring"><svg viewBox="0 0 24 24"><path d="M5 19l2.5-.6L18 7.9a1.9 1.9 0 0 0-2.7-2.7L4.8 15.7 4.2 18.2zM14 6.5l3.2 3.2" /></svg></span>
              <i>Change your name</i>
            </button>
          {/if}
        </p>
      {/if}
    </div>

    <nav class="menu" class:renaming class:lit aria-label="Start" onfocusin={focusIn} onfocusout={focusOut}>
      <!-- One cursor for the menu: it glides to the entry under the mouse (or the
           keyboard's), and cools away once nothing is pointed at. -->
      <MenuCursor at={cursor} {lit} />
      {#if invite}
        <div class="entry" role="presentation" class:cur={cursor === 0} onpointerenter={(ev) => hover(ev, 0)} onpointerleave={leave} in:fly={{ y: 12, duration: 500, delay: 450 }}>
          <button class="pick" bind:this={entryEls[0]} onclick={() => inviteField?.focus()} onfocus={() => (cursor = 0)}>
            {inviteHost ? `Join ${inviteHost}’s room` : 'Join the room'}
          </button>
          <div class="under">
            {#if connecting}
              <div class="slot" in:fly={SWAP_IN} out:fade={SWAP_OUT}><Connecting /></div>
            {:else}
              <form class="slot row" onsubmit={joinInvite} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
                <!-- svelte-ignore a11y_autofocus -->
                <input class="field name" bind:this={inviteField} bind:value={inviteName} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="nickname" spellcheck="false" autofocus />
                <button class="btn primary" type="submit">Join</button>
              </form>
            {/if}
          </div>
        </div>
        <div class="entry" role="presentation" class:cur={cursor === 1} class:dimmed={connecting} inert={connecting} onpointerenter={(ev) => hover(ev, 1)} onpointerleave={leave} in:fly={{ y: 12, duration: 500, delay: 520 }}>
          <button class="pick" bind:this={entryEls[1]} onclick={leaveInvite} onfocus={() => (cursor = 1)}>Something else</button>
          <div class="under"><p class="about">Create your own room, play hot-seat, or open the Codex.</p></div>
        </div>
      {:else}
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
            onpointerleave={leave}
            in:fly={{ y: 12, duration: 500, delay: 450 + i * 70 }}
          >
            <button class="pick" bind:this={entryEls[i]} onclick={() => choose(e)} onfocus={() => (cursor = i)} aria-expanded={e === 'create' || e === 'join' ? isOpen : undefined}>
              {MENU[e]}
            </button>
            <!-- The description and the fields share one cell, so one fades into the other. -->
            <div class="under">
              {#if isBusy}
                <div class="slot" in:fly={SWAP_IN} out:fade={SWAP_OUT}><Connecting /></div>
              {:else if isOpen && e === 'create'}
                <form class="slot row" onsubmit={host} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
                  <input class="field name" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="nickname" spellcheck="false" />
                  <button class="btn primary" type="submit">Create room</button>
                </form>
              {:else if isOpen && e === 'join'}
                <form class="slot row" onsubmit={join} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
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
                <p class="about" in:fly={SWAP_IN} out:fade={SWAP_OUT}>{about[e]}</p>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </nav>
  </div>

  <div class="today" in:fade={{ duration: 900, delay: 300 }}>
    {#if invite}
      <InviteRoom code={invite} info={inviteInfo} name={inviteName} />
    {:else}
      <DailyUnique disabled={connecting} />
    {/if}
  </div>

  {#if !invite}
    <div class="rooms" class:dimmed={connecting} inert={connecting} in:fly={{ y: 20, duration: 600, delay: 600 }}>
      <OpenRooms onJoin={joinListed} disabled={connecting} />
    </div>
  {/if}

  <footer>
    <div class="rule" aria-hidden="true"></div>
    <div class="band">
      <div class="made">
        <p class="credit">Made by <a class="maker" href={CREATOR_URL} target="_blank" rel="noopener noreferrer" title="{CREATOR} on Twitch">{CREATOR}</a></p>
        <a class="support" href={DONATE_URL} target="_blank" rel="noopener noreferrer" aria-describedby="support-note">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
          Support the project
          <span class="tip" id="support-note" role="tooltip">Optional tips help pay for the domain and development. Everything stays free.</span>
        </a>
      </div>
      <p class="fine">
        Unofficial fan project. Path of Exile is a trademark of Grinding Gear Games, who do not endorse this site. Data and art:
        <a href="https://poe2db.tw/us/Unique_item" target="_blank" rel="noreferrer">poe2db.tw</a>
      </p>
      <nav class="legal" aria-label="Legal">
        <a href={IMPRINT_URL}>Impressum</a>
        <span aria-hidden="true">·</span>
        <a href={PRIVACY_URL}>Datenschutz</a>
      </nav>
    </div>
  </footer>
</div>

<style>
  /* One stage, at most 1440 px wide and centred: two columns (the menu,
     Today's unique) at their own sizes, 1200 px across in all, then the open
     rooms across it, then the footer. Narrower windows give up side padding
     (down to 32 px) before anything else, then stack in the phone's order.
     Columns and rooms sit in the middle of the window's height, the footer at
     its bottom. On large windows the whole app is scaled up (lib/stage.ts,
     App.svelte's shell). */
  .home {
    --slot: 108px;
    width: 100%;
    max-width: 1440px;
    margin-inline: auto;
    /* The window's height, in the stage's (zoomed) pixels. */
    min-height: calc(100dvh / var(--stage-zoom, 1));
    display: grid;
    grid-template-columns: minmax(0, 452px) minmax(0, 510px);
    /* The free height splits above and below the block; the footer stays last. */
    grid-template-rows: 1fr auto auto 1fr auto;
    grid-template-areas:
      '. .'
      'intro today'
      'rooms rooms'
      '. .'
      'foot foot';
    justify-content: space-between;
    column-gap: 40px;
    padding: 26px max(32px, (min(100%, 1440px) - 1200px) / 2) 22px;
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
    margin-top: 32px;
  }

  /* ---- the title ---- */
  .title {
    --title-size: 92px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  /* Marks the beta build (poe2.quest/beta/), or the dev server's own rooms (Local), so testers know where they are. */
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
  /* The site's old kicker, under the title now: small, spaced capitals in the unique colour. */
  .kicker {
    position: relative;
    margin: 2px 0 4px;
    font-family: var(--font-display);
    font-size: 14px;
    line-height: 1.3;
    /* Ends under the tip of the Q's tail. */
    letter-spacing: 0.42em;
    text-transform: uppercase;
    color: var(--unique-hi);
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
  .who:disabled,
  span.who {
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
    height: var(--slot);
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
  /* The whole slot takes the click, as it takes the hover: no need to aim
     at the title. An open row sits above it, so its fields work as usual. */
  .pick::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .about {
    margin: 6px 0 0;
    font-style: italic;
    font-size: 16px;
    color: #ab9d88;
  }
  .under {
    display: grid;
  }
  .under > :global(*) {
    grid-area: 1 / 1;
  }
  .slot {
    position: relative;
    z-index: 1;
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
  @media (hover: hover) {
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
  /* A plain hairline, brightest in the middle, fading out at both ends. */
  .rule {
    height: 1px;
    margin: 0 4%;
    background: linear-gradient(90deg, transparent, rgba(125, 99, 51, 0.35) 20%, rgba(201, 164, 92, 0.55) 50%, rgba(125, 99, 51, 0.35) 80%, transparent);
  }
  /* One line on the page's axis. No diamonds between the groups (the diamond
     means the menu's cursor, a chosen thing): space alone sets them apart,
     28 px between groups against 12 px inside one. */
  .band {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 12px 28px;
    margin-top: 22px;
  }
  .made {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .credit {
    margin: 0;
    white-space: nowrap;
    font-family: var(--font-cinzel);
    font-size: 13px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #9b8e89;
  }
  .maker {
    font-family: var(--font-display);
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: none;
    color: var(--gold-hi);
    text-decoration: none;
    border-bottom: 1px dotted var(--gold-lo);
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
    gap: 6px;
    height: 26px;
    padding: 0 10px 0 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--font-cinzel);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-decoration: none;
    white-space: nowrap;
    color: #bcb0a6;
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
    /* The pill keeps to one line; its note wraps inside its box. */
    white-space: normal;
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
  /* As on the other pages: no underline, the footer's muted colour. */
  .legal a {
    text-decoration: none;
  }
  .legal {
    display: flex;
    gap: 0.4rem;
    font-size: 13px;
    color: var(--muted);
  }
  .fine a:hover,
  .legal a:hover {
    color: var(--gold-hi);
  }

  /* Short windows (laptops): a tighter rhythm, so the first row of open
     rooms is in view on a 1440 x 725 window and the next one peeks out. */
  @media (max-height: 859px) and (min-width: 1081px) {
    .home {
      --slot: 92px;
      --daily-circle: 456px;
      --daily-overlap: 44px;
      --daily-after-h: 36px;
      --daily-after-gap: 4px;
      --rooms-head-gap: 8px;
      padding-top: 16px;
    }
    .title {
      --title-size: 80px;
    }
    .greeting {
      margin: 8px 0 6px;
    }
    .today {
      padding-top: 0;
    }
    .rooms {
      margin-top: 8px;
    }
  }

  /* Too narrow for the two columns side by side: one column, in the phone's
     order (the menu, the open rooms, then Today's unique). */
  @media (max-width: 1080px) {
    .home {
      grid-template-columns: minmax(0, 560px);
      grid-template-rows: 1fr auto auto auto 1fr auto;
      grid-template-areas:
        '.'
        'intro'
        'rooms'
        'today'
        '.'
        'foot';
      justify-content: center;
    }
    .rooms {
      margin-top: 16px;
    }
    .today {
      padding-top: 32px;
    }
    .band {
      flex-direction: column;
      gap: 14px;
    }
  }
  /* Phones: the menu, the open rooms, then Today's unique; no cursor. */
  @media (max-width: 640px) {
    .home {
      grid-template-columns: minmax(0, 1fr);
      padding: 28px 16px 20px;
    }
    .title {
      --title-size: 54px;
    }
    .kicker {
      font-size: 11px;
      letter-spacing: 0.3em;
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
    .menu :global(.cursor) {
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
      height: 44px;
    }
  }
</style>
