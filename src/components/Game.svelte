<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Scoreboard from './Scoreboard.svelte';
  import ChooseCategory from './ChooseCategory.svelte';
  import QuestionView from './QuestionView.svelte';
  import Avatar from './Avatar.svelte';
  import PlayerName from './PlayerName.svelte';
  import TimerRing from './TimerRing.svelte';
  import { fireAmbience, sfx } from '../lib/sound';
  import { onMount } from 'svelte';
  import { deathmatchIntro, deathmatchMood, gameStart, turnBanner } from '../lib/fx/moments';
  import { portal } from '../lib/portal';
  import { phone } from '../lib/layout';
  import { delveDepth, delveTimer, fellAt, isGroupRun } from '../lib/delve';
  import { delveChange } from '../lib/difficultyText';
  import { milestoneAt } from '../lib/descent';
  import { descended, milestoneReached } from '../lib/fx/moments';
  import { untrack } from 'svelte';

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const local = $derived(session.mode === 'local');


  const race = $derived(s.settings.mode === 'race');
  const run = $derived(s.delve ?? null);
  const depth = $derived(delveDepth(s));
  const group = $derived(isGroupRun(s));
  // The question's timer: in the scoreboard pinned to the top on phones, in
  // view while they scroll down to the answers, and beside the question's
  // topic otherwise. Only ever one, so its ticks never double.
  const q = $derived(s.phase === 'question' || s.phase === 'reveal' ? s.question : null);

  // Countdown to the automatic skip of a disconnected player's turn.
  let now = $state(Date.now());
  $effect(() => {
    if (!session.skipAt) return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(id);
  });
  // Only while the button still applies: it may be fading out because the
  // player just acted (or came back), and then it must not skip anything.
  const skipTurn = (applies: unknown) => applies && session.dispatch({ type: 'skip' });
  const skipIn = $derived(session.skipAt ? Math.max(0, Math.ceil((session.skipAt - now) / 1000)) : 0);

  // New turn or question: bring the scoreboard and banner back into view
  // (on phones the previous reveal is often scrolled down).
  let lastTurn = -1;
  $effect(() => {
    const t = s.turnCount;
    if (lastTurn !== -1 && t !== lastTurn) window.scrollTo({ top: 0, behavior: 'smooth' });
    lastTurn = t;
  });
  const dm = $derived(s.deathmatch);
  const nameOf = (id: string) => s.players.find((p) => p.id === id);

  // Play the deathmatch intro once per deathmatch, on every device.
  let introFor = $state<number | null>(null);
  let introTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const start = dm?.startedAt;
    if (start === undefined || start === introFor) return;
    introFor = start;
    showIntro = true;
    sfx('deathmatch');
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(() => (showIntro = false), 2600);
  });
  let showIntro = $state(false);
  // A new game (or joining one): a wave of light.
  onMount(() => {
    gameStart();
    return () => {
      deathmatchMood(false);
      fireAmbience(false);
    };
  });

  // The whole scene turns crimson, and a fire roars, for as long as a deathmatch lasts.
  $effect(() => deathmatchMood(!!dm));
  $effect(() => fireAmbience(!!dm));

  // One colour for the banner's rules and glow and for its effects, which can't
  // read CSS variables (so the race colour is --unique-hi written out).
  const bannerColor = $derived(dm ? '#e0553f' : race ? '#e08a44' : playerColor(active.hue));
  const bannerBig = $derived(race || mine);

  /** Svelte action: the turn banner's entrance. Runs once per turn (the stage is keyed). */
  function bannerFx(node: HTMLElement, o: { color: string; big: boolean }) {
    turnBanner(node, o.color, o.big);
  }

  /** Svelte action: the deathmatch intro's title bursts in. */
  function introFx(node: HTMLElement) {
    const t = setTimeout(() => deathmatchIntro(node), 120);
    return { destroy: () => clearTimeout(t) };
  }

  const bannerTitle = $derived(
    race
      ? `Question ${s.turnCount + 1}`
      : run && !group
        ? `Depth ${depth}`
        : mine && !local
          ? 'Your turn'
          : `${active.name}'s turn`,
  );

  // Delve: the line over the banner says what just got harder (and, together, how deep).
  const seconds = $derived(q?.deadline ? Math.round((q.deadline - (q.clockAt ?? q.askedAt)) / 1000) : delveTimer(depth));
  const change = $derived(run ? delveChange(depth) : null);
  const kicker = $derived.by(() => {
    if (!run) return '';
    const parts: string[] = [];
    if (run.lastStanding && group) parts.push('Last one standing');
    if (group) parts.push(`Depth ${depth}`);
    if (change) parts.push(change);
    return parts.join(' • ');
  });
  // Short timers only sound urgent near the end.
  const warnFrom = $derived(run ? Math.max(3, Math.min(5, Math.round(seconds * 0.35))) : 5);

  // Delve: the countdown to a card being picked (or a life lost), on every device.
  let hostNow = $state(session.hostNow());
  $effect(() => {
    if (!run?.pickBy || s.phase !== 'choosing') return;
    hostNow = session.hostNow();
    const id = setInterval(() => (hostNow = session.hostNow()), 500);
    return () => clearInterval(id);
  });
  const pickLeft = $derived(run?.pickBy && s.phase === 'choosing' ? Math.max(0, Math.ceil((run.pickBy - hostNow) / 1000)) : 0);
  const pickLine = $derived.by(() => {
    if (!run?.pickBy || s.phase !== 'choosing' || !active) return '';
    if (!active.connected && run.excused.includes(active.id) && hostNow < run.graceUntil)
      return `Waiting for ${active.name} after the host's reload; ${pickLeft}s left.`;
    if (!active.connected) return `${active.name} is disconnected; they lose a life in ${pickLeft}s.`;
    if (!mine && pickLeft <= 10) return `A card is chosen for ${active.name} in ${pickLeft}s.`;
    return '';
  });
  // Delve: a card at the start of a depth worth marking. Never on a rejoin or
  // the first depth: only when the run is seen going one deeper.
  type Card = { key: string; kicker: string; title: string; line: string | null; cold: boolean };
  let card = $state<Card | null>(null);
  let cardTimer: ReturnType<typeof setTimeout> | null = null;
  let depthSeen = '';
  let standingSeen = 0;
  $effect(() => {
    if (!run || s.phase !== 'choosing') return;
    const key = `${run.startedAt}:${depth}`;
    if (key === depthSeen) return;
    const deeper = depthSeen.startsWith(`${run.startedAt}:`);
    depthSeen = key;
    if (!deeper) {
      standingSeen = run.lastStanding ? run.startedAt : 0;
      return;
    }
    untrack(() => {
      descended();
      const cold = depth >= 21;
      const name = milestoneAt(depth);
      const best = session.bestAtStart;
      const stand = run.lastStanding && standingSeen !== run.startedAt ? s.players.find((p) => p.id === run.lastStanding!.id) : null;
      let next: Card | null = null;
      if (stand) {
        standingSeen = run.startedAt;
        next = { key, kicker: 'Last one standing', title: stand.name, line: 'Delves on alone', cold };
      } else if (name) next = { key, kicker: `Depth ${depth}`, title: name, line: delveChange(depth), cold };
      else if (!group && best !== null && depth === best + 1)
        next = { key, kicker: 'Deeper than ever', title: `Depth ${depth}`, line: `Past your best of ${best}`, cold };
      if (!next) return;
      card = next;
      sfx('stratum');
      if (cardTimer) clearTimeout(cardTimer);
      cardTimer = setTimeout(() => card?.key === key && (card = null), 2400);
    });
  });
  $effect(() => () => {
    if (cardTimer) clearTimeout(cardTimer);
  });
  /** Svelte action: a milestone's plaque breaks into the scene, once it has unfolded. */
  function cardFx(node: HTMLElement, c: Card) {
    const t = setTimeout(() => milestoneReached(node, c.cold), 200);
    return { destroy: () => clearTimeout(t) };
  }
  // The plaque lies over the kicker and banner (the head of the stage), never
  // over the cards or the question below, so it is as tall as the head.
  let headH = $state(0);
  let plaqueW = $state(0);
  let plaqueH = $state(0);
  /** How far the plaque's pointed ends reach in, px. */
  const point = $derived(Math.min(plaqueH * 0.42, 24));
  /** The plaque's outline (`inset` px in from its edge), pointed at both ends. */
  function plaquePath(w: number, h: number, inset: number) {
    const p = point;
    const k = inset * 1.1;
    return `M${inset} ${h / 2}L${p + k * 0.4} ${inset}H${w - p - k * 0.4}L${w - inset} ${h / 2}L${w - p - k * 0.4} ${h - inset}H${p + k * 0.4}Z`;
  }

  const myFall = $derived(session.fallen && session.myPlayerId ? fellAt(s, session.myPlayerId) : null);
</script>

{#snippet timer()}
  {#if q?.deadline || (run && q && s.phase === 'question')}
    {#key q.askedAt}
      <TimerRing deadline={q.deadline} total={seconds} stopped={s.phase === 'reveal'} {warnFrom} />
    {/key}
  {/if}
{/snippet}

<div class="game">
  <Scoreboard aside={phone.current ? timer : undefined} />

  <!-- The outgoing and incoming turn share one grid cell while they cross-fade,
       instead of stacking (which briefly doubled the page height). -->
  <div class="turns">
    {#key s.turnCount}
      <div class="stage" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 180 }}>
        {#if dm}
          <div class="dm-strip" in:fly={{ y: -10, duration: 400 }}>
            <span class="dm-title">⚔ Deathmatch · round {dm.round}</span>
            <span class="dm-duelists">
              {#each dm.alive as id (id)}
                {@const p = nameOf(id)}
                {#if p}
                  <span class="duelist" class:done={id in dm.results} title={p.name}>
                    <Avatar name={p.name} hue={p.hue} size={24} />
                    {#if id in dm.results}<i class:ok={dm.results[id]}>{dm.results[id] ? '✓' : '✕'}</i>{/if}
                  </span>
                {/if}
              {/each}
            </span>
            <span class="dm-rule">
              {#if dm.eliminated.length}
                <b>{dm.eliminated.map((id) => nameOf(id)?.name).join(', ')} {dm.eliminated.length === 1 ? 'is' : 'are'} out.</b>
              {/if}
              Answer right to survive. Anyone who misses while another duelist scores is out.
            </span>
          </div>
        {/if}
        <div class="head" bind:clientHeight={headH}>
          {#if run}
            <!-- Kept even when empty, so the banner stays put from one depth to the next. -->
            <p class="kicker" class:deep={depth >= 21} class:change={!!change}>{kicker || '\u00a0'}</p>
          {/if}
          <div class="banner" class:dm={!!dm} style:--c={bannerColor}>
            <span class="rule"></span>
            <h2 use:bannerFx={{ color: bannerColor, big: bannerBig }}>{bannerTitle}</h2>
            <span class="rule"></span>
          </div>
        </div>

        {#if s.phase === 'choosing'}
          <ChooseCategory />
        {:else}
          <!-- A new question on the same turn (the host asked another) starts fresh. -->
          {#key s.question?.askedAt}
            <QuestionView timer={phone.current ? undefined : timer} />
          {/key}
        {/if}

        {#if pickLine}
          <p class="delve-line muted" transition:fade>{pickLine}</p>
        {/if}
        {#if myFall !== null}
          <p class="delve-line muted">You fell at depth {myFall}; watching.</p>
        {/if}
        {#if session.isHost && !local && !race && !run && !active.connected && s.phase !== 'reveal'}
          <div class="skip" transition:fade>
            <span class="muted">{active.name} is disconnected{skipIn ? `; skipping in ${skipIn}s` : ''}.</span>
            <button class="btn small" onclick={() => skipTurn(session.skipAt)}>Skip their turn</button>
          </div>
        {:else if session.idle}
          <div class="skip" transition:fade>
            <span class="muted">{active.name} hasn't {s.phase === 'choosing' ? 'picked a category' : 'answered'} in a while.</span>
            <button class="btn small" onclick={() => skipTurn(session.idle)}>Skip their turn</button>
          </div>
        {/if}
        {#if session.artMissing}
          <div class="skip" transition:fade>
            <span class="muted">The art for this question couldn't be loaded.</span>
            <button class="btn small" onclick={() => session.dispatch({ type: 'reask' })}>Ask another question</button>
          </div>
        {/if}
      </div>
    {/key}
    {#if card}
      {#key card.key}
        <!-- Delve: a named depth, on an engraved plaque laid over the banner for a
             moment. It covers nothing below it and never takes a tap. -->
        <div
          class="m-card"
          class:cold={card.cold}
          style:height="{headH}px"
          style:--p="{point}px"
          bind:clientWidth={plaqueW}
          bind:clientHeight={plaqueH}
          use:cardFx={card}
          aria-live="polite"
          out:fade={{ duration: 400 }}
        >
          <svg class="m-frame" width={plaqueW} height={plaqueH} aria-hidden="true">
            {#if plaqueW && plaqueH}
              <path class="m-rim" d={plaquePath(plaqueW, plaqueH, 0.75)} />
              <path class="m-hair" d={plaquePath(plaqueW, plaqueH, 3.5)} />
              <path class="m-gem" d="M{point * 0.62 - 2.6} {plaqueH / 2}l2.6 -2.6 2.6 2.6 -2.6 2.6Z" />
              <path class="m-gem" d="M{plaqueW - point * 0.62 - 2.6} {plaqueH / 2}l2.6 -2.6 2.6 2.6 -2.6 2.6Z" />
            {/if}
          </svg>
          <span class="m-sheen" aria-hidden="true"></span>
          <p class="m-kicker">{card.kicker}{#if card.line}<span class="m-sep">•</span><span class="m-line">{card.line}</span>{/if}</p>
          <p class="m-title">{card.title}</p>
        </div>
      {/key}
    {/if}
  </div>
</div>

{#if showIntro && dm}
  <!-- Behind a dialog the flat fill only darkens (a blur would thin its edges) and the words blur. -->
  <div class="dm-intro" use:portal={'dim'} transition:fade={{ duration: 400 }} aria-live="polite">
    <div class="dm-intro-inner" data-behind-dialog="blur" in:scale={{ start: 1.6, duration: 600, opacity: 0 }}>
      <p class="dm-kicker">It's a tie</p>
      <h1 use:introFx>Deathmatch</h1>
      <div class="dm-faces">
        {#each dm.entrants as id, i (id)}
          {@const p = nameOf(id)}
          {#if p}
            {#if i > 0}<span class="vs">vs</span>{/if}
            <span class="face" in:fly={{ y: 20, duration: 500, delay: 300 + i * 150 }}>
              <Avatar name={p.name} hue={p.hue} size={56} />
              <b><PlayerName name={p.name} /></b>
            </span>
          {/if}
        {/each}
      </div>
      <p class="dm-sub">Sudden death. Random categories, harder questions.</p>
    </div>
  </div>
{/if}

<style>
  .game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1rem 2.5rem;
  }
  .turns {
    display: grid;
  }
  .stage {
    grid-area: 1 / 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  /* The kicker and banner. Holds their margins, so the plaque laid over it
     (.m-card) reaches exactly down to what follows. */
  .head {
    display: flow-root;
  }
  /* Delve: a named depth (or the last one standing, or deeper than ever), on
     an opaque engraved plaque with pointed ends like the phials', laid over
     the head of the stage. */
  .m-card {
    grid-area: 1 / 1;
    align-self: start;
    justify-self: center;
    position: relative;
    z-index: 2;
    pointer-events: none;
    box-sizing: border-box;
    width: min(100%, 560px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    padding: 0 2rem;
    text-align: center;
    animation: m-unfold 0.45s var(--ease-out) both;
  }
  .m-card::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    clip-path: polygon(0 50%, var(--p) 0, calc(100% - var(--p)) 0, 100% 50%, calc(100% - var(--p)) 100%, var(--p) 100%);
    background:
      radial-gradient(ellipse 60% 120% at 50% 0%, rgba(201, 164, 92, 0.16), rgba(201, 164, 92, 0) 70%),
      linear-gradient(180deg, #17110b, #0b0806);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7);
  }
  .m-card.cold::before {
    background:
      radial-gradient(ellipse 60% 120% at 50% 0%, rgba(120, 160, 230, 0.16), rgba(120, 160, 230, 0) 70%),
      linear-gradient(180deg, #0c1018, #06080d);
  }
  .m-frame {
    position: absolute;
    inset: 0;
    overflow: visible;
    filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.9));
  }
  .m-rim {
    fill: none;
    stroke: #c9a45c;
    stroke-width: 1.5;
    stroke-linejoin: miter;
  }
  .m-hair {
    fill: none;
    stroke: rgba(241, 217, 155, 0.4);
    stroke-width: 0.6;
  }
  .m-gem {
    fill: none;
    stroke: #c9a45c;
    stroke-width: 0.9;
  }
  .cold .m-rim,
  .cold .m-gem {
    stroke: #8fb4e8;
  }
  .cold .m-hair {
    stroke: rgba(190, 214, 250, 0.4);
  }
  /* Light runs once across the plaque as it unfolds (clipped to it). */
  .m-sheen {
    position: absolute;
    inset: 0;
    overflow: hidden;
    clip-path: polygon(0 50%, var(--p) 0, calc(100% - var(--p)) 0, 100% 50%, calc(100% - var(--p)) 100%, var(--p) 100%);
  }
  .m-sheen::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -40%;
    width: 40%;
    background: linear-gradient(100deg, rgba(255, 236, 190, 0), rgba(255, 236, 190, 0.22) 50%, rgba(255, 236, 190, 0));
    animation: m-sheen 1.1s ease-in-out 0.25s both;
  }
  @keyframes m-unfold {
    from {
      opacity: 0;
      transform: scaleX(0.4);
    }
  }
  @keyframes m-sheen {
    to {
      transform: translateX(350%);
    }
  }
  .m-kicker {
    margin: 0;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.78rem;
    line-height: 1.2;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--gold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    animation: m-words 0.4s ease-out 0.15s both;
  }
  .m-sep {
    margin: 0 0.6em 0 0.35em;
  }
  .m-line {
    color: var(--gold-hi);
  }
  .m-title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(1.4rem, 4.2vw, 2.3rem);
    line-height: 1.05;
    color: var(--gold-hi);
    text-shadow:
      0 0 18px rgba(255, 170, 70, 0.35),
      0 2px 6px rgba(0, 0, 0, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    animation: m-words 0.45s ease-out 0.2s both;
  }
  @keyframes m-words {
    from {
      opacity: 0;
    }
  }
  .cold .m-kicker {
    color: #8fb4e8;
  }
  .cold .m-line {
    color: #cfe0fb;
  }
  .cold .m-title {
    color: #dce9ff;
    text-shadow:
      0 0 18px rgba(90, 150, 255, 0.4),
      0 2px 6px rgba(0, 0, 0, 0.95);
  }

  .kicker {
    margin: 0.4rem 0 -0.4rem;
    text-align: center;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .kicker.change {
    color: var(--gold-hi);
    text-shadow: 0 0 12px rgba(241, 217, 155, 0.35);
  }
  .kicker.deep {
    color: #b9cff0;
  }
  .delve-line {
    margin: 0.8rem 0 0;
    text-align: center;
    font-size: 0.95rem;
    font-style: italic;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    margin: 0.6rem 0 1.1rem;
  }
  .banner h2 {
    font-size: clamp(1.7rem, 5vw, 2.7rem);
    font-weight: 900;
    color: var(--gold-hi);
    text-shadow:
      0 0 24px color-mix(in srgb, var(--c), transparent 40%),
      0 3px 12px rgba(0, 0, 0, 0.9);
    animation: arrive 0.9s var(--ease-out) both;
    text-align: center;
    white-space: nowrap;
  }
  .rule {
    flex: 0 1 140px;
    min-width: 16px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--c));
    animation: grow 0.9s var(--ease-out) both;
  }
  .rule:last-child {
    background: linear-gradient(270deg, transparent, var(--c));
  }
  @keyframes arrive {
    from {
      opacity: 0;
      letter-spacing: 0.4em;
      filter: blur(6px);
    }
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .dm-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 1rem;
    margin: 0 auto 0.4rem;
    padding: 0.5rem 1rem;
    max-width: 760px;
    border: 1px solid rgba(224, 85, 63, 0.45);
    border-radius: 4px;
    background: linear-gradient(90deg, rgba(60, 12, 8, 0.2), rgba(90, 18, 10, 0.55), rgba(60, 12, 8, 0.2));
    box-shadow: 0 0 30px rgba(224, 85, 63, 0.12);
  }
  .dm-title {
    font-family: var(--font-display);
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 0.85rem;
    color: #ff9c86;
  }
  .dm-duelists {
    display: inline-flex;
    gap: 0.35rem;
  }
  .duelist {
    position: relative;
  }
  .duelist.done :global(.avatar) {
    opacity: 0.6;
  }
  .duelist i {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    font-style: normal;
    font-size: 0.6rem;
    font-weight: 700;
    color: #fff;
    background: var(--bad);
    border-radius: 50%;
  }
  .duelist i.ok {
    background: #3f8f43;
  }
  .dm-rule {
    flex-basis: 100%;
    text-align: center;
    font-size: 0.9rem;
    font-style: italic;
    color: #d9b3a8;
  }
  .dm-rule b {
    font-style: normal;
    color: #ff9c86;
    margin-right: 0.3em;
  }
  .banner.dm h2 {
    color: #ffd7c9;
  }

  .dm-intro {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    padding: 1rem;
    /* Flat, so it can't band; the crimson glow in the middle is light from
       the effects layer (lib/fx/moments.ts), or this flat red without it. */
    background: rgba(14, 3, 2, 0.88);
    pointer-events: none;
  }
  .dm-intro-inner {
    text-align: center;
  }
  .dm-kicker {
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: 0.5em;
    padding-left: 0.5em;
    text-transform: uppercase;
    color: #ff9c86;
  }
  .dm-intro h1 {
    font-size: clamp(3.1rem, 13.5vw, 6.7rem);
    font-weight: 900;
    letter-spacing: 0.08em;
    background: linear-gradient(180deg, #ffe0d4 10%, #ff6a45 55%, #7a1408 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 30px rgba(224, 85, 63, 0.55));
  }
  .dm-faces {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.8rem 1.2rem;
    margin: 1.2rem 0 0.6rem;
  }
  .face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .face b {
    font-family: var(--font-display);
    color: #ffe0d4;
  }
  .vs {
    font-family: var(--font-display);
    font-style: italic;
    color: #ff7a5c;
  }
  .dm-sub {
    margin: 0;
    font-style: italic;
    color: #e6b8aa;
  }
  .skip {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: center;
    margin-top: 1.5rem;
  }

  /* Phones: every pixel of height spent here is scrolling between the art and
     the answers. The scoreboard already marks whose turn it is. */
  @media (max-width: 640px) {
    .game {
      gap: 0.5rem;
      padding: 0.5rem 1rem 1rem;
    }
    .banner {
      gap: 0.8rem;
      margin: 0 0 0.5rem;
    }
    .banner h2 {
      font-size: 1.45rem;
    }
    .m-card {
      gap: 0.1rem;
      padding: 0 1.6rem;
    }
    .m-kicker {
      font-size: 0.62rem;
      letter-spacing: 0.16em;
    }
    .m-title {
      font-size: 1.3rem;
    }
    .skip {
      margin-top: 1rem;
    }
  }
</style>
