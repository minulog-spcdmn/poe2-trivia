<script lang="ts">
  // The zone banner preview (zones.html): pick a design and a zone, and the
  // banner plays over the real game screen in the frame below, at a desktop's
  // width or a phone's. The frame (zones.html?stage, ./stage.svelte.ts) runs
  // the lab's Delve run; each play sets its depth quietly first, so the
  // header, the scene and the colours are the zone's.
  import { onMount } from 'svelte';
  import { CONCEPTS, type ConceptId } from '../components/zonebanner/concepts';
  import { accentAt, stratumName } from '../lib/descent';
  import { zoneAt } from '../lib/zoneSigils';
  import { readStored, writeStored } from '../lib/storage';
  import type { Play } from './stage.svelte';

  type Entry = { key: string; label: string; title: string; depth: number };
  const ENTRIES: Entry[] = [
    ...Array.from({ length: 10 }, (_, k) => {
      const name = stratumName(k);
      return { key: `z${k}`, label: `${10 * k + 1} • ${name}`, title: name, depth: 10 * k + 1 };
    }),
    { key: 'long1', label: '111 • Hollow of Seven Bells (endgame)', title: 'Hollow of Seven Bells', depth: 111 },
    { key: 'long2', label: '141 • Crypts of the Pale Choir (endgame)', title: 'Crypts of the Pale Choir', depth: 141 },
    { key: 'record', label: '47 • Deeper than ever', title: 'Deeper than ever', depth: 47 },
  ];

  const stored = (name: string, fallback: string) => readStored(`zones.${name}`) ?? fallback;
  let concept = $state(stored('concept', 'chisel') as ConceptId);
  let zone = $state(stored('zone', 'z1'));
  let phone = $state(stored('phone', '0') === '1');
  let hold = $state(stored('hold', '0') === '1');
  let still = $state(false);
  const reduced = readStored('labReduceMotion') === '1';
  $effect(() => {
    writeStored('zones.concept', concept);
    writeStored('zones.zone', zone);
    writeStored('zones.phone', phone ? '1' : '0');
    writeStored('zones.hold', hold ? '1' : '0');
  });

  const entry = $derived(ENTRIES.find((e) => e.key === zone) ?? ENTRIES[1]);
  const about = $derived(CONCEPTS.find((c) => c.id === concept)!);

  let frame: HTMLIFrameElement;
  type Api = { play: (o: Play) => Promise<void>; leave: () => void; ready: boolean };
  const api = () => (frame?.contentWindow as unknown as { __zb?: Api } | null)?.__zb;

  async function replay() {
    for (let i = 0; !api()?.ready && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    const e = entry;
    api()?.play({ concept, title: e.title, sigil: zoneAt(e.depth), accent: accentAt(e.depth), depth: e.depth, hold });
  }

  // Any change plays it again.
  $effect(() => {
    void [concept, zone, phone, hold];
    replay();
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
      if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'r') replay();
      const n = Number(e.key);
      if (n >= 1 && n <= CONCEPTS.length) concept = CONCEPTS[n - 1].id;
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
</script>

<div class="preview">
  <header class="bar">
    <h1>Zone banners</h1>
    <div class="seg" role="group" aria-label="Design">
      {#each CONCEPTS as c, i (c.id)}
        <button class:on={c.id === concept} onclick={() => (concept = c.id)} title="{c.name} ({i + 1})">{c.name}</button>
      {/each}
    </div>
    <label class="zone">
      <span class="sr">Zone</span>
      <select bind:value={zone}>
        {#each ENTRIES as e (e.key)}<option value={e.key}>{e.label}</option>{/each}
      </select>
    </label>
    <button class="btn small" onclick={replay} title="Replay (R)">Replay</button>
    <label class="tog"><input type="checkbox" bind:checked={phone} /> Phone width</label>
    <label class="tog"><input type="checkbox" bind:checked={hold} /> Hold</label>
    <label class="tog"><input type="checkbox" checked={still} onchange={(e) => setStill(e.currentTarget.checked)} /> Effects off</label>
    <label class="tog"><input type="checkbox" checked={reduced} onchange={(e) => setReduced(e.currentTarget.checked)} /> Reduced motion</label>
  </header>
  <p class="about"><b>{about.name}</b>: {about.blurb}</p>
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
  .seg {
    display: inline-flex;
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    overflow: hidden;
  }
  .seg button {
    padding: 0.3rem 0.8rem;
    font: inherit;
    font-family: var(--font-display);
    font-size: 0.85rem;
    color: var(--gold);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--gold-lo);
  }
  .seg button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #3f301c, #251b10);
  }
  .seg button:hover:not(.on) {
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
  .about {
    margin: 0;
    padding: 0.35rem 1rem 0.55rem;
    font-size: 0.92rem;
    font-style: italic;
    color: var(--muted);
    border-bottom: 1px solid rgba(201, 164, 92, 0.18);
  }
  .about b {
    font-style: normal;
    color: var(--gold);
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
