<script lang="ts">
  // The ledger (stats.html): PoE2.Quest's counts from GoatCounter
  // (lib/count.ts sends them), read with the owner's key. A ledger's ruled
  // chapters, each answering one question: how many came and played
  // (against the days before), which modes and how they go, how deep Delve
  // runs get, how Today's unique goes, whether joining a room works, and
  // where visitors come from. The days picked on top count for all of it.
  import { onMount } from 'svelte';
  import { readStored, writeStored } from '../lib/storage';
  import { ApiError, DASHBOARD, accountZone, forgetKey, pathCounts, saveKey, savedKey, visitorsBy, type Named, type Span } from './api';
  import { fmt, longDay } from './chart';
  import BarList, { type Bar } from './BarList.svelte';
  import Descent from './Descent.svelte';
  import KeyGate from './KeyGate.svelte';
  import {
    MODE_NAMES,
    SIZES,
    VIA_NAMES,
    daysBetween,
    deviceOf,
    grouped,
    ledgerOf,
    medianRange,
    modesOf,
    percent,
    pointsChange,
    type Ledger,
    type Size,
  } from './model';
  import Columns from './Columns.svelte';
  import Timeline from './Timeline.svelte';
  import { addDays, dayIn, midnight } from './zone';

  const SPANS = [
    { days: 7, name: '7 days' },
    { days: 30, name: '30 days' },
    { days: 90, name: '90 days' },
    // 52 weeks: drawn by the week, a year of whole weeks has no stub of a day at its start.
    { days: 364, name: 'Year' },
  ] as const;
  const SIZE_SHORT: Record<Size, string> = { '1p': '1', '2p': '2', '3-4p': '3–4', '5-8p': '5–8', '9-12p': '9+' };

  let key = $state(savedKey());
  let refused = $state('');
  // (A year was 365 days before it became 52 weeks.)
  const storedSpan = Number(readStored('ledger.days')) === 365 ? 364 : Number(readStored('ledger.days'));
  let span = $state<number>(SPANS.some((s) => s.days === storedSpan) ? storedSpan : 30);

  interface Read {
    now: Ledger;
    before: Ledger;
    systems: Named[];
    countries: Named[];
    refs: Named[];
    at: Date;
    /** Every path was read (count.ts never makes as many as would leave some out). */
    complete: boolean;
  }
  let read = $state<Read | null>(null);
  let loading = $state(false);
  let failed = $state('');

  let asked = 0;
  async function load() {
    if (!key) return;
    const ask = ++asked;
    const k = key;
    const days = span;
    loading = true;
    failed = '';
    try {
      // The account's time zone, GoatCounter's days are cut in: asked each time, as the owner may change it.
      const tz = await accountZone(k);
      if (ask !== asked) return;
      // From the start of the first day to now, and the period before to as
      // far into its last day as today has gone (by the clock there, whatever
      // clock change lies between): the two compare like with like.
      const at = new Date();
      const today = dayIn(tz, at);
      const from = addDays(today, -(days - 1));
      const fromBefore = addDays(from, -days);
      const lastBefore = addDays(today, -days);
      const now: Span = { start: midnight(tz, from), end: at };
      const before: Span = {
        start: midnight(tz, fromBefore),
        end: new Date(midnight(tz, lastBefore).getTime() + (at.getTime() - midnight(tz, today).getTime())),
      };
      const [n, b, systems, countries, refs] = await Promise.all([
        pathCounts(k, now),
        pathCounts(k, before),
        visitorsBy(k, now, 'systems'),
        visitorsBy(k, now, 'locations'),
        visitorsBy(k, now, 'toprefs'),
      ]);
      if (ask !== asked) return;
      read = {
        now: ledgerOf(n.paths, daysBetween(from, today)),
        before: ledgerOf(b.paths, daysBetween(fromBefore, lastBefore)),
        systems,
        countries,
        refs,
        at,
        complete: n.complete && b.complete,
      };
    } catch (err) {
      if (ask !== asked) return;
      if (err instanceof ApiError && err.kind === 'key') {
        // A key GoatCounter turns down is no use kept: the next visit asks for a new one straight away.
        forgetKey();
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
    asked++;
    key = '';
    read = null;
    refused = '';
    loading = false;
  }

  const signed = (n: number | null, unit: string) => (n === null ? '' : `${n > 0 ? '+' : ''}${n}${unit}`);

  // ---- what the chapters show ----------------------------------------------------------

  const L = $derived(read?.now ?? null);
  const B = $derived(read?.before ?? null);
  const answersPerDay = (l: Ledger) => l.daily.rightPerDay.map((r, i) => r + l.daily.wrongPerDay[i]);
  const metrics = $derived(
    L && B
      ? [
          { key: 'visitors', name: 'Visitors', now: L.visitors.perDay, before: B.visitors.perDay },
          { key: 'games', name: 'Games', now: L.games.perDay, before: B.games.perDay },
          { key: 'daily', name: 'Daily answers', now: answersPerDay(L), before: answersPerDay(B) },
        ]
      : [],
  );
  const modes = $derived(L ? modesOf(L.games.rows) : []);
  const modeMax = $derived(Math.max(1, ...modes.map((m) => m.started)));
  const finishedMove = $derived(L && B ? pointsChange(L.games.finished, L.games.started, B.games.finished, B.games.started) : null);
  const median = $derived(L ? medianRange(L.delve.ranges) : null);
  const answers = $derived(L ? L.daily.right + L.daily.wrong : 0);
  const namedMove = $derived(L && B ? pointsChange(L.daily.right, answers, B.daily.right, B.daily.right + B.daily.wrong) : null);
  const weekly = $derived(!!L && L.days.length > 90);
  const dailyRight = $derived(L ? grouped(L.days, L.daily.rightPerDay, weekly ? 7 : 1) : null);
  const dailyWrong = $derived(L ? grouped(L.days, L.daily.wrongPerDay, weekly ? 7 : 1).values : []);

  const joinTop = $derived(L ? Math.max(1, L.links.invite, ...L.joins.map((j) => j.tried)) : 1);
  const tried = $derived(L ? L.joins.reduce((n, j) => n + j.tried, 0) : 0);
  const joined = $derived(L ? L.joins.reduce((n, j) => n + j.joined, 0) : 0);
  const failures = $derived<Bar[]>(L ? L.failures.map((f) => ({ label: f.host ? `Host: ${f.label}` : f.label, count: f.count })) : []);

  const countryBars = $derived<Bar[]>(read ? read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })) : []);
  const refBars = $derived<Bar[]>(read ? read.refs.map((r) => ({ label: !r.name || r.name === '(unknown)' ? 'Direct' : r.name, count: r.count })) : []);
  const devices = $derived.by(() => {
    const by = { 'Phone or tablet': 0, Computer: 0, Other: 0 };
    for (const s of read?.systems ?? []) by[deviceOf(s.name)] += s.count;
    return { total: by['Phone or tablet'] + by.Computer + by.Other, phone: by['Phone or tablet'], computer: by.Computer, other: by.Other };
  });
</script>

<main class="ledger">
  <header class="mast">
    <div>
      <a class="back" href="./">← PoE2.Quest</a>
      <h1>The Ledger</h1>
    </div>
    {#if key}
      <div class="spans" role="radiogroup" aria-label="Days counted">
        {#each SPANS as s (s.days)}
          <button type="button" role="radio" aria-checked={span === s.days} onclick={() => pick(s.days)}>{s.name}</button>
        {/each}
      </div>
    {/if}
  </header>

  {#if !key}
    <KeyGate onkey={useKey} {refused} />
  {:else}
    <div class="status">
      <span aria-live="polite">{loading ? 'Reading…' : read ? `Read ${read.at.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      <button type="button" class="link" onclick={() => void load()} disabled={loading}>Refresh</button>
      <a class="link" href={DASHBOARD} target="_blank" rel="noreferrer">GoatCounter ↗</a>
      <button type="button" class="link" onclick={forget}>Forget key</button>
    </div>

    {#if read && !read.complete}
      <p class="failed" role="status">More paths than the ledger reads (1,000): some counts may be missing.</p>
    {/if}
    {#if failed}
      <p class="failed" role="alert">{failed} <button type="button" class="link" onclick={() => void load()}>Try again</button></p>
    {/if}

    {#if !read && loading}
      <p class="first">Reading the ledger…</p>
    {:else if L && B && read}
      <div class="body" class:stale={loading}>
        <section class="lead" aria-label="Visitors, games and daily answers">
          <Timeline days={L.days} {metrics} {weekly} />
          <details class="every">
            <summary>Every day</summary>
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
          </details>
        </section>

        <section class="chapter">
          <header>
            <span class="no">I</span>
            <h2>Modes</h2>
            {#if L.games.started}
              <p class="kicker"><b>{percent(L.games.finished, L.games.started)}</b> finished <span class="move" class:down={(finishedMove ?? 0) < 0}>{signed(finishedMove, ' pts')}</span></p>
            {/if}
          </header>
          {#if !L.games.started}
            <p class="empty">No games.</p>
          {:else}
            <div class="modes">
              {#each modes as m (m.mode)}
                {@const sized = SIZES.reduce((n, s) => n + m.sizes[s], 0)}
                {@const sizeTop = Math.max(1, ...SIZES.map((s) => m.sizes[s]))}
                <article class="mode" class:none={!m.started}>
                  <h3>{MODE_NAMES[m.mode]}</h3>
                  <div class="big">{fmt(m.started)}</div>
                  <div class="share" aria-hidden="true"><span style:width="{(100 * m.started) / modeMax}%"></span></div>
                  <p class="of">{percent(m.started, L.games.started)} of games</p>
                  {#if m.started}
                    <dl>
                      <dt>Finished</dt>
                      <dd class="meter-row">
                        <span class="meter" aria-hidden="true"><span style:width="{Math.min(100, (100 * m.finished) / m.started)}%"></span></span>
                        <b>{percent(m.finished, m.started)}</b>
                      </dd>
                      <dt>Played</dt>
                      <dd>
                        <span class="split" aria-hidden="true">
                          {#if m.online}<span class="on" style:flex-grow={m.online}></span>{/if}
                          {#if m.hotseat}<span class="hs" style:flex-grow={m.hotseat}></span>{/if}
                        </span>
                        <span class="split-names">
                          {#if m.online}<span><i class="on"></i>Online {fmt(m.online)}</span>{/if}
                          {#if m.hotseat}<span><i class="hs"></i>Hot-seat {fmt(m.hotseat)}</span>{/if}
                        </span>
                      </dd>
                      <dt>Players</dt>
                      <dd>
                        {#if sized}
                          <ol class="sizes">
                            {#each SIZES as s (s)}
                              <li title="{SIZE_SHORT[s]} players: {m.sizes[s]}">
                                <span class="col" class:zero={!m.sizes[s]} style:height="{(100 * m.sizes[s]) / sizeTop}%"></span>
                                <span class="n">{SIZE_SHORT[s]}</span>
                                <span class="sr">players: {m.sizes[s]} games</span>
                              </li>
                            {/each}
                          </ol>
                        {:else}
                          <span class="muted">not counted</span>
                        {/if}
                      </dd>
                    </dl>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <div class="pair">
          <section class="chapter">
            <header>
              <span class="no">II</span>
              <h2>Delve</h2>
              {#if median !== null}<p class="kicker">half end by <b>{median + 9}</b></p>{/if}
            </header>
            <Descent ranges={L.delve.ranges} />
            {#if L.delve.total}<p class="foot">{fmt(L.delve.total)} runs. Bar: the share that got this deep.</p>{/if}
          </section>

          <section class="chapter">
            <header>
              <span class="no">III</span>
              <h2>Today's unique</h2>
              {#if answers}<p class="kicker"><b>{percent(L.daily.right, answers)}</b> named it <span class="move" class:down={(namedMove ?? 0) < 0}>{signed(namedMove, ' pts')}</span></p>{/if}
            </header>
            {#if answers && dailyRight}
              <p class="lede-line"><b>{fmt(L.daily.right)}</b> of {fmt(answers)} answers right.</p>
              <Columns
                days={dailyRight.days}
                {weekly}
                height={150}
                series={[
                  { name: 'missed', values: dailyWrong, tone: 'dim' },
                  { name: 'named it', values: dailyRight.values, tone: 'gold' },
                ]}
                label="Answers to Today's unique per {weekly ? 'week' : 'day'}, named and missed"
              />
              <div class="legend" aria-hidden="true"><span><i class="sw gold"></i>Named it</span><span><i class="sw dim"></i>Missed</span></div>
            {:else}
              <p class="empty">No answers.</p>
            {/if}
          </section>
        </div>

        <div class="pair wide-left">
          <section class="chapter">
            <header>
              <span class="no">IV</span>
              <h2>Joining</h2>
              {#if tried}<p class="kicker"><b>{percent(joined, tried)}</b> get in</p>{/if}
            </header>
            {#if !tried && !L.links.invite && !L.failures.length}
              <p class="empty">Nobody joined a room.</p>
            {:else}
              <div class="flows">
                {#each L.joins as j (j.via)}
                  {@const opened = j.via === 'invite-link' ? L.links.invite : 0}
                  <div class="flow">
                    <span class="via">{VIA_NAMES[j.via]}</span>
                    <span class="nest" aria-hidden="true">
                      {#if opened}<span class="opened" style:width="{(100 * opened) / joinTop}%"></span>{/if}
                      <span class="tried" style:width="{(100 * j.tried) / joinTop}%"></span>
                      <span class="joined" style:width="{(100 * j.joined) / joinTop}%"></span>
                    </span>
                    <span class="got">
                      {#if j.tried}<b>{fmt(j.joined)}</b> of {fmt(j.tried)} <em>{percent(j.joined, j.tried)}</em>{:else}<span class="muted">none</span>{/if}
                    </span>
                  </div>
                {/each}
              </div>
              <div class="legend" aria-hidden="true">
                <span><i class="sw gold"></i>Got in</span><span><i class="sw lo"></i>Tried</span><span><i class="sw dim"></i>Invite opened</span>
              </div>
              <p class="foot">{fmt(L.links.invite)} invite links, {fmt(L.links.delve)} Delve links opened.</p>
              {#if failures.length}
                <h3 class="sub">Failed</h3>
                <BarList bars={failures} tone="bad" top={6} />
              {/if}
            {/if}
          </section>

          <section class="chapter">
            <header>
              <span class="no">V</span>
              <h2>Arrivals</h2>
              {#if devices.total}<p class="kicker"><b>{percent(devices.phone, devices.total)}</b> on phones</p>{/if}
            </header>
            {#if devices.total}
              <div class="devices" aria-hidden="true">
                <span class="pc" style:flex-grow={devices.computer}></span>
                <span class="ph" style:flex-grow={devices.phone}></span>
                {#if devices.other}<span class="ot" style:flex-grow={devices.other}></span>{/if}
              </div>
              <div class="legend">
                <span><i class="sw gold"></i>Computer {percent(devices.computer, devices.total)}</span>
                <span><i class="sw hi"></i>Phone or tablet {percent(devices.phone, devices.total)}</span>
                {#if devices.other}<span><i class="sw dim"></i>Other {percent(devices.other, devices.total)}</span>{/if}
              </div>
            {/if}
            <h3 class="sub">Countries</h3>
            <BarList bars={countryBars} top={6} empty="None counted." />
            <h3 class="sub">From</h3>
            <BarList bars={refBars} top={5} empty="None counted." />
          </section>
        </div>

        <footer class="notes">
          <p>Visitors: people on the start page, once a visit. Ad blockers hide about a third, so totals run low; shares hold.</p>
          <p>Games, links and joins count every time. Before the ledger, a game counted once a person in 8 hours.</p>
        </footer>
      </div>
    {/if}
  {/if}
</main>

<style>
  .ledger {
    --plate: #0a0908;
    --grid: rgba(150, 138, 119, 0.13);
    --dim: #5e5446;
    --ghost: #6f6556;
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 1.6rem 1.5rem 4rem;
  }
  .mast {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem 2rem;
    padding-bottom: 1.1rem;
    border-bottom: 1px solid var(--gold-lo);
  }
  .back {
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
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
    margin-top: 0.4rem;
    font-size: clamp(2.2rem, 7vw, 3.4rem);
    line-height: 1;
    color: var(--gold-hi);
  }
  .spans {
    display: flex;
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    overflow: hidden;
  }
  .spans button {
    padding: 0.5em 1em;
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s;
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
    justify-content: flex-end;
    align-items: center;
    gap: 0.3rem 1.1rem;
    margin: 0.6rem 0 2rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .link {
    padding: 0;
    font-family: var(--font-cinzel);
    font-size: 0.68rem;
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
    opacity: 0.5;
  }

  /* ---- the lead ---- */
  .lead {
    margin-bottom: 3.2rem;
  }
  .every {
    margin-top: 0.8rem;
  }
  .every summary {
    width: max-content;
    font-family: var(--font-cinzel);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
    cursor: pointer;
  }
  .every summary:hover {
    color: var(--gold-hi);
  }
  .every table {
    width: 100%;
    max-width: 34rem;
    margin-top: 0.6rem;
    border-collapse: collapse;
    font-size: 0.92rem;
  }
  .every th {
    padding: 0.3rem 0.5rem;
    font-family: var(--font-cinzel);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: left;
    color: var(--muted);
    border-bottom: 1px solid var(--line);
  }
  .every td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid rgba(59, 48, 36, 0.5);
  }
  .every .n {
    text-align: right;
    font-family: var(--font-cinzel);
    font-variant-numeric: tabular-nums;
  }

  /* ---- chapters: ruled and numbered, their answer set beside the title ---- */
  .chapter {
    min-width: 0;
    margin-bottom: 3.2rem;
  }
  .chapter > header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.8rem;
    padding-top: 0.9rem;
    margin-bottom: 1.3rem;
    border-top: 1px solid var(--gold-lo);
  }
  .no {
    min-width: 1.6rem;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--gold-lo);
  }
  h2 {
    font-size: 1.5rem;
    color: var(--gold-hi);
  }
  .kicker {
    margin: 0 0 0 auto;
    font-size: 1rem;
    color: var(--muted);
  }
  .kicker b {
    font-family: var(--font-cinzel);
    font-size: 1.35rem;
    color: var(--text);
  }
  .move {
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--gold);
  }
  .move.down {
    color: #e88a73;
  }
  .empty,
  .muted {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  .foot {
    margin: 0.9rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .sub {
    margin: 1.4rem 0 0.7rem;
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 3rem;
  }
  .pair.wide-left {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.1rem;
    margin-top: 0.6rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .sw {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
  }
  .sw.gold {
    background: var(--gold);
  }
  .sw.hi {
    background: var(--gold-hi);
  }
  .sw.lo {
    background: var(--gold-lo);
  }
  .sw.dim {
    background: var(--dim);
  }
  .meter {
    display: block;
    height: 0.5rem;
    background: rgba(125, 99, 51, 0.3);
    border-radius: 0 3px 3px 0;
    overflow: hidden;
  }
  .meter > span {
    display: block;
    height: 100%;
    background: var(--gold);
    border-radius: 0 3px 3px 0;
    transition: width 0.5s var(--ease-out);
  }

  /* ---- I. modes, side by side ---- */
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2.4rem;
  }
  .mode h3 {
    font-family: var(--font-display);
    font-size: 1.15rem;
    letter-spacing: 0.04em;
    color: var(--text);
  }
  .mode .big {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 2.6rem;
    line-height: 1.1;
    color: var(--gold-hi);
  }
  .mode.none .big,
  .mode.none h3 {
    color: var(--muted);
  }
  .share {
    height: 3px;
    margin: 0.3rem 0 0.25rem;
    background: rgba(125, 99, 51, 0.25);
  }
  .share span {
    display: block;
    height: 100%;
    background: var(--gold);
  }
  .of {
    margin: 0;
    font-size: 0.88rem;
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: 4.6rem minmax(0, 1fr);
    gap: 0.9rem 0.7rem;
    align-items: center;
    margin: 1.2rem 0 0;
  }
  dt {
    font-family: var(--font-cinzel);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .meter-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .meter-row .meter {
    flex: 1;
  }
  .meter-row b {
    min-width: 2.8em;
    font-family: var(--font-cinzel);
    font-size: 0.95rem;
    text-align: right;
  }
  .split {
    display: flex;
    gap: 2px;
    height: 0.5rem;
  }
  .split span {
    flex-basis: 0;
    min-width: 2px;
  }
  .on {
    background: var(--gold);
  }
  .hs {
    background: var(--dim);
  }
  .split-names {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.8rem;
    margin-top: 0.3rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .split-names span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .split-names i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 1px;
  }
  .sizes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    height: 3.4rem;
  }
  .sizes li {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 0.2rem;
    min-height: 0;
  }
  .sizes .col {
    width: min(100%, 1.4rem);
    min-height: 2px;
    background: var(--gold);
    border-radius: 3px 3px 0 0;
  }
  .sizes .col.zero {
    background: var(--line);
  }
  .sizes .n {
    font-family: var(--font-cinzel);
    font-size: 0.62rem;
    color: var(--muted);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* ---- III. today's unique ---- */
  .lede-line {
    margin: 0 0 1rem;
    color: var(--muted);
  }
  .lede-line b {
    font-family: var(--font-cinzel);
    color: var(--text);
  }

  /* ---- IV. joining: each way in a nest of bars, invite opened > tried > got in ---- */
  .flows {
    display: grid;
    grid-template-columns: minmax(0, 8.5rem) minmax(3rem, 1fr) auto;
    gap: 0.9rem 1rem;
    align-items: center;
  }
  .flow {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    grid-template-areas: 'via nest got';
    align-items: center;
  }
  .via {
    grid-area: via;
    font-size: 0.98rem;
  }
  .nest {
    grid-area: nest;
    position: relative;
    display: block;
    height: 1.1rem;
  }
  .nest > span {
    position: absolute;
    left: 0;
    min-width: 2px;
    border-radius: 0 3px 3px 0;
  }
  .opened {
    top: 0;
    bottom: 0;
    background: var(--dim);
  }
  .tried {
    top: 0.15rem;
    bottom: 0.15rem;
    background: var(--gold-lo);
  }
  .joined {
    top: 0.3rem;
    bottom: 0.3rem;
    background: var(--gold);
  }
  .got {
    grid-area: got;
    white-space: nowrap;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .got b {
    font-family: var(--font-cinzel);
    color: var(--text);
  }
  .got em {
    display: inline-block;
    min-width: 2.7em;
    margin-left: 0.4rem;
    text-align: right;
    font-style: normal;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    color: var(--gold);
  }

  /* ---- V. arrivals ---- */
  .devices {
    display: flex;
    gap: 2px;
    height: 0.9rem;
  }
  .devices span {
    flex-basis: 0;
    min-width: 2px;
  }
  .devices .pc {
    background: var(--gold);
  }
  .devices .ph {
    background: var(--gold-hi);
  }
  .devices .ot {
    background: var(--dim);
  }

  .notes {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .notes p {
    margin: 0 0 0.3rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .meter > span,
    .body {
      transition: none;
    }
  }
  @media (max-width: 900px) {
    .pair,
    .pair.wide-left {
      grid-template-columns: minmax(0, 1fr);
    }
    .modes {
      grid-template-columns: minmax(0, 1fr);
      gap: 2rem;
    }
    /* One mode a row: its name, count and share on the left, the rest beside them. */
    .mode {
      display: grid;
      grid-template-columns: minmax(0, 8rem) minmax(0, 1fr);
      column-gap: 1.6rem;
      align-items: start;
    }
    .mode > :not(dl) {
      grid-column: 1;
    }
    .mode dl {
      grid-column: 2;
      grid-row: 1 / span 4;
      margin: 0.2rem 0 0;
    }
  }
  @media (max-width: 520px) {
    .ledger {
      padding: 1.2rem 16px 3rem;
    }
    .spans {
      width: 100%;
    }
    .spans button {
      flex: 1;
      padding: 0.6em 0.3em;
    }
    .status {
      justify-content: flex-start;
      margin-bottom: 1.6rem;
    }
    .mode {
      grid-template-columns: minmax(0, 1fr);
    }
    .mode dl {
      grid-column: 1;
      grid-row: auto;
      margin-top: 1rem;
    }
    .flows {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1rem 0.8rem;
    }
    .flow {
      row-gap: 0.35rem;
      grid-template-areas:
        'via got'
        'nest nest';
    }
    .kicker {
      flex-basis: 100%;
      margin-left: 2.4rem;
    }
  }
</style>
