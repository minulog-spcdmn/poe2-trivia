<script lang="ts">
  // Today's unique: one item a day, the same for every exile (lib/daily.ts),
  // in the rune circle with the game's own answer buttons under it. Once it
  // is answered, "Practice more" asks further questions in the same spot;
  // they never touch the streak. Every answer goes into the codex like any
  // other question.
  import { onMount } from 'svelte';
  import { fade, fly, scale, slide } from 'svelte/transition';
  import itemData from '../data/items.json';
  import fakeNames from '../data/fakes.json';
  import { engine, session } from '../lib/session.svelte';
  import { glare } from '../lib/glare';
  import { codexRoute } from '../lib/codexRoute.svelte';
  import { isFake, questionTopic, type Item, type Question } from '../lib/game';
  import { answerDaily, answeredOn, askOne, dailyGame, dailyQuestion, dayNumber, loadDaily, nextIn, saveDaily, streakOn, utcDay } from '../lib/daily';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import { doused, reveal } from '../lib/fx/moments';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import ArtImage from './ArtImage.svelte';
  import DailyStreak, { BADGE_IN_MS } from './DailyStreak.svelte';

  let { disabled = false }: { disabled?: boolean } = $props();

  // The clock moves on (the hours left, and past midnight UTC a new day):
  // every minute, and at once when the tab is looked at again (a tab in the
  // background ticks seldom).
  let now = $state(Date.now());
  onMount(() => {
    const tick = () => (now = Date.now());
    const t = setInterval(tick, 60_000);
    const seen = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', seen);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', seen);
    };
  });
  const today = $derived(utcDay(now));
  const daily = $derived(dailyQuestion(itemData as Item[], fakeNames, today));

  let rec = $state(loadDaily());
  const todays = $derived(answeredOn(rec, today));

  // Practice: questions from the game's own engine, at random, kept apart from the daily.
  const practiceGame = dailyGame();
  let practice = $state<Question | null>(null);
  let practicePicked = $state<number | null>(null);

  const q = $derived(practice ?? daily);
  const picked = $derived(practice ? practicePicked : (todays?.picked ?? null));
  const answered = $derived(picked !== null);
  const rightIdx = $derived(q.options.indexOf(q.itemId));
  const right = $derived(answered && picked === rightIdx);
  const item = $derived(engine.byId.get(q.itemId));
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

  function pick(i: number) {
    if (answered || disabled) return;
    // Past midnight UTC since the clock last moved: that was yesterday's question. Today's comes up instead.
    if (!practice && utcDay(Date.now()) !== today) {
      now = Date.now();
      return;
    }
    // Another tab may have answered today's meanwhile: that answer stands.
    if (!practice) {
      const stored = loadDaily();
      if (answeredOn(stored, today)) {
        rec = stored;
        return;
      }
    }
    const good = i === rightIdx;
    const at = Date.now();
    settled = false;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settled = true), SETTLE_MS);
    if (practice) practicePicked = i;
    else {
      const before = streakOn(rec, today);
      rec = answerDaily(rec, today, i, good);
      saveDaily(rec);
      justMissed = !good && before > 0;
      // Yesterday's fire catches as the badge comes in, and grows into today's a moment later.
      growingFrom = good ? before : null;
      clearTimeout(growTimer);
      growTimer = setTimeout(() => (growingFrom = null), BADGE_IN_MS + 900);
    }
    // Into the codex, as any question answered in a game.
    const asked = q;
    void import('../lib/codex')
      .then(({ recordEncounter }) =>
        recordEncounter({
          at,
          itemId: asked.itemId,
          mode: asked.mode,
          difficulty: 'custom',
          race: false,
          answer: { ok: good, pickedId: asked.options[i], pickedLabel: asked.labels[i] },
        }),
      )
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
      node.style.whiteSpace = 'nowrap';
      let size = NAME_PX;
      node.style.fontSize = `${size}px`;
      while (node.scrollWidth > node.clientWidth + 0.5 && size > NAME_MIN_PX) {
        size -= 0.5;
        node.style.fontSize = `${size}px`;
      }
      if (node.scrollWidth > node.clientWidth + 0.5) node.style.whiteSpace = 'normal';
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
    practice = askOne(engine, practiceGame);
  }

  /** 1 to 4 answer, as in the game; not while typing, in a dialog, or once a game or the codex has the screen. */
  function keys(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || document.querySelector('[aria-modal="true"]')) return;
    if (session.state || codexRoute.open || answered) return;
    const n = Number(e.key);
    if (n >= 1 && n <= q.options.length) pick(n - 1);
  }

  const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<svelte:window onkeydown={keys} />

<section class="daily" aria-label="Today's unique">
  <div class="stage">
    <!-- The fade at the bottom is a mask, and a mask cuts off whatever lies
         outside its box: it is drawn on a box larger than the circle, so the
         circle's glow (and its wave when answered right) spreads freely. -->
    <div class="veil">
      <div class="inner">
        <div class="circle">
          <ArcaneCircle size="100%" state={glow && right ? 'good' : 'idle'} strength={!glow ? 0.5 : right ? 0.85 : 0.26} />
        </div>
        <!-- "frame", as the game's art stage: the right answer's flare and rays find the
             picture through it (fx/moments reveal) and shine from behind its outline. -->
        <div class="art frame" bind:this={artEl}>
          {#key q.itemId + (practice ? ':p' : '')}
            {@const art = engine.byId.get(q.itemId)!}
            <ArtImage src={itemImage(q.itemId)} w={art.w} h={art.h} alt="The item to name" scale={4} float round />
          {/key}
        </div>
      </div>
    </div>
    <p class="chip">
      <span class="topic">{questionTopic(q)}</span>
      <span class="gem" aria-hidden="true"></span>
      {#if answered && item}
        <b class="what" in:fade={{ duration: 300 }}>{item.name}</b>
      {:else}
        <b class="what">{practice ? 'Practice' : 'Today’s unique'}</b>
      {/if}
      <!-- Which day's question (not the item's number): only until it is answered. -->
      {#if !practice && !answered}<span class="no"><span class="no-label">Day</span> {dayNumber(now)}</span>{/if}
    </p>
  </div>

  <div class="options" role="group" aria-label="Which one is it?">
    {#each q.labels as label, i (q.askedAt + ':' + i + q.itemId)}
      {@const st = !answered ? '' : i === rightIdx ? 'right' : i === picked ? 'wrong' : 'dim'}
      {@const fake = answered && isFake(q.options[i])}
      <button
        class="option {st}"
        bind:this={optEls[i]}
        data-sfx="none"
        disabled={answered || disabled}
        title={fake ? 'Not a real item' : undefined}
        onclick={() => pick(i)}
        onpointermove={glare}
        in:fly={{ x: 24, duration: 380, delay: 80 + i * 60 }}
      >
        <span class="sheen"></span>
        <span class="key" aria-hidden="true">{i + 1}</span>
        <span class="text">
          <span class="name" use:fit={label}>{label}</span>
          <!-- It opens out under the name, so the name glides up rather than jumping. -->
          {#if fake}<small class="made-up" in:slide={{ duration: 350 }}>made up</small>{/if}
        </span>
        <span class="cue" aria-hidden="true"></span>
        {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
        {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
      </button>
    {/each}
  </div>

  <div class="after" aria-live="polite">
    {#if !answered}
      {#if practice}
        <!-- Practice is apart from the day's question: say so, and when the next one comes. -->
        <p class="caption">Practice doesn’t count<span class="more">{' '}toward your streak</span>; {nextIn(now, 'daily')}.</p>
      {:else}
        <p class="caption">The same item for every exile today.<span class="more">{' '}Watch for look-alikes.</span></p>
      {/if}
    {:else}
      <p class="tally" in:fade={{ duration: 300, delay: 150 }}>
        {#if practice}
          <!-- Practice keeps out of the streak, so the streak keeps out of practice. -->
          <span>{upper(nextIn(now, 'daily'))}</span>
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
          <span>{nextIn(now)}</span>
        {/if}
      </p>
      <!-- After the result, as in the game: what happened first, then the way on. -->
      <button class="btn small" bind:this={practiceEl} onclick={practiceMore} {disabled} in:fade={{ duration: 250 }}>Practice more</button>
    {/if}
  </div>
</section>

<style>
  .daily {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  /* ---- the circle, its art and the chip on top ---- */
  .stage {
    position: relative;
    /* 520 px on a 510 px column: the circle's band reaches a little past it
       (the start page makes it smaller on short windows). */
    width: var(--daily-circle, calc(100% + 10px));
    margin-inline: calc((100% - var(--daily-circle, calc(100% + 10px))) / 2);
    aspect-ratio: 1;
  }
  /* The circle fades out at the bottom, into the answers: from 72% to 96%
     of its height, on a box reaching 15% past it on every side. */
  .veil {
    position: absolute;
    inset: -15%;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(180deg, #000 66.9%, transparent 85.4%);
    mask-image: linear-gradient(180deg, #000 66.9%, transparent 85.4%);
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
  /* An art box that suits tall staves; a wide item (a belt) reaches past
     its sides into the circle round its centre, 68% of the circle across
     (--round, in the box's widths: ArtImage's round fit), clear of the runes. */
  .art {
    position: absolute;
    inset: 14% 26% 21%;
    --round: 1.4167;
    display: grid;
    place-items: center;
  }
  .art > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }
  .chip {
    position: absolute;
    top: 4%;
    left: 50%;
    translate: -50% 0;
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    margin: 0;
    padding: 0.42rem 1rem 0.5rem;
    white-space: nowrap;
    background: rgba(10, 8, 6, 0.82);
    border: 1px solid rgba(125, 99, 51, 0.6);
    border-radius: 2px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  }
  .topic {
    font-style: italic;
    font-size: 15px;
    color: #8f8270;
  }
  .gem {
    align-self: center;
    width: 7px;
    height: 7px;
    rotate: 45deg;
    background: var(--unique-hi);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.8);
  }
  .what {
    font-family: var(--font-display);
    font-size: 20px;
    color: #fff1cf;
    text-shadow: 0 0 12px rgba(241, 217, 155, 0.35);
  }
  .no {
    font-family: var(--font-cinzel);
    font-size: 13px;
    letter-spacing: 0.06em;
    color: var(--gold);
  }
  .no-label {
    font-size: 15px;
  }

  /* ---- the answers, as in the game (QuestionView) ---- */
  .options {
    position: relative;
    /* Up over the faded bottom of the circle. */
    margin-top: calc(-1 * var(--daily-overlap, 48px));
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
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.05),
      0 8px 22px rgba(0, 0, 0, 0.45);
    transition:
      transform 0.25s var(--ease-out),
      border-color 0.3s,
      opacity 0.4s,
      background 0.3s,
      box-shadow 0.3s;
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
    background: linear-gradient(90deg, rgba(70, 48, 25, 0.96), rgba(29, 22, 14, 0.95));
    box-shadow:
      inset 0 0 0 1px rgba(241, 217, 155, 0.1),
      0 0 26px rgba(224, 138, 68, 0.2);
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
  .name {
    display: block;
    overflow: hidden;
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
    font-weight: 700;
  }
  .option.right {
    border-color: #5d8a50;
    background: linear-gradient(90deg, rgba(44, 64, 36, 0.9), rgba(22, 28, 17, 0.92));
    box-shadow:
      inset 0 1px 0 rgba(220, 240, 190, 0.1),
      0 0 16px rgba(150, 190, 110, 0.12);
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
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
    box-shadow: 0 0 14px rgba(200, 90, 60, 0.1);
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
    margin: 0;
    font-style: italic;
    font-size: 17px;
    color: #a99c86;
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
    .stage {
      width: min(330px, 100%);
      margin: 0 auto;
    }
    .chip {
      top: 0;
    }
    .options {
      margin-top: -24px;
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
      width: 100%;
      text-align: center;
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
