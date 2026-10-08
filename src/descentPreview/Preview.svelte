<script lang="ts">
  // The descent's test page: Delve's rules block (components/DelveRules) in
  // a rules card as the lobby shows it, at a phone's, a tablet's and a
  // desktop's card width side by side, driven by the deepest depth, the last
  // run's depth and the finds met. Replay mounts the blocks again (their
  // entrance); Walk down goes a depth deeper every 180 ms. The address can
  // set them too: descent.html?best=46&last=20&met=flare,azurite.
  import { onDestroy } from 'svelte';
  import DelveRules from '../components/DelveRules.svelte';
  import ItemGlyph from '../components/ItemGlyph.svelte';
  import { FINDS_IN_ORDER, shownDepth, type FindKind } from '../lib/delve';
  import { FIND_TEXT } from '../lib/difficultyText';

  /** The rules card's content width at each size, as the lobby lays it out. */
  const WIDTHS = [
    { key: 'phone', name: 'Phone', px: 281 },
    { key: 'tablet', name: 'Tablet', px: 329 },
    { key: 'desktop', name: 'Desktop', px: 450 },
  ];
  const GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;
  const MAX = 300;

  const query = new URLSearchParams(location.search);
  const num = (k: string, d: number) => {
    const v = Number(query.get(k));
    return query.has(k) && Number.isFinite(v) ? Math.max(0, Math.min(999, Math.floor(v))) : d;
  };
  /** The deepest and the last run, as the records keep them (0: none); the page shows them as players see them. */
  let depth = $state(num('best', 46));
  let lastDepth = $state(num('last', 20));
  const deepest = $derived(depth > 0 ? depth : null);
  const last = $derived(lastDepth > 0 ? lastDepth : null);
  let met = $state<FindKind[]>(
    query.has('met')
      ? FINDS_IN_ORDER.map((f) => f.kind).filter((k) => query.get('met')!.split(',').includes(k))
      : FINDS_IN_ORDER.map((f) => f.kind),
  );
  let replay = $state(0);
  let walking: ReturnType<typeof setInterval> | null = $state(null);

  const toggle = (kind: FindKind) => (met = met.includes(kind) ? met.filter((k) => k !== kind) : [...met, kind]);
  function walk() {
    if (walking) return stop();
    if (depth >= MAX) depth = 0;
    walking = setInterval(() => {
      depth = Math.min(MAX, depth + 1);
      if (depth >= MAX) stop();
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
      <input id="depth" type="range" min="0" max={MAX} step="1" bind:value={depth} />
      <input id="best" class="num" type="number" min="0" max="999" bind:value={depth} aria-label="Deepest depth" />
      <span class="hint">{deepest === null ? 'no run yet' : `shown as ${shownDepth(deepest)}`}</span>
    </div>
    <div class="row">
      <label for="last-range">Last run</label>
      <input id="last-range" type="range" min="0" max={MAX} step="1" bind:value={lastDepth} />
      <input id="last" class="num" type="number" min="0" max="999" bind:value={lastDepth} aria-label="Last run's depth" />
      <span class="hint">{last === null ? 'none' : `shown as ${shownDepth(last)}`}</span>
    </div>
    <div class="row">
      <span class="what">Finds met</span>
      {#each FINDS_IN_ORDER as f (f.kind)}
        <button class="find" class:on={met.includes(f.kind)} aria-pressed={met.includes(f.kind)} onclick={() => toggle(f.kind)}>
          <span class="glyph"><ItemGlyph kind={GLYPH[f.kind]} /></span>{FIND_TEXT[f.kind].name}
        </button>
      {/each}
      <span class="sep"></span>
      <button onclick={() => replay++}>Replay entrance</button>
      <button class:on={!!walking} onclick={walk}>{walking ? 'Stop' : 'Walk down'}</button>
    </div>
  </header>

  <div class="cards">
    {#each WIDTHS as w (w.key)}
      <div class="card-wrap">
        <span class="size">{w.name}, card {w.px} px</span>
        <div class="panel card">
          <div style:width="{w.px}px">
            {#key replay}
              <DelveRules {deepest} {last} label="Your deepest alone" {met} />
            {/key}
            <ul class="rules muted">
              <li>Name the item; each right answer takes you a depth deeper.</li>
              <li>A wrong answer or running out of time costs a life.</li>
            </ul>
          </div>
        </div>
      </div>
    {/each}
  </div>
</main>

<style>
  main {
    padding: 0 1.2rem 4rem;
    display: grid;
    gap: 1.5rem;
  }
  .controls {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    gap: 0.5rem;
    margin: 0 -1.2rem;
    padding: 0.8rem 1.2rem;
    background: rgba(10, 9, 8, 0.95);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: normal;
    font-size: 1.1rem;
    color: var(--gold-hi);
    letter-spacing: 0.08em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
  }
  .row label,
  .what {
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
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    font: inherit;
    font-size: 0.85rem;
    color: var(--gold-hi);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.15rem 0.55rem;
    cursor: pointer;
  }
  .glyph {
    --h: 12px;
  }
  button.on {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 22%, var(--bg));
  }
  .find:not(.on) {
    color: var(--muted);
    opacity: 0.7;
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
    padding: 1.4rem;
  }
  .rules {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.93rem;
    line-height: 1.3;
  }
</style>
