<script lang="ts">
  // One question to try on the start page, dealt
  // by the real engine and drawn as the game draws it: the unidentified item's
  // tooltip (name plate, rune circle, art), four answers, the verdict chip.
  // Practice only: nothing is recorded in the codex.
  import { onMount } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import { createGame, DEFAULT_SETTINGS, isFake, questionTopic, type Question } from '../lib/game';
  import { itemImage } from '../lib/ui';
  import { sfx } from '../lib/sound';
  import { reveal } from '../lib/fx/moments';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import ArtImage from './ArtImage.svelte';
  import NamePlate from './NamePlate.svelte';

  let { onplay }: { onplay?: () => void } = $props();

  // The game's Normal answers, without its veils and greyscale: four names of
  // one kind, half of them look-alikes, one made up.
  const KNOBS = { options: 4, similarNames: 0.5, fakes: 1, artChance: 0, veil: 'off', grayscale: 'off', mirror: 0, lockout: 0 } as const;
  const game = createGame(null, { ...DEFAULT_SETTINGS, difficulty: 'custom', custom: { ...KNOBS } });
  // Gems are square tiles on cloth: keep to the items.
  const CATEGORIES = engine.categories.filter((c) => engine.byCategory.get(c)?.[0]?.kind !== 'gem');

  let q = $state<Question | null>(null);
  let picked = $state<number | null>(null);
  let streak = $state(0);
  let lastCat = '';
  let optEls: HTMLButtonElement[] = $state([]);
  let artEl: HTMLElement | null = $state(null);
  let verdictEl: HTMLElement | null = $state(null);
  let nextEl: HTMLButtonElement | null = $state(null);

  function deal() {
    const pool = CATEGORIES.filter((c) => c !== lastCat);
    const cat = pool[Math.floor(Math.random() * pool.length)];
    lastCat = cat;
    picked = null;
    q = engine.makeQuestion(game, cat);
  }

  const answered = $derived(picked !== null);
  const rightIdx = $derived(q ? q.options.indexOf(q.itemId) : -1);
  const right = $derived(answered && picked === rightIdx);
  const pickedFake = $derived(answered && !right && q !== null && picked !== null && isFake(q.options[picked]));
  const item = $derived(q ? engine.byId.get(q.itemId) : undefined);

  function pick(i: number) {
    if (!q || answered) return;
    picked = i;
    const good = i === rightIdx;
    streak = good ? streak + 1 : 0;
    sfx(good ? 'correct' : 'wrong');
    // After the chip has rendered, so the light can find it.
    requestAnimationFrame(() => {
      reveal({ answer: optEls[rightIdx], chosen: good ? null : optEls[i], art: artEl, verdict: verdictEl, verdictTone: good ? 'good' : 'bad', good, streak: Math.max(1, streak) });
      nextEl?.focus({ preventScroll: true });
    });
  }

  function keys(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const n = Number(e.key);
    if (!answered && n >= 1 && n <= 4) pick(n - 1);
  }

  /** The real answers' glow follows the mouse. */
  function glare(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${(e.clientX - r.left).toFixed(0)}px`);
    el.style.setProperty('--gy', `${(e.clientY - r.top).toFixed(0)}px`);
  }

  onMount(deal);
</script>

<svelte:window onkeydown={keys} />

<section class="try" aria-labelledby="try-h">
  <h2 id="try-h" class="cap"><i aria-hidden="true"></i><span>Try one</span><i aria-hidden="true"></i></h2>

  <div class="tooltip" class:good={answered && right} class:bad={answered && !right}>
    <div class="head">
      <NamePlate lit={answered} />
      {#if answered && item}
        <div class="head-text" in:fly={{ y: 10, duration: 450 }}>
          <span class="iname">{item.name}</span>
          <span class="ibase">{item.base}</span>
        </div>
      {:else}
        <div class="head-text">
          <span class="iname unknown">Unidentified</span>
          <span class="ibase">{q ? questionTopic(q, true) : ' '}</span>
        </div>
      {/if}
    </div>
    <div class="art" bind:this={artEl}>
      <ArcaneCircle state={!answered ? 'idle' : right ? 'good' : 'bad'} />
      <div class="frame">
        {#if q}
          {#key q.itemId}
            <ArtImage src={itemImage(q.itemId)} alt="The item to name" float />
          {/key}
        {/if}
      </div>
    </div>
  </div>

  <div class="options" role="group" aria-label="Which one is it?">
    {#if q}
      {#each q.labels as label, i (q.itemId + i)}
        {@const st = !answered ? '' : i === rightIdx ? 'right' : i === picked ? 'wrong' : 'dim'}
        <button
          class="option {st}"
          class:fake={answered && isFake(q.options[i])}
          bind:this={optEls[i]}
          data-sfx="none"
          disabled={answered}
          title={answered && isFake(q.options[i]) ? 'Not a real item' : undefined}
          onclick={() => pick(i)}
          onpointermove={glare}
          in:fly={{ x: 30, duration: 420, delay: 120 + i * 70 }}
        >
          <span class="sheen"></span>
          <span class="key" aria-hidden="true">{i + 1}</span>
          <span class="text">{label}</span>
          <span class="cue" aria-hidden="true"></span>
          {#if st === 'right'}<span class="mark" in:scale={{ duration: 300 }}>✓</span>{/if}
          {#if st === 'wrong'}<span class="mark" in:scale={{ duration: 300 }}>✕</span>{/if}
        </button>
      {/each}
    {/if}
  </div>

  <div class="after" aria-live="polite">
    {#if !answered}
      <p class="hint">One of {engine.items.length}. Some names are look-alikes, and one is made up.</p>
    {:else}
      <div class="result">
        <div class="verdict {right ? 'good' : 'bad'}" bind:this={verdictEl}>
          <span class="glyph" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              {#if right}
                <path pathLength="1" d="M5.6 10.4l3 3 5.8-6.6" />
              {:else}
                <path pathLength="1" d="M6.6 6.6l6.8 6.8" />
                <path pathLength="1" d="M13.4 6.6l-6.8 6.8" />
              {/if}
            </svg>
          </span>
          <span class="word">{right ? 'Correct' : 'Wrong'}</span>
        </div>
        <span class="say" in:fade={{ duration: 300, delay: 250 }}>
          {#if pickedFake}That name was made up.{:else if !right}Close, but no.{:else if streak >= 2}<span class="streak">{streak} in a row</span>{:else}Well named.{/if}
        </span>
        <button class="btn small" bind:this={nextEl} onclick={deal} in:fade={{ duration: 300, delay: 350 }}>Next item</button>
      </div>
      {#if streak >= 3 && onplay}
        <button class="dare" onclick={onplay} in:fly={{ y: 8, duration: 400, delay: 600 }}>You know your uniques. Prove it in a room.</button>
      {/if}
    {/if}
  </div>
</section>

<style>
  .try { width: 100%; display: flex; flex-direction: column; align-items: stretch; }

  /* "Try one" between two engraved hairlines, a diamond at each inner end. */
  .cap {
    display: flex; align-items: center; gap: 0.75rem; margin: 0 0 0.9rem;
    font-family: var(--font-display); font-weight: 400; font-size: 1.15rem; letter-spacing: 0.02em; color: var(--gold);
  }
  .cap i { flex: 1; height: 1px; position: relative; }
  .cap i:first-child { background: linear-gradient(90deg, rgba(201, 164, 92, 0), rgba(201, 164, 92, 0.6)); }
  .cap i:last-child { background: linear-gradient(90deg, rgba(201, 164, 92, 0.6), rgba(201, 164, 92, 0)); }
  .cap i::after { content: ''; position: absolute; top: -2.5px; width: 5px; height: 5px; rotate: 45deg; background: var(--gold); box-shadow: 0 0 6px rgba(224, 138, 68, 0.7); }
  .cap i:first-child::after { right: -2px; }
  .cap i:last-child::after { left: -2px; }

  /* ---- the item's tooltip, as in the game ---- */
  .tooltip {
    display: flex; flex-direction: column;
    border: 1px solid #5a3a1c;
    background: rgba(5, 4, 3, 0.92);
    box-shadow: 0 0 0 1px #000, 0 20px 60px rgba(0, 0, 0, 0.7);
    transition: border-color 0.6s, box-shadow 0.6s;
  }
  .tooltip.good { border-color: #4f7a45; box-shadow: 0 0 0 1px #000, 0 0 50px rgba(150, 190, 110, 0.12), 0 20px 60px rgba(0, 0, 0, 0.7); }
  .tooltip.bad { border-color: #7a3a2c; box-shadow: 0 0 0 1px #000, 0 0 50px rgba(200, 90, 60, 0.09), 0 20px 60px rgba(0, 0, 0, 0.7); }
  .head { position: relative; flex: none; display: grid; height: 64px; place-items: center; padding: 0 3.6rem; }
  .head-text { position: relative; grid-area: 1 / 1; display: flex; flex-direction: column; align-items: center; line-height: 1.15; text-align: center; }
  .iname { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; color: var(--unique-hi); text-shadow: 0 0 12px rgba(224, 138, 68, 0.4); }
  .iname.unknown { color: #c8c8c8; letter-spacing: 0.1em; font-size: 1.05rem; text-shadow: none; }
  .ibase { font-family: var(--font-display); font-size: 0.85rem; color: #d8a26a; opacity: 0.85; }
  .art {
    position: relative; display: grid; place-items: center; height: clamp(250px, 34vh, 320px); container-type: size; overflow: hidden;
    --glow: rgba(175, 96, 37, 0.16);
    background:
      radial-gradient(ellipse 55% 50% at 50% 52%, var(--glow), transparent 70%),
      radial-gradient(ellipse 80% 45% at 50% 0%, rgba(90, 110, 160, 0.1), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
    box-shadow: inset 0 1px 0 rgba(201, 164, 92, 0.12), inset 0 0 40px rgba(0, 0, 0, 0.6);
  }
  .tooltip.good .art { --glow: rgba(150, 185, 105, 0.13); }
  .tooltip.bad .art { --glow: rgba(200, 90, 60, 0.08); }
  .frame { position: absolute; inset: 0; margin: auto; width: 84%; height: 82%; display: grid; place-items: center; }
  .frame > :global(.art-slot) { position: absolute; inset: 0; }

  /* ---- the answers, as in the game ---- */
  .options { margin-top: 0.9rem; display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 0.6rem; }
  .option {
    position: relative; isolation: isolate; display: flex; align-items: center; gap: 0.8rem; width: 100%;
    padding: 0.8rem 2.4rem 0.8rem 0.9rem; text-align: left; cursor: pointer;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line); border-radius: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.05), 0 8px 22px rgba(0, 0, 0, 0.45);
    transition: transform 0.25s var(--ease-out), border-color 0.3s, opacity 0.4s, background 0.3s, box-shadow 0.3s;
  }
  .sheen { position: absolute; z-index: -1; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
  .sheen::before {
    content: ''; position: absolute; top: 0; bottom: 0; left: -40%; width: 30%; transform: skewX(-18deg); opacity: 0;
    background: linear-gradient(100deg, transparent, rgba(255, 236, 196, 0.07) 40%, rgba(255, 246, 225, 0.16) 50%, rgba(255, 236, 196, 0.07) 60%, transparent);
  }
  .sheen::after {
    content: ''; position: absolute; inset: 0; opacity: 0; transition: opacity 0.35s;
    background:
      radial-gradient(circle 160px at var(--gx, 30%) var(--gy, 50%), rgba(255, 214, 150, 0.12), transparent 70%),
      radial-gradient(ellipse 50% 80% at 50% 135%, rgba(255, 140, 50, 0.28), transparent 70%);
  }
  .option::after {
    content: ''; position: absolute; top: -1px; left: 6%; right: 6%; height: 1px; pointer-events: none;
    background: linear-gradient(90deg, transparent, #fff1cf, transparent); filter: drop-shadow(0 0 3px rgba(255, 180, 90, 0.9));
    opacity: 0; scale: 0.4 1; transition: opacity 0.3s, scale 0.5s var(--ease-out);
  }
  .option:not(:disabled):is(:hover, :focus-visible) {
    border-color: var(--gold);
    background: linear-gradient(90deg, rgba(70, 48, 25, 0.96), rgba(29, 22, 14, 0.95));
    box-shadow: inset 0 0 0 1px rgba(241, 217, 155, 0.1), 0 0 26px rgba(224, 138, 68, 0.2);
  }
  .option:not(:disabled):hover .sheen::before { animation: sweep 0.8s var(--ease-out); }
  .option:not(:disabled):is(:hover, :focus-visible)::after { opacity: 1; }
  .option:not(:disabled):is(:hover, :focus-visible) .sheen::after { opacity: 1; }
  .option:not(:disabled):is(:hover, :focus-visible)::after { scale: 1 1; }
  .option:not(:disabled):is(:hover, :focus-visible) .key { color: #fff4d8; border-color: var(--gold-hi); box-shadow: 0 0 12px rgba(241, 217, 155, 0.4); }
  .option:not(:disabled):is(:hover, :focus-visible) .key::before { opacity: 1; }
  .option:not(:disabled):is(:hover, :focus-visible) .text { color: #fff1dc; text-shadow: 0 0 14px rgba(241, 217, 155, 0.35); }
  .option:not(:disabled):is(:hover, :focus-visible) .cue { opacity: 1; translate: 0 -50%; }
  .option:not(:disabled):active { transform: scale(0.985); }
  .option:disabled { cursor: default; color: inherit; }
  @keyframes sweep { from { translate: 0 0; opacity: 1; } to { translate: 560% 0; opacity: 1; } }

  .key {
    position: relative; isolation: isolate; flex: none; width: 28px; height: 28px; padding-top: 2px; display: grid; place-items: center;
    font-family: var(--font-display); font-weight: 700; font-size: 0.8rem; color: var(--gold);
    border: 1px solid var(--gold-lo); border-radius: 50%; background: rgba(0, 0, 0, 0.4);
    transition: color 0.25s, border-color 0.25s, box-shadow 0.25s;
  }
  .key::before {
    content: ''; position: absolute; z-index: -1; inset: 0; border-radius: 50%; opacity: 0; transition: opacity 0.3s;
    background: radial-gradient(circle at 50% 30%, rgba(196, 128, 50, 0.6), rgba(60, 36, 12, 0.5) 75%);
  }
  .cue {
    position: absolute; top: 50%; right: 1rem; width: 6px; height: 6px; translate: 6px -50%; rotate: 45deg; pointer-events: none;
    background: linear-gradient(135deg, #fff1cf, var(--gold) 55%, var(--gold-lo)); box-shadow: 0 0 8px rgba(255, 180, 90, 0.7);
    opacity: 0; transition: opacity 0.3s, translate 0.4s var(--ease-out);
  }
  .text { flex: 1; font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; line-height: 1.15; color: #e9c8a2; letter-spacing: 0.02em; transition: color 0.25s, text-shadow 0.25s; }
  .mark { position: absolute; top: 50%; right: 0.85rem; translate: 0 -50%; line-height: 1; font-size: 1.3rem; font-weight: 700; }
  .option.right { border-color: #5d8a50; background: linear-gradient(90deg, rgba(44, 64, 36, 0.9), rgba(22, 28, 17, 0.92)); box-shadow: inset 0 1px 0 rgba(220, 240, 190, 0.1), 0 0 16px rgba(150, 190, 110, 0.12); }
  .option.right :is(.text, .mark) { color: #d6e8c0; }
  .option.right .key { border-color: #7ea56c; color: #a9cf8f; }
  .option.wrong { border-color: #8e4434; background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92)); box-shadow: 0 0 14px rgba(200, 90, 60, 0.1); animation: shake 0.5s; }
  .option.wrong :is(.text, .mark) { color: #eab3a3; }
  .option.fake .text { text-decoration: line-through; text-decoration-thickness: 1px; }
  .option.dim { opacity: 0.35; filter: saturate(0.5); }
  @keyframes shake { 20%, 60% { translate: -5px 0; } 40%, 80% { translate: 5px 0; } }

  /* ---- after the answer ---- */
  .after { min-height: 6.2rem; margin-top: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.7rem; text-align: center; }
  .hint { margin: 0.3rem 0 0; font-style: italic; color: var(--muted); }
  .result { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.6rem 1rem; }
  .say { font-style: italic; color: #cbbfa8; }
  .streak { font-style: normal; font-family: var(--font-display); color: var(--unique-hi); text-shadow: 0 0 12px rgba(224, 138, 68, 0.4); }
  .dare {
    min-height: 40px; padding: 0; background: none; border: 0; cursor: pointer;
    font-family: var(--font-body); font-style: italic; font-size: 1.05rem; color: var(--gold);
    text-decoration: underline; text-decoration-color: var(--gold-lo); text-underline-offset: 4px;
  }
  .dare:hover { color: var(--gold-hi); text-decoration-color: var(--gold); }

  /* The verdict chip, as in the game. */
  .verdict {
    --v-icon: #c2e3a6; --v-tint: 150, 200, 105;
    position: relative; flex: none; display: flex; align-items: center; gap: 0.55em;
    padding: 0.4em calc(1.1em - 0.16em) 0.4em 0.4em;
    font-family: var(--font-display); font-weight: 700; font-size: 0.8rem; line-height: 1.45; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap;
    color: var(--gold-hi);
    background:
      linear-gradient(100deg, transparent 42%, rgba(255, 244, 220, 0.14) 50%, transparent 58%) 100% 0 / 300% 100% no-repeat,
      radial-gradient(ellipse 3.2em 130% at 1.1em 50%, rgba(var(--v-tint), 0.2), transparent),
      rgba(0, 0, 0, 0.4);
    border: 1px solid var(--gold-lo); border-radius: 999px;
    animation: verdict-in 0.55s var(--ease-out) both, verdict-sheen 0.9s ease-in-out 0.45s;
  }
  .verdict.bad { --v-icon: #f0a68c; --v-tint: 220, 110, 80; }
  .verdict::after { content: ''; position: absolute; inset: -1px; border: 1px solid var(--gold); border-radius: inherit; opacity: 0; animation: verdict-ripple 0.7s var(--ease-out) 0.25s; }
  .glyph {
    flex: none; display: grid; place-items: center; width: 1.45em; height: 1.45em; color: var(--v-icon);
    border: 1px solid rgba(var(--v-tint), 0.75); border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, rgba(var(--v-tint), 0.45), rgba(var(--v-tint), 0.12) 70%), rgba(0, 0, 0, 0.5);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 8px rgba(var(--v-tint), 0.45);
    animation: verdict-flare 0.9s var(--ease-out) 0.2s backwards;
  }
  .glyph svg { width: 1.05em; height: 1.05em; overflow: visible; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 2px rgba(var(--v-tint), 0.8)); }
  .glyph path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: verdict-draw 0.35s var(--ease-out) 0.22s forwards; }
  .glyph svg > :nth-child(2) { animation-delay: 0.4s; }
  .word { animation: verdict-word 0.5s var(--ease-out) 0.2s backwards; }
  @keyframes verdict-in { from { opacity: 0; scale: 0.9; filter: blur(3px); } }
  @keyframes verdict-sheen { to { background-position: 0 0, 0 0; } }
  @keyframes verdict-flare { from { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 18px 3px rgba(var(--v-tint), 0.8); } }
  @keyframes verdict-ripple { from { opacity: 0.5; } to { inset: -8px; opacity: 0; } }
  @keyframes verdict-draw { to { stroke-dashoffset: 0; } }
  @keyframes verdict-word { from { opacity: 0; translate: -4px 0; } }

  @media (max-width: 560px) {
    .options { grid-template-columns: 1fr; }
    .art { height: 240px; }
  }
</style>
