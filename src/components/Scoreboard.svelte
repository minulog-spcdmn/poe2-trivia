<script lang="ts">
  import { flip } from 'svelte/animate';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import { backdropShadow } from '../lib/backdropShadow';

  const s = $derived(session.state!);
  const target = $derived(s.settings.targetScore);
  const race = $derived(s.settings.mode === 'race');
  const missed = $derived(new Set(s.question?.misses.map((m) => m.playerId) ?? []));
  const canKick = $derived(session.mode === 'host');
  const spectators = $derived(s.spectators ?? []);

  // Kicking takes two clicks so a stray tap doesn't remove anyone.
  let confirming = $state<string | null>(null);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  function kick(id: string) {
    if (confirming !== id) {
      confirming = id;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => (confirming = null), 3000);
      return;
    }
    confirming = null;
    session.kick(id);
  }
</script>

<ol class="board">
  {#each s.players as p, i (p.id)}
    {@const active = race ? s.phase === 'reveal' && s.reveal?.winnerId === p.id : i === s.turn && s.phase !== 'over'}
    {@const out = race && s.phase !== 'over' && missed.has(p.id)}
    {@const benched = !!s.deathmatch && s.phase !== 'over' && !s.deathmatch.alive.includes(p.id)}
    {@const duelist = !!s.deathmatch && s.phase !== 'over' && s.deathmatch.alive.includes(p.id)}
    <li use:backdropShadow class:active class:out class:benched class:duelist class:offline={!p.connected} animate:flip={{ duration: 400 }} style:--c={playerColor(p.hue)}>
      <Avatar name={p.name} hue={p.hue} size={32} dim={!p.connected} />
      <div class="info">
        <span class="name">
          {p.name}{#if session.mode !== 'local' && p.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}
        </span>
        <span class="bar"><span style:width="{Math.max(0, Math.min(100, (p.score / target) * 100))}%"></span></span>
      </div>
      {#key p.score}
        <span class="score" class:negative={p.score < 0} class:bump={race ? active : p.score > 0} class:down={out}
          >{p.score}</span
        >
      {/key}
      {#if !p.connected}<span class="off" title="Disconnected">⚡</span>{/if}
      {#if canKick && p.id !== s.hostId}
        <button
          class="kick"
          class:confirm={confirming === p.id}
          onclick={() => kick(p.id)}
          title="Remove {p.name} from the game"
          aria-label="Remove {p.name}"
        >
          {confirming === p.id ? 'Kick?' : '×'}
        </button>
      {/if}
      {#if out}<span class="x" title="Answered wrong">✕</span>{/if}
    </li>
  {/each}
</ol>
{#if spectators.length}
  <p class="watching">
    <span class="eye" aria-hidden="true">👁</span>
    Watching:
    {#each spectators as o (o.id)}
      <span class="spectator"
        >{o.name}{#if o.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}{#if canKick}<button
            class="kick-inline"
            class:confirm={confirming === o.id}
            onclick={() => kick(o.id)}
            title="Remove {o.name}"
            aria-label="Remove {o.name}">{confirming === o.id ? 'Kick?' : '×'}</button
          >{/if}</span
      >
    {/each}
    <span class="hint">· joining next game</span>
  </p>
{/if}

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 1rem 0.2rem 0.6rem;
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 160px;
    padding: 0.45rem 0.8rem 0.45rem 0.5rem;
    background: rgba(12, 10, 8, 0.75);
    border: 1px solid var(--line);
    border-radius: 999px;
    --bs1: 0px 22px;
    box-shadow:
      0 0 0 1px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      border-color 0.35s,
      --bs-ring 0.35s,
      --bs1-color 0.35s,
      transform 0.35s var(--ease-out),
      opacity 0.35s;
  }
  li.active {
    border-color: var(--c);
    --bs-ring: color-mix(in srgb, var(--c), transparent 60%);
    --bs1-color: color-mix(in srgb, var(--c), transparent 70%);
    transform: translateY(-2px) scale(1.04);
  }
  li.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -10px;
    translate: -50% 0;
    border: 5px solid transparent;
    border-top-color: var(--c);
  }
  .kick {
    position: absolute;
    top: -8px;
    left: -6px;
    min-width: 20px;
    height: 20px;
    padding: 0 0.35em;
    border-radius: 10px;
    border: 1px solid rgba(224, 85, 63, 0.5);
    background: #1c0f0b;
    color: #ff9c86;
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
  }
  li:hover .kick,
  .kick:focus-visible,
  .kick.confirm {
    opacity: 1;
  }
  .kick.confirm {
    background: var(--bad);
    color: #fff;
  }
  @media (hover: none) {
    .kick {
      opacity: 0.8;
    }
  }
  li.benched {
    opacity: 0.4;
    filter: grayscale(0.7);
  }
  li.duelist {
    border-color: rgba(224, 85, 63, 0.55);
  }
  li.out {
    border-color: rgba(224, 85, 63, 0.6);
    opacity: 0.75;
  }
  .x {
    position: absolute;
    top: -7px;
    right: -4px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: #fff;
    background: var(--bad);
    border-radius: 50%;
    animation: pop 0.35s var(--ease-back);
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
  }
  .negative {
    color: #ff9c86;
  }
  .down {
    animation: down 0.7s var(--ease-back);
  }
  @keyframes down {
    0% {
      transform: scale(2.1);
      color: var(--bad);
      text-shadow: 0 0 16px var(--bad);
    }
  }
  li.offline {
    opacity: 0.5;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .name {
    font-size: 0.98rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 9.5rem;
    /* Room for descenders (g, y) that overflow: hidden would clip at line-height 1.1 */
    padding-bottom: 0.2em;
    margin-bottom: -0.2em;
  }
  .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  .bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c), black 30%), var(--c));
    transition: width 0.8s var(--ease-out);
  }
  .score {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.3rem;
    color: var(--gold-hi);
    min-width: 1.4ch;
    text-align: right;
  }
  .bump {
    animation: bump 0.7s var(--ease-back);
  }
  @keyframes bump {
    0% {
      transform: scale(2.1);
      color: var(--good);
      text-shadow: 0 0 16px var(--good);
    }
  }
  .off {
    position: absolute;
    top: -6px;
    left: 26px;
    font-size: 0.8rem;
  }

  .watching {
    margin: -0.2rem 0 0;
    text-align: center;
    font-size: 0.88rem;
    color: var(--muted);
  }
  .watching em,
  .watching .hint {
    font-size: 0.9em;
    font-style: italic;
  }
  .spectator {
    color: var(--text);
    margin-left: 0.5em;
  }
  .kick-inline {
    margin-left: 0.25em;
    padding: 0 0.35em;
    border: 1px solid rgba(224, 85, 63, 0.5);
    border-radius: 8px;
    background: #1c0f0b;
    color: #ff9c86;
    font-size: 0.7rem;
    line-height: 1.3;
    cursor: pointer;
  }
  .kick-inline.confirm {
    background: var(--bad);
    color: #fff;
  }

  @media (max-width: 640px) {
    .board {
      gap: 0.4rem;
    }
    li {
      min-width: 0;
      padding: 0.3rem 0.6rem 0.3rem 0.3rem;
    }
    .name {
      max-width: 5.5rem;
      font-size: 0.85rem;
    }
    .score {
      font-size: 1.05rem;
    }
  }
</style>
