<script lang="ts">
  // An invite link's room, in the start page's right-hand column: the room
  // as the lobby will show it, so arriving and joining look like one place.
  // What it shows is the room's own word, asked when the screen opened
  // (lib/rooms.ts probeRoom): its host, how many are in, and whether it can
  // be joined. Nothing a link says about a room is taken on trust. (Asking
  // connects to the host, as the room list's probes do; the privacy policy
  // says so.) The chips are unlit: a player's colour is given by the room
  // once they are in.
  import { fade } from 'svelte/transition';
  import { initialOf } from '../lib/names';
  import { inviteLine, type InviteAnswer } from '../lib/roomInfo';
  import HostMark from './HostMark.svelte';
  import RoomCodeGlyphs from './RoomCodeGlyphs.svelte';

  let { code, info, name }: { code: string; info: InviteAnswer; name: string } = $props();

  const mine = $derived(name.trim());
  const host = $derived(info && info !== 'gone' ? info.host : '');
  const line = $derived(inviteLine(info));
</script>

<div class="invite-room">
  <section class="block">
    <header><h2>Room code</h2></header>
    <div class="code" aria-label="Room code {code}"><RoomCodeGlyphs {code} delay={300} /></div>
  </section>

  <section class="block">
    <header><h2>Party</h2></header>
    <ul class="chips">
      {#if host}
        <li in:fade={{ duration: 250 }}>
          <span class="orb" aria-hidden="true">{initialOf(host)}</span>
          <span class="name">{host}</span>
          <HostMark />
        </li>
      {:else if line.waiting}
        <!-- The host's place, while the room is asked whose it is. -->
        <li class="asking" aria-hidden="true"><span class="orb"></span><span class="name">Host</span></li>
      {/if}
      <!-- Your chip, as it will stand beside the host's: it takes your name as you write it. -->
      <li class="you" class:empty={!mine}>
        <span class="orb" aria-hidden="true">{initialOf(mine)}</span>
        <span class="name">{#if mine}{mine}<em>&nbsp;(you)</em>{:else}You{/if}</span>
      </li>
    </ul>
    {#key line.text}
      <p class="hint" class:warn={line.warn} role="status" in:fade={{ duration: 250 }}>{#if line.waiting}<span class="pulse" aria-hidden="true"></span>{/if}{line.text}</p>
    {/key}
  </section>
</div>

<style>
  /* The lobby's open blocks (Lobby.svelte, desktop): a heading over a hairline, then its content. */
  .invite-room {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
  }
  .block header {
    margin-bottom: 1rem;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid rgba(125, 99, 51, 0.35);
  }
  .block h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 20px;
    letter-spacing: 0.02em;
    text-transform: none;
    color: var(--gold);
  }
  .code {
    display: flex;
    width: 100%;
  }
  /* The party: the lobby's chips, two to a row. */
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .chips li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    padding: 0.45rem 0.8rem 0.45rem 0.5rem;
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.75);
    border: 1px solid var(--line);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: 2px;
    font-size: 0.98rem;
    line-height: 1.1;
    padding-bottom: 0.2em;
    margin-bottom: -0.2em;
  }
  .name em {
    color: var(--muted);
    font-size: 0.85em;
  }
  /* Unlit: the Avatar's shape and ring, before the room gives it a colour. */
  .orb {
    flex: none;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: 15px;
    padding-top: 1px;
    color: var(--gold-hi);
    background: radial-gradient(circle at 35% 30%, #3a2c1c, #17110b 70%);
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px var(--gold-lo),
      0 4px 10px rgba(0, 0, 0, 0.5);
  }
  .you.empty {
    border-style: dashed;
    border-color: rgba(125, 99, 51, 0.6);
  }
  .you.empty .orb {
    background: none;
    box-shadow: none;
    border: 1px dashed var(--gold-lo);
  }
  .you.empty .name {
    font-style: italic;
    color: var(--muted);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.8rem 0 0;
    font-size: 0.95rem;
    font-style: italic;
    color: #ab9d88;
  }
  /* Joining won't work as it stands (or not as a player at once). */
  .hint.warn {
    color: #e0a48f;
  }
  /* Asked: a beat while the room answers. */
  .pulse {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gold);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  .asking {
    border-style: dashed;
    border-color: rgba(125, 99, 51, 0.6);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .asking .orb {
    background: none;
    box-shadow: none;
    border: 1px dashed var(--gold-lo);
  }
  .asking .name {
    font-style: italic;
    color: var(--muted);
  }

</style>
