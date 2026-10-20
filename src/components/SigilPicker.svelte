<script lang="ts">
  // The class sigils (lib/sigils.ts): each achievement earned unlocks one,
  // of the class picked here, and one unlocked is worn with a click. On the
  // Codex's achievements page (CodexAchievements) and in the settings.
  // Unlocking is for good, so a locked class picked asks once more first.
  import { onMount } from 'svelte';
  import { CLASSES, className, sigilUrl, type PlayerClass } from '../lib/classSigils';
  import { SIGILS_KEY, loadSigils, sigilsToUnlock, unlockSigil, wearSigil } from '../lib/sigils';
  import { onStoredElsewhere } from '../lib/storage';
  import { savedName } from '../lib/session.svelte';
  import Avatar from './Avatar.svelte';

  /** achievements: how many this player has earned, each worth a sigil. */
  let { achievements }: { achievements: number } = $props();

  let sigils = $state.raw(loadSigils());
  onMount(() => onStoredElsewhere({ [SIGILS_KEY]: () => (sigils = loadSigils()) }));

  const left = $derived(sigilsToUnlock(sigils, achievements));
  /** A locked class picked, waiting to be unlocked. */
  let asking = $state<PlayerClass | null>(null);
  // (One no longer there to unlock, after a change in another tab, isn't asked about.)
  const ask = $derived(left ? asking : null);
  /** On the avatar: the one asked about, else the one worn. */
  const shown = $derived(ask ?? sigils.worn ?? undefined);
  const name = savedName() || 'Exile';

  function pick(c: PlayerClass) {
    if (sigils.unlocked.includes(c)) {
      asking = null;
      sigils = wearSigil(sigils.worn === c ? null : c) ?? sigils;
    } else if (left) asking = asking === c ? null : c;
  }
  function unlock() {
    if (!ask) return;
    sigils = unlockSigil(ask, achievements) ?? sigils;
    asking = null;
  }
</script>

<div class="sigils">
  <div class="you">
    <Avatar {name} hue={0} size={64} sigil={shown} />
    <p class="line">
      {#if ask}
        Unlock the {className(ask)}'s sigil? It stays yours.
      {:else if left}
        {left === 1 ? 'One sigil' : `${left} sigils`} to unlock: pick a class.
      {:else if sigils.unlocked.length === CLASSES.length}
        Every class unlocked.
      {:else}
        Each achievement you earn unlocks one, of the class you pick.
      {/if}
    </p>
    <!-- Kept in place while hidden, so the line never moves when it shows. -->
    <div class="acts" class:off={!ask} inert={!ask}>
      <button class="btn small ghost" onclick={() => (asking = null)}>Not yet</button>
      <button class="btn small primary" onclick={unlock}>Unlock</button>
    </div>
  </div>

  <ul class="classes">
    {#each CLASSES as c (c)}
      {@const have = sigils.unlocked.includes(c)}
      <li>
        <button
          class="class"
          class:have
          class:worn={sigils.worn === c}
          class:asked={ask === c}
          disabled={!have && !left}
          aria-pressed={have ? sigils.worn === c : ask === c}
          title={have ? (sigils.worn === c ? 'Worn: click to take it off' : 'Click to wear it') : left ? 'Click to unlock it' : 'Earn an achievement to unlock it'}
          onclick={() => pick(c)}
        >
          <span class="art" style:--sigil="url({sigilUrl(c)})"></span>
          <span class="name">{className(c)}</span>
          <span class="state">{have ? (sigils.worn === c ? 'Worn' : 'Unlocked') : 'Locked'}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .sigils {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  /* Your token as it would look, what's asked and the step it needs, at a fixed height so nothing jumps. */
  .you {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 72px;
  }
  .line {
    flex: 1;
    margin: 0;
    font-size: 0.98rem;
    font-style: italic;
    color: #cbbfa8;
  }
  .acts {
    display: flex;
    gap: 0.5rem;
  }
  .acts.off {
    visibility: hidden;
  }
  .classes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .class {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.55rem 0.3rem 0.45rem;
    border-radius: 8px;
    border: 1px solid transparent;
    background: rgba(0, 0, 0, 0.18);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .class:disabled {
    cursor: default;
  }
  .class:hover:not(:disabled) {
    border-color: rgba(201, 164, 92, 0.35);
  }
  .class.have {
    border-color: rgba(201, 164, 92, 0.18);
    background: linear-gradient(180deg, rgba(201, 164, 92, 0.08), rgba(0, 0, 0, 0.15) 70%);
  }
  .class.worn,
  .class.asked {
    border-color: rgba(239, 207, 134, 0.7);
  }
  /* The game's gold art; locked, an engraving of it in stone. */
  .art {
    width: 48px;
    height: 60px;
    background: var(--sigil) center / contain no-repeat;
  }
  .class:not(.have) .art {
    filter: grayscale(1) brightness(0.45);
  }
  .class.asked .art {
    filter: none;
  }
  .name {
    font-family: var(--font-display);
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    color: #b9ab94;
  }
  .have .name {
    color: var(--gold-hi);
  }
  .state {
    font-size: 0.78rem;
    font-style: italic;
    color: var(--muted);
  }
  .worn .state {
    color: #b59a63;
  }

  @media (max-width: 900px) {
    .classes {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .classes {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .you {
      flex-wrap: wrap;
    }
    .acts {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
