<script lang="ts">
  // The card bench (cards.html): make any card, a category's or the dig's way
  // out, plain or with a find, pin up to three, and they are dealt on the real
  // game screen in the frame below, at a desktop's width or a phone's, as in a
  // game: the deal, the hover and its fire are the game's own. A card clicked
  // turns over; Deal plays the deal again. Pinning an item already pinned
  // changes its find. The frame (cards.html?stage, ./stage.ts) runs the lab's
  // Delve run.
  import { onMount } from 'svelte';
  import { readStored, writeStored } from '../lib/storage';
  import { WAY_OUT, type FindKind } from '../lib/delve';
  import type { BenchCard } from './stage';

  type Api = {
    deal: (cards: BenchCard[]) => void;
    flip: (i?: number) => void;
    items: { value: string; label: string }[];
    finds: { kind: FindKind; name: string }[];
    ready: boolean;
  };
  const MAX = 3;

  const load = <T,>(name: string, fallback: T): T => {
    try {
      return (JSON.parse(readStored(`cards.${name}`) ?? 'null') as T) ?? fallback;
    } catch {
      return fallback;
    }
  };
  let pinned = $state<BenchCard[]>(load('pinned', []));
  let item = $state(load('item', ''));
  let find = $state<FindKind | ''>(load('find', 'azurite'));
  let phone = $state(load('phone', false));
  $effect(() => {
    writeStored('cards.pinned', JSON.stringify(pinned));
    writeStored('cards.item', JSON.stringify(item));
    writeStored('cards.find', JSON.stringify(find));
    writeStored('cards.phone', JSON.stringify(phone));
  });

  let frame: HTMLIFrameElement;
  const api = () => (frame?.contentWindow as unknown as { __cb?: Api } | null)?.__cb;
  let items = $state<Api['items']>([]);
  let finds = $state<Api['finds']>([]);
  const nameOf = (value: string) => items.find((i) => i.value === value)?.label ?? value;
  const findName = (kind: FindKind | null) => (kind ? (finds.find((f) => f.kind === kind)?.name ?? kind) : 'Plain');

  /** Once the frame's game is up: its lists, and the first cards if none are pinned yet. */
  async function ready() {
    for (let i = 0; !api()?.ready && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    const a = api();
    if (!a) return;
    items = a.items;
    finds = a.finds;
    if (!items.some((i) => i.value === item)) item = items[0]?.value ?? '';
    if (!pinned.length) pinned = items.slice(0, 3).map((i, k) => ({ category: i.value, kind: k === 1 ? 'azurite' : null }));
    deal();
  }
  function deal() {
    api()?.deal($state.snapshot(pinned));
  }

  /** The way out carries no find. */
  const isOut = $derived(item === WAY_OUT);
  const at = $derived(pinned.findIndex((c) => c.category === item));
  const canPin = $derived(!!item && (at >= 0 || pinned.length < MAX));
  function pin() {
    if (!canPin) return;
    const card: BenchCard = { category: item, kind: isOut || !find ? null : find };
    pinned = at >= 0 ? pinned.map((c, k) => (k === at ? card : c)) : [...pinned, card];
    deal();
  }
  function unpin(k: number) {
    pinned = pinned.filter((_, j) => j !== k);
    deal();
  }

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'r') deal();
      if (e.key === 'f') api()?.flip();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
</script>

<div class="bench">
  <header class="bar">
    <h1>Card bench</h1>
    <label>
      <span class="sr">Item</span>
      <select bind:value={item}>
        {#each items as i (i.value)}<option value={i.value}>{i.label}</option>{/each}
      </select>
    </label>
    <label>
      <span class="sr">Find</span>
      <select bind:value={find} disabled={isOut}>
        <option value="">Plain</option>
        {#each finds as f (f.kind)}<option value={f.kind}>{f.name}</option>{/each}
      </select>
    </label>
    <button class="btn small" onclick={pin} disabled={!canPin} title={canPin ? '' : 'Three are pinned: unpin one first'}>{at >= 0 ? 'Change' : 'Pin'}</button>
    <ul class="pins" aria-label="Pinned cards">
      {#each pinned as c, k (c.category)}
        <li>
          {nameOf(c.category)}{#if c.category !== WAY_OUT}<span class="muted"> • {findName(c.kind)}</span>{/if}
          <button class="unpin" onclick={() => unpin(k)} aria-label="Unpin {nameOf(c.category)}">×</button>
        </li>
      {/each}
    </ul>
    <button class="btn small" onclick={deal} title="Deal again (R)">Deal</button>
    <button class="btn small" onclick={() => api()?.flip()} title="Turn every card over (F)">Flip all</button>
    <label class="tog"><input type="checkbox" bind:checked={phone} /> Phone width</label>
    <span class="hint">Click a card to turn it over.</span>
  </header>
  <div class="stage" class:phone>
    <iframe bind:this={frame} src="./cards.html?stage" title="The game screen" onload={ready}></iframe>
  </div>
</div>

<style>
  .bench {
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
    padding: 0.7rem 1rem 0.5rem;
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
  select:disabled {
    opacity: 0.45;
  }
  .pins {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pins li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.2rem 0.15rem 0.6rem;
    font-size: 0.9rem;
    color: var(--gold-hi);
    background: #15100c;
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
  }
  .muted {
    color: var(--muted);
  }
  .unpin {
    width: 1.4rem;
    height: 1.4rem;
    padding: 0;
    font: inherit;
    line-height: 1;
    color: var(--gold);
    background: none;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }
  .unpin:hover {
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.15);
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
