<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { scanRooms, type RoomInfo } from '../lib/rooms';
  import { roomMeta } from '../lib/roomInfo';
  import { PROTOCOL_VERSION } from '../lib/protocol';
  import { pinnedOut } from '../lib/stage';
  import { joinable, watchable } from '../bot/wanted';

  /** A room leaving the list fades where it stood, under the stage's zoom too. */
  const fadeOut = pinnedOut(fade);

  let {
    onJoin,
    disabled = false,
    count = $bindable(0),
    seats = $bindable(false),
  }: {
    onJoin: (code: string) => void;
    disabled?: boolean;
    /** How many rooms the list shows, for a page that points to them from further up. */
    count?: number;
    /** Whether any of them has a seat to take (none: all are games under way, to watch). */
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

  /** Every room found, whatever it offers (what the scans merge). */
  let rooms = $state<RoomInfo[]>([]);
  /**
   * The rooms the list shows: only those that can be got into from here, to
   * play or to watch and play the next game. Locked or full ones, and hosts
   * on another version, are left out.
   */
  const shown = $derived(rooms.flatMap((room) => {
    const d = door(room);
    return d ? [{ room, door: d }] : [];
  }));

  /** Rooms on a newer version than this page's that a reload would bring in (not locked or full ones, which it wouldn't). */
  const newer = $derived(rooms.some((r) => (r.v ?? 0) > PROTOCOL_VERSION && door({ ...r, v: PROTOCOL_VERSION }) !== null));
  /** Whether any room shown has a seat to take. */
  const seatFree = $derived(shown.some((s) => s.door === 'join'));
  $effect(() => {
    count = shown.length;
    seats = seatFree;
  });

  /**
   * What a room offers from here: a seat, a place to watch from and play the
   * next game, or nothing (another version, locked, full, or its game has no
   * room left to watch from). A full lobby has nothing: joining it from here
   * asks for a seat.
   */
  const door = (r: RoomInfo): 'join' | 'watch' | null => (joinable(r) ? 'join' : r.phase !== 'lobby' && watchable(r) ? 'watch' : null);
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
          // Show rooms as they are found; keep ones from the last scan until it ends.
          const merged = new Map(rooms.map((r) => [r.code, r]));
          merged.set(room.code, room);
          rooms = sortRooms([...merged.values()]);
        },
        () => destroyed || id !== run,
      );
      if (id === run) rooms = sortRooms([...found.values()]);
    } catch {
      failed = true;
    } finally {
      const left = MIN_SCAN_MS - (performance.now() - started);
      if (left > 0 && !destroyed) await new Promise((r) => setTimeout(r, left));
      if (id === run) {
        scanning = false;
        scanned = true;
        if (!destroyed) timer = setTimeout(scan, REFRESH_MS);
      }
    }
  }

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
    const seat = (r: RoomInfo) => (joinable(r) ? 0 : 1);
    return list.sort((a, b) => seat(a) - seat(b) || b.players - a.players || a.host.localeCompare(b.host));
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
    {#if shown.length}<span class="open" in:fade={{ duration: 200 }}><span class="num">{shown.length}</span> open</span>{/if}
    <button class="refresh" class:busy={scanning} onclick={scan} disabled={scanning} aria-label="Refresh room list" title="Refresh">
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
    {#if shown.length}<p class="note">{seatFree ? 'Anyone can join.' : 'Games under way: watch, and play the next one.'}</p>{/if}
  </header>
  {#if newer && shown.length}
    <p class="newer">More rooms are open on a newer version of the game: <button class="reload" onclick={() => location.reload()}>reload</button> to see them.</p>
  {/if}

  {#if shown.length}
    <ul>
      {#each shown as { room: r, door: d } (r.code)}
        <li animate:flip={{ duration: 300 }} in:fly={{ y: 8, duration: 300 }} out:fadeOut={{ duration: 150 }}>
          <div class="info">
            <span class="host">{r.host}’s room</span>
            <span class="meta">{roomMeta(r)}{r.spectators ? ` · ${r.spectators} watching` : ''}</span>
          </div>
          {#if d === 'join'}
            <button class="btn small" {disabled} onclick={() => onJoin(r.code)}>Join</button>
          {:else}
            <button class="btn small ghost" {disabled} onclick={() => onJoin(r.code)} title="Watch this game and play in the next one">Watch</button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if newer && scanned}
    <!-- Kept up through the refreshes (the rooms found stay known while the next scan runs), so its reload never goes from under a finger.
         One span, so the tile (a flex row, for the searching dots) keeps the sentence whole around its button. -->
    <p class="empty"><span>Rooms are open on a newer version of the game: <button class="reload" onclick={() => location.reload()}>reload</button> to join them.</span></p>
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
  /* Rooms this page's version leaves out: a line under the heading. */
  .newer {
    margin: -6px 0 12px;
    font-style: italic;
    font-size: 15px;
    color: #a99c86;
  }
  /* Reload, set as a link in its sentence. */
  .reload {
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    color: var(--gold);
    text-decoration: underline;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
  }
  .reload:hover {
    color: var(--gold-hi);
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
    /* A tap target of 44 px around the word, the line's spacing unchanged. */
    .reload {
      padding-block: 12px;
      margin-block: -12px;
    }
    .refresh {
      width: 44px;
      height: 44px;
    }
    li .btn {
      min-height: 44px;
    }
  }
</style>
