<script lang="ts">
  // An invite link's room, in the start page's right-hand column: the room
  // as the lobby will show it, so arriving and joining look like one place.
  // The link knows the code and (if the host's build adds it) the host's
  // name; nothing else can be known without connecting, and connecting
  // shares the player's IP, so nothing else is shown. The chips are unlit:
  // a player's colour is given by the room once they are in.
  import { initialOf } from '../lib/names';
  import { IP_NOTE } from '../lib/site';
  import HostMark from './HostMark.svelte';
  import RoomCodeGlyphs from './RoomCodeGlyphs.svelte';

  let { code, host, name }: { code: string; host: string; name: string } = $props();

  const mine = $derived(name.trim());
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
        <li>
          <span class="orb" aria-hidden="true">{initialOf(host)}</span>
          <span class="name">{host}</span>
          <HostMark />
        </li>
      {/if}
      <!-- Your chip, as it will stand beside the host's: it takes your name as you write it. -->
      <li class="you" class:empty={!mine}>
        <span class="orb" aria-hidden="true">{initialOf(mine)}</span>
        <span class="name">{#if mine}{mine}<em>&nbsp;(you)</em>{:else}You{/if}</span>
      </li>
    </ul>
    <p class="hint">The rest of the party shows once you are in.</p>
  </section>

  <!-- The same words as the lobby's, said where joining is decided. -->
  <p class="ip-note">{IP_NOTE}</p>
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
    margin: 0.8rem 0 0;
    font-size: 0.95rem;
    font-style: italic;
    color: #ab9d88;
  }
  .ip-note {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #8f8370;
  }
</style>
