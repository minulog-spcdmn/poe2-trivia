<script lang="ts">
  // The settings page, opened from the start page (#settings). It is set as
  // the lobby is, on the start page's columns: on the left, unframed, the
  // sound, the screen and the name; on the right, in the one framed panel,
  // the keys, each on the seal the answers wear in a game. Everything takes
  // at once and is kept in this browser; only a new name waits for Save.
  // `over`: opened in a room from the header's gear, inside App's sheet over
  // the game. The name and the class sigil are left out there (the room has
  // them already; neither changes mid-game) and the keys go unframed, the
  // sheet being their frame.
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { fly } from 'svelte/transition';
  import { getAmbience, getVolume, isMuted, onSoundChange, setAmbience, setMuted, setVolume, sfx } from '../lib/sound';
  import { fxAvailable, fxUserOn, onFxChange, setFxOn } from '../lib/fx/core';
  import { session, savedName, saveName } from '../lib/session.svelte';
  import { MAX_NAME, nameRefusal } from '../lib/names';
  import { refuseName } from '../lib/nameField';
  import { backdropShadow } from '../lib/backdropShadow';
  import { ACTIONS, OPTIONS, SLOTS, actionDoes, actionName, bindable, keyName, type Action } from '../lib/keys';
  import { clearKey, keybinds, readLayout, resetKeys, setKey } from '../lib/keybinds.svelte';
  import { ACHIEVEMENTS_KEY, loadAchievements } from '../lib/achievements';
  import { achievementsIn } from '../lib/sigils';
  import { CLASSES } from '../lib/classSigils';
  import { onStoredElsewhere } from '../lib/storage';
  import { COLOUR_KEY, loadColour, saveColour } from '../lib/colour';
  import { PALETTE, RUBY, STONES } from '../lib/palette';
  import SigilPicker from './SigilPicker.svelte';

  let { over = false }: { over?: boolean } = $props();

  // ---- sound ----

  let muted = $state(isMuted());
  let volume = $state(getVolume());
  let ambience = $state(getAmbience());
  onMount(() =>
    onSoundChange(() => {
      muted = isMuted();
      volume = getVolume();
      ambience = getAmbience();
    }),
  );
  const shownVolume = $derived(muted ? 0 : volume);

  function slideVolume(e: Event) {
    setVolume((e.currentTarget as HTMLInputElement).valueAsNumber);
    // Drawn up from muted, the sound comes back.
    if (muted && volume > 0) setMuted(false);
  }

  // ---- the screen ----

  // (The effects layer may only say it can run a moment after the page opens.)
  let fxCan = $state(fxAvailable());
  let fxOn = $state(fxUserOn());
  onMount(() =>
    onFxChange((on) => {
      fxOn = on;
      fxCan = fxAvailable();
    }),
  );

  // ---- the name ----

  const saved = savedName().trim();
  let name = $state(saved);
  let draft = $state(saved);
  let nameField = $state<HTMLInputElement>();
  let shaking = $state(false);
  function saveDraft(e: Event) {
    e.preventDefault();
    const n = draft.trim();
    if (n === name) return;
    const refusal = nameRefusal(n);
    if (refusal) {
      // (An empty field is refused without a word.)
      refuseName(nameField ?? null, n ? refusal : { reason: null }, (on) => (shaking = on));
      return;
    }
    saveName(n);
    name = draft = n;
    nameField?.blur();
  }

  // ---- the colour ----

  /** The avatar colour picked (lib/colour.ts), if any: every seat's but ruby. */
  let colour = $state(loadColour());
  onMount(() => onStoredElsewhere({ [COLOUR_KEY]: () => (colour = loadColour()) }));
  const choosable = PALETTE.slice(0, RUBY).map((c, h) => ({ h, c }));
  function pickColour(h: number | null) {
    if (h === colour || !saveColour(h)) return;
    colour = h;
    session.likeColour();
  }

  // ---- class sigils ----

  // (Only on the page: in a game the sigil stays as it came in.)
  /** Achievements earned, each worth a sigil (SigilPicker), read again when another tab earns one. */
  let earned = $state(achievementsIn(loadAchievements()));
  onMount(() => onStoredElsewhere({ [ACHIEVEMENTS_KEY]: () => (earned = achievementsIn(loadAchievements())) }));
  let unlocked = $state(0);
  /**
   * Wide enough for the twelve in a row beside the avatar, each still its
   * full size, and only with a pointer that hovers, which is what names each
   * one there. Otherwise they take the picker's own grid (and the page may scroll).
   */
  const roomy = new MediaQuery('(min-width: 1100px) and (hover: hover)');

  // ---- keys ----

  /** Only where there's a keyboard to speak of: anything with a mouse or the like. */
  const keyboard = new MediaQuery('(any-pointer: fine)');
  onMount(readLayout);

  /** The seal waiting for a key, if one is. */
  let listening = $state<{ action: Action; slot: number } | null>(null);
  /** What the last key set took from another action, to say so. */
  let moved = $state<{ key: string; from: Action } | null>(null);

  const cap = (code: string | undefined) => (code ? keyName(code, keybinds.layout) : '');

  function listen(action: Action, slot: number) {
    moved = null;
    listening = listening?.action === action && listening.slot === slot ? null : { action, slot };
  }

  /** Heard first, while a seal waits: the key pressed goes to it, and nothing else hears it. */
  function capture(e: KeyboardEvent) {
    if (!listening || e.ctrlKey || e.metaKey || e.altKey) return;
    // Tab still moves the focus, and ends the wait as a click elsewhere would.
    if (e.code === 'Tab') {
      listening = null;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const { action, slot } = listening;
    if (e.code === 'Backspace') {
      clearKey(action, slot);
      listening = null;
      return;
    }
    // (Shift and the like alone: still waiting.)
    if (!bindable(e.code)) return;
    const from = ACTIONS.find((a) => a !== action && keybinds.map[a].includes(e.code));
    setKey(action, slot, e.code);
    moved = from ? { key: e.code, from } : null;
    listening = null;
    sfx('click');
  }

  /** A press anywhere but on a seal stops the wait. */
  function away(e: PointerEvent) {
    if (listening && !(e.target as Element | null)?.closest?.('.seal')) listening = null;
  }

  const ANSWERS = ACTIONS.slice(0, OPTIONS);
  const IN_GAME: Action[] = ['next', 'detonate'];
  const ANYWHERE: Action[] = ['mute', 'settings'];
  /** A fly-in on the page; none in the sheet over a game, which comes in as one. */
  const enter = (x: number, delay: number) => (over ? { duration: 0 } : { x, duration: 500, delay });
</script>

<svelte:window onkeydowncapture={capture} onpointerdown={away} />

{#snippet keyRow(a: Action)}
  <div class="key-row">
    <span class="key-name">{actionName(a)}</span>
    {#each Array.from({ length: SLOTS }, (_, i) => i) as slot (slot)}
      {@const code = keybinds.map[a][slot]}
      {@const on = listening?.action === a && listening.slot === slot}
      <button
        class="seal"
        class:on
        class:wide={[...cap(code)].length > 1}
        class:empty={!code}
        data-sfx="none"
        onclick={() => listen(a, slot)}
        aria-label="{actionName(a)}{a.startsWith('option') ? ' option' : ''}, {slot ? 'second' : 'first'} key: {code ? cap(code) : 'none'}"
      >
        <!-- Kept while it waits, out of sight, so the seal keeps its width. -->
        <span class:hush={on}>{cap(code)}</span>
      </button>
    {/each}
  </div>
{/snippet}

<div class="settings" class:over>
  <div class="cols" class:one={!keyboard.current} class:over>
    <div class="col side">
      <section class="block" in:fly={enter(-30, 50)}>
        <header><h2>Sound</h2></header>
        <div class="row">
          <label class="label" for="set-volume">Volume</label>
          <div class="slide">
            <input id="set-volume" type="range" min="0" max="1" step="0.05" value={shownVolume} oninput={slideVolume} onchange={() => sfx('click')} style:--level={shownVolume} />
            <span class="num">{Math.round(shownVolume * 100)}</span>
          </div>
        </div>
        <div class="row">
          <label class="label" for="set-ambience">Ambience</label>
          <div class="slide">
            <input id="set-ambience" type="range" min="0" max="1" step="0.05" value={ambience} oninput={(e) => setAmbience(e.currentTarget.valueAsNumber)} disabled={muted} style:--level={ambience} />
            <span class="num">{Math.round(ambience * 100)}</span>
          </div>
        </div>
      </section>

      <section class="block" in:fly={enter(-30, 110)}>
        <header><h2>Screen</h2></header>
        {#if fxCan}
          <div class="row">
            <span class="label">Visual effects</span>
            <div class="seg">
              <button class:on={fxOn} onclick={() => setFxOn(true)}>On</button>
              <button class:on={!fxOn} onclick={() => setFxOn(false)}>Off</button>
            </div>
          </div>
        {/if}
        <div class="row">
          <span class="label">Room code</span>
          <div class="seg">
            <button class:on={!session.hideCode} onclick={() => session.setHideCode(false)}>Shown</button>
            <button class:on={session.hideCode} onclick={() => session.setHideCode(true)}>Hidden</button>
          </div>
          <p class="blurb">Hidden, it stays off your stream until you reveal it in the lobby.</p>
        </div>
      </section>

      {#if !over}
      <section class="block" in:fly={enter(-30, 170)}>
        <!-- The colour beside the heading, which takes no room the page hasn't got: picked again, it's let go. -->
        <header>
          <h2>You</h2>
          <div class="swatches" role="radiogroup" aria-label="Your colour">
            {#each choosable as { h, c } (h)}
              <button
                class="swatch"
                class:on={colour === h}
                style:--c={c}
                role="radio"
                aria-checked={colour === h}
                aria-label={STONES[h]}
                title={colour === h ? `${STONES[h]}, your colour in a room while nobody who picked it first is there` : STONES[h]}
                onclick={() => pickColour(colour === h ? null : h)}
              ></button>
            {/each}
          </div>
        </header>
        <form class="name-row" onsubmit={saveDraft}>
          <input
            class="field name"
            class:shake={shaking}
            bind:this={nameField}
            bind:value={draft}
            maxlength={MAX_NAME}
            placeholder="Your name"
            aria-label="Your name"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="done"
          />
          <button class="btn" type="submit" disabled={draft.trim() === name}>Save</button>
        </form>

      </section>
      {/if}
    </div>

    {#if keyboard.current && over}
      <section class="col block keys" in:fly={enter(30, 200)}>{@render keys()}</section>
    {:else if keyboard.current}
      <section class="col block keys panel" use:backdropShadow={{ fill: 'linear' }} in:fly={enter(30, 200)}>{@render keys()}</section>
    {/if}

    <!-- Under both columns, the width of the page: the twelve in a row. -->
    {#if !over}
      <section class="block sigil-row" in:fly={{ y: 20, duration: 500, delay: 260 }}>
        <header>
          <h2>Class sigils</h2>
          <span class="count">{unlocked} / {CLASSES.length}</span>
        </header>
        <SigilPicker achievements={earned} bind:unlocked strip={roomy.current} hue={colour ?? 0} />
      </section>
    {/if}
  </div>
</div>

{#snippet keys()}
        <header>
          <h2>Keys</h2>
          <!-- Kept in its place with nothing to reset, so the heading never moves. -->
          <button class="reset" class:gone={!keybinds.changed} disabled={!keybinds.changed} onclick={() => ((moved = null), (listening = null), resetKeys())}>Reset</button>
        </header>

        <h3 class="group">Answers and cards</h3>
        <div class="key-grid answers">
          {#each ANSWERS as a (a)}{@render keyRow(a)}{/each}
        </div>

        <!-- Side by side, under the answers' two columns, their seals in line with them. -->
        <div class="groups">
          <div>
            <h3 class="group">In a game</h3>
            <div class="key-grid">
              {#each IN_GAME as a (a)}{@render keyRow(a)}{/each}
            </div>
          </div>
          <div>
            <h3 class="group">Anywhere</h3>
            <div class="key-grid">
              {#each ANYWHERE as a (a)}{@render keyRow(a)}{/each}
            </div>
          </div>
        </div>

        <!-- One line, kept, at the panel's foot: what to do, or what the last key changed. -->
        <p class="note" aria-live="polite">
          {#if listening}
            Press a key. Backspace clears it; Tab or a click elsewhere keeps the old one.
          {:else if moved}
            {cap(moved.key)} no longer {actionDoes(moved.from)}.
          {:else}
            Click a key to change it.
          {/if}
        </p>
{/snippet}

<style>
  /* The lobby's stage: the start page's columns, at their sizes. */
  .settings {
    width: min(980px, 100%);
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  /* In the sheet over a game: the sheet's width, its padding the only margin. */
  .settings.over {
    width: 100%;
    padding: 1rem 0 0;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1.33fr;
    gap: 1.2rem;
    align-items: start;
  }
  /* Side by side the two columns end level: the side's blocks share out what's left. */
  .cols:not(.one, .over) {
    align-items: stretch;
  }
  /* In the sheet: the keys beyond a hairline, room on either side of it. */
  .cols.over:not(.one) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
    gap: 0;
  }
  .cols.over:not(.one) .keys {
    margin-left: 2rem;
    padding-left: 2rem;
    border-left: 1px solid var(--line);
  }
  .cols:not(.one, .over) .col.side {
    justify-content: space-between;
  }
  .cols.one {
    grid-template-columns: minmax(0, 480px);
    justify-content: center;
  }
  /* In the sheet with no keys to show (a touch screen), where there's the
     width: the sound and the screen side by side, so a phone on its side
     sees them whole. */
  @media (min-width: 640px) {
    .cols.over.one {
      grid-template-columns: minmax(0, 1fr);
    }
    .cols.over.one .col.side {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0 2.5rem;
      align-items: start;
    }
  }
  @media (max-height: 500px) {
    .settings.over {
      padding-top: 0.5rem;
    }
  }
  .col.side {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    min-width: 0;
  }
  .block {
    min-width: 0;
  }
  .panel {
    padding: 1.4rem;
  }
  /* A section's name, as the lobby and the start page name theirs. */
  .block header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.4rem;
  }
  .block h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 1.12rem;
    letter-spacing: 0.02em;
    color: var(--gold);
  }

  /* A setting on one line: its name, then its choices (the lobby's rows). */
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.3rem 1rem;
    padding: 0.7rem 0;
    border-top: 1px solid rgba(59, 48, 36, 0.6);
  }
  /* A setting's name reads as words, not as a caption (app.css .label). */
  .label {
    margin: 0;
    font-family: var(--font-body);
    font-size: 1rem;
    letter-spacing: 0;
    text-transform: none;
    color: #c4b69c;
  }
  .blurb {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.92rem;
    font-style: italic;
    color: var(--muted);
  }

  /* The lobby's setting buttons. */
  .seg {
    display: flex;
    gap: 0.4rem;
  }
  .seg > button {
    min-width: 64px;
    padding: 0.45rem 0.7rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .seg > button:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .seg > button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border-color: var(--gold);
    text-shadow: 0 0 10px rgba(255, 220, 160, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 230, 170, 0.3),
      0 0 14px rgba(201, 164, 92, 0.3);
  }
  .seg > button:active {
    transform: scale(0.96);
  }

  /* The header's volume slider laid flat, its level beside it in Cinzel. */
  .slide {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .num {
    min-width: 2.2em;
    text-align: right;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.86rem;
    color: var(--gold-hi);
  }
  .slide input {
    --thumb: 12px;
    width: 180px;
    height: 24px;
    margin: 0;
    appearance: none;
    background: none;
    cursor: pointer;
  }
  .slide input:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .slide input::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    /* Gold up to the thumb's middle, which runs from half a thumb in at either end. */
    --fill: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--level, 0));
    background: linear-gradient(90deg, var(--gold) var(--fill), var(--line) var(--fill));
  }
  .slide input::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--line);
  }
  .slide input::-moz-range-progress {
    height: 4px;
    border-radius: 2px;
    background: var(--gold);
  }
  .slide input::-webkit-slider-thumb {
    appearance: none;
    width: var(--thumb);
    height: var(--thumb);
    /* Centred on the 4px track. */
    margin-top: calc((4px - var(--thumb)) / 2);
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }
  .slide input::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    border: 0;
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }

  /* The name and its Save, as the start page asks for a name. */
  .name-row {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.7rem;
    border-top: 1px solid rgba(59, 48, 36, 0.6);
  }
  .name-row .field {
    flex: 1;
    min-width: 0;
  }
  /* The colours as the avatars wear them, a ring of gold round the one picked. */
  .swatches {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.7rem;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c), white 35%), var(--c) 60%, color-mix(in srgb, var(--c), black 45%));
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3px color-mix(in srgb, var(--c), black 30%);
    cursor: pointer;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .swatch:hover {
    transform: scale(1.12);
  }
  .swatch.on {
    box-shadow:
      0 0 0 2px #0c0a08,
      0 0 0 3.5px var(--gold);
  }
  .swatch:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 4px;
  }
  /* For a finger: larger, on a line of their own under the heading, six and five, as far apart across as down. */
  @media (pointer: coarse) {
    .swatches {
      flex-basis: 100%;
      display: grid;
      grid-template-columns: repeat(6, 34px);
      justify-content: start;
      gap: 14px;
      margin: 0.35rem 0 0.4rem;
    }
    .swatch {
      width: 34px;
      height: 34px;
    }
  }
  .shake {
    animation: shake 0.4s;
  }
  @keyframes shake {
    20%,
    60% {
      transform: translateX(-5px);
    }
    40%,
    80% {
      transform: translateX(5px);
    }
  }

  /* ---- keys ---- */
  .keys header {
    margin-bottom: 1rem;
  }
  .reset {
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
  }
  .reset:hover {
    color: var(--gold-hi);
  }
  .reset.gone {
    visibility: hidden;
  }
  /* The lobby's rules' small capitals, naming each group. */
  .group {
    margin: 0 0 0.35rem;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .key-grid {
    display: grid;
    gap: 0 1.6rem;
    margin-bottom: 0.7rem;
  }
  /* The sigils under both columns, past a hairline. */
  .sigil-row {
    grid-column: 1 / -1;
    margin-top: 1.35rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--line);
  }
  .sigil-row header {
    margin-bottom: 0.25rem;
  }
  .count {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    font-style: normal;
    color: var(--muted);
  }
  .groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 1.6rem;
  }
  /* The ten answers in two columns of five, read down: first to fifth, then sixth to tenth. */
  .key-grid.answers {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(5, auto);
    grid-auto-flow: column;
  }
  /* Each seal in a column of its own, the same in every row and both groups,
     so the keys line up down the panel (a long name, Page Down, widens its own row). */
  .key-row {
    display: grid;
    grid-template-columns: 1fr minmax(46px, max-content) minmax(46px, max-content);
    justify-items: center;
    align-items: center;
    gap: 0.3rem;
    padding: 0.24rem 0;
    border-top: 1px solid rgba(59, 48, 36, 0.45);
  }
  .key-name {
    justify-self: start;
    font-size: 1rem;
    color: #c4b69c;
  }
  /* A key on the seal the answers wear in a game (QuestionView's .key), drawn
     out for a key whose name is a word; a waiting one is lit and breathes. */
  .seal {
    position: relative;
    isolation: isolate;
    width: 30px;
    height: 30px;
    padding: 2px 0 0;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--gold);
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--gold-lo);
    border-radius: 15px;
    cursor: pointer;
    white-space: nowrap;
    transition:
      color 0.25s,
      border-color 0.25s,
      box-shadow 0.25s;
  }
  .seal.wide {
    width: auto;
    min-width: 30px;
    padding-inline: 0.6em;
    font-size: 0.68rem;
  }
  .seal::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at 50% 30%, rgba(196, 128, 50, 0.6), rgba(60, 36, 12, 0.5) 75%);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .seal:hover,
  .seal.on {
    color: #fff4d8;
    border-color: var(--gold-hi);
    box-shadow: 0 0 12px rgba(241, 217, 155, 0.4);
  }
  .seal:hover::before,
  .seal.on::before {
    opacity: 1;
  }
  .seal.on {
    animation: breathe 1.1s ease-in-out infinite alternate;
  }
  @keyframes breathe {
    to {
      box-shadow: 0 0 20px rgba(241, 217, 155, 0.65);
    }
  }
  /* Held still with the effects off or reduced motion asked for: lit, not breathing. */
  :global(html[data-still]) .seal.on {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .seal.on {
      animation: none;
    }
  }
  .hush {
    visibility: hidden;
  }
  /* No key: the seal's ring alone, faint. */
  .seal.empty:not(.on) {
    border-style: dashed;
    border-color: rgba(125, 99, 51, 0.6);
  }
  .note {
    min-height: 1.4em;
    margin: 0.2rem 0 0;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }

  @media (max-width: 760px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 420px) {
    .slide input {
      width: 140px;
    }
  }
  /* Desktop: the lobby's stage, straight on the backdrop, the columns in the middle of the window's height. */
  @media (min-width: 1100px) {
    .settings:not(.over) {
      width: 100%;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: clamp(10px, 2.4vh, 40px) max(32px, 50% - 600px);
    }
    .cols:not(.one, .over) {
      grid-template-columns: 440px 600px;
      justify-content: space-between;
      gap: 0;
    }
  }
</style>
