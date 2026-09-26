<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { engine, session, savedName, saveName } from '../lib/session.svelte';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';

  const params = new URLSearchParams(location.search);
  const invite = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

  let name = $state(savedName());
  let code = $state(invite);
  let nameError = $state(false);

  const total = engine.items.length;
  const showcase = [...engine.items].sort(() => Math.random() - 0.5).slice(0, 7);

  function needName() {
    const n = name.trim();
    if (!n) {
      nameError = true;
      setTimeout(() => (nameError = false), 600);
      document.getElementById('name')?.focus();
      return null;
    }
    saveName(n);
    return n;
  }

  function host() {
    const n = needName();
    if (!n) return;
    sfx('click');
    session.host(n);
  }

  function join(e?: Event) {
    e?.preventDefault();
    const n = needName();
    if (!n) return;
    if (code.length < 5) {
      document.getElementById('code')?.focus();
      return;
    }
    sfx('click');
    if (invite) history.replaceState(null, '', location.pathname);
    session.join(code, n);
  }

  function local() {
    sfx('click');
    session.startLocal();
  }

  const connecting = $derived(session.status === 'connecting');
</script>

<div class="home">
  <div class="hero">
    <div class="showcase" aria-hidden="true">
      {#each showcase as it, i (it.id)}
        <img
          src={itemImage(it.id)}
          alt=""
          style:--i={i}
          style:--x="{(i - 3) * 15}vw"
          style:--r="{(i - 3) * 6}deg"
        />
      {/each}
    </div>
    <p class="kicker" in:fly={{ y: -10, duration: 600, delay: 100 }}>Path of Exile 2</p>
    <h1 in:fly={{ y: 20, duration: 800, delay: 200 }}>
      <span class="line"></span>Exile Trivia<span class="line"></span>
    </h1>
    <p class="tagline" in:fade={{ duration: 800, delay: 500 }}>
      Name the unique. {total} legendary items. One of four names is true.
    </p>
  </div>

  <div class="card panel" in:fly={{ y: 30, duration: 700, delay: 400 }}>
    <label class="label" for="name">Your name, Exile</label>
    <input
      id="name"
      class="field"
      class:shake={nameError}
      bind:value={name}
      maxlength="20"
      placeholder="e.g. Doryani"
      autocomplete="nickname"
      onkeydown={(e) => e.key === 'Enter' && (invite ? join() : host())}
    />

    <div class="modes">
      <section class="mode">
        <h2>Host a game</h2>
        <p class="muted">Open a room and share the code with your party.</p>
        <button class="btn primary" onclick={host} disabled={connecting}>Create room</button>
      </section>

      <section class="mode">
        <h2>Join a game</h2>
        <form onsubmit={join}>
          <input
            id="code"
            class="field code"
            bind:value={code}
            oninput={() => (code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            placeholder="CODE"
            maxlength="5"
            autocomplete="off"
            spellcheck="false"
            aria-label="Room code"
          />
          <button class="btn" class:primary={!!invite} type="submit" disabled={connecting || code.length < 5}>
            Join
          </button>
        </form>
      </section>
    </div>

    <div class="or"><span>or</span></div>
    <button class="btn ghost wide" onclick={local} disabled={connecting}>
      Play hot-seat on this device
    </button>

    {#if session.error}
      <p class="error" transition:fly={{ y: -6, duration: 250 }}>{session.error}</p>
    {/if}

    {#if connecting}
      <div class="connecting" transition:fade={{ duration: 200 }}>
        <span class="rune"></span>
        <span>{session.mode === 'host' ? 'Opening a portal…' : `Travelling to room ${session.code}…`}</span>
        <button class="btn ghost small" onclick={() => session.leave()}>Cancel</button>
      </div>
    {/if}
  </div>

  <footer class="muted">
    Item data &amp; art from <a href="https://poe2db.tw/us/Unique_item" target="_blank" rel="noreferrer">poe2db.tw</a>.
    Path of Exile is a trademark of Grinding Gear Games. Fan project.
  </footer>
</div>

<style>
  .home {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2.5rem 1rem 1.5rem;
    gap: 2rem;
  }

  .hero {
    position: relative;
    text-align: center;
    padding: 2rem 0 0.5rem;
  }
  .showcase {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .showcase img {
    position: absolute;
    width: 110px;
    height: 110px;
    object-fit: contain;
    left: -55px;
    top: -75px;
    opacity: 0;
    filter: blur(1px) saturate(0.7) drop-shadow(0 0 20px rgba(0, 0, 0, 0.9));
    transform: translate(var(--x), 0) rotate(var(--r));
    animation:
      appear 1.4s var(--ease-out) forwards,
      float 7s ease-in-out infinite;
    animation-delay: calc(var(--i) * 0.12s), calc(var(--i) * -1.1s);
  }
  @keyframes appear {
    to {
      opacity: 0.22;
    }
  }
  @keyframes float {
    50% {
      translate: 0 -14px;
    }
  }

  .kicker {
    position: relative;
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.5em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  h1 {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    justify-content: center;
    font-size: clamp(2.6rem, 8vw, 5rem);
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.06em;
    background: linear-gradient(180deg, #fff1c9 10%, #d7b068 50%, #8b6526 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 30px rgba(201, 164, 92, 0.25));
  }
  .line {
    display: block;
    width: clamp(30px, 8vw, 90px);
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold));
  }
  .line:last-child {
    background: linear-gradient(270deg, transparent, var(--gold));
  }
  .tagline {
    position: relative;
    margin: 1rem 0 0;
    font-style: italic;
    font-size: 1.15rem;
    color: #b8ab95;
  }

  .card {
    width: min(620px, 100%);
    padding: 1.8rem;
  }

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1.4rem;
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .mode h2 {
    font-size: 0.95rem;
    color: var(--gold-hi);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .mode p {
    margin: 0;
    font-size: 0.98rem;
    flex: 1;
  }
  .mode form {
    display: flex;
    gap: 0.5rem;
    margin-top: auto;
  }
  .code {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.35em;
    text-align: center;
    text-transform: uppercase;
    min-width: 0;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin: 1.1rem 0 0.8rem;
    color: var(--muted);
    font-style: italic;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .wide {
    width: 100%;
  }

  .error {
    margin: 1rem 0 0;
    padding: 0.6rem 0.9rem;
    border-left: 2px solid var(--bad);
    background: rgba(224, 85, 63, 0.08);
    color: #f0a595;
  }

  .connecting {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: rgba(12, 10, 8, 0.92);
    border-radius: var(--radius);
    font-family: var(--font-display);
    letter-spacing: 0.08em;
    color: var(--gold-hi);
  }
  .rune {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    border-bottom-color: var(--unique-hi);
    animation: spin 1.1s linear infinite;
    box-shadow: 0 0 25px rgba(201, 164, 92, 0.2);
  }

  .shake {
    animation: shake 0.45s;
    border-color: var(--bad);
  }

  footer {
    font-size: 0.85rem;
    text-align: center;
    max-width: 520px;
  }
  footer a {
    color: var(--gold);
  }

  @media (max-width: 560px) {
    .modes {
      grid-template-columns: 1fr;
    }
    .card {
      padding: 1.3rem;
    }
    .showcase img {
      width: 80px;
      height: 80px;
    }
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  @keyframes shake {
    20%,
    60% {
      translate: -6px 0;
    }
    40%,
    80% {
      translate: 6px 0;
    }
  }
</style>
