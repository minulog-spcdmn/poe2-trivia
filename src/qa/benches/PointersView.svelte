<script lang="ts">
  // The pointers bench's view (./pointers.ts): two seats of one scene, each
  // the real game in a frame at its own size (qa.html?frame=...&pointers=,
  // frame/pointerRelay.ts), and between them the room: the moving player's
  // pointer as their game sends it, passed on as the host passes it on (the
  // newest of it in a batch every FLUSH_EVERY_MS, a press at once) over a
  // link a little late, to be drawn on the other's screen. The mouse over the
  // moving player's screen goes to the desk, for the other side of before and
  // after to move the same; the desk's keys pressed in a seat go to the desk.
  import { onMount } from 'svelte';
  import { deskOrigin, isFrameMessage, isRelayMessage, type HandMessage, type RelayMessage } from '../messages.ts';
  import { isSizeKey, sizeOf } from '../sizes.ts';
  import { FLUSH_EVERY_MS, actionOf, cursorKey, type CursorAt } from '../../lib/cursors';
  import { pid } from '../build/people';
  import type { PieceProps } from '../bench.ts';
  import { POINTER_SCREENS } from './pointers.ts';

  let { v, small }: PieceProps = $props();

  /** How late the link brings each batch (ms): at least, and as much again at most. */
  const LINK_MS = 15;
  const GAP = 20;
  const CAPTION = 26;

  const asked = new URLSearchParams(location.search);
  const desk = deskOrigin(asked);
  const PLAYERS = { host: { id: pid('Kalguur'), name: 'Kalguur', role: 'host' }, guest: { id: pid('Doryani'), name: 'Doryani', role: 'client' } };
  type Who = (typeof PLAYERS)['host'];

  const moving = $derived(v.moving === 'guest' ? PLAYERS.guest : PLAYERS.host);
  const watching = $derived(v.moving === 'guest' ? PLAYERS.host : PLAYERS.guest);
  const sizeA = $derived(sizeOf(isSizeKey(v.theirs) ? v.theirs : 'desktop'));
  const sizeB = $derived(sizeOf(isSizeKey(v.yours) ? v.yours : 'laptop'));

  /** A seat's address: the scene as one of its players sees it, at a size, sending or taking pointers. */
  function src(who: Who, size: string, pointers: 'send' | 'take', more: Record<string, string> = {}) {
    const screen = POINTER_SCREENS[String(v.screen)] ?? POINTER_SCREENS.lobby;
    const p = new URLSearchParams({ frame: pointers === 'send' ? 'pa' : 'pb', s: screen.scene, as: who.id, role: who.role, size, pointers, o: '0', ...more });
    for (const [k, val] of Object.entries(screen.k ?? {})) p.set(`k.${k}`, val);
    return `${location.pathname}?${p}`;
  }
  const srcA = $derived(src(moving, String(v.theirs), 'send', { hand: String(v.hand), speed: String(v.speed) }));
  const srcB = $derived(src(watching, String(v.yours), 'take'));

  let frameA = $state<HTMLIFrameElement>();
  let frameB = $state<HTMLIFrameElement>();
  let w = $state(innerWidth);
  let h = $state(innerHeight);

  /** Side by side or one over the other, whichever shows them larger. */
  const layout = $derived.by(() => {
    const W = w - 32;
    const H = h - 32;
    const row = Math.min((W - GAP) / (sizeA.w + sizeB.w), (H - CAPTION) / Math.max(sizeA.h, sizeB.h));
    const column = Math.min(W / Math.max(sizeA.w, sizeB.w), (H - GAP - 2 * CAPTION) / (sizeA.h + sizeB.h));
    return { row: row >= column, scale: Math.max(0.05, Math.min(1, Math.max(row, column))) };
  });

  // The room's newest of the moving player's pointer, not passed on yet, and the kind it last passed on.
  let latest: { at: CursorAt | null; ms: number } | null = null;
  let sentKind = -1;
  // Seats anew (another player moving, another scene): what the room held of the last one goes with them.
  $effect(() => {
    void [srcA, srcB];
    latest = null;
    sentKind = -1;
  });

  onMount(() => {
    if (small) return;
    const resize = () => ([w, h] = [innerWidth, innerHeight]);
    addEventListener('resize', resize);

    // The room: the newest of the moving player's pointer, in a batch every FLUSH_EVERY_MS (a press or a release at once).
    const pass = () => {
      if (!latest) return;
      const m: RelayMessage = { qa: 'pointer-in', key: cursorKey(moving.id), at: latest.at, ms: latest.ms };
      latest = null;
      const to = frameB?.contentWindow;
      setTimeout(() => to?.postMessage(m, location.origin), LINK_MS * (1 + Math.random()));
    };
    const batches = setInterval(pass, FLUSH_EVERY_MS);

    const heard = (e: MessageEvent) => {
      if (e.origin !== location.origin && e.origin !== desk) return;
      const m = e.data;
      if (e.source === frameA?.contentWindow && isRelayMessage(m)) {
        if (m.qa === 'pointer') {
          latest = { at: m.at, ms: m.ms };
          const kind = m.at ? actionOf(m.at[3]) : -1;
          if (kind !== sentKind) {
            sentKind = kind;
            pass();
          }
        } else if (m.qa === 'mouse') parent.postMessage(('gone' in m ? { qa: 'hand', gone: true } : { qa: 'hand', x: m.x, y: m.y }) satisfies HandMessage, desk);
      } else if (e.source === parent && isRelayMessage(m) && m.qa === 'hand') frameA?.contentWindow?.postMessage(m, location.origin);
      // The desk's keys, pressed in a seat.
      else if ((e.source === frameA?.contentWindow || e.source === frameB?.contentWindow) && isFrameMessage(m) && m.qa === 'key') parent.postMessage(m, desk);
    };
    addEventListener('message', heard);
    return () => {
      clearInterval(batches);
      removeEventListener('message', heard);
      removeEventListener('resize', resize);
    };
  });
</script>

{#if small}
  <p class="alone">Shown one at a time: each is two games of its own.</p>
{:else}
  <div class="seats" class:row={layout.row} style:--gap="{GAP}px">
    {#each [{ who: moving, size: sizeA, url: srcA, a: true }, { who: watching, size: sizeB, url: srcB, a: false }] as s (s.a)}
      <figure style:width="{s.size.w * layout.scale + 2}px">
        <figcaption title="{s.who.name}, {s.size.label}">
          {s.who.name} ({s.who.role === 'host' ? 'host' : 'guest'}), {s.size.label}:
          {s.a ? (v.hand === 'mouse' ? 'moving, by your mouse over it' : 'moving') : 'watching'}
        </figcaption>
        <div class="box" style:width="{s.size.w * layout.scale}px" style:height="{s.size.h * layout.scale}px">
          {#key s.url}
            {#if s.a}
              <iframe bind:this={frameA} src={s.url} title="{s.who.name}’s screen" width={s.size.w} height={s.size.h} style:transform="scale({layout.scale})"></iframe>
            {:else}
              <iframe bind:this={frameB} src={s.url} title="{s.who.name}’s screen" width={s.size.w} height={s.size.h} style:transform="scale({layout.scale})"></iframe>
            {/if}
          {/key}
        </div>
      </figure>
    {/each}
  </div>
{/if}

<style>
  .seats {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gap);
  }
  .seats.row {
    flex-direction: row;
    align-items: flex-start;
  }
  figure {
    margin: 0;
  }
  figcaption {
    height: 26px;
    color: var(--muted);
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .box {
    overflow: hidden;
    border: 1px solid var(--line);
    box-sizing: content-box;
  }
  iframe {
    display: block;
    border: 0;
    transform-origin: 0 0;
  }
  .alone {
    max-width: 18rem;
    color: var(--muted);
    text-align: center;
  }
</style>
