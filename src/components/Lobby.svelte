<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { MAX_PLAYERS, RACE_DEFAULT_TIMER, TIMER_STEPS, difficultyOf, rulesFor, type Difficulty, type GameMode, type Spectator } from '../lib/game';
  import { DIFFICULTY_NAMES, describe } from '../lib/difficultyText';
  import CustomDifficulty from './CustomDifficulty.svelte';
  import DelveRules from './DelveRules.svelte';
  import ModeIcon from './ModeIcon.svelte';
  import { bestOf, findsMet, lastOf, loadRecords } from '../lib/delveRecord';
  import { MAX_NAME, isHeldName, nameHeld, nameTooShort } from '../lib/names';
  import { inviteUrl } from '../lib/site';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { kickConfirm } from '../lib/kick';
  import { creatorArrived, glyphLanded, playerArrived, refuse, twinkle } from '../lib/fx/moments';
  import { onMount } from 'svelte';
  import { categoryIcons, playerColor } from '../lib/ui';
  import { measure } from '../lib/iconFit.svelte';
  import { dock, phone } from '../lib/layout';
  import { portal } from '../lib/portal';
  import WatchToggle from './WatchToggle.svelte';
  import { MediaQuery } from 'svelte/reactivity';

  const TARGETS = [5, 10, 15, 20];
  const MODES: { id: GameMode; name: string; beta?: boolean }[] = [
    { id: 'turns', name: 'Take turns' },
    { id: 'race', name: 'Race' },
    { id: 'delve', name: 'Delve', beta: true },
  ];
  const DIFFS = (Object.entries(DIFFICULTY_NAMES) as [Difficulty, string][]).map(([id, name]) => ({ id, name }));

  const s = $derived(session.state!);
  const isHost = $derived(session.isHost);
  const local = $derived(session.mode === 'local');

  let newName = $state('');
  let nameError = $state(false);
  let copied = $state(false);

  const inviteLink = $derived(inviteUrl(session.code));
  /** Desktop: the start page's two columns, no panels. Tall: the modes' names go under their emblems. */
  const tall = new MediaQuery('(min-height: 860px)');
  // Measure the category cards' emblems (lib/iconFit) while the party
  // gathers, so the first deal doesn't have to.
  onMount(() => {
    const t = setTimeout(() => categoryIcons().forEach(measure), 1000);
    return () => clearTimeout(t);
  });

  function addLocal(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    // The held name needs this device unlocked here too, like on the start page.
    if (nameHeld(name)) {
      nameError = true;
      const field = (e.currentTarget as HTMLFormElement).querySelector('input');
      if (field) refuse(field);
      setTimeout(() => (nameError = false), 600);
      field?.focus();
      return;
    }
    const playerId = crypto.randomUUID();
    session.dispatch({ type: 'join', playerId, name });
    // Keep the name to fix it up if it was turned down (hot-seat applies it right away).
    if (session.state?.players.some((p) => p.id === playerId)) newName = '';
  }

  // Players already here when the lobby opens just appear; newcomers get an entrance.
  let settled = false;
  onMount(() => {
    const t = setTimeout(() => (settled = true), 600);
    return () => clearTimeout(t);
  });

  /** Svelte action: sparks when a code letter lands (its drop animation is staggered by index). */
  function landing(node: HTMLElement, i: number) {
    const t = setTimeout(() => glyphLanded(node), 330 + i * 80);
    return { destroy: () => clearTimeout(t) };
  }

  /** Svelte action: a new player's row arrives with a flash (zoe_arcana's is her own). */
  function arriving(node: HTMLElement, name: string) {
    if (!settled) return;
    const t = setTimeout(() => (isHeldName(name) ? creatorArrived(node) : playerArrived(node)), 120);
    return { destroy: () => clearTimeout(t) };
  }

  /**
   * Each letter is its own box, so a plain copy puts line breaks (pasted as
   * spaces) between them. Copy just the letters instead.
   */
  function copyCode(e: ClipboardEvent) {
    const text = getSelection()?.toString().replace(/\s/g, '');
    if (!text || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  }

  let copyBtn = $state<HTMLButtonElement>();

  // Online, removing bars them for the rest of the session, so it takes two
  // clicks, as the scoreboard's kick does (lib/kick): the same button asks
  // "Kick" for a few seconds, and a double click doesn't count as both.
  let confirming = $state<string | null>(null);
  const kicker = kickConfirm((id) => (confirming = id));
  onMount(() => kicker.dispose);
  function removePlayer(id: string) {
    if (local) session.dispatch({ type: 'remove', playerId: id });
    else if (kicker.click(id)) session.kick(id);
  }
  /** A removed chip goes out with a red flare, shrinking a little, as it fades: the others then close up (flip).
      It shrinks with `scale`, not `transform`: Svelte pins a leaving chip in place with a transform, which a transform here would override (the chip would jump to the grid's first cell). */
  function kickOut(_node: Element) {
    return {
      duration: 320,
      css: (t: number) => `opacity: ${t}; scale: ${0.9 + 0.1 * t}; box-shadow: 0 0 ${18 * (1 - t)}px rgba(224, 85, 63, ${0.7 * (1 - t) * t * 4});`,
    };
  }
  /** Escape takes an armed kick back. */
  function disarm(e: KeyboardEvent) {
    if (e.key === 'Escape') kicker.disarm();
  }
  /** A press anywhere but the armed Kick takes it back too. */
  function disarmOutside(e: PointerEvent) {
    if (!(e.target as Element).closest?.('.remove.confirm')) kicker.disarm();
  }
  /** Phones hand the link to the share sheet instead of the clipboard (see copy), so the button says so. */
  const canShare = typeof navigator !== 'undefined' && !!navigator.share && matchMedia('(pointer: coarse)').matches;

  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(copiedTimer));
  async function copy() {
    if (copyBtn) twinkle(copyBtn);
    try {
      if (canShare) {
        await navigator.share({ title: 'PoE2.Quest', text: `Join my PoE2 trivia room ${session.code}`, url: inviteLink });
      } else {
        await navigator.clipboard.writeText(inviteLink);
        copied = true;
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => (copied = false), 1800);
      }
    } catch {
      /* dismissed */
    }
  }

  function setTarget(v: number) {
    session.dispatch({ type: 'settings', settings: { targetScore: v } });
  }
  function setMode(mode: GameMode) {
    session.dispatch({ type: 'settings', settings: mode === 'race' && s.settings.timer === 0 ? { mode, timer: RACE_DEFAULT_TIMER } : { mode } });
  }
  /** Hot-seat: Race can't be played here, so tapping it only says why (for a few seconds, in the mode's description). */
  let peek = $state(false);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(peekTimer));
  const offline = (m: GameMode) => m === 'race' && local;
  function pickMode(m: GameMode, node: HTMLElement) {
    if (offline(m)) {
      refuse(node);
      peek = true;
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => (peek = false), 3500);
      return;
    }
    peek = false;
    if (m !== s.settings.mode) setMode(m);
  }
  /** The modes are a radio group: the arrow keys move the choice along it (skipping Race in hot-seat). */
  function modeKeys(e: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || !isHost) return;
    e.preventDefault();
    const open = MODES.filter((m) => !offline(m.id));
    const i = open.findIndex((m) => m.id === s.settings.mode);
    const next = open[(i + step + open.length) % open.length].id;
    setMode(next);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus();
  }
  // The deepest this browser has delved, alone or together (hot-seat is always alone).
  const records = loadRecords();
  const bestAlone = bestOf(records, true)?.depth ?? null;
  const bestTogether = bestOf(records, false)?.depth ?? null;
  const deepest = $derived(s.players.length < 2 ? bestAlone : local ? null : bestTogether);
  // The last run of the same kind: the descent marks it with a red star.
  const lastAlone = lastOf(records, true)?.depth ?? null;
  const lastTogether = lastOf(records, false)?.depth ?? null;
  const lastRun = $derived(s.players.length < 2 ? lastAlone : local ? null : lastTogether);
  const deepestLabel = $derived(s.players.length < 2 ? 'Your deepest alone' : 'Your deepest together');
  // The finds this browser's player has met, alone or together: the drawing of the descent marks where each first turns up.
  const met = [...findsMet()];

  function setLocked(v: boolean) {
    session.dispatch({ type: 'settings', settings: { locked: v } });
  }
  function setPublic(v: boolean) {
    session.dispatch({ type: 'settings', settings: { public: v } });
  }
  function setTimer(v: number) {
    session.dispatch({ type: 'settings', settings: { timer: v } });
  }
  /** Host only: the custom difficulty's editor. */
  let editing = $state(false);
  function setDifficulty(v: Difficulty) {
    if (v === 'custom') editing = true;
    if (v !== difficulty) session.dispatch({ type: 'settings', settings: { difficulty: v } });
  }
  function start() {
    session.dispatch({ type: 'start' });
  }

  /** Delve on one device is a run alone: together, it's played online (the engine refuses it too). */
  const delveCrowded = $derived(local && s.settings.mode === 'delve' && s.players.length > 1);
  /** Delve together: a room of two or more online plays as a team. */
  const together = $derived(!local && s.players.length > 1);
  const full = $derived(s.players.length >= MAX_PLAYERS);
  const alone = $derived(s.players.length < 2);
  /** Nobody new can come in: locked, or every seat taken. */
  const closed = $derived(!!s.settings.locked || full);
  const canStart = $derived(s.players.length >= 1 && !delveCrowded);
  /** Spectators left over when the last game filled every seat. */
  const waiting = $derived((s.spectators ?? []).filter((o) => !o.stay));
  /** Spectators who chose to watch rather than play. */
  const watching = $derived((s.spectators ?? []).filter((o) => o.stay));
  const you = (o: Spectator) => o.name + (o.id === session.myPlayerId ? ' (you)' : '');
  const race = $derived(s.settings.mode === 'race');
  const delve = $derived(s.settings.mode === 'delve');
  const difficulty = $derived(difficultyOf(s.settings.difficulty));
  const lockout = $derived(rulesFor(s.settings).lockout);
</script>

{#snippet startRow()}
  {#if isHost}
    <!-- Beside the start, the one thing to know before pressing it. -->
    {#if delveCrowded}
      <p class="go-note warn">Delve on one device is for one player. Remove the others, or host a room.</p>
    {:else if local && !s.players.length}
      <p class="go-note">Add the first exile to begin.</p>
    {:else if !local && s.players.length < 2}
      <p class="go-note">You can begin alone, or wait for your party.</p>
    {:else}
      <p class="go-note"><b class="num">{s.players.length}</b> {s.players.length === 1 ? 'exile' : 'exiles'} ready</p>
    {/if}
    <!-- Begin is the gold button whenever it can start: playing alone is a normal game. -->
    <button class="btn big primary" disabled={!canStart} onclick={start}>{delve ? 'Begin the descent' : 'Begin the hunt'}</button>
  {:else}
    <p class="muted waiting"><span class="pulse"></span>Waiting for the host to start…</p>
  {/if}
{/snippet}

<!-- The start page's two columns carry on here: on the left, where its menu
     was, the room and the party; on the right, where today's unique was, the
     game. Begin closes the right column, in the same corner at every size,
     and the party's chips are the ones the game shows along its top. -->
<div class="lobby" class:online={!local}>
  <div class="cols">
    <div class="col side">
      {#if !local}
        <!-- The room code and link are how the party grows, so they come first. -->
        <section class="block room" in:fly={{ x: -30, duration: 500, delay: 50 }}>
          <header>
            <h2>Room code</h2>
          </header>
          <div class="code" class:hidden={session.hideCode} aria-label={session.hideCode ? 'Room code hidden' : `Room code ${session.code}`}>
            <span class="glyphs" oncopy={copyCode}>
              {#each session.code.split('') as ch, i (i)}
                <span class="glyph" use:landing={i} style:animation-delay="{i * 80}ms" style:--i={i}>{session.hideCode ? '•' : ch}</span>
              {/each}
            </span>
          </div>
          <div class="invite-row">
            <!-- A locked or full room takes nobody new: the link isn't offered then, and the button says why. -->
            <button class="btn invite" class:accent={alone && isHost && !closed} bind:this={copyBtn} onclick={copy} disabled={closed}>
              {s.settings.locked ? 'Room locked' : full ? 'Room full' : copied ? 'Link copied!' : canShare ? 'Share invite link' : 'Copy invite link'}
            </button>
            <!-- Hiding the code (for a stream) sits with the other ways of handing it on. -->
            <button
              class="room-tool"
              onclick={() => session.setHideCode(!session.hideCode)}
              title={session.hideCode ? 'Show the room code' : 'Hide the room code (for streaming)'}
              aria-label={session.hideCode ? 'Show room code' : 'Hide room code'}
            >
              {#if session.hideCode}
                <svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.1 6.1C3.5 8 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.9-2.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
              {:else}
                <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              {/if}
            </button>
          </div>
          <div class="room-actions">
            {#if isHost}
              <span class="who">Who can join</span>
              <!-- One switch, both its sides named: the lit plate slides under the side that holds, as the game's own choices light. -->
              <button
                class="vis-toggle"
                class:public={!!s.settings.public}
                role="switch"
                aria-checked={!!s.settings.public}
                aria-label="Public room"
                onclick={() => setPublic(!s.settings.public)}
                title={s.settings.public ? 'Listed under Open rooms on the start page' : 'Only people with the code or link can join'}
              >
                <span class="vt-plate" aria-hidden="true"></span>
                <span class="vt-word" class:on={!s.settings.public}>Private</span>
                <span class="vt-word" class:on={!!s.settings.public}>Public</span>
              </button>
              <button
                class="lock"
                class:on={!!s.settings.locked}
                onclick={() => setLocked(!s.settings.locked)}
                title={s.settings.locked ? 'Let new players join again' : 'Stop new players from joining or watching'}
              >
                {#if s.settings.locked}
                  <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  Locked
                {:else}
                  <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
                  Lock
                {/if}
              </button>
            {:else}
              <span class="vis-tag">{s.settings.public ? 'Public room' : 'Private room'}{s.settings.locked ? ' · locked' : ''}</span>
            {/if}
          </div>
          {#if isHost}
            <p class="vis-hint">
              {#if s.settings.locked}
                Room locked: nobody new can join or watch. Players already in the game can still reconnect.
              {:else if full}
                Room full: a seat opens when someone leaves.
              {:else if s.settings.public}
                Anyone can find this room under “Open rooms”.
              {:else}
                Only people with the code or link can join.
              {/if}
            </p>
          {/if}
          <!-- The same words as the start page's note on open rooms, said where joining is decided. -->
          <p class="ip-note">Players in a room connect directly, so they can see each other's IP address. Only play with people you're comfortable sharing that with.</p>
        </section>
      {/if}

      {#if local}
        <!-- On one device the party grows by name: its own block over the party, where the room code stands online, so the field never sits among the chips. -->
        <section class="block room adder" in:fly={{ x: -30, duration: 500, delay: 50 }}>
          <header>
            <h2>Add exiles</h2>
          </header>
          {#if s.players.length < MAX_PLAYERS}
            <form class="add" onsubmit={addLocal}>
              <input
                class="field"
                class:shake={nameError}
                bind:value={newName}
                maxlength={MAX_NAME}
                autocomplete="off"
                spellcheck="false"
                placeholder="Exile's name"
                aria-label="Exile's name"
              />
              <button class="btn" type="submit" disabled={nameTooShort(newName)}>Add</button>
            </form>
          {/if}
          <p class="vis-hint">Pass the device around; each player answers on their own turn.</p>
        </section>
      {/if}

      <section class="block party" in:fly={{ x: -30, duration: 500, delay: 100 }}>
        <header>
          <h2>Party</h2>
          <!-- Every seat as a pip, filled as exiles take them: how many more can come, at a glance. -->
          <span class="count">
            <span class="pips" aria-hidden="true">{#each { length: MAX_PLAYERS } as _, i (i)}<i class:taken={i < s.players.length}></i>{/each}</span>
            {s.players.length} / {MAX_PLAYERS}
          </span>
        </header>
        <!-- The same chips the game shows along its top, two to a row. -->
        <ul class="chips">
          {#each s.players as p (p.id)}
            <li
              use:arriving={p.name}
              animate:flip={{ duration: 300 }}
              in:fly={{ x: -20, duration: 350 }}
              out:kickOut
              class:armed={confirming === p.id}
              style:--c={playerColor(p.hue)}
            >
              <Avatar name={p.name} hue={p.hue} size={32} />
              <span class="name" title={p.name}><PlayerName name={p.name} />{#if !local && p.id === session.myPlayerId && s.players.length > 1}<em>&nbsp;(you)</em>{/if}</span>
              {#if !p.connected}<span class="tag" title="Reconnecting. Their seat is let go if they're not back when the game starts.">Offline</span>{/if}
              <!-- The host's chip carries a hanging banner, the party's standard, where the others have their ×. -->
              {#if p.id === s.hostId && !local}<span class="host" role="img" aria-label="Host" title="Host"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 3.5h15" /><path d="M7 3.5V19l5-3.4 5 3.4V3.5" /><path d="M12 7.2l1.6 1.6-1.6 1.6-1.6-1.6z" /></svg></span>{/if}
              {#if isHost && (local || p.id !== s.hostId)}
                <button
                  class="remove"
                  class:confirm={confirming === p.id}
                  title="Remove {p.name}"
                  aria-label="Remove {p.name}"
                  onclick={() => removePlayer(p.id)}
                  >{confirming === p.id ? 'Kick' : '×'}</button
                >
              {/if}
            </li>
          {/each}
        </ul>
        {#snippet onlookers(list: Spectator[])}
          {#each list as o, i (o.id)}{i ? ', ' : ''}{you(o)}{#if isHost}<button
                class="remove inline"
                title="Remove {o.name}"
                aria-label="Remove {o.name}"
                onclick={() => session.kick(o.id)}>×</button
              >{/if}{/each}
        {/snippet}
        {#if waiting.length}
          <p class="hint">Waiting for a free seat: {@render onlookers(waiting)}</p>
        {/if}
        {#if watching.length}
          <p class="hint">Just watching: {@render onlookers(watching)}</p>
        {/if}
        {#if !local && !isHost && session.myPlayerId}
          <!-- A guest can sit the games out and watch, and take a seat again. -->
          <p class="watch-choice"><WatchToggle /></p>
        {/if}
        {#if !local && s.players.length < 2}
          <p class="hint waiting"><span class="pulse"></span>{isHost ? 'Nobody else yet. Send your party the code or the link.' : 'Waiting for more exiles to join…'}</p>
        {/if}
        {#if delve && !local}
          <!-- Co-op is about the party, so it is told under it: in a team room, or one a second player can still join (on one device, Delve is for one). -->
          <div class="setting together">
            <span class="label">Play co-op together</span>
            {#if !together}
              <p class="together-when">Once a second exile joins this room:</p>
            {/if}
            <ul class="rules coop">
              <li>Vote for a card, then one is drawn from the votes.</li>
              <li>Everyone answers at once. A wrong answer is crossed out for everyone.</li>
              <li>Teammates can sacrifice their life force to revive you.</li>
            </ul>
          </div>
        {/if}
      </section>
    </div>

    <!-- The game is the one framed panel: the settings and Begin are what the host works with. -->
    <section class="col block game settings panel" use:backdropShadow={{ fill: 'linear' }} in:fly={{ x: 30, duration: 500, delay: 200 }}>
      <header><h2>Game</h2></header>

      <div class="setting">
        <div class="modes" class:tall={tall.current} role="radiogroup" aria-label="Mode" aria-describedby="mode-blurb" tabindex={-1} onkeydown={modeKeys}>
          {#each MODES as m (m.id)}
            {@const on = s.settings.mode === m.id}
            <button
              class="mode"
              class:on
              class:off={offline(m.id)}
              role="radio"
              aria-checked={on}
              aria-disabled={offline(m.id) || undefined}
              tabindex={on ? 0 : -1}
              data-mode={m.id}
              aria-label={m.beta ? `${m.name}, beta` : undefined}
              disabled={!isHost && !on}
              title={offline(m.id) ? 'Race needs every player on their own device' : undefined}
              onclick={(e) => isHost && pickMode(m.id, e.currentTarget)}
            >
              <ModeIcon mode={m.id} />
              <b>{m.name}</b>
              {#if m.beta}<span class="beta" aria-hidden="true">Beta</span>{/if}
            </button>
          {/each}
        </div>
        <!-- The chosen mode's description, under a notch that points up at it. -->
        <div class="about" id="mode-blurb" style:--at={peek ? 1 : MODES.findIndex((m) => m.id === s.settings.mode)} class:peek>
          <span class="about-frame" aria-hidden="true"></span>
          {#key peek ? 'peek' : s.settings.mode}
            <div class="about-text" in:fly={{ y: -6, duration: 260 }}>
              {#if peek}
                <p>Race is online only: everyone answers on their own device. Host a room to race.</p>
              {:else if delve}
                <!-- Several on one device can't delve; the line under Begin says what to do instead. -->
                <p>{together ? 'How deep can your team go, on three lives each?' : 'How deep can you go on three lives?'} Questions increase in difficulty.</p>
              {:else if race}
                <p>Same question for everyone at once; the fastest right answer scores. Online only.</p>
              {:else}
                <p>Take turns picking a category and naming the item. Online or on one device.</p>
              {/if}
            </div>
          {/key}
        </div>
      </div>

      {#if delve}
        <!-- The descent is Delve's progress: it is never cut. -->
        <!-- On a desktop the descent takes the height the panel has spare, at its own width:
             the gap to the finds is only what its leader lines need. -->
        <div class="delve-slot">
          <DelveRules {deepest} last={lastRun} label={deepestLabel} {met} />
        </div>
      {:else}
        <!-- One row per setting: its name, then its choices (a guest, who can't change them, reads the value). -->
        <div class="setting row">
          <span class="label">Points to win</span>
          {#if !isHost}<b class="val num">{s.settings.targetScore}</b>{:else}
          <div class="seg">
            {#each TARGETS as t (t)}
              <button class:on={s.settings.targetScore === t} disabled={!isHost} onclick={() => setTarget(t)}>{t}</button>
            {/each}
            <span class="stepper">
              <button disabled={!isHost || s.settings.targetScore <= 1} onclick={() => setTarget(s.settings.targetScore - 1)} aria-label="Fewer points">−</button>
              <b>{s.settings.targetScore}</b>
              <button disabled={!isHost || s.settings.targetScore >= 50} onclick={() => setTarget(s.settings.targetScore + 1)} aria-label="More points">+</button>
            </span>
          </div>
          {/if}
        </div>

        <div class="setting row">
          <span class="label">Difficulty</span>
          {#if !isHost}<b class="val">{DIFFICULTY_NAMES[difficulty]}</b>{:else}
          <div class="seg">
            {#each DIFFS as d (d.id)}
              {@const edit = d.id === 'custom' && difficulty === 'custom' && isHost}
              <button
                class:on={difficulty === d.id}
                class:edit
                disabled={!isHost}
                onclick={() => setDifficulty(d.id)}
                title={edit ? 'Edit the custom difficulty' : undefined}
              >
                {d.name}
                {#if edit}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
                {/if}
              </button>
            {/each}
          </div>
          {/if}
          <!-- Every description sits in the same cell, so switching never changes the column's height. -->
          <div class="blurbs">
            {#each DIFFS as d (d.id)}
              <p class="blurb" class:shown={difficulty === d.id} aria-hidden={difficulty !== d.id}>
                {describe({ ...s.settings, difficulty: d.id })}
              </p>
            {/each}
          </div>
        </div>

        <div class="setting row">
          <span class="label">Time per question</span>
          {#if !isHost}<b class="val">{s.settings.timer === 0 ? 'No limit' : `${s.settings.timer}s`}</b>{:else}
          <div class="seg">
            {#each TIMER_STEPS as t (t)}
              <button class:on={s.settings.timer === t} disabled={!isHost || (race && t === 0)} title={race && t === 0 ? 'Race needs a time limit' : undefined} onclick={() => setTimer(t)}>
                {t === 0 ? 'Off' : `${t}s`}
              </button>
            {/each}
          </div>
          {/if}
        </div>

        <ul class="rules">
          {#if race}
            <li>A wrong answer costs a point and sits you out until the next question.</li>
            <li>First to <span class="num">{s.settings.targetScore}</span> wins.</li>
          {:else}
            <li>
              A right answer scores a point{#if lockout > 0}; the category stays locked for your next <span class="num">{lockout}</span> turns{/if}.
            </li>
            <li>First to <span class="num">{s.settings.targetScore}</span> wins once the round is over; a tie goes to sudden death.</li>
          {/if}
        </ul>
      {/if}

      <!-- The start ends the rules. On phones, where they run long, it is pinned
           to the bottom of the screen like the reveal's Next bar (lib/layout's dock).
           A guest's waiting line has nothing to tap, so it stays in place. -->
      {#if phone.current && isHost}
        <div class="dock" use:portal use:dock in:fade={{ duration: 200 }} out:fade|global={{ duration: 180 }}>{@render startRow()}</div>
      {:else}
        <div class="start">{@render startRow()}</div>
      {/if}
    </section>
  </div>
</div>

<svelte:window onkeydown={disarm} onpointerdown={disarmOutside} />

{#if editing && isHost && difficulty === 'custom' && !delve}
  <CustomDifficulty onclose={() => (editing = false)} />
{/if}

<style>
  /* The start page's stage: 1200 wide in the middle of the window. */
  .lobby {
    width: min(980px, 100%);
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .room-actions {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .code.hidden .glyph {
    color: var(--gold-lo);
  }
  .lock {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    color: var(--muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .lock {
    padding: 0.4em 0.8em;
    border-radius: 3px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .lock.on {
    color: #ffcf9e;
    border-color: #8c5a2c;
    background: rgba(140, 90, 44, 0.25);
  }
  .lock:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .lock svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .lock svg {
    width: 13px;
    height: 13px;
  }
  .ip-note {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    opacity: 0.8;
  }
  /* Private / Public: one switch with both words on it, drawn like the game's
     other choices (the setting buttons): a dark well, and the lit plate of a
     chosen button sliding under the word that holds. */
  .vis-toggle {
    position: relative;
    flex: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 150px;
    height: 32px;
    padding: 0;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .vt-plate {
    position: absolute;
    top: -1px;
    bottom: -1px;
    left: -1px;
    width: calc(50% + 1px);
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border: 1px solid var(--gold);
    border-radius: 3px;
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.3),
      0 0 14px rgba(201, 164, 92, 0.3);
    transition: translate 0.3s var(--ease-out);
  }
  .vis-toggle.public .vt-plate {
    translate: calc(100% - 1px) 0;
  }
  .vt-word {
    position: relative;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    transition:
      color 0.3s,
      text-shadow 0.3s;
  }
  .vt-word.on {
    color: #fff1cf;
    text-shadow: 0 0 10px rgba(255, 220, 160, 0.5);
  }
  .vis-toggle:hover {
    border-color: var(--gold-lo);
  }
  .vis-toggle:hover .vt-word:not(.on) {
    color: var(--gold-hi);
  }
  .vis-toggle:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 2px;
  }
  .vis-tag {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .vis-hint {
    margin: 0;
    font-size: 0.9rem;
    font-style: italic;
  }
  .block {
    min-width: 0;
  }
  .room {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  /* The room's gap after its heading is the column's own (its children are spaced by the flex gap). */
  .block.room header {
    margin-bottom: calc(1rem - 0.6rem);
  }
  .room .room-actions {
    justify-content: flex-start;
    flex-wrap: nowrap;
  }
  /* The label takes what is left, so Private, Public and Lock stay on one line. */
  .who {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    color: #b8ab95;
  }
  .invite-row {
    position: relative;
    display: flex;
    gap: 0.5rem;
  }
  .invite-row .invite {
    flex: 1;
  }
  /* Alone in an open room, inviting is the next step: lit in gold, but not gold itself (Begin is). */
  .invite.accent {
    border-color: var(--gold);
    color: var(--gold-hi);
    box-shadow:
      inset 0 0 0 1px rgba(201, 164, 92, 0.25),
      0 0 16px rgba(201, 164, 92, 0.18);
  }
  .room-tool {
    width: 44px;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .room-tool:hover:not(:disabled) {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .room-tool:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .room-tool svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .ip-note {
    margin: 0;
    text-align: left;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #8f8370;
  }
  .code,
  .glyphs {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }
  /* The boxes share the panel's width, so the letters are sized from it (six
     boxes, five gaps), never wider than a box: an M or a W must not be clipped. */
  .glyphs {
    container-type: inline-size;
  }
  /* One click or long press selects the whole code. */
  .glyphs {
    -webkit-user-select: all;
    user-select: all;
  }
  .glyph {
    flex: 1;
    min-width: 0;
    height: clamp(58px, 14vw, 72px);
    display: grid;
    place-items: center;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: min(2.6rem, (100cqi - 5 * 0.5rem) / 6 * 0.74);
    color: var(--gold-hi);
    background: linear-gradient(180deg, #221a11, #0d0a07);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 0 18px rgba(201, 164, 92, 0.12),
      0 6px 18px rgba(0, 0, 0, 0.6);
    text-shadow: 0 0 16px rgba(241, 217, 155, 0.45);
    animation: drop 0.6s var(--ease-back) both;
    position: relative;
    overflow: hidden;
  }
  /* Light glances off the letters one after another. */
  .glyph::after {
    content: '';
    position: absolute;
    inset: -20% auto -20% -80%;
    width: 60%;
    background: linear-gradient(100deg, transparent, rgba(255, 240, 200, 0.22), transparent);
    transform: skewX(-16deg);
    animation: glance 6s ease-in-out infinite;
    animation-delay: calc(1.2s + var(--i, 0) * 0.12s);
    pointer-events: none;
  }
  @keyframes glance {
    0% {
      translate: 0 0;
    }
    18%,
    100% {
      translate: 420% 0;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-18px) rotateX(70deg);
    }
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr 1.33fr;
    gap: 1.2rem;
    align-items: start;
  }
  .col.side {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    min-width: 0;
  }
  .panel {
    padding: 1.4rem;
  }
  /* A section's name, as the start page names its own ("Open rooms"). */
  .block header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .block h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 1.12rem;
    letter-spacing: 0.02em;
    text-transform: none;
    color: var(--gold);
  }
  .count {
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    color: #ab9d88;
  }

  /* The game's own player chips (Scoreboard), so the party carries on into the game. */
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  /* The game's own chip (Scoreboard's li): the same pill, padding, avatar and name. */
  .chips li {
    transition: border-color 0.25s;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    padding: 0.45rem 0.8rem 0.45rem 0.5rem;
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.75);
    border: 1px solid var(--line);
  }
  .chips .name {
    margin-left: 2px;
    font-size: 0.98rem;
    line-height: 1.1;
    padding-bottom: 0.2em;
    margin-bottom: -0.2em;
  }
  .chips .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  /* The host: a hanging banner, the party's standard, where the others have their ×. Not the diamond: that is the menu's cursor, "you are here". */
  .host {
    flex: none;
    display: grid;
    place-items: center;
    margin: 0 0.2rem 0 0.3rem;
    color: #d8b56e;
    filter: drop-shadow(0 0 5px rgba(241, 217, 155, 0.45));
  }
  .host svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }
  .pips {
    display: inline-flex;
    gap: 3px;
  }
  .pips i {
    width: 6px;
    height: 6px;
    rotate: 45deg;
    border: 1px solid rgba(125, 99, 51, 0.7);
  }
  .pips i.taken {
    background: var(--gold);
    border-color: var(--gold);
    box-shadow: 0 0 6px rgba(201, 164, 92, 0.45);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 1.05rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-family: var(--font-display);
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 0.2em 0.6em;
    border-radius: 2px;
    border: 1px solid var(--gold-lo);
    color: var(--gold);
  }
  .remove {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 13px;
    border: 1px solid transparent;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 1.2rem;
    line-height: 1;
  }
  /* Armed: the ring the × shows under the pointer grows sideways into a pill
     and the × gives way to Kick. Same ring, same red, only longer. */
  .remove {
    overflow: hidden;
    white-space: nowrap;
    transition:
      width 0.22s var(--ease-out),
      color 0.2s,
      border-color 0.2s,
      background-color 0.2s,
      box-shadow 0.2s;
  }
  .remove.confirm {
    width: 58px;
    border-color: rgba(224, 85, 63, 0.75);
    background-color: rgba(224, 85, 63, 0.1);
    color: #ff9c86;
    font-family: var(--font-display);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    box-shadow: 0 0 10px rgba(224, 85, 63, 0.25);
  }
  .remove.confirm:hover {
    color: #ffd2c6;
    border-color: #e0553f;
    background-color: rgba(224, 85, 63, 0.22);
  }
  .remove.inline {
    width: 22px;
    height: 22px;
    font-size: 1rem;
  }
  .remove:hover {
    color: var(--bad);
    border-color: rgba(224, 85, 63, 0.4);
  }
  .remove:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 2px;
  }
  /* Pointing at the ×: the chip it would remove warms red, so it is clear whose it is. */
  .chips li:has(.remove:hover) {
    border-color: rgba(224, 85, 63, 0.45);
  }
  /* Armed: the whole chip asks, in the game's wrong-answer colours, the avatar dimmed, and
     no timer drawn: after 3 s it quietly goes back to rest. A second
     click in the first 350 ms (a double click) does nothing; Escape takes it back. */
  .chips li {
    position: relative;
  }
  .chips li.armed {
    border-color: #8e4434;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
  }
  .chips li.armed :global(.avatar) {
    filter: saturate(0.4) brightness(0.75);
  }
  .chips li.armed .name {
    color: #eab3a3;
  }
  .add {
    display: flex;
    gap: 0.5rem;
  }
  .add .field {
    flex: 1;
    min-width: 0;
  }
  .shake {
    animation: shake 0.45s;
    border-color: var(--bad);
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
  .hint {
    margin: 0.8rem 0 0;
    font-size: 0.95rem;
    font-style: italic;
  }
  .watch-choice {
    margin: 0.6rem 0 0;
    text-align: center;
  }
  .waiting {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gold);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
      transform: scale(0.7);
    }
  }

  .setting {
    margin-bottom: 1.2rem;
  }
  /* A setting on one line: its name, then its choices; a description runs underneath. */
  .setting.row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.4rem 1rem;
    margin-bottom: 0;
    padding: 0.8rem 0;
    border-top: 1px solid rgba(59, 48, 36, 0.6);
  }
  /* A setting's name reads as words, not as a caption: the section names above it carry the caps. */
  .setting.row .label,
  .together .label {
    margin: 0;
    font-family: var(--font-body);
    font-size: 1rem;
    letter-spacing: 0;
    text-transform: none;
    color: #c4b69c;
  }
  .setting.row .blurbs {
    grid-column: 1 / -1;
    margin: 0;
  }
  .val {
    font-family: var(--font-display);
    color: var(--gold-hi);
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  /* Icon and name side by side: the same buttons, half as tall. */
  .mode {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-width: 0;
    min-height: 52px;
    padding: 0.5rem 0.4rem;
    color: var(--gold);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .mode b {
    font-family: var(--font-display);
    font-size: 0.9rem;
    letter-spacing: 0.06em;
    white-space: nowrap;
    color: var(--gold-hi);
  }
  .mode:hover:not(:disabled) {
    border-color: var(--gold-lo);
    --glow: 0.26;
  }
  .mode.on {
    color: var(--gold-hi);
    --glow: 0.34;
    background: linear-gradient(180deg, rgba(122, 79, 29, 0.55), rgba(69, 42, 14, 0.55));
    border-color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.2),
      inset 0 0 18px rgba(255, 150, 60, 0.12),
      0 0 18px rgba(201, 164, 92, 0.25);
  }
  .mode.on b {
    text-shadow: 0 0 12px rgba(241, 217, 155, 0.45);
  }
  /* A small engraved tag in the corner, clear of the emblem, like the site's own Beta mark. */
  .mode .beta {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 1px 2px 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.5rem;
    line-height: 1.4;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--unique-hi);
    border: 1px solid rgba(224, 138, 68, 0.45);
    border-radius: 2px;
    pointer-events: none;
  }
  .mode:disabled {
    cursor: default;
  }
  .mode:disabled:not(.on),
  .mode.off {
    opacity: 0.5;
  }
  .mode.off {
    cursor: not-allowed;
  }
  .mode:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 2px;
  }
  /* The chosen mode's description, notched under its button. The box and its
     notch are drawn solid in one layer that is faded as a whole, so they merge
     into one shape: the notch can reach into the box's border (no hairline gap
     where they meet) without the overlap showing darker. */
  .about {
    --notch: 7px;
    position: relative;
    margin-top: calc(0.5rem + var(--notch));
    padding: 0.55rem 0.8rem 0.6rem;
  }
  .about-frame {
    --line: #c9a45c;
    position: absolute;
    inset: 0;
    opacity: 0.32;
    background: rgba(0, 0, 0, 0.94);
    border: 1px solid var(--line);
    border-radius: 4px;
    pointer-events: none;
  }
  .about-frame::before {
    content: '';
    position: absolute;
    /* One pixel into the border, so the two always touch. */
    top: calc(-1 * var(--notch));
    /* Under the middle of the chosen button: three columns, two gaps of 0.5rem. */
    left: calc((100% - 1rem) / 6 + var(--at, 0) * ((100% - 1rem) / 3 + 0.5rem) - var(--notch) - 1px);
    width: calc(2 * var(--notch));
    height: var(--notch);
    background: var(--line);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    transition: left 0.45s cubic-bezier(0.44, 0.09, 0.38, 1.04);
  }
  .about.peek .about-frame {
    --line: #e0553f;
  }
  .about-text {
    position: relative;
  }
  .about p {
    margin: 0;
    font-size: 0.95rem;
    font-style: italic;
    line-height: 1.35;
    color: #e3d3b4;
  }
  .together-when {
    margin: 0 0 0.45rem;
    font-size: 0.93rem;
    font-style: italic;
    line-height: 1.25;
  }
  .together {
    margin: 1.2rem 0 0;
  }
  /* Kept compact: a handful of short lines. */
  .rules.coop {
    margin: 0;
    font-size: 0.93rem;
    line-height: 1.3;
  }
  .rules.coop li {
    margin: 0.2rem 0;
  }
  /* Numbers among the words are set in Cinzel, as everywhere in the game. */
  .num {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.86em;
  }
  .blurbs {
    display: grid;
    margin: 0.5rem 0 0;
  }
  .blurb {
    grid-area: 1 / 1;
    margin: 0;
    font-size: 0.95rem;
    font-style: italic;
    opacity: 0;
    visibility: hidden;
    translate: 0 -4px;
    transition:
      opacity 0.25s,
      translate 0.25s,
      visibility 0s 0.25s;
  }
  .blurb.shown {
    opacity: 1;
    visibility: visible;
    translate: 0 0;
    transition:
      opacity 0.25s,
      translate 0.25s;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .seg > button,
  .stepper button {
    min-width: 48px;
    padding: 0.45rem 0.7rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .seg > button:hover:not(:disabled),
  .stepper button:hover:not(:disabled) {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .seg > button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border-color: var(--gold);
    text-shadow: 0 0 10px rgba(255, 220, 160, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.3),
      0 0 14px rgba(201, 164, 92, 0.3);
  }
  .seg > button:active:not(:disabled),
  .stepper button:active:not(:disabled),
  .mode:active:not(:disabled, .off) {
    transform: scale(0.96);
  }
  .seg button:disabled {
    cursor: default;
  }
  .seg > button:disabled:not(.on) {
    opacity: 0.5;
  }
  .seg > button.edit {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
  }
  .seg > button svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  /* Round, like the panel's other small icon buttons (the code's eye, the open rooms' refresh). */
  .stepper button {
    width: 34px;
    min-width: 0;
    height: 34px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-family: var(--font-body);
    font-size: 1.1rem;
    font-weight: 400;
    line-height: 1;
  }
  .stepper b {
    min-width: 2ch;
    text-align: center;
    font-family: var(--font-display);
    color: var(--gold-hi);
  }

  .rules {
    margin: 0.4rem 0 1.4rem;
    padding-left: 1.2rem;
    font-size: 0.98rem;
  }
  .rules li {
    margin: 0.25rem 0;
  }
  .rules li::marker {
    color: var(--unique);
    content: '◆  ';
    font-size: 0.7em;
  }

  /* The start closes the panel: what to know on the left, the button on the right. */
  /* What to know, then Begin: read together, as one unit at the end of the rules. */
  .start {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.2rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--line);
  }
  .start .waiting {
    margin: 0 auto;
  }
  .start .btn {
    flex: none;
  }
  .go-note {
    margin: 0;
    font-style: italic;
    color: var(--muted);
  }
  .go-note .num {
    font-style: normal;
    color: var(--gold-hi);
  }
  .go-note.warn {
    color: #eab3a3;
  }
  .dock .go-note {
    text-align: center;
  }
  /* As the reveal's Next bar on phones (QuestionView's .dock). */
  .dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.6rem max(1rem, env(safe-area-inset-right)) max(0.6rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    background-color: var(--pinned-bg);
    border-top: var(--pinned-line);
    box-shadow: 0 -8px var(--pinned-shadow);
  }

  /* Touch screens: 44px to tap, as the scoreboard's controls on phones. */
  @media (pointer: coarse) {
    .invite,
    .vis-toggle,
    .lock {
      min-height: 44px;
    }
    .remove.confirm {
      min-width: 44px;
      border-radius: 22px;
    }
    .remove,
    .room-tool,
    .stepper button {
      width: 44px;
      height: 44px;
    }
    /* Within a line of names: as big as the line allows. */
    .remove.inline {
      width: 32px;
      height: 32px;
    }
  }
  @media (max-width: 760px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 520px) {
    /* The label on its own line, so Private, Public and Lock share the next. */
    .room .who {
      width: 100%;
    }
    .setting.row {
      grid-template-columns: 1fr;
    }
    .mode {
      flex-direction: column;
      gap: 0.25rem;
    }
    .code {
      align-items: center;
    }
    .code,
    .glyphs {
      gap: 0.35rem;
    }
    .glyph {
      height: 54px;
    }
    .seg > button {
      min-width: 40px;
      padding: 0.45rem 0.45rem;
    }
    .seg {
      gap: 0.3rem;
    }
  }
  /* Tablets: the room and party on the left, the game beside them (as on phones, in panels). */
  /* Desktop: the start page's stage and columns, straight on the backdrop like
     the start page and the game, with no panels around them. */
  @media (min-width: 1100px) {
    .lobby {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: clamp(10px, 2.4vh, 40px) max(32px, 50% - 600px);
    }
    /* As tall as the window allows, up to the height Delve needs (the tallest
       game): the party list scrolls inside it when it runs longer, the game
       column always fits, and Begin stays put when the mode changes. */
    .cols {
      flex: 1 1 0;
      min-height: 0;
      max-height: 724px;
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: 440px 600px;
      justify-content: space-between;
      align-items: stretch;
      gap: 0;
    }
    .col.side {
      gap: 1.6rem;
      min-height: 0;
    }
    /* The party is the one thing here that grows: past what the window holds it scrolls in place. */
    .party {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .party .chips {
      flex: 0 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding-bottom: 1rem;
      align-content: start;
      scrollbar-width: thin;
      scrollbar-color: var(--gold-lo) transparent;
    }
    .party .chips {
      min-height: min(6.6rem, 100%);
    }
    .game {
      display: flex;
      flex-direction: column;
    }
    .game .start {
      margin-top: auto;
    }
    .chips {
      grid-template-columns: 1fr 1fr;
    }
    .block h2 {
      font-size: 20px;
    }
    /* A hairline between a heading and its content, as under the game's own headings. */
    .block header {
      padding-bottom: 0.55rem;
      border-bottom: 1px solid rgba(125, 99, 51, 0.35);
    }
    .start {
      margin-top: 1rem;
    }
  }
  /* Tall windows: each mode a card, its emblem over its name. */
  .modes.tall .mode {
    flex-direction: column;
    gap: 0.4rem;
    min-height: 92px;
  }
  .modes.tall .mode :global(svg) {
    width: 30px;
    height: 30px;
  }
  /* Short desktop windows (a 13-inch laptop): the settings sit a little closer. */
  @media (min-width: 1100px) and (max-height: 760px) {
    .setting.row {
      padding: 0.5rem 0;
    }
    .setting {
      margin-bottom: 0.7rem;
    }
    .game.panel {
      padding: 0.9rem 1.3rem 1rem;
    }
    .block header {
      margin-bottom: 0.8rem;
    }
    .block.room header {
      margin-bottom: calc(0.8rem - 0.6rem);
    }
    .mode {
      min-height: 46px;
    }
    .about {
      padding: 0.45rem 0.8rem 0.5rem;
    }
    .start {
      padding-top: 0.8rem;
    }
  }
  /* Narrower than a desktop's column: the label over its choices. */
  @media (max-width: 1099px) {
    .room .room-actions {
      flex-wrap: wrap;
    }
    .who {
      flex-basis: 100%;
    }
  }
  @media (min-width: 1100px) {
    /* The descent fills the height the panel has left over, at its own width. */
    .delve-slot {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .delve-slot :global(.delve-rules) {
      flex: 1;
      margin-bottom: 0;
    }
    .delve-slot :global(.delve-cols) {
      height: 100%;
    }
    /* Room under the descent's last ring before the rule over Begin. */
    .delve-slot {
      padding-bottom: 1.1rem;
    }
  }
  @media (min-width: 1100px) {
    /* The rules sum up the choices above them, so they sit at the foot, over Begin, not under the last setting. */
    .game .rules {
      margin-top: auto;
      margin-bottom: 1rem;
    }
    .game .rules + .start {
      margin-top: 0;
    }
  }
</style>
