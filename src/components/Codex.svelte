<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import { CODEX_KEY, loadCodex, resetCodex, type Tally } from '../lib/codex';
  import { accuracy, codexStats, tallyOf } from '../lib/codexStats';
  import { categoryIcon, itemImage } from '../lib/ui';
  import { DIFFICULTY_NAMES } from '../lib/difficultyText';
  import { closeCodex } from '../lib/codexRoute.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { cardHover, turnBanner } from '../lib/fx/moments';
  import type { Handle } from '../lib/fx/core';
  import type { Difficulty, Item } from '../lib/game';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import CodexItem from './CodexItem.svelte';

  let codex = $state.raw(loadCodex());
  onMount(() => {
    // A game in another tab may add to it meanwhile.
    const reload = (e: StorageEvent) => {
      if (e.key === CODEX_KEY || e.key === null) codex = loadCodex();
    };
    addEventListener('storage', reload);
    return () => removeEventListener('storage', reload);
  });

  const stats = $derived(codexStats(codex, engine.items, engine.categories));
  const difficulties = $derived(
    (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).flatMap((d) => {
      const t = stats.byDifficulty[d];
      return t?.n ? [{ name: DIFFICULTY_NAMES[d], tally: t }] : [];
    }),
  );

  const pct = (t: Tally) => `${Math.round((accuracy(t) ?? 0) * 100)}%`;
  const secs = (ms: number) => (ms / 1000).toFixed(1);
  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const answers = (n: number) => `${n} ${n === 1 ? 'answer' : 'answers'}`;

  /** The discovered share as an arc around the medallion (its circle's circumference is 100). */
  const found = $derived(stats.total ? stats.seen / stats.total : 0);

  // ---- the collection ----

  let view = $state<'grid' | 'table'>('grid');
  let only = $state('');
  let search = $state('');
  const query = $derived(search.trim().toLowerCase());
  const matches = (it: Item) => !query || it.name.toLowerCase().includes(query) || it.base.toLowerCase().includes(query);

  /** Each category's items, by group then name. While searching, only discovered matches. */
  const sections = $derived(
    stats.categories
      .filter((c) => !only || c.category === only)
      .map((c) => ({
        stats: c,
        items: (engine.byCategory.get(c.category) ?? [])
          .filter((it) => !query || (codex.items[it.id] && matches(it)))
          .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
      }))
      .filter((s) => s.items.length),
  );

  type SortKey = 'name' | 'type' | 'seen' | 'right' | 'accuracy' | 'last';
  let sortKey = $state<SortKey>('last');
  let sortDown = $state(true);
  /** `wide`: left out on narrow screens. */
  const COLUMNS: { key: SortKey; label: string; short?: string; num?: boolean; wide?: boolean }[] = [
    { key: 'name', label: 'Item' },
    { key: 'type', label: 'Type', wide: true },
    { key: 'seen', label: 'Met', num: true },
    { key: 'right', label: 'Right', num: true },
    { key: 'accuracy', label: 'Accuracy', short: '%', num: true },
    { key: 'last', label: 'Last met', num: true, wide: true },
  ];
  const rows = $derived.by(() => {
    const list = engine.items
      .filter((it) => codex.items[it.id] && (!only || it.category === only) && matches(it))
      .map((it) => {
        const e = codex.items[it.id];
        const t = tallyOf(e);
        return { item: it, entry: e, tally: t, acc: accuracy(t) };
      });
    const value = (r: (typeof list)[number]): string | number => {
      switch (sortKey) {
        case 'name':
          return r.item.name;
        case 'type':
          return `${r.item.category} ${r.item.group}`;
        case 'seen':
          return r.entry.seen;
        case 'right':
          return r.tally.ok;
        case 'accuracy':
          // Items without answers sort after the rest either way.
          return r.acc ?? (sortDown ? -1 : 2);
        case 'last':
          return r.entry.last;
      }
    };
    const dir = sortDown ? -1 : 1;
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
      return c * dir || a.item.name.localeCompare(b.item.name);
    });
  });
  function sortBy(key: SortKey) {
    if (sortKey === key) sortDown = !sortDown;
    else {
      sortKey = key;
      // Names read A to Z; numbers start with the most.
      sortDown = key !== 'name' && key !== 'type';
    }
  }

  let collection = $state<HTMLElement>();
  async function showCategory(category: string) {
    only = only === category ? '' : category;
    search = '';
    await tick();
    if (only) collection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let open = $state<Item | null>(null);
  let confirmReset = $state(false);
  function reset() {
    resetCodex();
    codex = loadCodex();
    confirmReset = false;
  }

  /** Svelte action: the title arrives like a turn banner. */
  function heralded(node: HTMLElement) {
    const t = setTimeout(() => turnBanner(node, '#c9a45c', false), 250);
    return { destroy: () => clearTimeout(t) };
  }

  /** Svelte action: a category card catches fire under the mouse, as in the game. */
  function burns(node: HTMLElement) {
    let h: Handle | null = null;
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      h?.stop();
      h = cardHover(node.querySelector('.cat-frame') ?? node, node, false);
    };
    const leave = () => {
      h?.stop();
      h = null;
    };
    node.addEventListener('pointerenter', enter);
    node.addEventListener('pointerleave', leave);
    return {
      destroy() {
        leave();
        node.removeEventListener('pointerenter', enter);
        node.removeEventListener('pointerleave', leave);
      },
    };
  }
</script>

{#snippet meter(t: Tally, label: string)}
  <span class="meter" title="{label}: {t.ok} of {answers(t.n)} right">
    <span class="fill" style:width="{(accuracy(t) ?? 0) * 100}%"></span>
  </span>
{/snippet}

{#snippet bars(list: { name: string; tally: Tally }[])}
  <ul class="bars">
    {#each list as b (b.name)}
      <li>
        <span class="bar-name">{b.name}</span>
        {@render meter(b.tally, b.name)}
        <span class="bar-value">{b.tally.n ? pct(b.tally) : ''}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet thumb(it: Item)}
  <span class="thumb"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
{/snippet}

<div class="codex">
  <div class="banner">
    <span class="rule"></span>
    <h1 use:heralded>Codex</h1>
    <span class="rule"></span>
  </div>
  <p class="lede" in:fade={{ duration: 600, delay: 200 }}>Every unique and lineage gem you have met, and how well you know it.</p>

  <section class="summary" in:fly={{ y: 20, duration: 700, delay: 150 }}>
    {#if stats.seen}
      <div class="side">
        <div class="stat">
          <span class="stat-label">Accuracy</span>
          <span class="stat-value">{pct(stats)}</span>
          <span class="stat-note">{stats.ok} of {answers(stats.n)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Lately</span>
          <span class="stat-value">{pct(stats.recent)}</span>
          <span class="stat-note">your last {answers(stats.recent.n)}</span>
        </div>
      </div>
    {/if}

    <div class="medallion">
      <ArcaneCircle size="100%" strength={0.3} />
      <svg class="progress" viewBox="-100 -100 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="codex-arc" x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0" stop-color="#fbe6b0" />
            <stop offset="0.5" stop-color="#c9a45c" />
            <stop offset="1" stop-color="#e08a44" />
          </linearGradient>
        </defs>
        <circle class="track" r="80" />
        {#if found > 0}<circle class="arc" r="80" pathLength="100" style:stroke-dasharray="{found * 100} 100" />{/if}
      </svg>
      <div class="medal-text">
        <span class="medal-value">{stats.seen}</span>
        <span class="medal-of">of {stats.total}</span>
        <span class="medal-label">discovered</span>
      </div>
    </div>

    {#if stats.seen}
      <div class="side">
        <div class="stat">
          <span class="stat-label">Best streak</span>
          <span class="stat-value">{stats.best}</span>
          <span class="stat-note">{stats.streak ? `${stats.streak} in a row now` : 'right answers in a row'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Answer time</span>
          <span class="stat-value">{stats.medianMs === null ? '?' : secs(stats.medianMs)}<small>{stats.medianMs === null ? '' : ' s'}</small></span>
          <span class="stat-note">{stats.fastest ? `typical • quickest ${secs(stats.fastest.ms)} s` : 'typical right answer'}</span>
        </div>
      </div>
    {/if}
  </section>

  {#if !stats.seen}
    <div class="empty" in:fly={{ y: 20, duration: 700, delay: 300 }}>
      <p>Your codex is still blank.</p>
      <p class="muted">
        Every item revealed in your games is written into it, with how often you named it right. It is kept in this browser only.
      </p>
      <button class="btn primary" onclick={closeCodex}>Begin the hunt</button>
    </div>
  {:else}
    <ul class="cats" in:fly={{ y: 20, duration: 700, delay: 250 }}>
      {#each stats.categories as c, i (c.category)}
        <li style:--i={i}>
          <button
            class="cat"
            class:on={only === c.category}
            class:dim={!!only && only !== c.category}
            aria-pressed={only === c.category}
            data-fx="hover"
            onclick={() => showCategory(c.category)}
            title="{c.seen} of {c.total} discovered{c.n ? `, ${c.ok} of ${answers(c.n)} right` : ''}"
            use:burns
          >
            <span class="cat-frame">
              <span class="glyph" style:--src="url('{categoryIcon(c.category)}')"></span>
              <span class="cat-name">{c.category}</span>
              <span class="cat-count">{c.seen}<small> / {c.total}</small></span>
              <span class="meter" title="{c.seen} of {c.total} discovered">
                <span class="fill" style:width="{(c.seen / c.total) * 100}%"></span>
              </span>
              <span class="cat-acc">{c.n ? `${pct(c)} right` : 'no answers yet'}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>

    <div class="panels" in:fly={{ y: 20, duration: 700, delay: 350 }}>
      <section class="panel answers" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>Answers</h2><span class="count">{stats.ok} of {stats.n} right</span></header>
        <div class="answer-cols">
          <div>
            <h3>By question</h3>
            {@render bars([
              { name: 'Name the art', tally: stats.byMode.name },
              { name: 'Find the art', tally: stats.byMode.art },
            ])}
          </div>
          {#if difficulties.length}
            <div>
              <h3>By difficulty</h3>
              {@render bars(difficulties)}
            </div>
          {/if}
        </div>
      </section>

      {#if stats.nemeses.length}
        <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
          <header><h2>Nemeses</h2></header>
          <ul class="rows">
            {#each stats.nemeses as nm (nm.item.id)}
              <li>
                <button class="row" onclick={() => (open = nm.item)}>
                  {@render thumb(nm.item)}
                  <span class="row-name"><span>{nm.item.name}</span></span>
                  <b>{nm.tally.ok}/{nm.tally.n}</b>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if stats.confusions.length}
        <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
          <header><h2>Mix-ups</h2></header>
          <ul class="rows">
            {#each stats.confusions as cf (cf.answer.id + cf.picked.id)}
              <li>
                <button class="row" onclick={() => (open = cf.answer)} title="You took {cf.answer.name} for {cf.picked.name}">
                  {@render thumb(cf.answer)}
                  <span class="row-name">
                    <span>{cf.answer.name}</span>
                    <small>taken for {cf.picked.name}</small>
                  </span>
                  <b>{cf.n}×</b>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if stats.fooled.length}
        <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
          <header><h2>Fooled by</h2></header>
          <ul class="rows">
            {#each stats.fooled as f (f.name)}
              <li>
                <span class="row">
                  <span class="thumb fake" aria-hidden="true">?</span>
                  <span class="row-name">
                    <span class="fake-name">{f.name}</span>
                    {#if f.of}<small>a made-up twin of {f.of.name}</small>{/if}
                  </span>
                  <b>{f.n}×</b>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <section class="collection" bind:this={collection}>
      <div class="banner small">
        <span class="rule"></span>
        <h2>Collection</h2>
        <span class="rule"></span>
      </div>
      <div class="controls">
        <input class="field search" type="search" bind:value={search} placeholder="Search your codex" aria-label="Search your codex" spellcheck="false" />
        {#if only}
          <button class="filter" onclick={() => (only = '')} title="Show every category" transition:fade={{ duration: 150 }}>
            {only}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>
        {/if}
        <div class="seg" role="group" aria-label="View">
          <button class:on={view === 'grid'} aria-pressed={view === 'grid'} onclick={() => (view = 'grid')}>Grid</button>
          <button class:on={view === 'table'} aria-pressed={view === 'table'} onclick={() => (view = 'table')}>Table</button>
        </div>
      </div>

      {#if view === 'grid'}
        {#each sections as sec (sec.stats.category)}
          <section class="tooltip" use:backdropShadow={{ fill: 'linear' }}>
            <div class="head">
              <div class="head-text">
                <span class="iname">{sec.stats.category}</span>
                <span class="ibase">{sec.stats.seen} of {sec.stats.total} discovered{sec.stats.n ? ` • ${pct(sec.stats)} right` : ''}</span>
              </div>
            </div>
            {#if sec.stats.groups.length > 1}
              <p class="groups">
                {#each sec.stats.groups as g (g.group)}
                  <span>{g.group} <b>{g.seen}/{g.total}</b>{g.n ? ` • ${pct(g)}` : ''}</span>
                {/each}
              </p>
            {/if}
            <ul class="cells">
              {#each sec.items as it (it.id)}
                {@const e = codex.items[it.id]}
                <li>
                  {#if e}
                    {@const t = tallyOf(e)}
                    <button class="cell" data-fx="hover" onclick={() => (open = it)} aria-label="{it.name}{t.n ? `, ${t.ok} of ${answers(t.n)} right` : ''}">
                      {#if t.n}<span class="score">{t.ok}/{t.n}</span>{/if}
                      <span class="pic"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
                      <span class="caption">{it.name}</span>
                      {#if t.n}<span class="acc" style:--a={accuracy(t)}></span>{/if}
                    </button>
                  {:else}
                    <span class="cell unknown" title="Not discovered yet">
                      <span class="pic"><img src={itemImage(it.id)} alt="" loading="lazy" draggable="false" /></span>
                      <span class="caption">Unidentified</span>
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {:else}
          <p class="none">Nothing in your codex matches.</p>
        {/each}
      {:else if rows.length}
        <div class="tooltip ledger" use:backdropShadow={{ fill: 'linear' }}>
          <table>
            <thead>
              <tr>
                {#each COLUMNS as col (col.key)}
                  <th class:num={col.num} class:wide={col.wide} aria-sort={sortKey === col.key ? (sortDown ? 'descending' : 'ascending') : 'none'}>
                    <button onclick={() => sortBy(col.key)}>
                      {#if col.short}<span class="long">{col.label}</span><span class="short">{col.short}</span>{:else}{col.label}{/if}<span class="arrow" aria-hidden="true">{sortKey === col.key ? (sortDown ? '▾' : '▴') : ''}</span>
                    </button>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each rows as r (r.item.id)}
                <tr>
                  <td>
                    <button class="item" onclick={() => (open = r.item)}>
                      {@render thumb(r.item)}
                      <span class="item-name"><span>{r.item.name}</span><small>{r.item.base}</small></span>
                    </button>
                  </td>
                  <td class="wide type">{r.item.group}</td>
                  <td class="num">{r.entry.seen}</td>
                  <td class="num">{#if r.tally.n}{r.tally.ok}<small>/{r.tally.n}</small>{/if}</td>
                  <td class="num">
                    {#if r.tally.n}
                      <span class="acc-cell">{@render meter(r.tally, r.item.name)}<span class="acc-pct">{pct(r.tally)}</span></span>
                    {/if}
                  </td>
                  <td class="num wide when">{date(r.entry.last)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="none">Nothing in your codex matches.</p>
      {/if}
    </section>

    <footer class="end">
      <p>Your codex lives in this browser only; clearing the site's data erases it.</p>
      <button class="erase" onclick={() => (confirmReset = true)}>Erase codex</button>
    </footer>
  {/if}
</div>

{#if open}
  <CodexItem item={open} {codex} onclose={() => (open = null)} onopen={(it) => (open = it)} />
{/if}

{#if confirmReset}
  <div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={() => (confirmReset = false)}
    onkeydown={(e) => e.key === 'Escape' && (confirmReset = false)}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="confirm panel" transition:fly={{ y: 20, duration: 250 }} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <h3>Erase your codex?</h3>
      <p class="muted">Every item you have met and every answer recorded in this browser is lost. This can't be undone.</p>
      <div class="actions">
        <button class="btn ghost" onclick={() => (confirmReset = false)}>Keep it</button>
        <button class="btn primary" onclick={reset}>Erase</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .codex {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 1.2rem 1rem 2.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
  }

  /* ---- title, as the game's turn banner ---- */
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    margin-top: 0.6rem;
  }
  .banner h1,
  .banner h2 {
    font-size: clamp(2rem, 6vw, 3rem);
    font-weight: 900;
    color: var(--gold-hi);
    text-shadow:
      0 0 24px rgba(201, 164, 92, 0.45),
      0 3px 12px rgba(0, 0, 0, 0.9);
    animation: arrive 0.9s var(--ease-out) both;
    white-space: nowrap;
  }
  .banner.small h2 {
    font-size: clamp(1.4rem, 4vw, 1.9rem);
    animation: none;
  }
  .rule {
    flex: 0 1 160px;
    min-width: 16px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold));
    animation: grow 0.9s var(--ease-out) both;
  }
  .rule:last-child {
    background: linear-gradient(270deg, transparent, var(--gold));
  }
  .banner.small .rule {
    animation: none;
  }
  @keyframes arrive {
    from {
      opacity: 0;
      letter-spacing: 0.4em;
      filter: blur(6px);
    }
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
      opacity: 0;
    }
  }
  .lede {
    margin: -1rem 0 0;
    text-align: center;
    font-style: italic;
    font-size: 1.1rem;
    color: #b8ab95;
  }

  /* ---- summary: the medallion between four figures ---- */
  .summary {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1.5rem;
  }
  .side {
    display: flex;
    justify-content: space-evenly;
    gap: 1rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 0;
  }
  .stat-label,
  .medal-label {
    font-family: var(--font-display);
    font-size: 0.74rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .stat-value,
  .medal-value {
    font-family: var(--font-cinzel);
    font-weight: 700;
    line-height: 1.1;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .stat-value {
    font-size: 2.3rem;
    margin: 0.15rem 0 0.1rem;
  }
  .stat-value small {
    font-size: 1.1rem;
  }
  .stat-note {
    font-size: 0.92rem;
    font-style: italic;
    color: var(--muted);
  }
  .medallion {
    grid-column: 2;
    position: relative;
    isolation: isolate;
    width: 250px;
    height: 250px;
    display: grid;
    place-items: center;
  }
  .medallion :global(.arcane) {
    z-index: -1;
  }
  .progress {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    rotate: -90deg;
    overflow: visible;
  }
  .track {
    fill: rgba(8, 6, 4, 0.75);
    stroke: rgba(125, 99, 51, 0.35);
    stroke-width: 6;
  }
  .arc {
    fill: none;
    stroke: url(#codex-arc);
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(224, 138, 68, 0.8));
    animation: fill-arc 1.6s var(--ease-out) 0.4s both;
  }
  @keyframes fill-arc {
    from {
      stroke-dasharray: 0 100;
    }
  }
  .medal-text {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.1;
  }
  .medal-value {
    font-size: 3.4rem;
  }
  .medal-of {
    font-family: var(--font-cinzel);
    font-size: 0.95rem;
    color: var(--gold);
    margin-bottom: 0.3rem;
  }

  .empty {
    width: min(520px, 100%);
    margin: 0 auto;
    text-align: center;
  }
  .empty p:first-child {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--gold-hi);
  }
  .empty p {
    margin: 0 0 1.4rem;
  }

  /* ---- categories, as small versions of the game's category cards ---- */
  .cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.8rem;
  }
  .cat {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    transition: opacity 0.3s;
  }
  .cat-frame {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 1rem 0.8rem 0.9rem;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      radial-gradient(ellipse at 50% 30%, rgba(175, 96, 37, 0.25), transparent 60%),
      linear-gradient(170deg, #2a2016, #120e0a 70%);
    box-shadow:
      inset 0 0 0 3px rgba(0, 0, 0, 0.5),
      inset 0 0 0 4px rgba(125, 99, 51, 0.35),
      0 10px 26px rgba(0, 0, 0, 0.5);
    transition:
      transform 0.35s var(--ease-out),
      border-color 0.3s,
      box-shadow 0.3s,
      filter 0.3s;
  }
  /* The game's filigree, on all four corners. */
  .cat-frame::before {
    content: '';
    position: absolute;
    inset: 4px;
    background: var(--filigree);
    background-size: 20px 20px;
    opacity: 0.75;
    filter: drop-shadow(0 0 3px rgba(224, 138, 68, 0.35));
    pointer-events: none;
  }
  .glyph {
    width: 64px;
    height: 64px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
    opacity: 0.85;
    filter: drop-shadow(0 0 10px rgba(224, 138, 68, 0.45));
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.3s;
  }
  .cat-name {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 2.4em;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.86rem;
    letter-spacing: 0.04em;
    line-height: 1.2;
    color: var(--gold-hi);
    text-align: center;
  }
  .cat-count {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1rem;
    color: var(--text);
  }
  .cat-count small {
    font-weight: 500;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .cat .meter {
    width: 80%;
    margin-top: 0.15rem;
  }
  .cat-acc {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .cat:hover .cat-frame,
  .cat:focus-visible .cat-frame {
    transform: translateY(-4px);
    border-color: var(--gold);
    box-shadow:
      inset 0 0 0 3px rgba(0, 0, 0, 0.5),
      inset 0 0 0 4px rgba(201, 164, 92, 0.6),
      0 0 26px rgba(224, 138, 68, 0.25),
      0 14px 30px rgba(0, 0, 0, 0.6);
  }
  .cat:hover .glyph {
    transform: scale(1.08) rotate(-3deg);
    opacity: 1;
  }
  .cat:focus-visible {
    outline: none;
  }
  .cat.on .cat-frame {
    border-color: var(--gold-hi);
    box-shadow:
      inset 0 0 0 3px rgba(0, 0, 0, 0.4),
      inset 0 0 0 4px rgba(241, 217, 155, 0.6),
      0 0 34px rgba(255, 170, 90, 0.35),
      0 14px 30px rgba(0, 0, 0, 0.6);
  }
  .cat.on .glyph {
    opacity: 1;
  }
  .cat.dim {
    opacity: 0.55;
  }
  .cat.dim:hover {
    opacity: 1;
  }

  /* One hue for every bar: ember to gold, more is more gold. */
  .meter {
    position: relative;
    display: block;
    height: 6px;
    border-radius: 3px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: linear-gradient(90deg, #6d4a1c, #c9a45c 70%, #f1d99b);
    box-shadow: 0 0 8px rgba(224, 138, 68, 0.45);
  }

  /* ---- panels, as the lobby's ---- */
  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    gap: 1rem;
    align-items: start;
  }
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
  }
  .answers {
    grid-column: 1 / -1;
  }
  .answer-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem 3rem;
  }
  .answer-cols h3 {
    margin-bottom: 0.6rem;
    font-size: 0.74rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .panel h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .count {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--gold);
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .bars li {
    display: grid;
    grid-template-columns: 7rem minmax(30px, 1fr) 3rem;
    align-items: center;
    gap: 0.7rem;
  }
  .bar-name {
    font-size: 1rem;
    white-space: nowrap;
  }
  .bar-value {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    text-align: right;
    color: var(--text);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0.7rem 0.35rem 0.35rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(59, 48, 36, 0.6);
    color: var(--text);
    font-size: 1rem;
    text-align: left;
  }
  button.row {
    cursor: pointer;
    transition:
      border-color 0.25s,
      background 0.25s,
      color 0.25s;
  }
  button.row:hover {
    border-color: var(--gold-lo);
    background: rgba(0, 0, 0, 0.4);
    color: var(--gold-hi);
  }
  .row b {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--gold);
    white-space: nowrap;
  }
  .row-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .row-name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-name small {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .fake-name {
    font-style: italic;
    text-decoration: line-through rgba(224, 85, 63, 0.6);
  }
  /* A small art stage, as the game's. */
  .thumb {
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background:
      radial-gradient(ellipse 60% 55% at 50% 50%, rgba(175, 96, 37, 0.22), transparent 70%),
      linear-gradient(180deg, #0c0d12, #060709);
    box-shadow: inset 0 0 0 1px rgba(90, 58, 28, 0.6);
  }
  .thumb img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
  }
  .thumb.fake {
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: #8e4434;
  }

  /* ---- the collection ---- */
  .collection {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    scroll-margin-top: 1rem;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
  }
  .search {
    width: min(320px, 100%);
    padding: 0.5rem 0.8rem;
  }
  .filter {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 38px;
    padding: 0 0.8rem;
    border: 1px solid var(--gold);
    border-radius: 3px;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    color: #fff1cf;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .filter svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .seg {
    display: flex;
    gap: 0.4rem;
  }
  .seg > button {
    min-width: 64px;
    height: 38px;
    padding: 0 0.8rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .seg > button:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .seg > button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border-color: var(--gold);
    text-shadow: 0 0 10px rgba(255, 220, 160, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.3),
      0 0 14px rgba(201, 164, 92, 0.3);
  }

  /* PoE-style item tooltip, as in the game (QuestionView). */
  .tooltip {
    border: 1px solid #5a3a1c;
    --bs-fill-a: rgba(5, 4, 3, 0.92);
    --bs-fill-b: rgba(5, 4, 3, 0.92);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs2, 0 0) var(--bs2-color, transparent));
  }
  .head {
    position: relative;
    display: grid;
    min-height: 60px;
    place-items: center;
    padding: 0.4rem 2.6rem;
    background:
      linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.35) 20%, rgba(175, 96, 37, 0.35) 80%, transparent),
      linear-gradient(180deg, #3b2412, #1c1008);
    border-bottom: 1px solid #6b4520;
  }
  .head::before,
  .head::after {
    content: '◆';
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    color: var(--unique);
    font-size: 0.9rem;
    opacity: 0.8;
  }
  .head::before {
    left: 14px;
  }
  .head::after {
    right: 14px;
  }
  .head-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.15;
  }
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.15rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.85rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  .groups {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem 1.4rem;
    margin: 0;
    padding: 0.55rem 1rem;
    border-bottom: 1px solid #2a1d10;
    font-variant: small-caps;
    letter-spacing: 0.04em;
    color: #8f9aa6;
  }
  .groups b {
    font-weight: 500;
    color: #a9c3dc;
  }
  /* The items, as the game's picture options: one dark stage per slot. */
  .cells {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
    gap: 1px;
    background: #060709;
  }
  .cells li {
    box-shadow: 0 0 0 1px #2a1d10;
  }
  .cell {
    position: relative;
    width: 100%;
    height: 158px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.9rem 0.5rem 0.7rem;
    border: 1px solid transparent;
    background:
      radial-gradient(ellipse 60% 50% at 50% 42%, rgba(175, 96, 37, 0.14), transparent 70%),
      radial-gradient(ellipse 90% 40% at 50% 0%, rgba(90, 110, 160, 0.09), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.5) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
    color: var(--text);
    text-align: center;
  }
  button.cell {
    cursor: pointer;
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  button.cell:hover,
  button.cell:focus-visible {
    outline: none;
    border-color: var(--gold);
    box-shadow: inset 0 0 30px rgba(201, 164, 92, 0.18);
  }
  .pic {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: grid;
    place-items: center;
    transition: transform 0.35s var(--ease-out);
  }
  button.cell:hover .pic {
    transform: scale(1.07);
  }
  .pic img {
    max-width: 88%;
    max-height: 92px;
    object-fit: contain;
    filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.8));
  }
  .caption {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    line-height: 1.2;
    color: var(--gold-hi);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 2.4em;
  }
  .score {
    position: absolute;
    top: 6px;
    right: 8px;
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    color: var(--muted);
  }
  /* Accuracy, along the slot's lower edge. */
  .acc {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: calc(var(--a) * 100%);
    background: linear-gradient(90deg, #6d4a1c, #c9a45c 70%, #f1d99b);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }
  /* Not met yet: only its shape, dark against the stage. */
  .unknown .pic img {
    filter: brightness(0) drop-shadow(0 0 1px rgba(201, 164, 92, 0.35)) drop-shadow(0 0 10px rgba(175, 96, 37, 0.25));
    opacity: 0.85;
    user-select: none;
  }
  .unknown .caption {
    font-weight: 400;
    letter-spacing: 0.08em;
    color: #6f6a62;
  }
  .none {
    margin: 1rem 0;
    text-align: center;
    font-style: italic;
    color: var(--muted);
  }

  /* The table: every column fits, nothing scrolls sideways. */
  .ledger table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  th {
    padding: 0;
    text-align: left;
    background: linear-gradient(180deg, #3b2412, #1c1008);
    border-bottom: 1px solid #6b4520;
  }
  th:nth-child(1) {
    width: auto;
  }
  th:nth-child(2) {
    width: 16%;
  }
  th:nth-child(3),
  th:nth-child(4) {
    width: 4.6rem;
  }
  th:nth-child(5) {
    width: 9.5rem;
  }
  th:nth-child(6) {
    width: 6.5rem;
  }
  th button {
    width: 100%;
    padding: 0.75rem 0.8rem;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: inherit;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
    white-space: nowrap;
  }
  th button:hover,
  th[aria-sort='ascending'] button,
  th[aria-sort='descending'] button {
    color: var(--unique-hi);
  }
  .arrow {
    display: inline-block;
    width: 0.9em;
    text-align: right;
  }
  .num {
    text-align: right;
  }
  td {
    padding: 0.3rem 0.8rem;
    border-bottom: 1px solid #1d150c;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tbody tr {
    transition: background 0.2s;
  }
  tbody tr:hover {
    background: rgba(175, 96, 37, 0.08);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  td.num {
    font-family: var(--font-cinzel);
    font-size: 0.88rem;
  }
  td small {
    color: var(--muted);
  }
  .type,
  .when {
    color: var(--muted);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    min-width: 0;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
    color: var(--text);
  }
  .item-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    font-size: 1rem;
  }
  .item-name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-name small {
    font-size: 0.82rem;
    color: #d8a26a;
    opacity: 0.75;
  }
  tbody tr:hover .item-name {
    color: var(--gold-hi);
  }
  .acc-cell {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
    width: 100%;
  }
  .acc-cell .meter {
    flex: 1;
    max-width: 4.5rem;
  }
  .acc-pct {
    width: 2.6rem;
  }
  .short {
    display: none;
  }

  .end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.6rem;
    text-align: center;
    font-size: 0.9rem;
    font-style: italic;
    color: var(--muted);
  }
  .end p {
    margin: 0;
  }
  .erase {
    padding: 0.2rem 0.4rem;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-style: normal;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    transition: color 0.2s;
  }
  .erase:hover {
    color: #ff7a5c;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the leave dialog (App.svelte). */
    z-index: 94;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .confirm {
    width: min(420px, 100%);
    padding: 1.6rem;
    text-align: center;
  }
  .confirm h3 {
    color: var(--gold-hi);
    font-size: 1.2rem;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1.2rem;
  }

  @media (max-width: 900px) {
    .summary {
      grid-template-columns: 1fr 1fr;
      row-gap: 1rem;
    }
    .medallion {
      grid-column: 1 / -1;
      grid-row: 1;
      justify-self: center;
    }
    .cats {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }
  @media (max-width: 560px) {
    .codex {
      gap: 1.3rem;
    }
    .summary {
      grid-template-columns: 1fr;
    }
    .side {
      justify-content: space-around;
    }
    .medallion {
      width: 220px;
      height: 220px;
    }
    .medal-value {
      font-size: 3rem;
    }
    .stat-value {
      font-size: 1.9rem;
    }
    .cats {
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }
    .glyph {
      width: 48px;
      height: 48px;
    }
    .cells {
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    }
    .cell {
      height: 140px;
    }
    .pic img {
      max-height: 76px;
    }
    .wide {
      display: none;
    }
    th:nth-child(3),
    th:nth-child(4) {
      width: 3.4rem;
    }
    th:nth-child(5) {
      width: 4rem;
    }
    th button {
      padding: 0.7rem 0.4rem;
      letter-spacing: 0.08em;
    }
    td {
      padding: 0.3rem 0.4rem;
    }
    .acc-cell .meter {
      display: none;
    }
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
    .item {
      gap: 0.5rem;
    }
    .item .thumb {
      width: 34px;
      height: 34px;
    }
    .item .thumb img {
      width: 28px;
      height: 28px;
    }
  }
</style>
