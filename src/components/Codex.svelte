<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { engine, savedName, session } from '../lib/session.svelte';
  import { nameHeld, nameTooShort } from '../lib/names';
  import { CODEX_KEY, RECENT, loadCodex, resetCodex, type Tally } from '../lib/codex';
  import { accuracy, codexStats, delveSummary, tallyOf } from '../lib/codexStats';
  import { categoryIcon, itemImage } from '../lib/ui';
  import { DIFFICULTY_NAMES } from '../lib/difficultyText';
  import { closeCodex, codexRoute } from '../lib/codexRoute.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { dialogBackdrop } from '../lib/behindDialog';
  import type { Difficulty, Item } from '../lib/game';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import CodexItem from './CodexItem.svelte';
  import CodexFilter from './CodexFilter.svelte';
  import CodexDelve from './CodexDelve.svelte';
  import { DELVE_RECORD_KEY, loadRecords, resetRecords } from '../lib/delveRecord';

  /** Svelte's transitions run whatever the system says: with reduced motion, things just appear. */
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = <T extends { duration?: number; delay?: number }>(p: T): T => (still ? { ...p, duration: 0, delay: 0 } : p);

  let codex = $state.raw(loadCodex());
  let delve = $state.raw(loadRecords());
  onMount(() => {
    // A game in another tab may add to it meanwhile.
    const reload = (e: StorageEvent) => {
      if (e.key === CODEX_KEY || e.key === null) codex = loadCodex();
      if (e.key === DELVE_RECORD_KEY || e.key === null) delve = loadRecords();
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

  /** "?" without answers, as the answer time without a right one. */
  const pct = (t: Tally) => (t.n ? `${Math.round((accuracy(t) ?? 0) * 100)}%` : '?');
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
    { key: 'seen', label: 'Seen', num: true },
    { key: 'right', label: 'Right', num: true },
    { key: 'accuracy', label: 'Accuracy', short: '%', num: true },
    { key: 'last', label: 'Last seen', num: true, wide: true },
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

  const filterOptions = $derived([
    { value: '', label: 'All categories', note: `${stats.seen}/${stats.total}` },
    ...stats.categories.map((c) => ({ value: c.category, label: c.category, icon: categoryIcon(c.category), note: `${c.seen}/${c.total}` })),
  ]);

  let open = $state<Item | null>(null);
  let confirmReset = $state(false);
  function reset() {
    resetCodex();
    resetRecords();
    codex = loadCodex();
    delve = loadRecords();
    confirmReset = false;
  }

  // ---- two pages: the collection, and Delve (CodexDelve) ----

  type Tab = 'items' | 'delve';
  const TABS: { key: Tab; label: string }[] = [
    { key: 'items', label: 'Collection' },
    { key: 'delve', label: 'Delve' },
  ];
  let tab = $state<Tab>('items');
  /** The tab's note: your best alone under the current rules (together, before a run alone). */
  const delveBest = $derived(delveSummary(delve, 'solo').deepest ?? delveSummary(delve, 'group').deepest);
  const delved = $derived(delve.runs.length > 0 || delve.frontier.length > 0 || Object.keys(delve.bests).length > 0);

  /**
   * "Begin the descent": a run alone straight away under the name this
   * browser plays as; without one, the start page with Delve chosen for the
   * game it opens.
   */
  function beginDelve() {
    const name = savedName().trim();
    const known = !!name && !nameTooShort(name) && !nameHeld(name);
    if (!known) session.delveLink = true;
    closeCodex();
    if (!known) return;
    // Once the codex is closed: a game starting under it would close it a second time (App), going back twice.
    const go = () => {
      if (codexRoute.open) return;
      removeEventListener('popstate', go);
      if (!session.state) session.startDelve(name);
    };
    if (codexRoute.open) addEventListener('popstate', go);
    else go();
  }
  /** Anything to show (or erase): the tabs and the footer only come with it. */
  const kept = $derived(stats.seen > 0 || delved);
  const tabs = new Map<Tab, HTMLButtonElement>();
  const tabRef = (key: Tab) => (el: HTMLButtonElement) => {
    tabs.set(key, el);
    return () => tabs.delete(key);
  };
  /** Arrow keys move between the tabs, as a tab list does. */
  function tabKey(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    tab = TABS[(i + step + TABS.length) % TABS.length].key;
    tabs.get(tab)?.focus();
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
        <span class="bar-value">{#if b.tally.n}{pct(b.tally)} <small>of {b.tally.n}</small>{:else}<small>no answers</small>{/if}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet thumb(it: Item)}
  <span class="thumb"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
{/snippet}

{#snippet glyph(category: string)}
  <span class="glyph" style:--src="url('{categoryIcon(category)}')" aria-hidden="true"></span>
{/snippet}

<div class="codex">
  <header class="hero" in:fly={calm({ y: -10, duration: 600 })}>
    <p class="kicker">Your collection</p>
    <h1>Codex</h1>
    <p class="tagline">
      {tab === 'delve' ? 'Every descent you have made, the depths you have named, and what they cost you.' : 'Every unique and lineage gem you have seen in a game, and how well you know it.'}
    </p>
  </header>

  {#if kept}
    <div class="tabs" role="tablist" aria-label="Codex pages" in:fly={calm({ y: -6, duration: 500, delay: 100 })}>
      {#each TABS as t (t.key)}
        <button
          {@attach tabRef(t.key)}
          role="tab"
          id="codex-tab-{t.key}"
          class:on={tab === t.key}
          aria-selected={tab === t.key}
          aria-controls="codex-page"
          tabindex={tab === t.key ? 0 : -1}
          onclick={() => (tab = t.key)}
          onkeydown={tabKey}
        >
          <span class="tab-label">{t.label}</span>
          <span class="tab-note">{t.key === 'items' ? `${stats.seen}/${stats.total}` : (delveBest ?? '')}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="page" id="codex-page" role={kept ? 'tabpanel' : undefined} aria-labelledby={kept ? `codex-tab-${tab}` : undefined}>
  {#if tab === 'delve' && kept}
    <CodexDelve {codex} records={delve} onopen={(it) => (open = it)} onbegin={beginDelve} />
  {:else}

  <section class="summary" in:fly={calm({ y: 20, duration: 700, delay: 150 })}>
    {#if stats.seen}
      <div class="side">
        <div class="stat">
          <span class="stat-label">Accuracy</span>
          <span class="stat-value">{pct(stats)}</span>
          <span class="stat-note">{stats.n ? `${stats.ok} of ${answers(stats.n)}` : 'right answers'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Lately</span>
          <span class="stat-value">{pct(stats.recent)}</span>
          <span class="stat-note">your last {answers(stats.recent.n || RECENT)}</span>
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
          <span class="stat-note">{stats.streak ? `current streak: ${stats.streak}` : 'right answers in a row'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Typical time</span>
          <span class="stat-value">{stats.medianMs === null ? '?' : secs(stats.medianMs)}<small>{stats.medianMs === null ? '' : ' s'}</small></span>
          <span class="stat-note">{stats.fastest ? `your fastest: ${secs(stats.fastest.ms)} s` : 'per right answer'}</span>
        </div>
      </div>
    {/if}
  </section>

  {#if !stats.seen}
    <div class="empty" in:fly={calm({ y: 20, duration: 700, delay: 300 })}>
      <p>Your codex is still blank.</p>
      <p class="muted">
        Every item revealed in your games is written into it, with how often you named it right. It is kept in this browser only.
      </p>
      <button class="btn primary" onclick={closeCodex}>Begin the hunt</button>
    </div>
  {:else}
    <div class="split" in:fly={calm({ y: 20, duration: 700, delay: 250 })}>
      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>By question</h2></header>
        {@render bars([
          { name: 'Name the art', tally: stats.byMode.name },
          { name: 'Find the art', tally: stats.byMode.art },
        ])}
        {#if difficulties.length}
          <header class="sub"><h2>By difficulty</h2></header>
          {@render bars(difficulties)}
        {/if}
      </section>

      <section class="panel by-cat" use:backdropShadow={{ fill: 'linear' }}>
        <header class="cat-cols"><h2>By category</h2><span class="col-label">Accuracy</span></header>
        <ul class="bars cats">
          {#each stats.categories as c (c.category)}
            <li>
              <button class="cat" class:on={only === c.category} aria-pressed={only === c.category} onclick={() => showCategory(c.category)} title="Show {c.category}">
                <span class="cat-name">
                  {@render glyph(c.category)}
                  <span class="bar-name">{c.category}</span>
                </span>
                <span class="found" title="{c.seen} of {c.total} discovered">{c.seen}/{c.total}</span>
                {@render meter(c, c.category)}
                <span class="bar-value">{c.n ? pct(c) : ''}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <div class="insights" in:fly={calm({ y: 20, duration: 700, delay: 350 })}>
      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>Nemeses</h2></header>
        {#if stats.nemeses.length}
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
        {:else}
          <p class="hint">Items you have answered at least twice and still get wrong show up here.</p>
        {/if}
      </section>

      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>Mix-ups</h2></header>
        {#if stats.confusions.length}
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
        {:else}
          <p class="hint">When you take one item for another, the pair shows up here.</p>
        {/if}
      </section>

      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>Made-up names</h2></header>
        {#if stats.fooled.length}
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
        {:else}
          <p class="hint">Fake names you fall for show up here.</p>
        {/if}
      </section>
    </div>

    <section class="collection" bind:this={collection}>
      <div class="bar">
        <h2>Collection</h2>
        <div class="controls">
          <input class="field search" type="search" bind:value={search} placeholder="Search names" aria-label="Search names" spellcheck="false" />
          <CodexFilter bind:value={only} options={filterOptions} label="Category" />
          <div class="seg" role="group" aria-label="View">
            <button class:on={view === 'grid'} aria-pressed={view === 'grid'} onclick={() => (view = 'grid')}>Grid</button>
            <button class:on={view === 'table'} aria-pressed={view === 'table'} onclick={() => (view = 'table')}>Table</button>
          </div>
        </div>
      </div>

      {#if view === 'grid'}
        {#each sections as sec (sec.stats.category)}
          <section class="cat-section">
            <header>
              {@render glyph(sec.stats.category)}
              <h3>{sec.stats.category}</h3>
              <span class="muted">{sec.stats.seen} / {sec.stats.total} discovered{sec.stats.n ? ` • ${pct(sec.stats)} accuracy` : ''}</span>
            </header>
            {#if sec.stats.groups.length > 1}
              <ul class="groups">
                {#each sec.stats.groups as g (g.group)}
                  <li title="{g.seen} of {g.total} discovered{g.n ? `, ${g.ok} of ${answers(g.n)} right` : ''}">
                    {g.group} <span class="muted">{g.seen}/{g.total}{g.n ? ` • ${pct(g)}` : ''}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            <ul class="grid">
              {#each sec.items as it (it.id)}
                {@const e = codex.items[it.id]}
                <li>
                  {#if e}
                    {@const t = tallyOf(e)}
                    <button class="tile" onclick={() => (open = it)} aria-label="{it.name}{t.n ? `, ${t.ok} of ${answers(t.n)} right` : ', seen'}">
                      <span class="art"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
                      <span class="name">{it.name}</span>
                      <span class="status">
                        {#if t.n}
                          {@render meter(t, it.name)}
                        {:else}
                          <span class="seen-only">seen</span>
                        {/if}
                      </span>
                    </button>
                  {:else}
                    <span class="tile unknown" title="Not discovered yet">
                      <span class="art"><img src={itemImage(it.id)} alt="" loading="lazy" draggable="false" /></span>
                      <span class="name">Undiscovered</span>
                      <span class="status"></span>
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {:else}
          <p class="none">Nothing found.</p>
        {/each}
      {:else if rows.length}
        <div class="ledger" use:backdropShadow={{ fill: 'linear' }}>
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
        <p class="none">Nothing found.</p>
      {/if}
    </section>

  {/if}
  {/if}
  </div>

  {#if kept}
    <footer class="end">
      <p>Your codex and your Delve runs live in this browser only; clearing the site's data erases them.</p>
      <button class="btn danger small" onclick={() => (confirmReset = true)}>Erase codex</button>
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
    <div class="confirm panel" transition:fly={calm({ y: 20, duration: 250 })} onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <h3>Erase your codex?</h3>
      <p class="muted">Every item you have seen, every answer and every Delve run recorded in this browser is lost. This can't be undone.</p>
      <div class="actions">
        <button class="btn ghost" onclick={() => (confirmReset = false)}>Keep it</button>
        <button class="btn danger" onclick={reset}>Erase</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .codex {
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 1.4rem 1rem 2.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  /* ---- title ---- */
  .hero {
    text-align: center;
  }
  .kicker {
    margin: 0 0 0.3rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.5em;
    padding-left: 0.5em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  h1 {
    font-size: clamp(2.4rem, 7vw, 3.6rem);
    font-weight: 900;
    letter-spacing: 0.08em;
    line-height: 1.05;
    background: linear-gradient(180deg, #fff1c9 20%, #d7b068 55%, #8b6526 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.8));
  }
  .tagline {
    margin: 0.6rem 0 0;
    font-style: italic;
    color: #b8ab95;
  }

  /* ---- the two pages ---- */
  .tabs {
    display: flex;
    justify-content: center;
    gap: 0.4rem;
    margin: -0.4rem auto 0;
    width: min(440px, 100%);
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    position: relative;
    flex: 1;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.55rem 0.8rem 0.6rem;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--muted);
    transition: color 0.25s;
  }
  .tab-label {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.86rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .tab-note {
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    color: var(--gold-lo);
    transition: color 0.25s;
  }
  .tabs button::after {
    content: '';
    position: absolute;
    left: 18%;
    right: 18%;
    bottom: -1px;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--unique-hi), #fbe6b0, var(--unique-hi), transparent);
    box-shadow: 0 0 10px rgba(224, 138, 68, 0.6);
    opacity: 0;
    scale: 0.4 1;
    transition:
      opacity 0.3s,
      scale 0.4s var(--ease-out);
  }
  .tabs button:hover {
    color: var(--gold-hi);
  }
  .tabs button.on {
    color: var(--gold-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.35);
  }
  .tabs button.on .tab-note {
    color: var(--gold);
  }
  .tabs button.on::after {
    opacity: 1;
    scale: 1 1;
  }
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
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
  .stat-label {
    margin-bottom: 0.35rem;
  }
  .stat-value {
    font-size: 2.3rem;
    line-height: 1;
    margin-bottom: 0.3rem;
  }
  .stat-value small {
    font-size: 1.1rem;
  }
  .stat-note {
    font-size: 0.92rem;
    line-height: 1.3;
    font-style: italic;
    color: var(--muted);
  }
  .medallion {
    grid-column: 2;
    position: relative;
    isolation: isolate;
    width: 240px;
    height: 240px;
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
    font-size: 3.2rem;
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

  /* ---- panels, as the lobby's ---- */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 1rem;
  }
  .insights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .panel header.sub {
    margin-top: 1.3rem;
  }
  .panel h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .hint {
    margin: 0;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }

  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(0, 7rem) minmax(40px, 1fr) 5.2rem;
    align-items: center;
    gap: 0.7rem;
  }
  /* The header and each category share the same columns: name, found, accuracy bar and figure. */
  .by-cat {
    --cols: minmax(0, 1fr) 3.2rem minmax(40px, 9rem) 2.8rem;
  }
  .bars.cats {
    gap: 0.1rem;
  }
  .bars.cats li {
    display: block;
  }
  .cat {
    display: grid;
    grid-template-columns: var(--cols);
    align-items: center;
    gap: 0.7rem;
    /* Padded for the highlight, pulled back out to line up with the header. */
    margin: 0 -0.6rem;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .panel header.cat-cols {
    display: grid;
    grid-template-columns: var(--cols);
    column-gap: 0.7rem;
  }
  .cat-cols h2 {
    grid-column: 1 / 3;
  }
  .col-label {
    grid-column: 3 / 5;
    justify-self: end;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .bar-name {
    font-size: 0.98rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-value {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }
  .bar-value small {
    color: var(--muted);
    font-family: var(--font-body);
    font-size: 0.85rem;
  }
  .found {
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    color: var(--muted);
    text-align: right;
  }
  .cat {
    width: calc(100% + 1.2rem);
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: var(--text);
    transition:
      color 0.2s,
      background-color 0.2s;
  }
  .cat-name {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }
  .cat:hover {
    background: rgba(175, 96, 37, 0.1);
    color: var(--gold-hi);
  }
  .cat.on {
    background: rgba(201, 164, 92, 0.14);
    box-shadow: inset 2px 0 0 var(--gold);
    color: var(--gold-hi);
  }
  .cat:hover .found,
  .cat.on .found {
    color: var(--text);
  }
  /* The game's category emblems: the art as a gold silhouette (ChooseCategory). */
  .glyph {
    flex: none;
    width: 24px;
    height: 24px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.45));
  }

  /* One hue for every bar: ember to gold, more is more gold. */
  .meter {
    position: relative;
    display: block;
    height: 6px;
    min-width: 0;
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
    margin-top: 1.4rem;
    scroll-margin-top: 1rem;
  }
  .collection > .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  .collection > .bar h2 {
    margin: 0;
    font-size: 1.05rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .controls .field {
    width: auto;
    padding: 0.45rem 0.7rem;
    font-size: 0.95rem;
  }
  .controls .search {
    width: 12rem;
  }
  .seg {
    display: flex;
    gap: 0.3rem;
  }
  .seg > button {
    min-width: 60px;
    padding: 0.45rem 0.7rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
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

  .cat-section header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.7rem;
    margin-bottom: 0.5rem;
  }
  .cat-section .glyph {
    width: 30px;
    height: 30px;
  }
  .cat-section h3 {
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    color: var(--gold-hi);
  }
  .cat-section header span {
    font-size: 0.92rem;
  }
  .groups {
    list-style: none;
    margin: 0 0 0.7rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .groups li {
    padding: 0.15rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.88rem;
    background: rgba(0, 0, 0, 0.25);
  }
  .grid {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(106px, 1fr));
    gap: 0.5rem;
  }
  .tile {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
    padding: 0.5rem 0.5rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: radial-gradient(ellipse at 50% 35%, rgba(175, 96, 37, 0.1), transparent 70%), rgba(0, 0, 0, 0.35);
    color: var(--text);
    text-align: center;
  }
  button.tile {
    cursor: pointer;
    transition:
      border-color 0.2s,
      box-shadow 0.25s,
      transform 0.2s var(--ease-out);
  }
  button.tile:hover {
    border-color: var(--gold-lo);
    box-shadow: 0 0 16px rgba(201, 164, 92, 0.2);
    transform: translateY(-2px);
  }
  .art {
    height: 72px;
    display: grid;
    place-items: center;
  }
  .art img {
    max-width: 100%;
    max-height: 72px;
    object-fit: contain;
    filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.7));
  }
  .name {
    font-size: 0.82rem;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex: 1;
  }
  /* The accuracy bar, or "seen" without answers, on the same line. */
  .status {
    height: 0.8rem;
    display: grid;
    align-items: center;
  }
  .tile .meter {
    height: 4px;
  }
  .seen-only {
    font-size: 0.75rem;
    font-style: italic;
    color: var(--muted);
    line-height: 1;
  }
  /* Not seen yet: only its shape. */
  .unknown {
    background: rgba(0, 0, 0, 0.25);
    border-style: dashed;
  }
  .unknown .art img {
    filter: brightness(0);
    opacity: 0.7;
    user-select: none;
  }
  .unknown .name {
    font-style: italic;
    color: var(--muted);
    opacity: 0.6;
  }
  .none {
    text-align: center;
    font-style: italic;
    color: var(--muted);
  }

  /* The table: every column fits, nothing scrolls sideways. */
  .ledger {
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
    gap: 0.8rem;
    margin-top: 1rem;
    text-align: center;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .end p {
    margin: 0;
    font-style: italic;
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
    .split {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 560px) {
    .summary {
      grid-template-columns: 1fr;
      row-gap: 1.75rem;
    }
    .side {
      justify-content: space-around;
    }
    .medallion {
      width: 210px;
      height: 210px;
    }
    .medal-value {
      font-size: 2.8rem;
    }
    .stat-value {
      font-size: 1.9rem;
    }
    .bars li {
      grid-template-columns: minmax(0, 6.5rem) minmax(30px, 1fr) 4.8rem;
      gap: 0.5rem;
    }
    .by-cat {
      --cols: minmax(0, 1fr) 2.8rem minmax(30px, 4rem) 2.6rem;
    }
    .cat,
    .panel header.cat-cols {
      column-gap: 0.5rem;
    }
    .controls,
    .controls .search {
      width: 100%;
    }
    .controls :global(.dd) {
      flex: 1;
    }
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
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
    .acc-cell .meter,
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
