<script lang="ts">
  // "Play from here": a scene's room made real (../live/room.ts), every seat
  // the real game side by side at the stop's size, playable by hand or by a
  // bot, with each seat's link to make bad: lag, a silent drop (the game
  // notices 12 to 18 s in), a cut, a reload. On the dev server the seats meet
  // on the local signalling server and each has an origin of its own
  // (<seat>.localhost); on the beta they share the desk's and meet on the
  // PeerJS cloud. The seats are talked to by postMessage only (../live/seat.ts).
  import { onMount } from 'svelte';
  import { LOCAL } from '../../lib/channel.ts';
  import { PROTOCOL_VERSION } from '../../lib/protocol.ts';
  import type { GameState } from '../../lib/game.ts';
  import type { SeatLook, SeatMessage, SeatOp } from '../messages.ts';
  import { sizeOf, type SizeKey } from '../sizes.ts';
  import type { Scene } from '../scene.ts';
  import { seedParam, type LiveRoom } from '../live/room.ts';

  let { room, scene, size: sizeKey, onexit }: { room: LiveRoom; scene: Scene; size: SizeKey; onexit: () => void } = $props();

  const GAP = 20;
  const PAD = 16;
  const CAPTION = 64;
  const LAGS = [0, 150, 600, 2000];

  let cw = $state(0);
  let ch = $state(0);
  const size = $derived(sizeOf(sizeKey));
  const n = $derived(room.seats.length);
  const scale = $derived(Math.max(0.05, Math.min(1, (cw - 2 * PAD - (n - 1) * GAP) / (n * size.w), (ch - 2 * PAD - CAPTION) / size.h)));

  let ready = $state(!LOCAL);
  let failed = $state<string | null>(null);
  let note = $state<string | null>(null);
  let looks = $state<Record<string, SeatLook>>({});
  /** When each seat's link went silent (performance.now), for its countdown. */
  let downSince = $state<Record<string, number>>({});
  let now = $state(performance.now());
  const frames: Record<string, HTMLIFrameElement> = {};

  onMount(() => {
    // The dev server's seats meet on its local signalling server, started on the first room.
    if (LOCAL)
      fetch('./__qa/peer').then(
        (r) => (r.ok ? (ready = true) : (failed = "The local signalling server didn't start (see the dev server's log).")),
        () => (failed = "The dev server didn't answer."),
      );
    const tick = setInterval(() => (now = performance.now()), 500);
    const heard = (e: MessageEvent) => {
      const seat = room.seats.find((s) => frames[s.key]?.contentWindow === e.source);
      const m = e.data as SeatMessage | null;
      if (!seat || !m || typeof m !== 'object') return;
      if (m.qa === 'seat') looks[seat.key] = m.look;
      else if (m.qa === 'saved') void save(m.state, m.at);
    };
    addEventListener('message', heard);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onexit();
    addEventListener('keydown', esc);
    return () => {
      clearInterval(tick);
      removeEventListener('message', heard);
      removeEventListener('keydown', esc);
    };
  });

  /** A seat's address: on its own origin on the dev server, its storage in the hash. */
  function src(key: string, i: number) {
    const seat = room.seats.find((s) => s.key === key)!;
    // WebGL in the first seat only: four backdrops at once are the one thing that stalled the spike's seats.
    const query = `?live${i === 0 ? '' : '&off=webgl'}`;
    const origin = LOCAL ? `${location.protocol}//${key}.localhost:${location.port}` : '';
    return `${origin}${location.pathname}${query}#seed=${seedParam(seat.seed)}`;
  }
  const ask = (key: string, op: Omit<SeatOp, 'qa'>) => frames[key]?.contentWindow?.postMessage({ qa: 'seat-op', ...op } satisfies SeatOp, '*');

  function drop(key: string) {
    if (looks[key]?.link.holding) {
      ask(key, { op: 'release' });
      delete downSince[key];
    } else {
      ask(key, { op: 'hold' });
      downSince[key] = performance.now();
    }
  }
  const lagOf = (key: string) => looks[key]?.link.lag ?? 0;
  const nextLag = (key: string) => LAGS[(LAGS.indexOf(lagOf(key)) + 1) % LAGS.length];

  function status(key: string): string {
    const l = looks[key];
    if (!l) return 'Starting…';
    if (l.link.holding) return `Silent for ${Math.round((now - (downSince[key] ?? now)) / 1000)} s (noticed 12 to 18 s in)`;
    if (l.gaveUp) return 'Gave up on the host';
    if (l.status === 'connecting') return 'Joining…';
    if (l.status === 'lost') return 'Lost the host';
    if (!l.mode) return 'Out of the room';
    const off = l.players.filter((p) => !p.connected).map((p) => p.name);
    return off.length ? `Offline: ${off.join(', ')}` : l.phase ? `In the ${l.phase === 'lobby' ? 'lobby' : 'game'}` : 'In the room';
  }

  /** Keeps the room as it stands now as a scene of its own (the host's state). */
  async function save(state: GameState, at: number) {
    const seats = room.seats.map((s) => ({ mode: s.role === 'host' ? ('host' as const) : s.role === 'guest' ? ('client' as const) : ('local' as const), me: s.role === 'local' ? null : s.playerId }));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const kept = { protocol: PROTOCOL_VERSION, label: `${scene.label}, played on (${state.phase})`, takenAt: new Date().toISOString(), at, seats, state };
    const name = `${scene.key.split('/').pop()}-${stamp}`;
    if (LOCAL) {
      const r = await fetch('./__qa/scenes/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ...kept }) }).then((x) => x.json(), () => null);
      note = r?.saved ? `Saved as ${r.saved}: it walks with the rest from the next reload.` : `Not saved: ${r?.error ?? 'the dev server did not answer'}.`;
    } else {
      // The beta has no files to write: the scene comes as a file, for src/qa/captured/.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(kept, null, 1)], { type: 'application/json' }));
      a.download = `${name}.json`;
      a.click();
      note = `Downloaded ${name}.json: put it in src/qa/captured/ to keep it.`;
    }
  }
</script>

<div class="live">
  <p class="room">
    <span class="scene">Playing from “{scene.label}”</span>
    <span class="sep">•</span>
    <span>Room <span class="num">{room.code}</span></span>
    {#if room.offline.length}<span class="sep">•</span><span>No seat, so offline: {room.offline.join(', ')}</span>{/if}
    {#if note}<span class="sep">•</span><span class="note">{note}</span>{/if}
    <span class="spacer"></span>
    <button onclick={() => ask(room.seats[0].key, { op: 'save' })}>Save as scene</button>
    <button onclick={onexit}>Stop playing <kbd>Esc</kbd></button>
  </p>
  <div class="stage" bind:clientWidth={cw} bind:clientHeight={ch}>
    {#if failed}
      <p class="empty">{failed}</p>
    {:else if ready}
      <div class="row" style:gap="{GAP}px">
        {#each room.seats as seat, i (seat.key)}
          <figure class="seat">
            <div class="screen" style:width="{size.w * scale}px" style:height="{size.h * scale}px">
              <iframe
                bind:this={frames[seat.key]}
                name="qa:{room.nonce}:{seat.key}"
                title="{seat.name}, live"
                src={src(seat.key, i)}
                style:width="{size.w}px"
                style:height="{size.h}px"
                style:transform="scale({scale})"
                allow="autoplay; clipboard-write"
              ></iframe>
            </div>
            <figcaption>
              <span class="who">{seat.name} ({seat.role === 'local' ? 'this device' : seat.role})</span>
              <span class="state" class:down={looks[seat.key]?.link.holding}>{status(seat.key)}</span>
              <span class="tools">
                <button class:on={looks[seat.key]?.bot} onclick={() => ask(seat.key, { op: 'bot', on: !looks[seat.key]?.bot })}>Bot</button>
                {#if seat.role !== 'local'}
                  <button class:on={lagOf(seat.key) > 0} onclick={() => ask(seat.key, { op: 'lag', ms: nextLag(seat.key) })}>Lag {lagOf(seat.key) ? `${lagOf(seat.key)} ms` : 'off'}</button>
                  <button class:on={looks[seat.key]?.link.holding} onclick={() => drop(seat.key)}>{looks[seat.key]?.link.holding ? 'Bring back' : 'Drop link'}</button>
                  <button onclick={() => ask(seat.key, { op: 'cut' })}>Cut</button>
                {/if}
                <button onclick={() => ask(seat.key, { op: 'reload' })}>Reload</button>
                {#if seat.role === 'guest'}
                  <button onclick={() => ask('host', { op: 'kick', id: seat.playerId ?? '' })}>Kick</button>
                {/if}
              </span>
            </figcaption>
          </figure>
        {/each}
      </div>
    {:else}
      <p class="empty">Starting the room…</p>
    {/if}
  </div>
</div>
