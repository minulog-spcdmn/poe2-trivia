<script lang="ts">
  // The descent's example page: each concept in a rules card as the lobby
  // lays the Delve rules out (the descent, then the finds; side by side once
  // the card is 400 px wide), at a phone's, a tablet's and a desktop's card
  // width, with the deepest depth on a slider. Replay mounts the drawings
  // again (their entrance); Walk down climbs the depth a step at a time.
  import { onDestroy } from 'svelte';
  import ItemGlyph from '../components/ItemGlyph.svelte';
  import { FINDS } from '../lib/delve';
  import { FINDS_LABEL, FINDS_UNSAFE, FIND_RULES, FIND_TEXT } from '../lib/difficultyText';
  import { CONCEPTS } from './concepts';

  const FIND_KINDS = FINDS.filter((f) => f.cap > 0).map((f) => f.kind);
  const FIND_GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;
  /** The rules card's content width at each size, measured on the real lobby. */
  const WIDTHS = [
    { key: 'phone', name: 'Phone', px: 281 },
    { key: 'tablet', name: 'Tablet', px: 329 },
    { key: 'desktop', name: 'Desktop', px: 450 },
  ];
  const PRESETS = [0, 1, 5, 9, 10, 11, 20, 21, 37, 50, 51, 89, 90, 91, 99, 100, 101, 134, 250, 999];

  let depth = $state(37);
  const deepest = $derived(depth > 0 ? depth : null);
  let shownConcepts = $state(CONCEPTS.map((c) => c.key));
  let shownWidths = $state(['phone', 'desktop']);
  let replay = $state(0);
  let walking: ReturnType<typeof setInterval> | null = $state(null);

  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  function walk() {
    if (walking) return stop();
    if (depth >= 300) depth = 0;
    walking = setInterval(() => {
      depth = Math.min(300, depth + 1);
      if (depth >= 300) stop();
    }, 180);
  }
  function stop() {
    if (walking) clearInterval(walking);
    walking = null;
  }
  onDestroy(stop);
</script>

<main>
  <header class="controls">
    <h1>The descent</h1>
    <div class="row">
      <label for="depth">Deepest</label>
      <input id="depth" type="range" min="0" max="300" step="1" bind:value={depth} />
      <input class="num" type="number" min="0" max="9999" bind:value={depth} aria-label="Deepest depth" />
      <span class="hint">{deepest === null ? 'no run yet' : `depth ${deepest}`}</span>
    </div>
    <div class="row presets">
      {#each PRESETS as p (p)}
        <button class:on={depth === p} onclick={() => (depth = p)}>{p === 0 ? 'none' : p}</button>
      {/each}
    </div>
    <div class="row">
      {#each CONCEPTS as c (c.key)}
        <button class:on={shownConcepts.includes(c.key)} onclick={() => (shownConcepts = toggle(shownConcepts, c.key))}>{c.name}</button>
      {/each}
      <span class="sep"></span>
      {#each WIDTHS as w (w.key)}
        <button class:on={shownWidths.includes(w.key)} onclick={() => (shownWidths = toggle(shownWidths, w.key))}>{w.name} {w.px}</button>
      {/each}
      <span class="sep"></span>
      <button onclick={() => replay++}>Replay entrance</button>
      <button class:on={!!walking} onclick={walk}>{walking ? 'Stop' : 'Walk down'}</button>
    </div>
  </header>

  {#each CONCEPTS.filter((c) => shownConcepts.includes(c.key)) as c (c.key)}
    <section class="concept">
      <h2>{c.name}</h2>
      <div class="cards">
        {#each WIDTHS.filter((w) => shownWidths.includes(w.key)) as w (w.key)}
          <div class="card-wrap">
            <span class="size">{w.name}, card {w.px} px</span>
            <div class="panel card">
              <div class="setting delve-rules" style:width="{w.px}px">
                <div class="delve-cols" class:band={c.placement === 'above'} style:--col="{c.column ?? 14}rem">
                  <div class="descent-col">
                    <span class="label">The descent</span>
                    {#key replay}
                      <c.component {deepest} />
                    {/key}
                  </div>
                  <div>
                    <span class="label">{FINDS_LABEL}</span>
                    <dl class="finds">
                      {#each FIND_KINDS as kind (kind)}
                        {@const r = FIND_RULES[kind]}
                        <div data-find={kind}>
                          <dt><span class="find-glyph"><ItemGlyph kind={FIND_GLYPH[kind]} /></span>{FIND_TEXT[kind].name}</dt>
                          <dd>{r.gives} <span class="miss">{r.miss}</span></dd>
                        </div>
                      {/each}
                    </dl>
                    <p class="finds-unsafe">{FINDS_UNSAFE}</p>
                  </div>
                </div>
              </div>
              <ul class="rules muted">
                <li>Name the item; each right answer takes you a depth deeper.</li>
                <li>A wrong answer or running out of time costs a life.</li>
              </ul>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</main>

<style>
  main {
    padding: 1rem 1.2rem 4rem;
    display: grid;
    gap: 1.5rem;
  }
  .controls {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    gap: 0.5rem;
    padding: 0.8rem 1rem;
    background: rgba(10, 9, 8, 0.94);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  h1,
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: normal;
    color: var(--gold-hi);
    letter-spacing: 0.08em;
  }
  h1 {
    font-size: 1.1rem;
  }
  h2 {
    font-size: 1rem;
    margin-bottom: 0.6rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
  }
  .row label {
    font-family: var(--font-display);
    color: var(--muted);
  }
  input[type='range'] {
    flex: 1 1 14rem;
    min-width: 10rem;
    accent-color: var(--gold);
  }
  .num {
    width: 5rem;
    font-family: var(--font-cinzel);
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
  }
  .hint {
    color: var(--muted);
    font-style: italic;
  }
  button {
    font: inherit;
    font-size: 0.85rem;
    color: var(--gold-hi);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.15rem 0.55rem;
    cursor: pointer;
  }
  .presets button {
    font-family: var(--font-cinzel);
  }
  button.on {
    background: var(--gold);
    color: var(--bg);
    border-color: var(--gold);
  }
  button:hover {
    border-color: var(--gold);
  }
  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--line);
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1.5rem;
  }
  .size {
    display: block;
    margin-bottom: 0.3rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .card {
    padding: 1.4rem 1.6rem 1rem;
  }

  /* As the lobby has them (src/components/Lobby.svelte). */
  .setting {
    margin-bottom: 1.2rem;
  }
  .delve-rules {
    container-type: inline-size;
  }
  .delve-cols {
    display: grid;
    gap: 1rem 1.2rem;
  }
  .descent-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  @container (min-width: 400px) {
    .delve-cols:not(.band) {
      grid-template-columns: var(--col) minmax(0, 1fr);
    }
  }
  .finds {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }
  .finds [data-find='azurite'] {
    --find: #a9cdf5;
  }
  .finds [data-find='flare'] {
    --find: #f7a3b3;
  }
  .finds [data-find='dynamite'] {
    --find: #eebf96;
  }
  .finds dt {
    display: flex;
    align-items: center;
    gap: 0.45em;
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--find);
  }
  .find-glyph {
    --h: 13px;
    display: inline-flex;
    justify-content: center;
    width: 14px;
  }
  .finds dd {
    margin: 0.1rem 0 0;
    font-size: 0.93rem;
    line-height: 1.25;
    color: var(--muted);
  }
  .finds .miss {
    color: color-mix(in srgb, var(--find) 45%, var(--muted));
  }
  /* Under the finds: why flares and dynamite never work on one. */
  .finds-unsafe {
    margin: 0.55rem 0 0;
    font-size: 0.93rem;
    font-style: italic;
    line-height: 1.25;
    color: var(--muted);
  }
  .rules {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.93rem;
    line-height: 1.3;
  }
</style>
