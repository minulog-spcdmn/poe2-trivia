<script lang="ts">
  // Analytics (stats.html): PoE2.Quest's counts from GoatCounter
  // (lib/count.ts sends them), read with the owner's key. The top bar holds
  // the views, the period and how fresh the numbers are, with a thin bar
  // along its foot while they're read. The overview answers "how is it
  // going?" at a glance; each view behind it answers one question in full.
  // The board (#board) is the overview for a monitor of its own, most of all
  // one on its side: one screen, sized from it, kept awake, updating by itself.
  // Each update keeps what it brought in since the one before (changes.ts),
  // shown on the overview and the board. Player groups (#groups) are read
  // only while that view is open, and seldom (slices.ts): a call for each
  // thing people do and each way to break it down.
  //
  // Each period read is kept (this tab, and through a reload), so switching
  // back shows it at once; it is read again once it's 5 minutes old, by
  // itself while the page is in view, as long as the hour's requests stay
  // well under GoatCounter's 500 (api.ts requestsLastHour). The numbers on
  // show stay as they are while newer ones are read.
  import { onMount, tick, untrack } from 'svelte';
  import { readStored, removeStoredStarting, writeStored } from '../lib/storage';
  import { ApiError, Cancelled, DASHBOARD, HOUR_LIMIT, accountZone, forgetKey, pathCounts, pathsBy, requestsLastHour, saveKey, savedKey, visitorsBy, type Named, type Span } from './api';
  import { spikesOf } from './insights';
  import { shortDay } from './chart';
  import Board from './Board.svelte';
  import { keptChanges } from './changes';
  import DailyView from './DailyView.svelte';
  import GamesView from './GamesView.svelte';
  import GroupsView from './GroupsView.svelte';
  import JoiningView from './JoiningView.svelte';
  import KeyGate from './KeyGate.svelte';
  import { countsOf, daysBetween } from './model';
  import Overview from './Overview.svelte';
  import { PERIODS, VIEWS, type Read, type View } from './read';
  import Seg from './Seg.svelte';
  import { hashOf, selOf, sliceCalls, type Sel, type Slices } from './slices';
  import VisitorsView from './VisitorsView.svelte';
  import { addDays, dayIn, midnight } from './zone';
  import { CHANNEL } from '../lib/channel';
  import { demoSlices, demoUpdate } from './demo';

  type WakeLock = { release(): Promise<void>; addEventListener(type: 'release', f: () => void): void };

  /** A period is read again once it's this old. */
  const FRESH_MS = 5 * 60_000;
  /** Updating by itself stops while the hour's requests are within this of GoatCounter's limit, leaving room to click about. */
  const KEEP_SPARE = 150;
  /** Player groups are read again once they're this old (the view open): they cost a call for each group and way to break it down. */
  const SLICES_FRESH_MS = 30 * 60_000;
  /** The account's time zone is asked again after this. */
  const ZONE_MS = 60 * 60_000;

  /** stats.html?demo, on the dev server and the beta: made-up numbers (demo.ts), no key and no calls. */
  const demo = CHANNEL !== 'live' && new URLSearchParams(location.search).has('demo');
  let key = $state(demo ? 'demo' : savedKey());
  let refused = $state('');
  const stored = Number(readStored('analytics.days'));
  const firstSpan = PERIODS.some((p) => p.value === stored) ? stored : 30;
  let span = $state<number>(firstSpan);
  const period = $derived(PERIODS.find((p) => p.value === span) ?? PERIODS[1]);

  const viewOf = (hash: string): View => VIEWS.find((v) => v.value !== 'overview' && (`#${v.value}` === hash || hash.startsWith(`#${v.value}/`)))?.value ?? 'overview';
  let view = $state<View>(viewOf(location.hash));
  /** Whoever the player groups pick out (#groups/place/Germany). */
  let sel = $state<Sel | null>(selOf(location.hash));
  const BOARD = '#board';
  let board = $state(location.hash === BOARD);
  // Each view is an entry in the history that keeps how far the page was
  // scrolled, so Back returns to the view as it was left. The page puts the
  // scroll back itself: the browser would do it before the view is there.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function go(v: View, picked: Sel | null = null) {
    const to = v === 'groups' ? hashOf(picked) : `#${v}`;
    if (v === view && !board && (v !== 'groups' || to === hashOf(sel))) return;
    history.replaceState({ ...(history.state as object | null), y: window.scrollY }, '');
    history.pushState({ y: 0 }, '', v === 'overview' ? location.pathname + location.search : to);
    view = v;
    sel = v === 'groups' ? picked : null;
    board = false;
    window.scrollTo({ top: 0 });
  }
  function openBoard() {
    history.replaceState({ ...(history.state as object | null), y: window.scrollY }, '');
    history.pushState({ y: 0 }, '', BOARD);
    board = true;
    window.scrollTo({ top: 0 });
  }
  /** Back, forward, or a # typed in: the view it names, scrolled as it was left. */
  async function followHash() {
    view = viewOf(location.hash);
    sel = selOf(location.hash);
    board = location.hash === BOARD;
    await tick();
    window.scrollTo({ top: (history.state as { y?: number } | null)?.y ?? 0 });
  }
  /** A link to a view (the overview's "Games ›") goes there as the buttons do. */
  function follow(e: MouseEvent) {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const href = a.getAttribute('href') ?? '';
    go(viewOf(href), selOf(href));
  }

  const cache = new Map<number, Read>();
  const cached = (days: number): Read | null => {
    const had = cache.get(days);
    if (had) return had;
    try {
      const r = JSON.parse(readStored(`analytics.read.${days}`, 'session') ?? 'null') as Read | null;
      if (r?.v !== 5 || r.span !== days) return null;
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
    if (demo) {
      read = demoUpdate(days);
      return;
    }
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
    const steps = 8;
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
      const [n, b, systems, countries, refs, countriesBefore, refsBefore] = await Promise.all([
        step(pathCounts(k, now, signal)),
        step(pathCounts(k, before, signal)),
        step(visitorsBy(k, now, 'systems', signal)),
        step(visitorsBy(k, now, 'locations', signal)),
        step(visitorsBy(k, now, 'toprefs', signal)),
        step(visitorsBy(k, before, 'locations', signal)),
        step(visitorsBy(k, before, 'toprefs', signal)),
      ]);
      if (ask !== asked) return;
      const counts = countsOf(n.paths, daysBetween(from, today), tz);
      // The sites behind the busiest days: a day gone by is read once and kept (it never changes), today each time.
      const spikeRefs: Record<string, Named[]> = {};
      for (const s of spikesOf(counts.days, counts.visitors.perDay)) {
        const kept = s.day === today ? null : readStored(`analytics.dayrefs.${s.day}`);
        if (kept) {
          spikeRefs[s.day] = JSON.parse(kept) as Named[];
          continue;
        }
        const day: Span = { start: midnight(tz, s.day), end: s.day === today ? at : midnight(tz, addDays(s.day, 1)) };
        spikeRefs[s.day] = await visitorsBy(k, day, 'toprefs', signal);
        if (s.day !== today) writeStored(`analytics.dayrefs.${s.day}`, JSON.stringify(spikeRefs[s.day]));
      }
      if (ask !== asked) return;
      const r: Read = {
        v: 5,
        span: days,
        from,
        to: today,
        fromBefore,
        toBefore,
        zone: tz,
        now: counts,
        before: countsOf(b.paths, daysBetween(fromBefore, toBefore), tz),
        systems,
        countries,
        refs,
        countriesBefore,
        refsBefore,
        spikeRefs,
        at: at.getTime(),
        complete: n.complete && b.complete,
      };
      r.changes = keptChanges(had, r);
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

  // ---- player groups: read while their view is open, kept a while ----
  let slices = $state<Slices | null>(null);
  let slicing = $state(0);
  let slicesFailed = $state('');
  let slicer: AbortController | null = null;
  const slicesKey = (days: number) => `analytics.slices.${days}`;
  const keptSlices = (r: Read): Slices | null => {
    try {
      const s = JSON.parse(readStored(slicesKey(r.span), 'session') ?? 'null') as Slices | null;
      return s?.v === 1 && s.span === r.span && s.from === r.from ? s : null;
    } catch {
      return null;
    }
  };
  /** The groups of the period on show (`force`: even while fresh), each call in turn with the page's others. */
  async function loadSlices(r: Read, force = false) {
    if (demo) {
      slices = demoSlices(r);
      return;
    }
    const had = keptSlices(r);
    if (had) slices = had;
    else if (slices && (slices.span !== r.span || slices.from !== r.from)) slices = null;
    if ((had && !force && Date.now() - had.at < SLICES_FRESH_MS) || (slicer && !force)) return;
    // Not by itself while the hour's requests run low; the Read again button still reads.
    if (held && !force) return;
    slicer?.abort();
    const ctrl = (slicer = new AbortController());
    const calls = sliceCalls(r.now);
    let done = 0;
    slicing = 0.02;
    slicesFailed = '';
    try {
      const out: Slices = { v: 1, span: r.span, from: r.from, at: Date.now(), locations: {}, systems: {} };
      const within: Span = { start: midnight(r.zone, r.from), end: new Date() };
      await Promise.all(
        calls.map((c) =>
          pathsBy(key, within, c.dim, c.paths, ctrl.signal).then((list) => {
            out[c.dim][c.group] = list;
            slicing = ++done / calls.length;
          }),
        ),
      );
      writeStored(slicesKey(r.span), JSON.stringify(out), 'session');
      if (r.span === span) slices = out;
    } catch (err) {
      ctrl.abort();
      if (!(err instanceof Cancelled)) slicesFailed = err instanceof Error ? err.message : 'Something went wrong.';
    } finally {
      if (slicer === ctrl) {
        slicer = null;
        slicing = 0;
      }
      countRequests();
    }
  }
  $effect(() => {
    if (view !== 'groups' || board || !read || !key) return;
    const r = read;
    untrack(() => void loadSlices(r));
  });

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
    slicer?.abort();
    slicer = null;
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
    removeStoredStarting('analytics.slices.', 'session');
    removeStoredStarting('analytics.dayrefs.');
    slicer?.abort();
    slices = null;
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

  // ---- the board: sized from the screen, kept awake, the pointer out of the way ----
  let topH = $state(0);
  let full = $state(!!document.fullscreenElement);
  let idle = $state(false);
  $effect(() => {
    document.documentElement.classList.toggle('board', board);
    return () => document.documentElement.classList.remove('board');
  });
  $effect(() => {
    if (!board) return;
    // The screen stays on while the board is in view, where the browser lets a page ask.
    let lock: WakeLock | null = null;
    let gone = false;
    const wake = async () => {
      if (gone || lock || document.visibilityState !== 'visible') return;
      try {
        const got = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }).wakeLock?.request('screen');
        if (!got) return;
        if (gone) return void got.release();
        lock = got;
        // The browser lets go of it whenever the tab is hidden; it's asked again on coming back.
        got.addEventListener('release', () => (lock = null));
      } catch {
        // Refused (a battery saving, a hidden tab): the screen sleeps as it would.
      }
    };
    void wake();
    document.addEventListener('visibilitychange', wake);
    // The pointer hides after a few still seconds, so it never sits on a figure.
    let still = 0;
    const moved = () => {
      idle = false;
      clearTimeout(still);
      still = window.setTimeout(() => (idle = true), 3000);
    };
    moved();
    document.addEventListener('pointermove', moved);
    return () => {
      gone = true;
      void lock?.release();
      document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('pointermove', moved);
      clearTimeout(still);
      idle = false;
    };
  });
  function fullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
</script>

<svelte:document onfullscreenchange={() => (full = !!document.fullscreenElement)} />

<header class="top" class:on-board={board} class:idle bind:offsetHeight={topH}>
  <div class="row">
    <a class="brand" href="./" title="Back to the game">
      <svg class="mark" viewBox="20 0 400 391" aria-hidden="true"><path d="M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z" fill="currentColor" /></svg>
      <span>PoE2.Quest</span>
    </a>
    <h1>Analytics{#if board}<span class="sub">Board</span>{/if}</h1>
    {#if key && board}
      <Seg label="Period" options={PERIODS.map((p) => ({ value: p.value, name: p.name }))} value={span} onpick={pick} />
    {/if}
    {#if key}
      <div class="tools">
        <span class="fresh" aria-live="polite">
          {#if loading}Updating…{:else if read}Updated {ago(read.at)}{/if}{#if held && !loading}<em title="Paused to stay under GoatCounter's 500 requests an hour">, paused for now</em>{/if}
        </span>
        <button type="button" class="icon-btn" class:spin={loading} onclick={() => void load(span, true)} disabled={loading} title="Read again" aria-label="Read again">
          <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></svg>
        </button>
        {#if board}
          <button type="button" class="icon-btn" onclick={fullScreen} title={full ? 'Leave full screen' : 'Full screen'} aria-label={full ? 'Leave full screen' : 'Full screen'}>
            <svg viewBox="0 0 24 24">
              {#if full}<path d="M9 4v5H4" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" /><path d="M15 20v-5h5" />{:else}<path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />{/if}
            </svg>
          </button>
          <button type="button" class="icon-btn" onclick={() => go('overview')} title="Leave the board" aria-label="Leave the board">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
          </button>
        {:else}
          <button type="button" class="icon-btn" onclick={openBoard} title="The board: the overview for a monitor of its own" aria-label="Open the board, the overview for a monitor of its own">
            <svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="16" rx="1.2" /><path d="M12 18.5v3" /><path d="M9 21.5h6" /></svg>
          </button>
        {/if}
        <a class="icon-btn" href={DASHBOARD} target="_blank" rel="noreferrer" title="GoatCounter's dashboard" aria-label="GoatCounter's dashboard">
          <svg viewBox="0 0 24 24"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
        </a>
{#if !demo}
        <button type="button" class="icon-btn" onclick={forget} title="Forget the key on this browser" aria-label="Forget the key on this browser">
          <svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M17 6l3 3" /><path d="M15 8l2 2" /></svg>
        </button>
        {/if}
      </div>
    {/if}
  </div>
  {#if key && !board}
    <nav class="row choices">
      <Seg label="View" options={VIEWS} value={view} onpick={go} />
      {#if read}<span class="range">{#if demo}<b class="made-up-tag" title="Nothing here was read from GoatCounter">Made-up numbers</b>{/if}{shortDay(read.from)} to {shortDay(read.to)}, against {shortDay(read.fromBefore)} to {shortDay(read.toBefore)}</span>{/if}
      <Seg label="Period" options={PERIODS.map((p) => ({ value: p.value, name: p.name }))} value={span} onpick={pick} />
    </nav>
  {/if}
  <div class="progress" class:on={loading} aria-hidden="true"><i style:width="{Math.max(6, progress * 100)}%"></i></div>
</header>

<main class="analytics" class:on-board={board} class:idle style:height={board ? `calc(100dvh - ${topH}px)` : null}>
  {#if !key}
    <KeyGate onkey={useKey} {refused} />
  {:else}
    {#if read}
      <p class="dates">
        <b>{period.now}</b>, {shortDay(read.from)} to {shortDay(read.to)}, against {period.before} ({shortDay(read.fromBefore)} to {shortDay(read.toBefore)})
      </p>
    {/if}
    {#if demo}
      <p class="note made-up" role="status">Made-up numbers, to look at the page with: nothing here was read from GoatCounter.</p>
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
      {#if board}
        <Board {read} {period} {weekly} />
      {:else if view === 'overview'}
        <Overview {read} {period} {weekly} />
      {:else if view === 'visitors'}
        <VisitorsView {read} {period} {weekly} />
      {:else if view === 'games'}
        <GamesView {read} {period} {weekly} />
      {:else if view === 'daily'}
        <DailyView {read} {period} {weekly} />
      {:else if view === 'groups'}
        <GroupsView {read} {period} {slices} {sel} reading={slicing} failed={slicesFailed} onagain={() => read && void loadSlices(read, true)} />
      {:else}
        <JoiningView {read} {period} />
      {/if}
      {#if !board}<footer class="foot">
        <p>Visitors are people on the start page, each counted once a visit (8 hours). Ad blockers hide some of them, so totals run low while shares hold.</p>
        <p>This browser asked GoatCounter {used} times in the last hour, of the {HOUR_LIMIT} it allows; updating by itself pauses at {HOUR_LIMIT - KEEP_SPARE}.</p>
      </footer>{/if}
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
    flex: none;
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

  /* ---- a big monitor (1440p, 4K): the page as wide as the screen, its type grown with it, the overview on one screen ---- */
  .range {
    display: none;
  }
  @media (min-width: 1900px) {
    /* As wide as the screen allows, and no taller than it: the overview is about 88rem high, so its type follows the screen's height too. */
    :global(html:not(.board)) {
      font-size: clamp(13px, min(0.625vw, 1.1vh), 26px);
    }
    /* The dates go up into the bar, beside the period. */
    .range {
      display: block;
      margin-left: auto;
      font-family: var(--font-data);
      font-size: 1rem;
      color: var(--a-muted);
    }
    .dates,
    main:not(.on-board) .made-up {
      display: none;
    }
    .made-up-tag {
      margin-right: 1.2rem;
      font-weight: 600;
      color: var(--a-now);
    }
    main {
      padding-bottom: 1.2rem;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      gap: 0 2rem;
      margin-top: 1.2rem;
      font-size: 0.9rem;
    }
    .foot p {
      margin: 0;
    }
    .row,
    main {
      width: min(160rem, 100%);
      padding-left: 3rem;
      padding-right: 3rem;
    }
  }

  /* ---- a monitor on its side (taller than wide, wider than a phone): the type sized from the screen, so the overview is one screen ---- */
  @media (orientation: portrait) and (min-width: 900px) {
    :global(html:not(.board)) {
      font-size: clamp(11px, min(1.3vw, 0.74vh), 30px);
    }
    .row,
    main {
      width: 100%;
      padding-left: 1.5rem;
      padding-right: 1.5rem;
    }
    .range {
      display: block;
      margin-left: auto;
      font-family: var(--font-data);
      font-size: 1rem;
      color: var(--a-muted);
    }
    .dates,
    main:not(.on-board) .made-up {
      display: none;
    }
    .made-up-tag {
      margin-right: 1.2rem;
      font-weight: 600;
      color: var(--a-now);
    }
    main {
      padding-top: 1rem;
      padding-bottom: 1rem;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      gap: 0 2rem;
      margin-top: 1rem;
      font-size: 0.9rem;
    }
    .foot p {
      margin: 0;
    }
  }

  /* ---- the board: one screen, its type sized from the screen (rem), nothing to scroll ---- */
  :global(html.board) {
    font-size: clamp(12px, min(1.5vw, 0.9vh), 30px);
  }
  /* The usual way round, the height decides. */
  @media (orientation: landscape) {
    :global(html.board) {
      font-size: clamp(12px, min(0.75vw, 1.3vh), 30px);
    }
  }
  .top.on-board {
    position: relative;
  }
  .top.on-board .row {
    width: 100%;
    padding-top: 0.6rem;
    padding-bottom: 0.6rem;
  }
  .top.on-board .row {
    flex-wrap: nowrap;
  }
  .top.on-board .brand span {
    display: none;
  }
  .top.on-board .fresh {
    margin-right: 0;
  }
  .sub {
    margin-left: 0.6rem;
    font-size: 0.75em;
    color: var(--a-muted);
  }
  main.on-board {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 1rem 1.5rem;
    overflow: hidden;
  }
  main.on-board > :global(*) {
    flex: none;
  }
  main.on-board > :global(.board) {
    flex: 1 1 0;
  }
  main.on-board .dates,
  main.on-board .note {
    margin-bottom: 0.8rem;
  }
  .idle,
  .idle :global(*) {
    cursor: none;
  }
  /* A monitor the usual way round has the board in two columns, which may run past the screen. */
  @media (orientation: landscape) {
    main.on-board {
      overflow: auto;
    }
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
      margin-bottom: 1rem;
      font-size: 0.95rem;
    }
    /* The choices in even rows, nothing to swipe: the views three to a row, the periods four. */
    .choices {
      flex-direction: column;
      align-items: stretch;
      gap: 0.4rem;
    }
    .choices :global(.seg) {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
    }
    .choices :global(.seg[aria-label='Period']) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .choices :global(.seg button) {
      min-width: 0;
      padding: 0.4rem 0.3rem;
    }
    /* The board on a phone: the periods a row of their own under the bar, the type the overview's, and the page scrolls (Board.svelte stacks it). */
    :global(html.board) {
      font-size: 15px;
    }
    .top.on-board .row {
      flex-wrap: wrap;
    }
    .top.on-board .row > :global(.seg) {
      order: 3;
      display: grid;
      flex-basis: 100%;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.35rem;
    }
    .top.on-board .row > :global(.seg button) {
      min-width: 0;
      padding: 0.4rem 0.3rem;
    }
    /* (Over the height the board's script sets, which keeps it to one screen elsewhere.) */
    main.on-board {
      display: block;
      height: auto !important;
      padding: 1rem 16px 2rem;
      overflow: visible;
    }
  }
</style>
