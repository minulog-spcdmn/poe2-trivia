<script lang="ts">
  // The ledger (stats.html): PoE2.Quest's counts from GoatCounter
  // (lib/count.ts sends them), read with the owner's key. The game's top bar
  // holds the range, the refresh and how fresh the numbers are, with a thin
  // bar along its foot while they're read. Below, on one grid: the headline
  // figures, activity over the range against the range before, then a panel
  // a question: modes, Delve, Today's unique, joining, arrivals.
  //
  // Each range read is kept (this tab, and through a reload), so switching
  // back shows it at once; it is read again once it's 5 minutes old, by
  // itself while the page is in view, as long as the hour's requests stay
  // well under GoatCounter's 500 (api.ts requestsLastHour).
  import { onMount } from 'svelte';
  import { readStored, removeStoredStarting, writeStored } from '../lib/storage';
  import Activity, { METRIC_NAMES, type DayRows, type MetricKey } from './Activity.svelte';
  import { ApiError, Cancelled, DASHBOARD, HOUR_LIMIT, accountZone, forgetKey, pathCounts, requestsLastHour, saveKey, savedKey, visitorsBy, type Named, type Span } from './api';
  import BarList, { type Bar } from './BarList.svelte';
  import { fmt, shortDay } from './chart';
  import Columns from './Columns.svelte';
  import KeyGate from './KeyGate.svelte';
  import Kpi from './Kpi.svelte';
  import { VIA_NAMES, change, daysBetween, deviceOf, grouped, ledgerOf, modesOf, percent, pointsChange, sharePerDay, type Ledger } from './model';
  import ModesTable from './ModesTable.svelte';
  import Panel from './Panel.svelte';
  import Reach from './Reach.svelte';
  import Segmented from './Segmented.svelte';
  import { addDays, dayIn, midnight } from './zone';

  const SPANS = [
    { value: 7, name: '7 days' },
    { value: 30, name: '30 days' },
    { value: 90, name: '90 days' },
    // 52 weeks: drawn by the week, a year of whole weeks has no stub of a day at its start.
    { value: 364, name: 'Year' },
  ] as const;
  /** A range is read again once it's this old. */
  const FRESH_MS = 5 * 60_000;
  /** Updating by itself stops while the hour's requests are within this of GoatCounter's limit, leaving room to click about. */
  const KEEP_SPARE = 150;
  /** The account's time zone is asked again after this. */
  const ZONE_MS = 60 * 60_000;

  interface Read {
    span: number;
    from: string;
    to: string;
    fromBefore: string;
    toBefore: string;
    now: Ledger;
    before: Ledger;
    systems: Named[];
    countries: Named[];
    refs: Named[];
    at: number;
    complete: boolean;
  }

  let key = $state(savedKey());
  let refused = $state('');
  // (A year was 365 days before it became 52 weeks.)
  const stored = Number(readStored('ledger.days')) === 365 ? 364 : Number(readStored('ledger.days'));
  const firstSpan = SPANS.some((s) => s.value === stored) ? stored : 30;
  let span = $state<number>(firstSpan);
  let metric = $state<MetricKey>('visitors');
  let view = $state<'chart' | 'table'>('chart');

  const cache = new Map<number, Read>();
  const cached = (days: number): Read | null => {
    const had = cache.get(days);
    if (had) return had;
    try {
      const r = JSON.parse(readStored(`ledger.read.${days}`, 'session') ?? 'null') as Read | null;
      if (r?.span === days) cache.set(days, r);
      return r?.span === days ? r : null;
    } catch {
      return null;
    }
  };
  const keep = (r: Read) => {
    cache.set(r.span, r);
    writeStored(`ledger.read.${r.span}`, JSON.stringify(r), 'session');
  };

  let read = $state<Read | null>(cached(firstSpan));
  let loading = $state(false);
  let progress = $state(0);
  let failed = $state('');
  let held = $state(false);
  let clock = $state(Date.now());
  let zone: { key: string; zone: string; at: number } | null = null;
  /** Reads that failed in a row, and when the last did: updating by itself waits longer after each (2, 4, 8… minutes, 10 at least after GoatCounter said it was busy). */
  let fails = { n: 0, at: 0, busy: false };
  const waitAfterFails = () => (fails.n ? Math.max(fails.busy ? 10 : 0, Math.min(30, 2 ** fails.n)) * 60_000 : 0);

  let asked = 0;
  /** The read under way, given up (its calls not yet sent never go) when another takes its place. */
  let reading: AbortController | null = null;
  function stopReading() {
    reading?.abort();
    reading = null;
    asked++;
    loading = false;
  }
  /** Reads `days` (the range on show): `force` reads it even while fresh, and asks the time zone again. */
  async function load(days = span, force = false) {
    if (!key) return;
    const had = cached(days);
    if (had && !force && Date.now() - had.at < FRESH_MS) {
      stopReading();
      failed = '';
      read = had;
      return;
    }
    if (had) read = had;
    stopReading();
    const ask = asked;
    const signal = (reading = new AbortController()).signal;
    const k = key;
    loading = true;
    failed = '';
    progress = 0;
    const steps = 6;
    let done = 0;
    const step = <T,>(p: Promise<T>) =>
      p.then((v) => {
        if (ask === asked) progress = ++done / steps;
        return v;
      });
    try {
      if (force || zone?.key !== k || Date.now() - zone.at > ZONE_MS) zone = { key: k, zone: await step(accountZone(k, signal)), at: Date.now() };
      else progress = ++done / steps;
      if (ask !== asked) return;
      const tz = zone.zone;
      // From the start of the first day to now, and the range before to as
      // far into its last day as today has gone (by the clock there): the two
      // compare like with like.
      const at = new Date();
      const today = dayIn(tz, at);
      const from = addDays(today, -(days - 1));
      const fromBefore = addDays(from, -days);
      const toBefore = addDays(today, -days);
      const now: Span = { start: midnight(tz, from), end: at };
      const before: Span = { start: midnight(tz, fromBefore), end: new Date(midnight(tz, toBefore).getTime() + (at.getTime() - midnight(tz, today).getTime())) };
      const [n, b, systems, countries, refs] = await Promise.all([
        step(pathCounts(k, now, signal)),
        step(pathCounts(k, before, signal)),
        step(visitorsBy(k, now, 'systems', signal)),
        step(visitorsBy(k, now, 'locations', signal)),
        step(visitorsBy(k, now, 'toprefs', signal)),
      ]);
      if (ask !== asked) return;
      const r: Read = {
        span: days,
        from,
        to: today,
        fromBefore,
        toBefore,
        now: ledgerOf(n.paths, daysBetween(from, today)),
        before: ledgerOf(b.paths, daysBetween(fromBefore, toBefore)),
        systems,
        countries,
        refs,
        at: at.getTime(),
        complete: n.complete && b.complete,
      };
      keep(r);
      fails = { n: 0, at: 0, busy: false };
      if (days === span) read = r;
    } catch (err) {
      if (ask !== asked || err instanceof Cancelled) return;
      fails = { n: fails.n + 1, at: Date.now(), busy: err instanceof ApiError && err.kind === 'busy' };
      if (err instanceof ApiError && err.kind === 'key') {
        // A key GoatCounter turns down is no use kept: the next visit asks for a new one straight away.
        forget();
        refused = err.message;
      } else failed = err instanceof Error ? err.message : 'Something went wrong.';
    } finally {
      if (ask === asked) {
        loading = false;
        reading = null;
      }
    }
  }

  /** Reads the range on show again if it's grown stale, unless the hour's requests are running low. */
  function update() {
    clock = Date.now();
    held = requestsLastHour().length > HOUR_LIMIT - KEEP_SPARE;
    if (!key || loading || held || document.visibilityState !== 'visible') return;
    // After a failure, not again until the wait is over (the Refresh button still reads at once).
    if (fails.n && clock - fails.at < waitAfterFails()) return;
    if (!read || clock - read.at >= FRESH_MS) void load();
  }

  onMount(() => {
    void load();
    const tick = setInterval(update, 20_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', update);
    };
  });

  function pick(days: number) {
    span = days;
    writeStored('ledger.days', String(days));
    read = cached(days);
    void load(days);
  }
  function useKey(k: string) {
    saveKey(k);
    key = k;
    refused = '';
    void load(span, true);
  }
  function forget() {
    stopReading();
    forgetKey();
    removeStoredStarting('ledger.read.', 'session');
    cache.clear();
    zone = null;
    fails = { n: 0, at: 0, busy: false };
    key = '';
    read = null;
    refused = '';
    failed = '';
  }

  const ago = (t: number) => {
    const m = Math.floor((clock - t) / 60_000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
  };

  // ---- what the panels show ----------------------------------------------------------

  let innerHeight = $state(900);
  /** The activity chart grows with a tall window (a monitor on its side), so the whole ledger fills it. */
  const chartH = $derived(Math.round(Math.min(480, Math.max(240, innerHeight * 0.16))));
  /** Today's unique's chart takes the height its panel has left beside Delve's. */
  let dailyBox = $state(0);

  const L = $derived(read?.now ?? null);
  const B = $derived(read?.before ?? null);
  const rowsOf = (l: Ledger): DayRows => ({
    days: l.days,
    visitors: l.visitors.perDay,
    games: l.games.perDay,
    answers: l.daily.rightPerDay.map((r, i) => r + l.daily.wrongPerDay[i]),
    named: l.daily.rightPerDay,
  });
  const weekly = $derived(!!L && L.days.length > 90);
  const answers = (l: Ledger) => l.daily.right + l.daily.wrong;
  const modes = $derived(L ? modesOf(L.games.rows) : []);
  const dailyRight = $derived(L ? grouped(L.days, L.daily.rightPerDay, weekly ? 7 : 1) : null);
  const dailyWrong = $derived(L ? grouped(L.days, L.daily.wrongPerDay, weekly ? 7 : 1).values : []);
  const tried = $derived(L ? L.joins.reduce((n, j) => n + j.tried, 0) : 0);
  const joined = $derived(L ? L.joins.reduce((n, j) => n + j.joined, 0) : 0);
  const failures = $derived<Bar[]>(L ? L.failures.map((f) => ({ label: f.host ? `Host: ${f.label}` : f.label, count: f.count })) : []);
  const countryBars = $derived<Bar[]>(read ? read.countries.map((c) => ({ label: c.name || 'Unknown', count: c.count })) : []);
  const refBars = $derived<Bar[]>(read ? read.refs.map((r) => ({ label: !r.name || r.name === '(unknown)' ? 'Direct or unknown' : r.name, count: r.count })) : []);
  const systemBars = $derived<Bar[]>(read ? read.systems.map((s) => ({ label: s.name || 'Unknown', count: s.count })) : []);
  const devices = $derived.by(() => {
    const by = { phone: 0, computer: 0, other: 0 };
    for (const s of read?.systems ?? []) {
      const d = deviceOf(s.name);
      by[d === 'Phone or tablet' ? 'phone' : d === 'Computer' ? 'computer' : 'other'] += s.count;
    }
    return { ...by, total: by.phone + by.computer + by.other };
  });
  const range = (from: string, to: string) => `${shortDay(from)} – ${shortDay(to)}`;
</script>

<svelte:window bind:innerHeight />

<header class="bar">
  <a class="brand" href="./" title="Back to the game">
    <svg class="mark" viewBox="20 0 400 391" aria-hidden="true"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" fill="currentColor" /></svg>
    <span>PoE2.Quest</span><small>Ledger</small>
  </a>
  {#if key}
    <div class="spans"><Segmented label="Days counted" options={SPANS} value={span} onpick={pick} /></div>
    <div class="tools">
      <span class="fresh" aria-live="polite">
        {#if loading}Reading…{:else if read}Updated {ago(read.at)}{/if}
        {#if held && !loading}<em title="Paused to stay under GoatCounter's 500 requests an hour">· paused</em>{/if}
      </span>
      <button type="button" class="icon-btn" class:spin={loading} onclick={() => void load(span, true)} disabled={loading} title="Read again" aria-label="Read again">
        <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg>
      </button>
      <a class="icon-btn" href={DASHBOARD} target="_blank" rel="noreferrer" title="GoatCounter's dashboard" aria-label="GoatCounter's dashboard">
        <svg viewBox="0 0 24 24"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
      </a>
      <button type="button" class="icon-btn" onclick={forget} title="Forget the key on this browser" aria-label="Forget the key on this browser">
        <svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M17 6l3 3" /><path d="M15 8l2 2" /></svg>
      </button>
    </div>
  {/if}
  <div class="progress" class:on={loading} aria-hidden="true"><i style:width="{Math.max(6, progress * 100)}%"></i></div>
</header>

<main class="ledger">
  {#if !key}
    <KeyGate onkey={useKey} {refused} />
  {:else}
    <div class="head">
      <h1>Ledger</h1>
      {#if read}
        <p>{range(read.from, read.to)} <span>against</span> {range(read.fromBefore, read.toBefore)}</p>
      {/if}
    </div>

    {#if failed}
      <p class="note bad" role="alert">{failed} <button type="button" class="again" onclick={() => void load(span, true)}>Try again</button></p>
    {/if}
    {#if read && !read.complete}
      <p class="note" role="status">More paths than the ledger reads (1,000): some counts may be missing.</p>
    {/if}

    {#if !read && loading}
      <div class="grid skeleton" aria-busy="true" aria-label="Reading">
        {#each [3, 3, 3, 3, 12, 12, 6, 6, 12, 12] as s, i (i)}<div class="ghost-panel" style:--span={s} class:tall={s === 12}></div>{/each}
      </div>
    {:else if L && B}
      <div class="grid" class:stale={loading}>
        <div class="kpis">
          <Kpi label="Visitors" value={L.visitors.total} delta={change(L.visitors.total, B.visitors.total)} sub="people on the start page" trend={L.visitors.perDay} />
          <Kpi label="Games played" value={L.games.started} delta={change(L.games.started, B.games.started)} sub="{fmt(L.games.finished)} finished" trend={L.games.perDay} />
          <Kpi
            label="Played to the end"
            value={L.games.started ? Math.round((100 * L.games.finished) / L.games.started) : null}
            unit="%"
            delta={pointsChange(L.games.finished, L.games.started, B.games.finished, B.games.started)}
            deltaUnit=" pts"
            sub="of games started"
            trend={sharePerDay(L.games.finishedPerDay, L.games.perDay)}
          />
          <Kpi
            label="Today's unique"
            value={answers(L) ? Math.round((100 * L.daily.right) / answers(L)) : null}
            unit="%"
            delta={pointsChange(L.daily.right, answers(L), B.daily.right, answers(B))}
            deltaUnit=" pts"
            sub="named it, of {fmt(answers(L))} answers"
            trend={sharePerDay(L.daily.rightPerDay, rowsOf(L).answers)}
          />
        </div>

        <Panel title="Activity" sub="{METRIC_NAMES[metric]} {weekly ? 'per week' : 'per day'}, against the range before">
          {#snippet aside()}
            <Segmented
              small
              label="Drawn"
              options={[
                { value: 'visitors', name: 'Visitors' },
                { value: 'games', name: 'Games' },
                { value: 'answers', name: 'Daily answers' },
              ]}
              value={metric}
              onpick={(v) => (metric = v as MetricKey)}
            />
            <Segmented
              small
              label="Shown as"
              options={[
                { value: 'chart', name: 'Chart' },
                { value: 'table', name: 'Table' },
              ]}
              value={view}
              onpick={(v) => (view = v as 'chart' | 'table')}
            />
          {/snippet}
          <Activity now={rowsOf(L)} before={rowsOf(B)} {metric} {view} {weekly} height={chartH} />
        </Panel>

        <Panel title="Modes" sub="Each game counted once, on the device that runs it">
          {#snippet aside()}<span class="answer"><b>{fmt(L.games.started)}</b> games</span>{/snippet}
          {#if L.games.started}
            <ModesTable {modes} total={L.games.started} />
          {:else}
            <p class="empty">No games in these days.</p>
          {/if}
        </Panel>

        <Panel title="Delve" sub="How deep runs get, by the zone they reach" span={6}>
          {#snippet aside()}<span class="answer"><b>{fmt(L.delve.total)}</b> runs</span>{/snippet}
          <Reach ranges={L.delve.ranges} />
        </Panel>

        <Panel title="Today's unique" sub="Answers {weekly ? 'per week' : 'per day'}" span={6}>
          {#snippet aside()}
            {#if answers(L)}<span class="answer"><b>{percent(L.daily.right, answers(L))}</b> named it</span>{/if}
          {/snippet}
          {#if answers(L) && dailyRight}
            <div class="fill" bind:clientHeight={dailyBox}>
              <div class="fill-in">
              <Columns
                days={dailyRight.days}
                {weekly}
                height={Math.max(150, dailyBox)}
              series={[
                { name: 'missed', values: dailyWrong, tone: 'dim' },
                { name: 'named it', values: dailyRight.values, tone: 'gold' },
              ]}
                label="Answers to Today's unique per {weekly ? 'week' : 'day'}, named and missed"
              />
              </div>
            </div>
            <div class="legend" aria-hidden="true"><span><i class="sw gold"></i>Named it</span><span><i class="sw dim"></i>Missed</span></div>
          {:else}
            <p class="empty">No answers in these days.</p>
          {/if}
        </Panel>

        <Panel title="Joining a room" sub="Tries to join, by where they started">
          {#snippet aside()}
            {#if tried}<span class="answer"><b>{percent(joined, tried)}</b> got in</span>{/if}
          {/snippet}
          {#if !tried && !L.links.invite && !failures.length}
            <p class="empty">Nobody joined a room in these days.</p>
          {:else}
            <div class="join-cols">
            <div>
            <div class="joins" role="table" aria-label="Joins by where they started">
              <div class="jrow head" role="row">
                <span role="columnheader">From</span>
                <span role="columnheader" class="n">Tried</span>
                <span role="columnheader" class="n">Got in</span>
                <span role="columnheader">Success</span>
              </div>
              {#each L.joins as j (j.via)}
                <div class="jrow" role="row">
                  <span role="rowheader">{VIA_NAMES[j.via]}</span>
                  <span class="n" role="cell">{fmt(j.tried)}</span>
                  <span class="n" role="cell">{fmt(j.joined)}</span>
                  <span class="rate" role="cell">
                    {#if j.tried}
                      <span class="meter"><i style:width="{Math.min(100, (100 * j.joined) / j.tried)}%"></i></span><b>{percent(j.joined, j.tried)}</b>
                    {:else}<span class="dash">–</span>{/if}
                  </span>
                </div>
              {/each}
            </div>
            <div class="chips">
              <span><b>{fmt(L.links.invite)}</b> invite links opened</span>
              <span><b>{fmt(L.links.delve)}</b> Delve links opened</span>
            </div>
            </div>
            <div>
              <h3>Why joins failed</h3>
              <BarList bars={failures} tone="bad" top={6} empty="No joins failed." />
            </div>
            </div>
          {/if}
        </Panel>

        <Panel title="Arrivals" sub="Visitors to the start page (not game events)">
          {#snippet aside()}
            {#if devices.total}<span class="answer"><b>{percent(devices.phone, devices.total)}</b> on phones</span>{/if}
          {/snippet}
          <div class="three">
            <div>
              <h3>Countries</h3>
              <BarList bars={countryBars} top={8} />
            </div>
            <div>
              <h3>From</h3>
              <BarList bars={refBars} top={8} />
            </div>
            <div>
              <h3>Devices</h3>
              {#if devices.total}
                <div class="devices" aria-hidden="true">
                  <i class="pc" style:flex-grow={devices.computer}></i><i class="ph" style:flex-grow={devices.phone}></i>{#if devices.other}<i class="ot" style:flex-grow={devices.other}></i>{/if}
                </div>
                <div class="legend dev">
                  <span><i class="sw gold"></i>Computer {percent(devices.computer, devices.total)}</span>
                  <span><i class="sw hi"></i>Phone or tablet {percent(devices.phone, devices.total)}</span>
                  {#if devices.other}<span><i class="sw dim"></i>Other {percent(devices.other, devices.total)}</span>{/if}
                </div>
              {/if}
              <BarList bars={systemBars} top={6} />
            </div>
          </div>
        </Panel>
      </div>

      <footer class="notes">
        <p>Visitors are people on the start page, once a visit (8 hours). Ad blockers hide about a third of them, so totals run low while shares hold.</p>
        <p>Games, links and joins count every time they happen; before the ledger went up, a game counted once a person in 8 hours.</p>
      </footer>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    --plate: #13100c;
    --grid: rgba(150, 138, 119, 0.12);
    --dim: #5e5446;
    --ghost: #75695a;
  }

  /* ---- the top bar: the game's, with the range and the refresh ---- */
  .bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.6rem 1rem;
    padding: 0.7rem 1.5rem;
    background: rgba(10, 8, 6, 0.94);
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
  }
  /* The game's gold hairline, brightest in the middle, along the bar's foot. */
  .bar::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
    pointer-events: none;
  }
  .brand {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-family: var(--font-title);
    font-weight: 900;
    letter-spacing: 0.14em;
    font-size: 0.9rem;
    color: var(--gold);
    text-decoration: none;
    text-shadow: 0 0 14px rgba(201, 164, 92, 0.25);
  }
  .brand:hover {
    color: var(--gold-hi);
  }
  .mark {
    width: 0.8rem;
    height: 0.72rem;
    color: var(--unique-hi);
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
  }
  .brand small {
    font-family: var(--font-cinzel);
    font-size: 0.62rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .tools {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .fresh {
    margin-right: 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .fresh em {
    font-style: normal;
    color: var(--unique-hi);
  }
  .icon-btn {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 50%;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    cursor: pointer;
    transition:
      color 0.2s,
      border-color 0.2s,
      box-shadow 0.25s;
  }
  .icon-btn:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.3);
  }
  .icon-btn:disabled {
    cursor: not-allowed;
  }
  .icon-btn svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .spin svg {
    color: var(--gold-hi);
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  /* Reading: a thin gold bar along the bar's foot, filling as the calls come back. */
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    opacity: 0;
    transition: opacity 0.4s;
    pointer-events: none;
  }
  .progress.on {
    opacity: 1;
  }
  .progress i {
    display: block;
    height: 100%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.7);
    transition: width 0.4s var(--ease-out);
  }

  /* ---- the page ---- */
  .ledger {
    width: min(1440px, 100%);
    margin: 0 auto;
    padding: 1.4rem 1.5rem 3rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem 1.2rem;
    margin-bottom: 1.2rem;
  }
  h1 {
    font-size: 2rem;
    line-height: 1.1;
    background: linear-gradient(180deg, #f6e3ad, #c9a45c 60%, #8a6a35);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .head p {
    margin: 0;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    color: var(--text);
  }
  .head p span {
    margin: 0 0.3rem;
    font-family: var(--font-body);
    font-style: italic;
    letter-spacing: 0;
    color: var(--muted);
  }
  .note {
    margin: 0 0 1rem;
    padding: 0.7rem 1rem;
    border-left: 2px solid var(--gold-lo);
    background: rgba(201, 164, 92, 0.06);
    color: var(--text);
  }
  .note.bad {
    border-left-color: var(--bad);
    background: rgba(224, 85, 63, 0.08);
  }
  .again {
    margin-left: 0.6rem;
    padding: 0;
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 20px;
    transition: opacity 0.25s;
  }
  /* Reading again: what's shown stays, a little dimmer, until the new numbers are in. */
  .stale {
    opacity: 0.7;
  }
  .kpis {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px;
  }
  .answer {
    font-size: 0.92rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .answer b {
    margin-right: 0.2rem;
    font-family: var(--font-cinzel);
    font-size: 1.3rem;
    color: var(--gold-hi);
  }
  h3 {
    margin: 0 0 0.75rem;
    font-family: var(--font-cinzel);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  .dash {
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.2rem;
    margin-top: 0.7rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .sw {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 2px;
  }
  .sw.gold {
    background: var(--gold);
  }
  .sw.hi {
    background: var(--gold-hi);
  }
  .sw.dim {
    background: var(--dim);
  }

  /* Its height comes from the panel alone (the chart inside is laid over it), so it shrinks again as freely as it grows. */
  .fill {
    position: relative;
    flex: 1;
    min-height: 150px;
  }
  .fill-in {
    position: absolute;
    inset: 0;
  }

  /* ---- joining: the ways in beside why joins failed ---- */
  .join-cols {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 1.4rem 3rem;
  }
  .joins {
    display: grid;
    grid-template-columns: minmax(8rem, 1.4fr) 4rem 4rem minmax(8rem, 2fr);
    column-gap: 1.2rem;
  }
  .jrow {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    min-height: 2.5rem;
    border-top: 1px solid rgba(59, 48, 36, 0.55);
  }
  .jrow.head {
    min-height: 0;
    padding-bottom: 0.5rem;
    border-top: 0;
    white-space: nowrap;
    font-family: var(--font-cinzel);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .n {
    text-align: right;
    font-family: var(--font-cinzel);
    font-variant-numeric: tabular-nums;
  }
  .jrow.head .n {
    font-variant-numeric: normal;
  }
  .rate {
    display: grid;
    grid-template-columns: minmax(2rem, 1fr) 2.8rem;
    align-items: center;
    column-gap: 0.6rem;
  }
  .rate b {
    font-family: var(--font-cinzel);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .meter {
    height: 0.55rem;
    background: rgba(125, 99, 51, 0.22);
    border-radius: 0 3px 3px 0;
    overflow: hidden;
  }
  .meter i {
    display: block;
    height: 100%;
    background: var(--gold);
    border-radius: 0 3px 3px 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .chips span {
    padding: 0.3rem 0.75rem;
    font-size: 0.88rem;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .chips b {
    font-family: var(--font-cinzel);
    color: var(--text);
  }

  /* ---- arrivals ---- */
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2rem;
  }
  .devices {
    display: flex;
    gap: 2px;
    height: 0.75rem;
    border-radius: 2px;
    overflow: hidden;
  }
  .devices i {
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
  .legend.dev {
    margin: 0.6rem 0 1.2rem;
  }

  .notes {
    margin-top: 1.6rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .notes p {
    margin: 0 0 0.25rem;
  }

  /* ---- first read: the panels' outlines, waiting ---- */
  .ghost-panel {
    grid-column: span var(--span);
    height: 150px;
    background: var(--plate);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    animation: wait 1.6s ease-in-out infinite;
  }
  .ghost-panel.tall {
    height: 340px;
  }
  @keyframes wait {
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin svg,
    .ghost-panel {
      animation: none;
    }
  }
  @media (max-width: 1000px) {
    .join-cols {
      grid-template-columns: minmax(0, 1fr);
    }
    .three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .ghost-panel {
      grid-column: 1 / -1;
    }
  }
  /* Under 900px the range takes a row of its own under the brand and the buttons. */
  @media (max-width: 900px) {
    .bar {
      grid-template-columns: 1fr auto;
      padding: 0.6rem 16px;
    }
    .spans {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-self: stretch;
    }
    .spans :global(.seg) {
      display: flex;
    }
    .spans :global(.seg button) {
      flex: 1;
    }
  }
  @media (max-width: 760px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .three {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 600px) {
    .joins {
      grid-template-columns: minmax(0, 1fr) 2.6rem 3.2rem minmax(4.5rem, 1fr);
      column-gap: 0.6rem;
    }
  }
  @media (max-width: 520px) {
    .ledger {
      padding: 1rem 16px 2.5rem;
    }
    .grid {
      gap: 14px;
    }
    .fresh {
      display: none;
    }
    .brand span {
      display: none;
    }
  }
</style>
