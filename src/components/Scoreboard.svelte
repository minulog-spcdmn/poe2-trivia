<script lang="ts">
  import { flip } from 'svelte/animate';
  import { session, myId } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';

  const s = $derived(session.state!);
  const target = $derived(s.settings.targetScore);
</script>

<ol class="board">
  {#each s.players as p, i (p.id)}
    {@const active = i === s.turn && s.phase !== 'over'}
    <li class:active class:offline={!p.connected} animate:flip={{ duration: 400 }} style:--c={playerColor(p.hue)}>
      <Avatar name={p.name} hue={p.hue} size={32} dim={!p.connected} />
      <div class="info">
        <span class="name">
          {p.name}{#if session.mode !== 'local' && p.id === myId}<em>&nbsp;(you)</em>{/if}
        </span>
        <span class="bar"><span style:width="{Math.min(100, (p.score / target) * 100)}%"></span></span>
      </div>
      {#key p.score}
        <span class="score" class:bump={p.score > 0}>{p.score}</span>
      {/key}
      {#if !p.connected}<span class="off" title="Disconnected">⚡</span>{/if}
    </li>
  {/each}
</ol>

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 0.2rem 0.2rem 0.6rem;
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
    transition:
      border-color 0.35s,
      box-shadow 0.35s,
      transform 0.35s var(--ease-out),
      opacity 0.35s;
  }
  li.active {
    border-color: var(--c);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c), transparent 60%),
      0 0 22px color-mix(in srgb, var(--c), transparent 70%);
    transform: translateY(-2px) scale(1.04);
  }
  li.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -9px;
    translate: -50% 0;
    border: 5px solid transparent;
    border-top-color: var(--c);
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
