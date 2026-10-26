<script module lang="ts">
  /** How a card turns over as it is dealt: seconds, its lift off the table and swell (px, share), its perspective (px), and the screens it turns across on (stacked as wide rows: narrow screens, but not a phone on its side, too short for three rows; always a phone's width, though, too narrow for three tall cards) rather than sideways. The card bench turns them the same way. */
  /** Whether this browser registers custom properties (@property, app.css): without, the kindle animates the emblem's filter and opacity themselves (see .plain below). */
  const registered = typeof CSS !== 'undefined' && 'registerProperty' in CSS;
  export const TURN = { seconds: 0.46, lift: 16, swell: 0.05, perspective: 1200, across: '(max-width: 560px), (max-width: 700px) and (orientation: portrait), (max-width: 700px) and (min-height: 501px)' };
</script>

<script lang="ts">
  import { cubicInOut, cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { untrack, type Snippet } from 'svelte';
  import { motion } from '../lib/motion.svelte';
  import { engine, session } from '../lib/session.svelte';
  import { categoryCompanions, categoryIcon, categoryIconTweak, categoryIcons } from '../lib/ui';
  import { MAX_H, MAX_W, PAD, WEIGHT, fits, fitStyle, maskOf, measure } from '../lib/iconFit.svelte';
  import { fineMask } from '../lib/fineMask';
  import { activeRules, difficultyOf } from '../lib/game';
  import { FIND_TEXT, deathmatchText, digNote, findNote, lockoutText, namesOf, teamFindNote, teamUnused, unused } from '../lib/difficultyText';
  import { WAY_OUT_CARD as out } from '../lib/wayOut/lantern';
  import { digOf, expectedVoters, holdersOf, inventoryOf, isGroupRun, isIdle, isWayOut, livesOf, standingIds, voteClosesAt, type FindKind } from '../lib/delve';
  import { sfx } from '../lib/sound';
  import { backdropShadow } from '../lib/backdropShadow';
  import { FIND_COLORS, cardHover, cardPicked, cardRevealed, raffleHop, voteCast } from '../lib/fx/moments';
  import { cover, fxActive, fxGroup, onFxChange, type CoverBox, type Handle, type Vec3 } from '../lib/fx/core';
  import { C, embers, emitter, flare, glints, outline, puffs, ring, shards, sparks } from '../lib/fx/effects';
  import { light } from '../lib/lights';
  import CardEngraving from './CardEngraving.svelte';
  import Avatar from './Avatar.svelte';
  import { actionOf, typing } from '../lib/keybinds.svelte';
  import { optionIndex } from '../lib/keys';
  import { keyTap } from '../lib/pointerAnchor';

  let {
    drawn = null,
    ondrawn,
    timer,
  }: {
    /** Delve together: the card the closed vote drew, while the draw plays out on the cards. */
    drawn?: string | null;
    /** Called once the draw has landed and held (Game.svelte then shows the question). */
    ondrawn?: () => void;
    /**
     * A vein's lamp, held still between its strikes, at the prompt's right
     * end, where the question's task line has its clock (QuestionView), so
     * it stays put as the strike takes the cards' place. Not on a phone
     * upright, where the scoreboard's row has it (Game.svelte).
     */
    timer?: Snippet;
  } = $props();

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  /** Who the last round of a deathmatch knocked out, said as the next one starts. */
  const knockedOut = $derived(
    s.deathmatch && !Object.keys(s.deathmatch.results).length ? s.deathmatch.eliminated.map((id) => s.players.find((p) => p.id === id)?.name ?? '?') : [],
  );
  const me = $derived(session.myPlayerId);
  /** Delve together: nobody has a turn; everyone standing votes for a card. */
  const coop = $derived(!!s.delve && isGroupRun(s));
  /** Delve together: this device's player can vote (standing, the vote still open). */
  const canVote = $derived(coop && !drawn && s.phase === 'choosing' && !!me && livesOf(s, me) > 0);
  const mine = $derived(coop ? canVote : session.myTurn);
  /**
   * The cards are shown dimmed: to those who watch (alone, another's turn;
   * together, those not standing). Not to a voter as the vote closes and
   * the draw plays out: a filter changing on the cards then would have to
   * redraw them every frame.
   */
  const dimmed = $derived(coop ? !me || livesOf(s, me) <= 0 : !mine);
  // The lockout in force (in Delve it grows with depth).
  const lockout = $derived(activeRules(s).lockout);

  // ---- the Azurite Vein's dig ----------------------------------------------
  // After a right strike the deal is two cards: the vein running on, and the
  // way out, its plaque saying what it keeps (the haul in hand).

  /** The vein being dug, while its two cards are up. */
  const dig = $derived(s.phase === 'choosing' && s.offered.some(isWayOut) ? digOf(s) : null);
  const haul = $derived(dig?.haul.length ?? 0);
  // (The way out's lantern hangs in its plate, gilded: no emblem stands in its window.)
  const iconOf = (cat: string) => (isWayOut(cat) ? '' : categoryIcon(cat));
  const tweakOf = (cat: string) => (isWayOut(cat) ? { k: 1, up: 0, left: 0 } : categoryIconTweak(cat));
  /** A card's name as players read it. */
  const cardName = (cat: string) => (isWayOut(cat) ? out.title : cat);
  /**
   * Svelte action: a card's name kept inside its nameplate, smaller as far
   * as it must (down to four fifths) rather than spilling over the frame: a
   * long one (Flasks, Charms, Jewels, Relics & Tablets) wraps to three lines
   * where the engine measures its letters a touch wider (Safari) or a
   * fallback font stands in. A plate as tall as its name (a row's) is left be.
   */
  function fitPlate(node: HTMLElement) {
    const run = () => {
      node.style.fontSize = '';
      if (node.scrollHeight <= node.clientHeight + 1) return;
      const full = parseFloat(getComputedStyle(node).fontSize);
      let size = full;
      while (node.scrollHeight > node.clientHeight + 1 && size > full * 0.8) {
        size = Math.max(full * 0.8, size - 0.5);
        node.style.fontSize = `${size}px`;
      }
    };
    // First fitted as the observer first reports it, in the frame it's laid
    // out in, before that is painted: not at once as it mounts (nor as the
    // fonts, already in, say so), which had the page laid out again for each
    // card as the hand came in. (Fonts still coming: fitted again once in.)
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(run);
    const ro = new ResizeObserver(run);
    ro.observe(node);
    const mo = new MutationObserver(run);
    mo.observe(node, { characterData: true, childList: true, subtree: true });
    return {
      destroy: () => {
        ro.disconnect();
        mo.disconnect();
      },
    };
  }
  /** The way out's colours, as custom properties on its card. */
  const outInk = Object.entries(out.ink).map(([k, v]) => `${k}:${v}`).join(';');

  // ---- the cards' effects ---------------------------------------------------
  // Everything the cards set off is one group: it ends with them (a short
  // fade) rather than playing on over the question that takes their place.
  // It shines from behind the UI, so the voters' seals on the cards' feet
  // (a cover while they're up) stay in front of a card's fire and its light.
  // The seals' own glint, as a vote lands, is in front of them.

  const fx = fxGroup();
  const onCards = <T,>(fn: () => T): T => fx.run(fn, { behind: true });
  $effect(() => () => fx.stop());

  let cardsEl = $state<HTMLElement>();
  /**
   * How far a seal's cover reaches past its box, px: the avatar's rings (3px
   * round it), and the cover's soft edge (a mask at a quarter of the view,
   * blurred), which would otherwise let the light through over the seal's rim.
   */
  const SEAL_PAD = 10;
  function* seals(): Iterable<CoverBox> {
    for (const el of cardsEl?.querySelectorAll('.votes > *') ?? []) {
      const b = el.getBoundingClientRect();
      const box = new DOMRect(b.left - SEAL_PAD, b.top - SEAL_PAD, b.width + 2 * SEAL_PAD, b.height + 2 * SEAL_PAD);
      const r = box.height / 2;
      yield { box, radii: [r, r, r, r] };
    }
  }
  $effect(() => {
    if (!coop) return;
    // (Again when the effects are turned back on: turning them off drops every cover.)
    let seen = cover(seals);
    const off = onFxChange(() => {
      seen.stop();
      seen = cover(seals);
    });
    return () => {
      off();
      seen.stop();
    };
  });

  // ---- the vote (Delve together) ------------------------------------------
  // Votes are public and can change until the vote closes: when everyone it
  // waits for has voted, or VOTE_WINDOW_MS after the first vote. Nothing is
  // drawn before a first vote, however long the team takes.

  const votes = $derived(coop ? (s.delve?.votes ?? {}) : {});
  const myVote = $derived(coop && me ? (votes[me] ?? null) : null);
  const votersOf = (cat: string) => s.players.filter((p) => votes[p.id] === cat);
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  /** The host's clock, ticking while the vote is open (its window, and the grace after a host's reload). */
  let hostNow = $state(session.hostNow());
  $effect(() => {
    if (!coop || s.phase !== 'choosing' || drawn) return;
    hostNow = session.hostNow();
    const id = setInterval(() => (hostNow = session.hostNow()), 250);
    return () => clearInterval(id);
  });
  /** Seconds until the vote closes by the clock, once the first vote has started it; null before. */
  const closesIn = $derived.by(() => {
    if (!coop || drawn || s.phase !== 'choosing') return null;
    const at = voteClosesAt(s);
    return at === null ? null : Math.max(0, Math.ceil((at - hostNow) / 1000));
  });
  /** Who the vote still waits for, and who it doesn't (idle: they let votes pass). */
  const waitingFor = $derived(coop && !drawn ? expectedVoters(s, hostNow).filter((id) => !Object.hasOwn(votes, id)) : []);
  const idle = $derived(coop && !drawn ? standingIds(s).filter((id) => isIdle(s, id) && !Object.hasOwn(votes, id)) : []);
  const anyVote = $derived(Object.keys(votes).length > 0);
  /** Delve together: whether anyone standing holds a flare or dynamite (they stay unused on a find's question). */
  const itemsHeld = $derived(coop && (holdersOf(s, 'flares').length > 0 || holdersOf(s, 'dynamite').length > 0));

  /** A card's votes in words, for screen readers. */
  function voteWords(cat: string) {
    const n = votersOf(cat).length;
    const yours = myVote === cat ? ', yours among them' : '';
    return n === 0 ? 'no votes' : `${n} ${n === 1 ? 'vote' : 'votes'}${yours}`;
  }

  /** Votes for `category`; whether it did. */
  function vote(category: string) {
    const i = s.offered.indexOf(category);
    if (!canVote || !faceUp(i) || myVote === category) return false;
    sfx('vote', { from: { from: cardEls[i] } });
    // The card's hover fire goes out: it stands lit as yours now (.voted).
    burning?.stop();
    burning = null;
    const frame = cardEls[i]?.querySelector('.frame');
    if (frame && fxActive()) onCards(() => outline(frame, { color: [2.2, 1.6, 0.7], width: 10, intensity: 0.6, life: 0.45, fadeIn: 0.04 }));
    session.dispatch({ type: 'vote', category });
    return true;
  }

  /** Svelte action: a vote's mark lands on its card (not the ones already there as the screen opens). */
  let pipsReady = false;
  $effect(() => {
    const t = setTimeout(() => (pipsReady = true), 50);
    return () => clearTimeout(t);
  });
  function cast(node: HTMLElement) {
    if (pipsReady) fx.run(() => voteCast(node));
  }

  // ---- the draw -------------------------------------------------------------
  // The vote closed: a light runs over the cards that got votes, slowing
  // down, and lands on the one drawn (every vote a ticket), which flares up
  // as the others burn away. About two seconds; reduced motion, a moment.
  //
  // The light is each card's own glow (.glow), only ever faded in and out:
  // it comes up at once on the card it reaches and dies away more slowly
  // behind it, so at speed it runs round the cards as a trail. The hops are
  // timed off the frame clock (one loop of requestAnimationFrame), not a
  // timer each, so they keep the beat they are given. Nothing in the draw or
  // the landing animates more than opacity and transform.

  /** The card the draw's light is on, and whether it has landed. */
  let lit = $state<number | null>(null);
  let landed = $state(false);
  const drawTimers: ReturnType<typeof setTimeout>[] = [];
  let drawFrame = 0;
  $effect(() => () => {
    drawTimers.forEach(clearTimeout);
    cancelAnimationFrame(drawFrame);
  });
  $effect(() => {
    if (!drawn) return;
    untrack(() => draw(drawn));
  });
  function draw(category: string) {
    const target = s.offered.indexOf(category);
    const done = (ms: number) => drawTimers.push(setTimeout(() => ondrawn?.(), ms));
    burning?.stop();
    burning = null;
    if (target < 0) return done(0);
    const quiet = motion.still;
    const land = () => {
      lit = target;
      landed = true;
      const card = cardEls[target];
      const frame = card?.querySelector('.frame');
      const others = cardEls.filter((c, j) => c && j !== target).map((c) => c.querySelector('.frame') ?? c);
      const kind = kindOf(category);
      if (frame && kind) onCards(() => findPicked(frame, card, others, kind));
      else if (frame && isWayOut(category)) onCards(() => outPicked(frame, card, others));
      else if (frame) onCards(() => cardPicked(frame, card, others, false));
      sfx(kind === 'azurite' ? 'veinStrike' : 'draw', { from: { from: card } });
    };
    // The cards in the draw: those with votes, in their order.
    const tickets = s.offered.flatMap((c, i) => (votersOf(c).length ? [i] : []));
    if (quiet || tickets.length < 2 || !tickets.includes(target)) {
      land();
      return done(quiet ? 700 : 1100);
    }
    // Twice round the cards in the draw, then on to the one drawn, each hop a little slower.
    const from = tickets.indexOf(target);
    const path = [...tickets, ...tickets, ...tickets.slice(0, from + 1)];
    const SPAN = 1300;
    const gaps = path.map((_, k) => 0.35 + 1.65 * (k / Math.max(1, path.length - 1)) ** 2);
    const unit = SPAN / gaps.reduce((a, b) => a + b, 0);
    /** When each hop lands, in ms from the start. */
    const at: number[] = [];
    let t = 0;
    for (const g of gaps) {
      at.push(t);
      t += g * unit;
    }
    let hop = -1;
    const start = performance.now();
    const step = (now: number) => {
      const age = now - start;
      // The hop due by this frame (a slow frame skips the light on to where it should be).
      let k = hop;
      while (k + 1 < path.length && at[k + 1] <= age) k++;
      if (k !== hop) {
        hop = k;
        if (k === path.length - 1) return land();
        const i = path[k];
        lit = i;
        const frame = cardEls[i]?.querySelector('.frame');
        if (frame) onCards(() => raffleHop(frame));
        sfx('hover', { from: { from: cardEls[i] } });
      }
      drawFrame = requestAnimationFrame(step);
    };
    drawFrame = requestAnimationFrame(step);
    done(t + 650);
  }

  /** Delve: the finds on the cards on offer (up to two, on different cards; session.cardFinds), in the cards' order. */
  const cardFinds = $derived(session.cardFinds(s).toSorted((a, b) => s.offered.indexOf(a.category) - s.offered.indexOf(b.category)));
  /** Their notes: one for each kind (the card bench may deal two of one). */
  const finds = $derived(cardFinds.filter((f, i) => cardFinds.findIndex((g) => g.kind === f.kind) === i));
  /**
   * Which side of the cards a note stands on, on a phone on its side: of two,
   * the first card's on the left and the other's on the right; one alone on
   * its card's side, the middle card's on the left.
   */
  /** The notes can stand beside the cards (CSS, on a phone on its side): a dig's two, or up to two finds'. */
  const beside = $derived(!!dig || (finds.length > 0 && finds.length <= 2 && !s.deathmatch));
  function sideOf(i: number, all: number[]): 'left' | 'right' {
    if (all.length > 1) return i === Math.min(...all) ? 'left' : 'right';
    return 2 * i + 1 > s.offered.length ? 'right' : 'left';
  }
  /**
   * The finds on the cards as they were dealt. Once a card is drawn (or
   * picked) the run has moved on to its question, where the cards carry no
   * finds any more (findOffers), but the cards are still up while the draw
   * and the chosen card's moment play out: they keep the art they were
   * dealt with rather than turning plain under it.
   */
  let dealtFinds: Record<string, FindKind> = {};
  const findsShown = $derived.by(() => {
    if (s.phase === 'choosing') dealtFinds = Object.fromEntries(cardFinds.map((f) => [f.category, f.kind]));
    // Come in after the cards closed (no deal seen): the question in play still says what its card was.
    else if (s.question?.find && !Object.keys(dealtFinds).length) dealtFinds = { [s.question.category]: s.question.find };
    return dealtFinds;
  });
  /** What a card is: a find of some kind, or plain. */
  const kindOf = (cat: string): FindKind | null => findsShown[cat] ?? null;
  const uid = $props.id();
  /**
   * Whether the faces are drawn sharp (.sharp, below): only in Chromium (it
   * alone has userAgentData), which draws them as that CSS reckons; Firefox
   * runs the filter at the screen's pixels, blurring the card, and Safari
   * can't say the zoom it's drawn at (lib/stage).
   */
  const sharp = typeof navigator !== 'undefined' && 'userAgentData' in navigator;
  /**
   * The sharp face's filter, one pass across and one down, in the pixels of
   * its twice-size drawing: a windowed sinc (Lanczos, radius 5) cut at 0.23
   * cycles a pixel, just under the screen's own limit (0.25), so detail the
   * screen can't hold is gone before Chrome shrinks it, and what it can is
   * kept. (A lower cut held the hatching stiller still but softer.)
   */
  const SHARP_KERNEL = '-0.00903 -0.05011 0.03016 0.29743 0.46311 0.29743 0.03016 -0.05011 -0.00903';

  /**
   * The corner filigree's four images (app.css, --filigree), written on each
   * card's corners rather than reached through var(). Chrome repaints a
   * card's whole face on every frame it tilts while an image on it comes
   * through var(), or shares an element's background with gradients: the
   * grain and the filigree, drawn so, cost the GPU four fifths of a tilting
   * frame (measured, 4K at 150%). So each image on a card has an element of
   * its own (.grain, .corners), written out.
   */
  const corners = typeof document === 'undefined' ? '' : (getComputedStyle(document.documentElement).getPropertyValue('--filigree').match(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g) ?? []).join(', ');

  // ---- finds --------------------------------------------------------------
  // A find is the ordinary card, its plate engraved by the same hand with
  // the find's motif crowning the emblem (lib/findEngraving): azurite prisms
  // fanned out through the arch, the emblem in a flare's sun, or in a ring
  // blown apart; the ink tinted the find's colour.

  // Their effects: azurite rings like crystal, a flare and dynamite throw sparks.
  // Their colours are the ones a find's reward flies to its item in (lib/fx/moments.ts FIND_COLORS).
  const FX = FIND_COLORS;
  const dim = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
  function findRevealed(frame: Element, kind: FindKind) {
    if (!fxActive()) return;
    const { main, pale } = FX[kind];
    outline(frame, { color: dim(main, 0.8), width: 10, intensity: 0.9, life: 1, fadeIn: 0.06 });
    glints(frame, { count: 5, area: 'edge', color: pale, size: [4, 8], delay: [0, 0.4] });
    if (kind === 'dynamite') sparks(frame, { count: 40, area: 'fill', speed: [120, 520], life: [0.3, 0.9] });
    light(frame, { color: kind === 'azurite' ? [0.3, 0.6, 1] : kind === 'flare' ? [1, 0.25, 0.4] : [1, 0.5, 0.25], radius: 260, intensity: 0.3, decay: 0.9 });
  }
  function findHover(frame: Element, card: Element, kind: FindKind): Handle {
    if (!fxActive()) return { stop() {} };
    const { main, pale } = FX[kind];
    const glow = outline(frame, { color: dim(main, 0.7), width: 12, flame: kind === 'azurite' ? 0.25 : 0.7, pulse: 0.4, intensity: 0.7, fadeIn: 0.25, base: card });
    const twinkle = emitter(5, () => glints(frame, { count: 1, area: 'edge', color: pale, size: [3, 7] }));
    return {
      stop() {
        glow.stop(0.35);
        twinkle.stop();
      },
    };
  }
  /** A find is chosen: azurite rings out like struck crystal and sheds shards, the others go up in sparks; the other cards burn away. */
  function findPicked(card: Element, base: Element, others: Element[], kind: FindKind) {
    if (!fxActive()) return;
    const { main, pale } = FX[kind];
    for (const o of others) {
      embers(o, { count: 24, area: 'fill', colors: [C.ember, C.emberDeep, C.ash], rise: [60, 200], life: [0.6, 1.6] });
      puffs(o, { count: 6, area: 'fill', color: [0.14, 0.09, 0.05] });
    }
    outline(card, { color: main, width: 16, flame: kind === 'azurite' ? 0.3 : 0.9, intensity: 1, life: 1.3, base });
    if (kind === 'azurite') shards(card, { count: 26, colors: [main, pale, C.whiteHot], speed: [180, 520] });
    sparks(card, { count: 40, area: 'edge', speed: [120, 560], life: [0.3, 0.9], colors: [pale, main] });
    ring(card, { radius: 260, thickness: 10, life: 0.8, color: main, breakup: 0.3 });
    flare(card, { size: 36, streak: 340, life: 0.7, color: pale });
    light(card, { color: kind === 'azurite' ? [0.3, 0.6, 1] : kind === 'flare' ? [1, 0.25, 0.4] : [1, 0.45, 0.3], radius: 360, intensity: 0.7, decay: 1.2 });
  }

  // The way out's effects: lamplight rather than fire. Its light swells round
  // the lantern as it turns up, steadies and breathes under the pointer, and
  // floods out as it is chosen; motes of it drift in the window (.icon, where
  // the lantern hangs).
  const LAMP: Vec3 = [1, 0.74, 0.38];
  function outRevealed(frame: Element) {
    if (!fxActive()) return;
    const lantern = frame.querySelector('.icon') ?? frame;
    outline(frame, { color: dim(C.gold, 0.75), width: 10, intensity: 0.8, life: 1.1, fadeIn: 0.1 });
    glints(lantern, { count: 4, area: 'fill', color: C.goldPale, size: [3, 7], delay: [0.1, 0.5] });
    light(lantern, { color: LAMP, radius: 280, intensity: 0.34, decay: 1.1 });
  }
  function outHover(frame: Element, card: Element): Handle {
    if (!fxActive()) return { stop() {} };
    const lantern = frame.querySelector('.icon') ?? frame;
    const glow = outline(frame, { color: dim(C.gold, 0.65), width: 12, flame: 0.12, pulse: 0.5, intensity: 0.65, fadeIn: 0.35, base: card });
    const motes = emitter(4, () => glints(lantern, { count: 1, area: 'fill', color: C.goldPale, size: [2, 5], life: [0.6, 1.1] }));
    light(lantern, { color: LAMP, radius: 220, intensity: 0.18, decay: 0.8 });
    return {
      stop() {
        glow.stop(0.45);
        motes.stop();
      },
    };
  }
  /** The way out is chosen: the lamp's light floods out of it; the vein's card burns away. */
  function outPicked(card: Element, base: Element, others: Element[]) {
    if (!fxActive()) return;
    const lantern = card.querySelector('.icon') ?? card;
    for (const o of others) {
      embers(o, { count: 24, area: 'fill', colors: [C.ember, C.emberDeep, C.ash], rise: [60, 200], life: [0.6, 1.6] });
      puffs(o, { count: 6, area: 'fill', color: [0.14, 0.09, 0.05] });
    }
    outline(card, { color: C.gold, width: 16, flame: 0.2, intensity: 1, life: 1.3, base });
    ring(lantern, { radius: 300, thickness: 10, life: 0.9, color: C.goldPale, breakup: 0.2 });
    flare(lantern, { size: 44, streak: 380, life: 0.8, color: C.goldPale });
    glints(lantern, { count: 6, area: 'fill', color: C.goldPale, size: [4, 9] });
    light(lantern, { color: LAMP, radius: 440, intensity: 0.85, decay: 1.3 });
  }

  let picked = $state<string | null>(null);

  // Size each emblem, and the items behind it (lib/ui, categoryCompanions), by
  // its visible shape (see lib/iconFit); measured while the cards lie face down.
  for (const url of categoryIcons()) measure(url);

  // A category that names several kinds of item shows one of each (lib/ui,
  // categoryCompanions): its emblem in front, and behind it, a little
  // smaller and darker, an item of each other kind, partly hidden but with
  // the part that says its kind in view. MOONS sets how they lie together,
  // by eye for their shapes: for each kind (its group) its item's offset
  // from the emblem (right and down), size against it and tilt (degrees,
  // clockwise), in px at a tall card's size, so that together they make
  // one compact shape. The heap as a whole is then centred and sized as one
  // emblem's box would be (see heapOf). A kind the data no longer has
  // leaves its spot empty.
  type Spot = [x: number, y: number, k: number, turn: number];
  const MOONS: Record<string, Record<string, Spot>> = {
    'Gloves & Boots': { Gloves: [18, -34, 0.85, 0] },
    'Amulets & Belts': { Amulets: [0, -44, 0.88, 0] },
    'Flasks, Charms, Jewels, Relics & Tablets': {
      Charms: [-43, -30, 0.42, -8],
      Jewels: [44, -30, 0.46, 0],
      Relics: [-34, 26, 0.6, -28],
      Tablets: [34, 22, 0.46, 18],
    },
  };
  /** How far the companions draw out from the heap's middle on hover, at most (see .moon). */
  const SPREAD = 1.25;
  /** A heap laid out: the emblem's size and shift on top of its tweak's, each kind's spot, and how far it may spread on hover. */
  type Heap = { k: number; up: number; left: number; at: Record<string, Spot>; spread: number };
  /**
   * A category's heap, when it has companions to show, laid out as one
   * emblem: the box round all its items' visible parts (a tilted item's
   * turned box) is centred in the window and scaled to a single item's size
   * and bounds (lib/iconFit: WEIGHT, MAX_W, MAX_H; not its ink, which a
   * heap's overlaps would overcount), so it covers the window as much as the
   * emblems beside it. No item is drawn larger than its own fit (k 1): a
   * larger one would grow upward from its foot (.glyph.fit), and a row
   * holds every item to 1. As set in MOONS until every item is measured.
   */
  function heapOf(cat: string): Heap | undefined {
    const spots = MOONS[cat];
    const companions = categoryCompanions(cat).filter((c) => spots?.[c.kind]);
    if (!companions.length) return undefined;
    const t = categoryIconTweak(cat);
    const face = fits[categoryIcon(cat)];
    const ready = !!face && companions.every((c) => fits[c.url]);
    if (!ready) return { k: 1, up: 0, left: 0, at: spots, spread: 1 };
    /** An item's box, turned by its tilt: [x, y, w, h], about its centre. */
    const box = (f: { w: number; h: number }, k: number, x: number, y: number, turn: number) => {
      const [w, h] = [(f.w - 2 * PAD) * k, (f.h - 2 * PAD) * k];
      const r = (turn * Math.PI) / 180;
      const [c, s] = [Math.abs(Math.cos(r)), Math.abs(Math.sin(r))];
      return [x, y, w * c + h * s, w * s + h * c];
    };
    // The emblem where its tweak puts it (as .glyph.fit does), and the others round it.
    const [ex, ey] = [-t.left, Math.min(0, ((1 - t.k) * face.h) / 2) - t.up];
    const items = [box(face, t.k, ex, ey, 0), ...companions.map((c) => box(fits[c.url], ...spotOf(spots[c.kind], ex, ey)))];
    const x0 = Math.min(...items.map(([x, , w]) => x - w / 2));
    const x1 = Math.max(...items.map(([x, , w]) => x + w / 2));
    const y0 = Math.min(...items.map(([, y, , h]) => y - h / 2));
    const y1 = Math.max(...items.map(([, y, , h]) => y + h / 2));
    const [W, H, cx, cy] = [x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2];
    const most = Math.max(t.k, ...companions.map((c) => spots[c.kind][2]));
    const s = Math.min(WEIGHT / Math.sqrt(W * H), MAX_W / W, MAX_H / H, 1 / most);
    const at = Object.fromEntries(companions.map((c) => {
      const [x, y, k, turn] = spots[c.kind];
      return [c.kind, [(ex + x - cx) * s, (ey + y - cy) * s, k * s, turn] as Spot];
    }));
    // At its new size the emblem is no larger than its fit, so it sits where its shift puts it.
    const [nx, ny] = [(ex - cx) * s, (ey - cy) * s];
    return { k: s, up: -ny - t.up, left: -nx - t.left, at, spread: spreadOf(companions.map((c) => box(fits[c.url], ...spotOf(at[c.kind], 0, 0)))) };
  }
  /** A spot's size, centre (about the emblem at x, y) and tilt, as box() takes them. */
  const spotOf = ([x, y, k, turn]: Spot, ex: number, ey: number) => [k, ex + x, ey + y, turn] as const;
  /**
   * How far (up to SPREAD) companions at these boxes may draw out from the
   * window's middle and stay in the window: inside its sides and floor
   * (84 px either side, 97 below) and its arch (radius 84, springing 22
   * above the middle), as the plate draws it (lib/cardEngraving).
   */
  function spreadOf(boxes: number[][]) {
    const inside = (far: number) =>
      boxes.every(([x, y, w, h]) =>
        [-1, 1].every((sx) =>
          [-1, 1].every((sy) => {
            const [px, py] = [x * far + (sx * w) / 2, y * far + (sy * h) / 2];
            return Math.abs(px) <= 84 && py <= 97 && (py >= -22 || Math.hypot(px, py + 22) <= 84);
          }),
        ),
      );
    // In whole hundredths, so repeated subtraction can't drift below 1.
    for (let i = Math.round((SPREAD - 1) * 100); i > 0; i--) if (inside(1 + i / 100)) return 1 + i / 100;
    return 1;
  }
  /** The emblem's style for a category: its fit, made room for its companions. */
  function emblemStyle(cat: string, heap: Heap | undefined) {
    const t = tweakOf(cat);
    return fitStyle(iconOf(cat), heap ? { k: t.k * heap.k, up: t.up + heap.up, left: t.left + heap.left } : t);
  }

  // The deal: the cards slide in face down one after another, then turn face
  // up from left to right. Seconds from when they appear. Held still (reduced
  // motion, or the effects off) they only fade in, face up, and the vote pips
  // appear and go at once.
  const DEAL = 0.42;
  const FLIP = TURN.seconds;
  const dealAt = (i: number) => 0.15 + i * 0.07;
  const flipAt = (i: number) => 0.62 + i * 0.12;
  /** Cards turn over their longer side: across when stacked as wide rows (narrow screens), else sideways. */
  const narrow = matchMedia(TURN.across);
  /** When the deal began; null when the cards appeared without one (as after a refresh). */
  let dealtAt: number | null = null;
  /** Whether card i lies face up yet (it can't be picked or catch fire before). */
  const faceUp = (i: number) => dealtAt === null || performance.now() - dealtAt >= (flipAt(i) + FLIP) * 1000;

  // The transitions are global: the cards are created with the screen, which
  // a local transition skips. The card fades in, and its inner part moves:
  // an opacity on the element that turns would flatten it, and its back
  // would show through the face.
  function appear(_node: Element, { i }: { i: number }) {
    if (motion.still) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return { delay: Math.round(dealAt(i) * 1000), duration: DEAL * 400, css: (t: number) => `opacity:${t}` };
  }
  function deal(node: Element, { i, n }: { i: number; n: number }) {
    if (motion.still) return {};
    dealtAt ??= performance.now();
    // The face's own entrance (see .dealt below) plays with the deal only;
    // the emblem reads the kindle's numbers while it kindles, and no longer.
    node.classList.add('dealt', 'kindling');
    if (!registered) node.classList.add('plain');
    const kindled = (e: Event) => {
      if (!(e.target as Element).matches('.icon, .gilt')) return;
      node.classList.remove('kindling');
      node.removeEventListener('animationend', kindled);
      node.removeEventListener('animationcancel', kindled);
    };
    node.addEventListener('animationend', kindled);
    node.addEventListener('animationcancel', kindled);
    // Face down until it turns halfway (see .down below). The class goes on
    // the card itself, which the CSS reads it from, not on the sides around
    // the turn.
    const card = node.closest('.card');
    card?.classList.add('down');
    const start = dealAt(i);
    const turn = flipAt(i) - start;
    const total = turn + FLIP;
    let down = true;
    const rot = (i - (n - 1) / 2) * 7;
    const axis = narrow.matches ? 'X' : 'Y';
    return {
      delay: Math.round(start * 1000),
      duration: Math.round(total * 1000),
      css: (t: number) => {
        const u = t * total;
        const d = cubicOut(Math.min(1, u / DEAL));
        const f = cubicInOut(Math.min(1, Math.max(0, (u - turn) / FLIP)));
        // Lifted off the table while it turns.
        const lift = Math.sin(Math.PI * f);
        const y = (1 - d) * 90 - lift * TURN.lift;
        return `transform:perspective(${TURN.perspective}px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotate${axis}(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + TURN.swell * lift).toFixed(4)})`;
      },
      // The sides swap on the turn's own clock, as it stands on edge. A timer
      // counted from here ran ahead of it: the turn starts only after the
      // mount's long frame, and the face came up while it still faced away.
      tick: (t: number) => {
        if (down && t * total >= turn + FLIP / 2) {
          down = false;
          card?.classList.remove('down');
        }
      },
    };
  }

  /** Svelte action: the card's moment as it lands face up. */
  function revealed(node: HTMLElement, i: number) {
    if (motion.still) return;
    // Read now: the cards may be fading out by the time it lands, their deriveds gone inert.
    const kind = kindOf(s.offered[i]);
    const out = isWayOut(s.offered[i]);
    const dm = !!s.deathmatch;
    const t = setTimeout(() => {
      const frame = node.querySelector('.frame') ?? node;
      if (dealtAt !== null) onCards(() => (kind ? findRevealed(frame, kind) : out ? outRevealed(frame) : cardRevealed(frame, dm)));
      // The pointer may already rest on it, having come while it lay face down.
      if (waiting === i) ignite(i);
    }, (flipAt(i) + FLIP) * 1000);
    return { destroy: () => clearTimeout(t) };
  }

  let cardEls = $state<HTMLElement[]>([]);
  let burning: Handle | null = null;
  /** The face-down card the mouse rests on, to catch fire once it turns up. */
  let waiting: number | null = null;

  function enter(e: PointerEvent, i: number) {
    if (e.pointerType !== 'mouse') return;
    if (!faceUp(i)) waiting = i;
    else ignite(i);
  }
  function ignite(i: number) {
    waiting = null;
    // (Not the card you voted for: it stands lit as yours.)
    if (!mine || picked || (coop && myVote === s.offered[i])) return;
    burning?.stop();
    const card = cardEls[i];
    const frame = card?.querySelector('.frame');
    const kind = kindOf(s.offered[i]);
    const out = isWayOut(s.offered[i]);
    if (frame) burning = onCards(() => (kind ? findHover(frame, card, kind) : out ? outHover(frame, card) : cardHover(frame, card, !!s.deathmatch)));
  }
  function leave(e: PointerEvent) {
    waiting = null;
    burning?.stop();
    burning = null;
    const frame = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.frame');
    if (!frame) return;
    tilts.get(frame)?.stop();
    tilts.delete(frame);
    frame.style.removeProperty('--tilt-x');
    frame.style.removeProperty('--tilt-y');
  }
  /**
   * The tilt eases after the pointer in script, a frame at a time, once the
   * hover's own lift is over (.tilting): a CSS transition begun afresh on
   * every move had Chrome draw the whole card again each frame, as each one
   * started. Its time constant matches the transition it stands in for
   * (0.35 s, ease-out).
   */
  const TILT_EASE = 0.12;
  const LIFT = 350;
  type Tilt = { since: number; rx: number; ry: number; to: [number, number]; frame: number; stop: () => void };
  const tilts = new Map<HTMLElement, Tilt>();
  function tiltTo(frame: HTMLElement, rx: number, ry: number) {
    const put = (t: Tilt) => {
      frame.style.setProperty('--tilt-x', `${t.rx.toFixed(3)}deg`);
      frame.style.setProperty('--tilt-y', `${t.ry.toFixed(3)}deg`);
    };
    let t = tilts.get(frame);
    if (!t) {
      // The lift began with the hover, not this move: timed from its transition (none left, it's over).
      const lift = frame.getAnimations().find((a) => a instanceof CSSTransition && a.transitionProperty === 'transform');
      const made: Tilt = {
        since: lift ? performance.now() - Number(lift.currentTime ?? 0) : -Infinity,
        rx,
        ry,
        to: [rx, ry],
        frame: 0,
        stop: () => {
          cancelAnimationFrame(made.frame);
          made.frame = 0;
          frame.classList.remove('tilting');
        },
      };
      tilts.set(frame, (t = made));
    }
    t.to = [rx, ry];
    // During the lift the hover's transition carries it there.
    if (performance.now() - t.since < LIFT) {
      [t.rx, t.ry] = t.to;
      put(t);
      return;
    }
    if (!frame.classList.contains('tilting')) {
      // Taken over from where the lift's transition has it on screen, so it doesn't jump: the
      // angles out of its matrix (perspective leaves the top three rows alone; the scale is even).
      const m = new DOMMatrix(getComputedStyle(frame).transform);
      t.rx = (Math.atan2(m.m23, m.m22) * 180) / Math.PI;
      t.ry = (Math.atan2(m.m31, m.m11) * 180) / Math.PI;
      frame.classList.add('tilting');
    }
    if (t.frame) return;
    const ease = t;
    let last = performance.now();
    const step = (now: number) => {
      const k = 1 - Math.exp(-(now - last) / 1000 / TILT_EASE);
      last = now;
      ease.rx += (ease.to[0] - ease.rx) * k;
      ease.ry += (ease.to[1] - ease.ry) * k;
      put(ease);
      const settled = Math.abs(ease.to[0] - ease.rx) < 0.005 && Math.abs(ease.to[1] - ease.ry) < 0.005;
      ease.frame = settled ? 0 : requestAnimationFrame(step);
    };
    ease.frame = requestAnimationFrame(step);
  }
  /** Tilts the card toward the pointer, and moves the glare with it. */
  function tilt(e: PointerEvent) {
    if (!mine || picked || e.pointerType !== 'mouse') return;
    const frame = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.frame');
    if (!frame) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tiltTo(frame, (0.5 - y) * 20, (x - 0.5) * 24);
    // (On the glare itself: set on the frame, every part of the card would be restyled with it.)
    const glare = frame.querySelector<HTMLElement>('.glare');
    glare?.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    glare?.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  }
  $effect(() => () => {
    for (const t of tilts.values()) t.stop();
    tilts.clear();
  });
  $effect(() => () => burning?.stop());

  /** Picks `category` (votes for it, together); whether it did. */
  function pick(category: string) {
    if (coop) return vote(category);
    const i = s.offered.indexOf(category);
    if (!mine || picked || !faceUp(i)) return false;
    picked = category;
    burning?.stop();
    burning = null;
    const frame = cardEls[i]?.querySelector('.frame');
    const others = cardEls.filter((c, j) => c && j !== i).map((c) => c.querySelector('.frame') ?? c);
    const kind = kindOf(category);
    if (frame && kind) onCards(() => findPicked(frame, cardEls[i], others, kind));
    else if (frame && isWayOut(category)) onCards(() => outPicked(frame, cardEls[i], others));
    else if (frame) onCards(() => cardPicked(frame, cardEls[i], others, !!s.deathmatch));
    sfx(kind === 'azurite' ? 'veinStrike' : 'pick', { from: { from: cardEls[i] } });
    session.dispatch({ type: 'pick', category });
    // Allow a retry if the host rejected the pick.
    setTimeout(() => (picked = null), 2500);
    return true;
  }

  /** An option's key (settings page) picks its card, or votes for it, as a click would. */
  function onKey(e: KeyboardEvent) {
    if (typing(e)) return;
    // An item's window (ItemWindow) has its own keys, as on a question.
    if (e.target instanceof Element && e.target.closest('[data-item-window]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('[aria-modal="true"]')) return;
    const n = optionIndex(actionOf(e));
    const cat = n === null ? undefined : s.offered[n];
    if (cat === undefined || !mine) return;
    e.preventDefault();
    // Shown to the others as a tap on the card (keyTap).
    if (pick(cat)) keyTap(`card:${n}`);
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet prompt()}
  <!-- data-cursor: where other players' pointers are placed (PeerCursors): each card, and the lines round them. -->
  <p class="prompt" data-cursor="prompt">
    {#if s.deathmatch}
      {#if knockedOut.length}{knockedOut.join(', ')} {knockedOut.length === 1 ? 'is' : 'are'} out;{' '}{/if}
      {#if mine}{knockedOut.length ? 'your' : 'Sudden death: your'} category is drawn at random.{:else}<span class="muted">{knockedOut.length ? 'sudden' : 'Sudden'} death for</span> {active.name}<span class="muted">…</span>{/if}
    {:else if dig}
      {#if coop ? canVote && !drawn : mine}
        {coop && myVote ? 'Your vote is in' : 'Dig deeper, or get out?'}
      {:else if coop}
        <span class="muted">{drawn ? 'Drawing from the votes…' : 'The team is deciding whether to dig deeper…'}</span>
      {:else}
        <span class="muted">{active.name} is deciding whether to dig deeper…</span>
      {/if}
    {:else if coop}
      {#if drawn}
        <span class="muted">Drawing from the votes…</span>
      {:else if canVote}
        {myVote ? 'Your vote is in' : 'Vote for a card'}
      {:else if session.spectating}
        <span class="muted">The team is voting…</span>
      {:else}
        <span class="muted">Your team is voting…</span>
      {/if}
    {:else if mine}
      Choose your category
    {:else}
      <span class="muted">Waiting for</span> {active.name} <span class="muted">to choose a category…</span>
    {/if}
  </p>
{/snippet}

<div
  class="choose"
  class:coop
  class:delve={!!s.delve}
  class:beside={beside}
  class:duel={!!s.deathmatch}
  class:sharp
  style:--n={s.offered.length}
  style:--sharp={sharp ? `url(#${uid}-sharp)` : undefined}
  style:--sharp-wide={sharp ? `url(#${uid}-sharp-wide)` : undefined}
>
  {#if sharp}
    <!-- The sharp face's filter (SHARP_KERNEL); the wide one leaves room for its shadow while CSS paints it. -->
    <svg class="sharp-filters" aria-hidden="true" width="0" height="0">
      {#each [['sharp', 5], ['sharp-wide', 40]] as [name, room] (name)}
        <filter id="{uid}-{name}" x="-{room}%" y="-{room}%" width="{100 + 2 * Number(room)}%" height="{100 + 2 * Number(room)}%" color-interpolation-filters="sRGB">
          <feConvolveMatrix order="9 1" kernelMatrix={SHARP_KERNEL} divisor="1" edgeMode="none" />
          <feConvolveMatrix order="1 9" kernelMatrix={SHARP_KERNEL} divisor="1" edgeMode="none" />
        </filter>
      {/each}
    </svg>
  {/if}
  {#if timer}
    <!-- The prompt's line as wide as the question's task line, its clock at the right end. -->
    <div class="line">
      {@render prompt()}
      <div class="clock">{@render timer()}</div>
    </div>
  {:else}
    {@render prompt()}
  {/if}

  <!-- The filigree: its rules (::before) and its corners, each image alone on its element (see `corners`). -->
  {#snippet filigree()}
    <span class="filigree"
      ><span class="corners" style:background-image={s.deathmatch ? undefined : corners} style:-webkit-mask-image={s.deathmatch ? corners : undefined} style:mask-image={s.deathmatch ? corners : undefined}></span
      ></span
    >
  {/snippet}
  <div class="cards" data-cursor="cards" bind:this={cardsEl} data-zoom class:single={s.offered.length === 1} class:moving={!!drawn || !!picked} style:--n={s.offered.length}>
    {#each s.offered as cat, i (cat)}
      {@const heap = heapOf(cat)}
      <button
        class="card"
        data-cursor="card:{i}"
        data-sfx="none"
        data-fx="none"
        class:dm={!!s.deathmatch}
        class:special={!!kindOf(cat)}
        class:out={isWayOut(cat)}
        style={isWayOut(cat) ? outInk : undefined}
        data-find={kindOf(cat)}
        aria-describedby={kindOf(cat) && !s.deathmatch ? `${uid}-note-${kindOf(cat)}` : undefined}
        class:mine
        class:dim={dimmed}
        class:chosen={picked === cat || (landed && lit === i)}
        class:faded={(picked && picked !== cat) || (landed && lit !== i)}
        class:voted={coop && myVote === cat && !landed}
        class:passing={!landed && lit === i}
        aria-label={coop ? `${cardName(cat)}: ${voteWords(cat)}` : isWayOut(cat) ? cardName(cat) : undefined}
        aria-pressed={coop && canVote ? myVote === cat : undefined}
        disabled={!mine}
        onclick={() => pick(cat)}
        onpointerenter={(e) => enter(e, i)}
        onpointerleave={leave}
        onpointermove={tilt}
        bind:this={cardEls[i]}
        style:--face="{Math.round((flipAt(i) + FLIP / 2) * 1000)}ms"
        use:revealed={i}
        in:appear|global={{ i }}
      >
        <!-- (The card's two sides together: what a dim card's filter goes on when its face is sharp.) -->
        <span class="sides">
          <span class="turn" in:deal|global={{ i, n: s.offered.length }}>
            <span class="back" aria-hidden="true">
              <span class="grain"></span>
              <CardEngraving side="back" find={kindOf(cat)} custom={isWayOut(cat) ? out.variant : undefined} />
              {@render filigree()}
            </span>
            <span class="frame" data-sharp={sharp || undefined} use:backdropShadow>
              <span class="grain"></span>
              <CardEngraving side="face" find={kindOf(cat)} custom={isWayOut(cat) ? out.variant : undefined} />
              <span class="glare"></span>
              <span class="sheen"></span>
              {@render filigree()}
              {#if kindOf(cat)}
                {@const kind = kindOf(cat)!}
                <span class="find-tag" data-zoom>{dig && kind === 'azurite' ? 'Dig Deeper' : FIND_TEXT[kind].name}</span>
              {:else if isWayOut(cat)}
                <span class="find-tag out-tag" data-zoom>{out.tag(haul)}</span>
              {/if}
              <span class="icon" class:none={isWayOut(cat)}>
                {#if heap}
                  {@const at = heap.at}
                  <span class="lit moons" style:--spread={heap.spread}>
                    {#each categoryCompanions(cat) as c (c.url)}
                      {#if at[c.kind]}
                        {@const [x, y, k, turn] = at[c.kind]}
                        <span class="moon" style:--mx={x} style:--my={y} style:--mk={k} style:--mr={turn}
                          ><span class="glyph" class:fit={!!fits[c.url]} style={fitStyle(c.url, { k })} style:--src="url('{maskOf(c.url)}')" use:fineMask={maskOf(c.url)}></span></span
                        >
                      {/if}
                    {/each}
                  </span>
                {/if}
                <span class="lit"><span class="glyph" class:fit={!!fits[iconOf(cat)]} style={emblemStyle(cat, heap)} style:--src="url('{maskOf(iconOf(cat))}')" use:fineMask={maskOf(iconOf(cat))}></span></span>
              </span>
              {#if kindOf(cat) === 'azurite'}
                <!-- The vein's crystals in the corner stand in front of the item. -->
                <CardEngraving side="face" find="azurite" front />
              {/if}
              <span class="title" class:long={cardName(cat).length > 30} use:fitPlate
                >{#if kindOf(cat)}{@const kind = kindOf(cat)!}<span class="find-tag-row">{dig && kind === 'azurite' ? 'Dig Deeper' : FIND_TEXT[kind].name}</span
                  >{:else if isWayOut(cat)}<span class="find-tag-row">{out.tag(haul)}</span>{/if}{cardName(cat)}</span
              >
            </span>
            {#if coop}
              <!-- The draw's light on this card (see the draw above). -->
              <span class="glow" aria-hidden="true"></span>
            {/if}
          </span>
        </span>
        {#if coop}
          <!-- Who voted for it, your own mark ringed: on the card's foot from 701px
               wide (or on a phone on its side), else a row under it that keeps its height while empty. -->
          {@const voters = votersOf(cat)}
          {@const faces = voters.length > 5 ? voters.slice(0, 4) : voters}
          <span class="votes" aria-hidden="true">
            {#each faces as p (p.id)}
              <span class="pip" class:me={p.id === me} title={p.name} use:cast in:scale={{ start: 0.3, duration: motion.still ? 0 : 300 }} out:scale={{ start: 0.3, duration: motion.still ? 0 : 200 }}
                ><Avatar name={p.name} hue={p.hue} sigil={p.sigil} size={22} /></span
              >
            {/each}
            {#if voters.length > faces.length}<span class="more">+{voters.length - faces.length}</span>{/if}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  {#if dig}
    <!-- A dig's two cards: the strike ahead and what a cave-in costs; what the way out takes. -->
    <div class="find-notes" data-cursor="notes">
      {#each s.offered as cat, i (cat)}
        <p class="note find-note" data-find={isWayOut(cat) ? 'out' : 'azurite'} id={isWayOut(cat) ? undefined : `${uid}-note-azurite`} style={isWayOut(cat) ? outInk : undefined} style:--col={i + 1} data-side={sideOf(i, s.offered.map((_, j) => j))}>
          {#if isWayOut(cat)}{out.note(haul, coop)}{:else}{digNote(dig.strikes + 1, dig.light, haul, coop)}{/if}
        </p>
      {/each}
    </div>
  {:else if finds.length && !s.deathmatch}
    <!-- One short note per find, in its colour; what stays unused on them, once for both. -->
    {@const two = finds.length > 1}
    {@const team = coop && !!me && livesOf(s, me) > 0}
    {@const held = team ? (itemsHeld ? teamUnused('a find') : '') : mine && !coop ? unused(inventoryOf(s, active.id), 'a find') : ''}
    <!-- Wide screens: each note under its own card (its column), so what a find
         gives is read where it is chosen; phones: one under the other. -->
    <div class="find-notes" data-cursor="notes">
      {#each finds as f (f.kind)}
        <p
          class="note find-note"
          data-find={f.kind}
          id="{uid}-note-{f.kind}"
          style:--col={s.offered.indexOf(f.category) + 1}
          data-side={sideOf(
            s.offered.indexOf(f.category),
            finds.map((g) => s.offered.indexOf(g.category)),
          )}
        >
          {#if team}<strong>{FIND_TEXT[f.kind].tag}.</strong> {teamFindNote(f.kind, itemsHeld && !two)}{:else if mine && !coop}<strong
              >{FIND_TEXT[f.kind].tag}.</strong
            > {findNote(f.kind, inventoryOf(s, active.id), !two)}{:else}{FIND_TEXT[f.kind].others}{/if}
        </p>
      {/each}
      {#if two && held}<p class="note muted">{held.trim()}</p>{/if}
    </div>
  {/if}
  {#if coop && !drawn && s.phase === 'choosing'}
    <!-- The vote: when it closes, and who it is still waiting for (under what each card gives, with the rules' lines). -->
    <!-- Only who it waits for is announced; the countdown would be read out every second. -->
    <p class="vote-status" data-cursor="vote">
      {#if closesIn !== null}
        <span class="closes" aria-hidden="true">Closes in <b>{closesIn}</b><span class="unit">s</span></span>
      {/if}
      <span class="live" aria-live="polite">
        {#if closesIn !== null}<span class="sr">The vote’s clock has started.</span>{/if}
        {#if anyVote && waitingFor.length}
          <span>Waiting for {namesOf(waitingFor, nameOf, me)}</span>
        {:else if !anyVote}
          <span class="muted">Each vote is a ticket in the draw. The clock starts at the first vote.</span>
        {/if}
        {#if idle.length}
          <span class="idle">Not waiting for {namesOf(idle, nameOf, me)} (idle)</span>
        {/if}
      </span>
    </p>
  {/if}

  {#if s.deathmatch}
    <p class="note muted" data-cursor="note">{mine ? 'Tap the card when you are ready.' : deathmatchText(difficultyOf(s.settings.difficulty))}</p>
  {:else if dig}
    <!-- (A dig's cards lock nothing.) -->
  {:else if coop && canVote && lockout > 0}
    <p class="note muted" data-cursor="note">A category the team plays stays locked for the next {lockout} depths.</p>
  {:else if mine && lockout > 0}
    <p class="note muted" data-cursor="note">A category you choose stays locked for {lockoutText(lockout)}.</p>
  {/if}
</div>

<style>
  .choose {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.6rem;
  }
  .prompt {
    margin: 0;
    font-size: 1.2rem;
    text-align: center;
  }
  /* A vein's lamp at the prompt's right end: the line and the clock as the
     question's task line has them (QuestionView's .task and .clock, its
     sizes below too), so the ring stays put as the strike comes in. */
  .line {
    position: relative;
    justify-self: center;
    width: min(980px, 100%);
  }
  .line .prompt {
    padding-inline: 60px;
  }
  .line .clock {
    position: absolute;
    right: 0;
    top: 50%;
    translate: 0 -50%;
    display: grid;
    place-items: center;
  }
  .line .clock :global(.timer) {
    width: 52px;
    height: 52px;
  }
  .line .clock :global(.timer span) {
    font-size: 1.15rem;
  }
  /* The way out: its design's colours (lib/wayOut, set on the card), as a find's are. */
  /* Its lantern hangs in the engraving, gilded: the emblem's place is kept, so a row's name keeps clear of it. */
  .card.out .icon.none {
    visibility: hidden;
    /* (Hidden, it needn't kindle: the kindle runs on the page's thread.) */
    animation: none;
  }
  .find-tag.out-tag {
    color: var(--f-hi);
  }
  .card.out .title {
    color: var(--f-hi);
  }
  .card.out .back {
    border-color: var(--f-border);
  }
  .card.out .frame {
    border-color: var(--f-border);
    --bs-ring: color-mix(in srgb, var(--f-border) 45%, transparent);
  }
  .card.out:not(:global(.down)) .frame {
    --bs1: 0px 34px;
    --bs1-color: var(--f-glow);
  }
  .card.out.mine:not(:global(.down)):hover .frame,
  .card.out.mine:not(:global(.down)):focus-visible .frame {
    border-color: var(--f);
    --bs1-color: var(--f-pulse);
  }
  .find-note[data-find='out'] {
    color: var(--f);
  }
  /* The cards take the room the question will: on a full-size window they
     stand as tall as its stage (1.36 x, 980 wide for three), smaller on
     shorter windows. Scaled whole with zoom, as the engraving is laid out to
     the card's own 220 x 300 (see .frame). */
  .choose {
    --card-z: 1;
  }
  @media (min-width: 1100px) and (min-height: 821px) {
    .choose {
      --card-z: 1.2;
    }
  }
  @media (min-width: 1100px) and (min-height: 900px) {
    .choose {
      --card-z: 1.36;
    }
  }
  /* Tablets standing up: as wide as the screen allows. */
  @media (min-width: 761px) and (max-width: 1099px) and (min-height: 1000px) {
    .choose {
      --card-z: 1.1;
    }
  }
  /* Delve together takes some of the height for the votes under the cards
     and the vote's line: as large as alone from 900 tall, smaller below. */
  @media (min-width: 761px) and (min-height: 821px) and (max-height: 899px) {
    .choose.coop {
      --card-z: 1;
    }
  }
  @media (min-width: 761px) and (max-height: 820px) {
    .choose.coop {
      --card-z: 0.8;
    }
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(var(--n, 3), minmax(0, 220px));
    gap: 1.4rem;
    /* (data-zoom: so lib/stage.ts finds it where the browser can't say an element's zoom.) */
    zoom: var(--card-z);
  }
  .card {
    /* The engraving's gold, and the warm glow in the face's window. */
    --ink: #c9a05a;
    --warm: #c8682a;
    padding: 0;
    border: 0;
    background: none;
    cursor: default;
  }
  .turn {
    position: relative;
    display: block;
    transform-style: preserve-3d;
  }
  /* The card's two sides: the deal turns it from its back to its face. */
  .frame,
  .back {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    isolation: isolate;
  }
  /* A faint grain over both sides, so they read as worked plates rather than
     flat fills: under all else on the side, an element of its own (see
     `corners`, in the script). */
  .grain {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .86 0 0 0 0 .62 .08 0 0 0 -.025'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") 0 0 / 180px;
    pointer-events: none;
  }
  .back {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    overflow: clip;
    border: 1px solid var(--gold-lo);
    background:
      radial-gradient(circle at 50% 50%, rgba(175, 96, 37, 0.2), transparent 90px),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    --ring: rgba(125, 99, 51, 0.35);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px var(--ring),
      0 16px 40px rgba(0, 0, 0, 0.6);
    transform: rotateY(180deg);
    pointer-events: none;
  }
  /* The engraved plates (see lib/cardEngraving), behind what the card shows. */
  .frame > :global(.engraving),
  .back > :global(.engraving) {
    opacity: 0.6;
    transition: opacity 0.4s;
  }
  /* The face is laid out to its plate (see lib/cardEngraving, TALL): the
     emblem in the arch, the name in the nameplate, the same whatever the
     name's length. Inside its border the card is 298 high. */
  .frame {
    position: relative;
    display: block;
    height: 300px;
    overflow: clip;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    --bs1: 16px 40px;
    --bs1-color: rgba(0, 0, 0, 0.6);
    --bs-shade: rgba(0, 0, 0, 0.5);
    --bs-ring: rgba(125, 99, 51, 0.35);
    box-shadow:
      inset 0 0 0 4px var(--bs-shade),
      inset 0 0 0 5px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    /* (--tilt-transition: its transform instant while it tilts by script, .tilting below.) */
    transition:
      var(--tilt-transition, transform 0.35s var(--ease-out)),
      --bs-shade 0.35s,
      --bs-ring 0.35s,
      --bs1 0.35s,
      --bs1-color 0.35s,
      --bs2 0.35s,
      --bs2-color 0.35s,
      border-color 0.35s,
      opacity 0.4s,
      filter 0.4s;
  }
  /* The same gold filigree as the panels, on all four corners (.corners,
     from the script's `corners`), joined by a fine rule along the outer line
     of each (::before). */
  .filigree {
    --at: 1px;
    --end: 30px;
    --rule: linear-gradient(rgba(201, 164, 92, 0.26), rgba(201, 164, 92, 0.26));
    --rules:
      var(--rule) var(--end) var(--at) / calc(100% - 2 * var(--end)) 1px no-repeat,
      var(--rule) var(--end) calc(100% - var(--at)) / calc(100% - 2 * var(--end)) 1px no-repeat,
      var(--rule) var(--at) var(--end) / 1px calc(100% - 2 * var(--end)) no-repeat,
      var(--rule) calc(100% - var(--at)) var(--end) / 1px calc(100% - 2 * var(--end)) no-repeat;
    position: absolute;
    inset: 5px;
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(224, 138, 68, 0.35));
    pointer-events: none;
    transition:
      opacity 0.3s,
      filter 0.3s;
  }
  .filigree::before,
  .corners {
    position: absolute;
    inset: 0;
  }
  .filigree::before {
    content: '';
    background: var(--rules);
  }
  .corners {
    background-position: top left, top right, bottom left, bottom right;
    background-size: 30px 30px;
    background-repeat: no-repeat;
  }
  .icon {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(132px - 75px);
    height: 150px;
    /* Centred even when an item grown larger (--e-k) overflows the cell:
       a flex box overflows both ways alike, where a grid would need
       `unsafe`, which older iOS Safari drops. */
    display: flex;
    align-items: center;
    justify-content: center;
    /* The emblem's warm glow, under its shadow (see .lit). */
    filter: drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
  }
  /* The emblem's shadow, on a layer of its own so the engraving stays
     crisp: the original card's, tight, just below it, as if lifted off the
     card. It's cast from the clean mask (see lib/iconFit), so the art's own
     faint shadow casts none, and it lies over the glow (on .icon) rather
     than under it, where the glow would wash it out. */
  .lit {
    position: relative;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.8));
  }
  .glyph {
    width: 130px;
    height: 150px;
    /* The original card's gold, opaque so the glory's rays stay behind it. */
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    /* (--fine: the mask at about the size it's drawn, see lib/fineMask.) */
    -webkit-mask: var(--fine, var(--src)) center / contain no-repeat;
    mask: var(--fine, var(--src)) center / contain no-repeat;
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.4s;
  }
  /* The companions (see MOONS), each centred on its spot round the emblem
     and tilted, behind it (under one shadow, as the emblem's). They're
     darker, so they read as further back; dimmed by a filter, they keep the
     card's own colours. */
  .moons {
    position: absolute;
    inset: 0;
    display: block;
  }
  .moon {
    --far: 1;
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    place-items: center;
    translate: calc(-50% + var(--mx) * var(--far) * var(--e-s, 1) * 1px) calc(-50% + var(--my) * var(--far) * var(--e-s, 1) * 1px);
    rotate: calc(var(--mr) * 1deg);
    filter: brightness(0.78);
    transition: translate 0.45s var(--ease-out);
  }
  /* Until measured, a companion fits its whole image to a small box. */
  .moon .glyph:not(.fit) {
    width: calc(var(--mk) * 110px * var(--e-s, 1));
    height: calc(var(--mk) * 110px * var(--e-s, 1));
  }
  /* Once measured: the box is the visible item, scaled to a common weight
     (lib/iconFit) and by the item's own --e-k, and the image is placed so
     its visible part fills it. An item drawn larger grows upward, its foot
     where it was, and --e-up and --e-left move it. --e-s scales it all
     down for a card in a row. (Moved by its position, not a translate:
     WebKit, every browser on iOS, draws .lit's shadow filter only as far
     as its contents are laid out, not as far as a translate carries them,
     and cut the belt's straps off under Amulets & Belts.) */
  .glyph.fit {
    --e-k: var(--e-kin, 1);
    --u: calc(var(--e-s, 1) * var(--e-k) * 1px);
    position: relative;
    left: calc(var(--e-left, 0) * var(--e-s, 1) * -1px);
    top: calc(min(0px, (1 - var(--e-k)) * var(--e-h) * var(--e-s, 1) * 0.5px) - var(--e-up, 0) * var(--e-s, 1) * 1px);
    width: calc(var(--e-w) * var(--u));
    height: calc(var(--e-h) * var(--u));
    -webkit-mask-size: calc(var(--e-iw) * var(--u)) calc(var(--e-ih) * var(--u));
    mask-size: calc(var(--e-iw) * var(--u)) calc(var(--e-ih) * var(--u));
    -webkit-mask-position: calc(var(--e-x) * var(--u) * -1) calc(var(--e-y) * var(--u) * -1);
    mask-position: calc(var(--e-x) * var(--u) * -1) calc(var(--e-y) * var(--u) * -1);
  }
  /* As the face turns up in the deal, its emblem kindles and light runs across it.
     (Kindled as a whole, with its glow and shadow, on the layer that holds
     them: iOS Safari draws a filter animated inside other filters out of
     step with them, the emblem dimming apart from its own glow. And
     through --kindle-lum and --kindle-fade, which its filter and opacity
     read, rather than those themselves: Safari runs an opacity animation
     on the compositor but this filter's on the page's thread, which the
     deal keeps busy, so on iOS the emblem came up whole but dark, and only
     then lit; see app.css.) */
  .turn:global(.dealt) .icon {
    animation: kindle 0.9s ease-out var(--face, 0ms) backwards;
  }
  /* (While it kindles only, so that at rest it is just its glow.) */
  .turn:global(.kindling) .icon {
    filter: brightness(var(--kindle-lum, 1)) drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
    opacity: var(--kindle-fade, 1);
  }
  /* (A browser that can't register them would step the numbers, not ease
     them: there, the filter and opacity themselves.) */
  .turn:global(.kindling.plain) .icon {
    animation-name: kindle-plain;
  }
  .turn:global(.dealt) .sheen::before {
    animation: sheen 0.8s var(--ease-out) calc(var(--face, 0ms) + 80ms) backwards;
  }
  /* The way out: no light runs across it; its lantern kindles, the light
     round it swelling up and settling to breathe (CardEngraving's .lamp). */
  .card.out .sheen {
    display: none;
  }
  /* (CardEngraving's .gilt reads the kindle's numbers while it kindles, as .icon does.) */
  .card.out .turn:global(.dealt) :global(.gilt) {
    animation: kindle-gilt 1.1s ease-out var(--face, 0ms) backwards;
  }
  .card.out .turn:global(.kindling) :global(.gilt) {
    filter: brightness(var(--kindle-lum, 1)) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 var(--kindle-glow, 10px) var(--f-pulse, rgba(224, 138, 68, 0.45)));
    opacity: var(--kindle-fade, 1);
  }
  .card.out .turn:global(.kindling.plain) :global(.gilt) {
    animation-name: kindle-gilt-plain;
  }
  /* (The swell on the engraving's still layers, beside the gilt rather
     than round it: a filter animated inside another runs out of step with
     it on iOS Safari; see .icon's kindle. The lamp's light breathes as it was.) */
  .card.out .turn:global(.dealt) :global(.engraving > :is(.window, .glow, .lines)) {
    animation: swell 1.6s ease-out var(--face, 0ms) backwards;
  }
  @keyframes kindle-gilt {
    from {
      --kindle-fade: 0.2;
      --kindle-lum: 0.4;
      --kindle-glow: 10px;
    }
    40% {
      --kindle-fade: 1;
      --kindle-lum: 1.5;
      --kindle-glow: 18px;
    }
    to {
      --kindle-fade: 1;
      --kindle-lum: 1;
      --kindle-glow: 10px;
    }
  }
  @keyframes kindle-gilt-plain {
    from {
      opacity: 0.2;
      filter: brightness(0.4) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 10px var(--f-pulse, rgba(224, 138, 68, 0.45)));
    }
    40% {
      opacity: 1;
      filter: brightness(1.5) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 18px var(--f-pulse, rgba(224, 138, 68, 0.45)));
    }
    to {
      opacity: 1;
      filter: brightness(1) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 10px var(--f-pulse, rgba(224, 138, 68, 0.45)));
    }
  }
  @keyframes swell {
    from {
      filter: brightness(0.6);
    }
    35% {
      filter: brightness(1.35);
    }
  }
  @keyframes kindle {
    from {
      --kindle-fade: 0.2;
      --kindle-lum: 0.4;
    }
    40% {
      --kindle-fade: 1;
      --kindle-lum: 1.45;
    }
    to {
      --kindle-fade: 1;
      --kindle-lum: 1;
    }
  }
  @keyframes kindle-plain {
    from {
      opacity: 0.2;
      filter: brightness(0.4) drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
    }
    40% {
      opacity: 1;
      filter: brightness(1.45) drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
    }
    to {
      opacity: 1;
      filter: brightness(1) drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
    }
  }
  .sheen {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
  }
  .sheen::before {
    content: '';
    position: absolute;
    inset: -10% auto -10% -80%;
    width: 50%;
    background: linear-gradient(100deg, transparent, rgba(255, 232, 180, 0.18), transparent);
    transform: skewX(-14deg);
    opacity: 0;
  }
  @keyframes sheen {
    from {
      opacity: 1;
      translate: 0 0;
    }
    to {
      opacity: 1;
      translate: 420% 0;
    }
  }
  /* In the nameplate (TALL.plateTop down to 16 from the foot). */
  .title {
    position: absolute;
    left: 22px;
    right: 22px;
    top: 238px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: calc(1.05rem * var(--name-k, 1));
    letter-spacing: 0.04em;
    color: var(--gold-hi);
    text-align: center;
    line-height: 1.2;
    transition:
      color 0.3s,
      text-shadow 0.3s;
  }
  /* A long name (Flasks, Charms, Jewels, Relics & Tablets) set smaller, its
     two lines evened out, so they sit in the plate with room round them. */
  .title.long {
    --name-k: 0.86;
    letter-spacing: 0.02em;
    text-wrap: balance;
  }

  @media (min-width: 701px), (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .cards.single {
      grid-template-columns: minmax(0, 220px);
    }
  }
  .card.dm .frame {
    border-color: #8c3a2c;
    --bs-ring: rgba(140, 58, 44, 0.45);
    background:
      radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #22110d, #0d0706 70%);
  }
  /* The filigree in red: its gold can't be filtered to a clean red, so its
     shapes mask a red of their own. */
  .card.dm .filigree {
    filter: none;
  }
  .card.dm .filigree::before,
  .card.dm .corners {
    background: linear-gradient(135deg, #f0a08a, #c8503a 60%, #9a3424);
  }
  .card.dm .filigree::before {
    -webkit-mask: var(--rules);
    mask: var(--rules);
  }
  .card.dm .corners {
    -webkit-mask-position: top left, top right, bottom left, bottom right;
    mask-position: top left, top right, bottom left, bottom right;
    -webkit-mask-size: 30px 30px;
    mask-size: 30px 30px;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }
  .card.dm .title {
    color: #f3cfc2;
  }
  .card.dm {
    --ink: #c85a44;
    --warm: #e0553f;
  }
  .card.dm .glyph {
    background: linear-gradient(180deg, #ffd7c9 0%, #e0553f 50%, #6d1a10 100%);
  }
  .card.dm .back {
    border-color: #8c3a2c;
    --ring: rgba(140, 58, 44, 0.45);
    background:
      radial-gradient(circle at 50% 50%, rgba(224, 85, 63, 0.2), transparent 90px),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #22110d, #0d0706 70%);
  }
  .card.dm.mine .frame {
    animation: menace 2.4s ease-in-out infinite;
  }
  @keyframes menace {
    50% {
      --bs-ring: transparent;
      --bs1: 0px 45px;
      --bs1-color: rgba(224, 85, 63, 0.45);
    }
  }
  /* While a card lies face down its face is turned away, but the backdrop
     would still draw the face's shadow (and its hover shadow) under the back,
     which has a shadow of its own. */
  .card:global(.down) .frame {
    --bs1-color: transparent;
    --bs2-color: transparent;
  }
  .card.dm:global(.down) .frame {
    animation: none;
  }
  /* Only the side that faces up is shown. backface-visibility alone isn't
     enough in WebKit (every browser on iOS): the emblem, with a filter and
     an animation of its own, shows through the back while it lies face down.
     The sides swap as the card stands on edge, where neither shows. */
  .card:global(.down) .frame,
  .card:not(:global(.down)) .back {
    visibility: hidden;
  }
  .card.mine {
    cursor: pointer;
  }
  /* Someone else's to pick (or, together, once this player can't vote): not this player's to click. */
  .card:not(.mine) {
    cursor: not-allowed;
  }
  .card.mine:not(:global(.down)):hover .frame,
  .card.mine:not(:global(.down)):focus-visible .frame {
    transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) translateY(-10px) scale(1.04);
    border-color: var(--gold);
    --bs-ring: rgba(201, 164, 92, 0.6);
    --bs1: 0px 40px;
    --bs1-color: rgba(224, 138, 68, 0.3);
    --bs2: 24px 50px;
    --bs2-color: rgba(0, 0, 0, 0.7);
  }
  /* The tilt (tiltTo), the frame's own: an inherited one would restyle every
     part of the card, each line of its engraving, on every frame it moves. */
  @property --tilt-x {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }
  @property --tilt-y {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }
  /* Lifted, it tilts by script (tiltTo): its own transform takes no transition. */
  .card.mine:not(:global(.down)):not(.chosen):hover .frame:global(.tilting) {
    --tilt-transition: transform 0s;
  }
  .card.dm.mine:not(:global(.down)):hover .frame,
  .card.dm.mine:not(:global(.down)):focus-visible .frame {
    border-color: #c0503b;
    --bs-ring: rgba(224, 85, 63, 0.6);
  }
  .card.mine:not(:global(.down)):hover .frame > :global(.engraving),
  .card.chosen .frame > :global(.engraving) {
    opacity: 0.85;
  }
  .card.mine:not(:global(.down)):hover .glyph {
    transform: scale(1.1) rotate(-3deg);
    opacity: 1;
    filter: brightness(1.15);
  }
  /* The stack fans out: the companions draw out from behind the emblem,
     staying in its shade, and in the window (as far as heapOf finds they
     can); only the emblem grows and brightens, so it still leads. Only on
     the tall cards: the window it's worked out for isn't the rows'. */
  @media (min-width: 701px), (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .card.mine:not(:global(.down)):hover .moon {
      --far: var(--spread, 1);
    }
  }
  .card.mine:not(:global(.down)):hover .moon .glyph {
    transform: none;
    filter: none;
  }
  /* A soft highlight that follows the pointer across the card. */
  .glare {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at var(--gx, 50%) var(--gy, 30%), rgba(255, 226, 170, 0.07), transparent 45%);
    mix-blend-mode: screen;
    opacity: 0;
    transition: opacity 0.35s;
    pointer-events: none;
  }
  .card.mine:not(:global(.down)):hover .glare {
    opacity: 1;
  }
  .card.mine:not(:global(.down)):hover .title {
    color: #fff1cf;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.6);
  }
  .card.mine:not(:global(.down)):hover .filigree {
    opacity: 1;
    filter: brightness(1.25) drop-shadow(0 0 5px rgba(255, 170, 90, 0.6));
  }
  .card.dm.mine:not(:global(.down)):hover .filigree {
    filter: brightness(1.25);
  }
  .card.dm.mine:not(:global(.down)):hover .title {
    color: #ffe4db;
    text-shadow: 0 0 14px rgba(240, 140, 120, 0.6);
  }
  .card:focus-visible {
    outline: none;
  }
  .card.dim .frame,
  .card.dim .back {
    filter: saturate(0.6) brightness(0.8);
  }
  /* Lifted and grown a little: no more than keeps it clear of the line over
     the cards on a short window and inside a phone's margins. */
  .card.chosen .frame {
    transform: translateY(-4px) scale(1.05);
    transition:
      transform 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.15),
      --bs-shade 0.35s,
      --bs-ring 0.35s,
      --bs1 0.35s,
      --bs1-color 0.35s,
      --bs2 0.35s,
      --bs2-color 0.35s,
      border-color 0.35s,
      opacity 0.4s,
      filter 0.4s;
    border-color: var(--gold-hi);
    --bs-shade: transparent;
    --bs-ring: transparent;
    --bs1: 0px 60px;
    --bs1-color: rgba(255, 170, 90, 0.5);
    --bs2: 0px 0px;
    --bs2-color: transparent;
  }
  .card.dm.chosen .frame {
    border-color: #e88a74;
  }
  /* The others give way: they sink back and fade (opacity and transform
     only, as a filter would redraw the whole card every frame). */
  .card.faded .frame {
    opacity: 0.16;
    transform: scale(0.92) translateY(8px);
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.45s ease-out;
  }
  .card .votes {
    transition: opacity 0.45s ease-out;
  }
  .card.faded .votes {
    opacity: 0.35;
  }
  /* While the cards move (a pick, the draw), each is a layer of its own, so
     moving and fading it never redraws its engraving. */
  .cards.moving .frame {
    will-change: transform, opacity;
  }

  /* ---- sharp faces (Chromium) -----------------------------------------------
     Chrome draws a card's face once and resamples that picture onto the
     screen every frame it tilts; the engraving's fine hatching, a few px
     apart, came out as lines in one frame and grey in the next, and at rest
     the arch's close lines stepped. Here the face is laid out at twice its
     size (the width and margins give the room back, the scale its size; to
     the code it's no zoom: lib/stage, data-sharp), filtered down to what
     the screen can hold (SHARP_KERNEL) and only then shrunk, at rest and
     tilted alike, so it looks the same either way. Every transform the face
     takes is a 3D one, turned a hair (0.01deg): a flat one, Chrome draws at
     the screen's own size, and the filter would blur it. Only the tall
     cards: a row never tilts. Changing a card: docs/category-cards.md. */
  .sharp-filters {
    position: absolute;
  }
  .sides {
    display: block;
  }
  @media (min-width: 701px), (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .sharp .turn {
      /* (flow-root: the face's margins stay inside it.) */
      display: flow-root;
    }
    .sharp .frame {
      zoom: 2;
      width: 200%;
      margin: -75px -50%;
      transform: perspective(900px) rotateX(0.01deg) rotateY(0deg) translateY(0) scale(1);
      --face-filter: var(--sharp-wide);
    }
    /* The shrink, in a rule of its own: beside the transform, the build's
       minifier drops it and the live cards come out twice their size
       (tests/minifiedTransforms). */
    .sharp .turn > .frame {
      scale: 0.5;
    }
    /* (Its soft shadow drawn by the backdrop, not round it: the filter needs no room for it.) */
    .sharp .frame:global([data-bs-on]) {
      --face-filter: var(--sharp);
    }
    /* A filter that holds a url() can't fade, so a dim card is dimmed round both its sides instead. */
    .sharp .frame,
    .sharp .card.dim .frame,
    .sharp .card.dim.chosen .frame {
      filter: var(--face-filter);
    }
    .sharp .card.dim .back {
      filter: none;
    }
    .sharp .sides {
      transition: filter 0.4s;
    }
    .sharp .card.dim .sides {
      filter: saturate(0.6) brightness(0.8);
    }
    .sharp .card.dim.chosen .sides {
      filter: none;
    }
    .sharp .card.mine:not(:global(.down)):hover .frame,
    .sharp .card.mine:not(:global(.down)):focus-visible .frame {
      transform: perspective(900px) rotateX(calc(var(--tilt-x) + 0.01deg)) rotateY(var(--tilt-y)) translateY(-10px) scale(1.04);
    }
    .sharp .card.chosen .frame {
      transform: perspective(900px) rotateX(0.01deg) rotateY(0deg) translateY(-4px) scale(1.05);
    }
    .sharp .card.faded .frame {
      /* (scale(0.92) translateY(8px), in this order.) */
      transform: perspective(900px) rotateX(0.01deg) rotateY(0deg) translateY(7.36px) scale(0.92);
    }
    .sharp .card.voted .frame {
      transform: perspective(900px) rotateX(0.01deg) rotateY(0deg) translateY(-8px) scale(1);
    }
  }

  .note {
    margin: 0;
    font-style: italic;
    font-size: 0.95rem;
    /* Centred under the cards, also when it wraps on a phone. */
    text-align: center;
  }
  /* Two notes under the cards sit closer than the cards sit to them. */
  .find-notes + .note {
    margin-top: -1rem;
  }
  .find-notes {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }
  /* Wide screens: the notes in the cards' columns, each under its card. */
  @media (min-width: 701px), (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .find-notes {
      display: grid;
      /* The cards' own tracks (shrinking with them on a narrow tablet). */
      grid-template-columns: repeat(var(--n, 3), minmax(0, calc(220px * var(--card-z))));
      column-gap: calc(1.4rem * var(--card-z));
      row-gap: 0.35rem;
      align-items: start;
      margin-top: -0.6rem;
    }
    .find-notes .find-note {
      grid-column: var(--col);
      grid-row: 1;
      margin: 0;
      max-width: none;
      font-size: 0.9rem;
      line-height: 1.35;
    }
    .find-notes .note.muted {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    /* Together: who voted hangs on the card's foot, their seals over its
       frame, rather than in a row of its own kept under every card. */
    .card {
      position: relative;
    }
    .card .votes {
      position: absolute;
      left: 0;
      right: 0;
      bottom: -13px;
      margin: 0;
    }
    /* The find's tag never much smaller than at the cards' own size (nine
       tenths, so it still fits its plate's slot): it is all that marks a
       find on the card's face. */
    .cards .find-tag {
      zoom: max(1, calc(0.9 / var(--card-z)));
    }
    /* Side by side on the foot, each seal whole, so every voter can be told. */
    .card .votes .pip + .pip {
      margin-left: 3px;
    }
    /* The vote's line and the rule under it read as one block of small print. */
    .vote-status + .note {
      margin-top: -0.6rem;
    }
    .coop .find-notes {
      margin-top: 0;
    }
    /* Under notes in the cards' columns, the next line keeps the usual gap. */
    .find-notes + .note,
    .find-notes + .vote-status {
      margin-top: 0;
    }
  }

  /* ---- finds ---------------------------------------------------------------
     A find is the ordinary card, its plate engraved with the find's motif
     (CardEngraving, lib/findEngraving), the plate's ink, its emblem and its
     name tinted the find's colour: a cold azurite, a flare's red gold. The
     filigree stays the panels' gold. */
  .card[data-find='azurite'] {
    --ink: #86b0e6;
    --warm: #2a62c0;
    --f: #9cc4f0;
    --f-hi: #dcedff;
    --f-border: #4a6a9a;
    --f-pulse: rgba(70, 140, 255, 0.34);
    --f-glow: rgba(70, 140, 255, 0.22);
    --f-glyph: linear-gradient(180deg, #eef6ff 0%, #9cc0ea 45%, #2a4a7a 100%);
  }
  /* A signal flare's crimson: rose lines, a red frame and a strong red halo,
     well apart from the gold of a plain card and the ember of dynamite. */
  .card[data-find='flare'] {
    --ink: #ec7088;
    --warm: #d4163c;
    --f: #ff7d96;
    --f-hi: #ffe1e8;
    --f-border: #b0324c;
    --f-pulse: rgba(255, 40, 85, 0.5);
    --f-glow: rgba(255, 40, 85, 0.32);
    --f-glyph: linear-gradient(180deg, #ffeae6 0%, #ee5a6e 45%, #680718 100%);
  }
  .card[data-find='flare'] .frame {
    background:
      radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #26110f, #0e0607 70%);
  }
  .card.special[data-find='flare']:not(:global(.down)) .frame {
    --bs1: 0px 44px;
  }
  /* Black powder: the ink an ash grey, the window lit by its ember. */
  .card[data-find='dynamite'] {
    --ink: #bdb2a2;
    --warm: #e0662a;
    --f: #e8c49a;
    --f-hi: #f6e8d6;
    --f-border: #7d6e5c;
    --f-pulse: rgba(255, 120, 40, 0.3);
    --f-glow: rgba(255, 120, 40, 0.2);
    --f-glyph: linear-gradient(180deg, #fbf3e6 0%, #c8b8a0 45%, #4a3a2a 100%);
  }
  .card.special .glyph {
    background: var(--f-glyph);
  }
  .card.special .title {
    color: var(--f-hi);
  }
  .card.special .back {
    border-color: var(--f-border);
  }
  .card.special .frame {
    border-color: var(--f-border);
    --bs-ring: color-mix(in srgb, var(--f-border) 45%, transparent);
  }
  /* Its light, once it lies face up (face down, the back has a shadow of its own). */
  .card.special:not(:global(.down)) .frame {
    --bs1: 0px 34px;
    --bs1-color: var(--f-glow);
  }
  .card.special.mine .frame {
    animation: pulse 3.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      --bs1: 0px 46px;
      --bs1-color: var(--f-pulse);
    }
  }
  .card.special:global(.down) .frame {
    animation: none;
  }
  .card.special.mine:not(:global(.down)):hover .frame,
  .card.special.mine:not(:global(.down)):focus-visible .frame {
    border-color: var(--f);
    --bs-ring: color-mix(in srgb, var(--f) 60%, transparent);
    --bs1-color: var(--f-pulse);
  }
  .card.special.chosen .frame {
    border-color: var(--f);
    --bs1-color: var(--f-pulse);
  }
  /* What the card is, on a small plaque over the keystone, lozenges at its
     ends like the nameplate's (in its name on a row). Centred by layout, not
     a translate: a translated plaque was drawn a pixel off from its turned
     lozenges once hover scaled the card, and they seemed to slide. Its room
     reaches half a card past either side, so a plaque wider than the card
     still overflows it evenly. */
  .find-tag {
    position: absolute;
    top: 8px;
    left: -50%;
    right: -50%;
    width: fit-content;
    margin-inline: auto;
    padding: 3px 12px 4px;
    font-family: var(--font-display);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--f-hi);
    background: linear-gradient(#1a140e, #0a0806);
    border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent);
    box-shadow:
      inset 0 0 0 2px #0a0806,
      inset 0 0 0 2.5px color-mix(in srgb, var(--f) 55%, transparent),
      0 0 12px var(--f-pulse);
  }
  .find-tag::before,
  .find-tag::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 6px;
    height: 6px;
    background: #0a0806;
    border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent);
    rotate: 45deg;
    translate: 0 -50%;
  }
  .find-tag::before {
    left: -4px;
  }
  .find-tag::after {
    right: -4px;
  }

  /* A find's plate moves (see CardEngraving): face down, and while another card is chosen, it holds still. */
  .card:global(.down) :global(.engraving *),
  .card.faded :global(.engraving *) {
    animation-play-state: paused;
  }
  .find-tag-row {
    display: none;
  }
  .find-note {
    text-align: center;
    max-width: 34rem;
  }
  .find-note[data-find='azurite'] {
    color: #a9cdf5;
  }
  .find-note[data-find='flare'] {
    color: #f7a3b3;
  }
  .find-note[data-find='dynamite'] {
    color: #eebf96;
  }
  .find-note strong {
    font-weight: 600;
  }

  /* ---- the vote (Delve together) -------------------------------------------- */
  /* Who voted for a card: their avatars under it, overlapping a little. */
  /* Centred on the row, each mark exactly its avatar's size: a mark
     stretched to the row's height would carry its rings off centre. */
  .votes {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 26px;
    margin-top: 12px;
    pointer-events: none;
  }
  .pip {
    position: relative;
    display: block;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }
  /* Close, each seal whole, so every voter can be told. */
  .pip + .pip {
    margin-left: 2px;
  }
  /* Your own vote: the avatar's own ring in gold rather than your colour,
     on top of the others; the same rings, so it sits in the row like them. */
  .pip.me {
    z-index: 1;
  }
  .pip.me :global(.avatar) {
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px var(--gold-hi),
      0 4px 10px rgba(0, 0, 0, 0.5);
  }
  .votes .more {
    display: grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    margin-left: -4px;
    padding: 1px 4px 0;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.68rem;
    color: var(--gold-hi);
    background: #1a130c;
    border: 1px solid var(--gold-lo);
    border-radius: 11px;
  }
  /* The card you voted for stands a little proud of the others, lit at its rim. */
  .card.voted .frame {
    transform: translateY(-8px);
    border-color: var(--gold-hi);
    --bs-ring: rgba(241, 217, 155, 0.55);
    --bs1: 0px 44px;
    --bs1-color: rgba(255, 170, 90, 0.38);
  }
  .card.voted .frame > :global(.engraving) {
    opacity: 0.85;
  }
  /* The draw's light passing over a card: a rim of light and a glow round
     it, drawn once and only faded. It comes up at once on the card it
     reaches and dies away behind it, so at speed it trails round the cards;
     on the card drawn it stays as the card rises, then gives way to the
     card's own light. It moves with the card (the vote's lift, below). */
  .glow {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    pointer-events: none;
    border: 1px solid var(--draw, var(--gold-hi));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--draw, var(--gold-hi)) 45%, transparent),
      0 0 22px 3px color-mix(in srgb, var(--draw-glow, rgb(255, 180, 100)) 50%, transparent),
      inset 0 0 26px color-mix(in srgb, var(--draw-glow, rgb(255, 180, 100)) 26%, transparent);
    opacity: 0;
    transition: opacity 0.38s ease-out;
    will-change: opacity;
  }
  .card.special .glow {
    --draw: var(--f-hi);
    --draw-glow: var(--f);
  }
  .card.passing .glow {
    opacity: 1;
    transition-duration: 0.05s;
  }
  .card.chosen .glow {
    /* (The frame's lift, so the light stays on the card.) */
    transform: translateY(-4px) scale(1.05);
    transition: transform 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.15);
    animation: drawn-glow 1.1s ease-out both;
  }
  @keyframes drawn-glow {
    from,
    20% {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  .card.voted .glow {
    transform: translateY(-8px);
  }
  .card.dim.chosen .frame {
    filter: none;
  }
  .vote-status {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem 1.1rem;
    margin: -0.4rem 0 0;
    max-width: 34rem;
    text-align: center;
    font-style: italic;
    font-size: 0.95rem;
  }
  .closes {
    font-style: normal;
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold-hi);
    align-self: center;
  }
  .closes .unit {
    text-transform: none;
  }
  .closes b {
    margin-left: 0.25em;
    display: inline-block;
    min-width: 1ch;
    font-size: 1rem;
  }
  .idle {
    color: var(--muted);
  }
  /* The live region lays its lines out in the row as if it weren't there. */
  .live {
    display: contents;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Narrow screens: the cards stacked as wide rows. Not on a phone on its
     side (lib/layout.ts `flat`), too short for three: there they stand in a
     row as on wider screens, smaller (below). Always at a phone's width,
     though (560 and under, short or not: no phone on its side is that
     narrow, the smallest 568), where three tall cards would be squeezed
     narrower than their emblems (the card bench's frame on a phone). */
  @media (max-width: 560px), (max-width: 700px) and (orientation: portrait), (max-width: 700px) and (min-height: 501px) {
    .cards {
      grid-template-columns: 1fr;
      width: min(360px, 100%);
      gap: 0.9rem;
    }
    .frame {
      display: flex;
      align-items: center;
      height: auto;
      /* The emblem 62 in and the divider halfway to the name (ROW). */
      padding: 15px 22px;
      gap: 32px;
      /* No window in a row: the warm glow sits round the emblem instead. */
      background:
        radial-gradient(circle at 62px 50%, color-mix(in srgb, var(--warm) 28%, transparent), transparent 74px),
        radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
        linear-gradient(170deg, #211912, #0d0a07 70%);
    }
    .card[data-find='flare'] .frame {
      background:
        radial-gradient(circle at 62px 50%, color-mix(in srgb, var(--warm) 32%, transparent), transparent 74px),
        radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
        linear-gradient(170deg, #26110f, #0e0607 70%);
    }
    .card.dm .frame {
      background:
        radial-gradient(circle at 62px 50%, color-mix(in srgb, var(--warm) 28%, transparent), transparent 74px),
        radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
        linear-gradient(170deg, #22110d, #0d0706 70%);
    }
    .icon {
      position: relative;
      top: auto;
      flex: none;
      width: 80px;
      height: 80px;
      /* The emblem, and its companions and their places, at a row's size. */
      --e-s: 0.58;
    }
    .glyph {
      width: 74px;
      height: 74px;
    }
    /* A row has no room for an item to grow. */
    .glyph.fit {
      --e-k: min(var(--e-kin, 1), 1);
    }
    .title {
      position: static;
      display: block;
      height: auto;
      flex: 1;
      text-align: left;
    }
    /* No plate to fit in a row: a long name at the size of the others. */
    .title.long {
      --name-k: 1;
      letter-spacing: 0.04em;
    }
    .filigree {
      --at: 0.5px;
      --end: 20px;
      inset: 3px;
    }
    .corners {
      background-size: 20px 20px;
    }
    .card.dm .corners {
      -webkit-mask-size: 20px 20px;
      mask-size: 20px 20px;
    }
    /* The vein's crystals rise at the row's far end: the name keeps clear of them. */
    .card[data-find='azurite'] .title {
      padding-right: 56px;
    }
    .find-tag {
      display: none;
    }
    .find-tag-row {
      display: block;
      margin-bottom: 2px;
      font-size: 0.6rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--f);
    }
    .back {
      transform: rotateX(180deg);
    }
    .card.mine:not(:global(.down)):hover .frame {
      transform: translateX(6px);
    }
    /* Rows: the votes hang off the row's lower right edge, and the rows part a little more for them. */
    .card {
      position: relative;
    }
    .votes {
      position: absolute;
      right: 14px;
      bottom: -11px;
      min-height: 0;
      margin: 0;
    }
    .choose.coop .cards {
      gap: 1.25rem;
    }
    .card.voted .frame,
    .card.voted .glow {
      transform: translateX(6px);
    }
  }

  /* Short desktop windows: the same gap under the prompt as under the question's task line. */
  @media (min-width: 761px) and (max-height: 820px) {
    .choose {
      gap: 1rem;
    }
    /* A vein's lamp a little smaller, as on the question's task line. */
    .line .prompt {
      padding-inline: 54px;
    }
    .line .clock :global(.timer) {
      width: 46px;
      height: 46px;
    }
    .line .clock :global(.timer span) {
      font-size: 1.05rem;
    }
  }
  /* A phone on its side (lib/layout.ts `flat`, from 561 wide; see the rows
     above): the tall cards in a row,
     scaled to the height left under the banner, step by step (zoom takes no
     length), one size for every turn at a height (a find, the team's vote
     or a duel never shrinks them) and never so small that their names stop
     reading (0.66: the name at about 11px, Apple's least; a screen shorter
     than a phone's browser leaves on its side scrolls a little). The step
     is --z; --card-z follows it. In Delve the cards stay centred, as at
     every depth, what the finds give beside them where there's room (under
     them where not) and the vote's state under them. (.coop too, to
     outweigh the short windows' own size for it above.) */
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    .choose,
    .choose.coop {
      gap: 0.5rem;
      --z: 0.9;
      --card-z: var(--z);
    }
    .prompt {
      font-size: 1.05rem;
    }
    /* A vein's lamp as on the question's task line: smaller, lifted toward
       the banner's row, the line as tall as that one, so the ring centres where it does there. */
    .line .prompt {
      padding-inline: 44px;
      line-height: 1.3;
    }
    .line .clock {
      translate: 0 calc(-50% - 7px);
    }
    .line .clock :global(.timer) {
      width: 34px;
      height: 34px;
    }
    .line .clock :global(.timer span) {
      font-size: 0.85rem;
    }
    .note {
      font-size: 0.85rem;
    }
    /* What each find gives, side by side in one row under the cards, each
       told by its find's colour and tag; the standing lock rule makes way
       for them (every other depth shows it). */
    .choose.delve {
      gap: 0.4rem;
    }
    .choose.delve .find-notes {
      display: flex;
      flex-flow: row wrap;
      justify-content: center;
      align-items: flex-start;
      gap: 0.3rem 1.6rem;
      margin-top: 0;
    }
    .choose.delve .find-notes .find-note {
      /* Sharing the row (never wrapping onto a second), each at most 22rem. */
      flex: 1 1 0;
      max-width: 22rem;
      font-size: 0.8rem;
      line-height: 1.25;
    }
    .choose.delve .find-notes .note.muted {
      flex-basis: 100%;
    }
    .choose.delve .find-notes ~ .note {
      display: none;
    }
    /* The team's vote: its line clear of the seals that hang off the cards'
       feet, on one line however many it waits for. */
    .choose.coop .vote-status {
      margin-top: 0.55rem;
      max-width: 100%;
      flex-wrap: nowrap;
      white-space: nowrap;
    }
    .choose.coop .vote-status .live > span:not(.sr) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  /* Room enough across (`beside`: two notes at most; the room the game has
     left, the notch's side taken off, so the slot is the container: Game's
     .cards-slot): the notes stand beside the cards, in the room left and
     right of them, each on its card's side, the cards no larger than 0.7
     for it, and the lock rule keeps its line. */
  @container slot (min-width: 780px) {
    .choose.beside {
      --card-z: min(var(--z), 0.7);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      /* (What comes under the cards takes a row each, only when it's there.) */
      grid-template-areas:
        'prompt prompt prompt'
        'left cards right';
      align-items: center;
    }
    /* (.delve too, to outweigh the short screens' gaps after this.) */
    .choose.delve.beside {
      column-gap: 2.6rem;
    }
    .choose.beside .prompt,
    .choose.beside .line {
      grid-area: prompt;
    }
    .choose.beside .cards {
      grid-area: cards;
    }
    .choose.beside .find-notes {
      display: contents;
    }
    .choose.beside .find-notes .find-note {
      max-width: 15rem;
      font-size: 0.85rem;
      line-height: 1.3;
    }
    .choose.beside .find-note[data-side='left'] {
      grid-area: left;
      justify-self: end;
      text-align: right;
    }
    .choose.beside .find-note[data-side='right'] {
      grid-area: right;
      justify-self: start;
      text-align: left;
    }
    .choose.beside .find-notes .note.muted,
    .choose.beside .vote-status,
    .choose.beside .find-notes ~ .note {
      grid-column: 1 / -1;
    }
    .choose.beside .find-notes ~ .note {
      display: block;
    }
  }
  @media (orientation: landscape) and (max-height: 500px) and (min-width: 561px) {
    /* A duel's one card: what is going on and its note beside it, as Delve's
       column is, so the duel's strip over the banner takes no size from it. */
    .choose.duel {
      display: grid;
      grid-template-columns: auto minmax(0, 300px);
      grid-template-areas:
        'cards prompt'
        'cards note';
      justify-content: center;
      column-gap: 1.4rem;
      row-gap: 0.5rem;
    }
    .choose.duel .cards {
      grid-area: cards;
    }
    .choose.duel .prompt {
      grid-area: prompt;
      align-self: end;
      text-align: left;
    }
    .choose.duel > .note {
      grid-area: note;
      align-self: start;
      text-align: left;
    }
  }
  @media (orientation: landscape) and (max-height: 440px) and (min-width: 561px) {
    .choose,
    .choose.coop {
      --z: 0.82;
    }
  }
  @media (orientation: landscape) and (max-height: 400px) and (min-width: 561px) {
    .choose,
    .choose.coop {
      --z: 0.74;
    }
    /* Delve has its notes or its vote under the cards. */
    .choose.delve {
      --z: 0.71;
    }
    /* The team's vote, clear of the seals under the cards. */
    .choose.coop {
      --z: 0.66;
    }
  }
  @media (orientation: landscape) and (max-height: 370px) and (min-width: 561px) {
    .choose,
    .choose.coop,
    .choose.delve {
      --z: 0.7;
    }
  }
  @media (orientation: landscape) and (max-height: 350px) and (min-width: 561px) {
    .choose,
    .choose.coop,
    .choose.delve {
      --z: 0.66;
      gap: 0.25rem;
    }
    /* The team's vote has a line more to fit, clear of the seals under the cards. */
    .choose.coop {
      --z: 0.6;
    }
    .choose.delve {
      gap: 0.2rem;
    }
  }
  /* A phone upright (lib/layout.ts `upright`): the game fits the screen
     (Game.svelte), the rows at their full size, so what stands round them
     comes a little closer: a find's notes in a smaller, tighter line, and
     the standing lock rule makes way for them (every other depth shows it),
     as on a phone on its side. */
  @media (orientation: portrait) and (max-width: 640px) {
    .choose,
    .choose.coop,
    .choose.delve {
      gap: 1rem;
    }
    /* The question's task line's size (QuestionView), as everywhere. */
    .prompt {
      font-size: 1.1rem;
      line-height: 1.3;
    }
    /* (Together, the rows keep room between them for the seals that hang off their feet.) */
    .choose.delve:not(.coop):has(.find-notes) .cards {
      gap: 0.6rem;
    }
    .choose.delve .find-notes .find-note {
      font-size: 0.9rem;
      line-height: 1.3;
    }
    .choose.delve .find-notes ~ .note {
      display: none;
    }
    .choose.delve:has(.find-notes) {
      gap: 0.55rem;
    }
    .find-notes {
      gap: 0.25rem;
    }
    /* The team's vote: its line on one line however many it waits for
       (the clock, then whom), and the lock rule under it read as one block
       of small print, as on a phone on its side. */
    .choose.coop {
      gap: 0.6rem;
    }
    .choose.coop .cards {
      gap: 0.95rem;
    }
    .choose.coop .vote-status {
      max-width: 100%;
      flex-wrap: nowrap;
      white-space: nowrap;
      margin-top: 0;
    }
    .choose.coop .vote-status .live > span:not(.sr) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vote-status + .note {
      margin-top: -0.3rem;
    }
  }
</style>
