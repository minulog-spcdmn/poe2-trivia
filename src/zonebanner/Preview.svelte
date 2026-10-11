<script lang="ts">
  // The zone tuning page (zones.html): pick a zone and its title card
  // (components/zonecard) plays over the real game screen in the frame below,
  // at a desktop's width or a phone's, as in a game: the run steps down into
  // the zone the engine's way, so the plunge, its sound, the scene's colours
  // and the deal as it lands are the zone's. Any family of motion can be
  // tried on it, and the card stopped at any moment (Freeze). The frame
  // (zones.html?stage, ./stage.svelte.ts) runs the lab's Delve run.
  import { onMount } from 'svelte';
  import { stratumName } from '../lib/descent';
  import { readStored, writeStored } from '../lib/storage';
  import type { Family } from '../lib/zoneTitle';
  import type { CardPlay } from './stage.svelte';

  type Entry = { key: string; label: string; depth: number; name?: string; best?: boolean };
  const ENTRIES: Entry[] = [
    ...Array.from({ length: 15 }, (_, j) => {
      const k = j + 1;
      const name = stratumName(k);
      return { key: `z${k}`, label: `${10 * k + 1} • ${name}${k >= 10 ? ' (endgame)' : ''}`, depth: 10 * k + 1 };
    }),
    { key: 'wide', label: '101 • Fathomless Firmament (the widest name)', depth: 101, name: 'Fathomless Firmament' },
    { key: 'best', label: '41 • Vaal Outpost, past your best', depth: 41, best: true },
  ];
  const FAMILIES: (Family | '')[] = ['', 'ember', 'rime', 'spore', 'void', 'light', 'fume'];

  const stored = (name: string, fallback: string) => readStored(`zones.${name}`) ?? fallback;
  // (One stored before an entry was dropped falls back to the first.)
  const savedZone = stored('zone', 'z1');
  let zone = $state(ENTRIES.some((e) => e.key === savedZone) ? savedZone : 'z1');
  let family = $state(stored('family', '') as Family | '');
  let phone = $state(stored('phone', '0') === '1');
  let freeze = $state(stored('freeze', '0') === '1');
  let at = $state(Number(stored('at', '2850')) || 2850);
  let still = $state(false);
  const reduced = readStored('labReduceMotion') === '1';
  $effect(() => {
    writeStored('zones.zone', zone);
    writeStored('zones.family', family);
    writeStored('zones.phone', phone ? '1' : '0');
    writeStored('zones.freeze', freeze ? '1' : '0');
    writeStored('zones.at', String(at));
  });

  const entry = $derived(ENTRIES.find((e) => e.key === zone) ?? ENTRIES[0]);

  let frame: HTMLIFrameElement;
  type Api = { card: (o: CardPlay) => Promise<void>; seek: (ms: number | null) => void; ready: boolean };
  const api = () => (frame?.contentWindow as unknown as { __zb?: Api } | null)?.__zb;

  async function replay() {
    for (let i = 0; !api()?.ready && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    const e = entry;
    await api()?.card({ depth: e.depth, name: e.name, family: family || undefined, best: e.best, hold: freeze });
    if (freeze) seek();
  }
  /** Stops the card at the chosen moment (once it is up). */
  async function seek() {
    for (let i = 0; i < 40 && !frame?.contentDocument?.querySelector('.zc'); i++) await new Promise((r) => setTimeout(r, 100));
    api()?.seek(freeze ? at : null);
  }

  // Any change plays it again; moving the moment only stops it there.
  $effect(() => {
    void [zone, family, phone, freeze];
    replay();
  });
  $effect(() => {
    void at;
    if (freeze) api()?.seek(at);
  });

  function setStill(on: boolean) {
    still = on;
    frame.contentDocument?.documentElement.toggleAttribute('data-still', on);
    replay();
  }
  function setReduced(on: boolean) {
    writeStored('labReduceMotion', on ? '1' : '0');
    location.reload();
  }

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'r') replay();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
</script>

<div class="preview">
  <header class="bar">
    <h1>Zone card</h1>
    <label class="zone">
      <span class="sr">Zone</span>
      <select bind:value={zone}>
        {#each ENTRIES as e (e.key)}<option value={e.key}>{e.label}</option>{/each}
      </select>
    </label>
    <label class="zone">
      <span class="sr">Family</span>
      <select bind:value={family}>
        {#each FAMILIES as f (f)}<option value={f}>{f ? `As ${f}` : 'Its own motion'}</option>{/each}
      </select>
    </label>
    <button class="btn small" onclick={replay} title="Replay (R)">Replay</button>
    <label class="tog"><input type="checkbox" bind:checked={phone} /> Phone width</label>
    <label class="tog"><input type="checkbox" bind:checked={freeze} /> Freeze</label>
    {#if freeze}
      <label class="tog at"><input type="range" min="0" max="7000" step="50" bind:value={at} /> {(at / 1000).toFixed(2)} s</label>
    {/if}
    <label class="tog"><input type="checkbox" checked={still} onchange={(e) => setStill(e.currentTarget.checked)} /> Effects off</label>
    <label class="tog"><input type="checkbox" checked={reduced} onchange={(e) => setReduced(e.currentTarget.checked)} /> Reduced motion</label>
    <span class="hint">Click the screen once for sound.</span>
  </header>
  <div class="stage" class:phone>
    <iframe bind:this={frame} src="./zones.html?stage" title="The game screen" onload={replay}></iframe>
  </div>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: #0a0908;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
    padding: 0.7rem 1rem 0.3rem;
    border-bottom: 1px solid rgba(201, 164, 92, 0.18);
  }
  h1 {
    margin: 0 0.4rem 0 0;
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    color: var(--gold-hi);
  }
  select {
    font: inherit;
    font-size: 0.95rem;
    padding: 0.25rem 0.4rem;
    color: var(--gold-hi);
    background: #15100c;
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
  }
  .tog {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.92rem;
    color: var(--gold);
    cursor: pointer;
  }
  .tog input {
    accent-color: var(--gold);
  }
  .at input {
    width: 12rem;
  }
  .at {
    font-variant-numeric: tabular-nums;
  }
  .hint {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    background: #050404;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #0a0908;
  }
  .phone {
    padding: 0.8rem 0;
  }
  .phone iframe {
    width: 375px;
    max-width: 100%;
    border: 1px solid rgba(201, 164, 92, 0.35);
    border-radius: 6px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
