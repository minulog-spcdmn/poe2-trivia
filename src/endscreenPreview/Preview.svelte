<script lang="ts">
  // The end screen's test page: a list of every state on the left; on the
  // right the real app in a frame at the chosen window's size (scaled down to
  // fit, or at 1:1), and the handoff's board for that state beside it or in
  // its place. The state and the window are in the address, so a link opens
  // the same view; the arrow keys walk the list.
  import { VIEWPORTS, scenes, type Scene } from './scenes';

  /** The handoff's boards, by name (docs/handoff/end-screen/screens). */
  const BOARDS: Record<string, string> = Object.fromEntries(
    Object.entries(import.meta.glob('../../docs/handoff/end-screen/screens/*.webp', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
      path.split('/').pop()!.replace('.webp', ''),
      url as string,
    ]),
  );

  const ALL = scenes();
  const GROUPS = [...new Set(ALL.map((s) => s.group))];
  type Show = 'screen' | 'board' | 'both';

  const params = new URLSearchParams(location.search);
  let current = $state<Scene>(ALL.find((s) => s.key === params.get('s')) ?? ALL[0]);
  /** The window: the state's own unless one is picked. */
  let picked = $state<string | null>(params.get('v'));
  let show = $state<Show>((params.get('show') as Show) ?? 'screen');
  let fit = $state(params.get('fit') !== '0');
  /** Bumped to load the frame afresh. */
  let reload = $state(0);

  const view = $derived(VIEWPORTS.find((v) => v.key === (picked ?? current.view)) ?? VIEWPORTS[0]);
  const board = $derived(current.board ? BOARDS[current.board] : undefined);
  /** The board's height at the window's width (a phone's whole page is taller than its window). */
  let boardH = $state(0);
  $effect(() => {
    if (!board) return;
    const img = new Image();
    img.onload = () => (boardH = (img.naturalHeight / img.naturalWidth) * view.w);
    img.src = board;
  });
  const showing = $derived<Show>(board ? show : 'screen');
  const src = $derived(`endscreen.html?scene=${encodeURIComponent(current.key)}`);

  // The room the panes have, to scale the window into.
  let paneW = $state(0);
  let paneH = $state(0);
  const panes = $derived(showing === 'both' ? 2 : 1);
  const scale = $derived(fit ? Math.min(1, (paneW - 24 * panes) / panes / view.w, (paneH - 56) / view.h) : 1);

  function pick(s: Scene) {
    current = s;
    picked = null;
    reload++;
  }
  $effect(() => {
    const p = new URLSearchParams();
    p.set('s', current.key);
    if (picked) p.set('v', picked);
    if (show !== 'screen') p.set('show', show);
    if (!fit) p.set('fit', '0');
    history.replaceState(null, '', `?${p}`);
  });
  $effect(() => {
    document.title = `End screen • ${current.label}`;
  });

  function keys(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = ALL.indexOf(current) + (e.key === 'ArrowDown' ? 1 : -1);
    if (ALL[i]) pick(ALL[i]);
    document.querySelector(`[data-key="${ALL[i]?.key}"]`)?.scrollIntoView({ block: 'nearest' });
  }
</script>

<svelte:window onkeydown={keys} />

<div class="page">
  <aside>
    <h1>The end screen</h1>
    <p class="hint">Every state of the end of a game, in the real app. ↑ ↓ walk the list.</p>
    {#each GROUPS as g (g)}
      <h2>{g}</h2>
      <ul>
        {#each ALL.filter((s) => s.group === g) as s (s.key)}
          <li>
            <button class:on={s === current} data-key={s.key} onclick={() => pick(s)}>
              <span class="s-label">{s.label}</span>
              <span class="s-tag">{s.board ?? s.key}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  </aside>

  <main>
    <header>
      <div class="seg" role="group" aria-label="Window">
        {#each VIEWPORTS as v (v.key)}
          <button class:on={v.key === view.key} onclick={() => (picked = v.key)}>{v.label}</button>
        {/each}
      </div>
      <div class="seg" role="group" aria-label="Show">
        <button class:on={showing === 'screen'} onclick={() => (show = 'screen')}>Screen</button>
        <button class:on={showing === 'board'} disabled={!board} onclick={() => (show = 'board')}>Board</button>
        <button class:on={showing === 'both'} disabled={!board} onclick={() => (show = 'both')}>Side by side</button>
      </div>
      <div class="seg">
        <button class:on={fit} onclick={() => (fit = !fit)}>{fit ? 'Fit' : '1:1'}</button>
        <button onclick={() => reload++} title="Load the state afresh (its entrance and effects play again)">Replay</button>
        <a href={src} target="_blank" rel="noopener">Open alone ↗</a>
      </div>
      {#if !board}<span class="note">No board for this one: an edge case.</span>{:else if picked && picked !== current.view}<span class="note">The board was drawn at another size.</span>{/if}
    </header>

    <div class="panes" class:scroll={!fit} bind:clientWidth={paneW} bind:clientHeight={paneH}>
      {#if showing !== 'board'}
        <figure style:width="{view.w * scale}px" style:height="{view.h * scale}px">
          {#key `${current.key}:${view.key}:${reload}`}
            <iframe title={current.label} {src} width={view.w} height={view.h} style:scale={scale}></iframe>
          {/key}
          <figcaption>The screen • {view.w} × {view.h}</figcaption>
        </figure>
      {/if}
      {#if showing !== 'screen' && board}
        <figure class="board" style:width="{view.w * scale}px" style:height="{boardH * scale}px">
          <img src={board} alt="The handoff's board for {current.label}" style:width="{view.w * scale}px" />
          <figcaption>The board • {current.board}</figcaption>
        </figure>
      {/if}
    </div>
  </main>
</div>

<style>
  :global(body) {
    overflow: hidden;
  }
  .page {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    height: 100dvh;
    color: var(--text);
    background: #0b0907;
  }
  aside {
    overflow-y: auto;
    padding: 18px 14px 40px;
    border-right: 1px solid var(--line);
    scrollbar-width: thin;
    scrollbar-color: var(--gold-lo) transparent;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 22px;
    color: var(--gold-hi);
  }
  .hint {
    margin: 4px 0 14px;
    font-size: 14px;
    font-style: italic;
    color: var(--muted);
  }
  h2 {
    margin: 18px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(125, 99, 51, 0.35);
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 16px;
    color: var(--gold);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* Plain buttons, not the game's engraved capitals. */
  aside button,
  .seg button,
  .seg a {
    font-family: var(--font-body);
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }
  aside button {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 6px 8px;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  aside button:hover {
    border-color: var(--line);
  }
  aside button.on {
    border-color: var(--gold-lo);
    background: rgba(201, 164, 92, 0.12);
  }
  .s-label {
    font-size: 15px;
    line-height: 1.2;
  }
  .s-tag {
    font-family: var(--font-cinzel);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }
  .seg {
    display: flex;
    gap: 4px;
  }
  .seg button,
  .seg a {
    padding: 6px 10px;
    font-size: 14px;
    color: var(--muted);
    text-decoration: none;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
  }
  .seg button:hover:not(:disabled),
  .seg a:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .seg button.on {
    color: #fff1cf;
    border-color: var(--gold);
    background: rgba(138, 90, 34, 0.45);
  }
  .seg button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .note {
    font-size: 14px;
    font-style: italic;
    color: var(--muted);
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 24px;
    padding: 12px 12px 40px;
    overflow: auto;
  }
  .panes.scroll {
    justify-content: flex-start;
  }
  figure {
    position: relative;
    flex: none;
    margin: 0;
  }
  /* Laid out at the window's size, drawn scaled into the figure's box. */
  iframe {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    border: 1px solid var(--line);
    transform-origin: 0 0;
    background: #0a0908;
  }
  .board img {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    border: 1px solid var(--line);
  }
  figcaption {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    white-space: nowrap;
    font-family: var(--font-cinzel);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
</style>
