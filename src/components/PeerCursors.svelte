<script lang="ts">
  // The other players' pointers, live over the game (lib/cursors.ts), and
  // this device's own, sent for them to see. Each pointer is placed on the
  // element it was over (data-cursor), wherever that element is on this
  // screen, and glides between the updates (ten a second) so it moves
  // smoothly. A tap on a phone shows as a ripple where it landed.
  import { onMount } from 'svelte';
  import { session } from '../lib/session.svelte';
  import { peerCursors } from '../lib/peerCursors.svelte';
  import { SCALE, SEND_EVERY_MS, anchorCode, anchorName, cursorKey, cursorsLive, type CursorAt } from '../lib/cursors';
  import { playerColor } from '../lib/ui';
  import { portal } from '../lib/portal';

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
  /** The mouse is over the page. */
  let over = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** What was sent last, so a pointer that stays put isn't sent again. */
  let sent = 'null';

  /** The anchor under a spot, or the game as a whole (null when outside it). */
  function measure(px: number, py: number, touch: 0 | 1): CursorAt | null {
    let el = document.elementFromPoint(px, py)?.closest<HTMLElement>('[data-cursor]') ?? null;
    // Something on its way out (Svelte makes it inert) isn't on the other screens any more.
    if (el?.closest('[inert]')) el = null;
    el ??= document.querySelector<HTMLElement>('[data-cursor="game"]');
    const code = el ? anchorCode(el.dataset.cursor ?? '') : null;
    if (!el || code === null) return null;
    const r = el.getBoundingClientRect();
    if (px < r.left || px > r.right || py < r.top || py > r.bottom || !r.width || !r.height) return null;
    const at = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * SCALE);
    return [code, at((px - r.left) / r.width), at((py - r.top) / r.height), touch];
  }

  function flush() {
    timer = null;
    if (!dirty) return;
    dirty = false;
    const at = pointing && over ? measure(x, y, 0) : null;
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
      x = e.clientX;
      y = e.clientY;
      over = true;
      poke();
    };
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pointing) return;
      const at = measure(e.clientX, e.clientY, 1);
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
    document.addEventListener('pointerout', out);
    document.addEventListener('visibilitychange', hidden);
    addEventListener('scroll', recheck, { passive: true, capture: true });
    return () => {
      clearInterval(every);
      if (timer) clearTimeout(timer);
      removeEventListener('pointermove', move);
      removeEventListener('pointerdown', tap);
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
        const [code, ax, ay, touch] = p.at;
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
        const tx = r.left + (ax / SCALE) * r.width;
        const ty = r.top + (ay / SCALE) * r.height;
        let d = drawn.get(c.key);
        // A tap lands where it is; a pointer just come in starts where it is.
        if (!d || touch) drawn.set(c.key, (d = { x: tx, y: ty, tap: d?.tap ?? 0 }));
        else {
          d.x += (tx - d.x) * step;
          d.y += (ty - d.y) * step;
        }
        el.style.transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
        el.classList.toggle('tap', !!touch);
        el.classList.toggle('idle', !touch && age > IDLE_MS);
        el.classList.toggle('away', !touch && age > AWAY_MS);
        if (touch && d.tap !== p.moved) {
          d.tap = p.moved;
          el.querySelector('.ripple')?.animate(
            [
              { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.9 },
              { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 },
            ],
            { duration: TAP_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          );
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="cursors" use:portal aria-hidden="true">
  {#each shown as c (c.key)}
    <div class="cursor" bind:this={els[c.key]} style:--c={c.color}>
      <svg class="arrow" viewBox="0 0 16 21" width="16" height="21">
        <path d="M1.5 1.5 V16.5 L5.3 13 L8.1 19.4 L10.9 18.2 L8.1 11.9 L13.3 11.7 Z" />
      </svg>
      <span class="ripple"></span>
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
  /* The tip of the arrow sits on the spot. */
  .arrow {
    display: block;
    margin: -1.5px 0 0 -1.5px;
    overflow: visible;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }
  .arrow path {
    fill: var(--c);
    stroke: var(--bg);
    stroke-width: 1.3;
    stroke-linejoin: round;
  }
  .name {
    position: absolute;
    left: 12px;
    top: 18px;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 6px 2px;
    border-radius: 4px;
    background: var(--c);
    color: var(--bg);
    font: 500 0.8rem/1.2 var(--font-body);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .ripple {
    position: absolute;
    left: 0;
    top: 0;
    width: 44px;
    height: 44px;
    border: 2px solid var(--c);
    border-radius: 50%;
    opacity: 0;
    transform: translate(-50%, -50%);
  }
  /* A tap is the ripple and the name, no arrow (the classes are set each frame). */
  .cursor:global(.tap) > .arrow {
    display: none;
  }
  .cursor:global(.tap) > .name {
    left: 16px;
    top: 10px;
  }
  /* Smaller on phones, so they cover less of the answers. */
  @media (max-width: 640px) {
    .arrow {
      width: 13px;
      height: 17px;
    }
    .name {
      left: 10px;
      top: 15px;
      font-size: 0.72rem;
    }
  }
</style>
