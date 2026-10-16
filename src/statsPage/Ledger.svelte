<script lang="ts">
  // The ledger (stats.html): PoE2.Quest's counts from GoatCounter
  // (lib/count.ts sends them), read with the owner's key and laid out by the
  // questions they answer. Who came and from where, what they played and
  // whether they finished, how deep Delve runs go, how Today's unique goes,
  // and whether joining a room works. One row of controls on top picks the
  // days everything below counts; the figures up front compare them with
  // the same number of days before.
  import { onMount } from 'svelte';
  import { accentAt, stratumName } from '../lib/descent';
  import { readStored, writeStored } from '../lib/storage';
  import { ApiError, DASHBOARD, forgetKey, pathCounts, saveKey, savedKey, visitorsBy, type Named, type Period } from './api';
  import BarList, { type Bar } from './BarList.svelte';
  import Card from './Card.svelte';
  import KeyGate from './KeyGate.svelte';
  import {
    MODE_NAMES,
    SIZE_NAMES,
    SIZES,
    VIA_NAMES,
    WHERE_NAMES,
    daysBetween,
    deviceOf,
    ledgerOf,
    medianRange,
    percent,
    type Ledger,
  } from './model';
  import Tile from './Tile.svelte';
  import TimeChart, { longDay } from './TimeChart.svelte';

  const SPANS = [
    { days: 7, name: '7 days' },
    { days: 30, name: '30 days' },
    { days: 90, name: '90 days' },
    { days: 365, name: 'Year' },
  ] as const;

  let key = $state(savedKey());
  let refused = $state('');
  let span = $state<number>(SPANS.some((s) => s.days === Number(readStored('ledger.days'))) ? Number(readStored('ledger.days')) : 30);

  interface Read {
    now: Ledger;
    before: Ledger;
    systems: Named[];
    countries: Named[];
    refs: Named[];
    at: Date;
    span: number;
  }
  let read = $state<Read | null>(null);
  let loading = $state(false);
  let failed = $state('');

  /** A day in this browser's calendar, `back` days before today, as YYYY-MM-DD. */
  function dayBack(back: number): string {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let asked = 0;
  async function load() {
    if (!key) return;
    const ask = ++asked;
    const days = span;
    const now: Period = { from: dayBack(days - 1), to: dayBack(0) };
    const before: Period = { from: dayBack(2 * days - 1), to: dayBack(days) };
    loading = true;
    failed = '';
    try {
      const [n, b, systems, countries, refs] = await Promise.all([
        pathCounts(key, now),
        pathCounts(key, before),
        visitorsBy(key, now, 'systems'),
        visitorsBy(key, now, 'locations'),
        visitorsBy(key, now, 'toprefs'),
      ]);
      if (ask !== asked) return;
      read = {
        now: ledgerOf(n, daysBetween(now.from, now.to)),
        before: ledgerOf(b, daysBetween(before.from, before.to)),
        systems,
        countries,
        refs,
        at: new Date(),
        span: days,
      };
    } catch (err) {
      if (ask !== asked) return;
      if (err instanceof ApiError && err.kind === 'key') {
        refused = err.message;
        key = '';
        read = null;
      } else failed = err instanceof Error ? err.message : 'Something went wrong.';
    } finally {
      if (ask === asked) loading = false;
    }
  }

  onMount(() => void load());

  function pick(days: number) {
    if (days === span) return;
    span = days;
    writeStored('ledger.days', String(days));
    void load();
  }
  function useKey(k: string) {
    saveKey(k);
    key = k;
    refused = '';
    void load();
  }
  function forget() {
    forgetKey();
    key = '';
    read = null;
    refused = '';
  }

  const fmt = (n: number) => n.toLocaleString('en');
  const time = (d: Date) => d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

  // ---- what the sections show, worked out from what was read ----------------------

  const L = $derived(read?.now ?? null);
  const B = $derived(read?.before ?? null);
  const answers = $derived(L ? L.daily.right + L.daily.wrong : 0);
  const median = $derived(L ? medianRange(L.delve.ranges) : null);
  const delveBars = $derived<Bar[]>(
    L
      ? L.delve.ranges.map((r) => ({
          label: `Depth ${r.from} to ${r.from + 9}`,
          sub: stratumName(r.from / 10),
          mark: accentAt(r.from + 1),
          count: r.count,
          tag: r.from === median ? 'half end by here' : undefined,
        }))
      : [],
  );
  const countryBars = $derived<Bar[]>(read ? read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })) : []);
  const refBars = $derived<Bar[]>(
    read ? read.refs.map((r) => ({ label: !r.name || r.name === '(unknown)' ? 'Direct, or not shared' : r.name, count: r.count })) : [],
  );
  const deviceBars = $derived.by<Bar[]>(() => {
    if (!read) return [];
    const by = new Map<string, Named[]>();
    for (const s of read.systems) {
      const d = deviceOf(s.name);
      by.set(d, [...(by.get(d) ?? []), s]);
    }
    return [...by].map(([label, list]) => ({
      label,
      count: list.reduce((n, s) => n + s.count, 0),
      sub: list
        .sort((a, b) => b.count - a.count)
        .map((s) => s.name || 'Unknown')
        .join(', '),
    }));
  });
  const joinMax = $derived(L ? Math.max(1, ...L.joins.map((j) => j.tried)) : 1);
  const joinFailures = $derived<Bar[]>(L ? L.failures.filter((f) => !f.host).map((f) => ({ label: f.label, count: f.count })) : []);
  const hostFailures = $derived<Bar[]>(L ? L.failures.filter((f) => f.host).map((f) => ({ label: f.label, count: f.count })) : []);
  const anyJoins = $derived(!!L && (L.joins.some((j) => j.tried) || L.failures.length > 0 || L.links.invite > 0));
</script>

<main class="ledger">
  <header class="top">
    <a class="back" href="./">← PoE2.Quest</a>
    <h1>The Ledger</h1>
    <p class="lede">Who came, what they played, how deep they went.</p>
  </header>

  {#if !key}
    <KeyGate onkey={useKey} {refused} />
  {:else}
    <div class="controls">
      <div class="spans" role="radiogroup" aria-label="Days counted">
        {#each SPANS as s (s.days)}
          <button type="button" role="radio" aria-checked={span === s.days} onclick={() => pick(s.days)}>{s.name}</button>
        {/each}
      </div>
      <div class="status">
        {#if loading}
          <span class="reading" aria-live="polite">Reading…</span>
        {:else if read}
          <span>Read at {time(read.at)}</span>
        {/if}
        <button type="button" class="link" onclick={() => void load()} disabled={loading}>Refresh</button>
        <a class="link" href={DASHBOARD} target="_blank" rel="noreferrer">GoatCounter ↗</a>
        <button type="button" class="link" onclick={forget}>Forget key</button>
      </div>
    </div>

    {#if failed}
      <p class="failed" role="alert">{failed} <button type="button" class="link" onclick={() => void load()}>Try again</button></p>
    {/if}

    {#if !read && loading}
      <p class="first">Reading the ledger…</p>
    {:else if L && B && read}
      <div class="body" class:stale={loading}>
        <section class="tiles" aria-label="The period at a glance">
          <Tile label="Visitors" value={L.visitors.total} before={B.visitors.total} days={read.span} sub="people on the start page" trend={L.visitors.perDay} />
          <Tile
            label="Games played"
            value={L.games.started}
            before={B.games.started}
            days={read.span}
            sub={L.games.started ? `${percent(L.games.finished, L.games.started)} played to the end` : 'none yet'}
            trend={L.games.perDay}
          />
          <Tile
            label="Delve runs"
            value={L.delve.total}
            before={B.delve.total}
            days={read.span}
            sub={median !== null ? `half end by depth ${median + 9}` : 'none yet'}
          />
          <Tile
            label="Today's unique"
            value={answers}
            before={B.daily.right + B.daily.wrong}
            days={read.span}
            sub={answers ? `${percent(L.daily.right, answers)} named it` : 'no answers yet'}
            trend={L.daily.rightPerDay.map((r, i) => r + L.daily.wrongPerDay[i])}
          />
        </section>

        <div class="grid">
          <Card title="Day by day" note="Visitors to the start page, and the games started each day." wide>
            <div class="pair">
              <div>
                <h3>Visitors</h3>
                <TimeChart days={L.days} series={[{ name: 'visitors', values: L.visitors.perDay, tone: 'gold' }]} label="Visitors per day" />
              </div>
              <div>
                <h3>Games started</h3>
                <TimeChart
                  days={L.days}
                  kind="columns"
                  series={[{ name: 'games started', values: L.games.perDay, tone: 'gold' }]}
                  label="Games started per day"
                />
              </div>
            </div>
            {#snippet numbers()}
              <table>
                <thead><tr><th>Day</th><th class="n">Visitors</th><th class="n">Games</th><th class="n">Daily answers</th></tr></thead>
                <tbody>
                  {#each [...L.days.keys()].reverse() as i (i)}
                    <tr>
                      <td>{longDay(L.days[i])}</td>
                      <td class="n">{fmt(L.visitors.perDay[i])}</td>
                      <td class="n">{fmt(L.games.perDay[i])}</td>
                      <td class="n">{fmt(L.daily.rightPerDay[i] + L.daily.wrongPerDay[i])}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/snippet}
          </Card>

          <Card title="Where they come from" note="Visitors only, not game events: a country or a site counts each person once a visit." wide>
            <div class="three">
              <div>
                <h3>Countries</h3>
                <BarList bars={countryBars} />
              </div>
              <div>
                <h3>Arrived from</h3>
                <BarList bars={refBars} />
              </div>
              <div>
                <h3>Device</h3>
                <BarList bars={deviceBars} top={3} />
              </div>
            </div>
          </Card>

          <Card title="Games by mode" note="Started, played to the end, and how many played. Each game counts once, on the device that runs it." wide>
            {#if !L.games.rows.length}
              <p class="empty">No games in these days.</p>
            {:else}
              <div class="legend" aria-hidden="true">
                <span>Players</span>
                {#each SIZES as s, i (s)}<span class="swatch"><i style:background="var(--size-{i})"></i>{SIZE_NAMES[s]}</span>{/each}
              </div>
              <div class="modes">
                {#each L.games.rows as r (r.mode + r.where)}
                  {@const sized = SIZES.reduce((n, s) => n + r.sizes[s], 0)}
                  <div class="mode">
                    <div class="who"><b>{MODE_NAMES[r.mode]}</b><span>{WHERE_NAMES[r.where]}</span></div>
                    <div class="count"><b>{fmt(r.started)}</b> started</div>
                    <div class="finish">
                      <span class="meter" aria-hidden="true"><span style:width="{r.started ? Math.min(100, (100 * r.finished) / r.started) : 0}%"></span></span>
                      <span><b>{percent(r.finished, r.started)}</b> finished</span>
                    </div>
                    <div
                      class="sizes"
                      role="img"
                      aria-label="Players: {SIZES.filter((s) => r.sizes[s])
                        .map((s) => `${SIZE_NAMES[s]} ${r.sizes[s]}`)
                        .join(', ') || 'not counted'}"
                    >
                      {#each SIZES as s, i (s)}
                        {#if r.sizes[s]}
                          <span style:flex-grow={r.sizes[s]} style:background="var(--size-{i})" title="{SIZE_NAMES[s]}: {r.sizes[s]}"></span>
                        {/if}
                      {/each}
                      {#if !sized}<em>not counted</em>{/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            {#snippet numbers()}
              <table>
                <thead>
                  <tr><th>Mode</th><th class="n">Started</th><th class="n">Finished</th>{#each SIZES as s (s)}<th class="n">{SIZE_NAMES[s]}</th>{/each}</tr>
                </thead>
                <tbody>
                  {#each L.games.rows as r (r.mode + r.where)}
                    <tr>
                      <td>{MODE_NAMES[r.mode]}, {WHERE_NAMES[r.where]}</td>
                      <td class="n">{fmt(r.started)}</td>
                      <td class="n">{fmt(r.finished)}</td>
                      {#each SIZES as s (s)}<td class="n">{fmt(r.sizes[s])}</td>{/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/snippet}
          </Card>

          <Card title="Delve: where runs end" note="Each run once, by the ten depths it ended in, as players see them.">
            <BarList bars={delveBars} keep top={99} unit="runs" empty="No Delve runs ended in these days." />
          </Card>

          <Card title="Today's unique" note="Answers each day: named it in gold, missed it in grey.">
            {#if answers}
              <div class="share">
                <span class="meter big" aria-hidden="true"><span style:width="{(100 * L.daily.right) / answers}%"></span></span>
                <span><b>{percent(L.daily.right, answers)}</b> named it, {fmt(L.daily.right)} of {fmt(answers)}</span>
              </div>
              <TimeChart
                days={L.days}
                kind="columns"
                height={130}
                series={[
                  { name: 'missed it', values: L.daily.wrongPerDay, tone: 'dim' },
                  { name: 'named it', values: L.daily.rightPerDay, tone: 'gold' },
                ]}
                label="Answers to Today's unique per day, named and missed"
              />
            {:else}
              <p class="empty">Nobody answered in these days.</p>
            {/if}
            {#snippet numbers()}
              <table>
                <thead><tr><th>Day</th><th class="n">Named it</th><th class="n">Missed it</th></tr></thead>
                <tbody>
                  {#each [...L.days.keys()].reverse() as i (i)}
                    <tr><td>{longDay(L.days[i])}</td><td class="n">{fmt(L.daily.rightPerDay[i])}</td><td class="n">{fmt(L.daily.wrongPerDay[i])}</td></tr>
                  {/each}
                </tbody>
              </table>
            {/snippet}
          </Card>

          <Card title="Joining a room" note="Tries to join, by where they started, and how many got in. A shared link counts as it is opened." wide>
            {#if !anyJoins}
              <p class="empty">Nobody joined a room in these days.</p>
            {:else}
              <div class="joins">
                {#each L.joins as j (j.via)}
                  <div class="via">
                    <div class="who">{VIA_NAMES[j.via]}</div>
                    <span class="meter tried" aria-hidden="true" style:width="{(100 * j.tried) / joinMax}%"
                      ><span style:width="{j.tried ? Math.min(100, (100 * j.joined) / j.tried) : 0}%"></span></span
                    >
                    <div class="nums">
                      {#if j.tried}<b>{fmt(j.joined)}</b> of {fmt(j.tried)} got in <span class="pc">{percent(j.joined, j.tried)}</span>{:else}no tries{/if}
                    </div>
                  </div>
                {/each}
              </div>
              <p class="links">
                <b>{fmt(L.links.invite)}</b> invite links and <b>{fmt(L.links.delve)}</b> shared Delve links opened.
              </p>
              <div class="fails">
                <div>
                  <h3>Why joins failed</h3>
                  <BarList bars={joinFailures} tone="bad" empty="No failed joins." />
                </div>
                {#if hostFailures.length}
                  <div>
                    <h3>Rooms that wouldn't open</h3>
                    <BarList bars={hostFailures} tone="bad" />
                  </div>
                {/if}
              </div>
            {/if}
          </Card>
        </div>

        <footer class="notes">
          <p>
            <b>Visitors</b> are people on the start page; GoatCounter counts a person once a visit (8 hours). Ad blockers hide many of them, about a third
            by GoatCounter's own estimate, so the totals run low while the shares hold.
          </p>
          <p>
            <b>Games, links and joins</b> count every time they happen. Before the ledger went up, a game counted only once a person in 8 hours.
          </p>
        </footer>
      </div>
    {/if}
  {/if}
</main>

<style>
  .ledger {
    --plate: #13100c;
    --grid: rgba(150, 138, 119, 0.14);
    --dim: #5e5446;
    /* Party sizes, fewest to most: one gold, dark to bright (checked as an ordinal ramp). */
    --size-0: #5a4a2c;
    --size-1: #7d6333;
    --size-2: #a8853f;
    --size-3: #c9a45c;
    --size-4: #f1d99b;
    width: min(1180px, 100%);
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  .top {
    margin-bottom: 1.4rem;
  }
  .back {
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    text-decoration: none;
  }
  .back:hover {
    color: var(--gold-hi);
  }
  h1 {
    margin-top: 0.6rem;
    font-size: clamp(2rem, 7vw, 3rem);
    color: var(--gold-hi);
  }
  .lede {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-style: italic;
  }
  .controls {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1.2rem;
    margin: 0 -1.25rem 1.2rem;
    padding: 0.7rem 1.25rem;
    background: var(--pinned-bg);
    border-bottom: var(--pinned-line);
  }
  .spans {
    display: flex;
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    overflow: hidden;
  }
  .spans button {
    padding: 0.45em 0.95em;
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;
  }
  .spans button + button {
    border-left: 1px solid var(--gold-lo);
  }
  .spans button:hover {
    color: var(--gold-hi);
  }
  .spans button[aria-checked='true'] {
    color: #fff6de;
    background: #6b4718;
    cursor: default;
  }
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .link {
    padding: 0;
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
    background: none;
    border: 0;
    text-decoration: none;
    cursor: pointer;
  }
  .link:hover {
    color: var(--gold-hi);
  }
  .link:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .reading {
    color: var(--gold);
  }
  .failed {
    padding: 0.7rem 1rem;
    border-left: 2px solid var(--bad);
    background: rgba(224, 85, 63, 0.08);
  }
  .first {
    margin-top: 3rem;
    text-align: center;
    color: var(--muted);
    font-style: italic;
  }
  .body {
    transition: opacity 0.2s;
  }
  /* Reading again: what's shown stays, faded, until the new numbers are in. */
  .stale {
    opacity: 0.55;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 1rem;
    margin-bottom: 1.4rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.4rem;
  }
  h3 {
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 0.7rem;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.6rem;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.6rem;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  .meter {
    display: block;
    height: 0.6rem;
    background: rgba(125, 99, 51, 0.28);
    border-radius: 0 4px 4px 0;
    overflow: hidden;
  }
  .meter > span {
    display: block;
    height: 100%;
    background: var(--gold);
    border-radius: 0 4px 4px 0;
    transition: width 0.5s var(--ease-out);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.9rem;
    margin-bottom: 0.9rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend > span:first-child {
    font-family: var(--font-cinzel);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .swatch {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .swatch i {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
  }
  .modes {
    display: grid;
    grid-template-columns: minmax(8rem, 1.1fr) minmax(5rem, 0.6fr) minmax(8rem, 1.2fr) minmax(8rem, 1.6fr);
    gap: 0.9rem 1.4rem;
    align-items: center;
  }
  .mode {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    grid-template-areas: 'who count finish sizes';
    align-items: center;
  }
  .mode .who {
    grid-area: who;
  }
  .mode .count {
    grid-area: count;
  }
  .mode .finish {
    grid-area: finish;
  }
  .mode .sizes {
    grid-area: sizes;
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .who b {
    font-family: var(--font-display);
    color: var(--text);
    letter-spacing: 0.03em;
  }
  .who span {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .count,
  .finish span:last-child,
  .nums {
    font-size: 0.95rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .count b,
  .finish b,
  .nums b,
  .share b,
  .links b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: var(--text);
  }
  .finish {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .sizes {
    display: flex;
    gap: 2px;
    height: 0.9rem;
    border-radius: 0 4px 4px 0;
    overflow: hidden;
  }
  .sizes span {
    flex-basis: 0;
    min-width: 3px;
  }
  .sizes em {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .share {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 1.2rem;
    color: var(--muted);
  }
  .meter.big {
    height: 0.8rem;
  }
  .joins {
    display: grid;
    grid-template-columns: minmax(7rem, 10rem) minmax(4rem, 1fr) auto;
    gap: 0.7rem 1.2rem;
    align-items: center;
  }
  .via {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    grid-template-areas: 'who meter nums';
    align-items: center;
  }
  .via .who {
    grid-area: who;
  }
  .via .meter {
    grid-area: meter;
  }
  .via .nums {
    grid-area: nums;
  }
  .via .who {
    color: var(--text);
  }
  .meter.tried {
    min-width: 3px;
    height: 0.8rem;
  }
  .pc {
    display: inline-block;
    min-width: 2.8em;
    text-align: right;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
  }
  .links {
    margin: 1rem 0 1.4rem;
    color: var(--muted);
  }
  .fails {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.6rem;
  }
  .notes {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.92rem;
    color: var(--muted);
  }
  .notes p {
    margin: 0 0 0.5rem;
  }
  .notes b {
    color: var(--text);
    font-weight: 500;
  }
  @media (prefers-reduced-motion: reduce) {
    .meter > span,
    .body {
      transition: none;
    }
  }
  @media (max-width: 900px) {
    .grid,
    .three,
    .fails {
      grid-template-columns: minmax(0, 1fr);
    }
    .grid > :global(*) {
      grid-column: auto;
    }
  }
  @media (max-width: 700px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
    /* A phone: each mode a block, its name and count on a line, the finish meter and the players under them. */
    .modes {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1.3rem 1rem;
    }
    .mode {
      row-gap: 0.45rem;
      grid-template-areas:
        'who count'
        'finish finish'
        'sizes sizes';
    }
    .finish {
      flex-direction: row;
      align-items: center;
      gap: 0.7rem;
    }
    .finish .meter {
      flex: 1;
    }
    .joins {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1rem;
    }
    .via {
      row-gap: 0.35rem;
      grid-template-areas:
        'who nums'
        'meter meter';
    }
  }
  @media (max-width: 520px) {
    .ledger {
      padding: 1.4rem 16px 3rem;
    }
    .controls {
      margin: 0 -16px 1rem;
      padding: 0.6rem 16px;
    }
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.7rem;
    }
  }
</style>
