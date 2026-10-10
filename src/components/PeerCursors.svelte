<script lang="ts">
  // The other players' pointers, live over the game (lib/cursors.ts), and
  // this device's own, sent for them to see. Each pointer is placed on the
  // element it was over (data-cursor), wherever that element is on this
  // screen, and glides between the updates (ten a second) so it moves
  // smoothly. A tap on a phone shows where it landed, as the dart pressed, for a moment.
  import { onMount } from 'svelte';
  import { session } from '../lib/session.svelte';
  import { peerCursors } from '../lib/peerCursors.svelte';
  import { MOUSE, PRESSED, SEND_EVERY_MS, TAP, anchorCode, anchorName, cursorKey, cursorsLive, fromAnchor, toAnchor, type CursorAt, type PointerKind } from '../lib/cursors';
  import { playerColor } from '../lib/ui';
  import { portal } from '../lib/portal';
  import { HAND, HAND_PRESSED, PAD_X, PAD_Y, POINTER, PRESS_SINK, SIZE, WEIGHT } from '../lib/pointerArt';

  /** How quickly a pointer catches up with where it was last heard to be (ms to cover about 2/3 of the way). */
  const GLIDE_MS = 70;
  /** A pointer that hasn't moved for this long dims, and after the next it's hidden (ms). */
  const IDLE_MS = 3000;
  const AWAY_MS = 15000;
  /** How long a tap shows (ms). */
  const TAP_MS = 1100;
  /** A still pointer is looked at again this often, for what moved under it (the next turn, a scroll). */
  const RECHECK_MS = 500;

  const s = $derived(session.state!);
  const me = $derived(session.myPlayerId);
  const live = $derived(session.status === 'ready' && cursorsLive(s));
  /** Only players point (a spectator could hint the answer). */
  const pointing = $derived(live && !!me && s.players.some((p) => p.id === me));
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
  /** The mouse is over the page; its main button is held. */
  let over = false;
  let held = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** What was sent last, so a pointer that stays put isn't sent again. */
  let sent = 'null';

  /** The anchor under a spot, or the game as a whole (null when outside it). */
  function measure(px: number, py: number, kind: PointerKind): CursorAt | null {
    // Through the cover middle-button scrolling lays over the page (lib/autoscroll.ts).
    const hit = document.elementsFromPoint(px, py).find((n) => !n.closest('.autoscroll'));
    let el = hit?.closest<HTMLElement>('[data-cursor]') ?? null;
    // Something on its way out (Svelte makes it inert) isn't on the other screens any more.
    if (el?.closest('[inert]')) el = null;
    el ??= document.querySelector<HTMLElement>('[data-cursor="game"]');
    const code = el ? anchorCode(el.dataset.cursor ?? '') : null;
    if (!el || code === null) return null;
    const r = el.getBoundingClientRect();
    if (px < r.left || px > r.right || py < r.top || py > r.bottom || !r.width || !r.height) return null;
    return [code, ...toAnchor(code, px, py, r, innerHeight), kind];
  }

  function flush() {
    timer = null;
    if (!dirty) return;
    dirty = false;
    const at = pointing && over ? measure(x, y, held ? PRESSED : MOUSE) : null;
    const key = JSON.stringify(at);
    if (key !== sent) {
      sent = key;
      session.pointAt(at);
    }
    timer = setTimeout(flush, SEND_EVERY_MS);
  }

  /** Something may have moved: sent at once, or with the next update if one just went. */
  function poke() {
    dirty = true;
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
      over = true;
      poke();
    };
    // The main button held shows as the dart pressed, on the others' screens too.
    const press = (e: PointerEvent, on: boolean) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || held === on) return;
      held = on;
      poke();
    };
    const down = (e: PointerEvent) => press(e, true);
    const up = (e: PointerEvent) => press(e, false);
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pointing) return;
      const at = measure(e.clientX, e.clientY, TAP);
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
  const drawn = new Map<string, { x: number; y: number; tap: number }>();

  function anchorFor(code: number, cache: Map<number, HTMLElement | null>) {
    if (cache.has(code)) return cache.get(code)!;
    const name = anchorName(code);
    const el = name ? ([...document.querySelectorAll<HTMLElement>(`[data-cursor="${name}"]`)].find((n) => !n.closest('[inert]')) ?? null) : null;
    cache.set(code, el);
    return el;
  }

  $effect(() => {
    const list = shown;
    if (!list.length) {
      drawn.clear();
      return;
    }
    for (const k of drawn.keys()) if (!list.some((c) => c.key === k)) drawn.delete(k);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const step = 1 - Math.exp(-(now - last) / GLIDE_MS);
      last = now;
      const anchors = new Map<number, HTMLElement | null>();
      for (const c of list) {
        const el = els[c.key];
        const p = peerCursors.at.get(c.key);
        if (!el || !p) continue;
        const [code, ax, ay, kind] = p.at;
        const touch = kind === TAP;
        const age = now - p.moved;
        if (touch && age > TAP_MS) {
          peerCursors.set(c.key, null);
          continue;
        }
        const anchor = anchorFor(code, anchors);
        el.classList.toggle('lost', !anchor);
        if (!anchor) {
          drawn.delete(c.key);
          continue;
        }
        const r = anchor.getBoundingClientRect();
        const [tx, ty] = fromAnchor(code, ax, ay, r, innerHeight);
        let d = drawn.get(c.key);
        // A tap lands where it is; a pointer just come in starts where it is.
        if (!d || touch) drawn.set(c.key, (d = { x: tx, y: ty, tap: d?.tap ?? 0 }));
        else {
          d.x += (tx - d.x) * step;
          d.y += (ty - d.y) * step;
        }
        el.style.transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
        el.classList.toggle('tap', touch);
        el.classList.toggle('pressed', kind === PRESSED);
        // Over something that can be clicked, it's gilded, as the player's own is.
        el.classList.toggle('lit', anchor.tagName === 'BUTTON');
        el.classList.toggle('idle', !touch && age > IDLE_MS);
        el.classList.toggle('away', !touch && age > AWAY_MS);
        if (touch && d.tap !== p.moved) {
          d.tap = p.moved;
          // Struck, held a moment, then fading.
          el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: TAP_MS, easing: 'ease-in' });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="cursors" use:portal aria-hidden="true" style:--pad-x={PAD_X} style:--pad-y={PAD_Y} style:--w={SIZE[0]} style:--h={SIZE[1]} style:--sink={PRESS_SINK}>
  {#each shown as c (c.key)}
    <div class="cursor" bind:this={els[c.key]} style:--c={c.color}>
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
  .cursors {
    position: fixed;
    inset: 0;
    z-index: 80;
    pointer-events: none;
    overflow: hidden;
  }
  .cursor {
    position: absolute;
    left: 0;
    top: 0;
    will-change: transform;
    transition: opacity 0.4s;
  }
  .cursor:global(.idle) {
    opacity: 0.45;
  }
  .cursor:global(.away),
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
