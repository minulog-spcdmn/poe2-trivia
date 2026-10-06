<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { MAX_PLAYERS, RACE_DEFAULT_TIMER, TIMER_STEPS, difficultyOf, rulesFor, type Difficulty, type GameMode } from '../lib/game';
  import { DIFFICULTY_NAMES, FINDS_INTRO, FINDS_LABEL, FIND_GIVES, FIND_TEXT, describe, lockoutText } from '../lib/difficultyText';
  import { FINDS, delveLockout } from '../lib/delve';
  import CustomDifficulty from './CustomDifficulty.svelte';
  import DelveLadder from './DelveLadder.svelte';
  import ModeIcon from './ModeIcon.svelte';
  import { bestOf, loadRecords } from '../lib/delveRecord';
  import { MAX_NAME, isHeldName, nameHeld, nameTooShort } from '../lib/names';
  import { inviteUrl } from '../lib/site';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { creatorArrived, glyphLanded, playerArrived, refuse, twinkle } from '../lib/fx/moments';
  import { onMount } from 'svelte';
  import { categoryIcons } from '../lib/ui';
  import { measure } from '../lib/iconFit.svelte';

  const TARGETS = [5, 10, 15, 20];
  const MODES: { id: GameMode; name: string; beta?: boolean }[] = [
    { id: 'turns', name: 'Take turns' },
    { id: 'race', name: 'Race' },
    { id: 'delve', name: 'Delve', beta: true },
  ];
  // The finds that turn up, in the order they first do.
  const FIND_KINDS = FINDS.filter((f) => f.cap > 0)
    .sort((a, b) => a.from - b.from)
    .map((f) => f.kind);
  const DIFFS = (Object.entries(DIFFICULTY_NAMES) as [Difficulty, string][]).map(([id, name]) => ({ id, name }));

  const s = $derived(session.state!);
  const isHost = $derived(session.isHost);
  const local = $derived(session.mode === 'local');

  let newName = $state('');
  let nameError = $state(false);
  let copied = $state(false);

  const inviteLink = $derived(inviteUrl(session.code));

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

  async function copy() {
    if (copyBtn) twinkle(copyBtn);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'PoE2.Quest', text: `Join my PoE2 trivia room ${session.code}`, url: inviteLink });
      } else {
        await navigator.clipboard.writeText(inviteLink);
        copied = true;
        setTimeout(() => (copied = false), 1800);
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
  // The deepest this browser has delved, alone or with others (hot-seat runs count only alone).
  const records = loadRecords();
  const bestAlone = bestOf(records, true)?.depth ?? null;
  const bestTogether = bestOf(records, false)?.depth ?? null;
  const deepest = $derived(s.players.length < 2 ? bestAlone : local ? null : bestTogether);

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
  const canStart = $derived(s.players.length >= 1 && !delveCrowded);
  /** Spectators left over when the last game filled every seat. */
  const waiting = $derived(s.spectators ?? []);
  const race = $derived(s.settings.mode === 'race');
  const delve = $derived(s.settings.mode === 'delve');
  const difficulty = $derived(difficultyOf(s.settings.difficulty));
  const lockout = $derived(rulesFor(s.settings).lockout);
</script>

<div class="lobby">
  {#if !local}
    <section class="room" in:fly={{ y: -20, duration: 500 }}>
      <span class="label">Room code</span>
      <div class="code" class:hidden={session.hideCode} aria-label={session.hideCode ? 'Room code hidden' : `Room code ${session.code}`}>
        <span class="glyphs" oncopy={copyCode}>
          {#each session.code.split('') as ch, i (i)}
            <span class="glyph" use:landing={i} style:animation-delay="{i * 80}ms" style:--i={i}>{session.hideCode ? '•' : ch}</span>
          {/each}
        </span>
        <button
          class="eye"
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
        <button class="btn small" bind:this={copyBtn} onclick={copy}>
          {copied ? 'Link copied!' : 'Copy invite link'}
        </button>
        {#if isHost}
          <div class="visibility" role="group" aria-label="Room visibility">
            <button class:on={!s.settings.public} onclick={() => setPublic(false)} title="Only people with the code can join">
              Private
            </button>
            <button class:on={!!s.settings.public} onclick={() => setPublic(true)} title="Listed under Open rooms on the start page">
              Public
            </button>
          </div>
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
        <p class="vis-hint muted">
          {#if s.settings.locked}
            Room locked: nobody new can join or watch. Players already in the game can still reconnect.
          {:else if s.settings.public}
            Anyone can find this room under “Open rooms”.
          {:else}
            Only people with the code or link can join.
          {/if}
        </p>
      {/if}
      <p class="ip-note muted">
        Players connect directly to each other, so everyone in a room can see each other's IP address. Only play with people you're comfortable sharing that with.
      </p>
    </section>
  {/if}

  <div class="cols">
    <section class="panel players" use:backdropShadow={{ fill: 'linear' }} in:fly={{ x: -30, duration: 500, delay: 100 }}>
      <header>
        <h2>Party</h2>
        <span class="count">{s.players.length} / {MAX_PLAYERS}</span>
      </header>
      <ul>
        {#each s.players as p (p.id)}
          <li use:arriving={p.name} animate:flip={{ duration: 300 }} in:fly={{ x: -20, duration: 350 }} out:scale={{ duration: 200, start: 0.9 }}>
            <Avatar name={p.name} hue={p.hue} />
            <span class="name"><PlayerName name={p.name} /></span>
            {#if p.id === s.hostId}<span class="tag">Host</span>{/if}
            {#if !p.connected}<span class="tag" title="Reconnecting. Their seat is let go if they're not back when the game starts.">Offline</span>{/if}
            {#if !local && p.id === session.myPlayerId}<span class="tag you">You</span>{/if}
            {#if isHost && p.id !== s.hostId}
              <button
                class="remove"
                title="Remove {p.name}"
                aria-label="Remove {p.name}"
                onclick={() => (local ? session.dispatch({ type: 'remove', playerId: p.id }) : session.kick(p.id))}
                >×</button
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if waiting.length}
        <p class="hint muted">
          Waiting for a free seat: {waiting.map((o) => o.name + (o.id === session.myPlayerId ? ' (you)' : '')).join(', ')}
        </p>
      {/if}

      {#if local}
        {#if s.players.length < MAX_PLAYERS}
          <form class="add" onsubmit={addLocal}>
            <input
              class="field"
              class:shake={nameError}
              bind:value={newName}
              maxlength={MAX_NAME}
              autocomplete="off"
              spellcheck="false"
              placeholder={s.players.length ? 'Add another exile' : 'Add the first exile'}
            />
            <button class="btn" type="submit" disabled={nameTooShort(newName)}>Add</button>
          </form>
        {/if}
        <p class="hint muted">Pass the device around; each player answers on their own turn.</p>
      {:else if s.players.length < 2}
        <p class="hint muted waiting"><span class="pulse"></span>Waiting for exiles to join…</p>
      {/if}
    </section>

    <section class="panel settings" use:backdropShadow={{ fill: 'linear' }} in:fly={{ x: 30, duration: 500, delay: 200 }}>
      <header><h2>Rules</h2></header>

      <div class="setting">
        <span class="label" id="mode-label">Mode</span>
        <div class="modes" role="radiogroup" aria-labelledby="mode-label" aria-describedby="mode-blurb" tabindex={-1} onkeydown={modeKeys}>
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
              disabled={!isHost}
              title={offline(m.id) ? 'Race needs every player on their own device' : undefined}
              onclick={(e) => pickMode(m.id, e.currentTarget)}
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
              {:else if delve && delveCrowded}
                <p>On one device, Delve is a run alone. To delve together, host a room: everyone plays on their own device, as a team.</p>
              {:else if delve}
                <p>
                  {together ? 'Three lives each, one team, a depth deeper each question.' : 'Three lives, a depth deeper each question.'} No settings, so a depth
                  is the same for all.
                </p>
                {#if deepest}
                  <p class="deepest">{s.players.length < 2 ? 'Your deepest alone' : 'Your deepest with others'} <b>{deepest}</b></p>
                {/if}
              {:else if race}
                <p>Everyone answers at once. Fastest correct answer +1, wrong answer −1.</p>
              {:else}
                <p>Pick a category, answer alone. Wrong answers score nothing.</p>
              {/if}
            </div>
          {/key}
        </div>
      </div>

      {#if delve}
        <!-- Two columns once the panel is wide enough: the descent beside the finds. -->
        <div class="setting delve-rules">
          <div class="delve-cols">
            <div>
              <span class="label">The descent</span>
              <DelveLadder />
            </div>
            <div>
              <span class="label">{FINDS_LABEL}</span>
              <p class="finds-intro muted">{FINDS_INTRO}</p>
              <dl class="finds">
                {#each FIND_KINDS as kind (kind)}
                  <div>
                    <dt>{FIND_TEXT[kind].name}</dt>
                    <dd>{FIND_GIVES[kind]}</dd>
                  </div>
                {/each}
              </dl>
            </div>
          </div>
        </div>
      {:else}
        <div class="setting">
          <span class="label">Points to win</span>
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
        </div>

        <div class="setting">
          <span class="label">Difficulty</span>
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
          <!-- Every description sits in the same cell, so switching never changes the panel's height. -->
          <div class="blurbs">
            {#each DIFFS as d (d.id)}
              <p class="blurb muted" class:shown={difficulty === d.id} aria-hidden={difficulty !== d.id}>
                {describe({ ...s.settings, difficulty: d.id })}
              </p>
            {/each}
          </div>
        </div>

        <div class="setting">
          <span class="label">Time per question</span>
          <div class="seg">
            {#each TIMER_STEPS as t (t)}
              <button class:on={s.settings.timer === t} disabled={!isHost || (race && t === 0)} onclick={() => setTimer(t)}>
                {t === 0 ? 'Off' : `${t}s`}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <ul class="rules muted">
        {#if delve}
          {#if together}
            <li>The team votes for one of three cards; each vote is a ticket in the draw.</li>
            <li>Everyone answers the same question; the first right answer clears the depth.</li>
            <li>A wrong answer costs you a life and strikes that option for the team; so does running out of time.</li>
            <li>Between questions, give one of your lives to bring back a teammate who perished.</li>
            <li>The run ends when nobody is left standing; the team's depth is the result.</li>
          {:else}
            <li>Pick one of three categories; it stays locked for {lockoutText(delveLockout(1))}, longer deeper down.</li>
            <li>A wrong answer or a time-out costs a life. See how deep you get.</li>
            <li>Host a room to delve together as a team.</li>
          {/if}
        {:else if race}
          <li>Everyone sees the same question at the same time.</li>
          <li>The first correct answer scores a point and ends the question.</li>
          <li>A wrong answer costs a point and locks you out until the next question.</li>
          <li>First to {s.settings.targetScore} wins.</li>
        {:else}
          <li>On your turn, choose one of three item categories.</li>
          {#if lockout > 0}
            <li>A category you pick is locked for {lockoutText(lockout)}.</li>
          {/if}
          <li>Name the unique or lineage gem from its art; one answer is true.</li>
          <li>Correct answers score a point. First to {s.settings.targetScore} wins, once the round is finished.</li>
          <li>Tied at the top? The tied players settle it in a sudden-death deathmatch.</li>
        {/if}
      </ul>

      <div class="start">
        {#if isHost}
          <button class="btn primary big" disabled={!canStart} onclick={start}>{delve ? 'Begin the descent' : 'Begin the hunt'}</button>
          {#if delveCrowded}
            <p class="muted crowded">Delve on one device is for one player: remove the others, or host a room.</p>
          {/if}
        {:else}
          <p class="muted waiting"><span class="pulse"></span>Waiting for the host to start…</p>
        {/if}
      </div>
    </section>
  </div>
</div>

{#if editing && isHost && difficulty === 'custom' && !delve}
  <CustomDifficulty onclose={() => (editing = false)} />
{/if}

<style>
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
    justify-content: center;
  }
  .code {
    position: relative;
  }
  .code.hidden .glyph {
    color: var(--gold-lo);
  }
  .eye,
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
  .eye {
    position: absolute;
    right: -46px;
    top: 50%;
    translate: 0 -50%;
    width: 34px;
    height: 34px;
    justify-content: center;
    border-radius: 50%;
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
  .eye:hover,
  .lock:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .eye svg,
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
    max-width: 520px;
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    text-align: center;
    opacity: 0.8;
  }
  .visibility {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  .visibility button {
    padding: 0.45em 0.9em;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 0;
    cursor: pointer;
    transition: all 0.2s;
  }
  .visibility button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #7a4f1d, #452a0e);
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
  .room {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.8rem;
  }
  .code,
  .glyphs {
    display: flex;
    gap: 0.5rem;
  }
  /* One click or long press selects the whole code. */
  .glyphs {
    -webkit-user-select: all;
    user-select: all;
  }
  .glyph {
    width: clamp(46px, 11vw, 64px);
    height: clamp(58px, 14vw, 78px);
    display: grid;
    place-items: center;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: clamp(1.8rem, 6vw, 2.6rem);
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
    grid-template-columns: 1fr 1.15fr;
    gap: 1.2rem;
    align-items: start;
  }
  .panel {
    padding: 1.4rem;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 1rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  .panel h2 {
    font-size: 1.12rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .count {
    font-family: var(--font-display);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .players ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .players li {
    transition:
      border-color 0.25s,
      background 0.25s;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.5rem 0.6rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(59, 48, 36, 0.6);
  }
  .name {
    flex: 1;
    font-size: 1.1rem;
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
  .tag.you {
    border-color: #4a6b4a;
    color: #9fd59f;
  }
  .remove {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid transparent;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 1.2rem;
    line-height: 1;
  }
  .remove:hover {
    color: var(--bad);
    border-color: rgba(224, 85, 63, 0.4);
  }
  .add {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
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
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .mode {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.7rem 0.4rem 0.6rem;
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
    transition: left 0.3s var(--ease-out);
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
  .about p.deepest {
    margin-top: 0.3rem;
    font-style: normal;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .deepest b {
    margin-left: 0.4em;
    font-family: var(--font-cinzel);
    font-size: 1rem;
    letter-spacing: 0.04em;
    color: var(--gold-hi);
  }
  /* Delve's rules: the descent and the finds side by side once there is room, stacked on phones. */
  .delve-rules {
    container-type: inline-size;
  }
  .delve-cols {
    display: grid;
    gap: 1rem 1.2rem;
  }
  @container (min-width: 400px) {
    .delve-cols {
      grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
    }
  }
  .finds-intro {
    margin: 0 0 0.45rem;
    font-size: 0.93rem;
    font-style: italic;
    line-height: 1.25;
  }
  .finds {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }
  .finds dt {
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .finds dd {
    margin: 0.05rem 0 0;
    font-size: 0.93rem;
    line-height: 1.25;
    color: var(--muted);
  }
  /* Stacked on a phone, each find's name runs into its line. */
  @container (max-width: 399.98px) {
    .finds dt {
      display: inline;
      margin-right: 0.5em;
    }
    .finds dd {
      display: inline;
    }
    .finds > div {
      line-height: 1.25;
    }
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
    margin-left: auto;
  }
  .stepper button {
    min-width: 34px;
    padding: 0.45rem 0;
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

  .start {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .crowded {
    margin: 0;
    font-style: italic;
    text-align: center;
  }

  @media (max-width: 760px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 520px) {
    .code {
      align-items: center;
    }
    .code,
    .glyphs {
      gap: 0.35rem;
    }
    .glyph {
      width: 38px;
      height: 50px;
      font-size: 1.6rem;
    }
    .eye {
      position: static;
      translate: none;
      margin-left: 0.2rem;
    }
    .seg > button {
      min-width: 40px;
      padding: 0.45rem 0.45rem;
    }
    .seg {
      gap: 0.3rem;
    }
  }
</style>
