<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { MAX_PLAYERS, MAX_SPECTATORS, RACE_DEFAULT_TIMER, TIMER_STEPS, difficultyOf, rulesFor, type Difficulty, type GameMode, type Spectator } from '../lib/game';
  import { DIFFICULTY_NAMES, MODE_NAMES, describe } from '../lib/difficultyText';
  import CustomDifficulty from './CustomDifficulty.svelte';
  import DelveRules from './DelveRules.svelte';
  import ModeIcon from './ModeIcon.svelte';
  import { bestOf, deepestShown, findsMet, lastOf, loadRecords } from '../lib/delveRecord';
  import { MAX_NAME, nameRefusal, nameTooShort } from '../lib/names';
  import { creatorShown } from '../lib/creator';
  import { refuseName } from '../lib/nameField';
  import { inviteUrl } from '../lib/site';
  import Avatar from './Avatar.svelte';
  import KickButton from './KickButton.svelte';
  import OnlookerMark from './OnlookerMark.svelte';
  import WatchEye from './WatchEye.svelte';
  import PlayerName from './PlayerName.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { backdropDropShadow } from '../lib/backdropDropShadow';
  import { kickConfirm } from '../lib/kick';
  import { creatorArrived, playerArrived, refuse, twinkle } from '../lib/fx/moments';
  import { overPage } from '../lib/fx/core';
  import { onMount } from 'svelte';
  import { categoryIcons, playerColor } from '../lib/ui';
  import { measure } from '../lib/iconFit.svelte';
  import { FLAT, dock, phone } from '../lib/layout';
  import { portal } from '../lib/portal';
  import WatchToggle from './WatchToggle.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { pinnedOut } from '../lib/stage';
  import HostMark from './HostMark.svelte';
  import RoomCodeGlyphs from './RoomCodeGlyphs.svelte';
  import { greyed, markOf, missingNote, notReady, type Mark, type Missing } from '../lib/presence';
  import StandingMark from './StandingMark.svelte';
  import { backGuard } from '../lib/backGuard';

  const TARGETS = [5, 10, 15, 20];
  const MODES: { id: GameMode; name: string; isNew?: boolean }[] = [
    { id: 'turns', name: MODE_NAMES.turns },
    { id: 'race', name: MODE_NAMES.race },
    { id: 'delve', name: MODE_NAMES.delve, isNew: true },
  ];
  const DIFFS = (Object.entries(DIFFICULTY_NAMES) as [Difficulty, string][]).map(([id, name]) => ({ id, name }));

  const s = $derived(session.state!);
  const isHost = $derived(session.isHost);
  const local = $derived(session.mode === 'local');
  /** A room that couldn't go online: on this device only, nobody can join (session.hereOnly). */
  const hereOnly = $derived(session.hereOnly);
  /** A room's host adds players at their own screen, in Turns (the other modes need a device each, or are for one). */
  const atScreen = $derived(session.mode === 'host' && s.settings.mode === 'turns');

  let newName = $state('');
  let nameError = $state(false);
  let copied = $state(false);

  const inviteLink = $derived(inviteUrl(session.code));
  /** Desktop: the start page's two columns, no panels. Tall: the modes' names go under their emblems. */
  const tall = new MediaQuery('(min-height: 860px)');
  /** The start sticks to the foot of its panel, the rules passing under it (as its style has it, below). */
  const stickyStart = new MediaQuery(`${FLAT} and (max-width: 1099px)`);
  /** The mode cards ease from one choice to the next (their mode-on and mode-off), but not as the lobby opens: only from a second in. */
  let modesLive = $state(false);
  $effect(() => {
    const t = setTimeout(() => (modesLive = true), 1000);
    return () => clearTimeout(t);
  });
  // Measure the category cards' emblems and the items behind them
  // (lib/iconFit) while the party gathers, so the first deal doesn't have to.
  onMount(() => {
    const t = setTimeout(() => categoryIcons().forEach(measure), 1000);
    return () => clearTimeout(t);
  });

  function addLocal(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    // The start page's checks, the held name included; the game checks it against the other players.
    const refusal = nameRefusal(name);
    if (refusal) {
      refuseName((e.currentTarget as HTMLFormElement).querySelector('input'), refusal, (on) => (nameError = on));
      return;
    }
    // Keep the name to fix it up if it was turned down (hot-seat applies it right away).
    if (session.seatLocal(name)) newName = '';
  }

  // Arriving from the start page leaves focus on the page itself: a screen
  // reader then starts the room's top, at its unseen heading, and Tab goes on from there.
  let heading = $state<HTMLHeadingElement>();
  onMount(() => {
    if (document.activeElement === document.body || !document.activeElement) heading?.focus({ preventScroll: true });
  });

  // Players already here when the lobby opens just appear; newcomers get an entrance.
  let settled = false;
  onMount(() => {
    const t = setTimeout(() => (settled = true), 600);
    return () => clearTimeout(t);
  });

  /** Svelte action: a new player's row arrives with a flash (zoe_arcana's is her own). */
  function arriving(node: HTMLElement, name: string) {
    if (!settled) return;
    const t = setTimeout(() => (creatorShown(name) ? creatorArrived(node) : playerArrived(node)), 120);
    return { destroy: () => clearTimeout(t) };
  }

  let copyBtn = $state<HTMLButtonElement>();

  // Online, removing bars them for the rest of the session, so it takes two
  // clicks, as the scoreboard's kick does (lib/kick): the same button asks
  // "Kick" for a few seconds, and a double click doesn't count as both.
  let confirming = $state<string | null>(null);
  const kicker = kickConfirm((id) => (confirming = id));
  onMount(() => kicker.dispose);
  /** Who was removed here (a kick confirmed, or hot-seat's ×): their chips go out with the red flare. */
  const removed = new Set<string>();
  function removePlayer(id: string) {
    if (local) {
      removed.add(id);
      session.dispatch({ type: 'remove', playerId: id });
    } else if (s.players.find((p) => p.id === id)?.local || s.aside?.some((p) => p.id === id)) {
      // One at the host's screen has no device to bar: one click, as on one device.
      removed.add(id);
      session.kick(id);
    } else if (kicker.click(id)) {
      removed.add(id);
      session.kick(id);
    }
  }
  /** A leaving chip shrinks a little as it fades, and a removed one (kicked, or hot-seat's ×) goes out with a red flare: the others then close up (flip).
      One that left by itself goes quietly, even with its × armed at that moment.
      It shrinks with `scale`, not `transform`: Svelte pins a leaving chip in place with a transform, which a transform here would override (the chip would jump to the grid's first cell);
      that pin is measured on screen, so under the stage's zoom it is scaled back, each time the chip leaves (pinnedOut). */
  const kickOut = pinnedOut((node: Element) => {
    const flare = removed.has((node as HTMLElement).dataset.id ?? '');
    return {
      duration: 320,
      css: (t: number) =>
        `opacity: ${t}; scale: ${0.9 + 0.1 * t};` + (flare ? ` box-shadow: 0 0 ${18 * (1 - t)}px rgba(224, 85, 63, ${0.7 * (1 - t) * t * 4});` : ''),
    };
  });
  /** Escape takes an armed kick back. */
  function disarm(e: KeyboardEvent) {
    // (Taken: the key doesn't open the settings too.)
    if (e.key === 'Escape' && kicker.disarm()) e.preventDefault();
  }
  /** A press anywhere but the armed Kick takes it back too. */
  function disarmOutside(e: PointerEvent) {
    if (!(e.target as Element).closest?.('.kick.armed')) kicker.disarm();
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
  /** Delve together: a room of two or more online plays as a team. */
  const together = $derived(!local && s.players.length > 1);
  // The deepest this browser has delved, alone or together (hot-seat is always alone).
  const records = loadRecords();
  const bestAlone = bestOf(records, true)?.depth ?? null;
  const bestTogether = bestOf(records, false)?.depth ?? null;
  const deepest = $derived(together ? bestTogether : s.players.length < 2 ? bestAlone : null);
  // The last run of the same kind: the descent marks it with a red star.
  const lastAlone = lastOf(records, true)?.depth ?? null;
  const lastTogether = lastOf(records, false)?.depth ?? null;
  const lastRun = $derived(together ? lastTogether : s.players.length < 2 ? lastAlone : null);
  // Your deepest of any run, alone or together, as the start page says it: the zones it reached stay charted whichever way you play next, since you have seen them.
  const seen = deepestShown(records) || null;
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
  const full = $derived(s.players.length >= MAX_PLAYERS);
  const alone = $derived(s.players.length < 2);
  /** Nobody new can come in: locked, or every seat taken and no room left to watch from (a full room lets them in to watch, and take the first seat freed). */
  const closed = $derived(!!s.settings.locked || (full && (s.spectators?.length ?? 0) >= MAX_SPECTATORS));
  const canStart = $derived(s.players.length >= 1 && !delveCrowded);
  /** Spectators waiting for a seat: left over when the last game filled every seat, or come in while it was full. */
  const waiting = $derived((s.spectators ?? []).filter((o) => !o.stay));
  /** Spectators who chose to watch rather than play. */
  const watching = $derived((s.spectators ?? []).filter((o) => o.stay));
  const race = $derived(s.settings.mode === 'race');
  const delve = $derived(s.settings.mode === 'delve');
  const difficulty = $derived(difficultyOf(s.settings.difficulty));
  /** Host only: the custom difficulty's editor, open. */
  const editorOpen = $derived(editing && isHost && difficulty === 'custom' && !delve);
  // Open, the browser's back closes it, before it would ask to leave the room (lib/backGuard.ts).
  $effect(() => {
    if (editorOpen) return backGuard.layer(() => (editing = false));
  });
  const lockout = $derived(rulesFor(s.settings).lockout);
  /** Online: each player's mark, when not simply ready (lib/presence.ts: away, idle, lagging or offline); those at the host's screen share the host's. */
  const marks = $derived(new Map<string, Mark | null>(s.players.map((p) => [p.id, local ? null : markOf(p.connected, session.standing[p.local ? (s.hostId ?? p.id) : p.id])])));
  /** Online: the players the game would begin without, and why (the host never counts themselves: they're the one reading it). */
  const unready = $derived(
    s.players.flatMap((p): { name: string; why: Missing }[] => {
      const m = marks.get(p.id);
      return notReady(m) && !(isHost && (p.id === session.myPlayerId || p.local)) ? [{ name: p.name, why: m }] : [];
    }),
  );
  /** Guest: the host is away or idle (offline, the guest would be reconnecting). */
  const hostMark = $derived(isHost ? null : marks.get(s.hostId ?? ''));
  const hostName = $derived(s.players.find((p) => p.id === s.hostId)?.name);
</script>

{#snippet startRow()}
  {#if isHost}
    <!-- Beside the start, the one thing to know before pressing it. -->
    {#if delveCrowded}
      <p class="go-note warn">Delve on one device is for one player. Remove the others, or host a room.</p>
    {:else if local && !s.players.length}
      <p class="go-note">Add the first exile to begin.</p>
    {:else if hereOnly && s.players.length < 2}
      <p class="go-note">{atScreen ? 'Begin alone, or add the players at your screen.' : 'You can begin alone.'}</p>
    {:else if !local && s.players.length < 2}
      <p class="go-note">You can begin alone, or wait for your party.</p>
    {:else if s.players.length > 1}
      <!-- A lone player knows they're here: Begin stands by itself. With a party, whether everyone is
           really there (lib/presence.ts): their game on screen and in use, or who it would begin without. -->
      {#if unready.length}
        <p class="go-note"><b class="num">{s.players.length - unready.length}</b> of <b class="num">{s.players.length}</b> ready; {missingNote(unready)}</p>
      {:else}
        <p class="go-note all-ready">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" /></svg>
          {#if local}<b class="num">{s.players.length}</b> exiles ready{:else}All <b class="num">{s.players.length}</b> exiles here and ready{/if}
        </p>
      {/if}
    {/if}
    <!-- Begin is the gold button whenever it can start: playing alone is a normal game. -->
    <button class="btn big primary" data-cursor="begin" use:backdropShadow disabled={!canStart} onclick={start}>{delve ? 'Begin the descent' : 'Begin the hunt'}</button>
  {:else}
    <!-- The host by name, as the end screen has it; "the host" only while no name is known. -->
    <p class="muted waiting">
      <span class="pulse"></span>
      <span
        >Waiting for {#if hostName}<span class="host-name">{hostName}</span>{:else}the host{/if} to start{hostMark === 'away' || hostMark === 'idle' ? `; they seem to be ${hostMark}…` : '…'}</span
      >
    </p>
  {/if}
{/snippet}

<!-- The field a player at this screen is added by (on one device, or at a room host's screen). -->
{#snippet adder(placeholder: string)}
  <form class="add" onsubmit={addLocal}>
    <input class="field" class:shake={nameError} bind:value={newName} maxlength={MAX_NAME} autocomplete="off" spellcheck="false" autocorrect="off" {placeholder} aria-label={placeholder} />
    <button class="btn" type="submit" disabled={nameTooShort(newName)}>Add</button>
  </form>
{/snippet}

<!-- A rule's heading, the rule under it, as the Delve finds below are set (DelveRules): the rules read at a
     glance as a list without a sign that means nothing (never the diamond: "you are here"). -->
{#snippet key(word: string, n?: number)}
  <span class="key">{word}{#if n !== undefined}&nbsp;<span class="key-n">{n}</span>{/if}</span>
{/snippet}

<!-- The start page's two columns carry on here: on the left, where its menu
     was, the room and the party; on the right, where today's unique was, the
     game. Begin closes the right column, in the same corner at every size,
     and the party's chips are the ones the game shows along its top. -->
<!-- data-cursor: where other players' pointers are placed (PeerCursors): the room as a whole, its blocks and what's in them.
     A host and a guest see different controls in the same places (a setting's choices or its value, Begin or the wait
     for it), so those share their row's anchor, and what only a host has falls back to it on a guest's screen. -->
<div class="lobby" class:online={!local} data-cursor="game">
  <h1 class="sr" tabindex="-1" bind:this={heading}>Your room</h1>
  <div class="cols">
    <div class="col side">
      {#if !local && !hereOnly}
        <!-- The room code and link are how the party grows, so they come first. -->
        <section class="block room" data-cursor="room" in:fly={{ x: -30, duration: 500, delay: 50 }}>
          <header>
            <h2>Room code</h2>
          </header>
          <div class="code" data-cursor="code" aria-label={session.hideCode ? 'Room code hidden' : `Room code ${session.code}`}>
            <RoomCodeGlyphs code={session.code} hidden={session.hideCode} sparks />
          </div>
          <div class="invite-row">
            <!-- A locked room, or one with no seat and no room to watch, takes nobody new: the link isn't offered then, and the button says why. -->
            <button class="btn invite" data-cursor="invite" class:accent={alone && isHost && !closed} bind:this={copyBtn} onclick={copy} disabled={closed}>
              {s.settings.locked ? 'Room locked' : closed ? 'Room full' : copied ? 'Link copied!' : canShare ? 'Share invite link' : 'Copy invite link'}
            </button>
            <!-- Hiding the code (for a stream) sits with the other ways of handing it on. -->
            <button
              class="room-tool"
              data-cursor="hide"
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
          <div class="room-actions" data-cursor="access">
            {#if isHost}
              <span class="who">Who can join</span>
              <!-- One switch, both its sides named: the lit plate slides under the side that holds, as the game's own choices light. -->
              <button
                class="vis-toggle"
                data-cursor="public"
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
                data-cursor="lock"
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
              {:else if closed}
                Room full: nobody new can come in until someone leaves.
              {:else if full}
                Every seat is taken: anyone new watches, and takes the first seat that opens.
              {:else if s.settings.public}
                Anyone can find this room under “Open rooms”.
              {:else}
                Only people with the code or link can join.
              {/if}
            </p>
          {/if}
        </section>
      {/if}

      {#if local || hereOnly}
        <!-- On one device the party grows by name: its own block over the party, where the room code stands online, so the field never sits among the chips. -->
        <section class="block room adder" in:fly={{ x: -30, duration: 500, delay: 50 }}>
          <header>
            <h2>{local || atScreen ? 'Add exiles' : 'On this device'}</h2>
          </header>
          {#if (local || atScreen) && s.players.length < MAX_PLAYERS}
            {@render adder("Exile’s name")}
          {/if}
          <p class="vis-hint">
            {#if local || atScreen}
              Pass the device around; each player answers on their own turn.
            {:else}
              Nobody else can join this room. Players at your screen play Turns.
            {/if}
          </p>
        </section>
      {/if}

      <section class="block party" data-cursor="party" in:fly={{ x: -30, duration: 500, delay: 100 }}>
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
          {#each s.players as p, i (p.id)}
            {@const mark = marks.get(p.id)}
            <li
              data-cursor="row:{i}"
              use:arriving={p.name}
              animate:flip={{ duration: 300 }}
              in:fly={{ x: -20, duration: 350 }}
              out:kickOut
              data-id={p.id}
              class:armed={confirming === p.id}
              class:absent={notReady(mark)}
              style:--c={playerColor(p.hue)}
            >
              <Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={32} dim={greyed(mark)} />
              <span class="name" title={p.name}><PlayerName name={p.name} />{#if !local && p.id === session.myPlayerId && s.players.length > 1}<em>&nbsp;(you)</em>{/if}</span>
              {#if mark}<StandingMark {mark} />{/if}
              <!-- The host's chip carries a hanging banner, the party's standard, where the others have their ×. -->
              {#if p.id === s.hostId && !local}<HostMark />{/if}
              {#if isHost && (local || p.id !== s.hostId)}
                <KickButton name={p.name} armed={confirming === p.id} onclick={() => removePlayer(p.id)} />
              {/if}
            </li>
          {/each}
        </ul>
        <!-- Those in the room without a seat, under the party: smaller, darker chips, each an empty ring where a player has their colour. -->
        {#snippet gallery(label: string, list: Spectator[])}
          <div class="gallery" transition:slide={{ duration: 250 }}>
            <h3><WatchEye />{label}</h3>
            <ul class="onlookers">
              {#each list as o (o.id)}
                <li data-id={o.id} class:armed={confirming === o.id} animate:flip={{ duration: 300 }} in:fly={{ y: 6, duration: 300 }} out:kickOut>
                  <OnlookerMark name={o.name} size={24} />
                  <span class="name" title={o.name}><PlayerName name={o.name} />{#if o.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}</span>
                  {#if isHost}
                    <KickButton name={o.name} armed={confirming === o.id} onclick={() => (s.aside?.some((p) => p.id === o.id) ? removePlayer(o.id) : kicker.click(o.id) && (removed.add(o.id), session.kick(o.id)))} />
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/snippet}
        {#if waiting.length}{@render gallery('Waiting for a seat', waiting)}{/if}
        <!-- Turns in a full room: those at the host's screen who didn't fit back wait here for a seat (or to be removed). -->
        {#if atScreen && s.aside?.length}{@render gallery('At your screen, waiting for a seat', s.aside)}{/if}
        {#if watching.length}{@render gallery('Watching', watching)}{/if}
        {#if atScreen && !hereOnly && !full}
          <!-- Online, Turns: someone beside the host plays too, on the host's screen (Race and Delve set them aside). -->
          <div class="here" transition:slide={{ duration: 250 }}>{@render adder('Add a player at your screen')}</div>
        {/if}
        {#if !local && !isHost && session.myPlayerId}
          <!-- A guest can sit the games out and watch, and take a seat again. -->
          <p class="watch-choice" data-cursor="watch"><WatchToggle /></p>
        {/if}
        {#if !local && !hereOnly && s.players.length < 2}
          <p class="hint waiting"><span class="pulse"></span>{isHost ? 'Nobody else yet. Send your party the code or the link.' : 'Waiting for more exiles to join…'}</p>
        {/if}
        {#if delve && !local && !hereOnly}
          <!-- Co-op is about the party, so it is told under it: in a team room, or one a second player can still join (on one device, Delve is for one). -->
          <div class="setting together" data-cursor="coop">
            <span class="label">Play co-op together</span>
            {#if !together}
              <p class="together-when">Once a second exile joins this room:</p>
            {/if}
            <ul class="rules coop">
              <li>{@render key('Cards')}<span>Everyone votes, then one is drawn from the votes.</span></li>
              <li>{@render key('Answers')}<span>Given at once; a wrong one is crossed out for all.</span></li>
              <li>{@render key('Lives')}<span>Teammates can give their life force to revive you.</span></li>
            </ul>
          </div>
        {/if}
      </section>
    </div>

    <!-- The game is the one framed panel: the settings and Begin are what the host works with. -->
    <section class="col block game settings panel" data-cursor="settings" use:backdropShadow={{ fill: 'linear' }} in:fly={{ x: 30, duration: 500, delay: 200 }}>
      <header><h2>Game</h2></header>

      <div class="setting">
        <div class="modes" data-cursor="modes" class:tall={tall.current} class:live={modesLive} role="radiogroup" aria-label="Mode" aria-describedby="mode-blurb" tabindex={-1} onkeydown={modeKeys}>
          {#each MODES as m, i (m.id)}
            {@const on = s.settings.mode === m.id}
            <button
              data-cursor="card:{i}"
              class="mode"
              class:on
              use:backdropShadow={{ fill: on ? 'linear' : undefined }}
              class:off={offline(m.id)}
              role="radio"
              aria-checked={on}
              aria-disabled={offline(m.id) || undefined}
              tabindex={on ? 0 : -1}
              data-mode={m.id}
              aria-label={m.isNew ? `${m.name}, new` : undefined}
              disabled={!isHost && !on}
              title={offline(m.id) ? 'Race needs every player on their own device' : undefined}
              onclick={(e) => isHost && pickMode(m.id, e.currentTarget)}
            >
              <ModeIcon mode={m.id} />
              <b use:backdropDropShadow>{m.name}</b>
              {#if m.isNew}<span class="new" aria-hidden="true">New</span>{/if}
            </button>
          {/each}
        </div>
        <!-- The chosen mode's description, under a notch that points up at it. -->
        <div class="about" data-cursor="about" id="mode-blurb" style:--at={peek ? 1 : MODES.findIndex((m) => m.id === s.settings.mode)} class:peek>
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
        <div class="delve-slot" data-cursor="descent">
          <DelveRules {deepest} last={lastRun} {seen} {together} {met} />
        </div>
      {:else}
        <!-- One row per setting: its name, then its choices (a guest, who can't change them, reads the value). -->
        <div class="setting row" data-cursor="target">
          <span class="label">Points to win</span>
          {#if !isHost}<b class="val num">{s.settings.targetScore}</b>{:else}
          <div class="seg">
            {#each TARGETS as t (t)}
              <button class:on={s.settings.targetScore === t} disabled={!isHost} onclick={() => setTarget(t)}>{t}</button>
            {/each}
            <span class="stepper">
              <button disabled={!isHost || s.settings.targetScore <= 1} onclick={() => setTarget(s.settings.targetScore - 1)} aria-label="Fewer points"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" /></svg></button>
              <b>{s.settings.targetScore}</b>
              <button disabled={!isHost || s.settings.targetScore >= 50} onclick={() => setTarget(s.settings.targetScore + 1)} aria-label="More points"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7" /></svg></button>
            </span>
          </div>
          {/if}
        </div>

        <div class="setting row" data-cursor="difficulty">
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

        <div class="setting row" data-cursor="time">
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

        <ul class="rules" data-cursor="rules">
          {#if race}
            <li>{@render key('Wrong answers')}<span>Cost a point and sit you out until the next question.</span></li>
            <li>{@render key('First to', s.settings.targetScore)}<span>Wins; only the fastest right answer scores each question.</span></li>
          {:else}
            <li>
              {@render key('Right answers')}<span
                >Score a point; {#if lockout > 0}the category then stays locked for your next <span class="num">{lockout}</span> turns{:else}then the turn passes to the next exile{/if}.</span
              >
            </li>
            <li>{@render key('First to', s.settings.targetScore)}<span>Wins once the round is over; a tie goes to sudden death.</span></li>
          {/if}
        </ul>
      {/if}

      <!-- The start ends the rules. On phones, where they run long, it is pinned
           to the bottom of the screen like the reveal's Next bar (lib/layout's dock).
           A guest's waiting line has nothing to tap, so it stays in place. -->
      {#if phone.current && isHost}
        <div class="dock" data-cursor="start" use:portal use:overPage use:dock in:fade={{ duration: 200 }} out:fade|global={{ duration: 180 }}>{@render startRow()}</div>
      {:else}
        <div class="start" data-cursor="start" use:overPage={stickyStart.current}>{@render startRow()}</div>
      {/if}
    </section>
  </div>
</div>

<svelte:window onkeydown={disarm} onpointerdown={disarmOutside} />

{#if editorOpen}
  <CustomDifficulty onclose={() => (editing = false)} />
{/if}

<style>
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .sr:focus {
    outline: none;
  }
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

  .code {
    display: flex;
    width: 100%;
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
  /* Away, idle or offline (lib/presence.ts, StandingMark): their name dims; idle (gone a couple of minutes) or offline, their avatar greys too, as an offline one does in the game. */
  .chips li.absent .name {
    opacity: 0.55;
  }
  /* Pointing at the kick: the chip it would remove warms red, so it is clear whose it is. */
  .chips li:has(:global(.kick:hover)),
  .onlookers li:has(:global(.kick:hover)) {
    border-color: rgba(224, 85, 63, 0.45);
  }
  .chips li {
    --kick-size: 26px;
    --kick-armed: 58px;
  }

  /* Who's in the room without a seat: a label with a fine rule running off it, then their chips. */
  .gallery {
    margin-top: 1rem;
  }
  .gallery h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-size: 0.64rem;
    font-weight: 400;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #ab9d88;
  }
  .gallery h3 :global(.eye) {
    --eye-size: 16px;
    color: var(--gold);
  }
  .gallery h3::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--line), transparent);
  }
  .onlookers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .onlookers li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    max-width: 100%;
    padding: 0.25rem 0.3rem 0.25rem 0.3rem;
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.5);
    border: 1px solid rgba(125, 99, 51, 0.35);
    transition: border-color 0.25s;
    --kick-size: 22px;
    --kick-armed: 52px;
  }
  /* Without a kick, the name keeps the room it would have taken. */
  .onlookers li:not(:has(:global(.kick))) {
    padding-right: 0.8rem;
  }
  .onlookers .name {
    flex: 0 1 auto;
    font-size: 0.92rem;
    line-height: 1.1;
    padding-bottom: 0.15em;
    margin-bottom: -0.15em;
  }
  .onlookers .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  .onlookers li.armed {
    border-color: #8e4434;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
  }
  .onlookers li.armed .name {
    color: #eab3a3;
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
  /* A room's: under the party, as its waiting and watching are. */
  .here {
    margin-top: 0.8rem;
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
    /* The chosen one's gradient and glow are drawn by the WebGL backdrop when
       it can (see lib/backdropShadow.ts), over the panel it draws too. */
    --bs-fill-a: rgba(0, 0, 0, 0.35);
    --bs-fill-b: rgba(0, 0, 0, 0.35);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    border: 1px solid var(--line);
    border-radius: 4px;
    /* Its glows grow from nothing (no blur, no colour) as it's chosen, as a
       box-shadow from none would. */
    --bs1: 0px 0px;
    box-shadow:
      inset 0 1px 0 var(--mode-top-light, transparent),
      inset 0 0 var(--mode-glow-blur, 0px) var(--mode-glow-in, transparent),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent));
    cursor: pointer;
    /* Its glows ease by their parts (registered in app.css), never as a whole
       box-shadow: that would fade the CSS copy of the soft glow out slowly as
       the backdrop takes it over, both showing at once, a flash. */
    transition:
      color 0.2s,
      border-color 0.2s,
      opacity 0.2s,
      transform 0.2s,
      --mode-top-light 0.2s,
      --mode-glow-blur 0.2s,
      --mode-glow-in 0.2s,
      --bs1 0.2s,
      --bs1-color 0.2s;
    /* Its fill eases too (mode-on, mode-off), once the lobby is open (.live). */
    animation: mode-off 0s ease;
  }
  .modes.live .mode {
    animation-duration: 0.2s;
  }
  /* Chosen, the gold is there at once over the dark it had, which fades from
     under it: as one colour, the gold over that dark, easing to the gold.
     (.mode.on's fill, alpha 0.55, over .mode's black at 0.35: alpha
     0.55 + 0.35 x 0.45 = 0.7075, colour the gold's x 0.55 / 0.7075. Retune
     those and these follow.) */
  @keyframes mode-on {
    from {
      --bs-fill-a: rgba(94.84, 61.41, 22.54, 0.7075);
      --bs-fill-b: rgba(53.64, 32.65, 10.88, 0.7075);
    }
  }
  /* Left, the gold is gone at once and the dark fades in. */
  @keyframes mode-off {
    from {
      --bs-fill-a: transparent;
      --bs-fill-b: transparent;
    }
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
    --bs-fill-a: rgba(122, 79, 29, 0.55);
    --bs-fill-b: rgba(69, 42, 14, 0.55);
    border-color: var(--gold);
    --mode-top-light: rgba(255, 230, 170, 0.2);
    --mode-glow-blur: 18px;
    --mode-glow-in: rgba(255, 150, 60, 0.12);
    --bs1: 0px 18px;
    --bs1-color: rgba(201, 164, 92, 0.25);
    animation-name: mode-on;
  }
  /* Its glow, drawn by the WebGL backdrop over the card's fill when it can
     (lib/backdropDropShadow.ts), dithered; CSS paints it otherwise. */
  .mode.on b {
    --drop-shadow: 0 0 12px rgba(241, 217, 155, 0.45);
    text-shadow: var(--drop-shadow-paint, var(--drop-shadow));
  }
  /* A small engraved tag in the corner, clear of the emblem, like the site's own Beta mark;
     in the teal of skill gems, so it reads as fresh rather than unfinished. */
  .mode .new {
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
    color: #4fd0b4;
    border: 1px solid rgba(79, 208, 180, 0.45);
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
    gap: 0.4rem;
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
    line-height: 1;
  }
  /* Drawn, not typed: the font's plus and minus sit off the circle's middle and read thin. */
  .stepper svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
  }
  .stepper b {
    min-width: 2ch;
    text-align: center;
    font-family: var(--font-display);
    color: var(--gold-hi);
  }

  /* Each rule under its heading, as the Delve finds are set (DelveRules: display face, gold here, the house accent for headings). */
  .rules {
    display: grid;
    gap: 0.55rem;
    margin: 0.4rem 0 1.4rem;
    padding-left: 0;
    list-style: none;
    font-size: 0.98rem;
    line-height: 1.25;
  }
  .rules li {
    display: grid;
    gap: 0.1rem;
  }
  .key {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
  }
  /* Its number in Cinzel, bold, as numbers among words are everywhere. */
  .key-n {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.1em;
    letter-spacing: 0.06em;
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
  .host-name {
    color: var(--text);
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
  /* Everyone there: a gold tick says so at a glance. */
  .go-note.all-ready svg {
    width: 1em;
    height: 1em;
    margin-right: 0.3em;
    vertical-align: -0.12em;
    fill: none;
    stroke: var(--gold-hi);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
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
    .chips li,
    .onlookers li {
      --kick-size: 44px;
    }
    .room-tool,
    .stepper button {
      width: 44px;
      height: 44px;
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
      padding: clamp(10px, 0.024 * var(--view-h), 40px) max(32px, 50% - 600px);
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
  /* A phone on its side (lib/layout.ts `flat`): closer to the screen's
     edges (clear of the notch). */
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .lobby {
      padding: 0.8rem max(1rem, env(safe-area-inset-right)) 1.5rem max(1rem, env(safe-area-inset-left));
    }
  }
  /* Below a desktop's width (a desktop keeps its own): the room and party
     beside the game rather than over it, and the start, the panel's own foot,
     stays at the foot of the screen while the panel, twice the screen's
     height, scrolls under it; a bar across the whole of so short a screen
     would take too much of it. */
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) and (max-width: 1099px) {
    .cols {
      grid-template-columns: 1fr 1.33fr;
    }
    .game .start {
      position: sticky;
      bottom: 0;
      z-index: 2;
      margin: 1rem -1.4rem -1.4rem;
      padding: 0.7rem 1.4rem max(0.8rem, env(safe-area-inset-bottom));
      /* The panel's own colour at its foot (app.css .panel), solid, so the rules pass under it. */
      background: rgb(16, 13, 10);
      border-radius: 0 0 var(--radius) var(--radius);
    }
  }
</style>
