<!-- How a player in the lobby stands, when not simply ready (lib/presence.ts),
     as a mark on their chip beside the host's banner or the ×: a word in a
     box sat badly in the round chips. Idle: a crescent moon (dozing, as
     chat apps show it). Away: the spectators' eye (WatchEye), closed (not
     looking at the game). Lagging and offline: a phone's signal, as everyone
     knows it. Lagging: only its two short bars lit. Offline: no bar lit and a
     strike through them, dim (not a ×, which would read as the kick's), so
     no connection reads apart from a bad one.
     The scoreboard shows the offline one too, at its own size (--standing-size). -->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { MARK_TEXT, type Mark } from '../lib/presence';

  let { mark, title }: { mark: Mark; title?: string } = $props();
  const text = $derived(MARK_TEXT[mark]);
  const id = $props.id();
  const BARS = [5, 9, 13, 17];
  const STRIKE = 'M4.5 6L20 21.5';
</script>

<span class="mark {mark}" role="img" aria-label={text.tag} title={title ?? text.title} transition:fade={{ duration: 250 }}
  ><svg viewBox="0 0 24 24" aria-hidden="true">
    {#if mark === 'idle'}
      <path d="M10.83 5.01A7.6 7.6 0 1 0 18.55 14.54A6.2 6.2 0 0 1 10.83 5.01Z" />
    {:else if mark === 'away'}
      <path d="M2.5 10.5A11.6 11.6 0 0 0 21.5 10.5" /><path d="M6.6 14.4l-1.3 2.1M12 16.2v2.5M17.4 14.4l1.3 2.1" />
    {:else}
      <!-- A phone's signal: four solid bars on one baseline, lagging with the two short ones lit. Offline, none
           lit and a light strike kept within the bars, cutting its own gap through them as a phone's does. -->
      <g mask={mark === 'offline' ? `url(#${id})` : undefined}>
        {#each BARS as h, i (i)}<rect class="bar" class:faint={mark === 'offline' || i > 1} x={2.5 + i * 5} y={20.5 - h} width="3.5" height={h} rx="1" />{/each}
      </g>
      {#if mark === 'offline'}
        <mask {id}><rect width="24" height="24" fill="#fff" /><path d={STRIKE} stroke="#000" stroke-width="4" /></mask>
        <path class="strike" d={STRIKE} />
      {/if}
    {/if}
  </svg></span
>

<style>
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    margin: 0 0.1rem 0 0.2rem;
    color: var(--muted);
  }
  svg {
    width: var(--standing-size, 20px);
    height: var(--standing-size, 20px);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bar {
    fill: currentColor;
    stroke: none;
  }
  .faint {
    opacity: 0.38;
  }
  .strike {
    stroke-width: 1.5;
    opacity: 0.6;
  }
</style>
