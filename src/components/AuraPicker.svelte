<script lang="ts">
  // The player auras (lib/auraKinds.ts), beside the class sigils' picker
  // (SigilPicker) on the Codex's achievements page and in the settings, and
  // picked the same way: one found (lib/auraStore.ts) is worn with a click,
  // and the one worn taken off with another. One not found yet shows how it
  // is found (AURA_HINTS): in its title, and in the line, picked (a phone
  // shows no titles). Each is its card's sign (lib/auraEngraving.ts
  // auraSign) in its card's ink (lib/auraInk.ts); not found, in stone grey.
  // The token showing it is SigilPicker's, with the sigil worn: `worn` says
  // which to show there. `strip`: the seventeen in one row, named on hover
  // (the settings page, as its sigils are); `head` then stands beside the
  // line, where the sigils' token stands over it, rather than in a row of its own.
  import { onMount, type Snippet } from 'svelte';
  import { AURA_HINTS, AURA_NAMES, WORN, type AuraKind } from '../lib/auraKinds';
  import { AURAS_KEY, loadAuras, owns, wearAura, wornAura } from '../lib/auraStore';
  import { auraInk } from '../lib/auraInk';
  import type { Stroke } from '../lib/cardEngraving';
  import { onStoredElsewhere } from '../lib/storage';
  import { session } from '../lib/session.svelte';

  /** worn: the aura worn, for the token beside it. found: how many of WORN are owned, for a count beside it. */
  let { strip = false, head, worn = $bindable(null), found = $bindable(0) }: { strip?: boolean; head?: Snippet; worn?: AuraKind | null; found?: number } = $props();

  let auras = $state.raw(loadAuras());
  onMount(() => onStoredElsewhere({ [AURAS_KEY]: () => (auras = loadAuras()) }));
  $effect.pre(() => {
    worn = wornAura(auras);
    found = WORN.filter((k) => owns(auras, k)).length;
  });

  /** Each one's sign, engraved once the page is up (their files come with it), in a box kept for it meanwhile. */
  let signs = $state.raw<Partial<Record<AuraKind, Stroke[]>> | null>(null);
  let box = $state(26);
  onMount(() => {
    let gone = false;
    void import('../lib/auraEngraving').then(({ auraSign, SIGN_BOX }) => {
      if (gone) return;
      box = 2 * SIGN_BOX;
      signs = Object.fromEntries(WORN.map((k) => [k, auraSign(k)]));
    });
    return () => {
      gone = true;
    };
  });

  /** One not found yet, picked: the line says how it's found. */
  let asked = $state<AuraKind | null>(null);
  // (One found meanwhile, in another tab, isn't asked about.)
  const ask = $derived(asked && !owns(auras, asked) ? asked : null);
  const name = (k: AuraKind) => AURA_NAMES[k].name;

  function pick(k: AuraKind) {
    if (owns(auras, k)) {
      asked = null;
      auras = wearAura(worn === k ? null : k) ?? auras;
      session.wearSigil();
    } else asked = asked === k ? null : k;
  }
</script>

<div class="auras" class:strip>
  <div class="lead" class:headed={!!head}>
    {#if strip && head}{@render head()}{/if}
    <p class="line">
      {#if ask}
        {name(ask)}, not found yet. {AURA_HINTS[ask]}
      {:else if !found}
        None found yet: each turns up as a rare card in play, and is worn as it’s found. Pick one to see how.
      {:else if worn}
        Wearing {name(worn)}. Pick it again to take it off.
      {:else if found === WORN.length}
        Every aura found: pick one to wear it.
      {:else}
        {found === 1 ? 'One' : found} found: pick one to wear it.
      {/if}
    </p>
  </div>

  <ul class="kinds">
    {#each WORN as k (k)}
      {@const have = owns(auras, k)}
      {@const on = worn === k}
      <li>
        <button
          class="kind"
          class:have
          class:worn={on}
          class:asked={ask === k}
          style={auraInk(k)}
          aria-pressed={have ? on : ask === k}
          title="{strip || !have ? `${name(k)}: ` : ''}{have ? (on ? 'Worn: click to take it off' : 'Click to wear it') : AURA_HINTS[k]}"
          onclick={() => pick(k)}
        >
          <svg class="art" viewBox="0 0 {box} {box}" aria-hidden="true">
            {#each signs?.[k] ?? [] as { cls, d }, i (i)}<path {d} class={cls} />{/each}
          </svg>
          <span class="name">{name(k)}</span>
          <span class="state">{have ? (on ? 'Worn' : 'Found') : 'Not found'}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .auras {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  /* What's worn, or how the one picked is found: room kept for the longest, so the tiles never move. */
  .line {
    margin: 0;
    min-height: calc(2 * 1.45em);
    line-height: 1.45;
    font-size: 1rem;
    font-style: italic;
    color: var(--text-lo);
  }
  .kinds {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .kind {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.5rem 0.25rem 0.45rem;
    border-radius: 8px;
    border: 1px solid transparent;
    background: rgba(0, 0, 0, 0.18);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .kind:hover {
    border-color: rgba(201, 164, 92, 0.35);
  }
  .kind.have {
    border-color: rgba(201, 164, 92, 0.18);
    background: linear-gradient(180deg, rgba(201, 164, 92, 0.08), rgba(0, 0, 0, 0.15) 70%);
  }
  .kind.worn,
  .kind.asked {
    border-color: rgba(239, 207, 134, 0.7);
  }
  /* Its card's sign, in its card's ink; not found, cut in stone, as a locked
     sigil is: one grey for all (each ink greyed came out as dark as it was,
     the Vaal's and Chayula's near the tile's own). */
  .art {
    width: 40px;
    height: 40px;
    color: var(--ink);
    transition: color 0.4s;
  }
  .kind:not(.have) .art {
    color: var(--muted);
  }
  .art path {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .art .main {
    stroke-width: 0.8;
  }
  .art .thin {
    stroke-width: 0.6;
  }
  .art .hair {
    stroke-width: 0.4;
  }
  .art .hatch {
    stroke-width: 0.35;
    stroke-linecap: round;
  }
  .art .sign {
    stroke-width: 0.6;
    stroke-linejoin: round;
  }
  .art .fill {
    fill: currentColor;
    stroke: none;
  }
  /* The name leads its state, as a sigil's tile's does. */
  .name {
    font-family: var(--font-display);
    font-size: 0.9375rem;
    line-height: 1.15;
    letter-spacing: 0.03em;
    text-align: center;
    overflow-wrap: normal;
    color: var(--note-hi);
  }
  .have .name {
    color: var(--gold-hi);
  }
  .state {
    font-size: 0.9375rem;
    font-style: italic;
    color: var(--muted);
  }
  .worn .state {
    color: #b59a63;
  }

  /* In a row: the head and the line beside it on the left, in the columns of
     the sigils' token and its line over them (the token's width, 64px, and
     their gap), the seventeen beside them, named on hover. The line keeps
     three lines' room, which the longest (Chronomancer's hint, the name
     before it) takes beside the head. */
  .strip {
    flex-direction: row;
    align-items: center;
    gap: 1.4rem;
  }
  .strip .lead {
    flex: 0 0 330px;
  }
  .strip .lead.headed {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    column-gap: 1rem;
  }
  .strip .line {
    min-height: calc(3 * 1.35em);
    display: flex;
    align-items: center;
    line-height: 1.35;
    font-size: 0.9rem;
  }
  .strip .kinds {
    flex: 1;
    grid-template-columns: repeat(17, minmax(0, 1fr));
    gap: 0.3rem;
  }
  .strip .kind {
    position: relative;
    padding: 0.4rem 0.05rem;
  }
  .strip .art {
    width: 100%;
    max-width: 32px;
    height: 32px;
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

  @media (max-width: 900px) {
    .auras:not(.strip) .kinds {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .auras:not(.strip) .kinds {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    /* The longest line on how one's found takes three at a phone's width. */
    .auras:not(.strip) .line {
      min-height: calc(3 * 1.45em);
    }
  }
</style>
