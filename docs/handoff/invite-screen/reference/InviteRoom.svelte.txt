<script lang="ts">
  // An invite link's room, in the start page's right-hand column: the room
  // as the lobby will show it, so arriving and joining look like one place.
  // The link knows the code and (if the host's build adds it) the host's
  // name; nothing else can be known without connecting, and connecting
  // shares the player's IP, so nothing else is shown. The chips are unlit:
  // a player's colour is given by the room once they are in.
  let { code, host, name }: { code: string; host: string; name: string } = $props();

  const mine = $derived(name.trim());
  const initial = (n: string) => n.charAt(0).toUpperCase();
</script>

<div class="invite-room">
  <section class="block">
    <header><h2>Room code</h2></header>
    <div class="glyphs" aria-label="Room code {code}">
      {#each code.split('') as ch, i (i)}
        <span class="glyph" style:--i={i} style:animation-delay="{300 + i * 80}ms">{ch}</span>
      {/each}
    </div>
  </section>

  <section class="block">
    <header><h2>Party</h2></header>
    <ul class="chips">
      {#if host}
        <li>
          <span class="orb" aria-hidden="true">{initial(host)}</span>
          <span class="name">{host}</span>
          <span class="host" role="img" aria-label="Host" title="Host"
            ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 3.5h15" /><path d="M7 3.5V19l5-3.4 5 3.4V3.5" /><path d="M12 7.2l1.6 1.6-1.6 1.6-1.6-1.6z" /></svg
            ></span
          >
        </li>
      {/if}
      <!-- Your chip, as it will stand beside the host's: it takes your name as you write it. -->
      <li class="you" class:empty={!mine}>
        <span class="orb" aria-hidden="true">{mine ? initial(mine) : ''}</span>
        <span class="name">{#if mine}{mine}<em>&nbsp;(you)</em>{:else}You{/if}</span>
      </li>
    </ul>
    <p class="hint">The rest of the party shows once you are in.</p>
  </section>

  <!-- The same words as the lobby's, said where joining is decided. -->
  <p class="ip-note">Players in a room connect directly, so they can see each other's IP address. Only play with people you're comfortable sharing that with.</p>
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
  /* The room code: the lobby's glyphs. */
  .glyphs {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    container-type: inline-size;
    -webkit-user-select: all;
    user-select: all;
  }
  .glyph {
    flex: 1;
    min-width: 0;
    height: clamp(58px, 14vw, 72px);
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: min(2.6rem, (100cqi - 5 * 0.5rem) / 6 * 0.74);
    color: var(--gold-hi);
    background: linear-gradient(180deg, #221a11, #0d0a07);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 0 18px rgba(201, 164, 92, 0.12),
      0 6px 18px rgba(0, 0, 0, 0.6);
    text-shadow: 0 0 16px rgba(241, 217, 155, 0.45);
    animation: drop 0.6s var(--ease-back) both;
  }
  .glyph::after {
    content: '';
    position: absolute;
    inset: -20% auto -20% -80%;
    width: 60%;
    background: linear-gradient(100deg, transparent, rgba(255, 240, 200, 0.22), transparent);
    transform: skewX(-16deg);
    animation: glance 6s ease-in-out infinite;
    animation-delay: calc(1.2s + var(--i, 0) * 0.12s);
    pointer-events: none;
  }
  @keyframes glance {
    0% {
      translate: 0 0;
    }
    18%,
    100% {
      translate: 420% 0;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-18px) rotateX(70deg);
    }
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
  /* The host: the lobby's hanging banner. */
  .host {
    flex: none;
    display: grid;
    place-items: center;
    margin: 0 0.2rem 0 0.3rem;
    color: #d8b56e;
    filter: drop-shadow(0 0 5px rgba(241, 217, 155, 0.45));
  }
  .host svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
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
