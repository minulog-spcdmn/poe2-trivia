<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { KNOB_STEPS, MAX_PLAYERS, difficultyOf, knobsOf, rulesFor, type Difficulty, type GameMode, type Knobs } from '../lib/game';
  import { MAX_NAME } from '../lib/names';
  import { inviteUrl } from '../lib/site';
  import Avatar from './Avatar.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { glyphLanded, playerArrived, twinkle } from '../lib/fx/moments';
  import { onMount } from 'svelte';

  const TIMERS = [0, 10, 15, 20, 30, 45];
  const TARGETS = [5, 10, 15, 20];
  const DIFFS: { id: Difficulty; name: string }[] = [
    { id: 'cruel', name: 'Cruel' },
    { id: 'merciless', name: 'Merciless' },
    { id: 'eternal', name: 'Eternal' },
    { id: 'custom', name: 'Custom' },
  ];

  /** What the presets do; their tiles only lift in race. */
  function presetBlurb(d: Difficulty, race: boolean): string {
    switch (d) {
      case 'cruel':
        return 'Four options, all of the same kind (all rings, all bows…). Some questions ask you to find the art for a name.';
      case 'merciless':
        return race
          ? 'Six options, half of them with names that look alike. The art is hidden under tiles that lift one by one.'
          : 'Six options, half of them with names that look alike. In race, the art is also hidden under tiles that lift one by one.';
      default:
        return race
          ? 'Eight look-alike names, two of them made up. Tiles lift slowly, "find the art" pictures lose their colour, and some pictures are mirrored. Good luck, exile.'
          : 'Eight look-alike names, two of them made up. "Find the art" pictures lose their colour, and some pictures are mirrored; in race, tiles also hide the art. Good luck, exile.';
    }
  }

  const COUNT_WORDS: Record<number, string> = { 1: 'one', 2: 'two', 4: 'Four', 6: 'Six', 8: 'Eight' };

  /** A custom difficulty in words, for everyone in the room. */
  function customBlurb(k: Knobs): string {
    const lines: string[] = [];
    const alike = k.similarNames === 0 ? 'all of the same kind' : k.similarNames === 1 ? 'all with look-alike names' : 'half of them with names that look alike';
    lines.push(`${COUNT_WORDS[k.options]} options, ${alike}${k.fakes ? `, ${COUNT_WORDS[k.fakes]} made up` : ''}.`);
    if (k.artChance === 1) lines.push('Every question asks you to find the art for a name.');
    else if (k.artChance > 0) lines.push(`${Math.round(k.artChance * 100)}% of questions ask you to find the art for a name.`);
    if (k.veil !== 'off') lines.push(k.veil === 'slow' ? 'Tiles hide the art and lift slowly.' : 'The art is hidden under tiles that lift one by one.');
    if (k.grayscale && k.artChance > 0) lines.push('"Find the art" pictures lose their colour.');
    if (k.mirror) lines.push('Some pictures are mirrored.');
    return lines.join(' ');
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  /** The custom knobs, in the order they're shown, with a label for each step. */
  const KNOBS: { [K in keyof Knobs]: { key: K; name: string; label: (v: Knobs[K]) => string } }[keyof Knobs][] = [
    { key: 'options', name: 'Options', label: String },
    { key: 'similarNames', name: 'Look-alike names', label: (v) => (v === 0 ? 'None' : v === 1 ? 'All' : 'Half') },
    { key: 'fakes', name: 'Made-up names', label: String },
    { key: 'artChance', name: 'Find the art', label: (v) => (v ? pct(v) : 'Off') },
    { key: 'veil', name: 'Tiles over the art', label: (v) => (v === 'off' ? 'Off' : v === 'fast' ? 'Fast' : 'Slow') },
    { key: 'grayscale', name: 'Grayscale pictures', label: (v) => (v ? 'On' : 'Off') },
    { key: 'mirror', name: 'Mirrored pictures', label: (v) => (v ? pct(v) : 'Off') },
    { key: 'lockout', name: 'Category lockout', label: (v) => (v ? String(v) : 'Off') },
  ];

  const s = $derived(session.state!);
  const isHost = $derived(session.isHost);
  const local = $derived(session.mode === 'local');

  let newName = $state('');
  let copied = $state(false);

  const inviteLink = $derived(inviteUrl(session.code));

  function addLocal(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
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

  /** Svelte action: a new player's row arrives with a flash. */
  function arriving(node: HTMLElement) {
    if (!settled) return;
    const t = setTimeout(() => playerArrived(node), 120);
    return { destroy: () => clearTimeout(t) };
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
    session.dispatch({ type: 'settings', settings: mode === 'race' && s.settings.timer === 0 ? { mode, timer: 20 } : { mode } });
  }
  function setLocked(v: boolean) {
    session.dispatch({ type: 'settings', settings: { locked: v } });
  }
  function setPublic(v: boolean) {
    session.dispatch({ type: 'settings', settings: { public: v } });
  }
  function setTimer(v: number) {
    session.dispatch({ type: 'settings', settings: { timer: v } });
  }
  /** Host only: the custom knobs are folded away until asked for. */
  let tuning = $state(false);
  function setDifficulty(v: Difficulty) {
    if (v === 'custom') {
      // Custom starts from the preset that was picked, as it plays in this mode.
      tuning = true;
      if (difficulty !== 'custom') {
        session.dispatch({ type: 'settings', settings: { difficulty: v, custom: knobsOf(s.settings) } });
        return;
      }
    }
    session.dispatch({ type: 'settings', settings: { difficulty: v } });
  }
  function setKnob<K extends keyof Knobs>(key: K, v: Knobs[K]) {
    session.dispatch({ type: 'settings', settings: { custom: { [key]: v } } });
  }
  function start() {
    session.dispatch({ type: 'start' });
  }

  const canStart = $derived(s.players.length >= 1);
  /** Spectators left over when the last game filled every seat. */
  const waiting = $derived(s.spectators ?? []);
  const race = $derived(s.settings.mode === 'race');
  const difficulty = $derived(difficultyOf(s.settings.difficulty));
  const knobs = $derived(knobsOf(s.settings));
  const lockout = $derived(rulesFor(s.settings).lockout);
  const blurb = $derived(difficulty === 'custom' ? customBlurb(knobs) : presetBlurb(difficulty, race));
</script>

<div class="lobby">
  {#if !local}
    <section class="room" in:fly={{ y: -20, duration: 500 }}>
      <span class="label">Room code</span>
      <div class="code" class:hidden={session.hideCode} aria-label={session.hideCode ? 'Room code hidden' : `Room code ${session.code}`}>
        {#each session.code.split('') as ch, i (i)}
          <span class="glyph" use:landing={i} style:animation-delay="{i * 80}ms" style:--i={i}>{session.hideCode ? '•' : ch}</span>
        {/each}
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
          <li use:arriving animate:flip={{ duration: 300 }} in:fly={{ x: -20, duration: 350 }} out:scale={{ duration: 200, start: 0.9 }}>
            <Avatar name={p.name} hue={p.hue} />
            <span class="name">{p.name}</span>
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
              bind:value={newName}
              maxlength={MAX_NAME}
              autocomplete="off"
              spellcheck="false"
              placeholder={s.players.length ? 'Add another exile' : 'Add the first exile'}
            />
            <button class="btn" type="submit" disabled={!newName.trim()}>Add</button>
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
        <span class="label">Mode</span>
        <div class="modes">
          <button class="mode-card" class:on={!race} disabled={!isHost} onclick={() => setMode('turns')}>
            <b>Take turns</b>
            <span>Pick a category, answer alone. Wrong answers score nothing.</span>
          </button>
          <button
            class="mode-card"
            class:on={race}
            disabled={!isHost || local}
            onclick={() => setMode('race')}
            title={local ? 'Race needs every player on their own device' : undefined}
          >
            <b>Race</b>
            <span>
              {#if local}Online only: everyone needs their own device.{:else}Everyone answers at once. Fastest correct answer +1, wrong answer −1.{/if}
            </span>
          </button>
        </div>
      </div>

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
            <button class:on={difficulty === d.id} disabled={!isHost} onclick={() => setDifficulty(d.id)}>{d.name}</button>
          {/each}
        </div>
        {#key blurb}
          <p class="blurb muted" in:fly={{ y: -4, duration: 250 }}>{blurb}</p>
        {/key}
        {#if difficulty === 'custom' && isHost}
          <button class="tune" aria-expanded={tuning} onclick={() => (tuning = !tuning)}>
            {tuning ? 'Hide the knobs' : 'Adjust the knobs'}<span class="chev" class:open={tuning} aria-hidden="true">▾</span>
          </button>
          {#if tuning}
            <div class="knobs" transition:fly={{ y: -6, duration: 220 }}>
              {#each KNOBS as knob (knob.key)}
                <div class="knob">
                  <span class="knob-name">{knob.name}</span>
                  <div class="seg small">
                    {#each KNOB_STEPS[knob.key] as step (String(step))}
                      <button class:on={knobs[knob.key] === step} onclick={() => setKnob(knob.key, step)}>
                        {(knob.label as (v: typeof step) => string)(step)}
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <div class="setting">
        <span class="label">Time per question</span>
        <div class="seg">
          {#each TIMERS as t (t)}
            <button class:on={s.settings.timer === t} disabled={!isHost || (race && t === 0)} onclick={() => setTimer(t)}>
              {t === 0 ? 'Off' : `${t}s`}
            </button>
          {/each}
        </div>
      </div>

      <ul class="rules muted">
        {#if race}
          <li>Everyone sees the same question at the same time.</li>
          <li>The first correct answer scores a point and ends the question.</li>
          <li>A wrong answer costs a point and locks you out until the next question.</li>
          <li>First to {s.settings.targetScore} wins.</li>
        {:else}
          <li>On your turn, choose one of three item categories.</li>
          {#if lockout > 0}
            <li>A category you pick is locked for your next {lockout === 1 ? 'turn' : `${lockout} turns`}.</li>
          {/if}
          <li>Name the unique or lineage gem from its art; one answer is true.</li>
          <li>Correct answers score a point. First to {s.settings.targetScore} wins, once the round is finished.</li>
          <li>Tied at the top? The tied players settle it in a sudden-death deathmatch.</li>
        {/if}
      </ul>

      <div class="start">
        {#if isHost}
          <button class="btn primary big" disabled={!canStart} onclick={start}>Begin the hunt</button>
        {:else}
          <p class="muted waiting"><span class="pulse"></span>Waiting for the host to start…</p>
        {/if}
      </div>
    </section>
  </div>
</div>

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
  .code {
    display: flex;
    gap: 0.5rem;
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
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .mode-card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.7rem 0.85rem;
    text-align: left;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .mode-card b {
    font-family: var(--font-display);
    font-size: 0.9rem;
    letter-spacing: 0.06em;
    color: var(--gold-hi);
  }
  .mode-card span {
    font-size: 0.9rem;
    line-height: 1.3;
    color: var(--muted);
  }
  .mode-card:hover:not(:disabled) {
    border-color: var(--gold-lo);
  }
  .mode-card.on {
    background: linear-gradient(180deg, rgba(122, 79, 29, 0.55), rgba(69, 42, 14, 0.55));
    border-color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.2),
      inset 0 0 18px rgba(255, 150, 60, 0.12),
      0 0 18px rgba(201, 164, 92, 0.25);
  }
  .mode-card.on b {
    text-shadow: 0 0 12px rgba(241, 217, 155, 0.45);
  }
  .mode-card.on span {
    color: #e3d3b4;
  }
  .mode-card:disabled {
    cursor: default;
  }
  .mode-card:disabled:not(.on) {
    opacity: 0.5;
  }
  .blurb {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    font-style: italic;
    min-height: 2.8em;
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
  .mode-card:active:not(:disabled) {
    transform: scale(0.96);
  }
  .seg button:disabled {
    cursor: default;
  }
  .seg > button:disabled:not(.on) {
    opacity: 0.5;
  }
  .tune {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    margin-top: 0.6rem;
    padding: 0.35em 0.8em;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .tune:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .chev {
    display: inline-block;
    transition: rotate 0.2s;
  }
  .chev.open {
    rotate: 180deg;
  }
  .knobs {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-top: 0.7rem;
    padding: 0.8rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(59, 48, 36, 0.6);
    border-radius: 4px;
  }
  .knob {
    display: grid;
    grid-template-columns: 9.5rem 1fr;
    align-items: center;
    gap: 0.6rem;
  }
  .knob-name {
    font-size: 0.95rem;
    color: var(--muted);
  }
  .seg.small {
    gap: 0.3rem;
  }
  .seg.small > button {
    min-width: 40px;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
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
    justify-content: center;
  }

  @media (max-width: 760px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 520px) {
    .code {
      gap: 0.35rem;
      align-items: center;
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
    .knob {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
  }
</style>
