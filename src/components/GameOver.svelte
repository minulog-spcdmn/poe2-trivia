<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, scale, slide } from 'svelte/transition';
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
  import { fxActive, fxUserOn, onFxChange } from '../lib/fx/core';
  import { victory } from '../lib/fx/moments';
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

  const modeName = $derived(run ? `${MODE_NAMES.delve} ${solo ? 'alone' : 'together'}` : MODE_NAMES[s.settings.mode === 'race' || s.settings.mode === 'craft' ? s.settings.mode : 'turns']);
  const headline = $derived(run ? `Depth ${shownDepth(endDepth)}` : iWon ? 'You are victorious!' : `${winner?.name} wins!`);
  const line = $derived(run ? delveLine(endDepth, together, measured, !!run.mixed) : scoreLine(s, winner));

  // ---- sizes ---------------------------------------------------------------
  const short = new MediaQuery('(max-height: 859px) and (min-width: 1081px)');
  /** A phone on its side in its browser, the address bar taking its share of the height. */
  const flatShort = new MediaQuery('(orientation: landscape) and (max-height: 370px)');
  /** The rune circle's diameter (on a phone on its side, small enough that the headline and the start row under it show on the first screen). */
  const circle = $derived(phone.current ? 340 : flatShort.current ? 170 : flat.current ? 220 : short.current ? 380 : 470);
  /** How far up the circle the headline rides. */
  /**
   * Rows under "Where your lives went", from the run itself (the codex that
   * names them is read a moment later): each life lost, each given. Many of
   * them, and the rows close up (and from five the headline rides a little
   * higher on the circle), so the page still fits the window.
   */
  const lifeRows = $derived(run && self ? (run.losses[self]?.length ?? 0) + (run.revives ?? []).filter((v) => v.by === self).length : 0);
  const over = $derived(run ? (solo ? 0.3 : lifeRows >= 5 ? 0.3 : 0.25) : !hasYours ? 0.25 : short.current ? 0.37 : 0.36);
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
  const chartH = $derived(phone.current ? 170 : solo ? (short.current ? 150 : 190) : delvers.length > 6 ? (short.current ? 89 : 120) : short.current ? 110 : 150);

  // ---- what this device knows ------------------------------------------------
  /** This device's codex (its own answers), as the screen comes in; read again a moment later, should the game's last answer still have been on its way. */
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
  /** The uniques met this run, and of those met for the first time. */
  const met = $derived.by(() => {
    const from = run?.startedAt ?? Infinity;
    const items = codex ? Object.entries(codex.items) : [];
    const fresh = items.filter(([, e]) => e.first >= from).sort((a, b) => b[1].first - a[1].first);
    return { met: items.filter(([, e]) => e.last >= from).length, fresh: fresh.length, newest: fresh[0]?.[0] };
  });
  const facts = $derived(run ? runFacts(s, solo ? self : null) : []);
  const lines = $derived<Line[]>(!run ? highlights(s) : solo && self ? soloHighlights(s, self, met, first) : partyHighlights(s));

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

  // ---- the effects ------------------------------------------------------------
  let canvas: HTMLCanvasElement;
  let crown = $state<HTMLElement>();
  let title = $state<HTMLElement>();
  let standingsEl = $state<HTMLElement>();

  // The celebration: rays, fireworks and glitter (lib/fx/moments.ts). A
  // descent ends instead with its last embers going out (lib/fx/delveEnd.ts).
  onMount(() => {
    if (!crown || !title || !winner) return;
    const h = run
      ? fallen(crown, title, { best: deeper, standings: solo ? null : standingsEl })
      : victory(crown, title, playerColor(winner.hue), iLost, standingsEl);
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

{#snippet lineList(list: Line[])}
  <ul class="fx">
    {#each list as l, i (i)}
      <li>{@render icon(l.icon)}<span class="txt">{@render say(l.parts)}</span></li>
    {/each}
  </ul>
{/snippet}

<!-- An item's thumb that opens its codex page, its name under it. -->
{#snippet thumb(id: string, badge?: string)}
  {@const by = badge ? personOf(badge) : undefined}
  <li>
    <button class="thumb" onclick={() => inspect(id)} aria-label="{itemName(id)}, open in the codex">
      <span class="art"><img src={itemThumb(id, 128)} srcset={itemSrcset(id)} alt="" /></span>
      {#if by}<span class="badge"><Avatar name={by.name} hue={by.hue} sigil={by.sigil} size={20} /></span>{/if}
    </button>
    <span class="thumb-name">{itemName(id)}</span>
  </li>
{/snippet}

{#snippet achievements(list: Achievement[])}
  <ul class="earned">
    {#each list as a (a.id)}
      <li>
        <AchievementSeal sign={a.sign} tier={a.tier} earned size={short.current ? 42 : 50} />
        <span class="ach"><b>{a.title}</b><span>{a.text}</span></span>
      </li>
    {/each}
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
        >{#if session.justWatching}You're watching; <b class="host">{host}</b> starts the next {run ? 'run' : 'game'} without you.{:else if together}You join the next run once <b
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
  <div class="stage">
    <div class="side" class:centred={!hasYours}>
      <div class="result">
        <div class="plate" aria-hidden="true" in:scale={{ start: 0.85, duration: 900 }}>
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
            in:scale={{ start: 0.4, duration: 900, delay: 200 }}
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
            <h1 data-cursor="headline" bind:this={title} use:fit={headline} in:fly={{ y: 20, duration: 700, delay: 500 }}>
              <span class="shade" aria-hidden="true">{headline}</span>
              <span class="gold">{headline}</span>
            </h1>
            <p class="sub" data-cursor="sub" in:fly={{ y: 10, duration: 700, delay: 700 }}>{@render say(line)}</p>
          </div>
        {/if}
      </div>

      {#if flat.current && !phone.current}
        <!-- A phone on its side: what's next straight under the result, in reach on the first screen
             (a bar docked across so short a screen would take too much of it); the details below. -->
        <div class="start up" class:centre={!session.isHost && !session.spectating}>{@render startRow()}</div>
      {/if}

      {#if mine}
        <section class="sec yours" data-cursor="yours" in:fade={{ duration: 600, delay: 900 }}>
          <h3>Your game</h3>
          {#if mine.place}
            {@const p = s.players.find((x) => x.id === me)}
            <p class="place">{#if p}<Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={30} />{/if}<span>{@render say(mine.place)}</span></p>
          {/if}
          {#if mine.game}<p>{@render say(mine.game)}</p>{/if}
          {#if mine.missed.length}
            <p>{mine.missedLead}</p>
            <ul class="thumbs">{#each mine.missed as id (id)}{@render thumb(id)}{/each}</ul>
          {/if}
          {#if earned.length}
            <!-- Judged as the game ends, it can come in after the screen: it opens out rather than jumping in. -->
            <div in:slide={{ duration: 450 }}>
              <p>Earned this game:</p>
              {@render achievements(earned)}
            </div>
          {/if}
        </section>
      {:else if hotMisses.length}
        <section class="sec yours" data-cursor="yours" in:fade={{ duration: 600, delay: 900 }}>
          <h3>Missed answers</h3>
          <p>Kept in this device’s codex.</p>
          <ul class="thumbs">{#each hotMisses as m (m.id)}{@render thumb(m.id, m.by)}{/each}</ul>
        </section>
      {:else if run && self && lives.length}
        <section class="sec yours lives-sec" data-cursor="yours" in:fade={{ duration: 600, delay: 900 }}>
          <h3>Where your lives went</h3>
          <ul class="lives" class:many={Math.max(lives.length, lifeRows) >= 4} class:lots={Math.max(lives.length, lifeRows) >= 5}>
            {#each lives as l, i (i)}
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
          </ul>
        </section>
      {/if}
    </div>

    <section class="board panel" use:backdropShadow={{ fill: 'linear', off: phone.current }} in:fly={{ x: 30, duration: 500, delay: 200 }}>
      <div class="main">
        <header>
          <h2>{modeName}</h2>
          {#if canShare}
            <span class="share-wrap">
              <button class="share" data-cursor="share" onclick={shareDepth} title={together ? "Share the team's depth" : 'Share your depth'}>
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
          <ol class="ranking" class:two={twoCols} style:--rows={Math.ceil(rows.length / 2)} data-cursor="standings" bind:this={standingsEl}>
            {#each rows as x, i (x.p.id)}
              <li
                class:first={s.winners.includes(x.p.id) || (!s.winners.length && x.rank === 1)}
                class:you={x.p.id === me}
                class:gone={!local && !x.p.connected}
                data-cursor="row:{s.players.indexOf(x.p)}"
                in:fly={{ x: -16, duration: 400, delay: 500 + i * 70 }}
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
                <li class:you={d.id === me} class:gone={!p.connected} data-cursor="row:{s.players.indexOf(p)}" in:fly={{ y: 8, duration: 400, delay: 500 + i * 60 }}>
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
              {#if earned.length}
                <div in:slide={{ duration: 450 }}>
                  <p class="cap">Earned this run</p>
                  {@render achievements(earned)}
                </div>
              {/if}
              {#if facts.length > 1}
                <p class="cap">This run</p>
                {@render lineList(facts.slice(1))}
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
                {@render lineList(facts)}
              </div>
            {:else}
              <p class="cap">This run</p>
              {@render lineList(facts)}
            {/if}
          </div>
        {/if}
      </div>

      {#if lines.length}
        <section class="sec highlights" data-cursor="highlights" in:fade={{ duration: 600, delay: 1000 }}>
          <h3>Highlights</h3>
          {@render lineList(lines)}
        </section>
      {/if}

      {#if !phone.current && !flat.current}
        <div class="start" class:centre={!session.isHost && !session.spectating}>{@render startRow()}</div>
      {/if}
    </section>
  </div>

  <div class="foot"><SiteFooter inRoom /></div>
</div>

{#if phone.current}
  <!-- Phones: the start row docked at the foot of the screen, where the thumb rests (lib/layout's dock). -->
  <div class="dock" class:host={session.isHost} use:portal use:dock bind:offsetHeight={dockH} in:fade={{ duration: 200 }} out:fade|global={{ duration: 180 }}>
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
    padding: max(clamp(10px, 2.4vh, 40px), (100dvh / var(--stage-zoom, 1) - var(--header-h, 64.6px) - var(--legal-h, 44.1px) - 724px) / 2)
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

  /* An item's thumb: the codex's square, its name under it in the display font. */
  .thumbs {
    list-style: none;
    margin: 0 0 0.8rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem 6px;
  }
  /* A thumb every 94 px (at 60), its name wrapping within that. */
  .thumbs li {
    width: calc(var(--t) + 28px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
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
  .thumb-name {
    font-family: var(--font-display);
    font-size: 14px;
    line-height: 1.15;
    color: #f3c37e;
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
  .lives.many {
    gap: 5px;
  }
  .lives.lots {
    gap: 3px;
  }
  .lives-sec:has(.many) {
    margin-top: 1rem;
  }
  .lives.many .what {
    line-height: 1.1;
  }
  .lives.lots .title {
    font-size: 0.98em;
  }
  .lives.lots .where {
    font-size: 0.78em;
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
  .lives.many {
    --t: 38px;
  }
  .lives.lots {
    --t: 32px;
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
  .runs .earned {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.35);
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

  .highlights {
    margin-top: 1.3rem;
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
  .short .board {
    padding-block: 16px;
  }
  .short .foot {
    padding-top: 10px;
    padding-bottom: 14px;
  }
  .short .sec h3,
  .short .board header {
    margin-bottom: 0.6rem;
    padding-bottom: 0.45rem;
  }
  .short .yours {
    margin-top: 1rem;
  }
  .short .yours p {
    margin-bottom: 0.5rem;
  }
  .short .ranking li {
    height: 40px;
  }
  .short .ranking.two li {
    height: 36px;
  }
  .short .ranking {
    gap: 6px;
  }
  .short .yours {
    --t: 50px;
  }
  .short .lives {
    --t: 42px;
  }
  .short .lives.many {
    --t: 32px;
  }
  .short .lives.lots {
    --t: 28px;
  }
  .short .plates li {
    --ph: 42px;
  }
  .short .plates.many li {
    --ph: 35px;
  }
  .short .plates.many {
    gap: 5px;
  }
  .short .highlights {
    margin-top: 0.9rem;
  }
  .short .fx {
    gap: 8px;
  }
  .short .start {
    margin-top: 0.9rem;
    padding-top: 0.9rem;
  }

  /* ---- between a phone and a desktop: one column, 600 wide, the circle first ---- */
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
     ranking, your game, the highlights; Delve the lives, then the mode's block, then the highlights. */
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
  .phone .highlights {
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
  .phone .lives:not(.many) {
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
  @media (orientation: landscape) and (max-height: 500px) {
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
