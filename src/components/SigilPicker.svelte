<script module lang="ts">
  /** The achievements still to earn for the next sigil, in words while there are few. */
  const COUNT = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  const count = (n: number) => COUNT[n - 1] ?? String(n);
</script>

<script lang="ts">
  // The class sigils (lib/sigils.ts): the first achievement earned unlocks
  // one, and every third after it another, of the class picked here, and one
  // unlocked is worn with a click. On the Codex's achievements page
  // (CodexAchievements) and in the settings.
  // Unlocking is for good, so a locked class picked asks once more first.
  // `strip`: the twelve in one row beside the avatar, named on hover (the
  // settings page, which has the width but not the height).
  import { onMount } from 'svelte';
  import { CLASSES, className, sigilUrl, type PlayerClass } from '../lib/classSigils';
  import { SIGILS_KEY, achievementsToNext, loadSigils, sigilsToUnlock, unlockSigil, wearSigil } from '../lib/sigils';
  import { onStoredElsewhere } from '../lib/storage';
  import { savedName, session } from '../lib/session.svelte';
  import { NAMELESS } from '../lib/names';
  import { COLOUR_KEY, loadColour } from '../lib/colour';
  import { reservedHueOf } from '../lib/game';
  import Avatar from './Avatar.svelte';

  /** achievements: how many this player has earned (lib/sigils.ts says what they're worth). unlocked: how many they have unlocked, for a count beside it. hue: the avatar's colour. */
  let {
    achievements,
    unlocked = $bindable(0),
    strip = false,
    hue,
  }: { achievements: number; unlocked?: number; strip?: boolean; hue?: number } = $props();
  const name = savedName() || NAMELESS;
  // The colour picked (lib/colour.ts), or the one kept for the name, unless
  // the page that has it says (the settings, as it's picked there).
  const own = () => reservedHueOf(name) ?? loadColour() ?? 0;
  let picked = $state(0);
  onMount(() => {
    if (hue !== undefined) return;
    picked = own();
    return onStoredElsewhere({ [COLOUR_KEY]: () => (picked = own()) });
  });

  let sigils = $state.raw(loadSigils());
  $effect.pre(() => {
    unlocked = sigils.unlocked.length;
  });
  onMount(() => onStoredElsewhere({ [SIGILS_KEY]: () => (sigils = loadSigils()) }));

  const left = $derived(sigilsToUnlock(sigils, achievements));
  /** Achievements still to earn for the next one, when there's none to unlock now. */
  const toNext = $derived(achievementsToNext(sigils, achievements));
  /** On a locked class, when there's none to unlock now: what it takes. */
  const locked = $derived(toNext === 1 ? 'Your next achievement unlocks one' : `${count(toNext ?? 0)} more achievements unlock one`);
  /** A locked class picked, waiting to be unlocked. */
  let asking = $state<PlayerClass | null>(null);
  // (One no longer there to unlock, after a change in another tab, isn't asked about.)
  const ask = $derived(left ? asking : null);
  /** On the avatar: the one asked about, else the one worn. */
  const shown = $derived(ask ?? sigils.worn ?? undefined);

  function pick(c: PlayerClass) {
    if (sigils.unlocked.includes(c)) {
      asking = null;
      sigils = wearSigil(sigils.worn === c ? null : c) ?? sigils;
      session.wearSigil();
    } else if (left) asking = asking === c ? null : c;
  }
  function unlock() {
    if (!ask) return;
    sigils = unlockSigil(ask, achievements) ?? sigils;
    session.wearSigil();
    asking = null;
  }
</script>

<div class="sigils" class:strip class:asking={!!ask}>
  <div class="you">
    <Avatar {name} hue={hue ?? picked} size={64} sigil={shown} />
    <p class="line">
      {#if ask && strip}
        Unlock the {className(ask)}’s sigil for good?
      {:else if ask}
        Unlock the {className(ask)}’s sigil? It stays yours.
      {:else if left}
        {left === 1 ? 'One sigil' : `${left} sigils`} to unlock: pick a class.
      {:else if toNext === null}
        Every class unlocked.
      {:else if !sigils.unlocked.length}
        Your first achievement unlocks one, of the class you pick.
      {:else if toNext === 1}
        Your next achievement unlocks another.
      {:else}
        {count(toNext)} more achievements unlock another.
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
          title="{strip ? `${className(c)}: ` : ''}{have ? (sigils.worn === c ? 'Worn: click to take it off' : 'Click to wear it') : left ? 'Click to unlock it' : locked}"
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

  /* In a row: the avatar, its line and the step it asks for on the left, the twelve beside them, unnamed but on hover. */
  .strip {
    flex-direction: row;
    align-items: center;
    gap: 1.4rem;
  }
  /* The avatar beside its line, the line centred on it. Asked to unlock,
     the question at the avatar's top and the step it asks for at its foot,
     in the avatar's height; a question that wraps pushes the step down
     rather than running under it. */
  .strip .you {
    flex: 0 0 330px;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
    align-items: center;
    column-gap: 1rem;
    row-gap: 0.3rem;
    min-height: 0;
  }
  .strip .you > :global(:first-child) {
    grid-row: 1 / span 2;
  }
  .strip .line {
    grid-area: 1 / 2 / 3 / 3;
    line-height: 1.35;
    font-size: 0.9rem;
  }
  .strip.asking .line {
    grid-row: 1;
    align-self: start;
  }
  .strip .acts {
    grid-area: 2 / 2;
  }
  .strip .classes {
    flex: 1;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .strip .class {
    padding: 0.45rem 0.1rem;
  }
  .strip .art {
    width: 100%;
    max-width: 40px;
    height: 50px;
  }
  /* (Still read out, from the button's own text.) */
  .strip :is(.name, .state) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .strip .class {
    position: relative;
  }

  @media (max-width: 900px) {
    .sigils:not(.strip) .classes {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .sigils:not(.strip) .classes {
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
