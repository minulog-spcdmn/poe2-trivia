<script lang="ts">
  import { sfx } from '../lib/sound';
  import { cubicOut } from 'svelte/easing';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import Phial from './Phial.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { untrack, type Snippet } from 'svelte';
  import { fxActive, onFxChange, type Handle } from '../lib/fx/core';
  import { FILL_SPAN, FILL_START, SCORE_LANDS, ablaze, doused, lifeLost, lostPoint, turnsBlue } from '../lib/fx/moments';
  import { scoreRow, scoreRowOf } from '../lib/scoreRows';
  import { burnsBlue, heatOf, streakOf } from '../lib/fx/streaks';
  import { phone } from '../lib/layout';
  import { fellAt, livesOf } from '../lib/delve';

  /** Shown at the end of the row (the timer, on phones). */
  let { aside }: { aside?: Snippet } = $props();

  const s = $derived(session.state!);
  const target = $derived(s.settings.targetScore);
  const race = $derived(s.settings.mode === 'race');
  const missed = $derived(new Set(s.question?.misses.map((m) => m.playerId) ?? []));
  const canKick = $derived(session.mode === 'host');
  const spectators = $derived(s.spectators ?? []);
  /** Delve: lives instead of a score. */
  const run = $derived(s.delve ?? null);

  const area = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width * r.height;
  };
  // Delve: a life lost makes the player's entry flinch, and the chamber of the phial empties.
  // In step with the reveal's verdict, a moment after the answer shows.
  let hit = $state<Record<string, number>>({});
  let livesSeen: Record<string, number> = {};
  let runSeen = 0;
  $effect(() => {
    if (!run) return;
    if (run.startedAt !== runSeen) {
      runSeen = run.startedAt;
      livesSeen = {};
    }
    for (const p of s.players) {
      const now = livesOf(s, p.id);
      const was = livesSeen[p.id];
      livesSeen[p.id] = now;
      if (was === undefined || now >= was) continue;
      const id = p.id;
      const mine = session.mode === 'local' ? true : id === session.myPlayerId;
      setTimeout(() => {
        hit[id] = now;
        const li = scoreRowOf(id);
        // The fire bursts out of the chamber that emptied, wherever the phial shows (lying or upright).
        // A fallen player's phial is gone (only a hidden one is left): then out of their row.
        const chamber =
          li &&
          [...li.querySelectorAll(`.chamber[data-k="${now}"]`)]
            .filter((c) => area(c) > 0)
            .sort((a, b) => area(b) - area(a))[0];
        if (li) lifeLost(li, chamber ?? li, now, mine);
        if (mine) sfx('lifeLost');
        setTimeout(() => {
          if (hit[id] === now) delete hit[id];
        }, 1200);
      }, 450);
    }
  });

  // Changes that wait for a point to land (the score ticking up, a streak's
  // fire growing), per player: the value they land on and their timers.
  // Other updates from the host in the meantime leave them running.
  type Landing = { to: number; timers: ReturnType<typeof setTimeout>[] };
  /** Cancels whatever is under way for player `id` in `under`. */
  function cancel(under: Map<string, Landing>, id: string) {
    under.get(id)?.timers.forEach(clearTimeout);
    under.delete(id);
  }
  /** Runs `steps` (seconds from now, action) for player `id`, landing on `to`. The last step ends it. */
  function land(under: Map<string, Landing>, id: string, to: number, steps: [number, () => void][]) {
    cancel(under, id);
    const timers = steps.map(([at, act], i) =>
      setTimeout(() => {
        if (i === steps.length - 1) under.delete(id);
        act();
      }, at * 1000),
    );
    under.set(id, { to, timers });
  }

  // Scores as shown. A point won at a reveal flows into the scorer's bar as a
  // stream of sparks (see fillBar in lib/fx/moments.ts): the bar fills while
  // they land, and the number ticks up when the last one has.
  let shown = $state<Record<string, number>>({});
  let barShown = $state<Record<string, number>>({});
  let filling = $state<Record<string, boolean>>({});
  const awards = new Map<string, Landing>();
  const latest = (id: string, fallback: number) => session.state?.players.find((x) => x.id === id)?.score ?? fallback;
  $effect(() => {
    for (const p of s.players) {
      const score = p.score;
      const was = untrack(() => shown[p.id]);
      if (was === undefined || score === was) {
        if (was === undefined) shown[p.id] = barShown[p.id] = score;
        continue;
      }
      if (awards.get(p.id)?.to === score) continue;
      if (score > was && fxActive() && s.phase === 'reveal') {
        land(awards, p.id, score, [
          [
            FILL_START,
            () => {
              filling[p.id] = true;
              barShown[p.id] = latest(p.id, score);
            },
          ],
          [
            SCORE_LANDS,
            () => {
              filling[p.id] = false;
              shown[p.id] = barShown[p.id] = latest(p.id, score);
              // A streak's fire grows as the number ticks up.
              heat[p.id] = heatOf(streakOf(session.state?.players.find((x) => x.id === p.id)), !!session.state?.delve);
            },
          ],
        ]);
      } else {
        cancel(awards, p.id);
        if (score < was) {
          const li = scoreRowOf(p.id);
          if (li) lostPoint(li);
        }
        filling[p.id] = false;
        shown[p.id] = barShown[p.id] = score;
      }
    }
  });
  const scoreOf = (id: string, fallback: number) => shown[id] ?? fallback;
  const barOf = (id: string, fallback: number) => barShown[id] ?? fallback;

  // Players on a streak burn. The fire grows with the score, as the number
  // ticks up (the award's last step above); a broken streak puts it out at once.
  let heat = $state<Record<string, number>>({});
  $effect(() => {
    const here = new Set<string>();
    for (const p of s.players) {
      here.add(p.id);
      const h = heatOf(streakOf(p), !!s.delve);
      const was = untrack(() => heat[p.id] ?? 0);
      if (h > was && awards.has(p.id)) continue;
      if (h !== was) heat[p.id] = h;
    }
    // Players who left take their fire with them.
    for (const id of Object.keys(untrack(() => heat))) if (!here.has(id)) delete heat[id];
  });
  $effect(() => () => {
    for (const id of [...awards.keys()]) cancel(awards, id);
  });

  /** Svelte action: sets a row burning at `h` (0 to 1), re-lit as it changes. `delve`: the long scale (lib/fx/streaks). */
  function burn(node: HTMLElement, o: { h: number; delve: boolean }) {
    let fire: Handle | null = null;
    let lit = 0;
    let delve = o.delve;
    const set = ({ h: next, delve: long }: { h: number; delve: boolean }) => {
      delve = long;
      if (next === lit) return;
      fire?.stop(0.5);
      fire = next > 0 ? ablaze(node, next, burnsBlue(next, delve)) : null;
      if (lit > 0 && next === 0) doused(node);
      if (lit > 0 && !burnsBlue(lit, delve) && burnsBlue(next, delve)) turnsBlue(node);
      lit = next;
    };
    set(o);
    // Effects switched off and on, or the GL context lost and restored, wipe
    // every shape: light it again on the new one.
    const relight = onFxChange(() => {
      fire?.stop(0);
      fire = lit > 0 ? ablaze(node, lit, burnsBlue(lit, delve)) : null;
    });
    return {
      update: set,
      destroy: () => {
        relight();
        fire?.stop(0.3);
      },
    };
  }

  // Kicking takes two clicks so a stray tap doesn't remove anyone.
  let confirming = $state<string | null>(null);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  function kick(id: string) {
    if (confirming !== id) {
      confirming = id;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => (confirming = null), 3000);
      return;
    }
    confirming = null;
    session.kick(id);
  }

  /**
   * Svelte animation: entries glide to their new places. Unlike flip it never
   * scales them, which would stretch a pill (and its avatar) as it grows or
   * shrinks between turns on phones. It moves them with `translate`, so the
   * active entry's own transform stays.
   */
  function glide(_node: Element, { from, to }: { from: DOMRect; to: DOMRect }) {
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    return { duration: 400, easing: cubicOut, css: (_t: number, u: number) => `translate: ${u * dx}px ${u * dy}px` };
  }

  // Stuck (phones only): the strip sticks 1px above the top of the screen, so
  // once it has, it no longer fits in the view. Its background then covers
  // what the backdrop draws under the entries, so CSS paints their shadows.
  let strip = $state<HTMLElement>();
  let stuck = $state(false);
  $effect(() => {
    stuck = false;
    if (!phone.current || !strip) return;
    const io = new IntersectionObserver(([e]) => (stuck = e.intersectionRatio < 1 && e.boundingClientRect.top < 0), {
      threshold: 1,
    });
    io.observe(strip);
    return () => io.disconnect();
  });
</script>

<!-- On phones the row sticks to the top of the screen; once it has, it takes a
     background of its own over the content scrolling under it. -->
<div class="strip" class:stuck bind:this={strip}>
  <ol class="board" class:crowded={s.players.length > 6}>
    {#each s.players as p, i (p.id)}
      {@const active = race ? s.phase === 'reveal' && s.reveal?.winnerId === p.id : i === s.turn && s.phase !== 'over'}
      {@const out = race && s.phase !== 'over' && missed.has(p.id)}
      {@const benched = !!s.deathmatch && s.phase !== 'over' && !s.deathmatch.alive.includes(p.id)}
      {@const duelist = !!s.deathmatch && s.phase !== 'over' && s.deathmatch.alive.includes(p.id)}
      {@const score = scoreOf(p.id, p.score)}
      {@const fire = heat[p.id] ?? 0}
      {@const lives = run ? livesOf(s, p.id) : 0}
      {@const fell = run ? fellAt(s, p.id) : null}
      <li
        use:backdropShadow={{ off: stuck }}
        use:scoreRow={p.id}
        use:burn={{ h: fire, delve: !!run }}
        class:ablaze={fire > 0}
        style:--heat={fire}
        style:--blue={burnsBlue(fire, !!run) ? 1 : 0}
        class:active class:out class:benched class:duelist class:fallen={fell !== null} class:hit={p.id in hit} class:offline={!p.connected} animate:glide style:--c={playerColor(p.hue)}>
        <Avatar name={p.name} hue={p.hue} size={32} dim={!p.connected} />
        <div class="info">
          <span class="name">
            <PlayerName name={p.name} />{#if session.mode !== 'local' && p.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}
          </span>
          {#if run && fell !== null}
            <span class="fell-at">Fell at depth {fell}</span>
          {:else if run}
            <Phial {lives} draining={hit[p.id] ?? -1} />
          {:else}
            <span class="bar" class:filling={filling[p.id]} style:--fill-span="{FILL_SPAN}s"
              ><span style:width="{Math.max(0, Math.min(100, (barOf(p.id, p.score) / target) * 100))}%"></span></span
            >
          {/if}
        </div>
        {#if run}
          <!-- Phones only, on the entries shrunk to an avatar: the phial upright beside it. -->
          <span class="phial-side"><Phial {lives} draining={hit[p.id] ?? -1} vertical /></span>
        {:else}
          {#key score}
            <span class="score" class:negative={score < 0} class:bump={race ? active : score > 0} class:down={out}
              >{score}</span
            >
          {/key}
        {/if}
        {#if !p.connected}<span class="off" title="Disconnected">⚡</span>{/if}
        {#if canKick && p.id !== s.hostId}
          <button
            class="kick"
            class:confirm={confirming === p.id}
            onclick={() => kick(p.id)}
            title="Remove {p.name} from the game"
            aria-label="Remove {p.name}"
          >
            {confirming === p.id ? 'Kick?' : '×'}
          </button>
        {/if}
        {#if out}<span class="x" title="Answered wrong">✕</span>{/if}
      </li>
    {/each}
  </ol>
  {@render aside?.()}
</div>
{#if spectators.length}
  <p class="watching">
    <span class="eye" aria-hidden="true">👁</span>
    Watching:
    {#each spectators as o (o.id)}
      <span class="spectator"
        >{o.name}{#if o.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}{#if canKick}<button
            class="kick-inline"
            class:confirm={confirming === o.id}
            onclick={() => kick(o.id)}
            title="Remove {o.name}"
            aria-label="Remove {o.name}">{confirming === o.id ? 'Kick?' : '×'}</button
          >{/if}</span
      >
    {/each}
    <span class="hint">· joining next game</span>
  </p>
{/if}

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 1rem 0.2rem 0.6rem;
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 160px;
    padding: 0.45rem 0.8rem 0.45rem 0.5rem;
    background: rgba(12, 10, 8, 0.75);
    border: 1px solid var(--line);
    border-radius: 999px;
    --bs1: 0px 22px;
    box-shadow:
      0 0 0 1px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      border-color 0.35s,
      --bs-ring 0.35s,
      --bs1-color 0.35s,
      transform 0.35s var(--ease-out),
      opacity 0.35s;
  }
  li.active .name {
    color: #fff4e0;
  }
  li.active {
    background: rgba(20, 16, 11, 0.85);
    border-color: var(--c);
    --bs-ring: color-mix(in srgb, var(--c), transparent 60%);
    --bs1-color: color-mix(in srgb, var(--c), transparent 70%);
    transform: translateY(-2px) scale(1.04);
  }
  /* On a streak: the entry smoulders under its flames (and still glows with effects off). */
  li.ablaze {
    /* Orange, and blue at the top of a streak. */
    --flame: color-mix(in srgb, rgb(70, 140, 255) calc(var(--blue) * 100%), rgb(255, 110, 30));
  }
  /* Borders that say something (whose turn, answered wrong, a duelist) win over the fire's. */
  li.ablaze:not(.active, .out, .duelist) {
    border-color: color-mix(in srgb, var(--flame) calc(50% + 50% * var(--heat)), transparent);
  }
  li.ablaze::before {
    content: '';
    position: absolute;
    inset: -1px;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    box-shadow:
      0 0 calc(8px + 20px * var(--heat)) calc(4px * var(--heat)) color-mix(in srgb, var(--flame) calc(35% + 40% * var(--heat)), transparent),
      0 calc(-6px * var(--heat)) calc(14px + 26px * var(--heat)) color-mix(in srgb, var(--flame) calc(20% + 40% * var(--heat)), transparent);
    /* A fixed pace: changing an infinite animation's duration as the heat steps up makes it jump. */
    animation: smoulder 0.9s ease-in-out infinite alternate;
  }
  @keyframes smoulder {
    to {
      opacity: 0.55;
    }
  }
  li.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -10px;
    translate: -50% 0;
    border: 5px solid transparent;
    border-top-color: var(--c);
  }
  .kick {
    position: absolute;
    top: -8px;
    left: -6px;
    min-width: 20px;
    height: 20px;
    padding: 0 0.35em;
    border-radius: 10px;
    border: 1px solid rgba(224, 85, 63, 0.5);
    background: #1c0f0b;
    color: #ff9c86;
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
  }
  li:hover .kick,
  .kick:focus-visible,
  .kick.confirm {
    opacity: 1;
  }
  .kick.confirm {
    background: var(--bad);
    color: #fff;
  }
  @media (hover: none) {
    .kick {
      opacity: 0.8;
    }
  }
  li.benched {
    opacity: 0.4;
    filter: grayscale(0.7);
  }
  li.fallen {
    opacity: 0.45;
    filter: grayscale(0.85);
  }
  .fell-at {
    font-size: 0.8rem;
    font-style: italic;
    line-height: 1;
    color: var(--muted);
  }
  li.hit {
    animation: flinch 0.5s var(--ease-out);
    border-color: rgba(200, 60, 45, 0.7);
  }
  @keyframes flinch {
    20% {
      translate: -4px 0;
    }
    45% {
      translate: 3px 0;
    }
    70% {
      translate: -1px 0;
    }
  }
  /* The upright phial only shows on phones, beside an entry shrunk to an avatar (below). */
  .phial-side {
    display: none;
  }
  .info :global(.phial) {
    margin-top: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    li.hit {
      animation: none;
    }

  }
  li.duelist {
    border-color: rgba(224, 85, 63, 0.55);
  }
  li.out {
    border-color: rgba(224, 85, 63, 0.6);
    opacity: 0.75;
  }
  .x {
    position: absolute;
    top: -7px;
    right: -4px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: #fff;
    background: var(--bad);
    border-radius: 50%;
    animation: pop 0.35s var(--ease-back);
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
  }
  .negative {
    color: #ff9c86;
  }
  .down {
    animation: down 0.7s var(--ease-back);
  }
  @keyframes down {
    0% {
      transform: scale(2.1);
      color: var(--bad);
      text-shadow: 0 0 16px var(--bad);
    }
  }
  li.offline {
    opacity: 0.5;
  }
  .info {
    flex: 1;
    /* Short names keep the pill from shrinking to a stub (about as wide as "zoe_arcana" on a phone). */
    min-width: 57px;
    /* A little more air after the avatar than the row's gap. */
    margin-left: 2px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .name {
    font-size: 0.98rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 9.5rem;
    /* Room for descenders (g, y) that overflow: hidden would clip at line-height 1.1 */
    padding-bottom: 0.2em;
    margin-bottom: -0.2em;
  }
  .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  .bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar {
    overflow: visible;
  }
  .bar span {
    position: relative;
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c), black 30%), var(--c));
    box-shadow: 0 0 6px color-mix(in srgb, var(--c), transparent 40%);
    transition: width 0.8s var(--ease-out);
  }
  /* Filling in step with the stream of sparks landing on it. */
  .bar.filling span {
    transition: width var(--fill-span) linear;
  }
  .bar.filling span::after {
    width: 7px;
    height: 7px;
    background: #fff4d8;
  }
  /* A hot spark at the bar's leading edge. */
  .bar span::after {
    content: '';
    position: absolute;
    right: -2px;
    top: 50%;
    width: 5px;
    height: 5px;
    translate: 0 -50%;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c), white 60%);
    box-shadow:
      0 0 6px 1px var(--c),
      0 0 12px 2px color-mix(in srgb, var(--c), transparent 50%);
    opacity: 0.9;
  }
  .bar span[style*='width: 0%']::after {
    opacity: 0;
  }
  .score {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.3rem;
    color: var(--gold-hi);
    min-width: 1.4ch;
    text-align: right;
  }
  .bump {
    animation: bump 0.7s var(--ease-back);
  }
  @keyframes bump {
    0% {
      transform: scale(2.4);
      color: #fff6d8;
      text-shadow:
        0 0 10px var(--gold-hi),
        0 0 24px var(--unique-hi);
    }
    35% {
      color: #d9e6b8;
      text-shadow: 0 0 12px rgba(190, 210, 140, 0.6);
    }
  }
  .off {
    position: absolute;
    top: -6px;
    left: 26px;
    font-size: 0.8rem;
  }

  .watching {
    margin: -0.2rem 0 0;
    text-align: center;
    font-size: 0.88rem;
    color: var(--muted);
  }
  .watching em,
  .watching .hint {
    font-size: 0.9em;
    font-style: italic;
  }
  .spectator {
    color: var(--text);
    margin-left: 0.5em;
  }
  .kick-inline {
    margin-left: 0.25em;
    padding: 0 0.35em;
    border: 1px solid rgba(224, 85, 63, 0.5);
    border-radius: 8px;
    background: #1c0f0b;
    color: #ff9c86;
    font-size: 0.7rem;
    line-height: 1.3;
    cursor: pointer;
  }
  .kick-inline.confirm {
    background: var(--bad);
    color: #fff;
  }

  @media (max-width: 640px) {
    /* Pinned to the top of the screen while playing (lib/layout.ts): one slim
       row of avatars and scores, with the name and progress of whoever's turn
       it is, and the timer at the end. Sticky rather than fixed, so it shakes
       with the page and the effects aimed at a score land where it is. */
    .strip {
      position: sticky;
      /* 1px above the top, so it knows when it's stuck (see sticking). */
      top: -1px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      /* Edge to edge, over the game's side padding. */
      margin: 0 -1rem;
      padding: calc(1px + 0.25rem) max(1rem, env(safe-area-inset-right)) 0.25rem max(1rem, env(safe-area-inset-left));
      border-bottom: 1px solid transparent;
      transition:
        background-color 0.25s,
        border-color 0.25s,
        box-shadow 0.25s;
    }
    .strip.stuck {
      background-color: var(--pinned-bg);
      border-bottom: var(--pinned-line);
      box-shadow: 0 8px var(--pinned-shadow);
    }
    /* One row while it fits (the name of whoever's turn it is gives way first). */
    .board {
      flex: 1;
      min-width: 0;
      flex-wrap: nowrap;
      justify-content: flex-start;
      /* Room for the score badges that hang off the avatars' corners. */
      gap: 0.45rem;
      /* As tall as the timer beside it, so the strip keeps its height when
         the timer comes and goes. */
      min-height: 44px;
      align-items: center;
      align-content: center;
      padding: 0.25rem 0;
    }
    .board.crowded {
      flex-wrap: wrap;
    }
    li {
      flex: none;
      min-width: 0;
      gap: 0.4rem;
      padding: 2px 0.6rem 2px 2px;
    }
    li.active {
      flex: 0 1 auto;
    }
    li :global(.avatar) {
      width: 26px;
      height: 26px;
    }
    /* The others are an avatar with their score on it. Their names stay for screen readers. */
    li:not(.active) {
      padding: 2px;
    }
    li:not(.active) .info {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    li:not(.active) .score {
      position: absolute;
      right: -6px;
      bottom: -4px;
      display: grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      font-size: 0.72rem;
      line-height: 1;
      background: #0c0a08;
      border: 1px solid color-mix(in srgb, var(--c), black 30%);
      border-radius: 9px;
    }
    /* Delve: the phial stands upright beside the avatar, centred on it. */
    li:not(.active) .phial-side {
      display: block;
      position: absolute;
      right: -7px;
      top: 50%;
      translate: 0 -50%;
      filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9));
    }
    li.active .info {
      min-width: 0;
    }
    /* The timer at the end of the row, smaller than beside the question. */
    .strip :global(.timer) {
      flex: none;
      width: 44px;
      height: 44px;
    }
    .strip :global(.timer span) {
      font-size: 1.05rem;
    }
    .name {
      max-width: 6rem;
      font-size: 0.85rem;
    }
    .score {
      font-size: 1.05rem;
    }
    /* Where the ⚡ sits on a lone avatar. */
    li:not(.active) .off {
      left: 18px;
    }
  }
</style>
