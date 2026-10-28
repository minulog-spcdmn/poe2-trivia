<script lang="ts">
  // Today's unique: one item a day, the same for every exile (lib/daily.ts),
  // in one of the rune circles (a different one each day) with the game's own
  // answer buttons under it. Once it is answered, "Practice more" asks
  // further questions in the same spot;
  // they never touch the streak. Into the codex, today's unique goes as
  // found (its answer isn't counted) and a practice answer only into a
  // practice accuracy of its own (see pick).
  import { onMount, untrack, type Component } from 'svelte';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import itemData from '../data/items.json';
  import fakeNames from '../data/fakes.json';
  import { engine, session } from '../lib/session.svelte';
  import { glare } from '../lib/glare';
  import { backdropShadow } from '../lib/backdropShadow';
  import { codexRoute } from '../lib/codexRoute.svelte';
  import { settingsRoute } from '../lib/settingsRoute.svelte';
  import { actionOf, optionCap, typing } from '../lib/keybinds.svelte';
  import { optionIndex } from '../lib/keys';
  import { answerDrawn, isFake, questionTopic, type Item, type Question } from '../lib/game';
  import { clock } from '../lib/clock';
  import { countEvent } from '../lib/count';
  import { DAILY_KEY, DAYS_KEY, answerLog, answeredOn, askOne, dailyEngine, dailyGame, dailyQuestion, aTopic, dropAhead, graceOn, loadLog, mergeLogs, nextIn, replay, saveLog, settleDays, streakOn, untilNextMinute, upTo, utcDay } from '../lib/daily';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import { toasts } from '../lib/toasts.svelte';
  import { doused, reveal } from '../lib/fx/moments';
  import { whenIdle } from '../lib/idle';
  import { holdSettled } from '../lib/settled';
  import { onStoredElsewhere } from '../lib/storage';
  import { turnOf } from '../lib/turns';
  import { loadPlate } from '../lib/plateStore.svelte';
  import { PLACES } from '../lib/circlePlaces';
  import type { PlateName } from '../lib/plates/index.ts';
  import AnswerMark from './AnswerMark.svelte';
  import ArtImage from './ArtImage.svelte';
  import DailyStreak, { BADGE_IN_MS } from './DailyStreak.svelte';

  /**
   * `onDelve`: once answered, Delve deeper beside Practice more goes on into
   * a run alone (the start page says under what name). `lead`: it holds the
   * page's gold, while nothing else there does.
   */
  let { disabled = false, onDelve, lead = false }: { disabled?: boolean; onDelve?: () => void; lead?: boolean } = $props();

  // The clock moves on (the hours or minutes left, and past midnight UTC a new day):
  // just past each whole minute, when the minutes left go down, and at once
  // when the tab is looked at again (a tab in the background ticks seldom).
  // The server's time where it can say (lib/clock: asked once, and again only
  // when it had no reply, or this device's clock has jumped since), and at
  // once when the device is back online.
  let now = $state(clock.now());
  let alive = true;
  onMount(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      now = clock.now();
      dropFarAhead();
      // (Again from each tick, so a clock the server has just set right keeps to its minutes.)
      clearTimeout(t);
      if (alive) t = setTimeout(refresh, untilNextMinute(now) + 50);
    };
    const refresh = () => {
      tick();
      void clock.refresh()?.then(tick);
    };
    refresh();
    const seen = () => document.visibilityState === 'visible' && refresh();
    const online = () => void clock.sync().then(tick);
    document.addEventListener('visibilitychange', seen);
    addEventListener('online', online);
    return () => {
      alive = false;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', seen);
      removeEventListener('online', online);
    };
  });
  const today = $derived(utcDay(now));
  // A different one of the circles from day to day, the same for every exile
  // (lib/circlePlaces.ts, in its order), loaded only when it's today's, so
  // the start page carries none of the others.
  const LOAD: Record<PlateName, () => Promise<{ default: Component<{ size?: string; state?: 'idle' | 'good' | 'bad'; strength?: number }> }>> = {
    eye: () => import('./ArcaneCircle.svelte'),
    monad: () => import('./MonadCircle.svelte'),
    rose: () => import('./RoseCircle.svelte'),
    blackSun: () => import('./BlackSunCircle.svelte'),
    moth: () => import('./ForbiddenCircle.svelte'),
  };
  const DAILY = [...PLACES.daily.circles];
  // Loaded, its plate built away from the page, and put on the page in the
  // first idle moment after the start page's first frames (half a second at
  // most), once both are at hand.
  let Circle = $state.raw<Component<{ size?: string; state?: 'idle' | 'good' | 'bad'; strength?: number }> | null>(null);
  // Until then the page isn't settled (lib/settled.ts): the circle is on its
  // way, and work run ahead of need waits for it to have come and drawn
  // itself in (from the frame it's on the page, its stage holds the page).
  $effect(() => {
    const day = today;
    const name = turnOf(day, DAILY);
    const release = holdSettled();
    const stop = whenIdle(
      () =>
        void Promise.all([LOAD[name](), loadPlate(name)]).then(
          ([m]) => {
            if (day === untrack(() => today)) Circle = m.default;
            requestAnimationFrame(() => setTimeout(release));
          },
          // (Without its circle, today's unique plays on as it is.)
          (e) => {
            console.error("today's circle:", e);
            release();
          },
        ),
      { timeout: 500, fallback: 100 },
    );
    return () => {
      stop();
      release();
    };
  });
  const daily = $derived(dailyQuestion(itemData as Item[], fakeNames, today));

  // The days answered, and the record they come to (lib/daily.ts: the run, its grace, today's answer).
  let log = $state.raw(loadLog());
  /**
   * The days as stored, an older build's record (another tab's) kept with
   * them first (lib/daily settleDays), and this tab's own: an answer that
   * couldn't be stored (storage full) still stands here.
   */
  const stored = () => {
    settleDays();
    return mergeLogs(loadLog(), log);
  };
  // (Days still to come wait for theirs, lib/daily replay.)
  const rec = $derived(replay(log, today));
  // Days answered on another of the player's devices (lib/sync) or in another tab, or by an older build
  // in one (its record, kept with the days: settleDays), stand here too.
  onMount(() => {
    const reload = () => {
      log = stored();
      dropFarAhead();
    };
    reload();
    return onStoredElsewhere({ [DAILY_KEY]: reload, [DAYS_KEY]: reload });
  });
  const todays = $derived(answeredOn(rec, today));

  // Practice: questions at random, asked as the daily is (twins may meet), kept apart from it.
  const practiceEngine = dailyEngine(itemData as Item[], fakeNames);
  const practiceGame = dailyGame();
  let practice = $state<Question | null>(null);
  let practicePicked = $state<number | null>(null);

  const q = $derived(practice ?? daily);
  const rightIdx = $derived(q.options.indexOf(q.itemId));
  // (Today's answered right by an older build's run, lib/daily daysOf: the option it picked isn't known, only that it was the right one.)
  const picked = $derived(practice ? practicePicked : todays ? (todays.picked < 0 ? rightIdx : todays.picked) : null);
  const answered = $derived(picked !== null);
  const right = $derived(answered && picked === rightIdx);
  const item = $derived(engine.byId.get(q.itemId));
  /** The item as the question draws it (Grand Spectrum's Emerald…): its art and base. */
  const drawn = $derived(item && answerDrawn(item, q));
  const streak = $derived(streakOn(rec, today));

  /**
   * A moment after an answer the circle's colour goes back to its idle look,
   * so the page rests as it was (an answer already given at load starts so).
   */
  const SETTLE_MS = 5000;
  let settled = $state(true);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(settleTimer));
  const glow = $derived(answered && !settled);

  // The run of days burns as a streak does in the game (lib/fx/streaks):
  // answered just now, the fire starts at yesterday's run and grows into
  // today's before the player's eyes; a miss puts it out.
  /** Yesterday's run, while today's answer lands (null once the fire has caught up, or at load). */
  let growingFrom = $state<number | null>(null);
  let growTimer: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(growTimer));
  /** The answer that ended a run was given just now (not found at load). */
  let justMissed = $state(false);
  const burning = $derived(growingFrom ?? streak);

  let optEls: HTMLButtonElement[] = $state([]);
  let artEl: HTMLElement | null = $state(null);
  let practiceEl: HTMLButtonElement | null = $state(null);

  /** How long an answer waits at most for the server to say the time. */
  const CLOCK_WAIT_MS = 1500;
  /**
   * Once the server has said what day it is, answers more than a day ahead
   * of it go: a clock ran ahead (a day ahead may be a device already past
   * midnight, and waits for its day, lib/daily replay). By the server's time
   * now, not the page's, which a tab in the background moves on seldom; and
   * not while the device's clock has jumped since the server said it (set
   * back, real days would look ahead), until it is asked again.
   */
  function dropFarAhead() {
    if (!clock.sure()) return;
    const day = utcDay(clock.now());
    if (upTo(log, day) === log) return;
    // (From what's stored, not this tab's copy alone: another tab may have answered since.)
    dropAhead(day);
    log = upTo(stored(), day);
  }

  /** An answer to today's held until the server has said what day it is, or said it again after the device's clock was set (or not for long): the option picked, the last one tapped. */
  let held = $state<number | null>(null);
  async function pick(i: number) {
    if (answered || disabled) return;
    if (held !== null) {
      held = i;
      return;
    }
    /** The day whose question was there to pick from. */
    const shown = today;
    // Answered as the page comes up: the day is the server's, once it has
    // said (a device with a wrong clock may be showing another day's). And
    // the device's clock set since the server said (lib/clock refresh): it is
    // asked again first.
    const asking = practice ? undefined : clock.known() ? clock.refresh() : clock.ready(CLOCK_WAIT_MS);
    if (asking) {
      held = i;
      await Promise.race([asking, new Promise((done) => setTimeout(done, CLOCK_WAIT_MS))]);
      i = held ?? i;
      held = null;
      if (!alive || answered || disabled || practice) return;
    }
    // Past midnight UTC since the clock last moved (or the server's day isn't
    // the one shown): that was another day's question. Today's comes up
    // instead, and the tap says so.
    if (!practice && (utcDay(clock.now()) !== shown || today !== shown)) {
      now = clock.now();
      dropFarAhead();
      toasts.show("That question was another day’s. Here is today’s.", 'info', { title: "Today’s unique" });
      return;
    }
    // Another tab may have answered today's meanwhile: that answer stands.
    // And what's stored is the run to go on from, not only what this tab
    // loaded (another tab may have answered a day since).
    if (!practice) {
      log = stored();
      if (todays) return;
    }
    const good = i === rightIdx;
    // Days from a later day, while the server's time doesn't hold (not said
    // yet, or this device's clock set since: it may have been put back),
    // take no answer today: nothing is recorded, so nothing plays as if it
    // were, and the tap says why. Once it does, they wait for their day
    // (lib/daily answerLog).
    const next = practice ? null : answerLog(log, today, i, good, clock.sure());
    if (next && next === log) {
      toasts.show("Your answers reach a day still to come: a clock is off, this device’s or a paired one’s. Today’s unique opens once this device has the right time.", 'info', { title: 'Clock off' });
      return;
    }
    // (The codex's time by the same clock as the day.)
    const at = clock.now();
    settled = false;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settled = true), SETTLE_MS);
    if (!next) practicePicked = i;
    else {
      const before = streakOn(rec, today);
      log = next;
      saveLog(log);
      countEvent(good ? 'daily/right' : 'daily/wrong');
      justMissed = !good && before > 0;
      // Yesterday's fire catches as the badge comes in, and grows into today's a moment later.
      growingFrom = good ? before : null;
      clearTimeout(growTimer);
      growTimer = setTimeout(() => (growingFrom = null), BADGE_IN_MS + 900);
    }
    // Into the codex: today's unique as found (its answer, one a day, isn't
    // counted), with in "Find the art" a wrong pick, which the reveal names;
    // a practice question's answer to the practice tally alone (it finds
    // nothing: there's no end of them to be had without a game). Which it
    // was is settled now, not once the codex has loaded.
    const asked = q;
    const isPractice = !!practice;
    const pickedId = asked.options[i];
    const seen = [asked.itemId, ...(asked.mode === 'art' && !good && pickedId && !isFake(pickedId) ? [pickedId] : [])];
    void import('../lib/codex')
      .then(({ recordSeen, recordPractice }) => (isPractice ? recordPractice(good) : recordSeen(at, asked.mode, seen)))
      .catch((err) => console.warn('codex', err));
    sfx(good ? 'correct' : 'wrong');
    // After the marks have rendered, so the light can find them.
    requestAnimationFrame(() => {
      reveal({ answer: optEls[rightIdx], chosen: good ? null : optEls[i], art: artEl, verdict: null, verdictTone: good ? 'good' : 'bad', good, streak: Math.max(1, practice ? 1 : streak) });
      practiceEl?.focus({ preventScroll: true });
    });
  }

  /** Svelte action: a run just ended goes out in a puff of smoke, as a broken streak in the game. */
  function douse(node: HTMLElement, now: boolean) {
    if (now) requestAnimationFrame(() => doused(node));
  }

  /** The name's size in a tile, and the smallest it may shrink to before it may wrap. */
  const NAME_PX = 17;
  const NAME_MIN_PX = 13;
  /**
   * Svelte action: a long name shrinks until it fits on one line, so every
   * tile keeps its height and nothing on the page moves; only a name too long
   * even at the smallest size wraps (within the tile's room).
   */
  function fit(node: HTMLElement, _label: string | null) {
    const run = () => {
      // Measured without the glow's room (.name), so the letters are held to
      // the tile's own width whether or not a browser counts the end padding
      // in scrollWidth.
      node.style.padding = node.style.margin = '0';
      node.style.whiteSpace = 'nowrap';
      let size = NAME_PX;
      node.style.fontSize = `${size}px`;
      while (node.scrollWidth > node.clientWidth + 0.5 && size > NAME_MIN_PX) {
        size -= 0.5;
        node.style.fontSize = `${size}px`;
      }
      if (node.scrollWidth > node.clientWidth + 0.5) node.style.whiteSpace = 'normal';
      node.style.padding = node.style.margin = '';
    };
    run();
    // Again once the display font is in, and whenever the tile's width changes (a phone turned).
    void document.fonts?.ready.then(run);
    const ro = new ResizeObserver(run);
    if (node.parentElement) ro.observe(node.parentElement);
    return { update: run, destroy: () => ro.disconnect() };
  }

  function practiceMore() {
    practicePicked = null;
    practice = askOne(practiceEngine, practiceGame);
  }

  /** 1 to 4 answer, as in the game; not while typing, in a dialog, or once a game or the codex has the screen. */
  function keys(e: KeyboardEvent) {
    if (typing(e)) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || document.querySelector('[aria-modal="true"]')) return;
    if (session.state || codexRoute.open || settingsRoute.open || answered) return;
    const n = optionIndex(actionOf(e));
    if (n !== null && n < q.options.length) pick(n);
  }

  const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  /** What the item is, in the legend's line: "A shield", "An amulet or belt", "Gloves". */
  const topic = $derived(aTopic(questionTopic(q, true)));
</script>

<svelte:window onkeydown={keys} />

<section class="daily" aria-label="Today’s unique">
  <!-- The circle, and under it (pinned to the stage's foot) the legend: a
       title or line taking two lines grows the legend up over the faded
       circle, never down into the answers. -->
  <div class="stage">
    <div class="plate">
      <!-- The fade at the bottom is a mask, and a mask cuts off whatever lies
           outside its box: it is drawn on a box larger than the circle, so the
           circle's glow (and its wave when answered right) spreads freely. -->
      <div class="veil">
        <div class="inner">
          <div class="circle">
            {#if Circle}<Circle size="100%" state={glow && right ? 'good' : 'idle'} strength={!glow ? 0.5 : right ? 0.85 : 0.26} />{/if}
          </div>
          <!-- "frame", as the game's art stage: the right answer's flare and rays find the
               picture through it (fx/moments reveal) and shine from behind its outline. -->
          <div class="art frame" bind:this={artEl}>
            {#key q.itemId + (practice ? ':p' : '')}
              {#if drawn}<ArtImage src={itemImage(drawn.art)} w={drawn.w} h={drawn.h} alt="The item to name" scale={4} float round />{/if}
            {/key}
          </div>
        </div>
      </div>
    </div>
    <div class="legend">
      {#if answered && item}
        <!-- Answered: the item named, over its base type. -->
        <div in:fade={{ duration: 300 }}>
          <h2 class="title" class:right>{item.name}</h2>
          <p class="line">{drawn?.base}</p>
        </div>
      {:else}
        <h2 class="title">{practice ? 'Practice' : 'Today’s unique'}</h2>
        <!-- The line always describes the item: what kind it is while asking (the
             four answers and the caption say what to do), its base once answered. -->
        <p class="line">{topic}{practice ? '.' : ', the same for every exile today.'}</p>
      {/if}
    </div>
  </div>

  <div class="options" role="group" aria-label="Which one is it?">
    {#each q.labels as label, i (q.askedAt + ':' + i + q.itemId)}
      {@const st = !answered ? '' : i === rightIdx ? 'right' : i === picked ? 'wrong' : 'dim'}
      {@const fake = answered && isFake(q.options[i])}
      <button
        class="option {st}"
        class:held={held === i}
        aria-busy={held === i || undefined}
        bind:this={optEls[i]}
        use:backdropShadow={{ fill: 'linear' }}
        data-sfx="none"
        disabled={answered || disabled}
        title={fake ? 'Not a real item' : undefined}
        onclick={() => pick(i)}
        onpointermove={glare}
        in:fly={{ x: 24, duration: 380, delay: 80 + i * 60 }}
      >
        <span class="sheen"></span>
        <span class="key" class:wide={[...(optionCap(i) ?? '')].length > 1} aria-hidden="true">{optionCap(i) ?? ''}</span>
        <span class="text">
          <span class="name" use:fit={label}>{label}</span>
          <!-- It opens out under the name, so the name glides up rather than jumping. -->
          {#if fake}<small class="made-up" in:slide={{ duration: 350 }}>made up</small>{/if}
        </span>
        <span class="cue" aria-hidden="true"></span>
        {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}><AnswerMark shape="check" /></span>{/if}
        {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}><AnswerMark shape="cross" /></span>{/if}
      </button>
    {/each}
  </div>

  <div class="after" aria-live="polite">
    {#if !answered}
      {#if practice}
        <!-- Practice is apart from the day's question: say so, and when the next one comes. -->
        <p class="caption">Practice doesn’t count<span class="more">{' '}toward your streak</span>; <span aria-live="off">{nextIn(now, 'daily')}</span>.</p>
      {:else if graceOn(rec, today)}
        <!-- Yesterday went unanswered and the run lives on by its grace (lib/daily GRACE_DAYS): say so before the answer that keeps it. -->
        <p class="caption">You skipped a day; answer right to keep your streak.</p>
      {:else}
        <p class="caption">Watch for look-alikes: one name may be made up.</p>
      {/if}
    {:else}
      <p class="tally" in:fade={{ duration: 300, delay: 150 }}>
        {#if practice}
          <!-- Practice keeps out of the streak, so the streak keeps out of practice. -->
          <span aria-live="off">{upper(nextIn(now, 'daily'))}</span>
        {:else}
          {#if streak >= 1}
            <!-- The game's streak badge, counted in days, burning with the game's fire. -->
            <DailyStreak days={streak} {burning} />
          {:else if todays && todays.ended >= 1}
            <span use:douse={justMissed}>Streak ended at <span class="num">{todays.ended}</span> {todays.ended === 1 ? 'day' : 'days'}</span>
          {:else}
            <span>Missed today</span>
          {/if}
          <span class="sep" aria-hidden="true">·</span>
          <span aria-live="off">{nextIn(now)}</span>
        {/if}
      </p>
      <!-- After the result, as in the game: what happened first, then the way on. -->
      <span class="ways" in:fade={{ duration: 250 }}>
        <button class="btn small" bind:this={practiceEl} onclick={practiceMore} {disabled}>Practice more</button>
        {#if onDelve}<button class="btn small" class:primary={lead} onclick={onDelve} {disabled}>Delve deeper</button>{/if}
      </span>
    {/if}
  </div>
</section>

<style>
  .daily {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  /* ---- the circle, its art, and the legend under it ---- */
  /* Every size's numbers are custom properties: their fallbacks here are the
     wide column's (1440 x 980 and taller, and 641 to 1080 wide); the start
     page sets shorter windows' (Home.svelte), the phone query below phones'. The stage,
     the gap and the rows under it always add up to the block's height, so
     the page round it never moves. */
  .stage {
    position: relative;
    height: var(--daily-stage-h, 459px);
  }
  /* The circle's square, centred on the column (a little wider than it on
     wide screens, which is meant), its foot running on behind the legend. */
  .plate {
    position: absolute;
    left: 50%;
    top: calc(var(--daily-circle-y, 274px) - var(--daily-circle, 560px) / 2);
    width: var(--daily-circle, 560px);
    aspect-ratio: 1;
    translate: -50% 0;
    pointer-events: none;
  }
  /* The circle fades out at the bottom, into the answers, on a box reaching
     15% past it on every side. */
  .veil {
    position: absolute;
    inset: -15%;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(180deg, #000 var(--daily-fade-from, 48.4%), transparent var(--daily-fade-to, 79.9%));
    mask-image: linear-gradient(180deg, #000 var(--daily-fade-from, 48.4%), transparent var(--daily-fade-to, 79.9%));
  }
  /* The circle's own box again (15 / 130 of the veil on each side). */
  .inner {
    position: absolute;
    inset: 11.5385%;
  }
  .circle {
    position: absolute;
    inset: 0;
  }
  /* An art box that suits tall staves (high enough in the circle that a bow
     clears the legend); a wide item (a belt) reaches past its sides into the
     circle round its centre, 68% of the circle across (--round, in the box's
     widths: ArtImage's round fit), clear of the runes. */
  .art {
    position: absolute;
    inset: var(--daily-art-inset, 12.5% 26% 22.5%);
    --round: 1.4167;
    display: grid;
    place-items: center;
  }
  .art > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }
  /* What to do, or what it was: over the faded circle, pinned to the stage's foot. */
  .legend {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    text-align: center;
  }
  /* Cinzel sets the lower case as small capitals, so the title is written in
     normal case. (Over the global h2's display face.) Shadowed, so the runes
     behind don't break the letters up. */
  .title {
    margin: 0;
    font-family: var(--font-cinzel);
    font-weight: 500;
    font-size: var(--daily-title-size, 21px);
    line-height: var(--daily-title-lh, 30px);
    letter-spacing: 0.07em;
    color: #d9c08a;
    text-wrap: balance;
    text-shadow:
      0 0 10px rgba(0, 0, 0, 0.9),
      0 0 3px rgba(0, 0, 0, 0.9);
  }
  .title.right {
    color: #e3e6b8;
  }
  /* Tight under the title (its line box tucks up into the title's): the pair says what the item is. */
  .line {
    margin: var(--daily-title-gap, -7px) 0 0;
    font-style: italic;
    font-size: var(--daily-line-size, 16px);
    line-height: var(--daily-line-lh, 22px);
    color: #ab9d88;
    text-wrap: balance;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.95);
  }

  /* ---- the answers, as in the game (QuestionView) ---- */
  .options {
    position: relative;
    margin-top: var(--daily-legend-gap, 13px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-auto-rows: 1fr;
    gap: 10px;
  }
  .option {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    /* Always this tall, whatever the name (see fit): the page must not move under the answers. */
    height: 56px;
    padding: 0.35rem 2.4rem 0.35rem 0.9rem;
    text-align: left;
    cursor: pointer;
    /* Drawn by the WebGL backdrop when it can (see lib/backdropShadow.ts): a
       long, dark gradient like this one bands in CSS. */
    --bs-fill-a: rgba(40, 31, 22, 0.95);
    --bs-fill-b: rgba(20, 16, 12, 0.95);
    --bs-fill-angle: 90deg;
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-angle), var(--bs-fill-a), var(--bs-fill-b)));
    border: 1px solid var(--line);
    border-radius: 4px;
    --bs1: 8px 22px;
    --bs1-color: rgba(0, 0, 0, 0.45);
    box-shadow:
      inset 0 1px 0 var(--top-light, rgba(255, 220, 150, 0.05)),
      inset 0 0 0 1px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent));
    transition:
      transform 0.25s var(--ease-out),
      border-color 0.3s,
      opacity 0.4s,
      --bs-ring 0.3s,
      --bs1 0.3s,
      --bs1-color 0.3s,
      --bs-fill-a 0.3s,
      --bs-fill-b 0.3s;
  }
  .sheen {
    position: absolute;
    z-index: -1;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  .sheen::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -40%;
    width: 30%;
    transform: skewX(-18deg);
    opacity: 0;
    background: linear-gradient(100deg, transparent, rgba(255, 236, 196, 0.07) 40%, rgba(255, 246, 225, 0.16) 50%, rgba(255, 236, 196, 0.07) 60%, transparent);
  }
  .sheen::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.35s;
    background:
      radial-gradient(circle 160px at var(--gx, 30%) var(--gy, 50%), rgba(255, 214, 150, 0.12), transparent 70%),
      radial-gradient(ellipse 50% 80% at 50% 135%, rgba(255, 140, 50, 0.28), transparent 70%);
  }
  .option::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 6%;
    right: 6%;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, #fff1cf, transparent);
    filter: drop-shadow(0 0 3px rgba(255, 180, 90, 0.9));
    opacity: 0;
    scale: 0.4 1;
    transition:
      opacity 0.3s,
      scale 0.5s var(--ease-out);
  }
  /* Hover and focus as separate selectors: the PostCSS step (vite.config.ts)
     moves any selector with :hover into @media (hover: hover), so one
     :is(:hover, :focus-visible) would take the keyboard's focus light with it. */
  .option:not(:disabled):hover,
  .option:not(:disabled):focus-visible {
    border-color: var(--gold);
    --bs-ring: rgba(241, 217, 155, 0.1);
    --top-light: transparent;
    --bs-fill-a: rgba(70, 48, 25, 0.96);
    --bs-fill-b: rgba(29, 22, 14, 0.95);
    --bs1: 0px 26px;
    --bs1-color: rgba(224, 138, 68, 0.2);
  }
  /* Picked while the day is being made sure of (a moment, at most 1.5 s): it
     stays lit as hovered, so the tap shows it was taken. */
  .option.held {
    border-color: var(--gold);
    --bs-ring: rgba(241, 217, 155, 0.1);
    --top-light: transparent;
    --bs-fill-a: rgba(70, 48, 25, 0.96);
    --bs-fill-b: rgba(29, 22, 14, 0.95);
    --bs1: 0px 26px;
    --bs1-color: rgba(224, 138, 68, 0.2);
  }
  .option:not(:disabled):hover .sheen::before {
    animation: sweep 0.8s var(--ease-out);
  }
  .option:not(:disabled):hover::after,
  .option:not(:disabled):focus-visible::after {
    opacity: 1;
    scale: 1 1;
  }
  .option:not(:disabled):hover .sheen::after,
  .option:not(:disabled):focus-visible .sheen::after {
    opacity: 1;
  }
  .option:not(:disabled):hover .key,
  .option:not(:disabled):focus-visible .key {
    color: #fff4d8;
    border-color: var(--gold-hi);
    box-shadow: 0 0 12px rgba(241, 217, 155, 0.4);
  }
  .option:not(:disabled):hover .key::before,
  .option:not(:disabled):focus-visible .key::before {
    opacity: 1;
  }
  .option:not(:disabled):hover .text,
  .option:not(:disabled):focus-visible .text {
    color: #fff1dc;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.35);
  }
  .option:not(:disabled):hover .cue,
  .option:not(:disabled):focus-visible .cue {
    opacity: 1;
    translate: 0 -50%;
  }
  .option:not(:disabled):active {
    transform: scale(0.985);
  }
  .option:disabled {
    cursor: default;
    color: inherit;
  }
  @keyframes sweep {
    from {
      translate: 0 0;
      opacity: 1;
    }
    to {
      translate: 560% 0;
      opacity: 1;
    }
  }
  .key {
    position: relative;
    isolation: isolate;
    flex: none;
    width: 28px;
    height: 28px;
    padding-top: 2px;
    display: grid;
    place-items: center;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    color: var(--gold);
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    transition:
      color 0.25s,
      border-color 0.25s,
      box-shadow 0.25s;
  }
  /* A key whose name is a word (Num 1): the seal drawn out to hold it. */
  .key.wide {
    width: auto;
    min-width: 28px;
    padding-inline: 0.55em;
    border-radius: 14px;
    font-size: 11px;
    white-space: nowrap;
  }
  .key.wide::before {
    border-radius: 14px;
  }
  .key::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.3s;
    background: radial-gradient(circle at 50% 30%, rgba(196, 128, 50, 0.6), rgba(60, 36, 12, 0.5) 75%);
  }
  .cue {
    position: absolute;
    top: 50%;
    right: 1rem;
    width: 6px;
    height: 6px;
    translate: 6px -50%;
    rotate: 45deg;
    pointer-events: none;
    background: linear-gradient(135deg, #fff1cf, var(--gold) 55%, var(--gold-lo));
    box-shadow: 0 0 8px rgba(255, 180, 90, 0.7);
    opacity: 0;
    transition:
      opacity 0.3s,
      translate 0.4s var(--ease-out);
  }
  .text {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    line-height: 1.15;
    color: #e9c8a2;
    letter-spacing: 0.02em;
    transition:
      color 0.25s,
      text-shadow 0.25s;
  }
  /* Clipped, in case one word outgrows the tile, but on a box reaching past
     the name by the hover glow's spread (cancelled by the margin, so nothing
     moves), so the glow isn't cut off at the letters. */
  .name {
    display: block;
    overflow: hidden;
    padding: 16px;
    margin: -16px;
  }
  /* The made-up name, said so once it's over: a quiet line under the name,
     starting where it starts, so the name keeps its width and nothing wraps
     or moves (the tile has the room). */
  .made-up {
    display: block;
    margin-top: 1px;
    font-family: var(--font-body);
    font-weight: 400;
    font-style: italic;
    font-size: 13px;
    line-height: 1.1;
    letter-spacing: 0;
    color: var(--unique-hi);
  }
  .mark {
    position: absolute;
    top: 50%;
    right: 0.85rem;
    translate: 0 -50%;
    line-height: 1;
    font-size: 20px;
  }
  .option.right {
    border-color: #5d8a50;
    --bs-fill-a: rgba(44, 64, 36, 0.9);
    --bs-fill-b: rgba(22, 28, 17, 0.92);
    --top-light: rgba(220, 240, 190, 0.1);
    --bs1: 0px 16px;
    --bs1-color: rgba(150, 190, 110, 0.12);
  }
  .option.right .text,
  .option.right .mark {
    color: #d6e8c0;
  }
  .option.right .key {
    border-color: #7ea56c;
    color: #a9cf8f;
  }
  .option.wrong {
    border-color: #8e4434;
    --bs-fill-a: rgba(78, 32, 22, 0.9);
    --bs-fill-b: rgba(34, 15, 11, 0.92);
    --top-light: transparent;
    --bs1: 0px 14px;
    --bs1-color: rgba(200, 90, 60, 0.1);
    animation: shake 0.5s;
  }
  .option.wrong .text,
  .option.wrong .mark {
    color: #eab3a3;
  }
  .option.dim {
    opacity: 0.55;
    filter: saturate(0.5);
  }
  /* The filter doesn't reach what the backdrop draws: the fill, desaturated as it would. */
  .option.dim:global([data-bs-fill]) {
    --bs-fill-a: rgba(36, 32, 27, 0.95);
    --bs-fill-b: rgba(18, 16, 14, 0.95);
  }
  @keyframes shake {
    20%,
    60% {
      translate: -5px 0;
    }
    40%,
    80% {
      translate: 5px 0;
    }
  }

  /* ---- under the answers ---- */
  .after {
    /* Tighter on the start page's short-window rhythm. */
    min-height: var(--daily-after-h, 44px);
    margin-top: var(--daily-after-gap, 6px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    flex-wrap: wrap;
  }
  .caption {
    width: 100%;
    margin: 0;
    text-align: center;
    text-wrap: balance;
    font-style: italic;
    font-size: 17px;
    color: #a99c86;
  }
  /* The ways on, kept together on one line. */
  .ways {
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }
  .tally {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0;
    font-style: italic;
    font-size: 15px;
    color: #a99c86;
  }
  .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 0.9em;
  }

  @media (max-width: 640px) {
    .daily {
      --daily-stage-h: 292px;
      --daily-circle: 336px;
      --daily-circle-y: 170px;
      --daily-art-inset: 14% 26% 21%;
      --daily-fade-from: 52.3%;
      --daily-fade-to: 82.1%;
      --daily-title-size: 19px;
      --daily-title-lh: 27px;
      --daily-title-gap: -7px;
      --daily-line-size: 15px;
      --daily-line-lh: 21px;
      --daily-legend-gap: 14px;
    }
    .options {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
    .option {
      height: 58px;
    }
    /* Room for the answered state's two lines (result, then Practice more) from the start, so nothing below moves when it comes. */
    .after {
      justify-content: center;
      align-content: center;
      min-height: 62px;
    }
    .caption {
      font-size: 15px;
    }
    .caption .more {
      display: none;
    }
    .tally {
      margin: 0;
    }
  }
</style>
