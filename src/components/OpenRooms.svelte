<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { scanRooms, type RoomInfo } from '../lib/rooms';

  let { onJoin, disabled = false }: { onJoin: (code: string) => void; disabled?: boolean } = $props();

  const REFRESH_MS = 20000;
  const DIFF_NAMES: Record<string, string> = { cruel: 'Cruel', merciless: 'Merciless', eternal: 'Eternal' };

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
      if (id === run) {
        scanning = false;
        scanned = true;
        if (!destroyed) timer = setTimeout(scan, REFRESH_MS);
      }
    }
  }

  function sortRooms(list: RoomInfo[]) {
    const joinable = (r: RoomInfo) => (r.phase === 'lobby' && r.players < r.maxPlayers ? 0 : 1);
    return list.sort((a, b) => joinable(a) - joinable(b) || b.players - a.players || a.host.localeCompare(b.host));
  }

  onMount(() => {
    void scan();
    return () => {
      destroyed = true;
      if (timer) clearTimeout(timer);
    };
  });
</script>

<section class="rooms panel">
  <header>
    <h2>Open rooms</h2>
    <button class="refresh" class:spin={scanning} onclick={scan} disabled={scanning} aria-label="Refresh room list" title="Refresh">
      <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>
    </button>
  </header>

  {#if rooms.length}
    <ul>
      {#each rooms as r (r.code)}
        {@const open = r.phase === 'lobby' && r.players < r.maxPlayers}
        <li animate:flip={{ duration: 300 }} in:fly={{ y: 8, duration: 300 }} out:fade={{ duration: 150 }}>
          <div class="info">
            <span class="host">{r.host}'s room</span>
            <span class="meta">
              {r.mode === 'race' ? 'Race' : 'Turns'} · {DIFF_NAMES[r.difficulty] ?? r.difficulty} · first to {r.target}
            </span>
          </div>
          <span class="count" title="Players">{r.players}/{r.maxPlayers}</span>
          {#if open}
            <button class="btn small" {disabled} onclick={() => onJoin(r.code)}>Join</button>
          {:else}
            <span class="status">{r.phase === 'locked' ? 'Locked' : r.phase === 'lobby' ? 'Full' : 'In game'}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if !scanned}
    <p class="empty muted"><span class="dots"><i></i><i></i><i></i></span> Searching for rooms…</p>
  {:else if failed}
    <p class="empty muted">Couldn't reach the matchmaking server. Try refreshing.</p>
  {:else}
    <p class="empty muted">No public rooms right now. Create one and set it to public!</p>
  {/if}
  <p class="note muted">Joining connects you directly to the host and other players, who can see your IP address.</p>
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
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--gold-hi);
  }
  .refresh {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--muted);
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
  }
  .refresh:hover:not(:disabled) {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .refresh svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .refresh.spin svg {
    animation: spin 1s linear infinite;
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
  .note {
    margin: 0.8rem 0 0;
    font-size: 0.82rem;
    opacity: 0.75;
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
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
