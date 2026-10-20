<script lang="ts">
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { session } from '../lib/session.svelte';
  import { playerColor } from '../lib/ui';
  import Scoreboard from './Scoreboard.svelte';
  import ChooseCategory from './ChooseCategory.svelte';
  import QuestionView from './QuestionView.svelte';
  import Avatar from './Avatar.svelte';
  import DrawnMark from './DrawnMark.svelte';
  import PlayerName from './PlayerName.svelte';
  import TimerRing from './TimerRing.svelte';
  import { fireAmbience, sfx } from '../lib/sound';
  import { onMount } from 'svelte';
  import { deathmatchIntro, deathmatchMood, gameStart, turnBanner } from '../lib/fx/moments';
  import { portal } from '../lib/portal';
  import { flat, phone } from '../lib/layout';
  import { REVIVE_FROM, WAY_OUT, delveDepth, fellAt, opensZone, isGroupRun, livesOf, questionTimer, reviveProblem, shownDepth, standingIds } from '../lib/delve';
  import { startLine } from '../lib/delveStart';
  import { revivedText } from '../lib/difficultyText';
  import { accentAt, milestoneAt, stratumName, swing } from '../lib/descent';
  import { deeperThanEver, descended, zoneArrival } from '../lib/fx/moments';
  import { BLAST_IMPACT_MS, BLAST_IN_DELAY_MS, BLAST_IN_MS, blastAway } from '../lib/blastAway';
  import { untrack } from 'svelte';
  import { clockMs } from '../lib/game';
  import { motion } from '../lib/motion.svelte';
  import { dealing } from '../lib/dealing.svelte';
  import { arrival, speak } from '../lib/zoneArrival.svelte';
  import { closeItemWindow, itemWindow } from '../lib/itemWindow.svelte';
  import ItemWindow from './ItemWindow.svelte';
  import { warmGame } from './gameCircles.svelte';
  import { backdropDropShadow } from '../lib/backdropDropShadow';

  const s = $derived(session.state!);
  // The circles behind the coming question and at the game's end, built ahead away from the page.
  $effect(() => warmGame(s));
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const local = $derived(session.mode === 'local');
  // An item opened from a question stays open from one question to the next, until the game ends.
  onMount(() => closeItemWindow);


  const race = $derived(s.settings.mode === 'race');
  const run = $derived(s.delve ?? null);
  const depth = $derived(delveDepth(s));
  const group = $derived(isGroupRun(s));
  // The question's timer: at the end of the scoreboard's row on phones
  // upright (pinned to the top with it, where a page scrolls), and at the
  // right end of the question's task line otherwise (a phone on its side too, however narrow:
  // its header row keeps its room for the players). Only ever one, so its
  // ticks never double.
  const slim = $derived(phone.current && !flat.current);
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

  /** Svelte action: the turn banner's entrance. Runs once per turn (the stage is keyed). */
  function bannerFx(node: HTMLElement, o: { color: string; big: boolean }) {
    const t = setTimeout(() => turnBanner(node, o.color, o.big));
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

  // The seconds the question's clock runs (Delve: a find's or the depth's),
  // known before it starts, so the ring stands full from the first; never
  // read off the deadline, which a burning flare moves on. 0: untimed turns.
  const seconds = $derived(run ? questionTimer(s) : Math.round((clockMs(s) ?? 0) / 1000));
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
  /** Together: the vote drew a vein's way out, and its draw plays on the two cards before the team goes back to the light (Delve.leaving). */
  const leaving = $derived(!!run && group && s.phase === 'choosing' && s.delve?.leaving !== undefined);

  // Delve: going down into a new zone, the stage stands empty over the
  // plunging scene, where the zone's title card names it (components/zonecard),
  // until its cards are dealt as the plunge lands (lib/dealing.svelte.ts); then
  // the depth and its cards come in together.
  const held = $derived(dealing.held);
  /** The stage in play: the turn's, or an empty one while its cards are on their way. */
  const stageKey = $derived(held ? `held:${s.turnCount}` : `${s.turnCount}`);

  // Delve: each depth, once, as its cards are dealt. A new zone's name has its
  // title card, in the plunge into it (components/zonecard); here the
  // backdrop's embers flare at every depth the run is seen going down to, and
  // a screen reader is told where a run starts, on a screen that saw it start
  // (session.runStarted), and the name of a new zone this screen never saw
  // named by its card. Alone, one past this device's best says so on the line
  // over the banner, for the turn that reached it.
  type Past = { turn: number; accent: string; live: boolean };
  let pastBest = $state<Past | null>(null);
  let depthSeen = '';
  $effect(() => {
    if (!run || s.phase !== 'choosing' || held) return;
    const key = `${run.startedAt}:${depth}`;
    if (key === depthSeen) return;
    const deeper = depthSeen.startsWith(`${run.startedAt}:`);
    depthSeen = key;
    untrack(() => {
      if (deeper) descended();
      // (This device's best: not a spectator's, watching someone else's run.)
      const best = session.spectating ? null : session.bestAtStart;
      const past = !group && best !== null && depth === best + 1;
      // The zone this depth opens, if it opens one, and whether this screen saw its card name it.
      const zone = opensZone(depth) ? milestoneAt(depth) : null;
      const unnamed = !!zone && arrival.shownFor !== key;
      // Seen as it happened, on any depth but a zone's first (where its card says so, over the zone's own sound): the line comes with its sting.
      const live = deeper && past && !zone;
      pastBest = past ? { turn: s.turnCount, accent: accentAt(depth), live } : null;
      if (!deeper && depth === 1 && session.runStarted === run.startedAt) speak(key, `${stratumName(0)}.`);
      else if (unnamed) {
        // Back in the game as its cards were on their way (a reload), or too late in the plunge into it for a card at all.
        speak(key, `Depth ${shownDepth(depth)}: ${zone}.${past ? ' Deeper than ever.' : ''}`);
        // The embers take the zone's colour all the same, as they would at the card's lock.
        if (deeper) zoneArrival();
      } else if (live) speak(key, `Deeper than ever: depth ${shownDepth(depth)}, past your best of ${shownDepth(depth - 1)}.`);
    });
  });
  /** Ms from a turn's stage coming in to its line over the banner coming in: once the stage has faded in (its in:fade, below). */
  const PAST_IN = 500;
  /** Svelte action: deeper than ever, seen as it happened: as its line comes in, a sting and a few glints on it. */
  function pastFx(node: HTMLElement, p: Past) {
    if (!p.live) return;
    const t = setTimeout(() => {
      sfx('zoneSting');
      deeperThanEver(node, p.accent);
    }, PAST_IN);
    return { destroy: () => clearTimeout(t) };
  }

  // Delve: dynamite blasted the question away for a new one at the same
  // depth. No depth deeper, so instead of the plunge the stage swings
  // sideways, toward where the new question's card lay on the offer from the
  // blasted one's (a card to its left swings left): the explosion bursts in
  // from that side of the screen, blows the old question apart and flings it
  // the other way (lib/blastAway.ts), the scene behind swings as its
  // shockwave hits (descent.ts swing), and the new question comes in from
  // the side the blast came from, through the smoke. Set before the DOM
  // updates, so the old question is still there to blow apart.
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
      const still = motion.still;
      // Blown apart as it still shows (the DOM is the old question's until this flush ends).
      const old = document.querySelector<HTMLElement>('.questions .q-slot');
      if (!still && old) blastAway({ node: old, side: b.side, mine: !!b.by && (b.by === session.myPlayerId || session.mode === 'local') });
      // A fresh question, as on a new turn: back up to its art (on phones the
      // button was often pressed scrolled down, under the answers).
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => swing(b.side), still ? 0 : BLAST_IMPACT_MS);
    });
  });
  /** Svelte transition: the blasted question goes at once (its shards fly in an overlay of their own, see above), or cross-fades. */
  function swingOut(_node: Element) {
    // Reduced motion, or the effects held still: a blast only cross-fades.
    if (!swingSide || !motion.still) return { duration: 0 };
    return { duration: 200, css: (t: number) => `opacity: ${t}` };
  }
  /** Svelte transition: the new question comes in from the side the blast came from, as the smoke clears. */
  function swingIn(_node: Element) {
    const side = swingSide;
    if (!side) return { duration: 0 };
    if (motion.still) return { duration: 300, delay: 150, css: (t: number) => `opacity: ${t}` };
    return {
      duration: BLAST_IN_MS,
      delay: BLAST_IN_DELAY_MS,
      easing: cubicOut,
      css: (t: number, u: number) => `transform: translateX(${(side * u * 70).toFixed(2)}vw) rotate(${(side * u * 2).toFixed(2)}deg); opacity: ${Math.min(1, t * 1.8).toFixed(3)}`,
    };
  }

  /**
   * Svelte transition: the cards fade out over the question that takes their
   * place, rather than going at once, so the effects on them (a picked card's
   * fire) fade with them rather than outlining where they were. They take
   * no height meanwhile (.leaving), so the question is laid out where it
   * stays and nothing under it moves; what of them reaches past it, #app clips.
   */
  function cardsOut(node: HTMLElement) {
    node.classList.add('leaving');
    return { duration: 180, css: (t: number) => `opacity: ${t}` };
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
  /**
   * Delve together: the lives given to bring teammates back since the last
   * question closed, said under the stage until the next one is asked (the
   * latest two): their entries' hearts play as it happens, the line keeps
   * who gave it to whom. `revivesBefore`: how many the run had before.
   */
  const revives = $derived(s.delve?.revives ?? []);
  let revivesBefore = $state(untrack(() => ({ run: s.delve?.startedAt ?? 0, n: revives.length })));
  $effect(() => {
    const at = { run: s.delve?.startedAt ?? 0, n: revives.length };
    const was = untrack(() => revivesBefore);
    if (s.phase === 'question' || at.run !== was.run || at.n < was.n) revivesBefore = at;
  });
  const revivedLines = $derived(
    group && (s.phase === 'choosing' || s.phase === 'reveal') && s.delve?.startedAt === revivesBefore.run
      ? revives
          .slice(revivesBefore.n)
          .slice(-2)
          .map((r) => ({ key: `${r.at}:${r.to}`, text: revivedText(r.by, r.to, (id) => nameOf(id)?.name ?? '?', session.myPlayerId) }))
      : [],
  );
</script>

{#snippet timer()}
  <!-- There from the question's start, full while its clock waits for the art, so nothing jumps as it starts. -->
  {#if !drawing && q && (q.deadline || (s.phase === 'question' && seconds > 0))}
    {#key q.askedAt}
      <TimerRing deadline={q.deadline} total={seconds} stopped={s.phase === 'reveal'} {warnFrom} />
    {/key}
  {/if}
{/snippet}

<!-- data-cursor: where other players' pointers are placed (PeerCursors) when over nothing more particular;
     its parts and what's in them have anchors of their own (Scoreboard, ChooseCategory, QuestionView). -->
<div class="game" class:kicking={!!run && !!pastBest && pastBest.turn === s.turnCount} data-cursor="game">
  <p class="sr" aria-live="polite">{run && arrival.spokenFor === `${run.startedAt}:${depth}` ? arrival.spoken : ''}</p>
  <Scoreboard aside={slim ? timer : undefined} />

  <!-- The outgoing and incoming turn share one grid cell while they cross-fade,
       instead of stacking (which briefly doubled the page height). -->
  <div class="turns">
    {#key stageKey}
      <div class="stage" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 180 }}>
        {#if held}
          <!-- Going down into a new zone: nothing yet but the scene plunging. -->
        {:else}
          {#if dm}
            <div class="dm-strip" data-cursor="duel" in:fly={{ y: -10, duration: 400 }}>
              <span class="dm-title">⚔ Deathmatch · round {dm.round}</span>
              <span class="dm-duelists">
                {#each dm.alive as id (id)}
                  {@const p = nameOf(id)}
                  {#if p}
                    <span class="duelist" class:done={id in dm.results} title={p.name}>
                      <Avatar name={p.name} hue={p.hue} size={24} />
                      {#if id in dm.results}<i class:ok={dm.results[id]}><DrawnMark shape={dm.results[id] ? 'check' : 'cross'} /></i>{/if}
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
          <div class="head" data-cursor="banner">
            {#if run && pastBest && pastBest.turn === s.turnCount}
              <!-- Over the banner, alone, one past your best says so (in the room
                   above it, so nothing moves when it comes). -->
              <p class="kicker">
                <span class="past" class:still={motion.still} style:--accent={pastBest.accent} style:--in="{PAST_IN}ms">
                  <span class="past-text" use:pastFx={pastBest}>Deeper than ever</span>
                </span>
              </p>
            {/if}
            <div class="banner" class:dm={!!dm} style:--c={bannerColor}>
              <span class="rule"></span>
              <h2 class:start={startsRun} use:bannerFx={{ color: bannerColor, big: bannerBig }} use:backdropDropShadow>{bannerTitle}</h2>
              <span class="rule"></span>
            </div>
          </div>

          <!-- The cards fade out over the question that takes their place (see cardsOut). -->
          <div class="turn-body">
            {#if s.phase === 'choosing' || drawing}
              <div class="cards-slot" out:cardsOut>
                <ChooseCategory drawn={drawing ? (s.question?.category ?? null) : leaving ? WAY_OUT : null} ondrawn={() => (raffle = null)} />
              </div>
            {:else}
              <!-- A new question on the same turn (the host asked another, or dynamite
                   blasted the last away) starts fresh. Old and new share one grid
                   cell while they cross. -->
              <div class="questions">
                {#key s.question?.askedAt}
                  <div class="q-slot" in:swingIn out:swingOut>
                    <QuestionView timer={slim ? undefined : timer} />
                  </div>
                {/key}
              </div>
            {/if}
          </div>

          {#if group}
            <!-- Who brought whom back, read out as it happens. -->
            <div class="revived" aria-live="polite">
              {#each revivedLines as line (line.key)}
                <p class="delve-line revive-hint" transition:slide={{ duration: 250 }}>{line.text}</p>
              {/each}
            </div>
          {/if}
          {#if myFall !== null}
            <p class="delve-line muted">
              You perished and are now watching.{#if canBeRevived}{' '}A teammate can give you a life between questions.{/if}
            </p>
          {:else if revivable.length && (s.phase === 'choosing' || s.phase === 'reveal')}
            <p class="delve-line revive-hint" transition:fade>
              {revivable.length === 1
                ? `Use the heart on ${revivable[0].name}'s entry to revive them with one of your lives.`
                : 'Use the heart on an entry to revive that teammate with one of your lives.'}
            </p>
          {/if}
          {#if session.isHost && !local && !race && !run && !active.connected && s.phase !== 'reveal'}
            <div class="skip" data-cursor="skip" transition:fade>
              <span class="muted">{active.name} is disconnected{skipIn ? `; skipping in ${skipIn}s` : ''}.</span>
              <button class="btn small" onclick={() => skipTurn(session.skipAt)}>Skip their turn</button>
            </div>
          {:else if session.idle}
            <div class="skip" data-cursor="skip" transition:fade>
              <span class="muted">{active.name} hasn't {s.phase === 'choosing' ? 'picked a category' : 'answered'} in a while.</span>
              <button class="btn small" onclick={() => skipTurn(session.idle)}>Skip their turn</button>
            </div>
          {/if}
          {#if session.artMissing}
            <div class="skip" data-cursor="skip" transition:fade>
              <span class="muted">The art for this question couldn't be loaded.</span>
              <button class="btn small" onclick={() => session.dispatch({ type: 'reask' })}>Ask another question</button>
            </div>
          {/if}
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

{#if itemWindow.item}<ItemWindow item={itemWindow.item} />{/if}

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
  /* The cards, and the question that takes their place, in one cell. */
  .turn-body {
    display: grid;
  }
  .turn-body > * {
    grid-area: 1 / 1;
    min-width: 0;
  }
  /* Leaving, they take no height (still drawn where they were, over the
     question), so the cell is the question's from the start. */
  .cards-slot:global(.leaving) {
    height: 0;
    min-height: 0;
    z-index: 1;
    pointer-events: none;
  }
  /* The question and, as it cross-fades with reduced motion, the one dynamite
     blasted away, in one cell (#app clips what comes in past the screen's edge). */
  .questions {
    display: grid;
  }
  .q-slot {
    grid-area: 1 / 1;
    min-width: 0;
  }
  /* The banner, holding its margins, and the kicker over it. */
  .head {
    position: relative;
    display: flow-root;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Over the banner, in the room above it (taking none of its own, so
     nothing moves when it comes): alone, one past this device's best says
     so, lettered as the zone title card's meta line (components/zonecard),
     in the depth's colour, between two short rules. */
  .kicker {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% - 0.6rem);
    margin: 0;
    pointer-events: none;
    text-align: center;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .past {
    --track: 0.3em;
    --ink: color-mix(in srgb, var(--accent) 75%, var(--gold-hi));
    display: inline-flex;
    align-items: center;
    gap: 0.8em;
    color: var(--ink);
    white-space: nowrap;
    /* As tall as the line, and set on its top (not on its baseline, which an
       empty rule would give it), so the line keeps its height. */
    vertical-align: top;
  }
  /* Its letters spread out of a blur once the stage has faded in, and the rules
     are drawn out from them. */
  .past-text {
    letter-spacing: var(--track);
    padding-left: var(--track);
    text-shadow:
      0 0 10px color-mix(in srgb, var(--accent) 35%, transparent),
      0 1px 2px rgba(0, 0, 0, 0.9);
    animation: past-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) var(--in) both;
  }
  .past::before,
  .past::after {
    content: '';
    width: clamp(20px, 6vw, 56px);
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--ink));
    transform-origin: right;
    animation: grow 0.7s cubic-bezier(0.16, 1, 0.3, 1) calc(var(--in) + 0.1s) both;
  }
  .past::after {
    background: linear-gradient(270deg, transparent, var(--ink));
    transform-origin: left;
  }
  /* Held still, it only comes in with the stage's fade. */
  .past.still .past-text,
  .past.still::before,
  .past.still::after {
    animation: none;
  }
  @keyframes past-in {
    from {
      opacity: 0;
      letter-spacing: 0.08em;
      padding-left: 0.08em;
      filter: blur(3px);
    }
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
  /* Two revives at once read as a pair. */
  .revived .delve-line + .delve-line {
    margin-top: 0.3rem;
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
    /* Its glow, so wide and soft it bands in CSS, drawn by the WebGL backdrop
       when it can (lib/backdropDropShadow.ts), dithered; CSS paints it otherwise. */
    --drop-shadow: drop-shadow(0 3px 12px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 24px color-mix(in srgb, var(--c), transparent 40%));
    filter: var(--drop-shadow-paint, var(--drop-shadow));
    animation: arrive 0.9s var(--ease-out) both;
    text-align: center;
    white-space: nowrap;
    /* One line, so no leading over and under it: the space round the banner is its margins. */
    line-height: 1.15;
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
  /* The blur comes after the h2's own filter, so the two lists match up to it
     and it eases out (a blur in place of the drop shadows would only swap
     halfway, not ease). */
  @keyframes arrive {
    from {
      opacity: 0;
      letter-spacing: 0.4em;
      filter: var(--drop-shadow-paint, var(--drop-shadow)) blur(6px);
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
      filter: var(--drop-shadow-paint, var(--drop-shadow)) blur(6px);
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
    --mark-size: 6px;
    --mark-stroke: 1.3px;
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
    zoom: var(--stage-zoom, 1);
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
    .past {
      --track: 0.22em;
    }
    /* The banner has no margin over it here: the kicker sits just above it, a little smaller. */
    .kicker {
      bottom: 100%;
      font-size: 0.64rem;
      line-height: 1.2;
    }
    .skip {
      margin-top: 1rem;
    }
  }

  /* Short desktop windows: less room over the scoreboard, so the question and Next fit.
     (From 641px, below lib/layout.ts `short`'s 761: every screen above a
     phone's has the game's top padding, while the question's own tightening
     waits for the art and answers to stand side by side.) */
  @media (min-width: 641px) and (max-height: 820px) {
    .game {
      padding-top: clamp(4px, 1vh, 16px);
    }
  }

  /* A phone on its side (lib/layout.ts `flat`): the phone's slim scoreboard
     (in the header's row: App.svelte's `folded`) and banner, clear of the notch, so the question below them fits the
     screen's height (QuestionView sizes it to what's left). */
  @media (orientation: landscape) and (max-height: 500px) {
    .game {
      gap: 0.2rem;
      /* (At the foot, clear of the home indicator's strip where there is one.) */
      padding: 0 max(1rem, env(safe-area-inset-right)) max(0.25rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    }
    .banner {
      gap: 0.8rem;
      margin: 0.3rem 0 0.3rem;
    }
    .banner h2 {
      font-size: 1.3rem;
    }
    .past {
      --track: 0.22em;
    }
    .kicker {
      bottom: 100%;
      font-size: 0.64rem;
      line-height: 1.2;
    }
    /* The duel's strip on one line: its title is the header's already. */
    .dm-title {
      display: none;
    }
    .dm-strip {
      gap: 0.1rem 0.8rem;
      margin-bottom: 0.2rem;
      padding: 0.2rem 0.8rem;
      max-width: none;
    }
    .dm-rule {
      flex-basis: auto;
      font-size: 0.8rem;
    }
    .skip {
      margin-top: 0.6rem;
    }
    /* The cards ask how much room they have across (ChooseCategory's @container slot). */
    .cards-slot {
      container: slot / inline-size;
    }
  }
  /* A phone's browser on its side, the address bar up: the banner closer. */
  @media (orientation: landscape) and (max-height: 350px) {
    .banner {
      margin: 0.15rem 0 0.2rem;
    }
  }
  /* A phone upright (lib/layout.ts `upright`): the game as tall as the room
     under the header (App.svelte), the turn's stage taking what the
     scoreboard, the banner and the lines under it leave, the question
     filling it (QuestionView gives the art what its answers leave). Clear
     of the home indicator's strip at the foot. */
  @media (orientation: portrait) and (max-width: 640px) {
    .game {
      flex: 1;
      padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
    }
    .turns,
    .turn-body {
      flex: 1;
    }
    .q-slot {
      display: flex;
      flex-direction: column;
    }
    .delve-line {
      margin-top: 0.5rem;
      font-size: 0.9rem;
      line-height: 1.3;
    }
    .skip {
      margin-top: 0.5rem;
    }
  }
  /* A browser's bars up (at most 700px): the banner closer to what's under it. */
  @media (orientation: portrait) and (max-width: 640px) and (max-height: 700px) {
    .game {
      gap: 0.4rem;
    }
    .banner {
      margin-bottom: 0.3rem;
    }
  }
</style>
