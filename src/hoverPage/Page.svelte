<script lang="ts">
  // The hover tuning page (hover.html): rows of controls shaped as the
  // game's (its header's small buttons, the cards, the answers, a menu, a
  // grid of chips) to sweep the mouse across, their hovers played as the
  // game plays them (lib/spatial.svelte.ts), with the settings for how a
  // hover quietens over a sweep beside them: as live (a step each), eased
  // (by how busy hovering is), or not at all (1, 2 and 3 switch between
  // them); by the pointer's speed as it came over the control; and in takes
  // made from its own recordings, none twice running. Each hover's ducking
  // shows in the strip below the settings.
  import { untrack } from 'svelte';
  import { hoverHeard, spatial, CHOSEN } from '../lib/spatial.svelte';
  import { readStored, writeStored } from '../lib/storage';

  type Mode = typeof spatial.hoverRepeat;
  const MODES: { id: Mode; label: string; hint: string }[] = [
    { id: 'off', label: 'Off', hint: 'Every hover at the same level.' },
    { id: 'steps', label: 'Steps (live)', hint: 'Each hover within half a second of the last 2 dB quieter, down to −8 dB; back to full after a pause.' },
    { id: 'eased', label: 'Eased', hint: 'Ducked by how busy hovering is: deeper the faster a sweep goes, easing back as it slows; duller as well as quieter.' },
  ];
  const KEYS = [
    'hoverDb',
    'hoverDry',
    'hoverRepeat',
    'hoverDepth',
    'hoverSoften',
    'hoverRecover',
    'hoverWeight',
    'hoverSpeed',
    'hoverSlow',
    'hoverFast',
    'hoverSpeedDb',
    'hoverSpeedSoften',
    'hoverShorter',
    'hoverTakes',
    'hoverVariety',
  ] as const;

  // The settings as tuned last time on this page.
  try {
    const kept = JSON.parse(readStored('hoverTuning') ?? '{}') as Partial<typeof spatial>;
    for (const k of KEYS) if (typeof kept[k] === typeof CHOSEN[k]) (spatial as Record<string, unknown>)[k] = kept[k];
  } catch {
    // None kept, or unreadable: the game's.
  }
  $effect(() => {
    writeStored('hoverTuning', JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, spatial[k]]))));
  });
  function reset() {
    for (const k of KEYS) (spatial as Record<string, unknown>)[k] = CHOSEN[k];
  }

  const mode = $derived(MODES.find((m) => m.id === spatial.hoverRepeat)!);

  /** The last hovers' ducking (dB), newest last. */
  let strip = $state<{ n: number; db: number; soften: number; speed: number; take: number }[]>([]);
  $effect(() => {
    const n = hoverHeard.n;
    if (!n) return;
    const h = { n, db: hoverHeard.db, soften: hoverHeard.soften, speed: hoverHeard.speed, take: hoverHeard.take };
    // Added to, not read from: only a new hover runs this again.
    untrack(() => (strip = [...strip.slice(-39), h]));
  });

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const m = MODES[Number(e.key) - 1];
    if (m) spatial.hoverRepeat = m.id;
  }

  /** Svelte action: the mouse over the panel never reaches lib/sound.ts's hover sound. */
  function quiet(node: HTMLElement) {
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('pointerover', stop);
    return { destroy: () => node.removeEventListener('pointerover', stop) };
  }

  const HEADER = ['Codex', 'Sound', 'Fullscreen', 'Help', 'Leave'];
  const CARDS = ['Helmets', 'Off-Hands', 'Two-Handed Weapons'];
  const ANSWERS = ["Alpha's Howl", "Valako's Roar", 'The Empty Roar', "Hrimnor's Dirge"];
  const MENU = ['Create a room', 'Join a room', 'Play hot-seat', 'Delve', "Today's unique", 'Codex', 'Settings', 'Credits'];
  const CHIPS = Array.from({ length: 16 }, (_, i) => `Depth ${10 * i + 1}`);
</script>

<svelte:window onkeydown={onKey} />

<div class="page">
  <!-- #app: the screen sounds are placed across (lib/spatial.svelte.ts). -->
  <main id="app">
    <p class="hint">Click once for sound, then sweep the mouse across the controls: quickly, slowly, stopping halfway.</p>
    <div class="header">
      {#each HEADER as h (h)}<button class="small">{h}</button>{/each}
    </div>
    <div class="cards">
      {#each CARDS as c (c)}<button class="card">{c}</button>{/each}
    </div>
    <div class="answers">
      {#each ANSWERS as a (a)}<button class="answer">{a}</button>{/each}
    </div>
    <div class="lower">
      <div class="menu">
        {#each MENU as m (m)}<button class="entry">{m}</button>{/each}
      </div>
      <div class="chips">
        {#each CHIPS as c (c)}<button class="chip">{c}</button>{/each}
      </div>
    </div>
  </main>

  <!-- Its own buttons make no sound, and its hovers count toward no sweep. -->
  <aside class="panel" data-sfx="none" use:quiet>
    <h1>Hover repeats</h1>
    <div class="seg" role="group" aria-label="Repeats">
      {#each MODES as m, i (m.id)}
        <button class:on={spatial.hoverRepeat === m.id} onclick={() => (spatial.hoverRepeat = m.id)}>{m.label} <kbd>{i + 1}</kbd></button>
      {/each}
    </div>
    <p class="hint">{mode.hint}</p>

    <div class="line" class:dim={spatial.hoverRepeat !== 'eased'}>
      <span class="lbl">Depth</span>
      <input type="range" min="-10" max="0" step="0.5" bind:value={spatial.hoverDepth} style:--fill="{((spatial.hoverDepth + 10) / 10) * 100}%" aria-label="Depth" />
      <i class="num">{spatial.hoverDepth.toFixed(1)} dB</i>
    </div>
    <div class="line" class:dim={spatial.hoverRepeat !== 'eased'}>
      <span class="lbl">Duller</span>
      <input type="range" min="-8" max="0" step="0.5" bind:value={spatial.hoverSoften} style:--fill="{((spatial.hoverSoften + 8) / 8) * 100}%" aria-label="Duller" />
      <i class="num">{spatial.hoverSoften.toFixed(1)} dB</i>
    </div>
    <div class="line" class:dim={spatial.hoverRepeat !== 'eased'}>
      <span class="lbl">Recovery</span>
      <input type="range" min="0.1" max="1.5" step="0.05" bind:value={spatial.hoverRecover} style:--fill="{((spatial.hoverRecover - 0.1) / 1.4) * 100}%" aria-label="Recovery" />
      <i class="num">{spatial.hoverRecover.toFixed(2)} s</i>
    </div>
    <div class="line" class:dim={spatial.hoverRepeat !== 'eased'}>
      <span class="lbl">Speed</span>
      <input type="range" min="0.1" max="1.5" step="0.05" bind:value={spatial.hoverWeight} style:--fill="{((spatial.hoverWeight - 0.1) / 1.4) * 100}%" aria-label="Speed" />
      <i class="num">{spatial.hoverWeight.toFixed(2)}</i>
    </div>
    <p class="hint">
      Depth: how far down a fast sweep goes. Duller: how much of its highs (above 4 kHz) go with it. Recovery: how long the busyness takes to halve once the pointer
      slows. Speed: how quickly busyness turns into ducking (higher: even calm browsing ducks).
    </p>

    <h2>By pointer speed</h2>
    <label class="check"><input type="checkbox" bind:checked={spatial.hoverSpeed} /> A quick flick barely brushes a control</label>
    <div class="line" class:dim={!spatial.hoverSpeed}>
      <span class="lbl">Slow</span>
      <input type="range" min="0.1" max="2" step="0.05" bind:value={spatial.hoverSlow} style:--fill="{((spatial.hoverSlow - 0.1) / 1.9) * 100}%" aria-label="Slow" />
      <i class="num">{spatial.hoverSlow.toFixed(2)}</i>
    </div>
    <div class="line" class:dim={!spatial.hoverSpeed}>
      <span class="lbl">Fast</span>
      <input type="range" min="0.5" max="6" step="0.1" bind:value={spatial.hoverFast} style:--fill="{((spatial.hoverFast - 0.5) / 5.5) * 100}%" aria-label="Fast" />
      <i class="num">{spatial.hoverFast.toFixed(1)}</i>
    </div>
    <div class="line" class:dim={!spatial.hoverSpeed}>
      <span class="lbl">Quieter</span>
      <input type="range" min="-10" max="0" step="0.5" bind:value={spatial.hoverSpeedDb} style:--fill="{((spatial.hoverSpeedDb + 10) / 10) * 100}%" aria-label="Quieter when fast" />
      <i class="num">{spatial.hoverSpeedDb.toFixed(1)} dB</i>
    </div>
    <div class="line" class:dim={!spatial.hoverSpeed}>
      <span class="lbl">Duller</span>
      <input type="range" min="-10" max="0" step="0.5" bind:value={spatial.hoverSpeedSoften} style:--fill="{((spatial.hoverSpeedSoften + 10) / 10) * 100}%" aria-label="Duller when fast" />
      <i class="num">{spatial.hoverSpeedSoften.toFixed(1)} dB</i>
    </div>
    <div class="line" class:dim={!spatial.hoverSpeed}>
      <span class="lbl">Shorter</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={spatial.hoverShorter} style:--fill="{spatial.hoverShorter * 100}%" aria-label="Shorter when fast" />
      <i class="num">{Math.round(spatial.hoverShorter * 100)}%</i>
    </div>
    <p class="hint">
      Speeds in screen widths a second: at Slow or below the hover sounds in full, at Fast or above it is all of Quieter, Duller and Shorter, eased between. Last
      hover came at <b>{(strip.at(-1)?.speed ?? 0).toFixed(2)}</b>.
    </p>

    <h2>Takes</h2>
    <div class="line">
      <span class="lbl">Takes</span>
      <input type="range" min="0" max="8" step="1" bind:value={spatial.hoverTakes} style:--fill="{(spatial.hoverTakes / 8) * 100}%" aria-label="Takes" />
      <i class="num">{spatial.hoverTakes < 2 ? 'off' : spatial.hoverTakes}</i>
    </div>
    <div class="line" class:dim={spatial.hoverTakes < 2}>
      <span class="lbl">Variety</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={spatial.hoverVariety} style:--fill="{spatial.hoverVariety * 100}%" aria-label="Variety" />
      <i class="num">{Math.round(spatial.hoverVariety * 100)}%</i>
    </div>
    <p class="hint">
      Made from the hover's own two recordings: each take a little different in each layer's balance, timing, pitch, attack and tone, played in turn, none twice
      running. Last: take <b>{(strip.at(-1)?.take ?? -1) < 0 ? 'none' : strip.at(-1)!.take + 1}</b>.
    </p>

    <h2>The hover itself</h2>
    <div class="line">
      <span class="lbl">Level</span>
      <input type="range" min="-8" max="0" step="0.5" bind:value={spatial.hoverDb} style:--fill="{((spatial.hoverDb + 8) / 8) * 100}%" aria-label="Hover level" />
      <i class="num">{spatial.hoverDb.toFixed(1)} dB</i>
    </div>
    <label class="check"><input type="checkbox" bind:checked={spatial.hoverDry} /> Dry and close</label>

    <h2>Each hover, ducked by</h2>
    <div class="strip" aria-label="The last hovers' ducking">
      {#each strip as h (h.n)}
        <span class="bar" style:height="{(-h.db / 10) * 100}%" style:opacity={0.45 + 0.55 * Math.min(1, -h.soften / 8)} title="{h.db.toFixed(1)} dB, highs {h.soften.toFixed(1)} dB"></span>
      {/each}
    </div>
    <p class="hint">
      Taller: quieter (to −10 dB at the top); brighter: duller too. Last: <b>{(strip.at(-1)?.db ?? 0).toFixed(1)} dB</b>, highs <b>{(strip.at(-1)?.soften ?? 0).toFixed(1)} dB</b>.
    </p>
    <button class="reset" onclick={reset}>Back to the game’s</button>
  </aside>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: 1fr 340px;
    min-height: 100dvh;
  }
  #app {
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 1.6rem;
    padding: 1.2rem 1.6rem 3rem;
  }
  button {
    font: inherit;
    color: var(--text);
    background: rgba(28, 21, 14, 0.9);
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .header {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  .small {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    font-family: var(--font-cinzel);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 220px));
    justify-content: center;
    gap: 1.4rem;
  }
  .card {
    height: 240px;
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--gold-hi);
    border: 2px solid var(--gold-lo);
    border-radius: 10px;
  }
  .answers {
    display: grid;
    gap: 0.6rem;
    max-width: 620px;
    width: 100%;
    justify-self: center;
  }
  .answer {
    padding: 0.9rem 1.2rem;
    text-align: left;
    font-family: var(--font-body);
    font-size: 1.1rem;
  }
  .lower {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 1.6rem;
  }
  .menu {
    display: grid;
    gap: 0.3rem;
  }
  .entry {
    padding: 0.45rem 0.8rem;
    text-align: left;
    font-family: var(--font-display);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-content: start;
    gap: 0.4rem;
  }
  .chip {
    padding: 0.3rem 0.6rem;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
  }

  .panel {
    position: sticky;
    top: 0;
    align-self: start;
    max-height: 100dvh;
    overflow-y: auto;
    padding: 1rem 1rem 2rem;
    border-left: 1px solid var(--gold-lo);
    background: rgba(12, 10, 8, 0.94);
    font-family: var(--font-body);
    font-size: 15px;
  }
  h1,
  h2 {
    margin: 0 0 0.6rem;
    font-family: var(--font-cinzel);
    font-weight: normal;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-size: 0.85rem;
    color: var(--gold-hi);
  }
  h2 {
    margin-top: 1.2rem;
  }
  .hint {
    margin: 0.4rem 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  .hint b {
    font-style: normal;
    color: var(--gold-hi);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button {
    border: 0;
    border-right: 1px solid var(--line);
    border-radius: 0;
    padding: 0.25rem 0.6rem;
    background: rgba(0, 0, 0, 0.3);
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button.on {
    background: rgba(201, 164, 92, 0.25);
    color: var(--gold-hi);
  }
  kbd {
    font-size: 0.7rem;
    color: var(--muted);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
    transition: opacity 0.2s;
  }
  .line.dim {
    opacity: 0.4;
  }
  .lbl {
    min-width: 5em;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .num {
    min-width: 4.5em;
    font-family: var(--font-cinzel);
    font-style: normal;
    color: var(--gold-hi);
  }
  input[type='range'] {
    flex: 1;
    min-width: 0;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--gold) var(--fill), var(--line) var(--fill));
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--gold-hi);
  }
  input[type='range']::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 50%;
    background: var(--gold-hi);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--gold);
  }
  .strip {
    display: flex;
    align-items: flex-start;
    gap: 2px;
    height: 70px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
  }
  .bar {
    flex: 0 0 5px;
    min-height: 2px;
    background: var(--gold-hi);
    border-radius: 1px;
  }
  .reset {
    margin-top: 1rem;
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
  }
  @media (max-width: 800px) {
    .page {
      grid-template-columns: 1fr;
    }
    .panel {
      position: static;
      border-left: 0;
      border-top: 1px solid var(--gold-lo);
    }
  }
</style>
