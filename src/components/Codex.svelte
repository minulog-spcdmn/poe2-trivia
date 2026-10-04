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
  import type { Difficulty, Item } from '../lib/game';
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

  const pct = (t: Tally) => {
    const a = accuracy(t);
    return a === null ? '' : `${Math.round(a * 100)}%`;
  };
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const answers = (n: number) => `${n} ${n === 1 ? 'answer' : 'answers'}`;

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

  type SortKey = 'name' | 'category' | 'seen' | 'answers' | 'accuracy' | 'last';
  let sortKey = $state<SortKey>('last');
  let sortDown = $state(true);
  /** `wide`: left out on narrow screens. */
  const COLUMNS: { key: SortKey; label: string; num?: boolean; wide?: boolean }[] = [
    { key: 'name', label: 'Item' },
    { key: 'category', label: 'Type', wide: true },
    { key: 'seen', label: 'Seen', num: true },
    { key: 'answers', label: 'Answers', num: true },
    { key: 'accuracy', label: 'Accuracy', num: true },
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
        case 'category':
          return `${r.item.category} ${r.item.group}`;
        case 'seen':
          return r.entry.seen;
        case 'answers':
          return r.tally.n;
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
      sortDown = key !== 'name' && key !== 'category';
    }
  }

  let collection = $state<HTMLElement>();
  async function showCategory(category: string) {
    only = category;
    search = '';
    await tick();
    collection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let open = $state<Item | null>(null);
  let confirmReset = $state(false);
  function reset() {
    resetCodex();
    codex = loadCodex();
    confirmReset = false;
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

<div class="codex">
  <div class="top">
    <button class="btn ghost small back" onclick={closeCodex}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      Back
    </button>
  </div>

  <header class="hero" in:fly={{ y: -10, duration: 600 }}>
    <p class="kicker">Your collection</p>
    <h1>Codex</h1>
    <p class="tagline">Every unique and lineage gem you have met in a game, and how well you know it.</p>
  </header>

  {#if stats.seen === 0}
    <div class="empty panel" use:backdropShadow={{ fill: 'linear' }} in:fly={{ y: 20, duration: 600, delay: 150 }}>
      <p>Your codex is empty.</p>
      <p class="muted">
        Play a game: every item you see revealed is recorded here, along with how often you named it right. It stays in this browser only.
      </p>
      <button class="btn primary" onclick={closeCodex}>Back</button>
    </div>
  {:else}
    <section class="tiles" aria-label="Summary" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <div class="tile panel">
        <span class="tile-label">Discovered</span>
        <span class="tile-value">{stats.seen}<small> / {stats.total}</small></span>
        <span class="meter wide" title="{stats.seen} of {stats.total} discovered">
          <span class="fill" style:width="{(stats.seen / stats.total) * 100}%"></span>
        </span>
      </div>
      <div class="tile panel">
        <span class="tile-label">Accuracy</span>
        <span class="tile-value">{stats.n ? pct(stats) : '0%'}</span>
        <span class="tile-note">{stats.ok} of {answers(stats.n)}</span>
      </div>
      <div class="tile panel">
        <span class="tile-label">Recent</span>
        <span class="tile-value">{stats.recent.n ? pct(stats.recent) : '0%'}</span>
        <span class="tile-note">your last {answers(stats.recent.n)}</span>
      </div>
      <div class="tile panel">
        <span class="tile-label">Best streak</span>
        <span class="tile-value">{stats.best}</span>
        <span class="tile-note">now {stats.streak} in a row</span>
      </div>
      <div class="tile panel">
        <span class="tile-label">Answer time</span>
        <span class="tile-value">{stats.medianMs === null ? '?' : secs(stats.medianMs)}</span>
        <span class="tile-note">
          {#if stats.fastest}median • fastest {secs(stats.fastest.ms)}{:else}median of right answers{/if}
        </span>
      </div>
    </section>

    <div class="split" in:fly={{ y: 20, duration: 600, delay: 200 }}>
      <section class="panel box" use:backdropShadow={{ fill: 'linear' }}>
        <h2>By question</h2>
        {@render bars([
          { name: 'Name the art', tally: stats.byMode.name },
          { name: 'Find the art', tally: stats.byMode.art },
        ])}
        {#if difficulties.length}
          <h2 class="sub">By difficulty</h2>
          {@render bars(difficulties)}
        {/if}
      </section>

      <section class="panel box" use:backdropShadow={{ fill: 'linear' }}>
        <h2>By category</h2>
        <ul class="bars cats">
          {#each stats.categories as c (c.category)}
            <li>
              <button class="cat" onclick={() => showCategory(c.category)} title="Show {c.category}">
                <img src={categoryIcon(c.category)} alt="" />
                <span class="bar-name">{c.category}</span>
              </button>
              <span class="found" title="{c.seen} of {c.total} discovered">{c.seen}/{c.total}</span>
              {@render meter(c, c.category)}
              <span class="bar-value">{#if c.n}{pct(c)}{:else}<small>·</small>{/if}</span>
            </li>
          {/each}
        </ul>
      </section>
    </div>

    {#if stats.nemeses.length || stats.confusions.length || stats.fooled.length}
      <div class="insights" in:fly={{ y: 20, duration: 600, delay: 300 }}>
        {#if stats.nemeses.length}
          <section class="panel box">
            <h2>Nemeses</h2>
            <p class="hint muted">The items you miss most.</p>
            <ul class="list">
              {#each stats.nemeses as nm (nm.item.id)}
                <li>
                  <button class="pick" onclick={() => (open = nm.item)}>
                    <img src={itemImage(nm.item.id)} alt="" loading="lazy" />
                    <span>{nm.item.name}</span>
                  </button>
                  <b>{nm.tally.ok}/{nm.tally.n}</b>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
        {#if stats.confusions.length}
          <section class="panel box">
            <h2>Mix-ups</h2>
            <p class="hint muted">What you picked, and what it really was.</p>
            <ul class="list">
              {#each stats.confusions as cf (cf.answer.id + cf.picked.id)}
                <li>
                  <button class="pick pair" onclick={() => (open = cf.answer)} title="You took {cf.answer.name} for {cf.picked.name}">
                    <img src={itemImage(cf.answer.id)} alt="" loading="lazy" />
                    <span><span class="muted">{cf.picked.name}</span> <i>for</i> {cf.answer.name}</span>
                  </button>
                  <b>{cf.n}×</b>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
        {#if stats.fooled.length}
          <section class="panel box">
            <h2>Made-up names</h2>
            <p class="hint muted">Fakes you fell for.</p>
            <ul class="list">
              {#each stats.fooled as f (f.name)}
                <li>
                  <span class="fake">
                    “{f.name}”
                    {#if f.of}<small class="muted">a copy of {f.of.name}</small>{/if}
                  </span>
                  <b>{f.n}×</b>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}

    <section class="collection" bind:this={collection}>
      <div class="bar">
        <h2>Collection</h2>
        <div class="controls">
          <input class="field search" type="search" bind:value={search} placeholder="Search names" aria-label="Search names" spellcheck="false" />
          <select class="field" bind:value={only} aria-label="Category">
            <option value="">All categories</option>
            {#each engine.categories as c (c)}
              <option value={c}>{c}</option>
            {/each}
          </select>
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
              <img src={categoryIcon(sec.stats.category)} alt="" />
              <h3>{sec.stats.category}</h3>
              <span class="muted">{sec.stats.seen} / {sec.stats.total} discovered{#if sec.stats.n}{` • ${pct(sec.stats)} right`}{/if}</span>
            </header>
            {#if sec.stats.groups.length > 1}
              <ul class="groups">
                {#each sec.stats.groups as g (g.group)}
                  <li title="{g.seen} of {g.total} discovered{g.n ? `, ${g.ok} of ${answers(g.n)} right` : ''}">
                    {g.group} <span class="muted">{g.seen}/{g.total}{#if g.n}{` • ${pct(g)}`}{/if}</span>
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
                    <button class="tile-item" onclick={() => (open = it)} aria-label="{it.name}{t.n ? `, ${t.ok} of ${answers(t.n)} right` : ', seen'}">
                      <span class="thumb"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
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
                    <span class="tile-item unknown" title="Not discovered yet" aria-label="Not discovered yet">
                      <span class="thumb"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 9-7 9-7-9z" /></svg></span>
                      <span class="name">Undiscovered</span>
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {:else}
          <p class="muted none">Nothing found.</p>
        {/each}
      {:else if rows.length}
        <div class="table-wrap panel">
          <table>
            <thead>
              <tr>
                {#each COLUMNS as col (col.key)}
                  <th class:num={col.num} class:wide={col.wide} aria-sort={sortKey === col.key ? (sortDown ? 'descending' : 'ascending') : 'none'}>
                    <button onclick={() => sortBy(col.key)}>
                      {col.label}
                      <span class="arrow" aria-hidden="true">{sortKey === col.key ? (sortDown ? '▾' : '▴') : ''}</span>
                    </button>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each rows as r (r.item.id)}
                <tr>
                  <td>
                    <button class="pick" onclick={() => (open = r.item)}>
                      <img src={itemImage(r.item.id)} alt="" loading="lazy" />
                      <span>{r.item.name}</span>
                    </button>
                  </td>
                  <td class="muted wide">{r.item.group}</td>
                  <td class="num">{r.entry.seen}</td>
                  <td class="num">{r.tally.ok}/{r.tally.n}</td>
                  <td class="num">{r.tally.n ? pct(r.tally) : ''}</td>
                  <td class="num muted wide">{date(r.entry.last)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted none">Nothing found.</p>
      {/if}
    </section>

    <footer class="end">
      <p class="muted">Your codex is kept in this browser only. Clearing the site's data erases it.</p>
      <button class="btn ghost small" onclick={() => (confirmReset = true)}>Erase codex</button>
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
      <p class="muted">Every item you met and every answer recorded in this browser is deleted. This can't be undone.</p>
      <div class="actions">
        <button class="btn ghost" onclick={() => (confirmReset = false)}>Keep it</button>
        <button class="btn primary" onclick={reset}>Erase</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .codex {
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 1rem 1rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }
  .top {
    display: flex;
  }
  .back svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

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

  .empty {
    width: min(520px, 100%);
    margin: 0 auto;
    padding: 1.6rem;
    text-align: center;
  }
  .empty p:first-child {
    margin-top: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--gold-hi);
  }

  /* ---- summary ---- */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.8rem;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.9rem 1rem;
  }
  .tile-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tile-value {
    font-family: var(--font-cinzel);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--gold-hi);
    text-shadow: 0 0 16px rgba(241, 217, 155, 0.2);
  }
  .tile-value small {
    font-size: 1rem;
    color: var(--muted);
    text-shadow: none;
  }
  .tile-note {
    font-size: 0.9rem;
    color: var(--muted);
  }

  /* One hue, gold on the panel's line colour: more is more gold. */
  .meter {
    position: relative;
    display: block;
    height: 6px;
    min-width: 40px;
    border-radius: 3px;
    background: rgba(59, 48, 36, 0.8);
    overflow: hidden;
  }
  .meter.wide {
    margin-top: 0.4rem;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--gold-lo), var(--gold));
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 0.8rem;
  }
  .box {
    padding: 1.1rem 1.2rem;
  }
  h2 {
    font-size: 0.85rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold-hi);
    margin-bottom: 0.7rem;
  }
  h2.sub {
    margin-top: 1.2rem;
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
    grid-template-columns: minmax(0, 8rem) minmax(40px, 1fr) 5.5rem;
    align-items: center;
    gap: 0.7rem;
  }
  .bars.cats li {
    grid-template-columns: minmax(0, 1fr) 3.2rem minmax(40px, 9rem) 3rem;
  }
  .bar-name {
    font-size: 0.95rem;
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    transition: color 0.2s;
  }
  .cat:hover {
    color: var(--gold-hi);
  }
  .cat img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex: none;
  }

  .insights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.8rem;
  }
  .hint {
    margin: -0.4rem 0 0.6rem;
    font-size: 0.9rem;
    font-style: italic;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .list b {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--gold);
    white-space: nowrap;
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    transition:
      border-color 0.2s,
      background 0.2s,
      color 0.2s;
  }
  .pick:hover {
    border-color: var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--gold-hi);
  }
  .pick img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex: none;
  }
  .pick > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pair i {
    color: var(--muted);
  }
  .fake {
    flex: 1;
    min-width: 0;
    padding: 0.2rem 0.4rem;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  /* ---- collection ---- */
  .collection {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    scroll-margin-top: 1rem;
  }
  .collection > .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .collection > .bar h2 {
    margin: 0;
    font-size: 1rem;
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
  .search {
    min-width: 0;
    width: 12rem !important;
  }
  select.field {
    max-width: 16rem;
    font-family: var(--font-body);
    cursor: pointer;
  }
  select.field option {
    background: #15110d;
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
  }

  .cat-section header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.7rem;
    margin-bottom: 0.5rem;
  }
  .cat-section header img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
  .cat-section h3 {
    font-size: 1rem;
    letter-spacing: 0.08em;
    color: var(--gold-hi);
  }
  .cat-section header span {
    font-size: 0.9rem;
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
    padding: 0.15rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.85rem;
    background: rgba(0, 0, 0, 0.25);
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 0.5rem;
  }
  .tile-item {
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
  button.tile-item {
    cursor: pointer;
    transition:
      border-color 0.2s,
      box-shadow 0.25s,
      transform 0.2s var(--ease-out);
  }
  button.tile-item:hover {
    border-color: var(--gold-lo);
    box-shadow: 0 0 16px rgba(201, 164, 92, 0.2);
    transform: translateY(-2px);
  }
  .thumb {
    height: 72px;
    display: grid;
    place-items: center;
  }
  .thumb img {
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
  .tile-item .meter {
    height: 4px;
    min-width: 0;
  }
  .seen-only {
    font-size: 0.75rem;
    font-style: italic;
    color: var(--muted);
    line-height: 1;
  }
  .unknown {
    opacity: 0.45;
    background: rgba(0, 0, 0, 0.25);
    border-style: dashed;
  }
  .unknown svg {
    width: 26px;
    height: 26px;
    fill: none;
    stroke: var(--line);
    stroke-width: 1.4;
  }
  .unknown .name {
    font-style: italic;
    color: var(--muted);
  }
  .none {
    text-align: center;
    font-style: italic;
  }

  .table-wrap {
    overflow-x: auto;
    padding: 0.4rem 0.6rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
  }
  th {
    text-align: left;
    border-bottom: 1px solid var(--line);
  }
  th button {
    padding: 0.5rem 0.4rem;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  th button:hover,
  th[aria-sort='ascending'] button,
  th[aria-sort='descending'] button {
    color: var(--gold-hi);
  }
  .arrow {
    display: inline-block;
    width: 0.7em;
  }
  td {
    padding: 0.2rem 0.4rem;
    border-bottom: 1px solid rgba(59, 48, 36, 0.5);
    white-space: nowrap;
  }
  td:first-child {
    max-width: 18rem;
  }
  .num {
    text-align: right;
  }
  td.num {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
  }
  tr:last-child td {
    border-bottom: 0;
  }

  .end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    text-align: center;
    font-size: 0.9rem;
  }
  .end p {
    margin: 0;
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

  @media (max-width: 760px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 520px) {
    .tiles {
      grid-template-columns: 1fr 1fr;
    }
    .tile-value {
      font-size: 1.6rem;
    }
    .bars li {
      grid-template-columns: minmax(0, 6.5rem) minmax(30px, 1fr) 4.8rem;
      gap: 0.5rem;
    }
    .bars.cats li {
      grid-template-columns: minmax(0, 1fr) 2.8rem minmax(30px, 4rem) 2.6rem;
    }
    .controls,
    .search {
      width: 100% !important;
    }
    .controls select.field {
      flex: 1;
      max-width: none;
    }
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    }
    .wide {
      display: none;
    }
    td:first-child {
      white-space: normal;
    }
    .table-wrap {
      padding: 0.3rem;
    }
    .table-wrap .pick {
      gap: 0.4rem;
      padding: 0.2rem;
    }
    .table-wrap .pick img {
      width: 26px;
      height: 26px;
    }
    .table-wrap .pick > span {
      white-space: normal;
    }
    th button {
      padding: 0.5rem 0.2rem;
      letter-spacing: 0.06em;
    }
    td {
      padding: 0.2rem;
    }
  }
</style>
