<script lang="ts">
  // Records how this player plays (lib/recorder.ts): the pointer, what it was
  // over, and what the game showed, for the room bots' hands to learn from.
  // A small badge in the corner says it's on, and saves the file.
  import { onMount } from 'svelte';
  import { session } from '../lib/session.svelte';
  import { portal } from '../lib/portal';
  import { MOUSE } from '../lib/cursors';
  import { anchorAt } from '../lib/pointerAnchor';
  import { peerCursors } from '../lib/peerCursors.svelte';
  import { CHANNEL } from '../lib/channel';
  import { Recording, sceneOf, stopRecording, type Layout } from '../lib/recorder';

  let { onstop }: { onstop: () => void } = $props();

  const rec = new Recording();
  const t0 = performance.now();
  /** ms into the recording, for an event's time stamp (or now). */
  const since = (stamp = performance.now()) => stamp - t0;

  /** What a spot is over: the anchor and where on it (lib/cursors.ts). */
  function over(x: number, y: number): [number, number, number] | null {
    const at = anchorAt(x, y, MOUSE);
    return at && [at[0], at[1], at[2]];
  }

  let elapsed = $state(0);
  let saved = $state(false);

  function layoutNow(): Layout {
    const boxes: Layout['boxes'] = {};
    for (const el of document.querySelectorAll<HTMLElement>('[data-cursor]')) {
      const name = el.dataset.cursor!;
      if (boxes[name] || el.closest('[inert]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) boxes[name] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
    }
    return { t: Math.round(since()), w: innerWidth, h: innerHeight, scrollY: Math.round(scrollY), boxes };
  }

  /** The screen settles after a change (cards dealt, answers sliding in): looked at again as it does. */
  let settling: ReturnType<typeof setTimeout>[] = [];
  function lookSoon(after = [0, 400, 1200]) {
    for (const t of settling) clearTimeout(t);
    settling = after.map((ms) => setTimeout(() => rec.layout(layoutNow()), ms));
  }

  $effect(() => {
    const s = session.state;
    if (s && rec.scene(sceneOf(s, session.myPlayerId, Math.round(since())))) lookSoon();
  });

  function save() {
    const about = {
      channel: CHANNEL,
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      screen: [screen.width, screen.height],
      finePointer: matchMedia('(pointer: fine)').matches,
    };
    const url = URL.createObjectURL(new Blob([rec.file(about)], { type: 'application/json' }));
    const a = document.createElement('a');
    const d = new Date(rec.started);
    const two = (n: number) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `poe2-hand-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    rec.unsaved = false;
    saved = true;
  }

  function stop() {
    if (rec.unsaved && !confirm('Stop recording without saving what was recorded since the last save?')) return;
    stopRecording();
    onstop();
  }

  onMount(() => {
    let kind = '';
    let lastScroll = -Infinity;
    let scrollEnd: ReturnType<typeof setTimeout> | undefined;
    const typing = (e: Event) => e.target instanceof Element && !!e.target.closest('input, textarea, select, [contenteditable]');
    const own = (e: Event) => e.target instanceof Element && !!e.target.closest('.recorder');

    const move = (e: PointerEvent) => {
      if (e.pointerType !== kind) rec.happen([since(e.timeStamp), 'pointer', (kind = e.pointerType)]);
      for (const c of e.getCoalescedEvents?.() ?? [e]) rec.move(since(c.timeStamp), c.clientX, c.clientY);
      const t = since(e.timeStamp);
      if (rec.dueAt(t)) rec.pointAt(t, over(e.clientX, e.clientY));
    };
    const press = (what: 'down' | 'up') => (e: PointerEvent) => {
      if (own(e)) return;
      const t = since(e.timeStamp);
      rec.move(t, e.clientX, e.clientY);
      rec.happen([t, what, e.button, Math.round(e.clientX), Math.round(e.clientY)]);
      rec.pointAt(t, over(e.clientX, e.clientY));
    };
    const down = press('down');
    const up = press('up');
    const out = (e: PointerEvent) => {
      if (!e.relatedTarget) rec.happen([since(e.timeStamp), 'out']);
    };
    const visibility = () => rec.happen([since(), document.hidden ? 'hidden' : 'shown']);
    const wheel = (e: WheelEvent) => rec.happen([since(e.timeStamp), 'wheel', Math.round(e.deltaY)]);
    const scrolled = () => {
      const t = since();
      if (t - lastScroll >= 100) {
        lastScroll = t;
        rec.happen([t, 'scroll', Math.round(scrollY)]);
      }
      clearTimeout(scrollEnd);
      scrollEnd = setTimeout(() => rec.layout(layoutNow()), 250);
    };
    const key = (e: KeyboardEvent) => {
      if (!typing(e) && !e.repeat) rec.happen([since(e.timeStamp), 'key', e.key]);
    };
    const resized = () => lookSoon([250]);
    // Closing the tab with something unsaved asks first.
    const leaving = (e: BeforeUnloadEvent) => {
      if (rec.unsaved && rec.moves.length) e.preventDefault();
    };
    const tick = setInterval(() => (elapsed = since()), 1000);
    // The others' pointers, as heard: each change, and each going.
    const who = new Map<string, number>();
    const heard = new Map<string, number>();
    const listen = setInterval(() => {
      const t = since();
      for (const [key, p] of peerCursors.at) {
        if (heard.get(key) === p.moved) continue;
        heard.set(key, p.moved);
        if (!who.has(key)) who.set(key, who.size);
        rec.peer(t, who.get(key)!, p.at);
      }
      for (const key of heard.keys())
        if (!peerCursors.at.has(key)) {
          heard.delete(key);
          rec.peer(t, who.get(key)!, null);
        }
    }, 25);

    addEventListener('pointermove', move, { passive: true, capture: true });
    addEventListener('pointerdown', down, { passive: true, capture: true });
    addEventListener('pointerup', up, { passive: true, capture: true });
    document.addEventListener('pointerout', out);
    document.addEventListener('visibilitychange', visibility);
    addEventListener('wheel', wheel, { passive: true, capture: true });
    addEventListener('scroll', scrolled, { passive: true });
    addEventListener('keydown', key, { capture: true });
    addEventListener('resize', resized);
    addEventListener('beforeunload', leaving);
    lookSoon([0]);
    return () => {
      clearInterval(tick);
      clearInterval(listen);
      clearTimeout(scrollEnd);
      for (const t of settling) clearTimeout(t);
      removeEventListener('pointermove', move, { capture: true });
      removeEventListener('pointerdown', down, { capture: true });
      removeEventListener('pointerup', up, { capture: true });
      document.removeEventListener('pointerout', out);
      document.removeEventListener('visibilitychange', visibility);
      removeEventListener('wheel', wheel, { capture: true });
      removeEventListener('scroll', scrolled);
      removeEventListener('keydown', key, { capture: true });
      removeEventListener('resize', resized);
      removeEventListener('beforeunload', leaving);
    };
  });

  const clock = $derived(`${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`);
</script>

<div class="recorder" use:portal role="status" aria-label="Recording your pointer for the bots">
  <span class="dot" aria-hidden="true"></span>
  <span class="clock">{clock}</span>
  <button onclick={save} title="Save the recording as a file">{saved ? 'Save again' : 'Save'}</button>
  <button onclick={stop} title="Stop recording">Stop</button>
</div>

<style>
  .recorder {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: var(--pinned-bg);
    border: var(--pinned-line);
    border-radius: var(--radius);
    color: var(--muted);
    font: 13px var(--font-cinzel);
    opacity: 0.75;
  }
  .recorder:hover {
    opacity: 1;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bad);
    animation: beat 2s ease-in-out infinite;
  }
  @keyframes beat {
    50% {
      opacity: 0.35;
    }
  }
  .clock {
    min-width: 3.2em;
    font-variant-numeric: tabular-nums;
  }
  button {
    font: inherit;
    color: var(--gold);
    background: none;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    padding: 1px 7px;
    cursor: pointer;
  }
  button:hover {
    color: var(--gold-hi);
    border-color: var(--gold);
  }
</style>
