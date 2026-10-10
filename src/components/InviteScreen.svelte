<script lang="ts">
  // An invite link (?room=CODE) opens this instead of the start page: the
  // room's code, a name, and one button to go in. "Back to the start" drops
  // the link's room and shows the start page.
  import { fade, fly } from 'svelte/transition';
  import { backdropShadow } from '../lib/backdropShadow';
  import { MAX_NAME } from '../lib/names';
  import { stage } from '../lib/stage';
  import GameTitle from './GameTitle.svelte';
  import Connecting from './Connecting.svelte';

  let {
    code,
    name = $bindable(),
    connecting,
    onjoin,
    onback,
  }: { code: string; name: string; connecting: boolean; onjoin: (field: HTMLInputElement) => void; onback: () => void } = $props();

  let field = $state<HTMLInputElement>();

  function submit(e: Event) {
    e.preventDefault();
    if (field && !connecting) onjoin(field);
  }
</script>

<div class="invite" use:stage>
  <header>
    <GameTitle lines />
    <p class="kicker" in:fade={{ duration: 700, delay: 350 }}>Unique item trivia</p>
    <p class="blurb" in:fade={{ duration: 700, delay: 450 }}>Path of Exile 2 item trivia, with friends or alone.</p>
  </header>

  <form class="card panel" use:backdropShadow={{ fill: 'linear' }} onsubmit={submit} in:fly={{ y: 24, duration: 600, delay: 300 }}>
    <h2>You are invited to room</h2>
    <div class="glyphs" aria-label="Room code {code}">
      {#each code.split('') as ch, i (i)}
        <span class="glyph" style:animation-delay="{300 + i * 80}ms">{ch}</span>
      {/each}
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="field"
      bind:this={field}
      bind:value={name}
      maxlength={MAX_NAME}
      placeholder="Your name"
      aria-label="Your name"
      autocomplete="nickname"
      spellcheck="false"
      autofocus={!name}
      disabled={connecting}
    />
    {#if connecting}
      <div class="busy"><Connecting /></div>
    {:else}
      <button class="btn primary go" type="submit">Join the room</button>
    {/if}
    <p class="ip">Joining shares your IP address with the room.</p>
  </form>

  <button class="back" onclick={onback} disabled={connecting} in:fade={{ duration: 500, delay: 600 }}><span aria-hidden="true">‹</span> <u>Back to the start</u></button>
</div>

<style>
  /* The start page's stage (lib/stage.ts): centred in the window, scaled up
     on very large ones. */
  .invite {
    zoom: var(--stage-zoom, 1);
    max-width: 1440px;
    margin-inline: auto;
    min-height: calc(100dvh / var(--stage-zoom, 1));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
  }
  header {
    --title-size: 84px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  /* As on the start page: the site's kicker under the title. Its spacing
     trails the last letter, so as much leads the first to keep it centred. */
  .kicker {
    position: relative;
    margin: 6px 0 0;
    padding-left: 0.5em;
    font-family: var(--font-display);
    font-size: 15px;
    letter-spacing: 0.5em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .blurb {
    position: relative;
    margin: 4px 0 0;
    font-size: 17px;
    color: #a99c86;
  }
  .card {
    width: min(520px, 100%);
    margin-top: 40px;
    padding: 36px 36px 30px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 24px;
    text-align: center;
  }
  h2 {
    font-size: 20px;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--gold);
  }
  .glyphs {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: -6px;
  }
  /* The code's letters, as the lobby shows them. */
  .glyph {
    width: 58px;
    height: 70px;
    display: grid;
    place-items: center;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: 32px;
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
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-18px) rotateX(70deg);
    }
  }
  .field {
    height: 48px;
  }
  .busy {
    display: flex;
    justify-content: center;
    min-height: 48px;
  }
  .go {
    height: 48px;
    font-size: 15px;
  }
  .ip {
    margin: -8px 0 0;
    font-style: italic;
    font-size: 15px;
    color: #a99c86;
  }
  .back {
    margin-top: 28px;
    min-height: 44px;
    padding: 0 8px;
    background: none;
    border: 0;
    cursor: pointer;
    font-size: 17px;
    color: var(--gold);
  }
  .back span {
    margin-right: 0.4em;
    font-size: 15px;
    color: var(--muted);
  }
  .back u {
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 4px;
  }
  .back:hover:not(:disabled) {
    color: var(--gold-hi);
  }
  .back:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (max-width: 640px) {
    .invite {
      justify-content: flex-start;
      padding-top: 40px;
    }
    header {
      --title-size: 54px;
    }
    .kicker {
      padding-left: 0.4em;
      font-size: 13px;
      letter-spacing: 0.4em;
    }
    .blurb {
      font-size: 15px;
    }
    .card {
      margin-top: 40px;
      padding: 32px 18px 24px;
      gap: 20px;
    }
    .glyphs {
      gap: 5px;
    }
    .glyph {
      flex: 1;
      max-width: 48px;
      height: 58px;
      font-size: 26px;
    }
  }
</style>
