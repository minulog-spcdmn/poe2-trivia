<script lang="ts" module>
  /**
   * A tooltip line, as scripts/fetch-stats.mjs writes it: its kind (a
   * property, the requirements, an implicit or explicit mod, a gem's
   * description, the corrupted mark, flavour text, a skill's title) and its
   * text, a value in white wrapped in {} and one in blue in <>.
   */
  type Line = [kind: 'p' | 'r' | 'i' | 'e' | 'd' | 'c' | 'f' | 't', text: string];
  type Stats = Record<string, Line[][]>;

  // Loaded the first time an item's details are opened: most games never do.
  let stats: Promise<Stats> | undefined;
  const loadStats = () => (stats ??= import('../data/itemStats.json').then((m) => m.default as unknown as Stats));

  /** A line's text in runs: plain, a white value, a blue one. */
  const runs = (text: string) =>
    text.split(/(\{[^}]*\}|<[^>]*>)/).flatMap((t) => (!t ? [] : t[0] === '{' ? [{ t: t.slice(1, -1), c: 'value' }] : t[0] === '<' ? [{ t: t.slice(1, -1), c: 'aug' }] : [{ t, c: '' }]));
</script>

<script lang="ts">
  import type { Item } from '../lib/game';

  // An item's tooltip as the game shows it: its properties, requirements, mods and flavour text.
  let { item }: { item: Item } = $props();

  const sections = $derived(loadStats().then((s) => s[item.id] ?? []));
</script>

{#await sections}
  <p class="wait" aria-label="Loading">…</p>
{:then list}
  {#each list as section, i (i)}
    {#if i}<div class="sep" aria-hidden="true"></div>{/if}
    <div class="section">
      {#each section as [kind, text], j (j)}
        <!-- On one line: it keeps its text's line breaks (white-space: pre-line). -->
        <p class="line {kind}">{#if kind === 'r'}{'Requires: '}{/if}{#each runs(text) as r, k (k)}{#if r.c}<span class={r.c}>{r.t}</span>{:else}{r.t}{/if}{/each}</p>
      {/each}
    </div>
  {/each}
{:catch}
  <p class="wait">Its details couldn't be loaded.</p>
{/await}

<style>
  /* The game's tooltip colours: grey properties with white or blue values, blue mods, orange flavour text. */
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .line {
    margin: 0;
    font-size: 0.98rem;
    line-height: 1.3;
    white-space: pre-line;
    color: #8c8c8c;
  }
  .value {
    color: #e8e4dc;
  }
  .aug,
  .i,
  .e {
    color: #8f9cff;
  }
  .d {
    color: #b9b4aa;
  }
  .c {
    color: #d65a4a;
  }
  .f {
    font-style: italic;
    color: #b8743c;
  }
  .t {
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #d8a26a;
    margin-bottom: 0.2rem;
  }
  .wait {
    margin: 0;
    color: var(--muted);
  }
  /* The tooltip's separator, as CodexItem's: a hairline with a gem in the middle. */
  .sep {
    position: relative;
    height: 1px;
    margin: 0.7rem auto;
    width: 80%;
    background: linear-gradient(90deg, transparent, #6b4520 25%, #6b4520 75%, transparent);
  }
  .sep::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    translate: -50% -50%;
    rotate: 45deg;
    background: var(--unique);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }
</style>
