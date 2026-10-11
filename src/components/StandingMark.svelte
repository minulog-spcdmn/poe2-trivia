<!-- How a player in the lobby stands, when not simply ready (lib/presence.ts),
     as a mark on their chip beside the host's banner or the ×: a word in a
     box sat badly in the round chips. Idle: a crescent moon (dozing, as
     chat apps show it). Away: the spectators' eye (WatchEye), closed (not
     looking at the game). Lagging: a signal with only its two short bars
     lit. Offline: no bar lit, a cross beside them. -->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { STANDING_TEXT, type Standing } from '../lib/presence';

  let { standing }: { standing: Standing | 'offline' } = $props();

  const OFFLINE = { tag: 'Offline', title: "Reconnecting. Their seat is let go if they're not back when the game starts." };
  const text = $derived(standing === 'offline' ? OFFLINE : STANDING_TEXT[standing]);
</script>

<span class="mark {standing}" role="img" aria-label={text.tag} title={text.title} transition:fade={{ duration: 250 }}
  ><svg viewBox="0 0 24 24" aria-hidden="true">
    {#if standing === 'idle'}
      <path d="M10.83 5.01A7.6 7.6 0 1 0 18.55 14.54A6.2 6.2 0 0 1 10.83 5.01Z" />
    {:else if standing === 'away'}
      <path d="M2.5 10.5A11.6 11.6 0 0 0 21.5 10.5" /><path d="M6.6 14.4l-1.3 2.1M12 16.2v2.5M17.4 14.4l1.3 2.1" />
    {:else}
      <path class="bar" class:faint={standing === 'offline'} d="M6 19.5v-3M10.5 19.5v-6.5" /><path class="bar faint" d="M15 19.5v-10M19.5 19.5v-13.5" />
      {#if standing === 'offline'}<path d="M3.5 4.5l5 5M8.5 4.5l-5 5" />{/if}
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
  .slow {
    color: #eab3a3;
    filter: drop-shadow(0 0 4px rgba(224, 85, 63, 0.4));
  }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bar {
    stroke-width: 2.4;
  }
  .faint {
    opacity: 0.3;
  }
</style>
