<script lang="ts" module>
  import { singular, type DrawnItem } from '../lib/game';
  import { whenIdle } from '../lib/idle';
  import { savingData } from '../lib/saveData';
  import statsUrl from '../data/itemStats.json?url';

  /**
   * A tooltip line, as scripts/fetch-stats.mjs writes it: its kind (a
   * property, the requirements, an implicit or explicit mod, a gem's
   * description, the corrupted mark, flavour text, the title of a skill a
   * gem brings) and its text, each coloured value in it written {x|value}
   * (x: see COLOURS).
   */
  type Kind = 'p' | 'r' | 'i' | 'e' | 'd' | 'c' | 'f' | 't';
  type Line = [kind: Kind, text: string];
  type Stats = Record<string, Line[][]>;

  // Fetched ahead in an idle moment once this module is here (it comes with
  // the game's pages and the codex's), so the first item a player opens isn't
  // a tap that does nothing while 248 KB come down: only fetched, as text,
  // so the idle moment is never a long one. Read (JSON.parse, a few ms) the
  // first time an item's details are opened: most games never do. Not with
  // Save-Data on; then it's all fetched at that first opening, as it was.
  const fetchText = () => fetch(statsUrl).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`itemStats: ${r.status}`))));
  /** The fetch made ahead, if one was: its text, or nothing should it have failed (fetched again when wanted). */
  let ahead: Promise<string | null> | undefined;
  if (typeof window !== 'undefined' && !savingData())
    whenIdle(() => void (ahead ??= fetchText().catch(() => null)), { timeout: 4000, fallback: 1500 });
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
    (stats ??= Promise.all([(ahead ?? Promise.resolve(null)).then((text) => text ?? fetchText()), fonts()]).then(
      ([text]) => (loaded = JSON.parse(text) as Stats),
    ));

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
  let { item }: { item: DrawnItem } = $props();

  let all = $state<Stats | null>(loaded);
  let failed = $state(false);
  if (!loaded) loadStats().then((s) => (all = s), () => (failed = true));
  const sections = $derived(all ? sectionsOf(item, all) : null);
</script>

{#snippet text(t: string)}{#each runs(t) as r, k (k)}{#if r.c}<span class={r.c}>{r.t}</span>{:else}{r.t}{/if}{/each}{/snippet}

<div class="tooltip-body">
  {#if failed}
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
  /* The game's rule between sections: a plain line fading out at both ends, in the unique's colour. */
  .rule {
    height: 1px;
    margin: 0.5rem auto;
    width: 84%;
    background: linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.75) 22%, rgba(175, 96, 37, 0.75) 78%, transparent);
  }
</style>
