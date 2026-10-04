<script lang="ts">
  import { flip } from 'svelte/animate';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { untrack } from 'svelte';
  import { fxActive, onFxChange, type Handle } from '../lib/fx/core';
  import { FILL_SPAN, FILL_START, SCORE_LANDS, ablaze, doused, lostPoint, turnsBlue } from '../lib/fx/moments';
  import { scoreRow, scoreRowOf } from '../lib/scoreRows';
  import { burnsBlue, heatOf, streakOf } from '../lib/fx/streaks';

  const s = $derived(session.state!);
  const target = $derived(s.settings.targetScore);
  const race = $derived(s.settings.mode === 'race');
  const missed = $derived(new Set(s.question?.misses.map((m) => m.playerId) ?? []));
  const canKick = $derived(session.mode === 'host');
  const spectators = $derived(s.spectators ?? []);

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

  // Players on a streak burn. The fire grows as the point lands on their
  // entry, and goes out the moment the streak breaks.
  let heat = $state<Record<string, number>>({});
  const stoking = new Map<string, Landing>();
  $effect(() => {
    for (const p of s.players) {
      const h = heatOf(streakOf(p.id));
      if (stoking.get(p.id)?.to === h) continue;
      cancel(stoking, p.id);
      const was = untrack(() => heat[p.id] ?? 0);
      if (h === was) continue;
      if (h > was && fxActive() && s.phase === 'reveal') land(stoking, p.id, h, [[SCORE_LANDS, () => (heat[p.id] = h)]]);
      else heat[p.id] = h;
    }
  });
  $effect(() => () => {
    for (const under of [awards, stoking]) for (const id of [...under.keys()]) cancel(under, id);
  });

  /** Svelte action: sets a row burning at `h` (0 to 1), re-lit as it changes. */
  function burn(node: HTMLElement, h: number) {
    let fire: Handle | null = null;
    let lit = 0;
    const set = (next: number) => {
      if (next === lit) return;
      fire?.stop(0.5);
      fire = next > 0 ? ablaze(node, next) : null;
      if (lit > 0 && next === 0) doused(node);
      if (lit > 0 && !burnsBlue(lit) && burnsBlue(next)) turnsBlue(node);
      lit = next;
    };
    set(h);
    // Effects switched off and on, or the GL context lost and restored, wipe
    // every shape: light it again on the new one.
    const relight = onFxChange(() => {
      fire?.stop(0);
      fire = lit > 0 ? ablaze(node, lit) : null;
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
</script>

<ol class="board">
  {#each s.players as p, i (p.id)}
    {@const active = race ? s.phase === 'reveal' && s.reveal?.winnerId === p.id : i === s.turn && s.phase !== 'over'}
    {@const out = race && s.phase !== 'over' && missed.has(p.id)}
    {@const benched = !!s.deathmatch && s.phase !== 'over' && !s.deathmatch.alive.includes(p.id)}
    {@const duelist = !!s.deathmatch && s.phase !== 'over' && s.deathmatch.alive.includes(p.id)}
    {@const score = scoreOf(p.id, p.score)}
    {@const fire = heat[p.id] ?? 0}
    <li
      use:backdropShadow
      use:scoreRow={p.id}
      use:burn={fire}
      class:ablaze={fire > 0}
      style:--heat={fire}
      style:--blue={burnsBlue(fire) ? 1 : 0}
      class:active class:out class:benched class:duelist class:offline={!p.connected} animate:flip={{ duration: 400 }} style:--c={playerColor(p.hue)}>
      <Avatar name={p.name} hue={p.hue} size={32} dim={!p.connected} />
      <div class="info">
        <span class="name">
          {p.name}{#if session.mode !== 'local' && p.id === session.myPlayerId}<em>&nbsp;(you)</em>{/if}
        </span>
        <span class="bar" class:filling={filling[p.id]} style:--fill-span="{FILL_SPAN}s"
          ><span style:width="{Math.max(0, Math.min(100, (barOf(p.id, p.score) / target) * 100))}%"></span></span
        >
      </div>
      {#key score}
        <span class="score" class:negative={score < 0} class:bump={race ? active : score > 0} class:down={out}
          >{score}</span
        >
      {/key}
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
  /* The player whose turn it is keeps their own colour on the border. */
  li.ablaze:not(.active) {
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
    animation: smoulder calc(1.4s - 0.8s * var(--heat)) ease-in-out infinite alternate;
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
    min-width: 0;
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
    .board {
      gap: 0.4rem;
    }
    li {
      min-width: 0;
      padding: 0.3rem 0.6rem 0.3rem 0.3rem;
    }
    .name {
      max-width: 5.5rem;
      font-size: 0.85rem;
    }
    .score {
      font-size: 1.05rem;
    }
  }
</style>
