<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import { CREATOR, DONATE_URL, SITE_URL } from '../lib/site';
  import { backdropShadow } from '../lib/backdropShadow';
  import { fxActive, fxUserOn } from '../lib/fx/core';
  import { victory } from '../lib/fx/moments';
  import { fallen } from '../lib/fx/delveEnd';
  import { shareText } from '../lib/delveShare';
  import { portal } from '../lib/portal';
  import { delveStandings, isGroupRun } from '../lib/delve';
  import { BLUE_FROM } from '../lib/descent';

  const s = $derived(session.state!);
  const won = (id: string) => s.winners.includes(id);
  // Delve: ranked by how deep each went, and alone there is no winner, only a depth.
  const run = $derived(s.delve ?? null);
  const solo = $derived(!!run && !isGroupRun(s));
  /** Alone: this run went deeper than ever (lib/delveRecord.ts). */
  const newBest = $derived(!!run && session.delveResult?.id === run.startedAt && session.delveResult.best);
  const delveRows = $derived(run ? delveStandings(s) : []);
  const depthOf = (id: string) => delveRows.find((r) => r.id === id)?.depth ?? 0;
  // Winners first among equal scores: a deathmatch can be won by the only duelist left, level on points.
  const standings = $derived(
    run
      ? delveRows.map((r) => s.players.find((p) => p.id === r.id)!).filter(Boolean)
      : [...s.players].sort((a, b) => b.score - a.score || +won(b.id) - +won(a.id)),
  );
  const winner = $derived(s.players.find((p) => s.winners.includes(p.id)) ?? standings[0]);
  const spectators = $derived(s.spectators ?? []);

  // One click only: a second one while this screen fades out would restart the new game.
  let leaving = $state(false);
  function again(play: boolean) {
    if (leaving) return;
    leaving = true;
    session.dispatch({ type: 'restart', play });
    // Still here (the restart was refused)? Let the host try again.
    setTimeout(() => (leaving = false), 1500);
  }
  const iWon = $derived(session.mode !== 'local' && winner?.id === session.myPlayerId);
  const sharers = $derived(s.winners.map((id) => s.players.find((p) => p.id === id)?.name).filter(Boolean) as string[]);
  // A descent has no victory: alone it ends where you fell, and a group's
  // deepest delver went furthest before falling (or stood last), nothing more.
  const headline = $derived.by(() => {
    if (!run) return iWon ? 'You are victorious!' : `${winner?.name} wins!`;
    if (solo) return `Depth ${winner ? depthOf(winner.id) : s.round}`;
    if (sharers.length > 1) return `${sharers.slice(0, -1).join(', ')} and ${sharers.at(-1)} delved deepest`;
    return iWon ? 'You delved deepest' : `${winner?.name} delved deepest`;
  });
  /** Alone, deeper than this browser has been before (not the very first run). */
  const deeper = $derived(solo && newBest && session.delveResult?.previousBest !== null);
  const kicker = $derived(
    !run
      ? 'Victory'
      : solo
        ? deeper
          ? 'Deeper than ever'
          : 'Fallen'
        : run.lastStanding && run.lastStanding.id === winner?.id
          ? 'Last one standing'
          : 'The descent ends',
  );
  /** Delve: what the depth means, and how a tie was settled. */
  const delveSub = $derived.by(() => {
    if (!run || !winner) return '';
    const row = delveRows.find((r) => r.id === winner.id);
    if (!row) return '';
    if (solo) {
      // Measured against this browser's deepest run alone (lib/delveRecord.ts).
      const r = session.delveResult?.id === run.startedAt ? session.delveResult : null;
      const record = !r || run.mixed ? '' : r.best ? (r.previousBest === null ? ' Your first descent.' : ` Your deepest yet; the last best was ${r.previousBest}.`) : ` Your best is depth ${r.previousBest}.`;
      return (row.losses.length ? `Lives lost at depths ${listOf(row.losses)}.` : '') + record;
    }
    const parts = [`Fell at depth ${row.depth}`];
    if (run.lastStanding?.id === winner.id) parts.push(`last one standing from depth ${run.lastStanding.depth}`);
    const second = delveRows[1];
    if (second && second.depth === row.depth && second.rank !== row.rank) {
      // Settled by the earlier lives: the first loss (from the end) where the two differ.
      const a = [...row.losses].reverse();
      const b = [...second.losses].reverse();
      const k = a.findIndex((d, i) => d !== b[i]);
      if (k > 0) {
        const name = s.players.find((p) => p.id === second.id)?.name ?? '?';
        parts.push(`tied with ${name}, who lost their ${k === 1 ? 'second' : 'first'} life sooner (${b[k]}, against ${a[k]})`);
      }
    }
    return parts.join('; ') + '.';
  });
  const listOf = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : `${xs[0]}`);

  // Delve: dare someone to go deeper.
  let shared = $state(false);
  async function shareDepth() {
    const me = session.myPlayerId;
    const mine = solo ? winner : s.players.find((p) => p.id === me);
    if (!mine) return;
    const text = shareText(depthOf(mine.id));
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
  const canShare = $derived(!!run && (solo || (!!session.myPlayerId && s.players.some((p) => p.id === session.myPlayerId))));

  let canvas: HTMLCanvasElement;
  let crown = $state<HTMLElement>();
  let title = $state<HTMLElement>();
  let standingsEl = $state<HTMLElement>();
  // A player who lost (online) sees a quieter screen. (Delve has its own ending, below.)
  const iLost = $derived(
    session.mode !== 'local' && !!session.myPlayerId && s.players.some((p) => p.id === session.myPlayerId) && !s.winners.includes(session.myPlayerId),
  );

  // The celebration: rays, fireworks and glitter (lib/fx/moments.ts). A
  // descent ends instead with its last embers going out (lib/fx/delveEnd.ts).
  onMount(() => {
    if (!crown || !title || !winner) return;
    const h = run
      ? fallen(crown, title, { best: deeper, standings: solo ? null : standingsEl })
      : victory(crown, title, playerColor(winner.hue), iLost, standingsEl);
    return () => h.stop();
  });

  // Without the effects layer (no WebGL2), simpler gold sparks on a 2D canvas.
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || fxActive() || !fxUserOn() || iLost || run) return;
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
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  let rank = $derived.by(() => {
    if (run) return delveRows.map((r) => r.rank);
    const ranks: number[] = [];
    // A winner never shares its rank with a player who didn't win.
    standings.forEach((p, i) => {
      const prev = standings[i - 1];
      ranks.push(prev && p.score === prev.score && won(p.id) === won(prev.id) ? ranks[i - 1] : i + 1);
    });
    return ranks;
  });
</script>

<!-- Fixed to the viewport, so it leaves the app shell (which camera shake moves).
     Behind a dialog it only darkens: the sparks are soft already, and a blur
     would be redone every frame. -->
<canvas bind:this={canvas} class="sparks" use:portal={'dim'} aria-hidden="true"></canvas>

<div class="over" class:delve={!!run} class:deeper>
  <p class="kicker" in:fly={{ y: -10, duration: 600 }}>{kicker}</p>
  {#if winner}
    <div class="crown" class:fallen={solo} bind:this={crown} in:scale={{ start: 0.4, duration: 900, delay: 200 }}>
      <!-- Delve: the deeper the run went, the colder the circle. -->
      <ArcaneCircle
        size="212px"
        color={run && depthOf(winner.id) >= BLUE_FROM
          ? `color-mix(in srgb, #a9bfdc ${Math.round(Math.min(1, 0.15 + ((depthOf(winner.id) - BLUE_FROM) / 16) * 0.85) * 100)}%, #f1d99b)`
          : `color-mix(in srgb, ${playerColor(winner.hue)}, #f1d99b 45%)`}
        strength={run ? (deeper ? 0.42 : 0.3) : iLost ? 0.35 : 0.6}
      />
      <Avatar name={winner.name} hue={winner.hue} size={110} />
    </div>
    <h1 bind:this={title} in:fly={{ y: 20, duration: 700, delay: 500 }}>
      <span class="shade" aria-hidden="true">{headline}</span>
      <span class="gold">{headline}</span>
    </h1>
    <p class="sub muted" in:fly={{ y: 10, duration: 700, delay: 700 }}>
      {#if run}
        {delveSub}{#if run.mixed}{delveSub ? ' ' : ''}Finished under newer rules.{/if}
      {:else}
        {winner.score} {winner.score === 1 ? 'point' : 'points'} after {s.round} {s.settings.mode === 'race' ? (s.round === 1 ? 'question' : 'questions') : s.round === 1 ? 'round' : 'rounds'}
        {#if s.deathmatch}· won the deathmatch in round {s.deathmatch.round}{/if}
      {/if}
    </p>
  {/if}

  <ol class="standings panel" bind:this={standingsEl} use:backdropShadow={{ fill: 'linear' }} in:fly={{ y: 30, duration: 700, delay: 900 }}>
    {#each standings as p, i (p.id)}
      <li class:first={rank[i] === 1} in:fly={{ x: -20, duration: 400, delay: 1100 + i * 100 }}>
        <span class="rank">{rank[i]}</span>
        <Avatar name={p.name} hue={p.hue} size={30} />
        <span class="name"><PlayerName name={p.name} /></span>
        {#if run}
          <span class="pts depth" title="Fell at depth {depthOf(p.id)}">{depthOf(p.id)}</span>
        {:else}
          <span class="pts">{p.score}</span>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="actions" in:fly={{ y: 20, duration: 600, delay: 1300 }}>
    {#if session.isHost}
      <button class="btn primary big" disabled={leaving} onclick={() => again(true)}>Play again</button>
      <button class="btn ghost" disabled={leaving} onclick={() => again(false)}>{#if run}<span><span class="roomy">Back to</span> lobby</span>{:else}Change settings{/if}</button>
    {:else}
      <p class="muted">Waiting for the host to start a new game…</p>
    {/if}
    {#if canShare}
      <span class="share">
        <button class="btn ghost" onclick={shareDepth} aria-label="Share your depth" title="Share your depth">
          {#if shared}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          {:else}
            <!-- Three linked seals: the share sign. -->
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="18" cy="5.5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="18.5" r="2.6" />
              <path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" />
            </svg>
          {/if}
        </button>
        {#if shared}<span class="copied" role="status" transition:fly={{ y: 4, duration: 200 }}>Copied</span>{/if}
      </span>
    {/if}
  </div>
  {#if spectators.length}
    <p class="joining muted" in:fly={{ y: 10, duration: 600, delay: 1400 }}>
      {spectators.map((o) => o.name).join(', ')} {spectators.length === 1 ? 'joins' : 'join'} the next game.
    </p>
  {/if}

  <p class="credit" in:fly={{ y: 10, duration: 600, delay: 1600 }}>
    <a href={SITE_URL} target="_blank" rel="noreferrer">poe2.quest</a> · made by
    <a class="maker" href={DONATE_URL} target="_blank" rel="noopener noreferrer" title="Support {CREATOR}">{CREATOR}</a>
    · <a class="tip" href={DONATE_URL} target="_blank" rel="noopener noreferrer">♥ support the project</a>
  </p>
</div>

<style>
  .sparks {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: var(--screen-h);
    pointer-events: none;
    z-index: 5;
  }
  .over {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 1rem 3rem;
    text-align: center;
  }
  .kicker {
    /* Clear the rune circle, which reaches 51px beyond the avatar. */
    margin: 0 0 calc(51px + 1.4rem);
    font-family: var(--font-display);
    letter-spacing: 0.6em;
    /* Letter spacing also trails the last letter; balance it so the word is centred. */
    padding-left: 0.6em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .crown {
    position: relative;
    isolation: isolate;
    margin-bottom: calc(51px + 1rem);
  }
  /* On the avatar only: a filter over the turning rune circle would repaint it every frame. */
  .crown :global(.avatar) {
    filter: drop-shadow(0 0 30px rgba(241, 217, 155, 0.45));
  }
  /* The rune circle sits behind the avatar. */
  .crown :global(.arcane) {
    z-index: -1;
    margin: auto;
    inset: -51px;
  }
  h1 {
    font-size: clamp(2.25rem, 6.7vw, 3.8rem);
    font-weight: 900;
    /* The shadow and the gold are two copies of the text, stacked. */
    display: grid;
  }
  h1 > span {
    grid-area: 1 / 1;
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
  /* Delve: no victory. The title is cold, worn metal and holds still; the
     kicker is ash, warming to gold only for a run deeper than ever. */
  .delve .kicker {
    color: var(--muted);
  }
  .delve.deeper .kicker {
    color: var(--gold-hi);
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.35);
  }
  .delve .gold {
    background: linear-gradient(180deg, #ece4d4 8%, #a89f90 55%, #5f574b);
    -webkit-background-clip: text;
    background-clip: text;
    animation: none;
  }
  .delve.deeper .gold {
    background: linear-gradient(180deg, #fbecc6 8%, #c9a45c 55%, #7a5a26);
    -webkit-background-clip: text;
    background-clip: text;
  }
  /* Alone, the fallen delver's portrait has lost its colour. */
  .crown.fallen :global(.avatar) {
    filter: grayscale(0.75) brightness(0.8) drop-shadow(0 0 22px rgba(169, 191, 220, 0.25));
  }
  .sub {
    margin: 0.4rem 0 1.8rem;
    font-style: italic;
    font-size: 1.1rem;
  }
  .standings {
    list-style: none;
    margin: 0;
    padding: 0.8rem;
    width: min(460px, 100%);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .standings li {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.45rem 0.7rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .standings li.first {
    background: linear-gradient(90deg, rgba(201, 164, 92, 0.18), rgba(0, 0, 0, 0.2));
    border: 1px solid rgba(201, 164, 92, 0.35);
  }
  .rank {
    width: 1.6rem;
    font-family: var(--font-display);
    font-weight: 900;
    color: var(--muted);
  }
  .first .rank {
    color: var(--gold-hi);
  }
  .name {
    flex: 1;
    text-align: left;
    font-size: 1.1rem;
  }
  .pts {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.2rem;
    color: var(--gold-hi);
  }
  .actions {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 1.8rem;
  }
  .credit {
    margin: 2.2rem 0 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .credit a {
    color: var(--gold);
    text-decoration: none;
  }
  .credit .maker {
    color: var(--gold-hi);
    border-bottom: 1px dotted var(--gold-lo);
  }
  .credit .tip {
    color: #e0907c;
  }
  .credit a:hover {
    color: #fff1cf;
  }
  .joining {
    margin: 1rem 0 0;
    font-style: italic;
  }
  /* Share: an icon button the height of its neighbours, with a note when the text was copied. */
  .share {
    position: relative;
    display: inline-flex;
  }
  .share .btn {
    padding: 0.7em;
  }
  .share svg {
    width: 1.45em;
    height: 1.45em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .copied {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.45rem);
    translate: -50% 0;
    padding: 0.2em 0.6em;
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--gold-hi);
    background: rgba(13, 10, 7, 0.9);
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    pointer-events: none;
  }
  /* A phone fits Delve's three actions on one row as Play again, Lobby and the share icon. */
  @media (max-width: 420px) {
    .roomy {
      display: none;
    }
  }
  .actions p {
    margin: 0;
    font-style: italic;
  }
</style>
