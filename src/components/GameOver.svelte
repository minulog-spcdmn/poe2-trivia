<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Avatar from './Avatar.svelte';
  import { CREATOR, DONATE_URL, SITE_URL } from '../lib/site';
  import { backdropShadow } from '../lib/backdropShadow';

  const s = $derived(session.state!);
  const standings = $derived([...s.players].sort((a, b) => b.score - a.score));
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

  let canvas: HTMLCanvasElement;

  // Gold sparks bursting upward.
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio);
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    addEventListener('resize', resize);
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
      if (t < 200 && t % 40 === 1) burst(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.2 + Math.random() * 0.3), 90);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 0.12;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.008;
        p.spin += 0.2;
        if (p.life <= 0 || p.y > innerHeight + 20) {
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
      removeEventListener('resize', resize);
    };
  });

  let rank = $derived.by(() => {
    const ranks: number[] = [];
    standings.forEach((p, i) => ranks.push(i > 0 && p.score === standings[i - 1].score ? ranks[i - 1] : i + 1));
    return ranks;
  });
</script>

<canvas bind:this={canvas} class="sparks" aria-hidden="true"></canvas>

<div class="over">
  <p class="kicker" in:fly={{ y: -10, duration: 600 }}>Victory</p>
  {#if winner}
    <div class="crown" in:scale={{ start: 0.4, duration: 900, delay: 200 }}>
      <Avatar name={winner.name} hue={winner.hue} size={110} />
    </div>
    <h1 in:fly={{ y: 20, duration: 700, delay: 500 }}>
      {iWon ? 'You are victorious!' : `${winner.name} wins!`}
    </h1>
    <p class="sub muted" in:fly={{ y: 10, duration: 700, delay: 700 }}>
      {winner.score} {winner.score === 1 ? 'point' : 'points'} after {s.round} {s.settings.mode === 'race' ? (s.round === 1 ? 'question' : 'questions') : s.round === 1 ? 'round' : 'rounds'}
      {#if s.deathmatch}· won the deathmatch in round {s.deathmatch.round}{/if}
    </p>
  {/if}

  <ol class="standings panel" use:backdropShadow in:fly={{ y: 30, duration: 700, delay: 900 }}>
    {#each standings as p, i (p.id)}
      <li class:first={rank[i] === 1} in:fly={{ x: -20, duration: 400, delay: 1100 + i * 100 }}>
        <span class="rank">{rank[i]}</span>
        <Avatar name={p.name} hue={p.hue} size={30} />
        <span class="name">{p.name}</span>
        <span class="pts">{p.score}</span>
      </li>
    {/each}
  </ol>

  <div class="actions" in:fly={{ y: 20, duration: 600, delay: 1300 }}>
    {#if session.isHost}
      <button class="btn primary big" disabled={leaving} onclick={() => again(true)}>Play again</button>
      <button class="btn ghost" disabled={leaving} onclick={() => again(false)}>Change settings</button>
    {:else}
      <p class="muted">Waiting for the host to start a new game…</p>
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
    height: 100vh;
    pointer-events: none;
    z-index: 5;
  }
  .over {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem 3rem;
    text-align: center;
  }
  .kicker {
    /* Clear the dashed ring, which reaches 26px beyond the avatar. */
    margin: 0 0 calc(26px + 1.4rem);
    font-family: var(--font-display);
    letter-spacing: 0.6em;
    /* Letter spacing also trails the last letter; balance it so the word is centred. */
    padding-left: 0.6em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .crown {
    position: relative;
    margin-bottom: calc(26px + 1rem);
    filter: drop-shadow(0 0 30px rgba(241, 217, 155, 0.45));
  }
  .crown::before {
    content: '';
    position: absolute;
    inset: -26px;
    border-radius: 50%;
    border: 1px dashed rgba(201, 164, 92, 0.5);
    animation: spin 30s linear infinite;
  }
  h1 {
    font-size: clamp(2.25rem, 6.7vw, 3.8rem);
    font-weight: 900;
    background: linear-gradient(180deg, #fff1c9 10%, #d7b068 55%, #8b6526);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.9));
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
  .actions p {
    margin: 0;
    font-style: italic;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
