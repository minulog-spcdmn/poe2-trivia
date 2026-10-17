<script lang="ts">
  // Analytics (stats.html): PoE2.Quest's counts from GoatCounter
  // (lib/count.ts sends them), read with the owner's key. The top bar holds
  // the views, the period and how fresh the numbers are, with a thin bar
  // along its foot while they're read. The overview answers "how is it
  // going?" at a glance; each view behind it answers one question in full.
  //
  // Each period read is kept (this tab, and through a reload), so switching
  // back shows it at once; it is read again once it's 5 minutes old, by
  // itself while the page is in view, as long as the hour's requests stay
  // well under GoatCounter's 500 (api.ts requestsLastHour). The numbers on
  // show stay as they are while newer ones are read.
  import { onMount, tick } from 'svelte';
  import { readStored, removeStoredStarting, writeStored } from '../lib/storage';
  import { ApiError, Cancelled, DASHBOARD, HOUR_LIMIT, accountZone, forgetKey, pathCounts, requestsLastHour, saveKey, savedKey, visitorsBy, type Span } from './api';
  import { shortDay } from './chart';
  import DailyView from './DailyView.svelte';
  import GamesView from './GamesView.svelte';
  import JoiningView from './JoiningView.svelte';
  import KeyGate from './KeyGate.svelte';
  import { countsOf, daysBetween } from './model';
  import Overview from './Overview.svelte';
  import { PERIODS, VIEWS, type Read, type View } from './read';
  import Seg from './Seg.svelte';
  import VisitorsView from './VisitorsView.svelte';
  import { addDays, dayIn, midnight } from './zone';

  /** A period is read again once it's this old. */
  const FRESH_MS = 5 * 60_000;
  /** Updating by itself stops while the hour's requests are within this of GoatCounter's limit, leaving room to click about. */
  const KEEP_SPARE = 150;
  /** The account's time zone is asked again after this. */
  const ZONE_MS = 60 * 60_000;

  let key = $state(savedKey());
  let refused = $state('');
  const stored = Number(readStored('analytics.days'));
  const firstSpan = PERIODS.some((p) => p.value === stored) ? stored : 30;
  let span = $state<number>(firstSpan);
  const period = $derived(PERIODS.find((p) => p.value === span) ?? PERIODS[1]);

  const viewOf = (hash: string): View => VIEWS.find((v) => v.value !== 'overview' && `#${v.value}` === hash)?.value ?? 'overview';
  let view = $state<View>(viewOf(location.hash));
  // Each view is an entry in the history that keeps how far the page was
  // scrolled, so Back returns to the view as it was left. The page puts the
  // scroll back itself: the browser would do it before the view is there.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function go(v: View) {
    if (v === view) return;
    history.replaceState({ ...(history.state as object | null), y: window.scrollY }, '');
    history.pushState({ y: 0 }, '', v === 'overview' ? location.pathname + location.search : `#${v}`);
    view = v;
    window.scrollTo({ top: 0 });
  }
  /** Back, forward, or a # typed in: the view it names, scrolled as it was left. */
  async function followHash() {
    view = viewOf(location.hash);
    await tick();
    window.scrollTo({ top: (history.state as { y?: number } | null)?.y ?? 0 });
  }
  /** A link to a view (the overview's "Games ›") goes there as the buttons do. */
  function follow(e: MouseEvent) {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(viewOf(a.getAttribute('href') ?? ''));
  }

  const cache = new Map<number, Read>();
  const cached = (days: number): Read | null => {
    const had = cache.get(days);
    if (had) return had;
    try {
      const r = JSON.parse(readStored(`analytics.read.${days}`, 'session') ?? 'null') as Read | null;
      if (r?.v !== 3 || r.span !== days) return null;
      cache.set(days, r);
      return r;
    } catch {
      return null;
    }
  };
  const keep = (r: Read) => {
    cache.set(r.span, r);
    writeStored(`analytics.read.${r.span}`, JSON.stringify(r), 'session');
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
  /** Reads `days` (the period on show): `force` reads it even while fresh, and asks the time zone again. */
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
    const ctrl = (reading = new AbortController());
    const signal = ctrl.signal;
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
      // From the start of the first day to now, and the period before to as
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
        v: 3,
        span: days,
        from,
        to: today,
        fromBefore,
        toBefore,
        zone: tz,
        now: countsOf(n.paths, daysBetween(from, today), tz),
        before: countsOf(b.paths, daysBetween(fromBefore, toBefore), tz),
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
      // One call failing ends the read: the others' calls not yet sent never go.
      ctrl.abort();
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
      countRequests();
    }
  }

  /** The hour's requests, counted once for the footer and for whether updating by itself holds off. */
  let used = $state(requestsLastHour().length);
  function countRequests() {
    used = requestsLastHour().length;
    held = used > HOUR_LIMIT - KEEP_SPARE;
  }

  /** Reads the period on show again if it's grown stale, unless the hour's requests are running low. */
  function update() {
    clock = Date.now();
    countRequests();
    if (!key || loading || held || document.visibilityState !== 'visible') return;
    // After a failure, not again until the wait is over (the Read again button still reads at once).
    if (fails.n && clock - fails.at < waitAfterFails()) return;
    if (!read || clock - read.at >= FRESH_MS) void load();
  }

  onMount(() => {
    void load();
    const ticking = setInterval(update, 20_000);
    document.addEventListener('visibilitychange', update);
    document.addEventListener('click', follow);
    window.addEventListener('popstate', followHash);
    return () => {
      clearInterval(ticking);
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('click', follow);
      window.removeEventListener('popstate', followHash);
    };
  });

  function pick(days: number) {
    span = days;
    writeStored('analytics.days', String(days));
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
    removeStoredStarting('analytics.read.', 'session');
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
  const weekly = $derived(!!read && read.span > 90);
</script>

<header class="top">
  <div class="row">
    <a class="brand" href="./" title="Back to the game">
      <svg class="mark" viewBox="20 0 400 391" aria-hidden="true"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" fill="currentColor" /></svg>
      <span>PoE2.Quest</span>
    </a>
    <h1>Analytics</h1>
    {#if key}
      <div class="tools">
        <span class="fresh" aria-live="polite">
          {#if loading}Updating…{:else if read}Updated {ago(read.at)}{/if}{#if held && !loading}<em title="Paused to stay under GoatCounter's 500 requests an hour">, paused for now</em>{/if}
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
  </div>
  {#if key}
    <nav class="row choices">
      <Seg label="View" options={VIEWS} value={view} onpick={go} />
      <Seg label="Period" options={PERIODS.map((p) => ({ value: p.value, name: p.name }))} value={span} onpick={pick} />
    </nav>
  {/if}
  <div class="progress" class:on={loading} aria-hidden="true"><i style:width="{Math.max(6, progress * 100)}%"></i></div>
</header>

<main class="analytics">
  {#if !key}
    <KeyGate onkey={useKey} {refused} />
  {:else}
    {#if read}
      <p class="dates">
        <b>{period.now}</b>, {shortDay(read.from)} to {shortDay(read.to)}, against {period.before} ({shortDay(read.fromBefore)} to {shortDay(read.toBefore)})
      </p>
    {/if}
    {#if failed}
      <p class="note bad" role="alert">{failed} <button type="button" class="again" onclick={() => void load(span, true)}>Try again</button></p>
    {/if}
    {#if read && !read.complete}
      <p class="note" role="status">There were more paths than Analytics reads (1,000): some counts may be missing.</p>
    {/if}

    {#if !read && loading}
      <div class="waiting" aria-busy="true" aria-label="Reading">
        <div class="ghost kpis">{#each [0, 1, 2, 3] as i (i)}<i></i>{/each}</div>
        <div class="ghost chart"></div>
      </div>
    {:else if read}
      {#if view === 'overview'}
        <Overview {read} {period} {weekly} />
      {:else if view === 'visitors'}
        <VisitorsView {read} {period} {weekly} />
      {:else if view === 'games'}
        <GamesView {read} {period} {weekly} />
      {:else if view === 'daily'}
        <DailyView {read} {period} {weekly} />
      {:else}
        <JoiningView {read} {period} />
      {/if}
      <footer class="foot">
        <p>Visitors are people on the start page, each counted once a visit (8 hours). Ad blockers hide some of them, so totals run low while shares hold.</p>
        <p>This browser asked GoatCounter {used} times in the last hour, of the {HOUR_LIMIT} it allows; updating by itself pauses at {HOUR_LIMIT - KEEP_SPARE}.</p>
      </footer>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    background: var(--bg);
  }

  /* ---- the top bar: the game's, with the views, the period and the refresh ---- */
  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(10, 8, 6, 0.96);
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
  }
  /* The game's gold hairline, brightest in the middle, along the bar's foot. */
  .top::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
    pointer-events: none;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem 1.2rem;
    width: min(1400px, 100%);
    margin: 0 auto;
    padding: 0.8rem 2.5rem;
  }
  .choices {
    justify-content: space-between;
    padding-top: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-family: var(--font-title);
    font-weight: 900;
    letter-spacing: 0.14em;
    font-size: 1rem;
    color: var(--gold);
    text-decoration: none;
    text-shadow: 0 0 14px rgba(201, 164, 92, 0.25);
  }
  .brand:hover {
    color: var(--gold-hi);
  }
  .mark {
    width: 0.9rem;
    height: 0.8rem;
    color: var(--unique-hi);
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
  }
  h1 {
    margin: 0;
    padding-left: 1.2rem;
    border-left: 1px solid var(--line);
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--gold-hi);
  }
  .tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .fresh {
    margin-right: 0.5rem;
    font-family: var(--font-data);
    font-size: 1rem;
    color: var(--a-muted);
    white-space: nowrap;
  }
  .fresh em {
    font-style: normal;
    color: var(--unique-hi);
  }
  .icon-btn {
    width: 42px;
    height: 42px;
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
    width: 19px;
    height: 19px;
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
  /* Reading: a thin gold bar along the bar's foot, filling as the calls come back. Nothing else changes meanwhile. */
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
  main {
    width: min(1400px, 100%);
    margin: 0 auto;
    padding: 1.6rem 2.5rem 4rem;
  }
  .dates {
    margin: 0 0 1.4rem;
    font-size: 1.125rem;
    color: var(--a-muted);
  }
  .dates b {
    font-weight: 600;
    color: var(--a-ink);
  }
  .note {
    margin: 0 0 1.4rem;
    padding: 0.8rem 1.1rem;
    color: var(--a-ink);
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--gold);
    border-radius: 4px;
  }
  .note.bad {
    border-left-color: var(--a-down);
  }
  .again {
    margin-left: 0.6rem;
    padding: 0;
    font: inherit;
    font-weight: 600;
    color: var(--gold);
    background: none;
    border: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  .foot {
    margin-top: 2.5rem;
    font-size: 1rem;
    color: var(--a-muted);
  }
  .foot p {
    margin: 0 0 0.35rem;
  }

  /* ---- first read: the overview's outline, waiting ---- */
  .ghost i,
  .ghost.chart {
    display: block;
    height: 220px;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
    animation: wait 1.6s ease-in-out infinite;
  }
  .ghost.kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.25rem;
    margin-bottom: 1.25rem;
  }
  .ghost.chart {
    height: 480px;
  }
  @keyframes wait {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin svg,
    .ghost i,
    .ghost.chart {
      animation: none;
    }
  }

  @media (max-width: 900px) {
    .row {
      padding-left: 16px;
      padding-right: 16px;
    }
    main {
      padding: 1.2rem 16px 3rem;
    }
    .ghost.kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* A phone: the bar scrolls away with the page, so it doesn't take a third of the screen. */
  @media (max-width: 600px) {
    .top {
      position: relative;
    }
    .row {
      gap: 0.6rem;
    }
    h1 {
      padding-left: 0.7rem;
      font-size: 1.25rem;
    }
    .brand span,
    .fresh {
      display: none;
    }
    .icon-btn {
      width: 38px;
      height: 38px;
    }
    .dates {
      font-size: 1rem;
    }
  }
</style>
