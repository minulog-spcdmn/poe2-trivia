<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { session, engine } from '../lib/session.svelte';
  import { AUTO_NEXT_MS, autoNextLeft, isFake, questionTopic } from '../lib/game';
  import { shown } from '../lib/media.svelte';
  import { FINALE_MS, materialize, type BurnParams } from '../lib/materialize';
  import { frontier } from '../lib/frontier';
  import { visibleBox } from '../lib/patches';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import Avatar from './Avatar.svelte';
  import ArtImage from './ArtImage.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import NamePlate from './NamePlate.svelte';
  import { untrack, type Snippet } from 'svelte';
  import { FILL_START, answerCharging, artRevealed, raceMiss, reveal as revealFx, veilComplete, veilHandoff, type VerdictTone } from '../lib/fx/moments';
  import { FILL_LEAD } from '../lib/soundDesign';
  import { streakOf } from '../lib/fx/streaks';
  import { scoreRowOf } from '../lib/scoreRows';
  import { fxActive, type Handle } from '../lib/fx/core';
  import { dock, narrow, phone } from '../lib/layout';
  import { portal } from '../lib/portal';
  import { fellAt, isGroupRun, livesOf } from '../lib/delve';

  /** The question's timer (Game.svelte has it in the scoreboard on phones instead). */
  let { timer }: { timer?: Snippet } = $props();

  const s = $derived(session.state!);
  const q = $derived(s.question!);
  const reveal = $derived(s.phase === 'reveal' ? s.reveal : null);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  const me = $derived(session.myPlayerId);
  // Guests only learn the answer (and the items behind the options) at the reveal.
  const item = $derived(q.itemId ? engine.byId.get(q.itemId) : undefined);
  const race = $derived(s.settings.mode === 'race');
  // Everyone sees the Next button; only the host (and in turns mode, whoever answered) can press it.
  const canNext = $derived(!!reveal && (race ? session.isHost : mine || session.isHost));
  const myMiss = $derived(race && me ? q.misses.find((m) => m.playerId === me) : undefined);
  const winner = $derived(reveal?.winnerId ? s.players.find((p) => p.id === reveal.winnerId) : undefined);
  const iWon = $derived(race ? !!me && reveal?.winnerId === me : !!reveal?.correct);
  /** Delve: the player answering just lost their last life. */
  const fallsNow = $derived(!!s.delve && !!reveal && !reveal.correct && fellAt(s, active.id) === s.round);
  // Narrow screens have no room beside the timer: the verdict goes on the
  // task line, beside or under the category (lib/layout.ts).
  /**
   * The verdict badge at the reveal: its word, icon and colour (violet
   * for running out of time, gold for a race someone else solved while you watch).
   */
  const verdict = $derived.by((): { word: string; icon: 'check' | 'cross' | 'clock'; tone: VerdictTone } | null => {
    if (!reveal) return null;
    if (iWon) return { word: 'Correct', icon: 'check', tone: 'good' };
    if (race && winner) return session.spectating ? { word: 'Solved', icon: 'check', tone: 'neutral' } : { word: 'Too slow', icon: 'clock', tone: 'late' };
    if (fallsNow) return { word: 'Fallen', icon: 'cross', tone: 'bad' };
    if (reveal.timedOut) return { word: "Time's up", icon: 'clock', tone: 'late' };
    return { word: race ? 'No one' : 'Wrong', icon: 'cross', tone: 'bad' };
  });
  // Online, the reveal moves on by itself. The bar follows the host's clock
  // every frame, so all screens count down together however late the reveal
  // arrived or got drawn (and a rejoin doesn't restart it).
  // A reveal from an older host has no stamp: count from when it first showed.
  let unstampedAt = 0;
  const revealAt = $derived(reveal ? (reveal.at ?? (unstampedAt ||= untrack(() => session.hostNow()))) : 0);
  let autoLeft = $state(1);
  $effect(() => {
    const at = revealAt;
    if (!at || session.mode === 'local') return;
    let frame = 0;
    const tick = () => {
      autoLeft = autoNextLeft(at, session.hostNow()) / AUTO_NEXT_MS;
      if (autoLeft > 0) frame = requestAnimationFrame(tick);
    };
    untrack(tick);
    return () => cancelAnimationFrame(frame);
  });
  const count = $derived(q.labels.length);
  // Delve: from eight answers on, phones lay them out tighter (see .snug), so
  // a short clock isn't spent scrolling down to them.
  const snug = $derived(!!s.delve && count > 6);
  // Pictures the host has sent for this question.
  const media = $derived(shown.qid === q.askedAt ? shown : null);
  /** "Find the art" pictures in so far: whole, or (veiled, in Delve) ready to burn in. */
  const tilesIn = $derived(Array.from({ length: count }, (_, i) => i).filter((i) => media?.options[i] || media?.tileVeils[i]).length);
  /** A veiled picture's patches so far. */
  const tilePatches = (i: number) => Object.values(media?.tilePatches[i] ?? {});
  /**
   * Delve: nothing to see or answer until the clock runs and every picture is
   * in, so the timer only counts time the player could actually use.
   */
  const waiting = $derived(
    !!s.delve && !reveal && (q.deadline === null || (q.mode === 'art' ? tilesIn < count : !(media?.art || media?.veil))),
  );

  /** Veiled art: the patches that have appeared so far. */
  const patches = $derived(Object.values(media?.patches ?? {}));
  // Size of the art shown during the question: keeps the reveal from jumping.
  const hint = $derived(media?.veil ?? media?.art ?? null);

  // Veiled art: when the newest patch will have finished coming in (ms, page
  // clock). At the reveal the rest of the picture comes in quickly first, and
  // only then hands over to the full art (veilDone).
  let patchesSeen = 0;
  let veilSettles = 0;
  let veilDone = $state(false);
  $effect(() => {
    const n = patches.length;
    const v = media?.veil;
    untrack(() => {
      if (n === patchesSeen) return;
      patchesSeen = n;
      if (n && v) veilSettles = performance.now() + (reveal ? FINALE_MS : v.burn);
    });
  });
  $effect(() => {
    if (!reveal) {
      veilDone = false;
      return;
    }
    const v = media?.veil;
    if (!v) return;
    // Waits for the rest to come in; should some never arrive, it gives up
    // a while after the last one did.
    const whole = patches.length >= v.count;
    const wait = whole ? Math.max(0, untrack(() => veilSettles) + 50 - performance.now()) : 2500;
    const timer = setTimeout(() => (veilDone = true), wait);
    return () => clearTimeout(timer);
  });
  // The full art loads as the reveal starts, so the veiled picture only hands
  // over once it can show (or after a while, should it not load). Its size
  // and where the item is in it let the veiled copy line up with it first.
  let fullLoaded = $state(false);
  let full = $state<{ w: number; h: number; box: [number, number, number, number] } | null>(null);
  $effect(() => {
    if (!reveal || !item) {
      fullLoaded = false;
      full = null;
      return;
    }
    let live = true;
    const done = () => live && (fullLoaded = true);
    const img = new Image();
    img.src = itemImage(item.id);
    img.decode().then(() => {
      if (!live) return;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      full = { w: c.width, h: c.height, box: visibleBox(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height) };
      done();
    }, done);
    const timer = setTimeout(done, 3000);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  });


  /**
   * At the reveal the veiled copy moves and scales so its item sits exactly
   * where the full art's will (the copy was re-scaled and padded a little by
   * the host): both boxes follow .art-fit's sizing, so it's worked out from
   * the slot's size, each picture's size and where its visible pixels are.
   */
  const veilFit = $derived.by(() => {
    const v = media?.veil;
    const slot = artEl?.querySelector('.frame');
    if (!reveal || !v || !full || !slot) return null;
    const cw = slot.clientWidth;
    const ch = slot.clientHeight;
    const place = (w: number, h: number, [bx, by, bw, bh]: number[]) => {
      const fw = Math.min(cw, (ch * w) / h, w * 1.8);
      const fh = Math.min(ch, (cw * h) / w, h * 1.8);
      const k = fw / w;
      return { x: (cw - fw) / 2 + bx * k, y: (ch - fh) / 2 + by * k, w: bw * k, h: bh * k };
    };
    const from = place(v.w, v.h, v.box);
    // A mirrored item starts the reveal mirrored, as it was shown.
    const fb = full.box;
    const to = place(full.w, full.h, mirrored(0) ? [full.w - fb[0] - fb[2], fb[1], fb[2], fb[3]] : fb);
    const k = (to.w / from.w + to.h / from.h) / 2;
    if (!isFinite(k) || k <= 0) return null;
    return `translate(${to.x - k * from.x}px, ${to.y - k * from.y}px) scale(${k})`;
  });
  // The handover waits for the copy to have moved into place.
  let fitted = $state(false);
  $effect(() => {
    if (!veilFit) {
      fitted = false;
      return;
    }
    const timer = setTimeout(() => (fitted = true), 480);
    return () => clearTimeout(timer);
  });
  /** The full art replaces what was shown during the question. */
  const showFull = $derived(!!reveal && !!item && (!media?.veil || (veilDone && fullLoaded && (fitted || !full))));

  // A veiled picture that comes in whole before the reveal shimmers once.
  let wholeFor = 0;
  $effect(() => {
    const v = media?.veil;
    if (!v || reveal || patches.length < v.count || wholeFor === q.askedAt) return;
    const qid = q.askedAt;
    const timer = setTimeout(
      () => {
        wholeFor = qid;
        const el = artEl?.querySelector('.veil');
        if (!el) return;
        el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.4) saturate(1.1)' }, { filter: 'brightness(1)' }], {
          duration: 800,
          easing: 'ease-in-out',
        });
        veilComplete(el);
      },
      Math.max(0, untrack(() => veilSettles) - performance.now()),
    );
    return () => clearTimeout(timer);
  });

  /**
   * Svelte transition: the veiled art (already lined up with it, see
   * veilFit) hands over to the full picture: it flares golden and fades as
   * the full art fades in.
   */
  function handoff(node: Element) {
    const veil = node.querySelector('.veil');
    if (veil) veilHandoff(veil);
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      duration: quick ? 250 : 400,
      css: (t: number, u: number) =>
        quick
          ? `opacity: ${t}`
          : `opacity: ${t}; filter: brightness(${1 + 1.2 * Math.sin(Math.PI * Math.min(1, u * 1.4))}) sepia(${0.45 * u})`,
    };
  }

  /** Race mode: who guessed which option wrong (and, once revealed, who won). */
  function markers(index: number) {
    if (!race) return [];
    const ids = q.misses.filter((m) => m.index === index).map((m) => m.playerId);
    if (reveal?.winnerId && index === reveal.correctIndex) ids.unshift(reveal.winnerId);
    return ids.map((pid) => s.players.find((p) => p.id === pid)).filter((p) => !!p);
  }

  /**
   * Which pictures get their name at the reveal: the answer, the wrong pick of
   * the player whose turn it was, and (in a race) your own wrong guess.
   * Untouched decoys stay anonymous so they don't spoil later questions.
   */
  function named(index: number) {
    if (!reveal) return false;
    if (index === reveal.correctIndex) return true;
    if (race) return myMiss?.index === index;
    return index === reveal.chosenIndex;
  }

  /** Revealed: was this picture (option index, or 0 for a name question's art) shown mirrored? */
  function mirrored(index: number) {
    return !!reveal && !!q.mirrored?.[index];
  }

  /** Race reveal: who lost a point, the first few by name so the line stays short. */
  const losers = $derived(q.misses.map((m) => s.players.find((p) => p.id === m.playerId)?.name ?? '?'));
  const losersShort = $derived(losers.length > 3 ? `${losers.slice(0, 2).join(', ')} and ${losers.length - 2} more` : losers.join(', '));

  /**
   * Revealed: a made-up name someone picked. Fakes nobody picked stay
   * unmarked, like untouched decoys.
   */
  function fake(index: number) {
    const picked = race ? q.misses.some((m) => m.index === index) : index === reveal?.chosenIndex;
    return !!reveal && picked && !!q.options[index] && isFake(q.options[index]);
  }

  /** The made-up name the player whose turn it was (or, in a race, you) fell for. */
  const fellFor = $derived.by(() => {
    const index = race ? myMiss?.index : reveal?.chosenIndex;
    return index != null && fake(index) ? optionName(index) : null;
  });

  function optionName(index: number) {
    return q.labels[index] ?? (q.options[index] ? engine.byId.get(q.options[index])?.name : undefined) ?? '';
  }

  let chosen = $state<number | null>(null);

  // ---- effects ----

  /** Answer buttons (or picture tiles), by option index. */
  let optionEls = $state<HTMLElement[]>([]);
  /** At the reveal on phones, the answer to keep clear of the docked bar: the one picked, else the right one. */
  const keepInView = $derived(reveal ? optionEls[(race ? myMiss?.index : reveal.chosenIndex) ?? reveal.correctIndex] : null);
  /** The art stage (name questions) or the picture grid (art questions). */
  let artEl = $state<HTMLElement | null>(null);
  let verdictEl = $state<HTMLElement | null>(null);
  let charge: Handle | null = null;
  /** The scorer's streak of correct answers, for the result line. */
  let streak = $state(0);

  // The art arrives: light it up (once per question).
  let artShown = false;
  $effect(() => {
    const ready = q.mode === 'art' ? tilesIn > 0 : !!(media?.art || media?.veil);
    if (!ready || artShown || !artEl) return;
    artShown = true;
    artRevealed(artEl);
  });

  /** Svelte action: a patch of veiled art burns in (the quick ones at the reveal leave the sound to it). */
  function appear(node: HTMLCanvasElement, params: BurnParams) {
    if (!params.quick) sfx('burn');
    return materialize(node, params);
  }

  /** The same for a veiled "find the art" picture: several burn at once, so the sound only now and then. */
  let tileBurnAt = 0;
  function appearTile(node: HTMLCanvasElement, params: BurnParams) {
    if (!params.quick && performance.now() - tileBurnAt > 260) {
      tileBurnAt = performance.now();
      sfx('burn');
    }
    return materialize(node, params);
  }

  // The charge-up ends when the answer is revealed, bounced, or (race) comes
  // back as a miss.
  $effect(() => {
    if (reveal || chosen === null || myMiss) {
      charge?.stop();
      charge = null;
    }
  });
  $effect(() => () => charge?.stop());

  // Race: a puff of red wherever someone guesses wrong.
  let missesSeen = untrack(() => q.misses.length);
  $effect(() => {
    const misses = q.misses;
    if (misses.length <= missesSeen) return;
    for (const m of misses.slice(missesSeen)) {
      const el = optionEls[m.index];
      if (el) raceMiss(el, m.playerId === me);
    }
    missesSeen = misses.length;
  });

  // The reveal: choreographed once, after the DOM shows it.
  let revealed = false;
  $effect(() => {
    const r = reveal;
    if (!r || revealed) return;
    revealed = true;
    untrack(() => {
      const scorer = race ? (r.winnerId ?? null) : r.correct ? active.id : null;
      // The host has already counted this answer into the scorer's streak.
      streak = scorer ? streakOf(s.players.find((p) => p.id === scorer)) : 0;
      const pill = scorer ? scoreRowOf(scorer) : null;
      // The scorer's bar, before and after this point (the state already counts it).
      // Delve has no score to fill.
      const now = scorer && !s.delve ? s.players.find((p) => p.id === scorer)?.score : undefined;
      const target = s.settings.targetScore;
      const frac = (v: number) => Math.min(1, Math.max(0, v / target));
      const fill = now === undefined ? undefined : { from: frac(now - 1), to: frac(now) };
      revealFx({
        answer: optionEls[r.correctIndex],
        chosen: !race && !r.correct && r.chosenIndex != null ? optionEls[r.chosenIndex] : null,
        art: artEl,
        tiles: q.mode === 'art',
        verdict: verdictEl,
        verdictTone: verdict?.tone,
        // Delve has no points to land (the scoreboard's phial answers a question survived).
        pill: s.delve ? null : pill,
        streak,
        good: iWon,
        otherScored: race && !!winner && !iWon,
        timedOut: r.timedOut,
        fill,
      });
      // Your point streaming into the bar. Without effects the bar just jumps, and 'correct' says it all.
      if (iWon && pill && fill && fxActive()) setTimeout(() => sfx('fill'), FILL_START * 1000 - FILL_LEAD);
    });
  });

  function answer(index: number) {
    if (!mine || reveal || chosen !== null || waiting) return;
    // Time's up: the host only waits a moment longer for answers already on their way.
    if (q.deadline && session.hostNow() > q.deadline) return;
    chosen = index;
    charge?.stop();
    if (optionEls[index]) charge = answerCharging(optionEls[index]);
    sfx('select');
    session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
    setTimeout(() => {
      if (!session.state?.reveal) chosen = null;
    }, 2500);
  }

  /** Moves the light inside an answer with the pointer. */
  function glare(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${(e.clientX - r.left).toFixed(0)}px`);
    el.style.setProperty('--gy', `${(e.clientY - r.top).toFixed(0)}px`);
  }

  function next() {
    sfx('click');
    session.dispatch({ type: 'next' });
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    // Browser shortcuts (Ctrl/Cmd+1 switches tabs), held keys, and an open dialog aren't answers.
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('[aria-modal="true"]')) return;
    // 0 is the tenth option, the key after 9.
    const n = e.key === '0' ? 10 : Number(e.key);
    if (!reveal && !waiting && n >= 1 && n <= count) answer(n - 1);
    else if (reveal && canNext && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  }

  function optionState(index: number) {
    if (myMiss?.index === index) return 'wrong';
    if (!reveal) return chosen === index ? 'pending' : '';
    if (index === reveal.correctIndex) return 'right';
    if (index === reveal.chosenIndex) return 'wrong';
    return 'dim';
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- The verdict at the reveal, a chip like the category's: left of the timer, or (phones) under the category. -->
{#snippet verdictBadge()}
  {#if verdict}
    <div class="verdict {verdict.tone}" bind:this={verdictEl}>
      <span class="glyph" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          {#if verdict.icon === 'check'}
            <path pathLength="1" d="M5.6 10.4l3 3 5.8-6.6" />
          {:else if verdict.icon === 'cross'}
            <path pathLength="1" d="M6.6 6.6l6.8 6.8" />
            <path pathLength="1" d="M13.4 6.6l-6.8 6.8" />
          {:else}
            <path pathLength="1" d="M10 4.4a5.6 5.6 0 1 1 0 11.2a5.6 5.6 0 1 1 0-11.2" />
            <path pathLength="1" d="M10 7v3.2l2.1 1.5" />
          {/if}
        </svg>
      </span>
      <span class="word">{verdict.word}</span>
    </div>
  {/if}
{/snippet}

{#snippet mirrorLine()}
  <span class="mirrored" in:fade={{ duration: 300, delay: 250 }}>Mirrored</span>
{/snippet}

{#snippet who(index: number)}
  {@const ps = markers(index)}
  <!-- A long stack would run over the answer: past five, four and a count. -->
  {@const faces = ps.length > 5 ? ps.slice(0, 4) : ps}
  {#if ps.length}
    <span class="who-picked">
      {#each faces as p (p.id)}
        <span in:scale={{ start: 0.3, duration: 300 }} title={p.name}><Avatar name={p.name} hue={p.hue} size={22} /></span>
      {/each}
      {#if ps.length > faces.length}
        <span class="more" title={ps.slice(faces.length).map((p) => p.name).join(', ')}>+{ps.length - faces.length}</span>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet footer()}
  {#if reveal}
    <div class="result" in:fly={{ y: 16, duration: 400, delay: 250 }}>
      <p>
        {#if race}
          {#if winner}
            <b class="good">+1</b> {winner.id === me ? 'You were' : `${winner.name} was`} fastest!
            {#if streak >= 2}<span class="streak" in:scale={{ start: 0.5, duration: 400, delay: 1100 }}>{streak} in a row</span>{/if}
          {:else if reveal.timedOut}
            Time's up; nobody got it.
          {:else}
            Nobody got it.
          {/if}
          {#if q.misses.length}
            <span class="minus" title={losers.join(', ')}>−1 {losersShort}</span>
          {/if}
        {:else if s.delve}
          {@const you = active.id === me || (session.mode === 'local' && !isGroupRun(s))}
          {@const who = you ? 'You' : active.name}
          {@const left = livesOf(s, active.id)}
          {#if reveal.correct}
            {who} {you ? 'delve' : 'delves'} on.
            {#if streak >= 2}<span class="streak" in:scale={{ start: 0.5, duration: 400, delay: 1100 }}>{streak} in a row</span>{/if}
          {:else}
            <!-- The life that went: a chamber of the phial, its light pouring out of the tip. -->
            <span class="lost-vial" class:last={left <= 1} aria-hidden="true"
              ><span class="glass"><span class="essence"></span></span><svg viewBox="0 0 24 10"
                ><path class="rim" d="M0.6 0.6H18.6L23.3 5 18.6 9.4H0.6Z" /><path class="hair" d="M2.2 2H17.9L21.4 5 17.9 8H2.2Z" /></svg
              ></span
            >
            {#if fallsNow}
              {who} {you ? 'fall' : 'falls'} at depth {s.round}.
            {:else if reveal.timedOut}
              {who} ran out of time; {left === 1 ? 'last life' : `${left} lives left`}.
            {:else}
              {who} {you ? 'lose' : 'loses'} a life; {left === 1 ? 'last one left' : `${left} left`}.
            {/if}
          {/if}
        {:else if reveal.correct}
          <b class="good">+1</b> for {active.name}!
          {#if streak >= 2}<span class="streak" in:scale={{ start: 0.5, duration: 400, delay: 1100 }}>{streak} in a row</span>{/if}
        {:else if reveal.timedOut}
          {active.name} ran out of time.
        {:else}
          No point for {active.name}{fellFor ? ';' : '.'}
        {/if}
        {#if fellFor}{fellFor} isn't a real item.{/if}
      </p>
      <button
        class="btn"
        class:primary={canNext}
        data-sfx="none"
        disabled={!canNext}
        title={canNext ? undefined : race ? 'The host moves the race on' : `${active.name} or the host moves on`}
        onclick={next}
      >
        {race ? 'Next question' : 'Next turn'}
        {#if session.mode !== 'local'}
          <span class="auto" style:transform="scaleX({autoLeft})"></span>
        {/if}
      </button>
    </div>
  {:else if session.spectating}
    <p class="spectate muted">You're watching. You'll play in the next game.</p>
  {:else if race && myMiss}
    <p class="spectate out">Wrong: −1. You're out until the next question.</p>
  {:else if race}
    <p class="spectate muted">First correct answer wins. Wrong costs a point!<span class="keys"> Press 1–{count === 10 ? '9 and 0' : count}.</span></p>
  {:else if !mine}
    <p class="spectate muted">{active.name} is deciding…</p>
  {:else}
    <p class="spectate muted keys">Tip: press 1–{count === 10 ? '9 and 0' : count} to answer.</p>
  {/if}
{/snippet}

<div class="question">
  <div class="topline" class:snug>
    <span class="chip">{questionTopic(q)}</span>
    <span class="task">
      <span class="task-text" class:answered={narrow.current && !!verdict}>{q.mode === 'art' ? 'Pick the art that matches the name' : 'Name this item'}</span>
      {#if narrow.current}{@render verdictBadge()}{/if}
    </span>
    <!-- Phones have the timer in the scoreboard pinned to the top (Game.svelte). -->
    {#if !narrow.current || timer}
      <div class="clock">
        {#if !narrow.current}{@render verdictBadge()}{/if}
        {@render timer?.()}
      </div>
    {/if}
  </div>

  <!-- Delve: until the clock runs (waiting), the question keeps its shape but shows nothing to read. -->
  {#if q.mode === 'art'}
    <!-- Name given, pick the matching art. -->
    <div class="tooltip wide" use:backdropShadow={{ fill: 'linear' }} class:good={reveal && iWon} class:bad={reveal && !iWon}>
      <div class="head">
        <NamePlate />
        <div class="head-text">
          <span class="iname" class:veiled={waiting}>{waiting || !q.prompt ? '\u00a0' : q.prompt}</span>
          {#if reveal && item}
            <span class="ibase" in:fade>{item.base}</span>
          {:else}
            <span class="ibase">Which one is it?</span>
          {/if}
        </div>
      </div>
      <div class="tiles" bind:this={artEl} class:many={count > 4} class:six={count === 6} class:ten={count === 10} class:snug>
        {#each q.labels as _, i (i)}
          {@const st = optionState(i)}
          {@const src = reveal && q.options[i] ? itemImage(q.options[i]) : waiting ? undefined : media?.options[i]}
          <!-- Delve: a veiled picture burns in patch by patch, until the reveal names it. -->
          {@const tv = !src && !waiting ? media?.tileVeils[i] : undefined}
          <button
            class="tile {st}"
            data-sfx="none"
            data-fx="hover"
            bind:this={optionEls[i]}
            class:mine
            disabled={!mine || !!reveal || chosen !== null || waiting}
            onclick={() => answer(i)}
            onpointermove={glare}
            in:scale={{ start: 0.85, duration: 450, delay: 250 + i * 80 }}
          >
            <span class="sheen"></span>
            <span class="key">{(i + 1) % 10}</span>
            <span class="cue" aria-hidden="true"></span>
            {#if src}
              <!-- Named pictures switch to the original art, so a mirrored one turns round. -->
              <span class="pic"><ArtImage {src} alt="Option {i + 1}" scale={1.6} unflip={mirrored(i) && !!q.options[i]} /></span>
            {:else if tv}
              {@const ps = tilePatches(i)}
              <span class="pic">
                <span class="art-slot">
                  <span class="art-fit veil" style:--w={tv.w} style:--h={tv.h} style:--s={1.6}>
                    {#each ps as p (p.i)}
                      <canvas
                        class="patch"
                        data-shape
                        aria-hidden="true"
                        style:left="{(p.x / tv.w) * 100}%"
                        style:top="{(p.y / tv.h) * 100}%"
                        style:width="{(p.w / tv.w) * 100}%"
                        style:height="{(p.h / tv.h) * 100}%"
                        use:appearTile={{
                          url: p.url,
                          edges: p.edges,
                          before: ps.filter((o) => o.i !== p.i).map((o) => o.i),
                          burn: tv.burn,
                          quick: !!reveal,
                        }}
                      ></canvas>
                    {/each}
                    <canvas class="frontier" aria-hidden="true" use:frontier={{ w: tv.w, h: tv.h, burn: tv.burn, quick: !!reveal, patches: ps }}></canvas>
                  </span>
                </span>
              </span>
            {:else}
              <span class="loading" aria-label="Loading"></span>
            {/if}
            {#if reveal && named(i)}
              <span class="caption" in:fly={{ y: 6, duration: 300, delay: 150 }}>
                {optionName(i)}
                {#if mirrored(i)}{@render mirrorLine()}{/if}
              </span>
            {/if}
            {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
            {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
            {@render who(i)}
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="stage" class:snug>
      <div class="tooltip" use:backdropShadow={{ fill: 'linear' }} class:good={reveal && iWon} class:bad={reveal && !iWon}>
        <div class="head">
          <!-- The gems stay dark until the item is identified. -->
          <NamePlate lit={!!(reveal && item)} />
          {#if reveal && item}
            <div class="head-text" in:fly={{ y: 10, duration: 450 }}>
              <span class="iname">{item.name}</span>
              <span class="ibase">{item.base}</span>
              {#if mirrored(0)}{@render mirrorLine()}{/if}
            </div>
          {:else}
            <div class="head-text" out:fade={{ duration: 150 }}>
              <span class="iname unknown">Unidentified</span>
              <span class="ibase">{questionTopic(q, true)}</span>
            </div>
          {/if}
        </div>
        <div class="art" bind:this={artEl} use:backdropShadow={{ fill: 'stage' }}>
          <ArcaneCircle state={reveal ? (iWon ? 'good' : 'bad') : 'idle'} />
          <div class="frame">
            {#if showFull && item}
              <ArtImage src={itemImage(item.id)} alt={item.name} w={full?.w ?? hint?.w} h={full?.h ?? hint?.h} float unflip={mirrored(0)} />
            {/if}
            {#if media?.veil && !showFull}
              {@const v = media.veil}
              <span class="art-slot veil-slot" style:transform={veilFit} out:handoff>
              <span class="art-fit veil" style:--w={v.w} style:--h={v.h} style:--s={1.8}>
                {#each patches as p (p.i)}
                  <canvas
                    class="patch"
                    data-shape
                    aria-hidden="true"
                    style:left="{(p.x / v.w) * 100}%"
                    style:top="{(p.y / v.h) * 100}%"
                    style:width="{(p.w / v.w) * 100}%"
                    style:height="{(p.h / v.h) * 100}%"
                    use:appear={{
                      url: p.url,
                      edges: p.edges,
                      before: patches.filter((o) => o.i !== p.i).map((o) => o.i),
                      burn: v.burn,
                      quick: !!reveal,
                    }}
                  ></canvas>
                {/each}
                <canvas class="frontier" aria-hidden="true" use:frontier={{ w: v.w, h: v.h, burn: v.burn, quick: !!reveal, patches }}></canvas>
              </span>
              </span>
            {:else if !showFull && media?.art && !waiting}
              <ArtImage src={media.art.url} alt="The item to identify" w={media.art.w} h={media.art.h} float />
            {:else if !showFull}
              <span class="loading big" aria-label="Loading"></span>
            {/if}
          </div>
        </div>
      </div>

      <div class="options" class:compact={count > 6} class:dense={count > 8} class:snug>
        {#each q.labels as label, i (i)}
          {@const st = optionState(i)}
          <button
            class="option {st}"
            data-sfx="none"
            data-fx="hover"
            bind:this={optionEls[i]}
            use:backdropShadow={{ fill: 'linear' }}
            class:mine
            class:fake={fake(i)}
            title={fake(i) ? 'Not a real item' : undefined}
            disabled={!mine || !!reveal || chosen !== null || waiting}
            onclick={() => answer(i)}
            onpointermove={glare}
            in:fly={{ x: 40, duration: 450, delay: 300 + i * 90 }}
          >
            <span class="sheen"></span>
            <span class="key">{(i + 1) % 10}</span>
            <span class="text" class:veiled={waiting}>{waiting ? '\u00a0' : (label ?? optionName(i))}</span>
            <span class="cue" aria-hidden="true"></span>
            {@render who(i)}
            {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
            {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="footer">
    {#if reveal && phone.current}
      <!-- Phones: the result and Next button stay at the bottom of the screen, in
           reach of a thumb, however far down the answers have been scrolled. -->
      <div class="dock" use:portal use:dock={keepInView} in:fade={{ duration: 200 }} out:fade|global={{ duration: 180 }}>
        {@render footer()}
      </div>
    {:else}
      {@render footer()}
    {/if}
  </div>
</div>

<style>
  .question {
    width: min(980px, 100%);
    margin: 0 auto;
  }
  .topline {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 64px;
    margin-bottom: 1rem;
  }
  .chip {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    /* Letter spacing also trails the last letter, so the right padding gives
       that space back to keep the label optically centered. */
    padding: 0.4em calc(1em - 0.16em) 0.4em 1em;
    color: var(--gold-hi);
    border: 1px solid var(--gold-lo);
    background: rgba(0, 0, 0, 0.4);
    border-radius: 2px;
  }
  .task {
    flex: 1;
    min-width: 0;
    line-height: 1.25;
    font-style: italic;
    color: var(--muted);
  }
  .task-text {
    transition: opacity 0.25s;
  }
  .task-text.answered {
    opacity: 0;
  }
  /* The timer, and left of it the verdict at the reveal. */
  .clock {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* Art and answers share one row: same top, same bottom, whatever the
     number of options. The art grows with a long list; a short list spreads
     its answers over the art's height. */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: stretch;
  }

  /* PoE-style item tooltip */
  .tooltip {
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    /* Drawn by the WebGL backdrop when it can (so the art stage inside can be too). */
    --bs-fill-a: rgba(5, 4, 3, 0.92);
    --bs-fill-b: rgba(5, 4, 3, 0.92);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    /* --bs1 carries the right/wrong glow, --bs2 the drop shadow. */
    --bs1-color: transparent;
    --bs1: 0px 50px;
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      --bs1-color 0.6s,
      border-color 0.6s;
  }
  .tooltip.good {
    border-color: #4f7a45;
    --bs1-color: rgba(150, 190, 110, 0.12);
  }
  .tooltip.bad {
    border-color: #7a3a2c;
    --bs1-color: rgba(200, 90, 60, 0.09);
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    height: 64px;
    place-items: center;
    /* Clear of the braces at the plate's ends. */
    padding: 0 3.6rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
  }
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.2rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .iname.unknown {
    color: #c8c8c8;
    letter-spacing: 0.1em;
    font-size: 1.05rem;
    text-shadow: none;
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.85rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* An extra tooltip line, cool against the warm name and base. */
  .mirrored {
    display: block;
    font-family: var(--font-body);
    font-weight: 400;
    font-variant: small-caps;
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    line-height: 1.1;
    color: #a9c3dc;
  }
  .caption .mirrored {
    font-size: 0.9rem;
  }

  .art {
    position: relative;
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 300px;
    container-type: size;
    /* A warm glow behind the item, a cooler rim light from above and a
       vignette, over a dark ground. Drawn by the WebGL backdrop when it can
       (see lib/backdropShadow.ts, 'stage'); the warm glow, --bs-fill-a,
       turns green or red at the reveal. */
    --bs-fill-a: rgba(175, 96, 37, 0.16);
    background: var(
      --bs-fill-paint,
      radial-gradient(ellipse 55% 50% at 50% 52%, var(--bs-fill-a), transparent 70%),
      radial-gradient(ellipse 80% 45% at 50% 0%, rgba(90, 110, 160, 0.1), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709)
    );
    box-shadow:
      inset 0 1px 0 rgba(201, 164, 92, 0.12),
      inset 0 0 40px rgba(0, 0, 0, 0.6);
    transition: --bs-fill-a 0.9s;
    overflow: hidden;
  }
  .tooltip.good .art {
    --bs-fill-a: rgba(150, 185, 105, 0.13);
  }
  .tooltip.bad .art {
    --bs-fill-a: rgba(200, 90, 60, 0.08);
  }
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 84%;
    height: 86%;
    display: grid;
    place-items: center;
  }
  .frame > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }
  .veil {
    /* Patches are absolutely positioned inside the box. */
    position: relative;
  }
  /* Lines up with the full art at the reveal (veilFit). */
  .veil-slot {
    transform-origin: 0 0;
    transition: transform 0.45s var(--ease-out);
  }
  /* Each patch's canvas spans its bounding box; the parts of the box outside
     the patch are transparent. */
  .patch {
    position: absolute;
    display: block;
  }
  /* The fire along seams where the item is still missing a part
     (lib/frontier.ts), added as light over the patches. */
  .frontier {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  @supports (mix-blend-mode: plus-lighter) {
    .frontier {
      mix-blend-mode: plus-lighter;
    }
  }
  .loading {
    width: 28px;
    height: 28px;
    margin: auto;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    animation: spin 0.9s linear infinite;
  }
  .loading.big {
    width: 44px;
    height: 44px;
  }
  /* Delve: one chamber of the scoreboard's phial (Phial.svelte), standing on
     the line's baseline, whose light pours out of its tip as the line comes in. */
  .lost-vial {
    position: relative;
    display: inline-block;
    vertical-align: baseline;
    width: 1.5em;
    height: 0.625em;
    margin-right: 0.4em;
  }
  .lost-vial svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .lost-vial .rim {
    fill: none;
    stroke: #c9a45c;
    stroke-width: 1.1;
  }
  .lost-vial .hair {
    fill: none;
    stroke: rgba(241, 217, 155, 0.35);
    stroke-width: 0.45;
  }
  /* The hollow inside the rim (in units of the 24 × 10 drawing): dark glass, hatched along the bottom. */
  .lost-vial .glass {
    position: absolute;
    left: calc(100% * 1.2 / 24);
    top: 12%;
    width: calc(100% * 21.4 / 24);
    height: 76%;
    overflow: hidden;
    clip-path: polygon(0 0, 81% 0, 100% 50%, 81% 100%, 0 100%);
    background:
      repeating-linear-gradient(135deg, rgba(201, 164, 92, 0.22) 0 0.5px, transparent 0.5px 2.2px) 0 100% / 100% 45% no-repeat,
      linear-gradient(180deg, #0b0806, #150d08);
  }
  .lost-vial .essence {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -45%;
    width: 145%;
    background:
      linear-gradient(180deg, rgba(255, 226, 214, 0.45) 0, rgba(255, 226, 214, 0) 24%),
      radial-gradient(ellipse 60% 120% at 62% 58%, #ffe4cf 0%, #ff8a68 20%, #ec3a48 46%, #9c0f2c 74%, #3c0410 100%);
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 31%);
    mask-image: linear-gradient(90deg, transparent, #000 31%);
    animation: vial-pour 1s cubic-bezier(0.55, 0, 0.8, 0.45) 0.7s both;
  }
  .lost-vial.last .essence {
    background:
      linear-gradient(180deg, rgba(255, 200, 190, 0.35) 0, rgba(255, 200, 190, 0) 24%),
      radial-gradient(ellipse 60% 120% at 62% 58%, #ffb49c 0%, #f25a52 20%, #c81e38 46%, #6e0820 74%, #2a030c 100%);
  }
  @keyframes vial-pour {
    to {
      transform: translateX(100%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .lost-vial .essence {
      display: none;
    }
  }

  /* Delve: the words come in once the clock runs. */
  .text,
  .iname {
    transition: opacity 0.2s;
  }
  .veiled {
    opacity: 0;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  /* The verdict at the reveal: a dark chip like the category's (same type,
     tracking and height), pill shaped. Its colour lives in its icon: a lit
     disc whose light spills a little way into the pill. It settles in, the
     disc flares as its icon draws itself, its word wipes in, a faint gold
     ring spreads off it and a sheen crosses it; a right answer's disc keeps
     glowing softly. Green and red as the answers' ✓ and ✕, violet for time. */
  .verdict {
    --v-icon: #c2e3a6;
    --v-tint: 150, 200, 105;
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.55em;
    /* Letter spacing also trails the last letter: the right padding gives it back. */
    padding: 0.4em calc(1.1em - 0.16em) 0.4em 0.4em;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    line-height: 1.45;
    font-style: normal;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--gold-hi);
    /* The sheen (parked off the left end), the disc's light spilling into
       the pill, and the chip's dark fill. */
    background:
      linear-gradient(100deg, transparent 42%, rgba(255, 244, 220, 0.14) 50%, transparent 58%) 100% 0 / 300% 100% no-repeat,
      radial-gradient(ellipse 3.2em 130% at 1.1em 50%, rgba(var(--v-tint), 0.2), transparent),
      rgba(0, 0, 0, 0.4);
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
    pointer-events: none;
    animation:
      verdict-in 0.55s var(--ease-out) both,
      verdict-sheen 0.9s ease-in-out 0.45s;
  }
  .verdict.bad {
    --v-icon: #f0a68c;
    --v-tint: 220, 110, 80;
  }
  .verdict.late {
    --v-icon: #cdb4ee;
    --v-tint: 165, 125, 225;
  }
  .verdict.neutral {
    --v-icon: var(--gold-hi);
    --v-tint: 235, 195, 115;
  }
  /* The faint gold ring that spreads off it as it lands. */
  .verdict::after {
    content: '';
    position: absolute;
    inset: -1px;
    border: 1px solid var(--gold);
    border-radius: inherit;
    opacity: 0;
    animation: verdict-ripple 0.7s var(--ease-out) 0.25s;
  }
  /* As tall as the line, so the chip is exactly a category chip's height. */
  .glyph {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.45em;
    height: 1.45em;
    color: var(--v-icon);
    border: 1px solid rgba(var(--v-tint), 0.75);
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, rgba(var(--v-tint), 0.45), rgba(var(--v-tint), 0.12) 70%), rgba(0, 0, 0, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 0 8px rgba(var(--v-tint), 0.45);
    animation: verdict-flare 0.9s var(--ease-out) 0.2s backwards;
  }
  /* A right answer's glyph breathes: a wider glow on a layer of its own
     fades in and out (fading it is free, where animating the box-shadow
     would repaint every frame until the next question). */
  .verdict.good .glyph {
    position: relative;
  }
  .verdict.good .glyph::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: 50%;
    box-shadow: 0 0 13px 1px rgba(var(--v-tint), 0.45);
    opacity: 0;
    animation: verdict-breathe 2.6s ease-in-out 1.2s infinite;
    pointer-events: none;
  }
  .glyph svg {
    width: 1.05em;
    height: 1.05em;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 2px rgba(var(--v-tint), 0.8));
  }
  .glyph path {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: verdict-draw 0.35s var(--ease-out) 0.22s forwards;
  }
  /* A cross's second stroke and a clock's hands follow the first. */
  .glyph svg > :nth-child(2) {
    animation-delay: 0.4s;
  }
  .word {
    animation: verdict-word 0.5s var(--ease-out) 0.2s backwards;
  }
  @keyframes verdict-in {
    from {
      opacity: 0;
      scale: 0.9;
      filter: blur(3px);
    }
  }
  @keyframes verdict-sheen {
    to {
      background-position: 0 0, 0 0;
    }
  }
  @keyframes verdict-flare {
    from {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.15),
        0 0 18px 3px rgba(var(--v-tint), 0.8);
    }
  }
  @keyframes verdict-breathe {
    50% {
      opacity: 1;
    }
  }
  @keyframes verdict-ripple {
    from {
      opacity: 0.5;
    }
    to {
      inset: -8px;
      opacity: 0;
    }
  }
  @keyframes verdict-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes verdict-word {
    from {
      opacity: 0;
      translate: -0.5em 0;
      clip-path: inset(-0.5em 100% -0.5em -0.5em);
    }
    to {
      clip-path: inset(-0.5em -0.5em -0.5em -0.5em);
    }
  }

  .options {
    display: grid;
    grid-auto-rows: 1fr;
    gap: 0.75rem;
  }
  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    padding: 0.95rem 2.6rem 0.95rem 1.1rem;
    text-align: left;
    /* Drawn by the WebGL backdrop when it can (see lib/backdropShadow.ts). */
    --bs-fill-a: rgba(40, 31, 22, 0.95);
    --bs-fill-b: rgba(20, 16, 12, 0.95);
    --bs-fill-angle: 90deg;
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-angle), var(--bs-fill-a), var(--bs-fill-b)));
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: default;
    isolation: isolate;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.05),
      inset 0 0 0 1px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent));
    transition:
      transform 0.25s var(--ease-out),
      border-color 0.3s,
      opacity 0.4s,
      --bs-ring 0.3s,
      --bs1 0.4s,
      --bs1-color 0.4s,
      --bs-fill-a 0.4s,
      --bs-fill-b 0.4s;
  }
  /* What lights up while the pointer is on an answer, a row or a picture
     (clipped by the answer's own box, so the race avatars on a row's edge
     aren't): a glow that follows the pointer, embers smouldering along the
     bottom, and a band of light that sweeps across once. */
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
    background: linear-gradient(
      100deg,
      transparent,
      rgba(255, 236, 196, 0.07) 40%,
      rgba(255, 246, 225, 0.16) 50%,
      rgba(255, 236, 196, 0.07) 60%,
      transparent
    );
    transform: skewX(-18deg);
    /* Parked off the left end, it would still lean into a tall picture's
       top-left corner (the skew), so it only shows while it sweeps. */
    opacity: 0;
  }
  .sheen::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle 160px at var(--gx, 30%) var(--gy, 50%), rgba(255, 214, 150, 0.12), transparent 70%),
      radial-gradient(ellipse 50% 80% at 50% 135%, rgba(255, 140, 50, 0.28), transparent 70%);
    opacity: 0;
    transition: opacity 0.35s;
  }
  /* Light along the top edge, opening out from the middle. */
  .option::after,
  .tile::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 6%;
    right: 6%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #fff1cf, transparent);
    filter: drop-shadow(0 0 3px rgba(255, 180, 90, 0.9));
    opacity: 0;
    scale: 0.4 1;
    transition:
      opacity 0.3s,
      scale 0.5s var(--ease-out);
    pointer-events: none;
  }
  .option.mine:not(:disabled) {
    cursor: pointer;
  }
  /* Hovered, or picked and waiting for the verdict: the row stays put and lights up. */
  .option.mine:not(:disabled):hover,
  .option.mine:not(:disabled):focus-visible,
  .option.pending {
    border-color: var(--gold);
    --bs-ring: rgba(241, 217, 155, 0.1);
    --bs-fill-a: rgba(70, 48, 25, 0.96);
    --bs-fill-b: rgba(29, 22, 14, 0.95);
    --bs1: 0px 26px;
    --bs1-color: rgba(224, 138, 68, 0.2);
  }
  :is(.option, .tile).mine:not(:disabled):hover .sheen::before {
    animation: sweep 0.8s var(--ease-out);
  }
  :is(.option, .tile).mine:not(:disabled):hover .sheen::after,
  :is(.option, .tile).mine:not(:disabled):focus-visible .sheen::after,
  :is(.option, .tile).pending .sheen::after,
  :is(.option, .tile).mine:not(:disabled):hover .cue,
  :is(.option, .tile).mine:not(:disabled):focus-visible .cue,
  :is(.option, .tile).pending .cue,
  :is(.option, .tile).mine:not(:disabled):hover::after,
  :is(.option, .tile).mine:not(:disabled):focus-visible::after,
  :is(.option, .tile).pending::after {
    opacity: 1;
  }
  :is(.option, .tile).mine:not(:disabled):hover::after,
  :is(.option, .tile).mine:not(:disabled):focus-visible::after,
  :is(.option, .tile).pending::after {
    scale: 1 1;
  }
  :is(.option, .tile).mine:not(:disabled):hover .key,
  :is(.option, .tile).mine:not(:disabled):focus-visible .key,
  :is(.option, .tile).pending .key {
    color: #fff4d8;
    border-color: var(--gold-hi);
    box-shadow: 0 0 12px rgba(241, 217, 155, 0.4);
  }
  :is(.option, .tile).mine:not(:disabled):hover .key::before,
  :is(.option, .tile).mine:not(:disabled):focus-visible .key::before,
  :is(.option, .tile).pending .key::before {
    opacity: 1;
  }
  :is(.option, .tile).mine:not(:disabled):hover .key::after {
    animation: key-ripple 0.7s var(--ease-out);
  }
  .option.mine:not(:disabled):hover .text,
  .option.mine:not(:disabled):focus-visible .text,
  .option.pending .text {
    color: #fff1dc;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.35);
  }
  :is(.option, .tile).mine:not(:disabled):hover .cue,
  :is(.option, .tile).mine:not(:disabled):focus-visible .cue,
  :is(.option, .tile).pending .cue {
    translate: 0 -50%;
  }
  .option.mine:not(:disabled):active {
    transform: scale(0.985);
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
  @keyframes key-ripple {
    from {
      opacity: 0.7;
    }
    to {
      inset: -7px;
      opacity: 0;
    }
  }
  .key {
    position: relative;
    isolation: isolate;
    flex: none;
    width: 28px;
    height: 28px;
    /* Cinzel's line box sits its digits a pixel high; nudge them to the optical centre. */
    padding-top: 2px;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--gold);
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    transition:
      color 0.25s,
      border-color 0.25s,
      box-shadow 0.25s;
  }
  /* Lit like a seal held to the light, and a ring of it running out once. */
  .key::before,
  .key::after {
    content: '';
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }
  .key::before {
    z-index: -1;
    inset: 0;
    background: radial-gradient(circle at 50% 30%, rgba(196, 128, 50, 0.6), rgba(60, 36, 12, 0.5) 75%);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .key::after {
    inset: -1px;
    border: 1px solid var(--gold-hi);
    opacity: 0;
  }
  /* A gold diamond in the room kept for the ✓/✕, sliding in on hover. */
  .cue {
    position: absolute;
    top: 50%;
    right: 1.05rem;
    width: 6px;
    height: 6px;
    translate: 6px -50%;
    rotate: 45deg;
    background: linear-gradient(135deg, #fff1cf, var(--gold) 55%, var(--gold-lo));
    box-shadow: 0 0 8px rgba(255, 180, 90, 0.7);
    opacity: 0;
    transition:
      opacity 0.3s,
      translate 0.4s var(--ease-out);
    pointer-events: none;
  }
  .text {
    flex: 1;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.08rem;
    color: #e9c8a2;
    letter-spacing: 0.02em;
    transition:
      color 0.25s,
      text-shadow 0.25s;
  }
  .mark {
    font-size: 1.3rem;
    font-weight: 700;
  }
  /* The ✓/✕ sits in room kept free on the right, so it can't widen, heighten
     or rewrap the answer when it appears at the reveal. */
  .option .mark {
    position: absolute;
    top: 50%;
    right: 0.9rem;
    translate: 0 -50%;
    line-height: 1;
  }
  .compact .option {
    padding-top: 0.7rem;
    padding-bottom: 0.7rem;
  }
  .compact {
    gap: 0.6rem;
  }
  .dense .option {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
  .dense {
    gap: 0.45rem;
  }
  .option.pending {
    animation: glow 1s ease-in-out infinite;
  }
  .option.right {
    border-color: #5d8a50;
    --bs-fill-a: rgba(44, 64, 36, 0.9);
    --bs-fill-b: rgba(22, 28, 17, 0.92);
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
    --bs-fill-a: rgba(78, 32, 22, 0.9);
    --bs-fill-b: rgba(34, 15, 11, 0.92);
    box-shadow: 0 0 14px rgba(200, 90, 60, 0.1);
    animation: shake 0.5s;
  }
  .option.wrong .text,
  .option.wrong .mark {
    color: #eab3a3;
  }
  /* Picked made-up names are struck through at the reveal (same size, so nothing moves). */
  .option.fake .text {
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }
  .option.dim {
    opacity: 0.35;
    filter: saturate(0.5);
  }
  .option:disabled {
    color: inherit;
  }

  /* "find the art" questions */
  .tooltip.wide {
    width: 100%;
  }
  .tiles {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: #2a1d10;
  }
  .tiles.six {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .tiles.ten {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 250px;
    padding: 1.2rem 0.8rem 0.8rem;
    border: 1px solid transparent;
    /* Same backdrop as the item art panel. */
    background:
      radial-gradient(ellipse 60% 50% at 50% 45%, rgba(175, 96, 37, 0.14), transparent 70%),
      radial-gradient(ellipse 90% 40% at 50% 0%, rgba(90, 110, 160, 0.09), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.5) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
    cursor: default;
    isolation: isolate;
    transition:
      background 0.3s,
      border-color 0.3s,
      opacity 0.4s,
      box-shadow 0.3s;
  }
  .tiles.many .tile {
    height: 200px;
  }
  .pic {
    display: block;
    flex: 1;
    width: 92%;
    min-height: 0;
    transition: transform 0.35s var(--ease-out);
  }
  .tile .key {
    position: absolute;
    top: 8px;
    left: 8px;
  }
  .tile .mark {
    position: absolute;
    top: 8px;
    right: 12px;
  }
  .tile.mine:not(:disabled) {
    cursor: pointer;
  }
  /* Hovered, or picked and waiting for the verdict: lit like the answer rows,
     and the picture comes forward. */
  .tile.mine:not(:disabled):hover,
  .tile.mine:not(:disabled):focus-visible,
  .tile.pending {
    border-color: var(--gold);
    box-shadow:
      inset 0 0 0 1px rgba(241, 217, 155, 0.1),
      inset 0 0 30px rgba(201, 164, 92, 0.18);
  }
  .tile.mine:not(:disabled):hover .pic,
  .tile.mine:not(:disabled):focus-visible .pic,
  .tile.pending .pic {
    transform: scale(1.06);
  }
  /* A picture is tall: a wider glow, and the embers kept to the bottom edge. */
  .tile .sheen::after {
    background:
      radial-gradient(circle 200px at var(--gx, 50%) var(--gy, 50%), rgba(255, 214, 150, 0.13), transparent 70%),
      radial-gradient(ellipse 70% 22% at 50% 106%, rgba(255, 140, 50, 0.34), transparent 70%);
  }
  /* The diamond sits level with the key, under where the ✓/✕ goes. */
  .tile .cue {
    top: 22px;
    right: 17px;
  }
  .tile.right {
    border-color: #5d8a50;
    background: radial-gradient(ellipse at center, rgba(150, 185, 105, 0.14), rgba(14, 20, 11, 0.95) 75%);
    box-shadow: inset 0 0 0 1px #5d8a50;
  }
  .tile.right .mark {
    color: #a9cf8f;
  }
  .tile.wrong {
    border-color: #8e4434;
    background: radial-gradient(ellipse at center, rgba(200, 90, 60, 0.12), rgba(24, 10, 7, 0.95) 75%);
    animation: shake 0.5s;
  }
  .tile.wrong .mark {
    color: #d98a6e;
  }
  .tile.dim {
    opacity: 0.4;
  }
  .caption {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.85rem;
    text-align: center;
    color: #e9c8a2;
    line-height: 1.2;
  }
  .tile.right .caption {
    color: #d6e8c0;
  }
  /* Same height with a tip, a result or nothing, so the page doesn't jump at the reveal. */
  .footer {
    display: grid;
    align-items: center;
    min-height: 52px;
    margin-top: 1.25rem;
  }

  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .result p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1.15rem;
  }
  .result .good {
    font-family: var(--font-display);
    color: #a9cf8f;
    font-size: 1.4rem;
    text-shadow: 0 0 10px rgba(150, 190, 110, 0.35);
  }
  /* A streak of correct answers. */
  .streak {
    position: relative;
    display: inline-block;
    margin-left: 0.6em;
    padding: 0.1em 0.7em 0.05em;
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    vertical-align: 0.15em;
    color: #ffe2b0;
    background: linear-gradient(180deg, rgba(160, 70, 20, 0.6), rgba(80, 25, 5, 0.6));
    border: 1px solid rgba(255, 150, 70, 0.6);
    border-radius: 999px;
    box-shadow: 0 0 16px rgba(255, 120, 40, 0.35);
    text-shadow: 0 0 10px rgba(255, 170, 90, 0.7);
  }
  /* It smoulders: a wider glow fades in and out on a layer of its own (see
     .glyph::before). */
  .streak::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    box-shadow: 0 0 24px rgba(255, 140, 50, 0.4);
    opacity: 0;
    animation: smoulder-badge 1.6s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes smoulder-badge {
    50% {
      opacity: 1;
    }
  }
  /* However long the result, the button keeps its size. */
  .result .btn {
    flex: none;
    white-space: nowrap;
    overflow: hidden;
  }
  /* Not yours to press: a plain button rather than a faded one, so the countdown stays bright. */
  .result .btn:disabled {
    opacity: 1;
    filter: none;
    color: var(--muted);
  }
  .auto {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 100%;
    background: var(--gold-hi);
    transform-origin: left;
  }
  /* Race avatars: an overlapping stack, out of the flow so they never squeeze
     or rewrap the answer as guesses come in and at the reveal. */
  .who-picked {
    display: inline-flex;
  }
  .who-picked > span + span {
    margin-left: -6px;
  }
  .more {
    display: grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    padding: 1px 4px 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.68rem;
    color: var(--gold-hi);
    background: #1a130c;
    border: 1px solid var(--gold-lo);
    border-radius: 11px;
    box-shadow: 0 0 0 2px #0c0a08;
  }
  /* Inside the row, just left of the ✓/✕. */
  .option .who-picked {
    position: absolute;
    top: 50%;
    right: 2.6rem;
    translate: 0 -50%;
  }
  /* On a tile the stack hangs down from under the ✓/✕, clear of the name below the art. */
  .tile .who-picked {
    position: absolute;
    top: 40px;
    right: 9px;
    flex-direction: column;
    align-items: center;
  }
  .tile .who-picked > span + span {
    margin-left: 0;
    margin-top: -6px;
  }
  .minus {
    margin-left: 0.6em;
    font-family: var(--font-display);
    font-size: 0.9rem;
    color: #ff9c86;
  }
  .spectate.out {
    color: #ff9c86;
    font-style: italic;
  }
  .spectate {
    margin: 0;
    font-style: italic;
    text-align: center;
  }

  @keyframes glow {
    50% {
      --bs1: 0px 32px;
      --bs1-color: rgba(241, 190, 110, 0.36);
    }
  }
  @keyframes shake {
    15%,
    55% {
      translate: -7px 0;
    }
    35%,
    75% {
      translate: 7px 0;
    }
  }

  @media (max-width: 760px) {
    .stage {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .art {
      flex: none;
      height: 230px;
      min-height: 0;
    }
    .options {
      grid-auto-rows: auto;
    }
    .topline {
      flex-wrap: wrap;
      row-gap: 0.4rem;
      min-height: 0;
      margin-bottom: 0.8rem;
    }
    .footer {
      margin-top: 1rem;
    }
    .chip {
      margin-right: auto;
    }
    /* Phones: the task line (beside the category when there's room, under it
       when not) is a chip's height, so the verdict can take its place at the
       reveal without moving anything. */
    .task {
      flex: 1 1 12rem;
      font-size: 0.95rem;
      display: grid;
      align-items: center;
      justify-items: start;
      min-height: calc(0.8rem * 2.25 + 2px);
    }
    .task > * {
      grid-area: 1 / 1;
    }
    .option {
      padding: 0.75rem 2.3rem 0.75rem 0.9rem;
    }
    .option .mark {
      right: 0.7rem;
    }
    /* Phones have no spare room beside the answer: the stack, smaller, takes
       its own place in the row after the answer, which wraps around it. */
    .option .who-picked {
      position: static;
      flex: none;
      translate: none;
      margin-left: -0.4rem;
    }
    .who-picked :global(.avatar) {
      width: 18px;
      height: 18px;
    }
    .more {
      min-width: 18px;
      height: 18px;
      padding: 1px 3px 0;
      font-size: 0.6rem;
    }
    .who-picked > span + span {
      margin-left: -5px;
    }
    .tile .who-picked {
      right: 11px;
    }
    .tile .who-picked > span + span {
      margin-left: 0;
      margin-top: -5px;
    }
    .tiles,
    .tiles.six,
    .tiles.ten {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tile,
    .tiles.many .tile {
      height: 150px;
    }
  }

  /* Touch screens have no number keys to press. */
  @media (hover: none) and (pointer: coarse) {
    .keys {
      display: none;
    }
  }

  @media (max-width: 640px) {
    /* Fixed rather than sticky: a sticky bar would stop at the end of the
       question, with the legal links below it. */
    .dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      /* Under the toasts (90) and the effects layer (95). */
      z-index: 20;
      padding: 0.6rem max(1rem, env(safe-area-inset-right)) max(0.6rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      background-color: var(--pinned-bg);
      border-top: var(--pinned-line);
      box-shadow: 0 -8px var(--pinned-shadow);
    }
    .dock .result p {
      font-size: 1rem;
    }
    /* Tighter all round, so less scrolling from the art down to the answers.
       Answers stay 48px tall, a comfortable tap. */
    .topline {
      margin-bottom: 0.6rem;
    }
    /* Two lines high, before and at the reveal alike, so the art below never
       moves: the Mirrored line goes beside the base type. (Only a name long
       enough to wrap makes it grow.) */
    .head {
      height: auto;
      min-height: 54px;
      padding: 0.3rem 2.9rem;
      /* The name plate's ends drawn smaller, to leave the name room. */
      --end-scale: 0.84;
    }
    .head-text {
      flex-flow: row wrap;
      justify-content: center;
      align-items: baseline;
      column-gap: 0.6em;
    }
    .head-text .iname {
      flex-basis: 100%;
      text-align: center;
    }
    .art {
      height: clamp(180px, 32svh, 230px);
    }
    .stage {
      gap: 0.75rem;
    }
    /* Longer lists a little tighter still, as on wide screens (the answers
       48, 46 and 44px tall). */
    .options {
      gap: 0.5rem;
    }
    .options.compact {
      gap: 0.45rem;
    }
    .options.dense {
      gap: 0.4rem;
    }
    .option {
      padding-top: 0.55rem;
      padding-bottom: 0.55rem;
    }
    .compact .option {
      padding-top: 0.5rem;
      padding-bottom: 0.5rem;
    }
    .dense .option {
      padding-top: 0.45rem;
      padding-bottom: 0.45rem;
    }
    .tile,
    .tiles.many .tile {
      height: 140px;
    }
    /* Only a line of text now and then (the reveal's bar is docked). */
    .footer {
      min-height: 0;
      margin-top: 0.75rem;
    }
    /* Delve's eight answers, on a clock down to seven seconds: two columns of
       names (a long one takes two lines) and the pictures four to a row, so
       all of them are in view under the art. Their numbers shrink to small
       seals, so the answers can still be called out by number. */
    /* The task line beside the category, two lines if need be, never under it. */
    .topline.snug {
      flex-wrap: nowrap;
    }
    .topline.snug .task {
      flex: 1 1 0;
      font-size: 0.85rem;
      line-height: 1.1;
    }
    .stage.snug .art {
      height: clamp(150px, 23svh, 230px);
    }
    .options.snug {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.4rem;
    }
    .snug .option {
      min-height: 50px;
      gap: 0.4rem;
      padding: 0.4rem 1.4rem 0.4rem 0.4rem;
    }
    .snug .key {
      width: 20px;
      height: 20px;
      padding-top: 1px;
      font-size: 0.66rem;
    }
    .snug .text {
      font-size: 0.98rem;
      line-height: 1.12;
      letter-spacing: 0.01em;
      overflow-wrap: anywhere;
    }
    .snug .option .mark {
      right: 0.5rem;
      font-size: 1.1rem;
    }
    .snug .cue {
      right: 0.6rem;
    }
    .tiles.snug {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .tiles.snug .tile {
      height: 136px;
      padding: 0.5rem 0.25rem;
    }
    .tiles.snug .tile .key {
      top: 4px;
      left: 4px;
    }
    .tiles.snug .tile .mark {
      top: 4px;
      right: 6px;
      font-size: 1.05rem;
    }
  }
</style>
