<script lang="ts">
  import { fly, fade, scale, slide } from 'svelte/transition';
  import { session, engine } from '../lib/session.svelte';
  import { glare } from '../lib/glare';
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
  import { motion } from '../lib/motion.svelte';
  import {
    FILL_START,
    answerCharging,
    artRevealed,
    raceMiss,
    reveal as revealFx,
    veilComplete,
    veilHandoff,
    type VerdictTone,
    ablaze,
  } from '../lib/fx/moments';
  import { FILL_LEAD } from '../lib/soundDesign';
  import { burnsBlue, heatOf, streakOf } from '../lib/fx/streaks';
  import { scoreRowOf } from '../lib/scoreRows';
  import { fxActive, type Handle } from '../lib/fx/core';
  import { dock, phone, short, sideBySide } from '../lib/layout';
  import { portal } from '../lib/portal';
  import { DELVE_FUSE_MS, blastProblem, blastsLeft, clockLeft, dynamiteOf, fellAt, fuseDue, fuseLeft, holdersOf, isGroupRun, itemsWorkOn, livesOf, waitingIds } from '../lib/delve';
  import { blownText, coopMissText, coopRevealText, flareText, namesOf, perishedText, wardText } from '../lib/difficultyText';
  import ItemGlyph from './ItemGlyph.svelte';
  import type { GlyphKind } from '../lib/inventoryArt';

  const s = $derived(session.state!);
  const q = $derived(s.question!);
  const reveal = $derived(s.phase === 'reveal' ? s.reveal : null);
  /** The question's timer, at the task line's right end (phones have it in the pinned scoreboard, Game.svelte). */
  let { timer }: { timer?: Snippet } = $props();
  const active = $derived(s.players[s.turn]);
  const me = $derived(session.myPlayerId);
  /**
   * Delve together: nobody has a turn. Everyone standing answers the one
   * question, once each; a wrong pick strikes its option for everyone, and
   * the first right one clears the depth.
   */
  const coop = $derived(!!s.delve && isGroupRun(s));
  const struckList = $derived(coop ? (q.struck ?? []) : []);
  const struckAt = $derived(new Map(struckList.map((x) => [x.index, x])));
  /** Delve together: your own wrong pick on this question, if any. */
  const myStruck = $derived(coop && me ? struckList.find((x) => x.by === me) : undefined);
  /** Delve together: you stand and haven't struck out on this question (as `mine`, but holding through the reveal). */
  // (The lives the reveal took are counted back, so running out of time on the last one doesn't change the line as the verdict lands.)
  const canAnswer = $derived(
    !!me &&
      !session.spectating &&
      s.players.some((p) => p.id === me) &&
      livesOf(s, me) + (reveal?.hits?.find((h) => h.playerId === me)?.lives ?? 0) > 0 &&
      !myStruck,
  );
  /** Whether this device answers: your turn, or (Delve together) you stand and haven't answered yet. */
  const mine = $derived(coop ? !reveal && canAnswer : session.myTurn);
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  /**
   * Svelte action: a name that is the question (the picture question's plate)
   * shrinks, down to three quarters of its size, to stay on one line, so the
   * plate keeps its height; only a name too long even then wraps.
   */
  function oneLine(node: HTMLElement) {
    const run = () => {
      node.style.fontSize = '';
      node.style.whiteSpace = 'nowrap';
      const full = parseFloat(getComputedStyle(node).fontSize);
      // The plate's room inside its padding (the text block itself grows with an unwrapped name).
      const head = node.closest<HTMLElement>('.head');
      if (!head) return;
      const hs = getComputedStyle(head);
      const room = head.clientWidth - parseFloat(hs.paddingLeft) - parseFloat(hs.paddingRight) + 0.5;
      // The words' own width (the span itself is as wide as the plate's line).
      const range = document.createRange();
      range.selectNodeContents(node);
      const wide = () => range.getBoundingClientRect().width;
      // Words widen with their size: one guess, then (rounding, kerning) a step or two more at most.
      const was = wide();
      if (was <= room) return;
      const least = full * 0.75;
      let size = Math.max(least, Math.floor(((full * room) / was) * 2) / 2);
      node.style.fontSize = `${size}px`;
      while (wide() > room && size > least) {
        size = Math.max(least, size - 0.5);
        node.style.fontSize = `${size}px`;
      }
      if (wide() > room) node.style.whiteSpace = '';
    };
    run();
    // Again once the display font is in, and whenever the plate's width changes (a phone turned).
    void document.fonts?.ready.then(run);
    const ro = new ResizeObserver(run);
    const head = node.closest('.head');
    if (head) ro.observe(head);
    // And when the name changes: once its new words are in (before the next paint).
    const mo = new MutationObserver(run);
    mo.observe(node, { characterData: true, childList: true, subtree: true });
    return {
      destroy: () => {
        ro.disconnect();
        mo.disconnect();
      },
    };
  }
  /**
   * Delve together, while the question is open: teammates its wrong picks
   * left with no lives (their entries grey, easy to miss mid-question), and
   * a flare burning from someone's pack, said under the answers. A wrong
   * pick says itself (its answer crossed out under the picker's face), and
   * what it cost is told at the reveal.
   */
  const perishedLine = $derived(
    coop && !reveal
      ? perishedText(
          struckList.filter((x) => s.players.some((p) => p.id === x.by) && livesOf(s, x.by) === 0).map((x) => x.by),
          nameOf,
          me,
        )
      : '',
  );
  const flareLine = $derived(coop && !reveal && q.flared && q.flaredBy ? flareText(q.flaredBy, nameOf, me) : '');
  // Guests only learn the answer (and the items behind the options) at the reveal.
  const item = $derived(q.itemId ? engine.byId.get(q.itemId) : undefined);
  const race = $derived(s.settings.mode === 'race');
  /**
   * Turns: someone else is answering. The answers go grey and sit flat in the
   * page (kept in place, frames and numbers too, the names still readable), so
   * at a glance it is plainly not yours to press; they light up again when your
   * turn comes, and at the reveal everyone sees the verdict in full colour.
   */
  const theirs = $derived(!race && !coop && !session.myTurn && !reveal);
  // Everyone sees the Next button; only the host (and in turns mode, whoever answered) can press it.
  const canNext = $derived(!!reveal && (race ? session.isHost : coop ? session.isHost || session.state!.players.some((p) => p.id === session.myPlayerId) : mine || session.isHost));
  const myMiss = $derived(race && me ? q.misses.find((m) => m.playerId === me) : undefined);
  const winner = $derived(reveal?.winnerId ? s.players.find((p) => p.id === reveal.winnerId) : undefined);
  /** Turns and race: you (or whoever answered) got it. Delve together: the team cleared the depth. */
  const iWon = $derived(race ? !!me && reveal?.winnerId === me : coop ? !!reveal?.winnerId : !!reveal?.correct);
  /** Delve alone: the player answering just lost their last life. */
  const fallsNow = $derived(!!s.delve && !coop && !!reveal && !reveal.correct && fellAt(s, active.id) === s.round);
  /** Delve: you answering (online, or alone on this device), or someone else, by name. */
  const delveYou = $derived(!!s.delve && !coop && (active.id === me || session.mode === 'local'));
  /** Delve: who a find's item went to (together: whoever cleared it, or a teammate with room for it), and whether that's you. */
  const gainerId = $derived(coop ? (reveal?.gainedBy ?? reveal?.winnerId ?? null) : active.id);
  const gainYou = $derived(coop ? !!gainerId && gainerId === me : delveYou);
  const gainName = $derived(gainerId ? nameOf(gainerId) : '');
  /**
   * Delve: what a right answer to a find earned, in words, and its engraving:
   * a ward mined, a shard (too slow for a ward, from an Azurite Vein) or a
   * ward forged from two, a flare or dynamite found.
   */
  const gainLine = $derived.by((): { glyph: GlyphKind; text: string } | null => {
    const got = reveal?.correct ? reveal.gained : undefined;
    if (!s.delve || !got) return null;
    const who = gainYou ? 'You' : gainName;
    if (got === 'wards' && reveal?.forged) return { glyph: 'ward', text: `${gainYou ? 'Your' : `${gainName}'s`} two shards forged an Azurite Ward.` };
    if (got === 'wards') return { glyph: 'ward', text: `${who} mined an Azurite Ward.` };
    if (got === 'shards')
      return { glyph: 'shard', text: q.find === 'azurite' ? `Too slow for a ward, but ${gainYou ? 'you' : gainName} mined a shard.` : `${who} found an azurite shard.` };
    if (got === 'flares') return { glyph: 'flare', text: `${who} found a flare.` };
    return { glyph: 'dynamite', text: `${who} found a stick of dynamite.` };
  });

  // The verdict leads the result line at the reveal, beside Next.
  /**
   * The verdict badge at the reveal: its word, icon and colour (violet
   * for running out of time, gold for a race someone else solved while you watch).
   */
  const verdict = $derived.by((): { word: string; icon: 'check' | 'cross' | 'clock'; tone: VerdictTone } | null => {
    if (!reveal) return null;
    if (coop) {
      // The team's verdict: cleared (by you: Correct), out of time, or every answer wrong.
      if (reveal.winnerId) return { word: reveal.winnerId === me ? 'Correct' : 'Cleared', icon: 'check', tone: 'good' };
      if (reveal.timedOut) return { word: "Time's up", icon: 'clock', tone: 'late' };
      return { word: 'Wrong', icon: 'cross', tone: 'bad' };
    }
    if (iWon) return { word: 'Correct', icon: 'check', tone: 'good' };
    if (race && winner) return session.spectating ? { word: 'Solved', icon: 'check', tone: 'neutral' } : { word: 'Too slow', icon: 'clock', tone: 'late' };
    if (fallsNow) return { word: 'Perished', icon: 'cross', tone: 'bad' };
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
  // A list too long for one column beside the art (Eternal's eight, Delve's
  // eight and ten): two columns, as phones have, rather than every answer
  // shrunk (see the 761px block).
  const long = $derived(count > 6);
  // Art questions whose pictures all stand tall (staves, bows, wands: the host
  // says so, lib/game.ts TALL_ART_GROUPS): on wide screens they stand in one
  // row of tall tiles rather than two rows of short ones, where a staff is a
  // thin stick.
  const tallArt = $derived(!!q.tall && count <= 8);
  /** Whether a timer runs on this question (the timer snippet draws nothing without one). */
  const clocked = $derived(!!q.deadline || !!s.delve);
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

  /** Your answer, on its way to the host. */
  let chosen = $state<number | null>(null);
  // One the host turned down as too quick may be given again at once. Only a
  // turn-down sets it off (shownAt, below, isn't reactive): every state that
  // comes in brings a new question, and an answer given again stays on its way.
  $effect(() => {
    if (session.turnedDown?.askedAt === shownAt) chosen = null;
  });

  // ---- dynamite ----
  // Delve: while the question is open, a stick of dynamite (your own;
  // together while you still have an answer to give) can blast it away for a
  // new one at the same depth, twice a depth at most: its button (Detonate)
  // takes the place Next has after an answer. Once this question has dynamite
  // at hand its place is kept until the question ends, the button only
  // showing while it can be used, so nothing moves as it comes and goes. When
  // it will go off by itself as the clock hits 0 (no flare to burn first;
  // together a random standing holder's stick), its fuse burns over
  // the clock's last seconds (delve.ts fuseLeft): the button's bar burns
  // down to 0 with it, on the host's clock as Next's does, and the question
  // can still be answered, or Detonate pressed, meanwhile.

  /** Sticks of dynamite at hand: alone the player's, together your own (only who holds one sets it off). */
  const sticks = $derived(!s.delve ? 0 : coop ? (me ? dynamiteOf(s, me) : 0) : dynamiteOf(s, active.id));
  /** The clock has run out here (a flare burning moves it on): what happens now is the host's (a flare, the dynamite by itself, the time-out). */
  let expired = $state(false);
  $effect(() => {
    const end = q.deadline;
    if (end === null || reveal) return;
    const left = end - session.hostNow();
    expired = left <= 0;
    if (left <= 0) return;
    const timer = setTimeout(() => (expired = true), left);
    return () => clearTimeout(timer);
  });
  /**
   * The fuse burning down over the clock's last seconds, 1 to 0 at 0
   * (delve.ts fuseLeft), on the host's clock; null before it starts, or
   * when no dynamite will go off at this 0.
   */
  let fuse = $state<number | null>(null);
  $effect(() => {
    const st = s;
    if (reveal || !fuseDue(st)) {
      fuse = null;
      return;
    }
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = session.hostNow();
      fuse = fuseLeft(st, now);
      // Not burning yet: back as it starts.
      if (fuse === null) timer = setTimeout(tick, Math.max(16, clockLeft(st.question!, now) - DELVE_FUSE_MS));
      else if (fuse > 0) frame = requestAnimationFrame(tick);
    };
    untrack(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  });
  /** Whose dynamite the fuse burns on: alone the player's; together the one holder's, or with several the team's (one of theirs is drawn as it goes off). */
  const fuseOwner = $derived.by(() => {
    if (!coop) return delveYou ? 'your' : `${active.name}'s`;
    const ids = holdersOf(s, 'dynamite');
    if (ids.length !== 1) return "the team's";
    return ids[0] === me ? 'your' : `${nameOf(ids[0])}'s`;
  });
  /** Whether this device can blast the question away now (delve.ts blastProblem; on one device, for the player): while its clock runs, its fuse to the end. */
  const canBlast = $derived(
    !!s.delve &&
      mine &&
      !reveal &&
      !waiting &&
      (!expired || fuse !== null) &&
      chosen === null &&
      blastProblem(s, session.mode === 'local' ? null : me) === null,
  );
  /** The button's place, kept from when dynamite is at hand on a question it works on until the question ends. */
  // (Not when this depth has no blast left: on phones the place is a docked bar, which would hold nothing.)
  const slotWanted = () => !!s.delve && !reveal && itemsWorkOn(q) && sticks > 0 && mine && blastsLeft(s) > 0;
  // Taken from the first frame when it applies already, so the row never pops in under the answers.
  let blastSlot = $state(untrack(slotWanted));
  $effect(() => {
    if (!blastSlot && slotWanted()) blastSlot = true;
  });
  let blasting = false;
  function blastThrough() {
    if (!canBlast || blasting) return;
    blasting = true;
    // Its fuse is heard here at once (unless it is burning already: never twice); the blast is heard as the new question comes (session.svelte.ts).
    session.detonating(q.askedAt);
    session.dispatch({ type: 'blast', askedAt: q.askedAt });
    // Should the host turn it down (it crossed the end of the question), it can be pressed again.
    setTimeout(() => (blasting = false), 1500);
  }
  /** The question dynamite blasted away for this one: whose it was, in a line. */
  const blastLine = $derived.by(() => {
    const b = q.blast;
    if (!s.delve || !b || reveal) return null;
    const you = session.mode === 'local' || b.stick === me;
    if (!b.by) return `Time ran out, so ${you ? 'your' : `${nameOf(b.stick)}'s`} dynamite went off and blasted the last question away.`;
    return `${b.by === me || session.mode === 'local' ? 'You' : nameOf(b.by)} blasted the last question away.`;
  });

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
  // over once it can show (or after a while, should it not load). Where the
  // item is in it (in art pixels, the item's own size) lets the veiled copy
  // line up with it first.
  let fullLoaded = $state(false);
  let fullBox = $state<[number, number, number, number] | null>(null);
  $effect(() => {
    if (!reveal || !item) {
      fullLoaded = false;
      fullBox = null;
      return;
    }
    let live = true;
    const done = () => live && (fullLoaded = true);
    const img = new Image();
    img.src = itemImage(item.id);
    img.decode().then(() => {
      if (!live) return;
      // Measured in art pixels, as the host measures the veiled copy.
      const c = document.createElement('canvas');
      c.width = item.w;
      c.height = item.h;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      fullBox = visibleBox(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
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
    if (!reveal || !v || !fullBox || !item || !slot) return null;
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
    const fb = fullBox;
    const to = place(item.w, item.h, mirrored(0) ? [item.w - fb[0] - fb[2], fb[1], fb[2], fb[3]] : fb);
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
  const showFull = $derived(!!reveal && !!item && (!media?.veil || (veilDone && fullLoaded && (fitted || !fullBox))));

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
    if (!reveal) return { duration: 0 };
    const veil = node.querySelector('.veil');
    if (veil) veilHandoff(veil);
    const quick = motion.still;
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
    if (coop) {
      // Who struck it; at the reveal, who cleared the depth on the right one.
      const ids = [struckAt.get(index)?.by, index === reveal?.correctIndex ? reveal?.winnerId : null].filter((id): id is string => !!id);
      return ids.map((pid) => s.players.find((p) => p.id === pid)).filter((p) => !!p);
    }
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
    if (coop) return struckAt.has(index);
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
    const picked = race ? q.misses.some((m) => m.index === index) : coop ? struckAt.has(index) : index === reveal?.chosenIndex;
    return !!reveal && picked && !!q.options[index] && isFake(q.options[index]);
  }

  /** The made-up name the player whose turn it was (or, in a race, you) fell for. */
  const fellFor = $derived.by(() => {
    const index = race ? myMiss?.index : coop ? struckList.find((x) => fake(x.index))?.index : reveal?.chosenIndex;
    return index != null && fake(index) ? optionName(index) : null;
  });

  /** Delve together: who struck an option ("you" or a name). */
  const struckBy = (index: number) => {
    const by = struckAt.get(index)?.by;
    return by ? (by === me ? 'you' : nameOf(by)) : '';
  };

  function optionName(index: number) {
    return q.labels[index] ?? (q.options[index] ? engine.byId.get(q.options[index])?.name : undefined) ?? '';
  }

  // ---- effects ----

  /** Answer buttons (or picture tiles), by option index. */
  let optionEls = $state<HTMLElement[]>([]);
  // Phones: the lower of your pick and the right answer, so the docked result row covers neither.
  const keepInView = $derived(
    reveal ? optionEls[Math.max(reveal.correctIndex, (race ? myMiss?.index : coop ? null : reveal.chosenIndex) ?? -1)] : null,
  );
  /** The art stage (name questions) or the picture grid (art questions). */
  let artEl = $state<HTMLElement | null>(null);
  /** How large the plate's ends are drawn (NamePlate's `fit`), for the name to keep clear of them. */
  let plateScale = $state<number>();
  let verdictEl = $state<HTMLElement | null>(null);
  let charge: Handle | null = null;
  /** The scorer's streak of correct answers, for the result line. */
  // From the reveal itself (the host has already counted this answer into
  // the scorer's streak), so the chip renders once, already saying it.
  // Taken once as the reveal arrives (before the DOM shows it) and kept to
  // the next question, whoever comes or goes meanwhile.
  let streakAt = $state<{ at: number; by: string | null; n: number }>({ at: 0, by: null, n: 0 });
  $effect.pre(() => {
    const r = reveal;
    if (!r || untrack(() => streakAt.at) === q.askedAt) return;
    const by = race || coop ? (r.winnerId ?? null) : r.correct ? active.id : null;
    streakAt = { at: q.askedAt, by, n: by ? streakOf(untrack(() => s.players).find((p) => p.id === by)) : 0 };
  });
  const streakBy = $derived(reveal && streakAt.at === q.askedAt ? streakAt.by : null);
  const streak = $derived(reveal && streakAt.at === q.askedAt ? streakAt.n : 0);
  /**
   * The streak is told in the verdict's chip when the chip speaks for its
   * owner: the turn's answer (turns, Delve alone), or your own win in a race
   * or together. Someone else's streak (a race won by another, a teammate's
   * find) is said in the sentence about them.
   */
  const streakInChip = $derived(streak >= 2 && verdict?.tone === 'good' && ((!race && !coop) || (!!me && streakBy === me)));
  /**
   * From the fire's first tier (lib/fx/streaks: three in a row), the chip
   * says the streak instead of its word and burns as the scorer's entry on
   * the scoreboard does, at the same heat and in the same colours.
   */
  const chipHeat = $derived(streakInChip ? heatOf(streak, !!s.delve) : 0);
  const chipBlue = $derived(chipHeat > 0 && burnsBlue(chipHeat, !!s.delve));

  /**
   * Svelte action: the streak chip catches fire as it lands (the chip comes
   * in over 0.55 s) and burns while the reveal lasts. With the effects off
   * the count's own glow says the tier.
   */
  /** The question whose chip has caught fire: moved (the phone's dock coming or going), it burns on without catching again. */
  let caughtAt = 0;
  function chipFire(node: HTMLElement, o: { heat: number; blue: boolean }) {
    let fire: Handle | null = null;
    let t: ReturnType<typeof setTimeout> | null = null;
    let lit = { heat: 0, blue: false };
    const set = (n: { heat: number; blue: boolean }) => {
      if (n.heat === lit.heat && n.blue === lit.blue) return;
      lit = n;
      if (t) clearTimeout(t);
      fire?.stop(0.3);
      fire = null;
      // (The streak is known a moment after the chip is: it lands with it.)
      if (n.heat <= 0) return;
      const catching = caughtAt !== q.askedAt;
      caughtAt = q.askedAt;
      t = setTimeout(() => (fire = ablaze(node, n.heat, n.blue, undefined, catching)), motion.still || !catching ? 0 : 600);
    };
    set(o);
    return {
      update: set,
      destroy() {
        if (t) clearTimeout(t);
        fire?.stop(0.3);
      },
    };
  }

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
    if (reveal || chosen === null || myMiss || myStruck) {
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

  // Delve together: a puff of red on each option struck as it is (yours jars
  // the view). Your pick is settled once it is struck, or once another's
  // strike of the same option got there first (yours is then dropped).
  let struckSeen = untrack(() => (q.struck ?? []).length);
  $effect(() => {
    const list = struckList;
    if (list.length > struckSeen) {
      for (const x of list.slice(struckSeen)) {
        const el = optionEls[x.index];
        // Your own, a ward took: it swells blue at the edges as it does (Scoreboard.svelte), not red.
        if (el) raceMiss(el, x.by === me, x.lives === 0 && x.wards > 0);
      }
      struckSeen = list.length;
    }
    if (chosen !== null && (myStruck || struckAt.has(chosen))) chosen = null;
  });

  // The reveal: choreographed once, after the DOM shows it.
  let revealed = false;
  $effect(() => {
    const r = reveal;
    if (!r || revealed) return;
    revealed = true;
    untrack(() => {
      const scorer = streakBy;
      const pill = scorer ? scoreRowOf(scorer) : null;
      // The scorer's bar, before and after this point (the state already counts it).
      // Delve has no score to fill.
      const now = scorer && !s.delve ? s.players.find((p) => p.id === scorer)?.score : undefined;
      const target = s.settings.targetScore;
      const frac = (v: number) => Math.min(1, Math.max(0, v / target));
      const fill = now === undefined ? undefined : { from: frac(now - 1), to: frac(now) };
      revealFx({
        answer: optionEls[r.correctIndex],
        chosen: !race && !coop && !r.correct && r.chosenIndex != null ? optionEls[r.chosenIndex] : null,
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
        // Your ward takes the loss: it swells blue at the edges as it does (Scoreboard.svelte), not red.
        warded: coop ? (r.hits ?? []).some((h) => h.playerId === me && h.lives === 0 && h.wards > 0) : !!s.delve && !!r.warded,
      });
      // Your point streaming into the bar. Without effects the bar just jumps, and 'correct' says it all.
      if (iWon && pill && fill && fxActive()) setTimeout(() => sfx('fill'), FILL_START * 1000 - FILL_LEAD);
    });
  });

  /** Frees the options should the host's word on an answer never come. */
  let fallback: ReturnType<typeof setTimeout> | undefined;
  function answer(index: number) {
    if (!mine || reveal || chosen !== null || waiting || struckAt.has(index)) return;
    // Time's up: the host only waits a moment longer for answers already on their way.
    if (q.deadline && session.hostNow() > q.deadline) return;
    chosen = index;
    charge?.stop();
    if (optionEls[index]) charge = answerCharging(optionEls[index]);
    sfx('select');
    session.dispatch({ type: 'answer', index, askedAt: q.askedAt });
    // Only the latest answer's: one turned down and given again stays on its way.
    clearTimeout(fallback);
    fallback = setTimeout(() => {
      if (!session.state?.reveal) chosen = null;
    }, 2500);
  }

  function next() {
    sfx('click');
    session.dispatch({ type: 'next' });
  }

  /** The question this view shows (Game.svelte keys it on askedAt). */
  const shownAt = untrack(() => session.state?.question?.askedAt);
  function onKey(e: KeyboardEvent) {
    // A view fading out (the next question or the cards came) hears keys no more,
    // and must not read its deriveds, which have gone inert.
    const now = session.state;
    if (!now || (now.phase !== 'question' && now.phase !== 'reveal') || now.question?.askedAt !== shownAt) return;
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
    if (coop) {
      if (reveal && index === reveal.correctIndex) return 'right';
      if (struckAt.has(index)) return 'wrong';
      if (reveal) return 'dim';
      return chosen === index ? 'pending' : '';
    }
    if (myMiss?.index === index) return 'wrong';
    if (!reveal) return chosen === index ? 'pending' : '';
    if (index === reveal.correctIndex) return 'right';
    if (index === reveal.chosenIndex) return 'wrong';
    return 'dim';
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- The verdict at the reveal: it leads the result line, in the row under the answers. -->
{#snippet verdictBadge()}
  {#if verdict}
    <div class="verdict {verdict.tone}" bind:this={verdictEl} use:chipFire={{ heat: chipHeat, blue: chipBlue }}>
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
      {#if chipHeat > 0}
        <!-- The streak instead of the word, in the fire's colour. -->
        <span class="word count" class:blue={chipBlue} style:--heat={chipHeat.toFixed(3)}><b>{streak}</b> in a row</span>
      {:else}
        <span class="word">{verdict.word}</span>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet mirrorLine()}
  <span class="mirrored" in:fade={{ duration: 300, delay: 250 }}>Mirrored</span>
{/snippet}

{#snippet who(index: number)}
  {@const ps = markers(index)}
  <!-- A long stack would run over the answer: past five, four and a count. -->
  <!-- (Two, or one and a count, in a half-width answer or a short window's picture.) -->
  {@const cap = (long && sideBySide.current) || (short.current && q.mode === 'art') ? 2 : 5}
  {@const faces = ps.length > cap ? ps.slice(0, cap - 1) : ps}
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

<!-- A streak the chip doesn't tell (two in a row, or someone else's): said at the sentence's end. -->
{#snippet streakWords()}
  {#if streak >= 2 && !(chipHeat > 0)}<span class="streak-words">{' '}{streak} in a row.</span>{/if}
{/snippet}

{#snippet footer()}
  {#if reveal}
    <!-- The verdict lands at once (its own entrance, and the glint the reveal
         aims at it); the sentence and Next follow. -->
    <div class="result">
      {@render verdictBadge()}
      <p in:fly={{ y: 16, duration: 400, delay: 250 }}>
        {#if race}
          {#if winner}
            <b class="good">+1</b> {winner.id === me ? 'You were' : `${winner.name} was`} fastest!
            {@render streakWords()}
          {:else if reveal.timedOut}
            Time's up; nobody got it.
          {:else}
            Nobody got it.
          {/if}
          {#if q.misses.length}
            <span class="minus" title={losers.join(', ')}>−1 {losersShort}</span>
          {/if}
        {:else if coop}
          <!-- The team's result: who cleared it (and what a find gave them), then what it cost whom. -->
          {@const lines = coopRevealText({
            depth: s.round,
            winner: reveal.winnerId,
            timedOut: reveal.timedOut,
            caveIn: !!reveal.caveIn,
            hits: reveal.hits ?? [],
            // Null for one who has left since (their wrong pick still struck): nothing is said of them.
            left: (id) => (s.players.some((p) => p.id === id) ? livesOf(s, id) : null),
            nameOf,
            me,
            gain:
              reveal.correct && reveal.gained && gainerId
                ? { kind: reveal.gained, by: gainerId, forged: !!reveal.forged, slow: q.find === 'azurite' && reveal.gained === 'shards' }
                : undefined,
          })}
          {@const hits = (reveal.hits ?? []).filter((h) => s.players.some((p) => p.id === h.playerId))}
          {#if gainLine}
            <span class="found-glyph" aria-hidden="true"><ItemGlyph kind={gainLine.glyph} /></span>
          {:else if hits.some((h) => h.lives > 0)}
            <span class="lost-vial" class:last={hits.some((h) => h.lives > 0 && livesOf(s, h.playerId) <= 1)} aria-hidden="true"
              ><span class="glass"><span class="essence"></span></span><svg viewBox="0 0 24 10"
                ><path class="rim" d="M0.6 0.6H18.6L23.3 5 18.6 9.4H0.6Z" /><path class="hair" d="M2.2 2H17.9L21.4 5 17.9 8H2.2Z" /></svg
              ></span
            >
          {:else if hits.some((h) => h.wards > 0)}
            <span class="lost-ward" aria-hidden="true"
              ><span class="piece l"><ItemGlyph kind="ward" piece="left" /></span><span class="piece r"><ItemGlyph kind="ward" piece="right" /></span></span
            >
          {/if}
          <!-- Who cleared it, and what a find gave, in one sentence. -->
          {lines[0]}
          {@render streakWords()}
          {#if lines.length > 1}<span class="losses">{lines.slice(1).join(' ')}</span>{/if}
        {:else if s.delve}
          {@const you = delveYou}
          {@const who = you ? 'You' : active.name}
          {@const whom = you ? 'you' : active.name}
          {@const left = livesOf(s, active.id)}
          {#if reveal.correct}
            {#if gainLine}
              <!-- What the find earned, beside its engraving. -->
              <span class="found-glyph" aria-hidden="true"><ItemGlyph kind={gainLine.glyph} /></span>{gainLine.text}
            {:else}
              {who} {you ? 'delve' : 'delves'} on.
            {/if}
            {@render streakWords()}
          {:else if reveal.caveIn && reveal.lost && !fallsNow}
            <!-- An Azurite Vein caved in for two losses: the wards that broke, and the lives that went. -->
            {#if reveal.lost.wards}
              <span class="lost-ward" aria-hidden="true"
                ><span class="piece l"><ItemGlyph kind="ward" piece="left" /></span><span class="piece r"><ItemGlyph kind="ward" piece="right" /></span></span
              >
            {/if}
            {#if reveal.lost.lives}
              <span class="lost-vial" class:last={left <= 1} aria-hidden="true"
                ><span class="glass"><span class="essence"></span></span><svg viewBox="0 0 24 10"
                  ><path class="rim" d="M0.6 0.6H18.6L23.3 5 18.6 9.4H0.6Z" /><path class="hair" d="M2.2 2H17.9L21.4 5 17.9 8H2.2Z" /></svg
                ></span
              >
            {/if}
            {#if reveal.timedOut}The darkness took {whom}.{/if}
            The vein caves in{you ? '' : ` on ${active.name}`}.
            {#if reveal.lost.wards >= 2}
              <span class="held">{wardText(you ? 'your' : `${active.name}'s`, 2)}</span>
            {:else if reveal.lost.wards === 1}
              {who} {you ? 'lose' : 'loses'} a ward and a life.
            {:else}
              {who} {you ? 'lose' : 'loses'} two lives.
            {/if}
          {:else if reveal.warded}
            <!-- The ward that took the loss: a crystal splitting along its crack. -->
            <span class="lost-ward" aria-hidden="true"
              ><span class="piece l"><ItemGlyph kind="ward" piece="left" /></span><span class="piece r"><ItemGlyph kind="ward" piece="right" /></span></span
            >
            {#if reveal.timedOut}The darkness took {whom}.{/if}
            <span class="held">{wardText(you ? 'your' : `${active.name}'s`)}</span>
          {:else}
            <!-- The life that went: a chamber of the phial, its light pouring out of the tip. -->
            <span class="lost-vial" class:last={left <= 1} aria-hidden="true"
              ><span class="glass"><span class="essence"></span></span><svg viewBox="0 0 24 10"
                ><path class="rim" d="M0.6 0.6H18.6L23.3 5 18.6 9.4H0.6Z" /><path class="hair" d="M2.2 2H17.9L21.4 5 17.9 8H2.2Z" /></svg
              ></span
            >
            {#if fallsNow && reveal.timedOut}
              The darkness took {whom} for good.
            {:else if fallsNow}
              {who} {you ? 'perish' : 'perishes'}.
            {:else if reveal.timedOut}
              The darkness took {whom}.
            {:else}
              {who} {you ? 'lose' : 'loses'} a life.
            {/if}
          {/if}
          <!-- A Dynamite Cache missed: what its blast destroyed of the pack (the phial shows it go). -->
          {#if !reveal.correct && reveal.blown}{blownText(reveal.blown, you ? 'your' : `${active.name}'s`)}{/if}
        {:else if reveal.correct}
          <b class="good">+1</b> for {active.name}!
          {@render streakWords()}
        {:else if reveal.timedOut}
          {active.name} ran out of time.
        {:else}
          No point for {active.name}{fellFor ? ';' : '.'}
        {/if}
        {#if fellFor}{fellFor} isn't a real item.{/if}
      </p>
      <button
        in:fly={{ y: 16, duration: 400, delay: 250 }}
        class="btn"
        class:primary={canNext}
        data-cursor="next"
        data-sfx="none"
        disabled={!canNext}
        title={canNext ? undefined : race ? 'The host moves the race on' : coop ? 'The team moves the run on' : `${active.name} or the host moves on`}
        onclick={next}
      >
        {race ? 'Next question' : coop ? 'Next depth' : 'Next turn'}
        {#if session.mode !== 'local'}
          <span class="auto" style:transform="scaleX({autoLeft})"></span>
        {/if}
      </button>
    </div>
  {:else if blastSlot}
    <!-- Delve: dynamite at hand. The button stands at the row's end, where
         Next will stand. -->
    <div class="result blasting">
      <div class="hint">{@render openHint()}</div>
      <button
        class="btn blast"
        class:gone={!canBlast}
        class:out={!mine}
        data-sfx="none"
        disabled={!canBlast}
        aria-hidden={!canBlast}
        tabindex={canBlast ? undefined : -1}
        aria-label="Detonate: use dynamite to blast this question away and get a new one at this depth.{fuse !== null ? ' The fuse is already burning.' : ''}"
        onclick={blastThrough}
      >
        <span class="stick" aria-hidden="true"><ItemGlyph kind="dynamite" /></span>
        Detonate
        {#if fuse !== null}
          <!-- The fuse over the clock's last seconds: it burns down to 0 as Next's bar does, and the dynamite goes off. -->
          <span class="auto fuse" style:transform="scaleX({fuse})"></span>
        {/if}
      </button>
    </div>
  {:else}
    {@render openHint()}
  {/if}
{/snippet}

<!-- What there is to know while the question is open, under the answers. -->
{#snippet openHint()}
  <!-- One block: the footer row's first item, which takes the room Detonate leaves. -->
  <div>
    {#if coop}
      <!-- What befell the team on this question, over the line below: read out as it comes. -->
      <div class="news" aria-live="polite">
        {#if perishedLine}<p class="spectate out" transition:slide={{ duration: 250 }}>{perishedLine}</p>{/if}
        {#if flareLine}
          <p class="spectate flare-line" transition:slide={{ duration: 250 }}><span class="found-glyph" aria-hidden="true"><ItemGlyph kind="flare" /></span>{flareLine}</p>
        {/if}
      </div>
    {/if}
    {#if coop && myStruck && me}
      {@const others = waitingIds(s).filter((id) => id !== me)}
      <p class="spectate out">
        {coopMissText(myStruck, livesOf(s, me), myStruck.lives + myStruck.wards > 1)}
        {#if others.length}<span class="still">Still answering: {namesOf(others, nameOf, me)}.</span>{/if}
      </p>
    {:else if fuse !== null}
      <!-- Delve: the clock's last seconds, with dynamite to go off at 0 (its bar burns down on Detonate). -->
      <p class="spectate blast-line" in:fade={{ duration: 200 }}>
        <span class="found-glyph" aria-hidden="true"><ItemGlyph kind="dynamite" /></span>The fuse on {fuseOwner} dynamite is burning.
      </p>
    {:else if blastLine}
      <p class="spectate blast-line" in:fade={{ duration: 300, delay: 300 }}><span class="found-glyph" aria-hidden="true"><ItemGlyph kind="dynamite" /></span>{blastLine}</p>
    {:else if session.spectating}
      <p class="spectate muted">{session.justWatching ? "You're watching." : "You're watching. You'll play in the next game."}</p>
    {:else if coop && !mine}
      <p class="spectate muted">Your team is answering…</p>
    {:else if coop}
      <p class="spectate muted">
        The first right answer clears it; a wrong one costs a life.<span class="keys">{' '}Press 1–{count === 10 ? '9 and 0' : count}.</span>
      </p>
    {:else if race && myMiss}
      <p class="spectate out">Wrong: −1. You're out until the next question.</p>
    {:else if race}
      <p class="spectate muted">First right answer wins. A wrong one costs a point!<span class="keys">{' '}Press 1–{count === 10 ? '9 and 0' : count}.</span></p>
    {:else if !mine}
      <!-- Who is answering is said under the banner. -->
    {:else}
      <p class="spectate muted keys">Tip: press 1–{count === 10 ? '9 and 0' : count} to answer.</p>
    {/if}
  </div>
{/snippet}

<div class="question">
  <!-- The turn's second line, under its banner, where the cards screen asks
       for a category (ChooseCategory's prompt): what to do now, and at its
       right end the timer, read with the question at a glance before the
       eyes go down to the answers. The category is the tooltip's base line;
       at the reveal the verdict is in the row under the answers. -->
  <div class="task" class:snug class:timed={!!timer && clocked}>
    <p class="task-text">
      <!-- Said to whoever can't answer as what is going on, and so it holds through the reveal. -->
      {#if !race && !coop && !session.myTurn}
        {active.name} <span class="muted">{q.mode === 'art' ? 'picks the art that matches the name' : 'names this item'}</span>
      {:else if coop && !canAnswer}
        <span class="muted">{session.spectating ? 'The team' : 'Your team'} {q.mode === 'art' ? 'picks the art that matches the name' : 'names this item'}</span>
      {:else if race && session.spectating}
        <span class="muted">The racers {q.mode === 'art' ? 'pick the art that matches the name' : 'name this item'}</span>
      {:else}
        {q.mode === 'art' ? 'Pick the art that matches the name' : 'Name this item'}
      {/if}
    </p>
    <!-- Mounted once for the whole question, so a branch changing never
         restarts it; at the reveal it stays, stopped and dimmed, saying how
         much time was left. -->
    {#if timer && clocked}<div class="clock" class:done={!!reveal}>{@render timer()}</div>{/if}
  </div>

  <!-- Delve: until the clock runs (waiting), the question keeps its shape but shows nothing to read. -->
  {#if q.mode === 'art'}
    <!-- Name given, pick the matching art. -->
    <div class="tooltip wide" use:backdropShadow={{ fill: 'linear' }} class:good={reveal && iWon} class:bad={reveal && !iWon}>
      <div class="head" style:--plate-scale={plateScale}>
        <NamePlate fit bind:scale={plateScale} />
        <div class="head-text">
          <span class="iname" class:veiled={waiting} use:oneLine>{waiting || !q.prompt ? '\u00a0' : q.prompt}</span>
          <!-- Name over base, as every tooltip: the category until the reveal names the base. -->
          {#if reveal && item}
            <span class="ibase" in:fade>{item.base}</span>
          {:else}
            <span class="ibase">{questionTopic(q, true)}</span>
          {/if}
        </div>
      </div>
      <div
        class="tiles"
        bind:this={artEl}
        class:theirs
        class:many={count > 4}
        class:six={count === 6}
        class:ten={count === 10}
        class:snug
        class:tall={tallArt}
        class:armed={blastSlot}
        style:--n={count}
        style:--rows={Math.ceil(count / (count === 6 ? 3 : count === 10 ? 5 : 4))}
      >
        {#each q.labels as _, i (i)}
          {@const st = optionState(i)}
          {@const known = !!reveal && !!q.options[i]}
          {@const option = known ? engine.byId.get(q.options[i]) : undefined}
          {@const pic = option ? { url: itemImage(option.id), w: option.w, h: option.h } : waiting ? undefined : media?.options[i]}
          <!-- Delve: a veiled picture burns in patch by patch, until the reveal names it. -->
          {@const tv = !pic && !waiting ? media?.tileVeils[i] : undefined}
          <button
            class="tile {st}"
            data-cursor="opt:{i}"
            data-sfx="none"
            data-fx="hover"
            bind:this={optionEls[i]}
            class:mine
            class:struck={struckAt.has(i)}
            aria-label={struckAt.has(i) ? `Option ${i + 1}, crossed out: ${struckBy(i)} picked it and it's wrong` : undefined}
            disabled={!mine || !!reveal || chosen !== null || waiting || struckAt.has(i)}
            onclick={() => answer(i)}
            onpointermove={glare}
            in:scale={{ start: 0.85, duration: 450, delay: 250 + i * 80 }}
          >
            <span class="sheen"></span>
            <span class="key">{(i + 1) % 10}</span>
            <span class="cue" aria-hidden="true"></span>
            {#if pic || tv}
              <span class="pic">
                {#if pic}
                  <!-- Named pictures switch to the original art, so a mirrored one turns round. -->
                  <ArtImage src={pic.url} w={pic.w} h={pic.h} alt="Option {i + 1}" scale={1.6} unflip={mirrored(i) && !!q.options[i]} />
                {:else if tv}
                  {@const ps = tilePatches(i)}
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
                            w: p.w,
                            h: p.h,
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
                {/if}
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
    <div class="stage" class:snug class:ten={count === 10} class:long class:armed={blastSlot}>
      <div class="tooltip" use:backdropShadow={{ fill: 'linear' }} class:good={reveal && iWon} class:bad={reveal && !iWon}>
        <div class="head" style:--plate-scale={plateScale}>
          <!-- The gems stay dark until the item is identified. -->
          <NamePlate fit bind:scale={plateScale} lit={!!(reveal && item)} />
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
        <div class="art" data-cursor="art" bind:this={artEl} use:backdropShadow={{ fill: 'stage' }}>
          <ArcaneCircle state={reveal ? (iWon ? 'good' : 'bad') : 'idle'} />
          <div class="frame">
            {#if showFull && item}
              <ArtImage src={itemImage(item.id)} alt={item.name} w={item.w} h={item.h} float unflip={mirrored(0)} />
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
                      w: p.w,
                      h: p.h,
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

      <div class="options" class:theirs class:compact={count > 6} class:dense={count > 8} class:ten={count === 10} class:snug class:long>
        {#each q.labels as label, i (i)}
          {@const st = optionState(i)}
          <button
            class="option {st}"
            data-cursor="opt:{i}"
            data-sfx="none"
            data-fx="hover"
            bind:this={optionEls[i]}
            use:backdropShadow={{ fill: 'linear' }}
            class:mine
            class:fake={fake(i)}
            class:struck={struckAt.has(i)}
            title={fake(i) ? 'Not a real item' : struckAt.has(i) ? `Wrong: ${struckBy(i)} picked it` : undefined}
            disabled={!mine || !!reveal || chosen !== null || waiting || struckAt.has(i)}
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
    {#if (reveal || blastSlot) && phone.current}
      <!-- Phones: the result and Next button stay at the bottom of the screen, in
           reach of a thumb, however far down the answers have been scrolled; so
           does Detonate (and its fuse) from when dynamite is at hand, where
           Next will stand; it keeps its place to the question's end, as the
           row does on wider screens (struck out, or the stick used, the
           button goes and the bar stays, so nothing under it moves). A new dock at the reveal, so it lifts the answers to keep
           in view above itself. -->
      {#key !!reveal}
        <div class="dock" use:portal use:dock={keepInView} in:fade={{ duration: 200 }} out:fade|global={{ duration: 180 }}>
          {@render footer()}
        </div>
      {/key}
    {:else}
      {@render footer()}
    {/if}
  </div>
  <!-- The verdict, read out as it lands. -->
  <p class="sr" aria-live="polite">{verdict ? (chipHeat > 0 ? `${verdict.word}, ${streak} in a row` : verdict.word) : ''}</p>
</div>

<style>
  .question {
    width: min(980px, 100%);
    margin: 0 auto;
  }
  /* The turn's second line, under the banner: the same line, size and gap
     as the cards screen's prompt (ChooseCategory), so going from the cards
     to the question only changes its words. */
  .task {
    position: relative;
    margin: 0 0 1.6rem;
    text-align: center;
  }
  .task-text {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.45;
  }
  /* Room kept either side for the timer at the right end, so a long line
     (a long name picking the art) wraps short of it and stays centred. */
  .task.timed .task-text {
    padding-inline: 60px;
  }
  /* The timer at the line's right end, over the answers' column's edge,
     centred on the line (it is taller than the line: it reaches into the
     margins round it, so the line keeps its height). */
  .clock {
    position: absolute;
    right: 0;
    top: 50%;
    translate: 0 -50%;
    display: grid;
    place-items: center;
    transition: opacity 0.4s;
  }
  /* (Through .task, to outweigh TimerRing's own size whatever the bundle's order.) */
  .task .clock :global(.timer) {
    width: 52px;
    height: 52px;
  }
  .task .clock :global(.timer span) {
    font-size: 1.15rem;
  }
  /* Answered: stopped, and set back behind the verdict. */
  .clock.done {
    opacity: 0.5;
    pointer-events: none;
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
  /* Two lines, before and at the reveal alike: the name, then the base type
     with the Mirrored line beside it, so the plate's name never moves. */
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: baseline;
    column-gap: 0.6em;
    line-height: 1.15;
  }
  .head-text .iname {
    flex-basis: 100%;
    text-align: center;
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
  /* The base type, and before the reveal the category: the only place the category is said. */
  .ibase {
    font-family: var(--font-display);
    font-size: 0.95rem;
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

  /* Delve: what a find earned, its engraving standing on the line's baseline. */
  .found-glyph {
    display: inline-block;
    vertical-align: -0.12em;
    margin-right: 0.4em;
    --h: 0.95em;
  }
  .found-glyph :global(.glyph) {
    animation: found-in 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.25) 0.6s both;
    transform-origin: 50% 100%;
  }
  @keyframes found-in {
    from {
      opacity: 0;
      transform: scale(0.2);
    }
  }
  /* Delve: what a ward took in place of a life, in its cold light. */
  .held {
    color: #c4dcff;
    text-shadow: 0 0 12px rgba(90, 150, 255, 0.45);
  }
  /* Delve: the ward that took a loss, splitting as the line comes in. */
  .lost-ward {
    position: relative;
    display: inline-block;
    vertical-align: -0.12em;
    width: 0.65em;
    height: 0.95em;
    margin-right: 0.45em;
    --h: 0.95em;
  }
  .lost-ward .piece {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 50% 90%;
  }
  .lost-ward .l {
    animation: ward-split-l 0.6s cubic-bezier(0.3, 0, 0.6, 1) 0.7s both;
  }
  .lost-ward .r {
    animation: ward-split-r 0.6s cubic-bezier(0.3, 0, 0.6, 1) 0.7s both;
  }
  @keyframes ward-split-l {
    to {
      opacity: 0.55;
      transform: translate(-0.12em, 0.05em) rotate(-14deg);
    }
  }
  @keyframes ward-split-r {
    to {
      opacity: 0.55;
      transform: translate(0.12em, 0.06em) rotate(11deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .found-glyph :global(.glyph) {
      animation: none;
    }
    .lost-ward .piece {
      animation-duration: 0s;
      animation-delay: 0s;
    }
  }

  /* ---- Delve: dynamite ---- */
  .blast-line {
    color: #eebf96;
  }
  /* Its engraving comes with the line, not after the reveal's pause: the
     fuse's line has under two seconds to be read. */
  .blast-line .found-glyph :global(.glyph) {
    animation-delay: 0s;
  }

  /* Delve together: what befell the team, a line each over the usual one. */
  .news > p {
    padding-bottom: 0.35rem;
  }
  /* A flare's line, in the warm light of its count in the phial. */
  .flare-line {
    color: #f6cf98;
  }
  /* Dynamite at hand: what there is to know, and the button at the row's end
     (where Next will stand). The row keeps the footer's height, so the button
     coming and going moves nothing; gone, it keeps its place unseen. */
  .blasting .hint {
    flex: 1;
    min-width: 0;
  }
  /* The line as it reads without the button (not the result's larger type), set left as the result's is. */
  .blasting .hint .spectate {
    text-align: left;
    font-size: inherit;
  }
  /* Detonate: an ordinary action (Next's body, shape and type), in dynamite's
     tan, the colour its finds and the line it leaves are written in. */
  .btn.blast {
    color: #eebf96;
    border-color: rgba(238, 191, 150, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 226, 196, 0.16),
      inset 0 0 0 1px rgba(0, 0, 0, 0.35),
      inset 0 -10px 16px -8px rgba(0, 0, 0, 0.55),
      0 0 14px rgba(238, 191, 150, 0.12),
      0 2px 10px rgba(0, 0, 0, 0.5);
    transition:
      opacity 0.25s,
      transform 0.18s var(--ease-out),
      box-shadow 0.25s,
      border-color 0.25s,
      color 0.25s,
      text-shadow 0.25s;
  }
  .btn.blast:hover:not(:disabled) {
    color: #fbe3cc;
    border-color: rgba(246, 214, 186, 0.85);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.7),
      0 0 12px rgba(238, 191, 150, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 232, 210, 0.24),
      inset 0 0 0 1px rgba(0, 0, 0, 0.35),
      inset 0 -10px 16px -8px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(238, 191, 150, 0.14),
      0 0 20px rgba(238, 191, 150, 0.28),
      0 2px 10px rgba(0, 0, 0, 0.5);
  }
  .btn.blast.gone {
    visibility: hidden;
    opacity: 0;
  }
  .btn.blast .stick {
    display: inline-block;
    --h: 1.05em;
  }
  /* The fuse burning down: Next's bar, in the same tan. */
  .btn.blast .fuse {
    background: #f4d2b2;
    box-shadow: 0 0 6px rgba(238, 191, 150, 0.6);
  }

  /* Delve: the words come in once the clock runs. */
  .text,
  .iname {
    transition:
      opacity 0.2s,
      filter 0.4s;
  }
  .veiled {
    opacity: 0;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  /* The verdict at the reveal: a dark chip in the display type, small
     capitals and tracking, pill shaped. Its colour lives in its icon: a lit
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
  /* As tall as the line, so the chip is no taller than its word. */
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
  /* Someone else's answers: not this player's to click. */
  .option:not(.mine) {
    cursor: not-allowed;
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
  /* There the name is the question: the plate's name as large as it fits. */
  .tooltip.wide .iname {
    font-size: 1.75rem;
    line-height: 1.05;
  }
  /* The plate grows with it, keeping the tooltip's room above and below its
     lines (a little more below: the base line's descenders sit low). Its
     frame is drawn for a 64px plate, so its ends grow with it (NamePlate's
     `fit`: 76 / 64 here), keeping the rules on the plate's edges; the name
     keeps clear of the larger ends, and shrinks to stay on one line (oneLine). */
  .tooltip.wide .head {
    height: 76px;
    padding-bottom: 4px;
    padding-inline: 4rem;
  }
  @media (max-width: 640px) {
    .tooltip.wide .iname {
      font-size: 1.35rem;
    }
    /* (On the phone's plate, as tall as its lines, the same room round them;
       a name that wraps even at its least makes the plate, and so its ends,
       larger, and keeps clear of them, as the name question's plate does.) */
    .tooltip.wide .head {
      height: auto;
      min-height: 62px;
      padding-bottom: calc(0.3rem + 3px);
      padding-inline: max(4rem, min(5.2rem, calc(var(--plate-scale, 0) * 3.45rem)));
    }
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
    /* (Its layers' colours in properties, so a turn not yours can put the light out; see .theirs.) */
    --tile-warm: rgba(175, 96, 37, 0.14);
    --tile-cool: rgba(90, 110, 160, 0.09);
    --tile-top: #0c0d12;
    --tile-bottom: #060709;
    background:
      radial-gradient(ellipse 60% 50% at 50% 45%, var(--tile-warm), transparent 70%),
      radial-gradient(ellipse 90% 40% at 50% 0%, var(--tile-cool), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.5) 100%),
      linear-gradient(180deg, var(--tile-top), var(--tile-bottom));
    cursor: default;
    isolation: isolate;
    transition:
      background 0.3s,
      border-color 0.3s,
      opacity 0.4s,
      box-shadow 0.3s;
  }
  /* A row's height (short windows work it out from the window, below). */
  .tiles.many {
    --tile-h: 200px;
  }
  .tiles.many .tile {
    height: var(--tile-h);
  }
  .pic {
    position: relative;
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
  .tile:not(.mine) {
    cursor: not-allowed;
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
  /* The name at the reveal, laid over the foot of its tile on a shade, so
     the picture keeps its size (in the flow it pushed the art up and smaller
     at the very moment the answer is looked at). */
  .caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 1.4rem 0.4rem 0.45rem;
    background: linear-gradient(180deg, transparent, rgba(6, 5, 4, 0.9) 50%);
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
  /* The row under the answers: what there is to say (a tip, Detonate, the
     result and Next). Same height with a tip, a result or nothing, so the
     page doesn't jump at the reveal. */
  .footer {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 52px;
    margin-top: 1.25rem;
  }
  .footer > :first-child {
    flex: 1;
    min-width: 0;
  }
  /* Read out, not shown: and so the verdict's word in the phone's docked bar,
     where its disc says it (a streak's count stays). */
  .sr,
  .dock .verdict .word:not(.count) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
  /* The +1 (b.good: the verdict badge beside it has a .good of its own). */
  .result b.good {
    font-family: var(--font-display);
    color: #a9cf8f;
    font-size: 1.4rem;
    text-shadow: 0 0 10px rgba(150, 190, 110, 0.35);
  }
  /* A streak of right answers, said by the chip instead of its word: the
     count in the body serif's lining figures (the display face's 11 reads
     as II), in the fire's colours, glowing as hot as the streak burns. The
     fire itself is the scoreboard's (chipFire). */
  .verdict .count {
    color: color-mix(in srgb, #ffbf7a calc(60% + 40% * var(--heat)), var(--gold-hi));
    text-shadow:
      0 0 calc(4px + 14px * var(--heat)) rgba(255, 130, 50, calc(0.3 + 0.7 * var(--heat))),
      0 0 calc(1px + 3px * var(--heat)) rgba(255, 130, 50, calc(0.4 + 0.5 * var(--heat)));
  }
  .verdict .count.blue {
    color: #c6dcff;
    text-shadow:
      0 0 calc(4px + 14px * var(--heat)) rgba(110, 160, 255, calc(0.3 + 0.7 * var(--heat))),
      0 0 calc(1px + 3px * var(--heat)) rgba(110, 160, 255, calc(0.4 + 0.5 * var(--heat)));
  }
  .verdict .count b {
    font-family: var(--font-body);
    font-variant-numeric: lining-nums;
    font-weight: 500;
    font-size: 1.3em;
    letter-spacing: 0;
    line-height: 1;
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
  /* Delve together: what the result cost the team, on a line of its own. */
  .losses {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.95rem;
    font-style: italic;
    color: #e2b8a8;
  }
  .still {
    display: block;
    color: var(--muted);
  }
  /* Struck by a teammate's wrong pick: out of play for everyone, its striker
     beside the ✕. Unlike an answer dynamite blew away (scorched, its words
     gone to soot), it keeps its words, in red. */
  .option.struck:not(.right) .text {
    text-decoration: line-through;
    text-decoration-thickness: 1px;
    text-decoration-color: rgba(234, 179, 163, 0.55);
  }
  .tile.struck:not(.right) .pic {
    filter: saturate(0.4) brightness(0.65);
  }
  /* Someone else's turn (turns mode): the answers greyed and set flat into
     the page, as if pressed in; frames, numbers and places kept, so the list
     lights up where it stands when your turn comes. The rows' grey is in
     their fill properties (the backdrop paints the fill from them; a filter
     on the row would miss it), the words keep reading contrast. */
  .options.theirs .option {
    --bs-fill-a: rgba(17, 16, 15, 0.95);
    --bs-fill-b: rgba(9, 8, 8, 0.95);
    --bs1-color: transparent;
    border-color: #1a1917;
    box-shadow: none;
  }
  /* (Lifted, then greyed and dimmed with the row: the lift clips the gold
     to near white first, so the names come out a pale, quiet grey.) */
  .options.theirs .text {
    filter: brightness(1.9) grayscale(1) sepia(0.25) brightness(0.48);
  }
  .options.theirs .key {
    filter: brightness(1.5) grayscale(1) sepia(0.25) brightness(0.48);
  }
  .theirs .sheen,
  .theirs .cue {
    display: none;
  }
  /* The pictures only a little desaturated, as the cards are, so the items
     stay known; but the warm light behind each goes out (that glow is what
     says "pick me"), and the rest of the tile greys with the rows. */
  .tiles.theirs .tile {
    --tile-warm: transparent;
    --tile-cool: transparent;
    --tile-top: #090807;
    --tile-bottom: #050404;
    border-color: rgba(120, 108, 92, 0.25);
    box-shadow: none;
  }
  .tiles.theirs .tile .pic {
    filter: saturate(0.6) brightness(0.8);
  }
  .tiles.theirs .tile > :not(.pic) {
    filter: grayscale(1) sepia(0.25) brightness(0.48);
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
    .task {
      margin-bottom: 1rem;
    }
    .footer {
      margin-top: 1rem;
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
      /* Solid, not the pinned bars' dark glass: it stands over the answers
         while dynamite is at hand, its fuse the most urgent line there is,
         so nothing may read through it. */
      background-color: rgb(10, 8, 6);
      border-top: var(--pinned-line);
      box-shadow: 0 -8px var(--pinned-shadow);
    }
    .dock .result p {
      font-size: 1rem;
    }
    /* Out of this question (struck out, together), the bar keeps its place
       but not Detonate's: what befell you takes the whole width, so the bar
       grows as little as it can over the answers. */
    .dock .btn.blast.out {
      display: none;
    }
    /* The docked row has the width of a phone: the verdict is its disc alone
       (its word still read out), the sentence beside it says the rest. */
    .dock .verdict {
      padding: 0;
      border: 0;
      background: none;
      font-size: 0.95rem;
    }
    .dock .verdict::after {
      display: none;
    }
    /* A streak keeps its chip: the count is what the row has to say; the
       sentence takes a line of its own under the chip and Next. */
    .dock .result:has(.count) {
      flex-wrap: wrap;
      row-gap: 0.4rem;
    }
    .dock .result:has(.count) p {
      flex: 1 1 100%;
      order: 3;
    }
    .dock .verdict:has(.count) {
      padding: 0.4em calc(1.1em - 0.16em) 0.4em 0.4em;
      border: 1px solid var(--gold-lo);
      background: rgba(0, 0, 0, 0.4);
      font-size: 0.8rem;
    }
    /* Beside the dynamite's button, the line under the answers takes a little less room. */
    .blasting .hint .spectate {
      font-size: 0.95rem;
      line-height: 1.25;
    }
    /* Tighter all round, so less scrolling from the art down to the answers.
       Answers stay 48px tall, a comfortable tap. */
    .task {
      margin-bottom: 0.6rem;
    }
    /* The plate as tall as its two lines; its ends are drawn to its height
       (NamePlate's `fit`: 54 / 64 at least), and the name keeps clear of
       them: a name long enough to wrap makes the plate, and so its ends,
       larger. */
    .head {
      height: auto;
      min-height: 54px;
      /* (At most as for three lines: the room it takes wraps the name further,
         and the plate grows again; past that it would never settle.) */
      padding: 0.3rem max(2.9rem, min(5.2rem, calc(var(--plate-scale, 0) * 3.45rem)));
    }
    .art {
      height: clamp(180px, 32svh, 230px);
    }
    /* With dynamite at hand its bar is docked at the foot: the art gives it
       its room, so the last answer is in view above it. */
    .stage.armed .art {
      height: clamp(120px, 32svh - 90px, 200px);
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
    /* Six pictures, two to a row: the rows take the height there is above
       the result bar, so the art is as large as the phone allows. */
    .tiles.many.six .tile {
      height: clamp(140px, (100svh - 330px) / 3, 190px);
    }
    .tiles.many.six.armed .tile {
      height: clamp(140px, (100svh - 392px) / 3, 190px);
    }
    /* Only a line of text now and then (the reveal's bar is docked). */
    .footer {
      min-height: 0;
      margin-top: 0.75rem;
    }
    /* Delve's eight or ten answers, on a clock down to five seconds: two
       columns of names (a long one takes two lines) and the pictures two to
       a row, sized to the screen, so all of them are in view. Their numbers
       shrink to small seals, so the answers can still be called out by number. */
    /* The art gives way first on a short screen: at 375 × 667 the eighth
       answer still ends above the bottom edge, under the depth's plaque. */
    .stage.snug .art {
      height: clamp(140px, 30svh - 60px, 230px);
    }
    /* With dynamite at hand its bar is docked at the foot: the art gives it its room. */
    .stage.snug.armed .art {
      height: clamp(96px, 30svh - 122px, 230px);
    }
    .options.snug {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.4rem;
    }
    .snug .option {
      min-height: 50px;
      gap: 0.4rem;
      padding: 0.4rem 1.7rem 0.4rem 0.4rem;
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
    /* The pictures two to a row, as six are: an art question has no art
       panel above, so its rows can share the screen's height, and the
       pictures stay large enough to tell apart at the hardest depths. */
    .tiles.snug {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tiles.many.snug .tile {
      height: clamp(96px, (100svh - 330px) / 4, 150px);
      padding: 0.5rem 0.25rem;
    }
    /* With dynamite at hand its bar is docked at the foot: the rows leave it its room. */
    .tiles.many.snug.armed .tile {
      height: clamp(96px, (100svh - 392px) / 4, 150px);
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
    /* Ten answers, from depth 70: a row more of names, so the art, the rows
       and the gaps give a little each (the rows still 44px, a fair tap); the
       pictures two to a row in five rows. */
    .stage.snug.ten .art {
      height: clamp(120px, 30svh - 80px, 230px);
    }
    .stage.snug.ten.armed .art {
      height: clamp(84px, 30svh - 142px, 230px);
    }
    .options.snug.ten {
      gap: 0.3rem;
    }
    .snug.ten .option {
      min-height: 44px;
      padding-top: 0.25rem;
      padding-bottom: 0.25rem;
    }
    .snug.ten .text {
      font-size: 0.94rem;
    }
    .tiles.snug.ten {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tiles.many.snug.ten .tile {
      height: clamp(84px, (100svh - 330px) / 5, 130px);
      padding: 0.4rem 0.2rem;
    }
    .tiles.many.snug.ten.armed .tile {
      height: clamp(84px, (100svh - 392px) / 5, 130px);
    }
  }

  /* Tall art (see tallArt): one row of tall tiles, as high as the rows they
     replace, so a staff is drawn at a size to tell it from the next. */
  /* (Only where each tile keeps about 110px across, for its name at the
     reveal: six from 761px, eight from 900px; never ten, see tallArt.) */
  @media (min-width: 761px) {
    .tiles.many.tall.six {
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    }
    .tiles.many.tall.six .tile {
      height: calc(var(--rows, 2) * var(--tile-h));
      /* The number above the art, not on it. */
      padding-top: 2.4rem;
    }
    .tiles.tall .caption {
      overflow-wrap: anywhere;
    }
  }
  @media (min-width: 900px) {
    .tiles.many.tall {
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    }
    .tiles.many.tall .tile {
      height: calc(var(--rows, 2) * var(--tile-h));
      padding-top: 2.4rem;
    }
  }
  /* Desktop windows a little short of the art's full 200px rows (up to about
     980 tall): the rows share what there is, so the page ends with the window. */
  @media (min-width: 761px) and (min-height: 821px) {
    .tiles.many {
      --tile-h: clamp(150px, (100dvh / var(--stage-zoom, 1) - 537px) / var(--rows, 2), 200px);
    }
  }

  /* A long list (see `long`) in two columns beside the art. */
  @media (min-width: 761px) {
    .options.long {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.6rem;
    }
    .long .option {
      gap: 0.6rem;
      min-height: 52px;
      padding: 0.45rem 1.6rem 0.45rem 0.75rem;
    }
    .long .text {
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    .long .option .mark {
      right: 0.55rem;
    }
    /* No room beside a half-width answer: the stack takes its place in the row (as on phones). */
    .long .option .who-picked {
      position: static;
      flex: none;
      translate: none;
      margin-left: -0.3rem;
    }
    .long .who-picked :global(.avatar) {
      width: 18px;
      height: 18px;
    }
  }

  /* Short desktop windows (13 and 14 inch laptops): the answers a little
     tighter, as the lobby's rows are there, so the last answer and Next stay
     in view. */
  @media (min-width: 761px) and (max-height: 820px) {
    .task {
      margin-bottom: 1rem;
    }
    .art {
      min-height: 240px;
    }
    .options {
      gap: 0.7rem;
    }
    .option {
      padding-top: 0.7rem;
      padding-bottom: 0.7rem;
    }
    /* The pictures: their rows share the height there is. */
    .tiles.many {
      --tile-h: clamp(110px, (100dvh / var(--stage-zoom, 1) - 432px) / var(--rows, 2), 200px);
    }
    .footer {
      margin-top: 0.75rem;
      min-height: 46px;
    }
    /* Two columns free the height a long list took: the art gets it back. */
    .stage.long .art {
      min-height: 300px;
    }
    /* The pictures: their number sits over the art, so the art takes the tile. */
    .tile {
      padding: 0.45rem 0.5rem 0.4rem;
    }
    .task.timed .task-text {
      padding-inline: 54px;
    }
    /* The ring a little smaller, as the line's margins are. */
    .task .clock :global(.timer) {
      width: 46px;
      height: 46px;
    }
    .task .clock :global(.timer span) {
      font-size: 1.05rem;
    }
  }
</style>
