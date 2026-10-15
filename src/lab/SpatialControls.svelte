<script lang="ts">
  // The spatial sound's controls (lib/spatial.svelte.ts, tuned through
  // ./spatial.svelte.ts), in the lab's panel
  // and on the spatial sound page (src/spatialPage): today's sound or the
  // placed one (A flips them), the ladder's presets, how sounds are placed and
  // how wide, the rooms, and a half circle drawing where each sound is
  // heard from.
  import { PRESETS, WIDTHS, blips, heard, presetOf, spatial, type HeardBlip, type Renderer } from './spatial.svelte';

  const preset = $derived(presetOf(spatial));
  const RENDERERS: { id: Renderer; label: string }[] = [
    { id: 'pan', label: 'Panning' },
    { id: 'haas', label: 'Haas' },
    { id: 'head', label: 'Head model' },
    { id: 'hrtf', label: 'HRTF' },
  ];
  const deg = (w: number) => Math.round(w * 90);
  /** The angle the screen's edges are heard at. */
  const edge = $derived((spatial.today ? 0 : spatial.width) * (Math.PI / 2));

  /** The audio clock, each frame, to draw what plays. */
  let clock = $state(0);
  $effect(() => {
    let raf = 0;
    const step = () => {
      clock = heard.now();
      if (blips.list.some((b) => clock > b.begin + b.seconds)) blips.list = blips.list.filter((b) => clock <= b.begin + b.seconds);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
  /** Where a sound sits on the half circle: its angle, nearer the rim the farther off. */
  function spot(b: HeardBlip) {
    const t = Math.max(0, clock - b.begin);
    const theta = Math.max(-1, Math.min(1, b.az(t))) * (Math.PI / 2);
    const r = 52 + 34 * b.far;
    return { x: 100 + r * Math.sin(theta), y: 100 - r * Math.cos(theta), o: clock < b.begin ? 0 : Math.max(0, 1 - t / b.seconds) };
  }

  /** A flips between the game's sound today and the placed one (not while typing). */
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'a' && e.key !== 'A') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    spatial.today = !spatial.today;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="line">
  <button class="small ab" class:on={!spatial.today} onclick={() => (spatial.today = !spatial.today)}>{spatial.today ? 'Today: all centred' : 'Placed'}</button>
  <span class="hint">A flips between them</span>
</div>
<div class="seg" role="group" aria-label="Preset">
  {#each PRESETS as p (p.name)}
    <button class:on={preset === p} onclick={() => Object.assign(spatial, p.set)}>{p.name}</button>
  {/each}
</div>
<p class="hint">{preset?.hint ?? 'Your own mix of the settings below.'}</p>
<div class="spatial" class:dim={spatial.today}>
  <div class="line">
    <div class="seg" role="group" aria-label="Placing">
      {#each RENDERERS as r (r.id)}
        <button class:on={spatial.renderer === r.id} onclick={() => (spatial.renderer = r.id)}>{r.label}</button>
      {/each}
    </div>
  </div>
  <div class="line">
    <span class="lbl">Width</span>
    <input type="range" min="0" max="1" step="0.01" bind:value={spatial.width} aria-label="Width" style:--fill="{spatial.width * 100}%" />
    <i class="num">±{deg(spatial.width)}°</i>
  </div>
  <div class="line">
    <span class="lbl"></span>
    <div class="seg" role="group" aria-label="Width">
      {#each WIDTHS as w (w)}
        <button class:on={Math.abs(spatial.width - w) < 0.005} onclick={() => (spatial.width = w)}>±{deg(w)}°</button>
      {/each}
    </div>
  </div>
  <div class="line">
    <span class="lbl">Teammates</span>
    <input type="range" min="0" max="1" step="0.05" bind:value={spatial.far} aria-label="How far off teammates are" style:--fill="{spatial.far * 100}%" />
    <i class="num">{Math.round(spatial.far * 100)}% off</i>
  </div>
  <div class="toggles">
    <label><input type="checkbox" bind:checked={spatial.moving} /> Moving</label>
    <label><input type="checkbox" bind:checked={spatial.size} /> Size (blast, cave-in)</label>
    <label><input type="checkbox" bind:checked={spatial.wideBeds} /> Wide ambience</label>
    <label><input type="checkbox" bind:checked={spatial.rooms} /> Rooms</label>
    <label><input type="checkbox" bind:checked={spatial.sideReverb} /> Side reverb</label>
    <label><input type="checkbox" bind:checked={spatial.crossfeed} /> Crossfeed</label>
  </div>
</div>
<p class="room">Room: <b>{heard.room}</b></p>
<div class="toggles">
  <label><input type="checkbox" bind:checked={spatial.mono} /> As one speaker (a phone’s)</label>
</div>
<svg class="hearing" viewBox="0 0 200 108" aria-label="Where each sound is heard from">
  <path d="M 14 100 A 86 86 0 0 1 186 100" class="arc" />
  <path d="M 100 100 L {100 - 92 * Math.sin(edge)} {100 - 92 * Math.cos(edge)} A 92 92 0 0 1 {100 + 92 * Math.sin(edge)} {100 - 92 * Math.cos(edge)} Z" class="screen" />
  <circle cx="100" cy="100" r="7" class="head" />
  <path d="M 96 94 L 100 89 L 104 94" class="nose" />
  {#each blips.list as b (b.id)}
    {@const p = spot(b)}
    {#if b.wide}
      <path d="M 30 58 Q 100 0 170 58" class="band" style:opacity={p.o} />
    {:else}
      <circle cx={p.x} cy={p.y} r={4 + 3 * p.o} class="blip" class:far={b.far > 0} style:opacity={p.o} />
    {/if}
  {/each}
</svg>
<p class="hint">
  Gold is yours, blue a teammate's, an arc a sound that fills the space; the wedge is the screen. Headphones first, then speakers.
</p>

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0;
    flex-wrap: wrap;
  }
  .line input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .lbl {
    min-width: 5.4em;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  button {
    font: inherit;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button {
    min-width: 2em;
    padding: 0.2rem 0.5rem;
    border: 0;
    border-right: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--text);
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button.on {
    background: rgba(201, 164, 92, 0.25);
    color: var(--gold-hi);
  }
  .seg button:hover {
    background: rgba(201, 164, 92, 0.15);
  }
  .small {
    padding: 0.2rem 0.55rem;
    font-size: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--text);
    cursor: pointer;
  }
  .small:hover {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .ab.on {
    border-color: var(--gold);
    color: var(--gold-hi);
  }
  input[type='range'] {
    --thumb: 14px;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--gold) var(--fill), var(--line) var(--fill));
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 8px rgba(241, 217, 155, 0.6);
  }
  input[type='range']::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    border: 0;
    border-radius: 50%;
    background: var(--gold-hi);
  }
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0.4rem 0;
  }
  .toggles label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
  }
  input[type='checkbox'] {
    accent-color: var(--gold);
    cursor: pointer;
  }
  .spatial {
    transition: opacity 0.2s;
  }
  .room {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .room b {
    font-weight: normal;
    color: var(--gold-hi);
  }
  .spatial.dim {
    opacity: 0.4;
  }
  .hearing {
    display: block;
    width: 100%;
    max-width: 15rem;
    margin: 0.4rem auto 0.2rem;
  }
  .arc {
    fill: none;
    stroke: var(--line);
  }
  .screen {
    fill: rgba(201, 164, 92, 0.1);
    stroke: rgba(201, 164, 92, 0.35);
    stroke-width: 0.6;
  }
  .head {
    fill: #2a221a;
    stroke: var(--gold-lo);
  }
  .nose {
    fill: none;
    stroke: var(--gold-lo);
  }
  .blip {
    fill: var(--gold-hi);
  }
  .blip.far {
    fill: #78aae6;
  }
  .band {
    fill: none;
    stroke: var(--gold-hi);
    stroke-width: 5;
    stroke-linecap: round;
  }
</style>
