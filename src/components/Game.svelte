<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { sineInOut } from 'svelte/easing';
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
  import { REVIVE_FROM, delveDepth, fellAt, isGroupRun, livesOf, questionTimer, reviveProblem, standingIds } from '../lib/delve';
  import { delveChange } from '../lib/difficultyText';
  import { accentAt, milestoneAt } from '../lib/descent';
  import { zoneAt } from '../lib/zoneSigils';
  import { drawsRules, type Variant } from '../lib/zoneMark';
  import ZoneMark from './ZoneMark.svelte';
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
  // Delve together has no player on turn: the banner takes the depth's colour.
  const bannerColor = $derived(dm ? '#e0553f' : race ? '#e08a44' : run && group ? accentAt(depth) : playerColor(active.hue));
  const bannerBig = $derived(race || mine || group);

  /**
   * Svelte action: the turn banner's entrance. Runs once per turn (the stage is
   * keyed). Not under a zone's mark (it lands in the same moment): its light
   * would only glare over the mark's own.
   */
  function bannerFx(node: HTMLElement, o: { color: string; big: boolean }) {
    const t = setTimeout(() => {
      if (!card) turnBanner(node, o.color, o.big);
    });
    return { destroy: () => clearTimeout(t) };
  }

  /** Svelte action: the deathmatch intro's title bursts in. */
  function introFx(node: HTMLElement) {
    const t = setTimeout(() => deathmatchIntro(node), 120);
    return { destroy: () => clearTimeout(t) };
  }

  const bannerTitle = $derived(
    race
      ? `Question ${s.turnCount + 1}`
      : run
        ? `Depth ${depth}`
        : mine && !local
          ? 'Your turn'
          : `${active.name}'s turn`,
  );

  // Delve: the seconds the question started with (a find's, a blasted card's or
  // the depth's), never read off the deadline, which a burning flare moves on.
  const seconds = $derived(run ? questionTimer(s) : q?.deadline ? Math.round((q.deadline - (q.clockAt ?? q.askedAt)) / 1000) : 0);
  // Delve: the line over the banner says what just got harder.
  const change = $derived(run ? delveChange(depth) : null);
  const kicker = $derived(change ?? '');
  // Short timers only sound urgent near the end.
  const warnFrom = $derived(run ? Math.max(3, Math.min(5, Math.round(seconds * 0.35))) : 5);

  // Delve together: when the vote closes, its draw plays out on the cards
  // (ChooseCategory) before the question shows. Only on a screen that saw the
  // vote: one joining or refreshing into the question goes straight to it.
  // Set before the DOM updates, so the cards stay up rather than being
  // swapped for the question and back.
  let raffle = $state<number | null>(null);
  let phaseSeen = '';
  let raffleTimer: ReturnType<typeof setTimeout> | null = null;
  $effect.pre(() => {
    const key = `${s.turnCount}:${s.phase}`;
    const was = phaseSeen;
    phaseSeen = key;
    if (!run || !group || s.phase !== 'question' || !s.question) {
      if (s.phase !== 'question') raffle = null;
      return;
    }
    if (was === `${s.turnCount}:choosing` && untrack(() => raffle) === null) {
      const qid = s.question.askedAt;
      raffle = qid;
      // Should the draw never say it is done, the question shows anyway.
      if (raffleTimer) clearTimeout(raffleTimer);
      raffleTimer = setTimeout(() => raffle === qid && (raffle = null), 4000);
    }
  });
  $effect(() => () => {
    if (raffleTimer) clearTimeout(raffleTimer);
  });
  const drawing = $derived(raffle !== null && raffle === s.question?.askedAt && s.phase === 'question');

  // Delve: a mark at the start of a depth worth it (a new zone, the last one
  // standing, a new best), engraved over the head of the stage for a few
  // seconds. Never on a rejoin or the first depth: only when the run is seen
  // going one deeper. It belongs to its turn: the next one clears it.
  type Card = { key: string; turn: number; title: string; sigil: string; accent: string; label: string };
  let card = $state<Card | null>(null);
  let cardTimer: ReturnType<typeof setTimeout> | null = null;
  let depthSeen = '';
  /**
   * How the mark is drawn (lib/zoneMark): 'medallion' (two seals with the
   * name's plate slung between them), 'nameplate' (the cards' nameplate),
   * 'cartouche' (pointed ends), or the earlier 'ribbon', 'banner' (the
   * banner's rules rising into a cartouche) and 'seal' (seals beside the
   * heading).
   */
  const zoneVariant: Variant = 'medallion';
  /**
   * It starts once the stage has faded in (0.35 s), comes in over about 0.6 s
   * (the pen's sweep), is held 3.5 s, then goes out over 1.2 s.
   */
  const ZONE_DELAY = 0.35;
  const ZONE_HOLD = 4450;
  const ZONE_OUT = 1200;
  $effect(() => {
    if (!run || s.phase !== 'choosing') return;
    const key = `${run.startedAt}:${depth}`;
    if (key === depthSeen) return;
    const deeper = depthSeen.startsWith(`${run.startedAt}:`);
    depthSeen = key;
    if (!deeper) return;
    untrack(() => {
      descended();
      // Tinted by the zone it opens (the depth's colour on the header), bearing its sigil and its ornament.
      const accent = accentAt(depth);
      const name = milestoneAt(depth);
      const sigil = zoneAt(depth);
      const best = session.bestAtStart;
      const turn = s.turnCount;
      const change = delveChange(depth);
      let next: Card | null = null;
      if (name) next = { key, turn, title: name, sigil, accent, label: `Depth ${depth}: ${name}.${change ? ` ${change}.` : ''}` };
      else if (!group && best !== null && depth === best + 1)
        next = { key, turn, title: 'Deeper than ever', sigil, accent, label: `Deeper than ever: depth ${depth}, past your best of ${best}.` };
      if (!next) return;
      card = next;
      sfx('stratum');
      if (cardTimer) clearTimeout(cardTimer);
      cardTimer = setTimeout(() => card?.key === key && (card = null), ZONE_HOLD);
    });
  });
  // The next turn takes the head (the stage is keyed), and the mark with it.
  $effect(() => {
    if (card && card.turn !== s.turnCount) card = null;
  });
  $effect(() => () => {
    if (cardTimer) clearTimeout(cardTimer);
  });
  const zone = $derived(card && card.turn === s.turnCount ? card : null);
  /** The mark's light breaks into the scene once it has unfolded: off its upper edge, toned to its size. */
  const zoneFx = (el: HTMLElement) => card && milestoneReached(el, card.accent);
  /** Reduced motion, or the effects off: the mark isn't drawn, it simply fades in. */
  const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-still');

  /** Online Delve: where you perished, while the run goes on without you (someone still stands). */
  const myFall = $derived(session.perished && session.myPlayerId && standingIds(s).length ? fellAt(s, session.myPlayerId) : null);
  /** Delve together: a teammate who stands could still give you one of their lives. */
  const canBeRevived = $derived(group && myFall !== null && s.players.some((p) => p.id !== session.myPlayerId && livesOf(s, p.id) >= REVIVE_FROM));
  /** Delve together: teammates you could give one of your lives right now (between questions). */
  const revivable = $derived.by(() => {
    const me = session.myPlayerId;
    if (!group || !me || session.mode === 'local') return [];
    return s.players.filter((p) => reviveProblem(s, me, p.id) === null);
  });
</script>

{#snippet timer()}
  {#if !drawing && (q?.deadline || (run && q && s.phase === 'question'))}
    {#key q.askedAt}
      <TimerRing deadline={q.deadline} total={seconds} stopped={s.phase === 'reveal'} {warnFrom} />
    {/key}
  {/if}
{/snippet}

<div class="game">
  <p class="sr" aria-live="polite">{zone?.label ?? ''}</p>
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
        <div class="head">
          {#if run}
            <!-- Kept even when empty, so the banner stays put from one depth to the next. -->
            <p class="kicker" class:deep={depth >= 21} class:change={!!change} class:veiled={!!zone}>{kicker || '\u00a0'}</p>
          {/if}
          <div class="banner" class:dm={!!dm} class:veiled={!!zone && drawsRules(zoneVariant)} style:--c={bannerColor}>
            <span class="rule"></span>
            <h2 use:bannerFx={{ color: bannerColor, big: bannerBig }}>{bannerTitle}</h2>
            <span class="rule"></span>
          </div>
          {#if zone}
            <!-- Delve: a new zone's name, engraved over the head for a moment
                 (drawn once the stage has faded in). -->
            <div class="zone" in:fade={{ duration: quiet() ? 600 : 200, delay: quiet() ? 0 : ZONE_DELAY * 1000 }} out:fade={{ duration: ZONE_OUT, easing: sineInOut }}>
              {#key zone.key}
                <ZoneMark variant={zoneVariant} title={zone.title} sigil={zone.sigil} accent={zone.accent} delay={ZONE_DELAY} onfx={zoneFx} />
              {/key}
            </div>
          {/if}
        </div>

        {#if s.phase === 'choosing' || drawing}
          <ChooseCategory drawn={drawing ? (s.question?.category ?? null) : null} ondrawn={() => (raffle = null)} />
        {:else}
          <!-- A new question on the same turn (the host asked another) starts fresh. -->
          {#key s.question?.askedAt}
            <QuestionView timer={phone.current ? undefined : timer} />
          {/key}
        {/if}

        {#if myFall !== null}
          <p class="delve-line muted">
            You perished; watching.{#if canBeRevived}{' '}A teammate can give you a life between questions.{/if}
          </p>
        {:else if revivable.length && (s.phase === 'choosing' || s.phase === 'reveal')}
          <p class="delve-line revive-hint" transition:fade>
            {revivable.length === 1
              ? `Tap + on ${revivable[0].name}'s entry to give them a life.`
              : 'Tap + on an entry to give a life.'}
          </p>
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
  /* The kicker and banner. Holds their margins, so the mark laid over it
     (ZoneMark) has their box to measure and keeps within it. */
  .head {
    display: flow-root;
    position: relative;
  }
  .zone {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
  /* What the mark takes the place of gives way while it shows, and comes
     back once it has mostly gone. */
  .kicker,
  .rule {
    transition: opacity 0.6s 1s ease-out;
  }
  .veiled.kicker,
  .veiled .rule {
    opacity: 0;
    transition: opacity 0.25s ease-out;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
  .revive-hint {
    color: #f0b6a8;
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
    .skip {
      margin-top: 1rem;
    }
  }
</style>
