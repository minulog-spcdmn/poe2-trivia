<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';
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
  import { REVIVE_FROM, delveDepth, fellAt, isGroupRun, livesOf, questionTimer, reviveProblem, shownDepth, standingIds } from '../lib/delve';
  import { startLine } from '../lib/delveStart';
  import { accentAt, milestoneAt, swing } from '../lib/descent';
  import { zoneAt } from '../lib/zoneSigils';
  import Threshold from './zonebanner/Threshold.svelte';
  import { quiet } from './zonebanner/head';
  import { DELAY as ZONE_DELAY, EXIT as ZONE_EXIT, HOLD as ZONE_HOLD, STILL_FADE } from './zonebanner/thresholdArt';
  import { descended, dynamiteBlast, milestoneReached } from '../lib/fx/moments';
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

  // Delve: where the depth would read 0, the run's start line (dealt from a
  // shuffled deck on this device, delveStart.ts); it gives way to "Depth 1" as the stage
  // crosses to the next turn, as one depth gives way to the next.
  const startsRun = $derived(!!run && shownDepth(depth) <= 0);
  const bannerTitle = $derived(
    race
      ? `Question ${s.turnCount + 1}`
      : run
        ? startsRun
          ? startLine(run.startedAt)
          : `Depth ${shownDepth(depth)}`
        : mine && !local
          ? 'Your turn'
          : `${active.name}'s turn`,
  );

  // Delve: the seconds the question started with (a find's or the depth's),
  // never read off the deadline, which a burning flare moves on.
  const seconds = $derived(run ? questionTimer(s) : q?.deadline ? Math.round((q.deadline - (q.clockAt ?? q.askedAt)) / 1000) : 0);
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
    // Back after a dropped connection with the question's clock already
    // running: the draw would eat into it, so the question shows at once.
    const asked = s.question;
    const running = asked.deadline !== null && asked.clockAt !== undefined && session.hostNow() > asked.clockAt;
    if (was === `${s.turnCount}:choosing` && !running && untrack(() => raffle) === null) {
      const qid = asked.askedAt;
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

  // Delve: a gate at the start of a depth worth it (a new zone, a new best),
  // built over the head of the stage for a few seconds (zonebanner/Threshold).
  // Never on a rejoin or the first depth: only when the run is seen going one
  // deeper. It belongs to its turn: the next one clears it.
  type Card = { key: string; turn: number; title: string; sigil: string; accent: string; label: string; leaving: boolean; still: boolean };
  let card = $state<Card | null>(null);
  let cardTimers: ReturnType<typeof setTimeout>[] = [];
  let depthSeen = '';
  // It starts once the stage has faded in (ZONE_DELAY), is built in about
  // 1.3 s, held, then told to leave at ZONE_HOLD and gone ZONE_EXIT later
  // (with reduced motion or the effects off it only fades in and out).
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
      const still = quiet();
      let next: Card | null = null;
      if (name) next = { key, turn, title: name, sigil, accent, label: `Depth ${shownDepth(depth)}: ${name}.`, leaving: false, still };
      else if (!group && best !== null && depth === best + 1)
        next = { key, turn, title: 'Deeper than ever', sigil, accent, label: `Deeper than ever: depth ${shownDepth(depth)}, past your best of ${shownDepth(best)}.`, leaving: false, still };
      if (!next) return;
      card = next;
      sfx('stratum');
      cardTimers.forEach(clearTimeout);
      cardTimers = [
        setTimeout(() => card?.key === key && (card.leaving = true), ZONE_HOLD * 1000),
        setTimeout(() => card?.key === key && (card = null), (ZONE_HOLD + (still ? STILL_FADE : ZONE_EXIT)) * 1000 + 50),
      ];
    });
  });
  // The next turn takes the head (the stage is keyed), and the mark with it.
  $effect(() => {
    if (card && card.turn !== s.turnCount) card = null;
  });
  $effect(() => () => cardTimers.forEach(clearTimeout));
  const zone = $derived(card && card.turn === s.turnCount ? card : null);
  /** The gate's light breaks into the scene once its lintel is lit, off the lintel, toned to its size. */
  const zoneFx = (el: HTMLElement) => card && milestoneReached(el, card.accent);

  // Delve: dynamite blasted the question away for a new one at the same
  // depth. No depth deeper, so instead of the plunge the stage swings
  // sideways, toward where the new question's card lay on the offer from the
  // blasted one's (a card to its left swings left): the old question bursts
  // and goes the other way, the new one comes in from that side, and the
  // scene behind swings with them (descent.ts swing). Set before the DOM
  // updates, so the old question is still there to burst and to go.
  let swingSide = $state<-1 | 1 | null>(null);
  let askedSeen = 0;
  $effect.pre(() => {
    const asked = s.question?.askedAt ?? 0;
    const b = s.phase === 'question' ? s.question?.blast : undefined;
    const was = askedSeen;
    askedSeen = asked;
    if (asked === was) return;
    if (!run || !b || b.was.at !== was) {
      swingSide = null;
      return;
    }
    swingSide = b.side;
    untrack(() => {
      // A fresh question, as on a new turn: back up to its art (on phones the
      // button was often pressed scrolled down, under the answers).
      window.scrollTo({ top: 0, behavior: 'smooth' });
      swing(b.side);
      const art = document.querySelector('.questions .art, .questions .tiles');
      dynamiteBlast({ art, blown: [], mine: !!b.by && b.by === session.myPlayerId });
    });
  });
  /** Reduced motion, or the effects held still: a swing only cross-fades. */
  const stillMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-still');
  /** Svelte transition: the blasted question goes, away from the side the new one comes from. */
  function swingOut(_node: Element) {
    const side = swingSide;
    if (!side) return { duration: 0 };
    if (stillMotion()) return { duration: 200, css: (t: number) => `opacity: ${t}` };
    return {
      duration: 520,
      easing: cubicIn,
      css: (t: number, u: number) => `transform: translateX(${-side * u * 55}%) rotate(${-side * u * 2.5}deg); opacity: ${t}; filter: blur(${u * 3}px)`,
    };
  }
  /** Svelte transition: the new question comes in from the side its card lay on. */
  function swingIn(_node: Element) {
    const side = swingSide;
    if (!side) return { duration: 0 };
    if (stillMotion()) return { duration: 300, delay: 150, css: (t: number) => `opacity: ${t}` };
    return {
      duration: 700,
      delay: 180,
      easing: cubicOut,
      css: (t: number, u: number) => `transform: translateX(${side * u * 45}%); opacity: ${t}`,
    };
  }

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
            <!-- An empty line over the banner, the room a zone's gate rises into (zonebanner/Threshold measures it). -->
            <p class="kicker">{'\u00a0'}</p>
          {/if}
          <!-- The gate's columns stand in for the rules while it shows. -->
          <div class="banner" class:dm={!!dm} class:veiled={!!zone && !zone.leaving} style:--c={bannerColor}>
            <span class="rule"></span>
            <h2 class:start={startsRun} use:bannerFx={{ color: bannerColor, big: bannerBig }}>{bannerTitle}</h2>
            <span class="rule"></span>
          </div>
          {#if zone}
            <!-- Delve: a new zone's name over the head for a moment, on a gate
                 built once the stage has faded in. -->
            {#key zone.key}
              <Threshold
                title={zone.title}
                sigil={zone.sigil}
                accent={zone.accent}
                leaving={zone.leaving}
                still={zone.still}
                delay={zone.still ? 0 : ZONE_DELAY}
                onfx={zoneFx}
              />
            {/key}
          {/if}
        </div>

        {#if s.phase === 'choosing' || drawing}
          <ChooseCategory drawn={drawing ? (s.question?.category ?? null) : null} ondrawn={() => (raffle = null)} />
        {:else}
          <!-- A new question on the same turn (the host asked another, or dynamite
               blasted the last away) starts fresh. Old and new share one grid
               cell while they cross. -->
          <div class="questions">
            {#key s.question?.askedAt}
              <div class="q-slot" in:swingIn out:swingOut>
                <QuestionView timer={phone.current ? undefined : timer} />
              </div>
            {/key}
          </div>
        {/if}

        {#if myFall !== null}
          <p class="delve-line muted">
            You perished; watching.{#if canBeRevived}{' '}A teammate can give you a life between questions.{/if}
          </p>
        {:else if revivable.length && (s.phase === 'choosing' || s.phase === 'reveal')}
          <p class="delve-line revive-hint" transition:fade>
            {revivable.length === 1
              ? `Use the heart on ${revivable[0].name}'s entry to revive them with one of your lives.`
              : 'Use the heart on an entry to revive that teammate with one of your lives.'}
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
  /* The question and, while dynamite swings the stage, the one it blasted
     away, in one cell (#app clips what swings past the screen's edge). */
  .questions {
    display: grid;
  }
  .q-slot {
    grid-area: 1 / 1;
    min-width: 0;
  }
  /* The kicker and banner. Holds their margins, so the gate laid over it
     (zonebanner/Threshold) has their box to measure and keeps within it. */
  .head {
    display: flow-root;
    position: relative;
  }
  /* The rules give way to the gate's columns while it shows, and come back
     as it goes. */
  .rule {
    transition: opacity 0.6s 0.75s ease-out;
  }
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

  /* Room above the banner, always there in a run (so nothing moves when a
     gate shows): the gate's lintel and keystone rise into it, clear of the
     player strip above. */
  .kicker {
    margin: 1.4rem 0 -0.4rem;
    text-align: center;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
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
  /* A run's start line arrives as a depth does, its spacing opening less:
     a line of words that wide would run off a phone's edge. */
  .banner h2.start {
    animation-name: arrive-line;
  }
  @keyframes arrive-line {
    from {
      opacity: 0;
      letter-spacing: 0.06em;
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
