<script lang="ts">
  import { flushSync, onMount, tick } from 'svelte';
  import { fade, fly, scale, slide, type TransitionConfig } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { calm } from '../lib/motion.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { engine, session } from '../lib/session.svelte';
  import { categoryGlyph, itemSrcset, itemThumb, playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import { endCircle, endHollow } from './gameCircles.svelte';
  import WatchToggle from './WatchToggle.svelte';
  import WatchEye from './WatchEye.svelte';
  import StandingMark from './StandingMark.svelte';
  import Phial from './Phial.svelte';
  import ItemGlyph from './ItemGlyph.svelte';
  import HeartOfLight from './HeartOfLight.svelte';
  import RunsChart from './RunsChart.svelte';
  import SiteFooter from './SiteFooter.svelte';
  import AchievementSeal from './AchievementSeal.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { fxActive, fxUserOn, onFxChange, overPage } from '../lib/fx/core';
  import { victory, winnerIgnites } from '../lib/fx/moments';
  import { fallen } from '../lib/fx/delveEnd';
  import { shareText } from '../lib/delveShare';
  import { portal } from '../lib/portal';
  import { dock, flat, phone } from '../lib/layout';
  import { FINDS_IN_ORDER, delveStandings, isGroupRun, shownDepth, teamDepth } from '../lib/delve';
  import { FIND_RULES, FIND_TEXT, MODE_NAMES } from '../lib/difficultyText';
  import { loadRecords } from '../lib/delveRecord';
  import { GROUND_Y } from '../lib/runsPlate';
  import { accentAt } from '../lib/descent';
  import { sigilOf, zoneAt } from '../lib/zoneSigils';
  import { namesList } from '../lib/presence';
  import {
    FIND_BRIEF,
    chartRuns,
    delveLine,
    highlights,
    livesLost,
    missedAnswers,
    newInCodex,
    party,
    partyHighlights,
    ranked,
    runFacts,
    score,
    scoreLine,
    soloHighlights,
    yourGame,
    zoneOf,
    type Icon,
    type Line,
    type Part,
  } from '../lib/recap';
  // Read as the screen comes in, not a moment after, so what they fill (your lives, what you earned) is there in its first
  // frame instead of pushing the column down. (The game has loaded both by its end anyway.)
  import { loadCodex } from '../lib/codex';
  import { achievementById, type Achievement } from '../lib/achievements';
  import { readsShellHeights } from '../lib/shellHeights.svelte';

  // Its styles read the shell's --header-h and --legal-h (App.svelte).
  readsShellHeights();

  // The end of a game, as the lobby is laid out: on the left the result in
  // a rune circle, the eye or the monad, or after a Delve the moth (the
  // winner, or the delvers, in its heart), and what the game meant for you
  // under it; on the right a lobby panel with the mode's ranking or the
  // party, the highlights everyone shares, and the start row. Phones stack
  // it all, the start row docked at the foot of the screen. What it says
  // comes from lib/recap.ts.

  const s = $derived(session.state!);
  const local = $derived(session.mode === 'local');
  /** This device's player online (none in hot-seat). */
  const me = $derived(local ? null : session.myPlayerId);
  const seated = $derived(!!me && s.players.some((p) => p.id === me));
  /** Online and not in the game: watching it. */
  const watching = $derived(!local && !seated);
  const host = $derived(s.players.find((p) => p.id === s.hostId)?.name ?? 'the host');
  /** The marks in front of a line (the highlights, the run's facts): avatars, item thumbs and medallions, all this size. */
  const ICON = 26;
  /** A player by id: seated, or one the recap named who has since been removed (kicked before the end). */
  const personOf = (id: string) => s.players.find((p) => p.id === id) ?? s.recap?.people?.[id];
  const nameOf = (id: string) => personOf(id)?.name ?? '?';
  const itemName = (id: string) => engine.byId.get(id)?.name ?? id;

  // ---- Delve -------------------------------------------------------------
  const run = $derived(s.delve ?? null);
  // The circle behind the result: the eye or the monad, or after a Delve,
  // where everyone perished, the moth (built ahead as the game went,
  // gameCircles.svelte.ts); hollow round one avatar (its heart's figure and glory
  // left out, the same plain frame hugging the avatar in every circle),
  // whole where several share the heart round its middle.
  const Circle = $derived(endCircle(s));
  const solo = $derived(!!run && !isGroupRun(s));
  const together = $derived(!!run && !solo);
  /** Whose run this device tells: online its player, on one device its one delver. */
  const self = $derived(local ? (s.players[0]?.id ?? null) : seated ? me : null);
  /** The depth the run ended at: alone the delver's, together the team's. */
  const endDepth = $derived(run ? (solo ? (delveStandings(s)[0]?.depth ?? s.round) : teamDepth(s)) : 0);
  /** How the run measured up against this device's records of its kind (none for someone watching). */
  const measured = $derived(run && self && session.delveResult?.id === run.startedAt ? session.delveResult : null);
  /** Deeper than ever, or the very first: the circle and the depth in gold. */
  const bright = $derived(!!measured?.best);
  const first = $derived(!!measured && measured.previousBest === null);
  /** Deeper than a best before it, for the effect's gleam. */
  const deeper = $derived(!!measured?.best && measured.previousBest !== null);
  const delvers = $derived(run ? party(s) : []);

  // ---- a normal game ------------------------------------------------------
  const rows = $derived(ranked(s.players, s.winners, s.deathmatch?.out));
  const winner = $derived(s.players.find((p) => s.winners.includes(p.id)) ?? rows[0]?.p);
  const iWon = $derived(!local && !!winner && winner.id === me);
  const iLost = $derived(!local && seated && !s.winners.includes(me!));
  const mine = $derived(!run && seated && me ? yourGame(s, me) : null);
  const hotMisses = $derived(!run && local ? missedAnswers(s) : []);
  /** Something of yours under the circle (otherwise it stands centred against the panel): your game, hot-seat's misses, or where your lives went. */
  const hasYours = $derived(run ? !!self : !!mine || hotMisses.length > 0);

  const modeName = $derived(run ? `${MODE_NAMES.delve} ${solo ? 'alone' : 'together'}` : MODE_NAMES[s.settings.mode === 'race' ? 'race' : 'turns']);
  const headline = $derived(run ? `Depth ${shownDepth(endDepth)}` : iWon ? 'You are victorious!' : `${winner?.name} wins!`);
  const line = $derived(run ? delveLine(endDepth, together, measured, !!run.mixed) : scoreLine(s, winner));

  // ---- sizes ---------------------------------------------------------------
  /** Two columns side by side, what the fit (below) is for: the CSS's own breakpoint, `@media (min-width: 1081px)`. */
  const TWO_COLUMNS = '(min-width: 1081px)';
  const short = new MediaQuery(`(max-height: 859px) and ${TWO_COLUMNS}`);
  /** A phone on its side in its browser, the address bar taking its share of the height. */
  const flatShort = new MediaQuery('(orientation: landscape) and (max-height: 370px) and (min-width: 561px)');
  /**
   * How closely each column is set, so that it ends in the window (docs/design-rules.md: fit before you shrink): 0 roomy,
   * 1 a tighter rhythm (from the start on a short window), 2 rows closer (the lives, the thumbs of your misses, the
   * finds), 3 compact lists (achievements side by side, what each asks on hover; the finds without their rules),
   * 4 smaller (the circle, the chart, the rows); past that its lists fold (folds, below). Measured, never guessed from
   * counts: each column takes the roomiest that fits (refit, below). Two columns only; a narrower window scrolls.
   */
  let sideFit = $state(0);
  let boardFit = $state(0);
  /** The rune circle's diameter (on a phone on its side, small enough that the headline and the start row under it show on the first screen). */
  const circle = $derived(phone.current ? 340 : flatShort.current ? 170 : flat.current ? 220 : Math.round((short.current ? 380 : 470) * (sideFit >= 4 ? 0.8 : 1)));
  /** How far up the circle the headline rides (together, a little higher once its column's rows close up). */
  const over = $derived(run ? (solo || sideFit >= 2 ? 0.3 : 0.25) : !hasYours ? 0.25 : short.current ? 0.37 : 0.36);
  const avatarSize = $derived(Math.round(circle * (solo ? 0.25 : 0.23)));
  /** Together: every delver round the heart, as large as fits (at most 17% of the circle). */
  const ring = $derived.by(() => {
    const n = delvers.length;
    const r = circle * (n <= 4 ? 0.13 : n <= 6 ? 0.17 : 0.2);
    const chord = n > 1 ? 2 * r * Math.sin(Math.PI / n) : circle;
    const size = Math.round(Math.min(0.17 * circle, 0.78 * chord));
    // Two side by side; more from the top, clockwise, in the result's order.
    const start = n === 2 ? -Math.PI / 2 : 0;
    return {
      size,
      box: Math.round(2 * r + size),
      faces: delvers.map((d, i) => {
        const a = start + (i / n) * Math.PI * 2;
        return { ...d, x: r * Math.sin(a), y: -r * Math.cos(a) };
      }),
    };
  });
  /** A run short of your best, and anyone watching one together: the circle in worn grey (the gold through saturate(.25) brightness(.85)). */
  const dim = $derived(!!run && !bright);
  /** The party's plates: the avatar as large as the plate leaves room for, with the same space round it on the left as above and below. */
  const plateAvatar = $derived(phone.current ? 30 : short.current ? (delvers.length > 6 ? 25 : 30) : delvers.length > 6 ? 28 : 34);
  /** Two columns of ranking from seven players (from six on a short window): one a row short beats a page that scrolls. */
  const twoCols = $derived(!phone.current && s.players.length > (short.current ? 5 : 6));
  const chartH = $derived(
    Math.round((phone.current ? 170 : solo ? (short.current ? 150 : 190) : delvers.length > 6 ? (short.current ? 89 : 120) : short.current ? 110 : 150) * (boardFit >= 4 ? 0.8 : 1)),
  );

  // ---- what this device knows ------------------------------------------------
  /**
   * This device's codex (its own answers), as the screen comes in (after a quick Next, the game's last answer is
   * still waiting for a calm moment to be written: loadCodex writes it first); read again a moment later, should
   * that answer still have been on its way.
   */
  let codex = $state(loadCodex());
  onMount(() => {
    const t = setTimeout(() => (codex = loadCodex()), 1500);
    return () => clearTimeout(t);
  });
  /** Achievements this device earned in this game (judged as it ends: they may come in a moment after the screen). */
  const earned = $derived<Achievement[]>(s.startedAt !== undefined && session.earned?.game === s.startedAt ? session.earned.ids.flatMap((id) => achievementById.get(id) ?? []) : []);
  /** This device's runs of the kind, for the chart, ending with this one; re-read once the run is recorded. */
  const chart = $derived.by(() => {
    if (!run || !self || !measured) return [];
    return chartRuns(loadRecords().runs, run.startedAt, together, local ? null : self);
  });
  const lives = $derived(run && self && codex ? livesLost(s, local ? null : self, codex.log) : []);
  /**
   * Delve alone: how many uniques were met this run, and those met for the
   * first time, in the order met; none the lives list already shows.
   */
  const met = $derived.by(() => {
    if (!solo || !self || !run || !codex) return { met: 0, fresh: [] };
    const from = run.startedAt;
    const shown = new Set(lives.flatMap((l) => l.id ?? []));
    const items = Object.entries(codex.items).filter(([id]) => !shown.has(id));
    const fresh = items.filter(([, e]) => e.first >= from).sort((a, b) => a[1].first - b[1].first);
    return { met: items.filter(([, e]) => e.last >= from).length, fresh: fresh.map(([id]) => id) };
  });
  /** Delve alone: the words over the uniques met for the first time (none, no section). */
  const found = $derived(newInCodex(met));
  /** Their row of thumbs' width (0 until measured): as many as fit, its "+N" opening it as a folded list's does. */
  let minisW = $state(0);
  /** Each thumb as large as the panel has room for (fit): from 40 px roomy down to the lines' marks' 26. */
  const miniSize = $derived([40, 34, 30, 26, 26][boardFit]);
  const MINI_GAP = 4;
  /**
   * The lists that fold once the last step isn't enough (data-fold, refit's fold): the places each keeps, its
   * last a "+N" that opens it in place, and those opened.
   */
  let folds = $state<Record<string, number>>({});
  let unfolded = $state<Record<string, true>>({});
  function folded<T>(key: string, list: T[]): { shown: T[]; more: number } {
    const keep = unfolded[key] ? Infinity : (folds[key] ?? Infinity);
    return list.length <= keep ? { shown: list, more: 0 } : { shown: list.slice(0, keep - 1), more: list.length - keep + 1 };
  }
  /** "+N" pressed: the whole list, and the focus on the first place it showed (the "+N" itself is gone). */
  async function unfold(key: string, list: Element | null, at: number) {
    unfolded[key] = true;
    await tick();
    const place = list?.children[at] as HTMLElement | undefined;
    const button = place?.matches('button') ? place : place?.querySelector('button');
    // (A place with nothing to press, an achievement or a line, takes the focus itself.)
    if (place && !button) place.tabIndex = -1;
    (button ?? place)?.focus();
  }
  const facts = $derived(run ? runFacts(s, solo ? self : null) : []);
  const lines = $derived<Line[]>(!run ? highlights(s) : solo && self ? soloHighlights(s, self, first) : partyHighlights(s));

  // ---- the start row ---------------------------------------------------------
  /** Spectators who take a seat in the next game (not those who just watch). */
  const joinNext = $derived((s.spectators ?? []).filter((o) => !o.stay && o.id !== session.myPlayerId).map((o) => o.name));
  const here = $derived(s.players.filter((p) => p.connected).length);
  const presence = $derived(!local && s.players.length > 1);

  // One click only: a second one while this screen fades out would restart the new game.
  let leaving = $state(false);
  function again(play: boolean) {
    if (leaving) return;
    leaving = true;
    session.dispatch({ type: 'restart', play });
    // Still here (the restart was refused)? Let the host try again.
    setTimeout(() => (leaving = false), 1500);
  }

  // Delve: dare someone to go deeper.
  let shared = $state(false);
  async function shareDepth() {
    if (!canShare) return;
    // Alone, your depth; together, the team's.
    const text = shareText(endDepth, together);
    try {
      if (matchMedia('(pointer: coarse)').matches && navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        shared = true;
        setTimeout(() => (shared = false), 2000);
      }
    } catch {
      /* dismissed */
    }
  }
  // Only a delver shares a depth: on this device, the one who delved alone; online, a player of the run (never someone watching).
  const canShare = $derived(!!run && (local ? solo : seated));

  // ---- the item window ------------------------------------------------------
  let CodexItem = $state<typeof import('./CodexItem.svelte').default | null>(null);
  let open = $state<import('../lib/game').Item | null>(null);
  function inspect(id: string) {
    const it = engine.byId.get(id);
    if (!it) return;
    void import('./CodexItem.svelte').then((m) => {
      CodexItem = m.default;
      open = it;
    });
  }

  // ---- the standings' reveal ---------------------------------------------------
  /**
   * When the winner's row is set down (ms): the last of the ranking, as the
   * headline's light first runs across it (.gold's gleam, 1.4 s). The
   * effects light it as it ignites (lib/fx/moments.ts winnerIgnites).
   */
  const WINNER_IN_MS = 1000;
  /**
   * The ranking builds up from the last place: each row is set down in
   * turn, rising into its place, a beat apart, faster the more there are,
   * so the row above the winner is down before the winner's comes. Then
   * the winner's (or the winners', tied) is stamped down from a little
   * larger, and ignites (.first's styles).
   */
  function rankIn(node: Element, { i, n, top }: { i: number; n: number; top: boolean }): TransitionConfig {
    if (top) return scale(node, calm({ start: 1.07, delay: WINNER_IN_MS, duration: 520, easing: quintOut }));
    const step = n > 2 ? Math.min(70, 400 / (n - 1)) : 70;
    return settle(node, { delay: 450 + (n - 1 - i) * step });
  }
  /** A part of the end screen set down into its place: risen a little, on the house's ease-out. */
  function settle(node: Element, { delay = 0, y = 12 }: { delay?: number; y?: number } = {}): TransitionConfig {
    return fly(node, calm({ y, delay, duration: 440, easing: quintOut }));
  }

  // ---- the effects ------------------------------------------------------------
  let canvas: HTMLCanvasElement;
  let crown = $state<HTMLElement>();
  let stageEl = $state<HTMLElement>();
  let sideEl = $state<HTMLElement>();
  let boardEl = $state<HTMLElement>();
  let footEl = $state<HTMLElement>();
  let title = $state<HTMLElement>();
  let standingsEl = $state<HTMLElement>();

  // ---- fitting the window -------------------------------------------------------
  const twoColumns = new MediaQuery(TWO_COLUMNS);
  /** Kept free under a column, so it doesn't end flush with the window's edge. */
  const FIT_ROOM = 12;
  /** The last step, before the lists fold. */
  const SMALL = 4;
  /** The footer closer under the columns and the window's edge: where the page wouldn't fit with it as it is. */
  let snug = $state(false);
  /**
   * Each column at the roomiest of its steps (sideFit, boardFit) that ends in
   * the window with the footer under it, so the page doesn't scroll at all;
   * past the last step, with its lists folded. If that won't do, the same
   * again with the footer closer (snug); only where even that won't (a party
   * of twelve on a laptop 725 or 790 tall) for the column alone, the footer
   * left below.
   * Measured as it will stand once everything has come in (the entrances run
   * to their end and back, with nothing painted between) and without
   * transitions (reduced motion gives everything one), so the first frame is
   * already the one that stays. The panel first: the column beside it may
   * stand centred against it.
   */
  function refit() {
    const floor = short.current ? 1 : 0;
    if (!stageEl || !sideEl || !boardEl || !footEl || !twoColumns.current || flat.current) {
      sideFit = boardFit = floor;
      folds = {};
      snug = false;
      return;
    }
    // A "+N" in focus is made anew as its list folds again (or a thumb folded away): the focus goes to its list's "+N".
    const had = document.activeElement instanceof HTMLElement && stageEl.contains(document.activeElement) ? document.activeElement : null;
    const hadList = had?.dataset.more ?? had?.closest<HTMLElement>('[data-fold]')?.dataset.fold ?? (had?.closest('.minis') ? 'minis' : undefined);
    const prev = { ...folds };
    // The entrances, not the transitions: those the class below settles (a transition seeked and put back once it
    // was cancelled would come back paused at its start).
    const running = stageEl
      .getAnimations({ subtree: true })
      .filter((a) => !(a instanceof CSSTransition) && a.playState !== 'finished' && a.currentTime !== null && a.effect?.getTiming().iterations !== Infinity);
    const at = running.map((a) => a.currentTime!);
    for (const a of running) a.currentTime = a.effect!.getComputedTiming().endTime!;
    stageEl.classList.add('fitting');
    try {
      /** Fits `el` by the first of `rooms` it can: whether that was the first. */
      const settle = (el: HTMLElement, set: (fit: number) => void, rooms: number[]) => {
        // Each step laid out and measured once: the second pass only asks less of the same bottoms.
        const bottoms: number[] = [];
        let laid = -1;
        const lay = (fit: number) => {
          if (laid === fit) return;
          set(fit);
          flushSync();
          laid = fit;
        };
        const ends = (fit: number) => (bottoms[fit] ??= (lay(fit), el.getBoundingClientRect().bottom + scrollY));
        for (const [i, room] of rooms.entries()) {
          for (let fit = floor; fit <= SMALL; fit++) if (ends(fit) <= room) return (lay(fit), i === 0);
          if (fold(el, room)) return i === 0;
        }
        unfit(el, prev);
        return false;
      };
      /** Both columns fitted from the start, by `rooms` (the page with the footer as it stands, first): whether both fit the page. */
      const both = (...rooms: number[]) => {
        sideFit = boardFit = floor;
        folds = {};
        const page = innerHeight - footEl!.getBoundingClientRect().height;
        return [settle(boardEl!, (fit) => (boardFit = fit), [page, ...rooms]), settle(sideEl!, (fit) => (sideFit = fit), [page, ...rooms])].every(Boolean);
      };
      snug = false;
      flushSync();
      if (!both()) {
        snug = true;
        flushSync();
        both(innerHeight - FIT_ROOM);
      }
      fitted = sizes();
    } finally {
      stageEl.classList.remove('fitting');
      running.forEach((a, i) => (a.currentTime = at[i]));
      // What the steps themselves changed (a row of thumbs as many as fit) isn't news to fit again for.
      seen?.takeRecords();
      if (had && !had.isConnected && hadList) stageEl.querySelector<HTMLElement>(`[data-more="${hadList}"]`)?.focus();
    }
  }
  /**
   * The column's longest list a row shorter (the lower of two as long) until the column ends by `room`: a list of
   * lines down to one and its "+N", any other down to a row. Rows as they lie, so whatever its places' widths. A row
   * given up that leaves the column no shorter (lines beside a taller chart) comes back, and that list is left be. If
   * even all that won't do, the lists stand as they were, and it says so.
   */
  function fold(el: HTMLElement, room: number) {
    const bottom = () => el.getBoundingClientRect().bottom + scrollY;
    const was = { ...folds };
    const left = new Set<string>();
    for (let i = 0; i < 99 && bottom() > room; i++) {
      let pick: { key: string; rows: number; keep: number } | null = null;
      for (const list of el.querySelectorAll<HTMLElement>('[data-fold]')) {
        const key = list.dataset.fold!;
        const lines = list.dataset.unit === 'line';
        const tops = [...list.children].map((li) => (li as HTMLElement).offsetTop);
        const rows = lines ? tops.length : new Set(tops).size;
        if (unfolded[key] || left.has(key) || rows <= (lines ? 2 : 1) || (pick && rows < pick.rows)) continue;
        const last = Math.max(...tops);
        // (Always a place besides the "+N", even in a list one place wide.)
        pick = { key, rows, keep: Math.max(2, lines ? tops.length - 1 : tops.filter((t) => t < last).length) };
      }
      if (!pick) break;
      const had = folds[pick.key];
      const before = bottom();
      folds[pick.key] = pick.keep;
      flushSync();
      if (bottom() >= before) {
        if (had === undefined) delete folds[pick.key];
        else folds[pick.key] = had;
        left.add(pick.key);
        flushSync();
      }
    }
    if (bottom() <= room) return true;
    folds = was;
    flushSync();
    return false;
  }
  /**
   * A column too long however it's folded: nothing folds, the page scrolls rather than hide things and scroll anyway.
   * Unless a list here was opened (its "+N" pressed): then the others stay as they were before (`prev`), not opening
   * with it.
   */
  function unfit(el: HTMLElement, prev: Record<string, number>) {
    const lists = [...el.querySelectorAll<HTMLElement>('[data-fold]')].map((list) => list.dataset.fold!);
    const opened = lists.some((key) => unfolded[key]) || (!!unfolded.minis && !!el.querySelector('.minis'));
    for (const key of lists) {
      if (opened && prev[key] !== undefined) folds[key] = prev[key];
      else delete folds[key];
    }
    flushSync();
  }
  let seen: MutationObserver | undefined;
  /**
   * One refit for whatever asked in the same task (a resize also changes the media queries; a codex read adds rows
   * and words), once it is done: still before the frame is painted. (flushSync can't run inside an effect either.)
   */
  let asked: 'always' | 'if-moved' | null = null;
  /** The window and the columns as the last fit left them: a change inside them that moves neither needs no other. */
  let fitted = '';
  const sizes = () => `${innerWidth}x${innerHeight} ${sideEl?.offsetHeight} ${boardEl?.offsetHeight} ${footEl?.offsetHeight}`;
  function fitSoon(how: 'always' | 'if-moved' = 'always') {
    if (asked) {
      if (how === 'always') asked = how;
      return;
    }
    asked = how;
    queueMicrotask(() => {
      const moved = asked === 'always' || sizes() !== fitted;
      asked = null;
      if (moved) refit();
    });
  }
  // Again whenever what the columns hold changes (a section, a line, a word: not the classes the fit sets), the
  // window's size, or the fonts (the first fit may come before them).
  $effect(() => {
    void [short.current, twoColumns.current, flat.current];
    fitSoon();
  });
  onMount(() => {
    // (Not what a drawing's insides do, the circle's as it comes in from its worker: a drawing keeps its size.)
    seen = new MutationObserver((changes) => changes.some((c) => !(c.target instanceof SVGElement)) && fitSoon('if-moved'));
    if (stageEl) seen.observe(stageEl, { childList: true, characterData: true, subtree: true });
    const always = () => fitSoon();
    addEventListener('resize', always);
    void document.fonts.ready.then(always);
    return () => {
      seen?.disconnect();
      removeEventListener('resize', always);
    };
  });

  // The celebration: rays, fireworks and glitter (lib/fx/moments.ts). A
  // descent ends instead with its last embers going out (lib/fx/delveEnd.ts).
  onMount(() => {
    if (!crown || !title || !winner) return;
    const h = run
      ? fallen(crown, title, { best: deeper, standings: solo ? null : standingsEl })
      : victory(crown, title, playerColor(winner.hue), iLost);
    return () => h.stop();
  });

  // Without the effects layer (no WebGL2), simpler gold sparks on a 2D canvas;
  // also once it turns out not to come, should it still be on its way now.
  onMount(() => {
    let stop: (() => void) | null = null;
    const start = () => {
      if (stop || matchMedia('(prefers-reduced-motion: reduce)').matches || fxActive() || !fxUserOn() || iLost || run) return;
      stop = sparks();
    };
    start();
    const off = onFxChange(start);
    return () => {
      off();
      stop?.();
    };
  });
  function sparks() {
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio);
    // Sized from the canvas, which keeps its height while a phone's toolbars
    // slide (innerHeight follows them), and only when that size changes:
    // setting the size clears the canvas.
    let w = 0;
    let h = 0;
    const resize = () => {
      if (canvas.clientWidth === w && canvas.clientHeight === h) return;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const colors = ['#f1d99b', '#c9a45c', '#e08a44', '#fff4d6', playerColor(winner?.hue ?? 0)];
    type P = { x: number; y: number; vx: number; vy: number; life: number; size: number; c: string; spin: number };
    const parts: P[] = [];
    const burst = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 2 + Math.random() * 7;
        parts.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 4,
          life: 1,
          size: 2 + Math.random() * 4,
          c: colors[Math.floor(Math.random() * colors.length)],
          spin: Math.random() * 6,
        });
      }
    };
    let raf = 0;
    let t = 0;
    const tick = () => {
      t++;
      if (t < 200 && t % 40 === 1) burst(w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.3), 90);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 0.12;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.008;
        p.spin += 0.2;
        if (p.life <= 0 || p.y > h + 20) {
          parts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < 200 || parts.length) raf = requestAnimationFrame(tick);
      else {
        // Over and cleared: let the full-screen bitmap go. The canvas keeps
        // its CSS size, and w and h stay, so resize() only makes a new one
        // if the canvas really changes size.
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }

  /** Svelte action: the headline on one line, its size shrunk to fit the column. */
  function fit(node: HTMLElement, _text: string) {
    const col = node.closest('.result') as HTMLElement | null;
    const size = () => {
      node.style.fontSize = '';
      const room = col?.clientWidth ?? 0;
      // The text's own width: the headline's box may be held to the column, its words running on past it.
      const w = Math.max(node.scrollWidth, node.lastElementChild?.scrollWidth ?? 0);
      if (room && w > room) node.style.fontSize = `${(parseFloat(getComputedStyle(node).fontSize) * room) / w}px`;
    };
    size();
    // Again as its font comes in (it may only start loading once the headline asks for it), and as the column changes.
    void document.fonts?.ready.then(size);
    document.fonts?.addEventListener('loadingdone', size);
    const ro = new ResizeObserver(size);
    if (col) ro.observe(col);
    return {
      update: size,
      destroy: () => {
        ro.disconnect();
        document.fonts?.removeEventListener('loadingdone', size);
      },
    };
  }

  // Phones: your row, when it is below the first screen, rides on the dock until the list brings it into place.
  let dockH = $state(0);
  let myRow = $state<HTMLElement>();
  let pinned = $state(false);
  const pinnable = $derived(phone.current && !run && seated && !s.winners.includes(me!) && rows.findIndex((x) => x.p.id === me) >= 6);
  $effect(() => {
    if (!pinnable || !myRow || !dockH) {
      pinned = false;
      return;
    }
    const io = new IntersectionObserver(([e]) => (pinned = !e.isIntersecting && e.boundingClientRect.top > 0), {
      rootMargin: `0px 0px -${Math.round(dockH + 56)}px 0px`,
    });
    io.observe(myRow);
    return () => io.disconnect();
  });

  /** A delver's zone at a depth, by name. */
  const zone = (depth: number) => zoneOf(depth).name;
  /** What a cave-in cost: "a ward and a life", "two lives". */
  const cost = (lives: number, wards: number) =>
    [wards ? (wards === 1 ? 'a ward' : 'two wards') : '', lives ? (lives === 1 ? 'a life' : 'two lives') : ''].filter(Boolean).join(' and ');
</script>

<!-- Fixed to the viewport, so it leaves the app shell (which camera shake moves).
     Behind a dialog it only darkens: the sparks are soft already, and a blur
     would be redone every frame. -->
<canvas bind:this={canvas} class="sparks" use:portal={'dim'} aria-hidden="true"></canvas>

<!-- A sentence's parts: numbers in Cinzel, players by name (yours marked), items in their own type. -->
{#snippet say(parts: Part[])}
  {#each parts as p, i (i)}
    {#if typeof p === 'string'}{p}{:else if 'n' in p}<b class="n">{p.n}</b>{:else if 'who' in p}<span class="who"
        ><PlayerName name={nameOf(p.who)} />{#if p.who === me}<em class="you">&nbsp;(you)</em>{/if}</span
      >{:else if 'item' in p}<button class="it" onclick={() => inspect(p.item)} title="Open in the codex">{itemName(p.item)}</button>{:else}{p.cat}{/if}
  {/each}
{/snippet}

<!-- The column in front of a line: a player's avatar, or a square box as an item's thumb is, holding the item or a sign (a
     find's item, the heart of a life given, a zone's emblem, a category's) at the size it is drawn for. -->
{#snippet icon(ic: Icon)}
  <span class="ic" aria-hidden="true">
    {#if 'avatar' in ic && personOf(ic.avatar)}
      {@const p = personOf(ic.avatar)!}
      <!-- Its rim reaches 3 px round it: inside that, the size of the thumbs and the medallions. -->
      <Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={ICON - 4} />
    {:else if 'item' in ic}
      <button class="mini" tabindex="-1" onclick={() => inspect(ic.item)}><img src={itemThumb(ic.item, 128)} alt="" /></button>
    {:else if !('avatar' in ic)}
      <span class="mini sign">
        {#if 'glyph' in ic}
          <span class="glyph-ic"><ItemGlyph kind={ic.glyph} /></span>
        {:else if 'heart' in ic}
          <span class="heart-ic"><HeartOfLight /></span>
        {:else if 'zone' in ic}
          {@const sg = sigilOf(zoneAt(Math.max(1, ic.zone)))}
          <svg class="zone-ic" viewBox="-11 -11 22 22" style:--c={accentAt(Math.max(1, ic.zone))}
            >{#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}<path class="s-fine" d={sg.fine} /><path d={sg.lines} /></svg
          >
        {:else if 'cat' in ic}
          <span class="cat-ic" style:--src="url('{categoryGlyph(ic.cat)}')"></span>
        {/if}
      </span>
    {/if}
  </span>
{/snippet}

<!-- The new uniques as small thumbs, each opening its codex page: one row of as many as fit, the last place a "+N" that shows them all. -->
{#snippet minis(ids: string[])}
  {@const fit = Math.max(1, Math.floor((minisW + MINI_GAP) / (miniSize + MINI_GAP)))}
  {@const shown = unfolded.minis || ids.length <= fit ? ids : ids.slice(0, fit - 1)}
  <span class="minis" style:--mini="{miniSize}px" style:gap="{MINI_GAP}px" style:visibility={minisW ? null : 'hidden'} bind:clientWidth={minisW}>
    {#each shown as id (id)}
      <button class="mini" onclick={() => inspect(id)} title={itemName(id)} aria-label={itemName(id)}><img src={itemThumb(id, 128)} alt="" /></button>
    {/each}
    {#if shown.length < ids.length}
      <button class="mini more" data-more="minis" onclick={(e) => unfold('minis', e.currentTarget.parentElement, shown.length)} aria-label="Show all {ids.length} new uniques"><b class="n">+{ids.length - shown.length}</b></button>
    {/if}
  </span>
{/snippet}

<!-- Lines with an icon in front; folding under `key` (refit's fold). -->
{#snippet lineList(list: Line[], key?: string, what = '')}
  {@const f = key ? folded(key, list) : { shown: list, more: 0 }}
  <ul class="fx" data-fold={key} data-unit="line">
    {#each f.shown as l, i (i)}
      <li>{@render icon(l.icon)}<span class="txt">{@render say(l.parts)}</span></li>
    {/each}
    {#if f.more && key}{@render moreLine(key, f.shown.length, f.more, what)}{/if}
  </ul>
{/snippet}

<!-- A folded list's last place: how many more, opening it in place. A row of thumbs ends in a "+N" place, a list of
     lines in a line. -->
{#snippet moreThumb(key: string, at: number, n: number, what: string)}
  <li><button class="thumb more" data-more={key} onclick={(e) => unfold(key, e.currentTarget.closest('[data-fold]'), at)} aria-label="Show {n} more {what}"><b class="n">+{n}</b></button></li>
{/snippet}
{#snippet moreLine(key: string, at: number, n: number, what: string)}
  <li class="more"><button class="more-line" data-more={key} onclick={(e) => unfold(key, e.currentTarget.closest('[data-fold]'), at)}><b class="n">{n}</b> more {what}</button></li>
{/snippet}

<!-- An item's thumb that opens its codex page, its name on hover. -->
{#snippet thumb(id: string, badge?: string)}
  {@const by = badge ? personOf(badge) : undefined}
  <li>
    <!-- (Named as its tooltip names it, so a screen reader doesn't say it twice.) -->
    <button class="thumb" onclick={() => inspect(id)} title={itemName(id)} aria-label={itemName(id)}>
      <span class="art"><img src={itemThumb(id, 128)} srcset={itemSrcset(id)} alt="" /></span>
      {#if by}<span class="badge"><Avatar name={by.name} hue={by.hue} sigil={by.sigil} size={20} /></span>{/if}
    </button>
  </li>
{/snippet}

<!-- Achievements as the codex lists them; in a compact column (fit, 3) side by side, what each asks on hover. -->
{#snippet achievements(list: Achievement[], fit: number, key: string)}
  {@const f = folded(key, list)}
  <ul class="earned" data-fold={key}>
    {#each f.shown as a (a.id)}
      <li title={fit >= 3 ? a.text : undefined}>
        <AchievementSeal sign={a.sign} tier={a.tier} earned size={fit >= 3 ? 36 : fit >= 1 ? 42 : 50} />
        <span class="ach"><b>{a.title}</b><span>{a.text}</span></span>
      </li>
    {/each}
    {#if f.more}
      <li class="more">
        <button class="seal-more" data-more={key} onclick={(e) => unfold(key, e.currentTarget.closest('[data-fold]'), f.shown.length)} aria-label="Show {f.more} more achievements"
          ><b class="n">+{f.more}</b></button
        >
      </li>
    {/if}
  </ul>
{/snippet}

{#snippet startRow()}
  {#if session.isHost}
    {#if presence || joinNext.length}
      <div class="status" data-cursor="status">
        {#if presence}
          {#if here === s.players.length}
            <p class="note"><span class="ic"><svg class="check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" /></svg></span><span>All <b class="n">{here}</b> exiles still here</span></p>
          {:else}
            <p class="note warn"><span class="ic"><StandingMark mark="offline" /></span><span><b class="n">{here}</b> of <b class="n">{s.players.length}</b> exiles still here</span></p>
          {/if}
        {/if}
        {#if joinNext.length}
          <p class="note"><span class="ic eye"><WatchEye /></span><span>{namesList(joinNext)} join{joinNext.length === 1 ? 's' : ''} next</span></p>
        {/if}
      </div>
    {/if}
    <span class="buttons" data-cursor="actions">
      <button class="btn ghost back" data-cursor="back" disabled={leaving} onclick={() => again(false)}>Back to lobby</button>
      <button class="btn primary big again" data-cursor="again" use:backdropShadow disabled={leaving} onclick={() => again(true)}>{run ? 'Delve again' : 'Play again'}</button>
    </span>
  {:else if session.spectating}
    <p class="note spect" data-cursor="joining">
      <span class="ic"><span class="pulse"></span></span>
      <span
        >{#if session.justWatching}You’re watching; <b class="host">{host}</b> starts the next {run ? 'run' : 'game'} without you.{:else if together}You join the next run once <b
            class="host">{host}</b
          > starts it.{:else}You play in the next game once <b class="host">{host}</b> starts it.{/if}</span
      >
    </p>
    <WatchToggle />
  {:else}
    <p class="waiting" data-cursor="actions"><span class="pulse"></span><span>Waiting for <b class="host">{host}</b> to start the next {run ? 'run' : 'game'}…</span></p>
  {/if}
{/snippet}

<!-- A row of the ranking (also pinned to the dock on a phone). -->
{#snippet rankRow(x: { p: (typeof s.players)[number]; rank: number }, pin = false)}
  {@const you = x.p.id === me}
  {@const gone = !local && !x.p.connected}
  <span class="rank">{x.rank}</span>
  <Avatar name={x.p.name} hue={x.p.hue} sigil={x.p.sigil} size={28} dim={gone} />
  <span class="name"><PlayerName name={x.p.name} />{#if you}<em class="you">&nbsp;(you)</em>{/if}</span>
  {#if gone && !pin}<StandingMark mark="offline" />{/if}
  <span class="pts">{score(x.p.score)}</span>
{/snippet}

<!-- data-cursor: where other players' pointers are placed (PeerCursors): the screen, the circle's heart, the headline and its line,
     what is yours, the ranking (each row by its seat), the highlights, the runs, and the start row. -->
<div class="over" class:delve={!!run} class:solo class:together class:bright class:short={short.current} class:phone={phone.current} data-cursor="game" style:--circle="{circle}px" style:--over={over}>
  <div class="stage" bind:this={stageEl}>
    <div class="side" class:centred={!hasYours} class:tight={sideFit >= 1} class:close={sideFit >= 2} class:compact={sideFit >= 3} class:small={sideFit >= 4} bind:this={sideEl}>
      <div class="result">
        <div class="plate" aria-hidden="true" in:scale|global={calm({ start: 0.85, duration: 900 })}>
          <div class="veil">
            <div class="inner">
              <!-- The eye or the monad, or after a Delve the moth, hollow round one avatar; a run short of your best in worn grey. -->
              <Circle size="100%" hollow={!!winner && endHollow(s)} color={dim ? '#9a8f7f' : undefined} strength={run ? (bright ? 0.42 : 0.3) : iLost ? 0.35 : 0.6} />
            </div>
          </div>
        </div>
        {#if winner}
          <div
            class="heart"
            class:ring={together}
            bind:this={crown}
            data-cursor="art"
            style:width="{together ? ring.box : avatarSize}px"
            style:height="{together ? ring.box : avatarSize}px"
            in:scale|global={calm({ start: 0.4, duration: 900, delay: 200 })}
          >
            {#if together}
              <!-- Together: every delver round the heart, you ringed in your orange. -->
              {#each ring.faces as f (f.id)}
                {@const p = s.players.find((x) => x.id === f.id)}
                {#if p}
                  <span class="face" class:you={f.id === me} style:left="calc(50% + {f.x}px)" style:top="calc(50% + {f.y}px)">
                    <Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={ring.size} />
                  </span>
                {/if}
              {/each}
            {:else}
              {@const p = solo ? (s.players[0] ?? winner) : winner}
              <Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={avatarSize} />
            {/if}
          </div>
          <div class="words">
            <h1 data-cursor="headline" bind:this={title} use:fit={headline} in:fly|global={calm({ y: 20, duration: 700, delay: 500 })}>
              <span class="shade" aria-hidden="true">{headline}</span>
              <span class="gold">{headline}</span>
            </h1>
            <p class="sub" data-cursor="sub" in:fly|global={calm({ y: 10, duration: 700, delay: 700 })}>{@render say(line)}</p>
          </div>
        {/if}
      </div>

      {#if flat.current && !phone.current}
        <!-- A phone on its side: what's next straight under the result, in reach on the first screen
             (a bar docked across so short a screen would take too much of it); the details below. -->
        <div class="start up" class:centre={!session.isHost && !session.spectating}>{@render startRow()}</div>
      {/if}

      {#if mine}
        <section class="sec yours" data-cursor="yours" in:fade|global={calm({ duration: 600, delay: 900 })}>
          <h3>Your game</h3>
          {#if mine.place}
            {@const p = s.players.find((x) => x.id === me)}
            <p class="place">{#if p}<Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={30} />{/if}<span>{@render say(mine.place)}</span></p>
          {/if}
          {#if mine.game}<p>{@render say(mine.game)}</p>{/if}
          {#if mine.missed.length}
            {@const f = folded('missed', mine.missed)}
            <p>{mine.missedLead}</p>
            <ul class="thumbs" data-fold="missed">
              {#each f.shown as id (id)}{@render thumb(id)}{/each}
              {#if f.more}{@render moreThumb('missed', f.shown.length, f.more, 'missed items')}{/if}
            </ul>
          {/if}
        </section>
        {#if earned.length}
          <!-- Judged as the game ends, it can come in after the screen: it opens out rather than jumping in. -->
          <section class="sec yours earned-sec" in:slide={calm({ duration: 450 })}>
            <h3>Earned this game</h3>
            {@render achievements(earned, sideFit, 'earned')}
          </section>
        {/if}
      {:else if hotMisses.length}
        {@const f = folded('hot', hotMisses)}
        <section class="sec yours" data-cursor="yours" in:fade|global={calm({ duration: 600, delay: 900 })}>
          <h3>Missed answers</h3>
          <p>Kept in this device’s codex.</p>
          <ul class="thumbs" data-fold="hot">
            {#each f.shown as m (m.id)}{@render thumb(m.id, m.by)}{/each}
            {#if f.more}{@render moreThumb('hot', f.shown.length, f.more, 'missed items')}{/if}
          </ul>
        </section>
      {:else if run && self && lives.length}
        {@const f = folded('lives', lives)}
        <section class="sec yours lives-sec" data-cursor="yours" in:fade|global={calm({ duration: 600, delay: 900 })}>
          <h3>Where your lives went</h3>
          <ul class="lives" data-fold="lives" data-unit="line">
            {#each f.shown as l, i (i)}
              <li>
                {#if l.kind === 'given'}
                  <span class="thumb given"><span class="heart-big"><HeartOfLight /></span></span>
                {:else if l.id}
                  <button class="thumb" onclick={() => inspect(l.id!)} aria-label="{itemName(l.id)}, open in the codex">
                    <span class="art"><img src={itemThumb(l.id, 128)} srcset={itemSrcset(l.id)} alt="" /></span>
                    {#if l.back}<span class="badge heart-badge"><HeartOfLight /></span>{/if}
                  </button>
                {:else}
                  <!-- A loss this device's codex doesn't have (another tab's, or lost): the zone it was in, by its emblem. -->
                  {@const sg = sigilOf(zoneAt(l.depth))}
                  <span class="thumb blank" style:--c={accentAt(l.depth)}
                    ><svg viewBox="-12 -12 24 24" aria-hidden="true"
                      >{#if sg.shade}<path class="s-shade" d={sg.shade} />{/if}<path class="s-fine" d={sg.fine} /><path d={sg.lines} /></svg
                    ></span
                  >
                {/if}
                <span class="what">
                  {#if l.kind === 'cave'}
                    <b class="title">The vein caved in</b>
                    <span class="where">{itemName(l.id!)} at depth {shownDepth(l.depth)}: {cost(l.lives, l.wards)}</span>
                  {:else if l.kind === 'given'}
                    <b class="title">Given to {nameOf(l.to!)}</b>
                    <span class="where">Depth {shownDepth(l.depth)}, {zone(l.depth)}</span>
                  {:else}
                    <b class="title">{l.id ? itemName(l.id) : 'A life lost'}</b>
                    <span class="where">Depth {shownDepth(l.depth)}, {zone(l.depth)}{#if l.back}. {nameOf(l.back)} brought you back.{/if}</span>
                  {/if}
                </span>
                {#if l.wards && l.kind === 'cave'}
                  <span class="broken-ward" aria-hidden="true"
                    ><span class="piece l"><ItemGlyph kind="ward" piece="left" /></span><span class="piece r"><ItemGlyph kind="ward" piece="right" /></span></span
                  >
                {/if}
                <span class="vial"><Phial lives={l.after} /></span>
              </li>
            {/each}
            {#if f.more}{@render moreLine('lives', f.shown.length, f.more, 'lives')}{/if}
          </ul>
        </section>
      {/if}
    </div>

    <section class="board panel" class:tight={boardFit >= 1} class:close={boardFit >= 2} class:compact={boardFit >= 3} class:small={boardFit >= 4} bind:this={boardEl} use:backdropShadow={{ fill: 'linear', off: phone.current }} in:fly|global={calm({ x: 30, duration: 500, delay: 200 })}>
      <div class="main">
        <header>
          <h2>{modeName}</h2>
          {#if canShare}
            <span class="share-wrap">
              <button class="share" data-cursor="share" onclick={shareDepth} title={together ? "Share the team’s depth" : 'Share your depth'}>
                {#if shared}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  Copied
                {:else}
                  <!-- Three linked seals: the share sign. -->
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="18" cy="5.5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="18.5" r="2.6" />
                    <path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" />
                  </svg>
                  Share run
                {/if}
              </button>
            </span>
          {/if}
        </header>

        {#if !run}
          <ol class="ranking" class:two={twoCols} style:--rows={Math.ceil(rows.length / 2)} style:--winner-in="{WINNER_IN_MS}ms" data-cursor="standings" bind:this={standingsEl}>
            {#each rows as x, i (x.p.id)}
              {@const first = s.winners.includes(x.p.id) || (!s.winners.length && x.rank === 1)}
              <li
                class:first
                class:you={x.p.id === me}
                class:gone={!local && !x.p.connected}
                data-cursor="row:{s.players.indexOf(x.p)}"
                in:rankIn|global={{ i, n: rows.length, top: first }}
                onanimationstart={(e) => {
                  if (e.target === e.currentTarget && !e.pseudoElement && e.animationName.endsWith('ignite')) winnerIgnites(e.currentTarget);
                }}
              >
                {#if x.p.id === me && pinnable}<span class="anchor" bind:this={myRow}></span>{/if}
                {@render rankRow(x)}
              </li>
            {/each}
          </ol>
        {:else if together}
          <ul class="plates" class:pair={delvers.length === 2} class:many={delvers.length > 6} style:--av="{plateAvatar}px" data-cursor="standings" bind:this={standingsEl}>
            {#each delvers as d, i (d.id)}
              {@const p = s.players.find((x) => x.id === d.id)}
              {#if p}
                <li class:you={d.id === me} class:gone={!p.connected} data-cursor="row:{s.players.indexOf(p)}" in:settle|global={{ delay: 450 + i * 60, y: 10 }}>
                  <Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={plateAvatar} dim={!p.connected} />
                  <span class="who-col">
                    <span class="name"><PlayerName name={p.name} />{#if d.id === me}<em class="you">&nbsp;(you)</em>{/if}</span>
                    <span class="dep">Depth <b class="n">{shownDepth(d.depth)}</b></span>
                  </span>
                  {#if d.revived}<span class="revived" title="Brought back by a teammate"><HeartOfLight /></span>{/if}
                </li>
              {/if}
            {/each}
          </ul>
        {/if}

        {#if run}
          <div class="runs" data-cursor="runs">
            {#if first}
              {#if facts.length > 1}
                <p class="cap">This run</p>
                {@render lineList(facts.slice(1), 'facts', 'from this run')}
              {:else}
                <!-- Never the depth a find first turns up at: that is for the descent to show. -->
                <p class="cap">No finds turned up on this run. What you can find:</p>
                <ul class="fx finds">
                  {#each FINDS_IN_ORDER as f (f.kind)}
                    <li data-find={f.kind}>
                      <span class="ic"><span class="mini sign"><span class="glyph-ic"><ItemGlyph kind={f.kind === 'azurite' ? 'ward' : f.kind} /></span></span></span>
                      <span class="txt">
                        <b class="find-name">{FIND_TEXT[f.kind].name}</b>
                        <span>{FIND_BRIEF[f.kind]} <span class="miss">{FIND_RULES[f.kind].miss}</span></span>
                      </span>
                    </li>
                  {/each}
                </ul>
              {/if}
            {:else if chart.length >= 2}
              <p class="cap">{together ? 'Your runs together, oldest first' : 'Your runs alone, oldest first'}</p>
              <div class="chart-row" style:--ground="{GROUND_Y}px">
                <RunsChart runs={chart} height={chartH} width={phone.current ? 250 : 180} />
                {@render lineList(facts, 'facts', 'from this run')}
              </div>
            {:else}
              <p class="cap">This run</p>
              {@render lineList(facts, 'facts', 'from this run')}
            {/if}
          </div>
        {/if}
      </div>

      {#if run && earned.length}
        <!-- Every run that earns one (judged as it ends: it opens out rather than jumping in). -->
        <section class="sec earned-sec" in:slide={calm({ duration: 450 })}>
          <h3>Earned this run</h3>
          {@render achievements(earned, boardFit, 'earned')}
        </section>
      {/if}

      {#if lines.length}
        <section class="sec highlights" data-cursor="highlights" in:settle|global={{ delay: run ? 1000 : WINNER_IN_MS + 450 }}>
          <h3>Highlights</h3>
          {@render lineList(lines, 'highlights', 'highlights')}
        </section>
      {/if}

      {#if found}
        <!-- Delve alone: the uniques met for the first time, how many on the heading's line. -->
        <section class="sec found" in:fade={{ duration: 600, delay: 1100 }}>
          <h3><span>New in your codex</span><span class="count">{@render say(found)}</span></h3>
          {@render minis(met.fresh)}
        </section>
      {/if}

      {#if !phone.current && !flat.current}
        <div class="start" class:centre={!session.isHost && !session.spectating}>{@render startRow()}</div>
      {/if}
    </section>
  </div>

  <div class="foot" class:snug bind:this={footEl}><SiteFooter inRoom /></div>
</div>

{#if phone.current}
  <!-- Phones: the start row docked at the foot of the screen, where the thumb rests (lib/layout's dock). -->
  <div class="dock" class:host={session.isHost} use:portal use:overPage use:dock bind:offsetHeight={dockH} in:fade={{ duration: 200 }} out:fade|global={{ duration: 180 }}>
    {#if pinned}
      {@const x = rows.find((r) => r.p.id === me)}
      {#if x}<div class="pinned"><div class="ranking"><div class="row you">{@render rankRow(x, true)}</div></div></div>{/if}
    {/if}
    <div class="dock-row">{@render startRow()}</div>
  </div>
{/if}

{#if open && CodexItem && codex}
  <CodexItem item={open} {codex} onclose={() => (open = null)} onopen={(it) => (open = it)} />
{/if}

<style>
  .sparks {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: var(--screen-h);
    pointer-events: none;
    z-index: 5;
  }

  /* ---- the page ---- */
  /* The lobby's stage: 1200 wide in the middle of the window, the result's
     column 440 and the panel 600, both on the lobby panel's top line, then
     the start page's footer at the foot of the window. */
  .over {
    --h1: 58px;
    --sub: 18px;
    --body: 17px;
    --hl: 17px;
    --fade: 50%, rgba(0, 0, 0, 0.3) 68.46%, transparent 79.23%;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .over.delve {
    --h1: 66px;
    --sub: 16px;
    --hl: 16px;
  }
  .stage {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    /* Both columns start on the lobby panel's top line, at every window height: the lobby centres its 724 px of columns in
       what the header and the legal links under it leave of the window (App.svelte measures both: --header-h, --legal-h;
       their usual heights until it has), and never goes nearer the header than its own padding (Lobby.svelte, desktop).
       So going back to the lobby never moves the panel. */
    padding: max(clamp(10px, 0.024 * var(--view-h), 40px), (var(--app-h) / var(--stage-zoom, 1) - var(--header-h, 64.6px) - var(--legal-h, 44.1px) - 724px) / 2)
      max(20px, (min(100%, 1440px) - 1200px) / 2) 0;
  }
  .side {
    position: relative;
    width: 440px;
    flex: none;
    font-size: var(--body);
  }
  /* Nothing under the circle: it stands centred against the panel. */
  .side.centred {
    align-self: center;
  }
  /* A normal game with nothing under the circle (someone watching) stands as Delve's does: high beside the panel, the
     headline low on the circle's foot (--over), which fades out under it. */
  @media (min-width: 1081px) {
    .over:not(.delve) .side.centred {
      align-self: flex-start;
      margin-top: 42px;
    }
    .over.short:not(.delve) .side.centred {
      margin-top: 26px;
    }
  }
  .board {
    width: 600px;
    flex: none;
    display: flex;
    flex-direction: column;
    padding: 1.4rem;
  }
  /* Closer under the columns than on the start page, so a long end still fits the window without scrolling. */
  .foot {
    margin-top: auto;
    padding: 18px max(32px, (min(100%, 1440px) - 1200px) / 2) 22px;
  }

  /* ---- the result: the circle, and the headline over its foot ---- */
  .result {
    position: relative;
    padding-top: calc(var(--circle) * (1 - var(--over)));
  }
  .plate {
    position: absolute;
    top: 0;
    left: 50%;
    width: var(--circle);
    height: var(--circle);
    translate: -50% 0;
    pointer-events: none;
  }
  /* The circle fades downward so the headline and the column run over it,
     on a box reaching 15% past it on every side so its glow is never cut. */
  .veil {
    position: absolute;
    inset: -15%;
    -webkit-mask-image: linear-gradient(180deg, #000 var(--fade));
    mask-image: linear-gradient(180deg, #000 var(--fade));
  }
  .inner {
    position: absolute;
    inset: 11.5385%;
  }
  .heart {
    position: absolute;
    left: 50%;
    top: calc(var(--circle) / 2);
    translate: -50% -50%;
  }
  .heart.ring .face {
    position: absolute;
    translate: -50% -50%;
    border-radius: 50%;
  }
  /* Your face among the delvers, ringed in your orange as on your plate: outside the avatar's own dark rim, which would
     cover a ring drawn on its wrapper. */
  .heart.ring .face.you :global(.avatar) {
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 4.5px #e08a44,
      0 0 12px 3px rgba(224, 138, 68, 0.55),
      0 4px 10px rgba(0, 0, 0, 0.5);
  }
  /* Alone, short of your best: the fallen delver's portrait has lost its colour. */
  .solo:not(.bright) .heart :global(.avatar) {
    filter: grayscale(0.75) brightness(0.8);
  }
  .words {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: fit-content;
    max-width: 100%;
    margin: 0 auto;
  }
  /* A soft dark scrim behind the words, over the circle: dithered (app.css), or it bands. */
  .words::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: -10px -30px;
    image-rendering: pixelated;
    background:
      radial-gradient(closest-side, rgba(10, 8, 6, 0.86), rgba(10, 8, 6, 0.6) 55%, rgba(10, 8, 6, 0)),
      var(--dither);
    -webkit-mask-image: radial-gradient(closest-side, #000 70%, transparent);
    mask-image: radial-gradient(closest-side, #000 70%, transparent);
    pointer-events: none;
    /* It only darkens the circle's lines behind the words: it comes in as the circle draws itself, or it shows as a dark smudge first. */
    animation: scrim-in 1.4s 0.5s ease-out both;
  }
  @keyframes scrim-in {
    from {
      opacity: 0;
    }
  }
  h1 {
    margin: 0;
    font-size: var(--h1);
    font-weight: 900;
    line-height: 1.15;
    white-space: nowrap;
    width: max-content;
    /* The shadow and the gold are two copies of the text, stacked. */
    display: grid;
  }
  h1 > span {
    grid-area: 1 / 1;
  }
  /* Its size is set to fit (fit, above), and measured at once: never eased into, which reduced motion's
     very short transitions on everything (app.css) would do, so it would measure the size before. */
  h1,
  h1 > span {
    transition-property: none;
  }
  /* The shadow on a layer of its own, painted once: as a filter on the gold
     it would be blurred again on every frame of the gleam. */
  .shade {
    color: transparent;
    text-shadow: 0 4px 16px rgba(0, 0, 0, 0.9);
    will-change: transform;
  }
  .gold {
    /* Positioned, so it paints over the shade, which its layer would otherwise lift above it. */
    position: relative;
    /* A band of light sweeps across the gold every few seconds. */
    background:
      linear-gradient(100deg, transparent 42%, rgba(255, 250, 232, 0.8) 50%, transparent 58%) no-repeat,
      linear-gradient(180deg, #fff1c9 10%, #d7b068 55%, #8b6526);
    background-size:
      250% 100%,
      100% 100%;
    background-position:
      160% 0,
      0 0;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: gleam 5s ease-in-out 1.4s infinite;
  }
  @keyframes gleam {
    0% {
      background-position:
        160% 0,
        0 0;
    }
    25%,
    100% {
      background-position:
        -60% 0,
        0 0;
    }
  }
  /* Delve: no victory. The depth is cold silver and holds still, gold only for a new best or a first run. */
  .delve .gold {
    background: linear-gradient(180deg, #ece4d4 8%, #a89f90 55%, #5f574b);
    -webkit-background-clip: text;
    background-clip: text;
    animation: none;
  }
  .delve.bright .gold {
    background: linear-gradient(180deg, #fbecc6 8%, #c9a45c 55%, #7a5a26);
    -webkit-background-clip: text;
    background-clip: text;
  }
  .sub {
    margin: 0.15rem 0 0;
    max-width: 440px;
    font-size: var(--sub);
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
  }

  /* ---- words ---- */
  /* Numbers among the words in Cinzel, bold gold, as everywhere in the game. */
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 0.86em;
    color: var(--gold-hi);
  }
  /* An item named in a line opens its codex page, as its thumb does. */
  .it {
    display: inline;
    padding: 0;
    font: inherit;
    font-family: var(--font-display);
    font-weight: 700;
    color: #f3c37e;
    background: none;
    border: 0;
    cursor: zoom-in;
    transition: color 0.2s;
  }
  .it:hover {
    color: #ffe0ad;
    text-decoration: underline dotted rgba(243, 195, 126, 0.6);
    text-underline-offset: 3px;
  }
  em.you {
    font-size: 0.78em;
    font-style: italic;
    color: var(--muted);
  }

  /* ---- sections (the lobby's headings: display font, gold, a hairline under) ---- */
  .sec h3,
  .board header {
    margin: 0 0 0.8rem;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.35);
  }
  .sec h3,
  .board h2 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 20px;
    letter-spacing: 0.02em;
    text-transform: none;
    color: var(--gold);
  }
  .board header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .board h2 {
    margin: 0;
  }
  .yours {
    margin-top: 1.6rem;
  }
  .yours p {
    margin: 0 0 0.7rem;
    line-height: 1.4;
  }
  .place {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* An item's thumb: the codex's square, its name on hover and in the codex a click opens. Far enough apart for
     hot-seat's badge, which stands out past its corner. */
  .thumbs {
    list-style: none;
    margin: 0 0 0.8rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .yours {
    --t: 60px;
  }
  .thumb {
    position: relative;
    display: block;
    flex: none;
    width: var(--t);
    height: var(--t);
    padding: 0;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--line);
    border-radius: 2px;
    cursor: zoom-in;
    transition: border-color 0.2s;
  }
  .thumb:hover {
    border-color: var(--gold-lo);
  }
  /* The art fits a box inside the square, however tall or wide it is (a staff, a belt). */
  .thumb .art {
    position: absolute;
    inset: 7%;
  }
  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  /* Hot-seat: whose miss it was, in the thumb's corner. */
  .badge {
    position: absolute;
    right: -6px;
    bottom: -6px;
    display: grid;
  }
  .heart-badge {
    width: 20px;
    height: 20px;
  }
  /* A folded list's last place (refit's fold): how many more, the size of what it stands for. */
  .thumb.more,
  .seal-more {
    display: grid;
    place-items: center;
    color: var(--gold-hi);
    cursor: pointer;
  }
  .thumb.more .n {
    font-size: calc(var(--t) * 0.32);
  }
  .seal-more {
    width: 36px;
    height: 36px;
    padding: 0;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--line);
    border-radius: 50%;
    transition: border-color 0.2s;
  }
  .seal-more:hover {
    border-color: var(--gold-lo);
  }
  .more-line {
    padding: 0 0 0 36px;
    background: none;
    border: 0;
    font: inherit;
    font-style: italic;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.2s;
  }
  .more-line:hover {
    color: var(--gold-hi);
  }
  .lives .more-line {
    padding-left: calc(var(--t) + 0.9rem);
  }

  /* Achievements, as the codex lists them: the seal, the title, what it asks. */
  .earned {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.8rem;
  }
  .earned li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .ach {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  /* As the codex lists an earned one (CodexAchievements). */
  .ach b {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    color: var(--gold-hi);
  }
  .ach span {
    font-size: 0.95rem;
    line-height: 1.3;
    color: #cbbfa8;
  }

  /* ---- where your lives went ---- */
  .lives {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .lives li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .lives {
    --t: 46px;
  }
  .lives .thumb {
    flex: none;
  }
  .thumb.given,
  .thumb.blank {
    cursor: default;
  }
  /* A loss without its item: the zone's emblem in the square, in the zone's colour, as the descent draws it. */
  .thumb.blank svg {
    position: absolute;
    inset: 18%;
    width: 64%;
    height: 64%;
    overflow: visible;
  }
  .thumb.blank path {
    fill: none;
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .thumb.blank .s-fine {
    stroke-width: 0.6;
  }
  .thumb.blank .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.45;
  }
  .heart-big {
    width: 26px;
    height: 26px;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .what .title {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 1.05em;
    color: #f3c37e;
  }
  .what .where {
    font-size: 0.82em;
    font-style: italic;
    color: var(--muted);
  }
  .vial {
    --phial-w: 50px;
    flex: none;
  }
  /* A ward broken on the cave-in, its two halves apart, as the reveal leaves it (QuestionView .lost-ward). */
  .broken-ward {
    --h: 22px;
    position: relative;
    flex: none;
    width: 16px;
    height: 22px;
    margin-right: -0.5rem;
  }
  .broken-ward .piece {
    position: absolute;
    left: 0;
    top: 0;
    opacity: 0.58;
    transform-origin: 50% 90%;
  }
  .broken-ward .l {
    transform: translate(-3px, 1px) rotate(-14deg);
  }
  .broken-ward .r {
    transform: translate(3px, 1px) rotate(11deg);
  }

  /* ---- the ranking: the lobby's chips as rows ---- */
  .ranking {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .ranking.two {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(var(--rows), auto);
    grid-auto-flow: column;
    gap: 8px 10px;
  }
  .ranking li,
  .ranking .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    height: 54px;
    padding: 0 1rem;
    border-radius: 3px;
    background: rgba(12, 10, 8, 0.6);
    border: 1px solid var(--line);
  }
  .ranking.two li {
    height: 52px;
  }
  .rank {
    width: 1.1rem;
    font-family: var(--font-body);
    font-variant-numeric: lining-nums;
    font-size: 1.05rem;
    color: var(--muted);
  }
  .ranking .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.05rem;
  }
  .pts {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--gold-hi);
  }
  /* The winner's row in gold; yours outlined in your orange. */
  /* Dithered over its gradient (app.css, --dither), or so faint a gold bands. */
  .ranking li.first {
    border-color: #c9a45c;
    background: var(--dither), linear-gradient(90deg, rgba(201, 164, 92, 0.2), rgba(90, 64, 30, 0.12) 60%, rgba(12, 10, 8, 0.6));
    image-rendering: pixelated;
    box-shadow: 0 0 14px rgba(201, 164, 92, 0.18);
  }
  .ranking li.first > * {
    image-rendering: auto;
  }
  /* Set down last (rankIn), the winner's row ignites: its edge flares and
     settles, a soft glow swelling round it meanwhile (lib/fx/moments.ts
     winnerIgnites, as it starts: in CSS it would band), and from then on the headline's light runs across it with the
     headline's own, in step (.gold's gleam). */
  .ranking li.first {
    animation: ignite 1.2s calc(var(--winner-in) + 0.15s) var(--ease-out) backwards;
  }
  .ranking li.first::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    image-rendering: auto;
    background: linear-gradient(100deg, transparent 42%, rgba(255, 244, 214, 0.2) 50%, transparent 58%) no-repeat;
    background-size: 250% 100%;
    background-position: 160% 0;
    animation: gleam 5s ease-in-out 1.4s infinite;
  }
  @keyframes ignite {
    0% {
      border-color: var(--line);
    }
    30% {
      border-color: #f6e3ad;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ranking li.first,
    .ranking li.first::after {
      animation: none;
    }
  }
  :global(:root[data-still]) .ranking li.first,
  :global(:root[data-still]) .ranking li.first::after {
    animation: none;
  }
  .ranking li.you:not(.first),
  .ranking .row.you {
    border-color: rgba(224, 138, 68, 0.85);
    box-shadow: 0 0 12px rgba(224, 138, 68, 0.3);
  }
  /* Someone who left: dimmed, the lobby's offline mark before the score. */
  .ranking li.gone > :not(.anchor) {
    opacity: 0.5;
  }
  .anchor {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* ---- the party: the in-game scoreboard's plates ---- */
  .plates {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0 0 1rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    border-bottom: 1px solid rgba(125, 99, 51, 0.35);
  }
  .plates.pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* The avatar inset from the plate's left end as far as from its top and bottom (--av, the avatar's size). */
  .plates li {
    --ph: 48px;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    height: var(--ph);
    padding: 0 0.7rem 0 calc((var(--ph) - 2px - var(--av)) / 2);
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.75);
    border: 1px solid var(--line);
  }
  .plates.many {
    gap: 6px;
  }
  .plates.many li {
    --ph: 40px;
  }
  .plates li.you {
    border-color: rgba(224, 138, 68, 0.85);
    box-shadow: 0 0 12px rgba(224, 138, 68, 0.3);
  }
  .plates li.gone {
    opacity: 0.5;
  }
  .who-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  /* Clipped for its ellipsis, so its box reaches down past the descenders (a g, a y), as the lobby's chips do. */
  .who-col .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.95rem;
    padding-bottom: 0.2em;
    margin-bottom: -0.2em;
  }
  .dep {
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  .revived {
    flex: none;
    width: 18px;
    height: 18px;
  }

  /* ---- the runs ---- */
  .runs {
    margin-bottom: 0.4rem;
  }
  .cap {
    margin: 0.2rem 0 0.7rem;
    font-style: italic;
    font-size: 1rem;
    color: #c4b69c;
  }
  /* The run's facts hang from the chart's ground line: the first one's mark centred on it (--ground: lib/runsPlate's GROUND_Y). */
  .chart-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }
  .chart-row .fx {
    flex: 1;
    min-width: 0;
    padding-top: calc(var(--ground) - var(--icon, 26px) / 2);
  }

  /* ---- lines with an icon in front: the highlights, the run's facts ---- */
  .fx {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    font-size: var(--hl);
  }
  .runs .fx {
    gap: 8px;
  }
  .fx li {
    --icon: 26px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    line-height: 1.35;
  }
  /* A line's first row of words centred on its mark. */
  .fx .txt {
    padding-top: calc((var(--icon) - 1.35em) / 2);
  }
  .ic {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    min-height: 26px;
  }
  /* A sign in an item's box, centred in it. */
  .mini.sign {
    display: grid;
    place-items: center;
    cursor: default;
  }
  .mini.sign:hover {
    border-color: var(--line);
  }
  .mini {
    position: relative;
    display: block;
    width: 26px;
    height: 26px;
    padding: 0;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--line);
    border-radius: 2px;
    cursor: zoom-in;
    transition: border-color 0.2s;
  }
  .mini:hover {
    border-color: var(--gold-lo);
  }
  .mini img {
    position: absolute;
    inset: 2px;
    width: calc(100% - 4px);
    height: calc(100% - 4px);
    object-fit: contain;
  }
  /* A find's item at the size it is drawn for (the lobby's finds list, the reveal's lines). */
  .glyph-ic {
    --h: 15px;
    display: inline-flex;
  }
  .heart-ic {
    width: 20px;
    height: 20px;
  }
  /* A zone's emblem, as the descent and the runs chart draw it, in the zone's colour. */
  .zone-ic {
    width: 18px;
    height: 18px;
    overflow: visible;
  }
  .zone-ic path {
    fill: none;
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .zone-ic .s-fine {
    stroke-width: 0.55;
  }
  .zone-ic .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.4;
  }
  /* A category's emblem, in gold, as the codex shows it. */
  .cat-ic {
    width: 20px;
    height: 20px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
  }
  .txt {
    min-width: 0;
  }
  /* New in your codex: each unique a small thumb that opens its codex page. */
  .minis {
    display: flex;
    flex-wrap: wrap;
  }
  /* The size the row's fit is counted in (miniSize). */
  .minis .mini {
    width: var(--mini);
    height: var(--mini);
  }
  .mini.more {
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .mini.more .n {
    font-size: max(11px, calc(var(--mini) * 0.32));
  }
  /* The finds, as the lobby lists them. */
  .finds li[data-find='azurite'] {
    --find: #a9cdf5;
  }
  .finds li[data-find='flare'] {
    --find: #f7a3b3;
  }
  .finds li[data-find='dynamite'] {
    --find: #eebf96;
  }
  .finds .txt {
    display: flex;
    flex-direction: column;
    font-size: 0.93rem;
    line-height: 1.3;
    color: var(--text);
  }
  .find-name {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--find);
  }
  .finds .miss {
    color: color-mix(in srgb, var(--find) 45%, var(--muted));
  }

  .highlights,
  .found,
  .board .earned-sec {
    margin-top: 1.3rem;
  }
  /* How many, on the heading's line at its right, as the captions read. */
  .found h3 {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  .found .count {
    font-family: var(--font-body);
    font-size: 0.8em;
    font-style: italic;
    letter-spacing: 0;
    color: #c4b69c;
  }

  /* Share run: the lobby's small Lock button. */
  .share-wrap {
    display: inline-flex;
  }
  .share {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    padding: 0.4em 0.8em;
    border-radius: 3px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    color: var(--muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .share:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .share svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* ---- the start row: the lobby's Begin ---- */
  .start {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1.3rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--line);
  }
  .start.centre {
    justify-content: center;
  }
  .status {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.25rem;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-style: italic;
    font-size: 0.95rem;
    color: var(--muted);
  }
  .note.warn {
    color: #eab3a3;
  }
  .note .ic {
    min-height: 0;
  }
  .note.spect {
    flex: 1;
    font-size: 1rem;
    font-style: normal;
  }
  /* Just watch: the size of the host's Back to lobby. */
  .start :global(.btn.small) {
    margin: 0;
    padding: 0.7em 1.4em;
    font-size: 0.85rem;
  }
  .check {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--gold-hi);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .eye {
    --eye-size: 18px;
    color: var(--muted);
  }
  .buttons {
    display: flex;
    gap: 0.9rem;
    margin-left: auto;
  }
  .host {
    font-weight: 400;
    color: var(--text);
  }
  .waiting {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin: 0;
    color: var(--muted);
  }
  .pulse {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gold);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
      transform: scale(0.7);
    }
  }

  /* ---- short windows (a 13-inch laptop): Home's ---- */
  .over.short {
    --h1: 44px;
    --sub: 16px;
    --body: 16px;
    --hl: 16px;
    --fade: 46.9%, rgba(0, 0, 0, 0.3) 63.85%, transparent 73.08%;
  }
  .over.short.delve {
    --h1: 52px;
    --sub: 15px;
    --hl: 15px;
  }
  .short .foot {
    padding-top: 10px;
    padding-bottom: 14px;
  }
  /* (Past .short's too.) */
  .over .foot.snug {
    padding-top: 6px;
    padding-bottom: 10px;
  }

  /* ---- a column set closer, step by step, until it ends in the window (fit, in the script) ---- */
  /* Measured as it will stand: no transition may hold a size back (reduced motion gives everything one). */
  .stage:global(.fitting) :global(*) {
    transition-property: none !important;
  }
  /* 1: a tighter rhythm (a short window's from the start). */
  .board.tight {
    padding-block: 16px;
  }
  .tight .sec h3,
  .board.tight header {
    margin-bottom: 0.6rem;
    padding-bottom: 0.45rem;
  }
  .tight .yours {
    --t: 50px;
    margin-top: 1rem;
  }
  .tight .yours p {
    margin-bottom: 0.5rem;
  }
  .tight .ranking li {
    height: 40px;
  }
  .tight .ranking.two li {
    height: 36px;
  }
  .tight .ranking {
    gap: 6px;
  }
  .tight .lives {
    --t: 42px;
  }
  .tight .plates li {
    --ph: 42px;
  }
  .tight .plates.many li {
    --ph: 35px;
  }
  .tight .plates.many {
    gap: 5px;
  }
  .tight .highlights,
  .board.tight .earned-sec {
    margin-top: 0.9rem;
  }
  .tight .found {
    margin-top: 0.7rem;
  }
  .tight .found h3 {
    margin-bottom: 0.45rem;
    padding-bottom: 0.35rem;
  }
  .tight .fx {
    gap: 8px;
  }
  .tight .start {
    margin-top: 0.9rem;
    padding-top: 0.9rem;
  }
  /* 2: rows closer: the lives, the thumbs of your misses (smaller), the finds. */
  .close .lives-sec {
    margin-top: 1rem;
  }
  .close .lives {
    --t: 34px;
    gap: 5px;
  }
  .close .lives .what {
    line-height: 1.1;
  }
  .close .yours {
    --t: 44px;
  }
  .close .runs .finds {
    gap: 5px;
  }
  /* 3: compact lists. Achievements side by side, seal and title, what each asks on hover (and still read out); the
     finds, what each does without its rule. */
  .compact .earned {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 0.6rem 0.9rem;
  }
  .compact .earned li {
    gap: 0.6rem;
  }
  /* (Only where a tooltip can show it: a touch screen in two columns, a tablet on its side, keeps it to read.) */
  @media (hover: hover) {
    .compact .ach span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .compact .finds .miss {
    display: none;
  }
  /* 4: smaller: the circle and the runs chart (in the script), the rows of lives and the thumbs. */
  .small .lives {
    --t: 28px;
    gap: 3px;
  }
  .small .lives .title {
    font-size: 0.98em;
  }
  .small .lives .where {
    font-size: 0.78em;
  }
  .small .yours {
    --t: 40px;
  }

  /* ---- between a phone and a desktop: one column, 600 wide, the circle first (TWO_COLUMNS, in the script, past it) ---- */
  @media (max-width: 1080px) {
    .stage {
      flex-direction: column;
      align-items: center;
      gap: 2rem;
      padding: 28px 20px 0;
    }
    .side,
    .board {
      width: min(600px, 100%);
    }
    .side.centred {
      align-self: center;
    }
  }

  /* ---- phones: one column, scrolling, the start row docked ---- */
  .over.phone {
    --h1: 36px;
    --sub: 16px;
    --body: 16px;
    --hl: 16px;
  }
  .over.phone.solo {
    --h1: 56px;
  }
  .over.phone.together {
    --h1: 52px;
  }
  .phone .stage {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1.6rem;
    padding: 16px 16px 0;
  }
  /* The two columns give their parts to the page's one: normal games the
     ranking, your game, the highlights; Delve the lives, then the mode's block, then the highlights and what's new in your codex. */
  .phone .side,
  .phone .board {
    display: contents;
  }
  .phone .board::before,
  .phone .board::after {
    display: none;
  }
  .phone .result {
    order: 1;
  }
  .phone .main {
    order: 2;
  }
  .phone .yours {
    order: 3;
    margin-top: 0;
  }
  .phone.delve .yours {
    order: 2;
  }
  .phone.delve .main {
    order: 3;
  }
  .phone .board .earned-sec,
  .phone .highlights,
  .phone .found {
    order: 4;
    margin-top: 0;
  }
  .phone .sub {
    max-width: 358px;
  }
  .phone .ranking li {
    height: 46px;
    padding: 0 0.9rem;
  }
  .phone .yours {
    --t: 64px;
  }
  .phone .plates {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .phone .plates li {
    --ph: 42px;
  }
  .phone .chart-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .phone .lives {
    --t: 46px;
  }
  .phone .foot {
    padding: 28px 16px 20px;
  }
  /* Past six players, the rows tighten. */
  .phone .ranking:has(li:nth-child(7)) li {
    height: 40px;
  }

  /* The dock: fixed to the bottom, opaque, a hairline on top and a short fade above it. */
  .dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    padding: 0.6rem max(16px, env(safe-area-inset-right)) max(0.6rem, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: #0b0907;
    border-top: var(--pinned-line);
  }
  .dock::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 1px);
    height: 22px;
    /* A see-through dark layer over the page scrolling under it: dithered (app.css), or it bands. */
    image-rendering: pixelated;
    background: linear-gradient(rgba(11, 9, 7, 0), #0b0907), var(--dither);
    pointer-events: none;
  }
  .dock-row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 48px;
  }
  .dock-row .buttons {
    flex: 1;
    margin: 0;
    gap: 0.6rem;
  }
  .dock-row .btn {
    min-height: 48px;
  }
  .dock-row .back {
    padding-inline: 0.8em;
    font-size: 0.78rem;
  }
  .dock-row .again {
    flex: 1;
    padding-inline: 0.6em;
  }
  .dock-row .status {
    display: none;
  }
  /* Your row riding on the dock's top edge, one opaque piece with it. */
  .pinned {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    padding: 8px 16px 6px;
    background: #0b0907;
  }
  .pinned .row {
    height: 46px;
    padding: 0 0.9rem;
  }
  .pinned .name {
    flex: 1;
  }

  @media (pointer: coarse) {
    .share {
      min-height: 44px;
    }
  }
  /* A phone on its side (lib/layout.ts `flat`): the circle (see `circle`),
     the headline and the room over them smaller, so the result, its line
     and the start row under them show on the first screen. */
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .over {
      --h1: 44px;
      --sub: 16px;
    }
    .over.delve {
      --h1: 46px;
    }
    .stage {
      padding-top: 4px;
    }
    .start.up {
      margin: 0.5rem 0 1.4rem;
      padding-top: 0.6rem;
    }
  }
</style>
