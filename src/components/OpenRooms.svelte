<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { scanRooms, type RoomInfo } from '../lib/rooms';
  import { joinable, roomMeta, watchable } from '../lib/roomInfo';
  import { PROTOCOL_VERSION } from '../lib/protocol';
  import { pinnedOut } from '../lib/stage';
  import Connecting from './Connecting.svelte';

  /** A room leaving the list fades where it stood, under the stage's zoom too. */
  const fadeOut = pinnedOut(fade);

  let {
    onJoin,
    disabled = false,
    joining = null,
    count = $bindable(0),
    seats = $bindable(false),
  }: {
    onJoin: (code: string) => void;
    disabled?: boolean;
    /** The code of a room tapped here that is being joined: it shows the connection in its place. */
    joining?: string | null;
    /** How many rooms the list shows that can be got into (not a newer host's, which wait on a reload), for a page that points to them from further up. */
    count?: number;
    /** Whether any of them has a seat to take (none: all are rooms to watch). */
    seats?: boolean;
  } = $props();

  const REFRESH_MS = 20000;
  /**
   * A scan can legitimately finish in well under a second: the signalling
   * server answers "free" early for slots that other visitors probed moments
   * before. Keep the searching state up at least this long so it reads as a
   * search rather than a flicker.
   */
  const MIN_SCAN_MS = 1500;

  /**
   * What a room on this version offers: a seat, a place to watch from (a
   * game under way, to play the next one, or a full lobby, to take a seat
   * once one is free), or nothing (locked, or no room left to watch from).
   */
  const offer = (r: RoomInfo): 'join' | 'watch' | null => (joinable(r) ? 'join' : watchable(r) ? 'watch' : null);
  /**
   * What the list shows for a room: what it offers, or, for a host on a newer
   * version, that this page has to reload first (only for a room that would
   * offer something then). An older host's rooms are left out: only the host
   * reloading could open them, nothing anyone here can do.
   */
  function door(r: RoomInfo): 'join' | 'watch' | 'ahead' | null {
    const v = r.v ?? 0;
    if (v === PROTOCOL_VERSION) return offer(r);
    return v > PROTOCOL_VERSION && offer({ ...r, v: PROTOCOL_VERSION }) ? 'ahead' : null;
  }
  const RANK = { join: 0, watch: 1, ahead: 2 };

  /** Every room found, whatever it offers (what the scans merge). */
  let rooms = $state<RoomInfo[]>([]);
  /** The room tapped and what it offered, held so it stays listed while it's joined even if a scan stops finding it. */
  let tapped = $state<{ room: RoomInfo; door: 'join' | 'watch' } | null>(null);
  /**
   * The rooms the list shows: those that can be got into from here, to play
   * or to watch, and those this page's reload would open. Locked ones, ones
   * with no room left, and older hosts' are left out.
   */
  const shown = $derived.by(() => {
    const list = rooms.flatMap((room) => {
      const d = door(room);
      return d ? [{ room, door: d }] : [];
    });
    if (joining && tapped?.room.code === joining && !list.some((s) => s.room.code === joining)) list.unshift(tapped);
    return list;
  });

  /** How many rooms shown can be got into from here (not a newer host's, which wait on a reload). */
  const enterable = $derived(shown.filter((s) => s.door !== 'ahead').length);
  /** Whether any room shown has a seat to take. */
  const seatFree = $derived(shown.some((s) => s.door === 'join'));
  $effect(() => {
    count = enterable;
    seats = seatFree;
  });

  /** Reloads this page into a newer host's room: its code in the address, as an invite link's, the newer version joins it on load (counted as joined from this list, count.ts cameFromThisSite). */
  function reloadInto(code: string) {
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    location.assign(url);
  }

  function tap(r: RoomInfo, d: 'join' | 'watch') {
    tapped = { room: r, door: d };
    onJoin(r.code);
  }

  let scanning = $state(false);
  let scanned = $state(false);
  let failed = $state(false);
  let run = 0;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function scan() {
    if (scanning || destroyed) return;
    if (timer) clearTimeout(timer);
    const id = ++run;
    scanning = true;
    failed = false;
    const found = new Map<string, RoomInfo>();
    const started = performance.now();
    try {
      await scanRooms(
        (room) => {
          found.set(room.code, room);
          // Not while a room tapped here is joined: the list stays as it was tapped.
          if (disabled) return;
          // Show rooms as they are found; keep ones from the last scan until it ends.
          const merged = new Map(rooms.map((r) => [r.code, r]));
          merged.set(room.code, room);
          rooms = sortRooms([...merged.values()]);
        },
        () => destroyed || id !== run,
      );
      // Run again once the join ends, rather than moving the list under it.
      if (id === run && disabled) held = true;
      else if (id === run) rooms = sortRooms([...found.values()]);
    } catch {
      failed = true;
    } finally {
      const left = MIN_SCAN_MS - (performance.now() - started);
      if (left > 0 && !destroyed) await new Promise((r) => setTimeout(r, left));
      if (id === run) {
        scanning = false;
        // A scan whose rooms were set aside for the join hasn't shown anything:
        // the list still reads as searching, not as empty, until the next one.
        if (!held) scanned = true;
        if (!destroyed) timer = setTimeout(refresh, REFRESH_MS);
      }
    }
  }

  /** A refresh that came due (or a scan that ended) while a room was being joined, run once the join ends. */
  let held = $state(false);
  /** The timed refresh, held off while a room is being joined: the list stays as it was tapped. */
  function refresh() {
    timer = null;
    if (disabled) held = true;
    else void scan();
  }
  $effect(() => {
    if (disabled || !held || scanning) return;
    held = false;
    untrack(() => void scan());
  });

  // The refresh icon eases up to speed while scanning and coasts to a stop
  // wherever it happens to be, instead of snapping back to its start angle.
  const SPIN_SPEED = 0.4; // degrees per ms
  const SPIN_UP_MS = 350;
  const SPIN_DOWN_MS = 700;
  let angle = $state(0);
  let speed = 0;
  let spinFrame = 0;

  function spin(now: number, last: number) {
    const dt = Math.min(now - last, 50);
    const active = scanning;
    speed = active
      ? Math.min(SPIN_SPEED, speed + (SPIN_SPEED / SPIN_UP_MS) * dt)
      : Math.max(0, speed - (SPIN_SPEED / SPIN_DOWN_MS) * dt);
    angle = (angle + speed * dt) % 360;
    spinFrame = speed > 0 || active ? requestAnimationFrame((t) => spin(t, now)) : 0;
  }

  $effect(() => {
    if (!scanning) return;
    const now = performance.now();
    if (!spinFrame) spinFrame = requestAnimationFrame((t) => spin(t, now));
  });

  function sortRooms(list: RoomInfo[]) {
    const rank = (r: RoomInfo) => RANK[door(r) ?? 'ahead'];
    return list.sort((a, b) => rank(a) - rank(b) || b.players - a.players || a.host.localeCompare(b.host));
  }

  onMount(() => {
    void scan();
    return () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(spinFrame);
    };
  });
</script>

<section class="rooms" aria-labelledby="rooms-h">
  <header>
    <h2 id="rooms-h">Open rooms</h2>
    {#if enterable}<span class="open" in:fade={{ duration: 200 }}><span class="num">{enterable}</span> open</span>{/if}
    <button class="refresh" class:busy={scanning} onclick={scan} disabled={scanning || disabled} aria-label="Refresh room list" title="Refresh">
      <!-- The arc is centred on the viewBox so the icon turns in place. The
           rotation lives inside the SVG, around its exact centre, rather than
           on the element: a rotated compositor layer gets snapped to device
           pixels each frame, which makes it wobble at fractional DPRs (phones). -->
      <svg viewBox="0 0 24 24">
        <g transform="rotate({angle} 12 12)">
          <path d="M18.58 14.39A7 7 0 1 1 14.39 5.42" />
          <path class="head" d="M18.15 6.8 15.6 2.15 13.2 8.7Z" />
        </g>
      </svg>
    </button>
    {#if enterable}<p class="note">{seatFree ? 'Anyone can join.' : 'No seat free: watch, and play once you can.'}</p>{/if}
  </header>

  {#if shown.length}
    <ul>
      {#each shown as { room: r, door: d } (r.code)}
        <li class:dimmed={!!joining && r.code !== joining} animate:flip={{ duration: 300 }} in:fly={{ y: 8, duration: 300 }} out:fadeOut={{ duration: 150 }}>
          {#if r.code === joining}
            <!-- Joining it: the connection, with its Cancel, where the room was tapped. -->
            <Connecting />
          {:else}
            <div class="info">
              <span class="host">{r.host}’s room</span>
              <span class="meta">{roomMeta(r)}{r.spectators ? ` · ${r.spectators} watching` : ''}</span>
            </div>
            {#if d === 'join'}
              <button class="btn small" {disabled} onclick={() => tap(r, 'join')}>Join</button>
            {:else if d === 'watch'}
              <button class="btn small ghost" {disabled} onclick={() => tap(r, 'watch')} title={r.phase === 'lobby' ? 'Every seat is taken: watch, and take one once it is free' : 'Watch this game and play in the next one'}>Watch</button>
            {:else}
              <!-- Reloaded with the room's code in the address, so the newer version goes straight on into it. -->
              {@const then = offer({ ...r, v: PROTOCOL_VERSION }) === 'join' ? 'join' : 'watch'}
              <button class="btn small ghost" {disabled} onclick={() => reloadInto(r.code)} title="This room is on a newer version of the game">Reload to {then}</button>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {:else if scanned && rooms.length && !failed}
    <!-- Kept up through the refreshes too, as the list would be: the rooms found stay known while the next scan runs. -->
    <p class="empty">No room can be joined from here right now.</p>
  {:else if scanning || !scanned}
    <p class="empty"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> Searching for rooms…</p>
  {:else if failed}
    <p class="empty">Couldn’t reach the matchmaking server. Try the refresh button.</p>
  {:else}
    <p class="empty">Nobody is waiting right now. Set your room to Public in its lobby and it shows up here.</p>
  {/if}
</section>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: var(--rooms-head-gap, 16px);
  }
  h2 {
    white-space: nowrap;
    font-size: 20px;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--gold);
  }
  /* The heading and its count read as one line: on one baseline. */
  h2,
  .open {
    align-self: baseline;
  }
  .open {
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .num {
    font-family: var(--font-cinzel);
  }
  .note {
    margin: 0 0 0 auto;
    font-style: italic;
    font-size: 15px;
    color: #a99c86;
  }
  .refresh {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    /* No UA padding: it squeezes the content box below the icon's width,
       which pushes the icon off-centre. */
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--muted);
    cursor: pointer;
    transition:
      color 0.2s,
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .refresh:hover:not(:disabled) {
    box-shadow: 0 0 14px rgba(201, 164, 92, 0.3);
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  /* Lit while it looks. */
  .refresh.busy {
    cursor: default;
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow: 0 0 14px rgba(201, 164, 92, 0.3);
  }
  .refresh svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .refresh svg .head {
    fill: currentColor;
    stroke-width: 1.5;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  /* The answer buttons' panel (QuestionView), the room's own button inside it. */
  li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-height: 72px;
    padding: 0.7rem 0.9rem 0.7rem 1.1rem;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.05),
      0 8px 22px rgba(0, 0, 0, 0.45);
    transition:
      border-color 0.25s,
      box-shadow 0.25s,
      opacity 0.3s;
  }
  li:hover {
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.06),
      0 0 16px rgba(201, 164, 92, 0.12),
      0 8px 22px rgba(0, 0, 0, 0.45);
  }
  li.dimmed {
    opacity: 0.45;
    pointer-events: none;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.4;
  }
  .host {
    font-size: 17px;
    color: #e3d3b4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 15px;
    color: var(--muted);
  }
  /* Nothing to list: one dashed tile across the row, as tall as a room's,
     so the first room to open doesn't move the page. */
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    min-height: 72px;
    margin: 0;
    padding: 0.6rem 1rem;
    text-align: center;
    font-style: italic;
    font-size: 17px;
    color: #a99c86;
    border: 1px dashed rgba(125, 99, 51, 0.55);
    border-radius: 4px;
  }
  .dots {
    display: inline-flex;
    gap: 4px;
  }
  .dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--gold);
    animation: blink 1.2s infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    50% {
      opacity: 0.2;
    }
  }

  @media (max-width: 1100px) {
    ul {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    header {
      flex-wrap: wrap;
      gap: 6px 14px;
    }
    .refresh {
      width: 40px;
      height: 40px;
      margin-left: auto;
    }
    /* The note on a line of its own under the heading. */
    .note {
      order: 1;
      width: 100%;
      margin: 0;
    }
    ul {
      grid-template-columns: 1fr;
    }
    .empty {
      font-size: 15px;
    }
  }
  @media (pointer: coarse) {
    .refresh {
      width: 44px;
      height: 44px;
    }
    li .btn {
      min-height: 44px;
    }
  }
</style>
