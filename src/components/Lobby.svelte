<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { session, myId } from '../lib/session.svelte';
  import { MAX_PLAYERS, MAX_NAME, DIFFICULTIES, type Difficulty } from '../lib/game';
  import { sfx } from '../lib/sound';
  import Avatar from './Avatar.svelte';

  const TIMERS = [0, 10, 15, 20, 30, 45];
  const TARGETS = [5, 10, 15, 20];
  const DIFFS: { id: Difficulty; name: string; blurb: string }[] = [
    {
      id: 'cruel',
      name: 'Cruel',
      blurb: 'Four options, all of the same kind (all rings, all bows…). Some questions ask you to find the art for a name.',
    },
    {
      id: 'merciless',
      name: 'Merciless',
      blurb: 'Six options, half of them with names that look alike. The art is hidden under tiles that lift one by one.',
    },
    {
      id: 'eternal',
      name: 'Eternal',
      blurb: 'Eight look-alike names. Tiles lift slowly, and "find the art" pictures lose their colour. Good luck, exile.',
    },
  ];

  const s = $derived(session.state!);
  const isHost = $derived(session.isHost);
  const local = $derived(session.mode === 'local');

  let newName = $state('');
  let copied = $state(false);

  const inviteLink = $derived(`${location.origin}${location.pathname}?room=${session.code}`);

  function addLocal(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    session.dispatch({ type: 'join', playerId: crypto.randomUUID(), name });
    newName = '';
  }

  async function copy() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Exile Trivia', text: `Join my PoE2 trivia room ${session.code}`, url: inviteLink });
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
    sfx('click');
    session.dispatch({ type: 'settings', settings: { targetScore: v } });
  }
  function setTimer(v: number) {
    sfx('click');
    session.dispatch({ type: 'settings', settings: { timer: v } });
  }
  function setDifficulty(v: Difficulty) {
    sfx('click');
    session.dispatch({ type: 'settings', settings: { difficulty: v } });
  }
  function start() {
    session.dispatch({ type: 'start' });
  }

  const canStart = $derived(s.players.length >= 1);
  const difficulty = $derived(s.settings.difficulty in DIFFICULTIES ? s.settings.difficulty : 'cruel');
</script>

<div class="lobby">
  {#if !local}
    <section class="room" in:fly={{ y: -20, duration: 500 }}>
      <span class="label">Room code</span>
      <div class="code" aria-label="Room code {session.code}">
        {#each session.code.split('') as ch, i (i)}
          <span class="glyph" style:animation-delay="{i * 80}ms">{ch}</span>
        {/each}
      </div>
      <button class="btn small" onclick={copy}>
        {copied ? 'Link copied!' : 'Copy invite link'}
      </button>
    </section>
  {/if}

  <div class="cols">
    <section class="panel players" in:fly={{ x: -30, duration: 500, delay: 100 }}>
      <header>
        <h2>Party</h2>
        <span class="count">{s.players.length} / {MAX_PLAYERS}</span>
      </header>
      <ul>
        {#each s.players as p (p.id)}
          <li animate:flip={{ duration: 300 }} in:fly={{ x: -20, duration: 350 }} out:scale={{ duration: 200, start: 0.9 }}>
            <Avatar name={p.name} hue={p.hue} />
            <span class="name">{p.name}</span>
            {#if p.id === s.hostId}<span class="tag">Host</span>{/if}
            {#if !local && p.id === myId}<span class="tag you">You</span>{/if}
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

      {#if local}
        <form class="add" onsubmit={addLocal}>
          <input
            class="field"
            bind:value={newName}
            maxlength={MAX_NAME}
            placeholder={s.players.length ? 'Add another exile' : 'Add the first exile'}
            disabled={s.players.length >= MAX_PLAYERS}
          />
          <button class="btn" type="submit" disabled={!newName.trim()}>Add</button>
        </form>
        <p class="hint muted">Pass the device around — each player answers on their own turn.</p>
      {:else if s.players.length < 2}
        <p class="hint muted waiting"><span class="pulse"></span>Waiting for exiles to join…</p>
      {/if}
    </section>

    <section class="panel settings" in:fly={{ x: 30, duration: 500, delay: 200 }}>
      <header><h2>Rules</h2></header>

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
        {#key difficulty}
          <p class="blurb muted" in:fly={{ y: -4, duration: 250 }}>{DIFFS.find((d) => d.id === difficulty)?.blurb}</p>
        {/key}
      </div>

      <div class="setting">
        <span class="label">Time per question</span>
        <div class="seg">
          {#each TIMERS as t (t)}
            <button class:on={s.settings.timer === t} disabled={!isHost} onclick={() => setTimer(t)}>
              {t === 0 ? 'Off' : `${t}s`}
            </button>
          {/each}
        </div>
      </div>

      <ul class="rules muted">
        <li>On your turn, choose one of three item categories.</li>
        <li>A category you pick is locked for your next two turns.</li>
        <li>Name the unique or lineage gem from its art — one answer is true.</li>
        <li>Correct answers score a point. First to {s.settings.targetScore} wins, once the round is finished.</li>
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
    font-family: var(--font-display);
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
    font-size: 1rem;
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
    background: linear-gradient(180deg, #7a4f1d, #452a0e);
    border-color: var(--gold);
    box-shadow: 0 0 12px rgba(201, 164, 92, 0.25);
  }
  .seg button:disabled {
    cursor: default;
  }
  .seg > button:disabled:not(.on) {
    opacity: 0.5;
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
</style>
