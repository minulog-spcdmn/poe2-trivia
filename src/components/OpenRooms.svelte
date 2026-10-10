<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { scanRooms, type RoomInfo } from '../lib/rooms';
  import { DIFFICULTY_NAMES } from '../lib/difficultyText';
  import { PROTOCOL_VERSION } from '../lib/protocol';
  import { backdropShadow } from '../lib/backdropShadow';
  import { shownDepth } from '../lib/delve';

  let { onJoin, disabled = false }: { onJoin: (code: string) => void; disabled?: boolean } = $props();

  const REFRESH_MS = 20000;
  /**
   * A scan can legitimately finish in well under a second: the signalling
   * server answers "free" early for slots that other visitors probed moments
   * before. Keep the searching state up at least this long so it reads as a
   * search rather than a flicker.
   */
  const MIN_SCAN_MS = 1500;

  let rooms = $state<RoomInfo[]>([]);
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
    const joinable = (r: RoomInfo) => (r.phase === 'lobby' && r.players < r.maxPlayers ? 0 : 1);
    return list.sort((a, b) => joinable(a) - joinable(b) || b.players - a.players || a.host.localeCompare(b.host));
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

<section class="rooms panel" use:backdropShadow={{ fill: 'linear' }}>
  <header>
    <h2>Open rooms</h2>
    <button class="refresh" onclick={scan} disabled={scanning} aria-label="Refresh room list" title="Refresh">
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
  </header>

  {#if rooms.length}
    <ul>
      {#each rooms as r (r.code)}
        <!-- A room on another version can't be joined from here: say which side has to reload. -->
        {@const behind = (r.v ?? 0) < PROTOCOL_VERSION}
        {@const ahead = (r.v ?? 0) > PROTOCOL_VERSION}
        {@const open = r.phase === 'lobby' && r.players < r.maxPlayers}
        <li animate:flip={{ duration: 300 }} in:fly={{ y: 8, duration: 300 }} out:fade={{ duration: 150 }}>
          <div class="info">
            <span class="host">{r.host}'s room</span>
            <span class="meta">
              {#if r.mode === 'delve'}
                Delve · {r.depth ? (shownDepth(r.depth) <= 0 && r.phase !== 'over' ? 'entrance' : `depth ${shownDepth(r.depth)}`) : 'three lives'}{r.spectators ? ` · ${r.spectators} watching` : ''}
              {:else}
                {r.mode === 'race' ? 'Race' : 'Turns'} · {DIFFICULTY_NAMES[r.difficulty]} · first to {r.target}{r.spectators ? ` · ${r.spectators} watching` : ''}
              {/if}
            </span>
          </div>
          <span class="count" title="Players">{r.players}/{r.maxPlayers}</span>
          {#if behind || ahead}
            <span class="status" title={behind ? 'The host is on an older version of the game' : 'Reload this page to join'}>{behind ? 'Older version' : 'Reload to join'}</span>
          {:else if open}
            <button class="btn small" {disabled} onclick={() => onJoin(r.code)}>Join</button>
          {:else if r.phase !== 'locked' && r.phase !== 'lobby' && r.spectators < r.maxSpectators}
            <button class="btn small ghost" {disabled} onclick={() => onJoin(r.code)} title="Watch this game and play in the next one">Watch</button>
          {:else}
            <span class="status">{r.phase === 'locked' ? 'Locked' : r.phase === 'lobby' ? 'Full' : 'In game'}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if scanning || !scanned}
    <p class="empty muted"><span class="dots"><i></i><i></i><i></i></span> Searching for rooms…</p>
  {:else if failed}
    <p class="empty muted">Couldn't reach the matchmaking server. Try refreshing.</p>
  {:else}
    <p class="empty muted">No public rooms right now. Create one and set it to public!</p>
  {/if}
</section>

<style>
  .rooms {
    width: min(620px, 100%);
    padding: 1.1rem 1.4rem 1.2rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.7rem;
  }
  h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
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
    transition: color 0.2s, border-color 0.2s;
  }
  .refresh:hover:not(:disabled) {
    box-shadow: 0 0 14px rgba(201, 164, 92, 0.3);
    color: var(--gold-hi);
    border-color: var(--gold-lo);
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
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 320px;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.55rem 0.7rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(59, 48, 36, 0.7);
    border-radius: 4px;
    transition:
      border-color 0.25s,
      background 0.25s,
      box-shadow 0.25s;
  }
  li:hover {
    border-color: var(--gold-lo);
    background: rgba(30, 22, 13, 0.45);
    box-shadow: 0 0 16px rgba(201, 164, 92, 0.12);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .host {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.95rem;
    color: #e9c8a2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .count {
    font-family: var(--font-display);
    font-size: 0.85rem;
    color: var(--gold);
  }
  .status {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0.45em 0.9em;
    border: 1px dashed var(--line);
    border-radius: 3px;
  }
  .empty {
    margin: 0.2rem 0;
    font-style: italic;
    display: flex;
    align-items: center;
    gap: 0.6rem;
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
</style>
