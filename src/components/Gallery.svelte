<!-- Who's watching the game: one short line whatever their number (an eye,
     their rings, how many); pressed, it opens the list: each by name, whether
     they take a seat next game, and for the host the kick. For the players it
     hangs under the scoreboard's strip (`hang`), out of the page's flow, so
     nothing moves when someone comes in to watch mid-game; on phones, where
     there is less room under the strip, it is just the eye and the count.
     A spectator sees it in the flow, with their own choice beside it (their
     view never has it come or go mid-game). -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { kickConfirm } from '../lib/kick';
  import KickButton from './KickButton.svelte';
  import OnlookerMark from './OnlookerMark.svelte';
  import PlayerName from './PlayerName.svelte';
  import WatchEye from './WatchEye.svelte';
  import WatchToggle from './WatchToggle.svelte';

  let { hang = false }: { hang?: boolean } = $props();
  const uid = $props.id();
  const spectators = $derived(session.state?.spectators ?? []);
  const canKick = $derived(session.mode === 'host');
  /** Rings shown in the line (the count says how many in all). */
  const SHOWN = 4;
  const names = $derived(spectators.map((o) => o.name).join(', '));

  let open = $state(false);
  let root = $state<HTMLElement>();
  let toggle = $state<HTMLButtonElement>();
  $effect(() => {
    if (!spectators.length) open = false;
  });

  // Kicking takes two clicks (lib/kick), as on the scoreboard and in the lobby.
  let confirming = $state<string | null>(null);
  const kicker = kickConfirm((id) => (confirming = id));
  onDestroy(kicker.dispose);
</script>

<!-- Escape takes an armed kick back, or else closes the list (focus back on the line). A press outside closes it. -->
<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    if (confirming) kicker.disarm();
    else if (open) (open = false, toggle?.focus());
  }}
  onpointerdown={(e) => {
    const t = e.target as Element;
    if (!t.closest?.('.kick.armed')) kicker.disarm();
    if (open && !root?.contains(t)) open = false;
  }}
/>

{#if spectators.length}
  <div class="gallery" class:hang bind:this={root} transition:fade={{ duration: 250 }}>
    <button
      class="line"
      bind:this={toggle}
      aria-expanded={open}
      aria-controls="{uid}-list"
      aria-label="{spectators.length} watching: {names}"
      title={names}
      onclick={() => (open = !open)}
    >
      <WatchEye />
      <span class="rings">
        {#each spectators.slice(0, SHOWN) as o (o.id)}<OnlookerMark name={o.name} size={20} />{/each}
      </span>
      <span class="count">{spectators.length}<span class="word">&nbsp;watching</span></span>
    </button>
    {#if session.spectating}<WatchToggle />{/if}
    {#if open}
      <ul class="list" id="{uid}-list" transition:fly={{ y: -6, duration: 180 }}>
        {#each spectators as o (o.id)}
          <li class:armed={confirming === o.id}>
            <OnlookerMark name={o.name} size={24} />
            <span class="name"><PlayerName name={o.name} />{#if o.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}</span>
            <span class="when" class:next={!o.stay}>{o.stay ? 'Watching' : 'Next game'}</span>
            {#if canKick}
              <KickButton name={o.name} armed={confirming === o.id} onclick={() => kicker.click(o.id) && session.kick(o.id)} />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .gallery {
    position: relative;
    z-index: 6;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin-top: -0.4rem;
    transition:
      opacity 0.3s,
      visibility 0.3s;
  }
  /* Under the strip at its right end, in the room between the entries and
     the banner, clear of the active entry's pointer and the banner's name. */
  .gallery.hang {
    position: absolute;
    top: calc(100% - 6px);
    left: 0;
    right: 0;
    margin: 0;
    justify-content: flex-end;
    pointer-events: none;
  }
  /* Its list opens under it, from the right. */
  .hang .list {
    left: auto;
    right: 0;
    translate: none;
  }
  .hang > * {
    pointer-events: auto;
  }
  /* Delve: the line over the banner when you pass your best (Game) has this room for its turn. */
  :global(.kicking) .gallery {
    opacity: 0;
    visibility: hidden;
  }

  .line {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 28px;
    padding: 0 0.75rem 0 0.6rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.55);
    color: var(--muted);
    font-family: var(--font-display);
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.2s,
      border-color 0.2s,
      background-color 0.2s;
  }
  .line :global(.eye) {
    --eye-size: 17px;
    color: var(--gold);
  }
  .line:hover,
  .line[aria-expanded='true'] {
    color: var(--gold-hi);
    border-color: var(--line);
    background: rgba(18, 14, 10, 0.85);
  }
  .line:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 2px;
  }
  .rings {
    display: inline-flex;
    align-items: center;
  }
  /* Overlapping, each ring's dark face over the one before. */
  .rings > :global(.onlooker + .onlooker) {
    margin-left: -6px;
  }
  .count {
    padding-top: 1px;
  }

  .list {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    translate: -50% 0;
    width: max-content;
    min-width: 240px;
    max-width: calc(100vw - 2rem);
    margin: 0;
    padding: 0.35rem;
    list-style: none;
    display: grid;
    gap: 0.15rem;
    border: 1px solid var(--gold-lo);
    border-radius: 8px;
    background: linear-gradient(180deg, #17110c, #0d0a07);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.06),
      0 12px 30px rgba(0, 0, 0, 0.65);
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 34px;
    padding: 0.25rem 0.3rem 0.25rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 999px;
    transition:
      border-color 0.25s,
      background-color 0.25s;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.95rem;
    color: var(--text);
  }
  .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  .when {
    flex: none;
    font-family: var(--font-display);
    font-size: 0.56rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 0.25em 0.6em 0.2em;
    border-radius: 2px;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .when.next {
    border-color: var(--gold-lo);
    color: var(--gold);
  }
  /* Pointing at the kick: the row it would remove warms red; armed, it takes the wrong-answer colours. */
  .list li:has(:global(.kick:hover)) {
    border-color: rgba(224, 85, 63, 0.45);
  }
  .list li.armed {
    border-color: #8e4434;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
  }
  .list li.armed .name {
    color: #eab3a3;
  }
  @media (max-width: 640px) {
    /* Phones: only the eye and the count, on the strip's lower edge. */
    .gallery.hang {
      top: calc(100% - 11px);
      padding-right: max(1rem, env(safe-area-inset-right));
    }
    .hang .list {
      right: max(1rem, env(safe-area-inset-right));
    }
    .hang .line {
      height: 18px;
      gap: 0.35rem;
      padding: 0 0.6rem 0 0.45rem;
      border-color: var(--line);
      background: rgba(14, 11, 8, 0.92);
    }
    .hang .line :global(.eye) {
      --eye-size: 14px;
    }
    .hang .rings,
    .hang .word {
      display: none;
    }
    /* Still a finger's worth to press, past its edges. */
    .hang .line::before {
      content: '';
      position: absolute;
      inset: -12px -8px;
    }
  }
  @media (pointer: coarse) {
    .gallery:not(.hang) .line {
      height: 32px;
    }
    .list li {
      --kick-size: 44px;
      min-height: 48px;
    }
  }
</style>
