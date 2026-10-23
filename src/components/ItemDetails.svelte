<script lang="ts" module>
  import { singular, type DrawnItem } from '../lib/game';

  /**
   * A tooltip line, as scripts/fetch-stats.mjs writes it: its kind (a
   * property, the requirements, an implicit or explicit mod, a gem's
   * description, the corrupted mark, flavour text, the title of a skill a
   * gem brings) and its text, each coloured value in it written {x|value}
   * (x: see COLOURS).
   */
  type Kind = 'p' | 'r' | 'i' | 'e' | 'd' | 'c' | 'f' | 't';
  type Line = [kind: Kind, text: string];

  /**
   * Craft: a mod line as it stands, in place of the item's own tooltip:
   * `gone`, one taken away (its maker sees it struck out), `swapped`, one
   * from another item; `aimable`, one the currency its maker holds can be
   * put on (a button, onaim).
   */
  export type ModShown = { text: string; mark?: 'gone' | 'swapped'; aimable?: boolean };
  type Stats = Record<string, Line[][]>;

  // Loaded the first time an item's details are opened: most games never do.
  let stats: Promise<Stats> | undefined;
  /** The tooltips once they're here: a tooltip drawn after that is drawn whole at once, never a moment of "…" first. */
  let loaded: Stats | null = null;
  /** Whether the tooltips are here already. */
  export const statsLoaded = () => !!loaded;
  /** The game's tooltip font (app.css), fetched the first time it's needed: it waits with the tooltips, so they never show in another first. */
  const fonts = () =>
    Promise.all(['1rem "Fontin SmallCaps"', 'italic 1rem "Fontin"'].map((f) => document.fonts?.load(f).catch(() => {})));
  /**
   * The tooltips, loaded once, with their font. ItemWindow waits for them
   * before it unrolls, so what it unrolls is the whole tooltip, not the line
   * that waits for it.
   */
  export const loadStats = () =>
    (stats ??= Promise.all([import('../data/itemStats.json'), fonts()]).then(([m]) => (loaded = m.default as unknown as Stats)));

  /** A value's colour, by its letter: the game's white, its augmented blue, and each damage type's own. */
  const COLOURS: Record<string, string> = { w: 'white', a: 'aug', p: 'white', f: 'fire', c: 'cold', l: 'lightning', h: 'chaos' };

  /** A line's text in runs: plain, or a value in its colour. */
  const runs = (text: string) =>
    text.split(/(\{\w\|[^}]*\})/).flatMap((t) => {
      if (!t) return [];
      const m = /^\{(\w)\|([^}]*)\}$/.exec(t);
      return m ? [{ t: m[2], c: COLOURS[m[1]] ?? '' }] : [{ t, c: '' }];
    });

  /**
   * Flavour text in its lines. The game breaks it where its own tooltip is
   * full, so a line that goes on with a small letter goes on the line before
   * it; one that starts a sentence or a verse keeps its own (a poem stays a
   * poem).
   */
  const verses = (text: string) =>
    text.split('\n').reduce<string[]>((out, l) => {
      if (out.length && /^[a-z]/.test(l)) out[out.length - 1] += ` ${l}`;
      else out.push(l);
      return out;
    }, []);

  const WEAPONS = new Set(['One-Handed Weapons', 'Two-Handed Weapons']);

  /**
   * The item's sections, as the game's tooltip has them. A weapon's first
   * line is its class, grey, as in the game (poe2db's own grouping of its
   * base, which the data leaves out, isn't the game's).
   */
  function sectionsOf(item: DrawnItem, all: Stats): Line[][] {
    // The tooltip of the picture it is drawn as (a variant's has its own base and mods).
    const list = (all[item.art] ?? []).map((s) => [...s]);
    if (item.kind === 'unique' && WEAPONS.has(item.category)) {
      const head: Line = ['p', singular(item.group)];
      if (list[0]?.[0]?.[0] === 'p') list[0].unshift(head);
      else list.unshift([head]);
    }
    return list;
  }
</script>

<script lang="ts">
  // An item's tooltip as the game shows it: its properties, requirements,
  // mods and flavour text, in sections parted by the game's plain rule.
  // `mods` (Craft): only these mod lines, as they stand, in place of the item's tooltip.
  // `onaim`: a click on an aimable line, by its place in `mods`.
  let { item, mods, onaim }: { item?: DrawnItem; mods?: ModShown[]; onaim?: (line: number, e: MouseEvent) => void } = $props();

  let all = $state<Stats | null>(loaded);
  let failed = $state(false);
  if (!loaded) loadStats().then((s) => (all = s), () => (failed = true));
  const sections = $derived(all && item && !mods ? sectionsOf(item, all) : null);
</script>

{#snippet text(t: string)}{#each runs(t) as r, k (k)}{#if r.c}<span class={r.c}>{r.t}</span>{:else}{r.t}{/if}{/each}{/snippet}

<div class="tooltip-body">
  {#if mods && all}
    <div class="section">
      {#each mods as m, j (j)}
        {#if m.aimable}
          <button class="line e aimable" class:swapped={m.mark === 'swapped'} onclick={(e) => onaim?.(j, e)}>{@render text(m.text)}</button>
        {:else}
          <p class="line e" class:gone={m.mark === 'gone'} class:swapped={m.mark === 'swapped'}>{@render text(m.text)}</p>
        {/if}
      {/each}
    </div>
  {:else if failed}
    <p class="wait">Its details couldn’t be loaded.</p>
  {:else if !sections}
    <p class="wait" aria-label="Loading">…</p>
  {:else}
    {#each sections as section, i (i)}
      {#if i}<div class="rule" aria-hidden="true"></div>{/if}
      <div class="section">
        {#each section as [kind, t], j (j)}
          {#if kind === 'f'}
            <p class="line f">
              {#each verses(t) as v, k (k)}<span class="verse">{v}</span>{/each}
            </p>
          {:else}
            <!-- On one line: it keeps its text's line breaks (white-space: pre-line). -->
            <p class="line {kind}">{#if kind === 'r'}{'Requires: '}{/if}{@render text(t)}</p>
          {/if}
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  /*
   * The game's tooltip: centred, every line in Fontin's small capitals at
   * one size (the name above it a little larger), grey labels with white
   * or blue values (each damage type in its own colour), blue mods, orange
   * flavour text in slanted small capitals, a gem's description in Fontin's
   * italic. Its colours are the game's (as poe2db has them), fire and cold
   * lifted a little: theirs are too dark to read at this size on our black.
   */
  .tooltip-body {
    --tt-grey: #8c8c8c;
    --tt-white: #f2efe8;
    --tt-blue: #8888ff;
    --tt-unique: #af6025;
    text-align: center;
    font-family: var(--font-tooltip);
    font-weight: 400;
    font-variant-numeric: lining-nums;
  }
  .section {
    display: flex;
    flex-direction: column;
  }
  .line {
    margin: 0;
    font-size: 1rem;
    line-height: 1.3;
    white-space: pre-line;
    text-wrap: pretty;
    color: var(--tt-grey);
  }
  .white {
    color: var(--tt-white);
  }
  .aug,
  .i,
  .e {
    color: var(--tt-blue);
  }
  .fire {
    color: #b8301f;
  }
  .cold {
    color: #4f7fb5;
  }
  .lightning {
    color: #ffd700;
  }
  .chaos {
    color: #d02090;
  }
  .d {
    font-family: var(--font-tooltip-italic);
    font-style: italic;
    color: #c4beb4;
  }
  .c {
    color: #d20000;
  }
  /* Flavour text: the same small capitals, slanted, as the game sets it; each verse wrapped on its own, no word left alone on its last line. */
  .f {
    font-style: italic;
    color: var(--tt-unique);
    white-space: normal;
  }
  .verse {
    display: block;
    text-wrap: pretty;
  }
  /* A skill the gem brings: its name, as the game titles the gem's second tab. */
  .t {
    color: var(--tt-white);
    font-size: 1.15rem;
    margin-bottom: 0.15rem;
  }
  .wait {
    margin: 0;
    color: var(--muted);
  }
  /* Craft, as its maker sees it: a line taken away, struck through and faint; one swapped in, in another item's colour. */
  .gone {
    opacity: 0.4;
    text-decoration: line-through;
    text-decoration-color: rgba(217, 138, 110, 0.8);
  }
  .swapped,
  .swapped :global(span) {
    color: #d98a6e;
  }
  /* A line the held currency can go on: the line itself, lit under the pointer as the game lights what a currency would go on. */
  .aimable {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    font: inherit;
    text-align: inherit;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(136, 136, 255, 0.18);
    transition:
      background-color 0.12s,
      box-shadow 0.12s;
  }
  .aimable:hover,
  .aimable:focus-visible {
    outline: none;
    background-color: rgba(136, 136, 255, 0.14);
    box-shadow: inset 0 0 0 1px rgba(136, 136, 255, 0.6);
  }
  /* The game's rule between sections: a plain line fading out at both ends, in the unique's colour. */
  .rule {
    height: 1px;
    margin: 0.5rem auto;
    width: 84%;
    background: linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.75) 22%, rgba(175, 96, 37, 0.75) 78%, transparent);
  }
</style>
