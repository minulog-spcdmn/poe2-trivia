<script lang="ts">
  // The other players' pointers, live over the game (lib/cursors.ts), and
  // this device's own, sent for them to see. Each pointer is placed on the
  // element it was over (data-cursor), wherever that element is on this
  // screen, or, where this screen hasn't that one, on the next one round it
  // that it has; and glides between the updates (twenty a second) so it moves
  // smoothly. A tap on a phone shows where it landed, as the dart pressed, for a moment.
  // While a new zone's cards are on their way (its title card over the game,
  // lib/dealing.svelte.ts) nobody points: this one isn't sent, and the
  // others' fade out, to come back where they are as the cards are dealt.
  import { onMount } from 'svelte';
  import { RateLimit } from '../lib/protocol';
  import { session } from '../lib/session.svelte';
  import { dealing } from '../lib/dealing.svelte';
  import { peerCursors } from '../lib/peerCursors.svelte';
  import { BEHIND_MS, GAME_ANCHOR, HELD_WEIGHT, LANDING_SPEED, LIT, MOUSE, POINTER_BURST, POINTER_RATE, PRESSED, SEND_EVERY_MS, TAP, actionOf, anchorName, besideHops, besideWeight, blended, cursorKey, cursorsLive, fromAnchor, fromBeside, handAt, handOn, hopsOf, litOf, leaned, moveOn, trailAt, trailIndex, wayLeft, closeMs, closeOff, type CursorAt, type Lean, type Off, type PointerKind } from '../lib/cursors';
  import { playerColor } from '../lib/ui';
  import { portalToPage } from '../lib/portal';
  import { anchorAt, clickableAt, screenHeight } from '../lib/pointerAnchor';
  import { scrollFollow } from '../lib/scrollFollow';
  import { HAND, HAND_PRESSED, PAD_X, PAD_Y, POINTER, PRESS_SINK, SIZE, WEIGHT } from '../lib/pointerArt';

  /**
   * A pointer is drawn a little behind (cursors.ts BEHIND_MS), along a curve
   * through its last few places (cursors.ts trailAt), and then catches up
   * with that this quickly (ms to cover about 2/3 of the way), smoothing
   * what's left.
   */
  const GLIDE_MS = 20;
  /**
   * It moves as its player's hand moved, on the game as a whole (its
   * outermost anchor), wherever its place lies here: how far its place lies
   * off that is made up smoothly as its hand goes, and, as its hand comes to
   * rest on something, evenly along the way it still goes there, so it's there
   * as its hand is (cursors.ts leaned). Where the two screens set things alike,
   * that's nothing; where they set them apart (the winner's end screen and a
   * loser's, a host's lobby and a guest's), it doesn't jerk about over what
   * only one has, nor swoop or creep on as its hand stops.
   */
  /**
   * A pointer that jumped (cursors.ts moveOn: placed on another element far
   * from where it was going, the two screens placing things apart, or leaping
   * on the same one) doesn't jump here: it goes on from where it was going,
   * and bends over to its place as a hand reaching there would (cursors.ts
   * closeOff, closeMs), quickly, its hand at rest or not. Going on beside it
   * for long (or creeping there once its hand stood still), it pointed at
   * what its player wasn't on; lunging at it, it looked thrown.
   */
  /** A pointer that hasn't moved for this long dims (ms); it's only hidden once its player leaves the page. */
  const IDLE_MS = 5000;
  /** How long a tap shows (ms). */
  const TAP_MS = 1100;
  /** A press shows at least this long (ms), so a quick click is still seen (presses and releases are sent at once). */
  const PRESS_SHOW_MS = 120;
  /** The newest press shown of each pointer (its trail's time), so each is shown once; one heard longer ago than this (ms, a tab out of sight) isn't. */
  const pressSeen = new Map<string, number>();
  const PRESS_FRESH_MS = 250;
  /** A still pointer is looked at again this often, for what moved under it (the next turn, a scroll). */
  const RECHECK_MS = 500;

  const s = $derived(session.state!);
  const me = $derived(session.myPlayerId);
  const live = $derived(session.status === 'ready' && cursorsLive(s));
  /** Only players point (a spectator could hint the answer), and nobody while a new zone's cards are on their way. */
  const pointing = $derived(live && !!me && s.players.some((p) => p.id === me) && !dealing.held);
  const shown = $derived(
    live
      ? peerCursors.keys.flatMap((key) => {
          const p = s.players.find((o) => o.id !== me && cursorKey(o.id) === key);
          return p ? [{ key, name: p.name, color: playerColor(p.hue) }] : [];
        })
      : [],
  );

  $effect(() => {
    if (!live) peerCursors.clear();
  });

  // ---- this device's pointer ------------------------------------------

  let x = 0;
  let y = 0;
  /**
   * When it was there (its event's time), if it moved since it was last
   * sent: sent with it, not the time it goes. It goes on a timer of its own,
   * up to a frame after the move, and a place timed by when it went was
   * drawn that much off its time, the pointer surging and stalling.
   */
  let movedAt: number | null = null;
  /** The mouse is over the page; its main button is held. */
  let over = false;
  let held = false;
  /** Pressed since the last update: sent as pressed even if let go meanwhile (a click is quicker than an update, when one has to wait). */
  let clicked = false;
  /** What the host takes (cursors.ts POINTER_RATE): past it a release would be dropped and the pointer left pressed, so what's past it waits. */
  const budget = new RateLimit(POINTER_RATE, POINTER_BURST);
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** What was sent last, so a pointer that stays put isn't sent again. */
  let sent = 'null';

  function flush() {
    timer = null;
    if (!dirty) return;
    dirty = false;
    // Over something this player can click, it goes as the hand, as their own cursor is.
    const at = pointing && over ? anchorAt(x, y, ((held || clicked ? PRESSED : MOUSE) + (clickableAt(x, y) ? LIT : 0)) as PointerKind) : null;
    const key = JSON.stringify(at);
    // (Not moved since: where it is now, a recheck's or a press's.)
    const when = movedAt ?? performance.now();
    if (key !== sent) {
      if (!budget.take()) {
        // Clicking faster than the host takes: this goes once it does.
        dirty = true;
        timer = setTimeout(flush, 1000 / POINTER_RATE);
        return;
      }
      sent = key;
      movedAt = null;
      session.pointAt(at, when);
    }
    // Pressed and let go before this went: the release goes with the next one.
    if (clicked && !held) dirty = true;
    clicked = false;
    timer = setTimeout(flush, SEND_EVERY_MS);
  }

  /** Something may have moved: sent at once, or with the next update if one just went; a press or a release (`now`) at once whatever. */
  function poke(now = false) {
    dirty = true;
    if (now && timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!timer) flush();
  }

  $effect(() => {
    void pointing;
    poke();
  });

  onMount(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (held && !(e.buttons & 1)) held = false;
      x = e.clientX;
      y = e.clientY;
      movedAt = e.timeStamp;
      over = true;
      poke();
    };
    // The main button held shows as the dart pressed, on the others' screens too.
    const press = (e: PointerEvent, on: boolean) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || held === on) return;
      held = on;
      // Where it is, though it hasn't moved since it came back to the page.
      x = e.clientX;
      y = e.clientY;
      movedAt = e.timeStamp;
      over = true;
      if (on) clicked = true;
      poke(true);
    };
    const down = (e: PointerEvent) => press(e, true);
    const up = (e: PointerEvent) => press(e, false);
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pointing) return;
      const at = anchorAt(e.clientX, e.clientY, TAP);
      if (!at) return;
      session.pointAt(at);
      // A tap is shown once and fades by itself; the next one is its own, even on the same spot.
      sent = 'null';
    };
    // Off the page (relatedTarget is null leaving the window), or away from it.
    const out = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && !e.relatedTarget) {
        over = false;
        poke();
      }
    };
    const hidden = () => {
      if (document.hidden) {
        over = false;
        poke();
      }
    };
    const recheck = () => over && poke();
    const every = setInterval(recheck, RECHECK_MS);
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', tap, { passive: true });
    addEventListener('pointerdown', down, { passive: true, capture: true });
    addEventListener('pointerup', up, { passive: true, capture: true });
    document.addEventListener('pointerout', out);
    document.addEventListener('visibilitychange', hidden);
    addEventListener('scroll', recheck, { passive: true, capture: true });
    return () => {
      clearInterval(every);
      if (timer) clearTimeout(timer);
      removeEventListener('pointermove', move);
      removeEventListener('pointerdown', tap);
      removeEventListener('pointerdown', down, { capture: true });
      removeEventListener('pointerup', up, { capture: true });
      document.removeEventListener('pointerout', out);
      document.removeEventListener('visibilitychange', hidden);
      removeEventListener('scroll', recheck, { capture: true });
      if (sent !== 'null') session.pointAt(null);
    };
  });

  // ---- the others' pointers -------------------------------------------

  const els: Record<string, HTMLElement> = {};
  /** Where each pointer is drawn now, gliding toward where it was heard to be. */
  /**
   * Where each is drawn; what its place drawn is on, and what its newest place is on; how far it's drawn off its place here after a jump, closing, and in how long (JUMP_PX); where its place was last frame, the one
   * before, and the time between them; its press shown until;
   * whether it's set in the page (stuck: its places are then the page's, not the screen's), and whether its element scrolls with the page;
   * its element's top and the page's scroll last frame.
   */
  const drawn = new Map<
    string,
    {
      x: number;
      y: number;
      tap: number;
      code: number;
      box: number;
      off: Off;
      offMs: number;
      px: number;
      py: number;
      qx: number;
      qy: number;
      pdt: number;
      pressUntil: number;
      page: boolean;
      follows: boolean;
      top: number;
      scroll: number;
    }
  >();
  /** How far each is drawn off its hand's own path (cursors.ts leaned), and where that path was last frame. */
  const leaning = new Map<string, Lean & { hu: [number, number]; hx: number; hy: number }>();

  /**
   * A phone scrolls the page on its own, ahead of the frames drawn here, so
   * a pointer fixed to the screen trails what it's on as the page scrolls,
   * by as far as it goes in a frame or two. One on something that scrolls
   * with the page is set in the page instead (in #app, and clipped with it),
   * and scrolls along between frames; one on something that stays put (the
   * bar pinned to the top in a game, the dock at the bottom) stays fixed to
   * the screen. Told apart by how its element moves as the page scrolls
   * (lib/scrollFollow.ts), and, before that's seen, by whether it's in
   * something fixed or sticky. One held at the screen's edge (its place
   * here is off it) stays fixed there.
   */
  function stuck(el: Element) {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  }

  /** An anchor's copy on this screen, its box, and whether it holds no other anchor. */
  type Found = { box: DOMRect; el: HTMLElement; leaf: boolean };

  /** Where the anchor `code` is on this screen (its first copy not on its way out, with a size), and that copy, or null when it isn't; once a frame. */
  function boxOf(code: number, cache: Map<number, Found | null>) {
    if (cache.has(code)) return cache.get(code)!;
    const name = anchorName(code);
    let found: Found | null = null;
    for (const n of name ? document.querySelectorAll<HTMLElement>(`[data-cursor="${name}"]`) : []) {
      if (n.closest('[inert]')) continue;
      const r = n.getBoundingClientRect();
      if (r.width && r.height) {
        found = { box: r, el: n, leaf: !n.querySelector('[data-cursor]') };
        break;
      }
    }
    cache.set(code, found);
    return found;
  }

  /** Where a pointer is here, what it's on, and whether that's the very thing it's on there (its own anchor, holding no other). */
  type Place = { code: number; x: number; y: number; on: Found; exact?: boolean };

  /**
   * Where its hand is here on the game as a whole (leaned), and as a
   * desktop's (cursors.ts handOn); off the game (the header over it), where
   * its place `q` is, measured by the game all the same, so its way is
   * measured alike on it and off it. Null when this screen has no game.
   */
  function handOf(at: CursorAt, q: Place, cache: Map<number, Found | null>, screenH: number): { here: [number, number]; on: [number, number] } | null {
    const game = boxOf(GAME_ANCHOR, cache);
    if (!game) return null;
    const hop = hopsOf(at).find(([code]) => code === GAME_ANCHOR);
    if (!hop) return { here: [q.x, q.y], on: handAt(q.x, q.y, game.box, screenH) };
    return { here: fromAnchor(GAME_ANCHOR, hop[1], hop[2], game.box, screenH), on: handOn(hop[1], hop[2]) };
  }

  /**
   * Where a pointer at `at` is on this screen (cursors.ts): on its own
   * anchor, where this screen has it and it holds no other; otherwise set by
   * the anchors beside it and the first of those round it this screen has
   * (blended), and on whichever counts most. Null when it has none.
   */
  function placeOf(at: CursorAt, cache: Map<number, Found | null>, screenH: number): Place | null {
    let round: Place | null = null;
    for (const [i, [code, x, y]] of hopsOf(at).entries()) {
      const on = boxOf(code, cache);
      if (!on) continue;
      const [px, py] = fromAnchor(code, x, y, on.box, screenH);
      round = { code, x: px, y: py, on };
      if (i === 0 && on.leaf) return { ...round, exact: true };
      break;
    }
    const by: (Place & { w: number })[] = round ? [{ ...round, w: HELD_WEIGHT }] : [];
    for (const [code, x, y] of besideHops(at)) {
      const on = boxOf(code, cache);
      if (!on) continue;
      const b = fromBeside(x, y, on.box);
      const w = besideWeight(b.off);
      if (w > 0) by.push({ code, x: b.x, y: b.y, on, w });
    }
    const spot = blended(by);
    if (!spot) return round;
    const most = by.reduce((a, b) => (b.w > a.w ? b : a));
    return { code: most.code, x: spot[0], y: spot[1], on: most.on };
  }

  $effect(() => {
    const list = shown;
    if (!list.length) {
      drawn.clear();
      leaning.clear();
      pressSeen.clear();
      return;
    }
    for (const k of drawn.keys()) if (!list.some((c) => c.key === k)) drawn.delete(k);
    for (const k of leaning.keys()) if (!list.some((c) => c.key === k)) leaning.delete(k);
    for (const k of pressSeen.keys()) if (!list.some((c) => c.key === k)) pressSeen.delete(k);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // (A frame's time can be from before this loop began, when it begins anew with the game's next turn: never
      // backwards, which would throw the pointers away from where they're going.)
      const dt = Math.max(0, now - last);
      const step = 1 - Math.exp(-dt / GLIDE_MS);
      last = Math.max(last, now);
      const boxes = new Map<number, Found | null>();
      const screenH = screenHeight();
      // All read first (where each pointer's elements are, their styles), then all written at once: a read after
      // one pointer was moved had the page's styles worked out again, once a pointer.
      const writes: (() => void)[] = [];
      for (const c of list) {
        const el = els[c.key];
        const p = peerCursors.at.get(c.key);
        if (!el || !p) continue;
        const kind = p.at[3];
        const touch = actionOf(kind) === TAP;
        const age = now - p.moved;
        if (touch && age > TAP_MS) {
          peerCursors.set(c.key, null);
          continue;
        }
        const place = placeOf(p.at, boxes, screenH);
        const due = p.trail.filter((x) => x.t <= now - BEHIND_MS).at(-1) ?? p.trail[0];
        const dueKind = due?.at[3] ?? kind;
        // A press just heard: drawn where it is now, not behind, so the click shows where it happens, as it happens
        // (what it pressed goes as it's let go, and a pointer still on its way there would seem to click from afar).
        // Shown while it's held, and once let go for PRESS_SHOW_MS at least: a press and its release are sent
        // at once (lib/session.svelte.ts), so a quick click shows as quick. One that came and went between
        // two frames is shown all the same, once.
        const pressNow = actionOf(kind) === PRESSED;
        const lastPress = p.trail.findLast((x) => actionOf(x.at[3]) === PRESSED)?.t ?? -1;
        const pressing = pressNow || (lastPress > (pressSeen.get(c.key) ?? -1) && now - lastPress < PRESS_FRESH_MS);
        const prev = drawn.get(c.key);
        if (!place) {
          // Its elements went (the card picked, the screen moved on): it stays where it's drawn until it moves again.
          writes.push(() => el.classList.toggle('lost', !prev));
          if (prev) {
            if (pressing) prev.pressUntil = now + PRESS_SHOW_MS;
            if (lastPress >= 0) pressSeen.set(c.key, lastPress);
            const pressed = now < prev.pressUntil;
            writes.push(() => el.classList.toggle('pressed', pressed));
          }
          continue;
        }
        if (lastPress >= 0) pressSeen.set(c.key, lastPress);
        // Pressed, or let go so lately its press still shows: drawn where it is, with the press (the release came at
        // once after it, often in the same frame, and the place a little behind is where it was before the click).
        const clicking = pressing || (!!prev && now < prev.pressUntil);
        writes.push(() => el.classList.remove('lost'));
        const box = place.code;
        // Its trail on this screen (each place on its own elements, where they're still here), and its hand's, drawn a little behind.
        const ps: [number, number][] = [];
        const hs: [number, number][] = [];
        const hu: [number, number][] = [];
        const ts: number[] = [];
        const on: number[] = [];
        let exact = false;
        for (const { at, t } of p.trail) {
          const q = placeOf(at, boxes, screenH);
          if (!q) continue;
          exact = !!q.exact;
          ps.push([q.x, q.y]);
          const h = handOf(at, q, boxes, screenH);
          hs.push(h?.here ?? [q.x, q.y]);
          hu.push(h?.on ?? [q.x, q.y]);
          ts.push(t);
          on.push(q.code);
        }
        const atOnce = touch || clicking || !ps.length;
        // Moving as its hand did, and making up how far its place lies off that as it goes (cursors.ts leaned).
        const hand = atOnce ? handOf(p.at, place, boxes, screenH) : null;
        const [hx, hy] = atOnce ? (hand?.here ?? [place.x, place.y]) : trailAt(hs, ts, now - BEHIND_MS);
        const ux = atOnce ? (hand?.on ?? [place.x, place.y]) : trailAt(hu, ts, now - BEHIND_MS);
        let lean = leaning.get(c.key);
        // How far its newest place lies off its hand's path (where it's drawn now, at a press or a tap).
        const off: [number, number] = atOnce ? [place.x - hx, place.y - hy] : [ps.at(-1)![0] - hs.at(-1)![0], ps.at(-1)![1] - hs.at(-1)![1]];
        if (!lean || atOnce) leaning.set(c.key, (lean = { x: off[0], y: off[1], ax: off[0], ay: off[1], hu: ux, hx, hy }));
        else {
          const moved = Math.hypot(ux[0] - lean.hu[0], ux[1] - lean.hu[1]);
          // Landing: its newest place on the very thing it's on there, its hand slowing there or come to rest (none
          // heard for two sends: one merely late, mid-way, isn't its hand stopping).
          const n = hu.length;
          const speed = n > 1 ? Math.hypot(hu[n - 1][0] - hu[n - 2][0], hu[n - 1][1] - hu[n - 2][1]) / Math.max(1, ts[n - 1] - ts[n - 2]) : 0;
          const landing = exact && (speed < LANDING_SPEED || now - p.moved > 2 * SEND_EVERY_MS);
          const step = Math.hypot(hx - lean.hx, hy - lean.hy);
          leaning.set(c.key, (lean = { ...leaned(lean, off, moved, wayLeft(hu, ts, now - BEHIND_MS, ux), dt, landing, step), hu: ux, hx, hy }));
        }
        const rx = hx + lean.x;
        const ry = hy + lean.y;
        // What the place drawn is on: whether it went over to another is told as it's drawn there, not as it's heard.
        const code = atOnce ? box : on[trailIndex(ts, now - BEHIND_MS)];
        let d = drawn.get(c.key);
        // Never off this screen, however far off the others' place lands here.
        const cx = Math.min(innerWidth - 16, Math.max(2, rx));
        const cy = Math.min(innerHeight - 20, Math.max(2, ry));
        // In the page or on the screen (stuck): whether its element scrolls with the page, by how it moved as the
        // page scrolled, or, new to it, by where it is; on the screen while held at its edge.
        const top = place.on.box.top;
        let follows = d && d.box === box ? d.follows : !stuck(place.on.el);
        const went = d && d.box === box ? scrollFollow(top - d.top, scrollY - d.scroll) : null;
        if (went) follows = went === 'page';
        const page = follows && cx === rx && cy === ry;
        const [sx, sy] = page ? [scrollX, scrollY] : [0, 0];
        if (d && page !== d.page) {
          // (Where it's drawn, and was, in the other's terms.)
          const [kx, ky] = page ? [scrollX, scrollY] : [-scrollX, -scrollY];
          d.x += kx;
          d.y += ky;
          d.px += kx;
          d.py += ky;
          d.qx += kx;
          d.qy += ky;
        }
        const tx = cx + sx;
        const ty = cy + sy;
        // A tap lands where it is; a pointer just come in starts where it is.
        if (!d || touch)
          drawn.set(c.key, (d = { x: tx, y: ty, tap: d?.tap ?? 0, code, box, off: { x: 0, y: 0, vx: 0, vy: 0 }, offMs: 0, px: tx, py: ty, qx: tx, qy: ty, pdt: 0, pressUntil: d?.pressUntil ?? 0, page, follows, top, scroll: scrollY }));
        else {
          // Where its place was going, had it gone on as it went (cursors.ts moveOn's measure).
          const k = d.pdt > 0 ? Math.min(2, dt / d.pdt) : 0;
          const ex = d.px + (d.px - d.qx) * k;
          const ey = d.py + (d.py - d.qy) * k;
          // Placed on another element far from where it was going, or leaping: it goes on from there (cursors.ts moveOn).
          if (moveOn(d, tx, ty, code, dt, !clicking)) {
            d.off.x += ex - tx;
            d.off.y += ey - ty;
            d.offMs = closeMs(Math.hypot(d.off.x, d.off.y));
          } else if (clicking) {
            // Gone at a press, so the click lands where it is.
            d.off = { x: 0, y: 0, vx: 0, vy: 0 };
          } else closeOff(d.off, dt, d.offMs);
          d.x += (tx + d.off.x - d.x) * step;
          d.y += (ty + d.off.y - d.y) * step;
        }
        d.page = page;
        d.box = box;
        d.follows = follows;
        d.top = top;
        d.scroll = scrollY;
        const position = page ? '' : 'fixed';
        const transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
        if (pressing) d.pressUntil = now + PRESS_SHOW_MS;
        const pressed = now < d.pressUntil;
        // Over something that player can click (their own screen says, with each update), the hand, as their own cursor is.
        const lit = litOf(dueKind);
        // Held down, it isn't idle, however still.
        const idle = !touch && actionOf(kind) !== PRESSED && age > IDLE_MS;
        const tapped = touch && d.tap !== p.moved;
        if (tapped) d.tap = p.moved;
        writes.push(() => {
          if (el.style.position !== position) el.style.position = position;
          el.style.transform = transform;
          el.classList.toggle('tap', touch);
          el.classList.toggle('pressed', pressed);
          el.classList.toggle('lit', lit);
          el.classList.toggle('idle', idle);
          // Struck, held a moment, then fading.
          if (tapped) el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: TAP_MS, easing: 'ease-in' });
        });
      }
      for (const write of writes) write();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="cursors" class:veiled={dealing.held} use:portalToPage aria-hidden="true" style:--pad-x={PAD_X} style:--pad-y={PAD_Y} style:--w={SIZE[0]} style:--h={SIZE[1]} style:--sink={PRESS_SINK}>
  {#each shown as c (c.key)}
    <div class="cursor" bind:this={els[c.key]} style:--c={c.color} data-behind-dialog>
      <!-- The dart (lib/pointerArt.ts) with its tip on the spot: a dark rim and ground, a glow under the lines.
           Over a button, the hand pointing instead; pressed (or a tap), the dart sinks a little, its hatched side struck solid,
           and the hand pushes its finger into the page, foreshortened and struck solid. -->
      <svg class="dart" viewBox="{-PAD_X} {-PAD_Y} {SIZE[0]} {SIZE[1]}" width={SIZE[0]} height={SIZE[1]}>
        <g class="body">
          <path class="ground" d={POINTER.outline} stroke-width={WEIGHT.rim} />
          <path class="glow" d={POINTER.outline} />
          <path class="wash" d={POINTER.outline} />
          <path class="side" d={POINTER.side} />
          <path class="line" d={POINTER.outline} stroke-width={WEIGHT.outline} />
          <path class="line ridge" d={POINTER.ridge} stroke-width={WEIGHT.ridge} />
          <path class="line hatch" d={POINTER.hatch} stroke-width={WEIGHT.hatch} />
        </g>
        <!-- The hand is drawn plain (lib/pointerArt.ts Art): fine lines, no glow, its talon struck solid. -->
        {#each [HAND, HAND_PRESSED] as h, i (i)}
          <g class="hand" class:down={i === 1}>
            <path class="ground" d={h.outline} stroke-width="2.4" />
            <path class="talon" d={i === 1 ? h.finger : h.talon} />
            <path class="line" d={h.outline} stroke-width="0.8" />
            <path class="line" d={h.creases} stroke-width="0.6" />
            <path class="line hatch" d={h.shade} stroke-width="0.45" />
          </g>
        {/each}
      </svg>
      <span class="name">{c.name}</span>
    </div>
  {/each}
</div>

<style>
  /* Over the whole page, in #app (see stuck): each pointer is set in it, or
     fixed to the screen. */
  .cursors {
    position: absolute;
    inset: 0;
    z-index: 80;
    pointer-events: none;
    overflow: clip;
    transition: opacity 0.3s;
  }
  /* Over a new zone's title card (z-index 60): out of sight at once, till the cards are dealt. Nobody points
     meanwhile (pointing, above), so each of the others' pointers goes once its player's screen stops sending it;
     one heard from a screen that reaches the deal sooner stays out of sight till this one does. */
  .cursors.veiled {
    opacity: 0;
    transition: none;
  }
  .cursor {
    position: absolute;
    left: 0;
    top: 0;
    will-change: transform;
    transition: opacity 0.4s;
  }
  .cursor:global(.idle) {
    opacity: 0.6;
  }
  .cursor:global(.lost) {
    opacity: 0;
  }
  .dart {
    display: block;
    margin: calc(-1px * var(--pad-y)) 0 0 calc(-1px * var(--pad-x));
    overflow: visible;
    fill: none;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .ground {
    fill: rgba(10, 9, 8, 0.9);
    stroke: var(--bg);
  }
  .glow {
    stroke: var(--c);
    stroke-width: 2;
    opacity: 0.22;
    filter: blur(1px);
  }
  .line {
    stroke: var(--c);
    transition: stroke 0.15s;
  }
  .wash {
    fill: var(--c);
    opacity: 0;
    transition: opacity 0.15s;
  }
  /* Over something that can be clicked: gilded, the lines struck paler and glowing brighter. */
  .cursor:global(.lit) .line {
    stroke: color-mix(in srgb, var(--c), #fff4e0 35%);
  }
  .cursor:global(.lit) .wash {
    opacity: 0.2;
  }
  .cursor:global(.lit) .glow {
    opacity: 0.5;
    stroke-width: 2.6;
  }
  /* Over something that can be clicked: the hand instead of the dart, pressing when the button is held. */
  .hand,
  .cursor:global(.lit) .body,
  .cursor:global(.lit.pressed) .hand:not(.down) {
    display: none;
  }
  .cursor:global(.lit) .hand:not(.down),
  .cursor:global(.lit.pressed) .hand.down {
    display: inline;
  }
  /* Sharp claws would throw long mitres: the hand's corners are rounded. */
  .hand {
    stroke-linejoin: round;
  }
  /* The button held, or a tap: the dart sinks a little about its tip. */
  .body {
    transform-origin: 0 0;
    transition: transform 0.12s var(--ease-out);
  }
  .talon {
    fill: color-mix(in srgb, var(--c), #fff4e0 35%);
  }
  .cursor:global(.pressed) .body,
  .cursor:global(.tap) .body {
    transform: scale(var(--sink));
  }
  /* Lit a little, as the player's own: the lines paler, a soft close glow, the hatched side struck solid. */
  .side {
    fill: color-mix(in srgb, var(--c), #fff4e0 35%);
    opacity: 0;
  }
  .cursor:global(.pressed) .side,
  .cursor:global(.tap) .side {
    opacity: 1;
  }
  .cursor:global(.pressed) .body .line,
  .cursor:global(.tap) .body .line {
    stroke: color-mix(in srgb, var(--c), #fff4e0 35%);
  }
  .cursor:global(.pressed) .body .glow,
  .cursor:global(.tap) .body .glow {
    opacity: 0.35;
    stroke-width: 2.2;
    filter: blur(1.6px);
  }
  /* Hatching: round ends, a little fainter (as the player's own, lib/ownCursor.ts). */
  .hatch {
    stroke-linecap: round;
    opacity: 0.85;
  }
  /* The name on a dark plate edged in the player's colour, as on the scoreboard. */
  .name {
    position: absolute;
    left: 13px;
    top: 21px;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 0.5em 0.1em;
    border: 1px solid color-mix(in srgb, var(--c), transparent 45%);
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.85);
    color: color-mix(in srgb, var(--c), #fff4e0 45%);
    font: 0.82rem/1.35 var(--font-body);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  /* Smaller on phones, so they cover less of the answers. */
  @media (max-width: 640px) {
    .dart {
      width: calc(var(--w) * 0.8px);
      height: calc(var(--h) * 0.8px);
      margin: calc(-0.8px * var(--pad-y)) 0 0 calc(-0.8px * var(--pad-x));
    }
    .name {
      left: 10px;
      top: 17px;
      font-size: 0.74rem;
    }
  }
</style>
