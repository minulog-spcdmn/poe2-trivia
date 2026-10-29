<script lang="ts">
  // Analytics (stats.html): PoE2.Quest's counts from GoatCounter
  // (lib/count.ts sends them), read with the owner's key. The top bar holds
  // the views, the period and how fresh the numbers are, with a thin bar
  // along its foot while they're read. The overview answers "how is it
  // going?" at a glance; each view behind it answers one question in full.
  // The monitor button (#board) shows the overview full screen for a monitor
  // of its own: kept awake, the pointer hidden while still, updating by
  // itself; leaving full screen leaves it. Each update keeps what it brought
  // in since the one before (changes.ts), shown on the overview. Player
  // groups (#groups) are read
  // only while that view is open, and seldom (slices.ts): a call for each
  // thing people do and each way to break it down.
  //
  // Each period read is kept (this tab, and through a reload), so switching
  // back shows it at once; it is read again once it's 5 minutes old, by
  // itself while the page is in view, as long as the hour's requests stay
  // well under GoatCounter's 500 (api.ts requestsLastHour). The numbers on
  // show stay as they are while newer ones are read.
  import { onMount, setContext, tick, untrack } from 'svelte';
  import { readStored, removeStoredStarting, writeStored } from '../lib/storage';
  import { ApiError, Cancelled, DASHBOARD, HOUR_LIMIT, accountZone, forgetKey, pathCounts, pathsBy, requestsLastHour, saveKey, savedKey, visitorsBy, type Named, type Span } from './api';
  import { sameSites, spikesOf } from './insights';
  import { shortDay } from './chart';
  import { keptChanges } from './changes';
  import { DAY_REFS_KEY, dayRefsOf, dayRefsToKeep } from './dayRefs';
  import DailyView from './DailyView.svelte';
  import GamesView from './GamesView.svelte';
  import GroupsView from './GroupsView.svelte';
  import JoiningView from './JoiningView.svelte';
  import StutterView from './StutterView.svelte';
  import KeyGate from './KeyGate.svelte';
  import { countedSpan, countsOf, daysBetween, firstCounted } from './model';
  import Overview from './Overview.svelte';
  import { COMPARE, PERIODS, VIEWS, counted, type Read, type View } from './read';
  import Seg from './Seg.svelte';
  import { depthCalls, hashOf, selOf, sliceCalls, type Sel, type Slices } from './slices';
  import VisitorsView from './VisitorsView.svelte';
  import { addDays, dayIn, hoursIn, midnight } from './zone';
  import { CHANNEL } from '../lib/channel';
  import { demoSlices, demoUpdate } from './demo';
  import { keepAwake } from '../lib/wakeLock';

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
  /** The day counting began, once a read has started there (counted): the periods it hasn't reached yet are one choice. Kept, for the periods read inside it. */
  let began = $state<string | null>(demo ? null : readStored('analytics.began'));

  const viewOf = (hash: string): View => VIEWS.find((v) => v.value !== 'overview' && (`#${v.value}` === hash || hash.startsWith(`#${v.value}/`)))?.value ?? 'overview';
  let view = $state<View>(viewOf(location.hash));
  /** Whoever the player groups pick out (#groups/place/Germany). */
  let sel = $state<Sel | null>(selOf(location.hash));
  /** The overview full screen, kept awake (#board, the name it had as a layout of its own). */
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
    // Full screen needs the click that asked for it; where the browser has none (an iPhone), the overview is still kept awake.
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
  /**
   * Back to the overview as it usually is, in place of the full screen's
   * entry in the history: Back then goes where it went before, not into
   * full screen again.
   */
  function leaveBoard() {
    if (document.fullscreenElement) void document.exitFullscreen();
    if (!board) return;
    history.replaceState({ y: 0 }, '', location.pathname + location.search);
    view = 'overview';
    sel = null;
    board = false;
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
      if (r?.v !== 11 || r.span !== days) return null;
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
    const steps = 9;
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
      // (By the clock: on a day the clocks change, the time gone since midnight is an hour off it.)
      const before: Span = { start: midnight(tz, fromBefore), end: new Date(midnight(tz, toBefore).getTime() + hoursIn(tz, today, at) * 3_600_000) };
      const [n, b] = await Promise.all([step(pathCounts(k, now, signal)), step(pathCounts(k, before, signal))]);
      if (ask !== asked) return;
      // The hours today has had (a part of the one it's in too), which the period before's last day is cut at too.
      const until = hoursIn(tz, today, at);
      // The period starts where whole days were counted (model.ts countedSpan), the one before the same many days back; who the visitors were is read from there too.
      const first = firstCounted([...b.paths, ...n.paths]);
      const { start, compare } = countedSpan(first, from, fromBefore, today);
      const shown: Span = { start: midnight(tz, start), end: at };
      const shownBefore: Span = { ...before, start: midnight(tz, addDays(start, -days)) };
      const [systems, countries, refs, campaigns, countriesBefore, refsBefore] = await Promise.all([
        step(visitorsBy(k, shown, 'systems', signal)),
        step(visitorsBy(k, shown, 'locations', signal)),
        step(visitorsBy(k, shown, 'toprefs', signal)),
        step(visitorsBy(k, shown, 'campaigns', signal)),
        step(visitorsBy(k, shownBefore, 'locations', signal)),
        step(visitorsBy(k, shownBefore, 'toprefs', signal)),
      ]);
      if (ask !== asked) return;
      const counts = countsOf(n.paths, daysBetween(start, today), tz, until);
      // The sites behind the busiest days: a day gone by is read once and kept (it never changes), today each time.
      const spikeRefs: Record<string, Named[]> = {};
      const keptRefs = dayRefsOf(readStored(DAY_REFS_KEY), tz);
      let added = false;
      for (const s of spikesOf(counts.days, counts.visitors.perDay)) {
        const kept = s.day === today ? undefined : keptRefs[s.day];
        if (kept) {
          spikeRefs[s.day] = kept;
          continue;
        }
        const day: Span = { start: midnight(tz, s.day), end: s.day === today ? at : midnight(tz, addDays(s.day, 1)) };
        spikeRefs[s.day] = await visitorsBy(k, day, 'toprefs', signal);
        if (s.day !== today) {
          keptRefs[s.day] = spikeRefs[s.day];
          added = true;
        }
      }
      // Only as far back as the longest period reaches: older days are never asked for again.
      if (added) writeStored(DAY_REFS_KEY, dayRefsToKeep(keptRefs, tz, addDays(today, -Math.max(...PERIODS.map((p) => p.value)))));
      if (ask !== asked) return;
      const r: Read = {
        v: 11,
        span: days,
        from: start,
        to: today,
        fromBefore: addDays(start, -days),
        toBefore,
        zone: tz,
        now: counts,
        before: countsOf(b.paths, daysBetween(addDays(start, -days), toBefore), tz, until),
        systems,
        countries,
        // Each site once: a tagged link's visit comes with its referrer as it was (insights.ts sameSites).
        refs: sameSites(refs),
        campaigns,
        countriesBefore,
        refsBefore: sameSites(refsBefore),
        spikeRefs: Object.fromEntries(Object.entries(spikeRefs).map(([day, list]) => [day, sameSites(list)])),
        at: at.getTime(),
        complete: n.complete && b.complete,
        compare,
        began: first,
      };
      r.changes = keptChanges(had, r);
      if (counted(r) && r.from !== began) writeStored('analytics.began', (began = r.from));
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
      return s?.v === 4 && s.span === r.span && s.from === r.from ? s : null;
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
    stopDepths();
    const ctrl = (slicer = new AbortController());
    const calls = sliceCalls(r.now);
    let done = 0;
    slicing = 0.02;
    slicesFailed = '';
    try {
      const out: Slices = { v: 4, span: r.span, from: r.from, at: Date.now(), locations: {}, systems: {} };
      const end = new Date(out.at);
      await Promise.all(
        calls.map((c) =>
          // Each from its own first day (slices.ts groupFrom), so a share and what it's of cover the same days.
          pathsBy(key, { start: midnight(r.zone, c.from), end }, c.dim, c.paths, ctrl.signal).then((list) => {
            out[c.dim][c.group] = list;
            // (Not once it's been called off: what's read for another period has its own.)
            if (slicer === ctrl) slicing = ++done / calls.length;
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

  // ---- how deep a group's Delve runs go: two calls for each ten depths, so read only once a group is picked with Delve, to the groups' own time ----
  let depthsReading = $state(false);
  let depthsFailed = $state('');
  let depther: AbortController | null = null;
  /** The groups' read (its `at`) whose depths are being read, so each is read once. */
  let depthsFor = 0;
  /** Calls off a depths read, and forgets how the last went: another period's, or another key's, are its own. */
  function stopDepths() {
    depther?.abort();
    depther = null;
    depthsReading = false;
    depthsFailed = '';
    depthsFor = 0;
  }
  /** `force`: even while the hour's requests run low (the button). */
  async function loadDepths(r: Read, s: Slices, force = false) {
    if (depthsFor === s.at || (held && !force)) return;
    depthsFor = s.at;
    depther?.abort();
    const ctrl = (depther = new AbortController());
    depthsReading = true;
    depthsFailed = '';
    try {
      // (Depths with no run to read are none, not unread.)
      const depths: NonNullable<Slices['depths']> = { locations: {}, systems: {} };
      const end = new Date(s.at);
      await Promise.all(
        depthCalls(r.now).map((c) =>
          pathsBy(key, { start: midnight(r.zone, c.start), end }, c.dim, c.paths, ctrl.signal).then((list) => {
            depths[c.dim]![c.from] = list;
          }),
        ),
      );
      const withDepths: Slices = { ...$state.snapshot(s), depths };
      if (keptSlices(r)?.at === s.at) writeStored(slicesKey(r.span), JSON.stringify(withDepths), 'session');
      if (slices?.at === s.at) slices = withDepths;
    } catch (err) {
      ctrl.abort();
      if (depthsFor === s.at) depthsFor = 0;
      if (!(err instanceof Cancelled) && depther === ctrl) depthsFailed = err instanceof Error ? err.message : 'Something went wrong.';
    } finally {
      if (depther === ctrl) {
        depther = null;
        depthsReading = false;
      }
      countRequests();
    }
  }
  $effect(() => {
    // (Not while the groups are being read again: the depths go with the new ones.)
    if (view !== 'groups' || board || !read || !key || !slices || slices.depths || slicing > 0 || !sel?.who || sel.mode !== 'delve') return;
    const r = read;
    const s = slices;
    untrack(() => void loadDepths(r, s));
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
    // The spike days' sites were once kept a key each, never cleared: they're one map now (dayRefs.ts).
    removeStoredStarting(`${DAY_REFS_KEY}.`);
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
    // The period before stays on show, faded, till the new one's read: the page doesn't fall back to its skeleton.
    read = cached(days) ?? read;
    slicer?.abort();
    slicer = null;
    slicing = 0;
    stopDepths();
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
    removeStoredStarting(DAY_REFS_KEY);
    slicer?.abort();
    slicer = null;
    slicing = 0;
    stopDepths();
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
  const chosen = $derived(PERIODS.find((p) => p.value === (read?.span ?? span)) ?? PERIODS[1]);
  /** The shortest period that holds every day counted so far, where counting began inside the longest: it and those longer are one choice, "Since Oct 16". */
  const cover = $derived.by(() => {
    if (!began || !read) return null;
    const n = daysBetween(began, read.to).length;
    return n > PERIODS[PERIODS.length - 1].value ? null : (PERIODS.find((p) => p.value >= n) ?? null);
  });
  const periodOptions = $derived(
    PERIODS.filter((p) => !cover || p.value <= cover.value).map((p) => ({ value: p.value, name: p === cover ? `Since ${shortDay(began!)}` : p.name })),
  );
  /** Whether what's on show is another period's, kept while the picked one is read. */
  const stale = $derived(!!read && read.span !== span);
  /** The period, said as the days it covers: from where counting began, where that was inside it. */
  const period = $derived.by(() => {
    if (!read || !counted(read)) return chosen;
    const n = read.now.days.length;
    return { ...chosen, now: n === 1 ? 'The first day counted' : `The ${n} days counted`, before: n === 1 ? 'the day before' : `the ${n} days before` };
  });
  // By the week only where there are more days than a chart can draw one by one.
  const weekly = $derived(!!read && read.now.days.length > 90);
  // Nothing is compared with a period before that wasn't counted in full (read.ts COMPARE).
  setContext(COMPARE, () => read?.compare ?? true);

  // ---- full screen: kept awake, the pointer out of the way ----
  let full = $state(!!document.fullscreenElement);
  let idle = $state(false);
  /** Leaving full screen (Esc) leaves it for the overview as it usually is. */
  function fullChanged() {
    const was = full;
    full = !!document.fullscreenElement;
    if (was && !full && board) leaveBoard();
  }
  $effect(() => {
    if (!board) return;
    // The screen stays on while it's in view, where the browser lets a page ask.
    const sleep = keepAwake();
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
      sleep();
      document.removeEventListener('pointermove', moved);
      clearTimeout(still);
      idle = false;
    };
  });
</script>

<svelte:document onfullscreenchange={fullChanged} />

<header class="top" class:idle>
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
        {#if board}
          <!-- Opened from a link rather than the button, it isn't full screen yet: this makes it so. -->
          {#if !full}
            <button type="button" class="icon-btn" onclick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} title="Full screen" aria-label="Full screen">
              <svg viewBox="0 0 24 24"><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></svg>
            </button>
          {/if}
          <button type="button" class="icon-btn" onclick={leaveBoard} title="Leave full screen" aria-label="Leave full screen">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
          </button>
        {:else}
          <button type="button" class="icon-btn" onclick={openBoard} title="Full screen, for a monitor of its own: kept awake and updating by itself" aria-label="Show the overview full screen, kept awake">
            <svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="16" rx="1.2" /><path d="M12 18.5v3" /><path d="M9 21.5h6" /></svg>
          </button>
        {/if}
        <a class="icon-btn" href={DASHBOARD} target="_blank" rel="noreferrer" title="GoatCounter's dashboard" aria-label="GoatCounter's dashboard">
          <svg viewBox="0 0 24 24"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
        </a>
      </div>
    {/if}
  </div>
  {#if key}
    <nav class="row choices">
      {#if !board}<Seg label="View" options={VIEWS} value={view} onpick={go} />{/if}
      {#if read}<span class="range">{#if demo}<b class="made-up-tag" title="Nothing here was read from GoatCounter">Made-up numbers</b>{/if}{shortDay(read.from)} to {shortDay(read.to)}{#if read.compare}, against {shortDay(read.fromBefore)} to {shortDay(read.toBefore)}{/if}</span>{/if}
      <Seg label="Period" options={periodOptions} value={cover && span > cover.value ? cover.value : span} onpick={pick} />
    </nav>
  {/if}
  <div class="progress" class:on={loading} aria-hidden="true"><i style:width="{Math.max(6, progress * 100)}%"></i></div>
</header>

<main class="analytics" class:idle class:stale aria-busy={stale}>
  {#if !key}
    <KeyGate onkey={useKey} {refused} />
  {:else}
    {#if read}
      <p class="dates">
        <b>{period.now}</b>, {shortDay(read.from)} to {shortDay(read.to)}{#if read.compare}, against {period.before} ({shortDay(read.fromBefore)} to {shortDay(read.toBefore)}){:else if counted(read)}{read.began ? `; counting began partway through ${shortDay(read.began)}, so there's nothing before to compare with yet` : ': nothing before to compare with yet'}{:else}; {period.before} weren't counted in full, so nothing is compared with them{/if}<span class="phone-fresh">; {loading ? 'updating…' : `updated ${ago(read.at)}`}{held && !loading ? ', paused for now' : ''}</span>
      </p>
    {:else if loading}
      <!-- (Its line's room kept, so the view doesn't move down as it arrives.) -->
      <p class="dates" aria-hidden="true">&nbsp;</p>
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
      <!-- The view's outline, in the overview's grid where it's that, so nothing jumps as it arrives. -->
      <div class="waiting" class:ov={board || view === 'overview'} aria-busy="true" aria-label="Reading">
        {#if board || view === 'overview'}
          <div class="kpis">{#each [0, 1, 2, 3] as i (i)}<i></i>{/each}</div>
          <i class="today"></i>
        {/if}
        <i class="chart"></i>
        {#if !board && view !== 'overview'}<i class="table"></i>{/if}
      </div>
    {:else if read}
      {#if board || view === 'overview'}
        <Overview {read} {period} {weekly} />
      {:else if view === 'visitors'}
        <VisitorsView {read} {period} {weekly} />
      {:else if view === 'games'}
        <GamesView {read} {period} {weekly} />
      {:else if view === 'daily'}
        <DailyView {read} {period} {weekly} />
      {:else if view === 'stutter'}
        <StutterView {read} {period} {weekly} />
      {:else if view === 'groups'}
        <GroupsView
          {read}
          {period}
          {slices}
          {sel}
          reading={slicing}
          failed={slicesFailed}
          onagain={() => read && void loadSlices(read, true)}
          {depthsReading}
          {depthsFailed}
          ondepths={() => read && slices && void loadDepths(read, slices, true)}
        />
      {:else}
        <JoiningView {read} {period} />
      {/if}
      {#if !board}<footer class="foot">
        <p>Visits are to the start page, a person counted once in 8 hours, so someone who comes back every day counts every day. Ad blockers hide some of them, so totals run low, and shares between devices or countries can lean where blocking is commoner. A change chance alone could have made is shown uncoloured.</p>
        <p>This browser asked GoatCounter {used} times in the last hour, of the {HOUR_LIMIT} it allows; updating by itself pauses at {HOUR_LIMIT - KEEP_SPARE}.</p>
        <!-- Out of the way of the bar's buttons, and asked first: the key would have to be fetched from GoatCounter again. -->
        {#if !demo}<p><button type="button" class="again forget" onclick={() => confirm('Forget the GoatCounter key on this browser? It will be asked for again.') && forget()}>Forget the key on this browser</button></p>{/if}
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
    color: var(--a-down);
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
  /* Another period's numbers, kept while the picked one is read: faded, so they never pass for its own. */
  main.stale > :global(*) {
    opacity: 0.45;
    transition: opacity 0.2s;
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
  .again.forget {
    margin-left: 0;
    color: var(--a-muted);
  }
  /* How fresh the numbers are, on a phone, where the bar has no room for it. */
  .phone-fresh {
    display: none;
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
    :global(html) {
      font-size: clamp(16px, min(0.625vw, 1.1vh), 26px);
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
    .made-up {
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
  @media (orientation: portrait) and (min-width: 900px) and (min-height: 1500px) {
    :global(html) {
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
    .made-up {
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

  .idle,
  .idle :global(*) {
    cursor: none;
  }

  /* ---- first read: the view's outline, waiting (Overview.svelte's grid at each width) ---- */
  .waiting {
    display: grid;
    gap: 1.25rem;
  }
  .waiting i {
    display: block;
    min-height: 320px;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
    animation: wait 1.6s ease-in-out infinite;
  }
  .waiting .chart {
    min-height: 450px;
  }
  .waiting.ov .chart {
    grid-area: chart;
  }
  .waiting .table {
    min-height: 320px;
  }
  .waiting.ov {
    --gap: 1.75rem;
    grid-template-columns: minmax(0, 2.3fr) minmax(0, 1fr);
    grid-template-areas:
      'kpis kpis'
      'chart today';
    gap: var(--gap);
  }
  .waiting .kpis {
    grid-area: kpis;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gap);
  }
  .waiting .today {
    grid-area: today;
  }
  @keyframes wait {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin svg,
    .waiting i {
      animation: none;
    }
  }
  /* (Each height near the real one's at that width: the demo's, measured.) */
  @media (min-width: 1900px) {
    .waiting .kpis i {
      min-height: 266px;
    }
    .waiting .chart {
      min-height: 340px;
    }
  }
  @media (max-width: 1200px) {
    .waiting.ov {
      --gap: 1.25rem;
    }
    .waiting .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 1100px) {
    .waiting.ov {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'today'
        'kpis'
        'chart';
    }
    .waiting .today {
      min-height: 290px;
    }
    .waiting .kpis i {
      min-height: 244px;
    }
  }
  @media (max-width: 600px) {
    .waiting.ov {
      --gap: 1rem;
    }
    .waiting .today {
      min-height: 460px;
    }
    .waiting .kpis i {
      min-height: 290px;
    }
    .waiting .chart {
      min-height: 560px;
    }
  }
  @media (orientation: portrait) and (min-width: 900px) and (min-height: 1500px) {
    .waiting.ov {
      --gap: 1.4rem;
      grid-template-areas:
        'today'
        'kpis'
        'chart';
    }
    .waiting .kpis {
      grid-template-columns: repeat(4, minmax(0, 1fr));
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
    .phone-fresh {
      display: inline;
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
  }
</style>
