<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import { livesCost, type Codex, type Tally } from '../lib/codex';
  import { accuracy } from '../lib/codexStats';
  import { shownDepth } from '../lib/delve';
  import { itemImage, itemThumb } from '../lib/ui';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { artRevealed } from '../lib/fx/moments';
  import { singular, type Item } from '../lib/game';
  import NamePlate, { SOCKET_X } from './NamePlate.svelte';
  import ArtImage from './ArtImage.svelte';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import { motion } from '../lib/motion.svelte';

  // One item of the codex, as a tooltip like the one the game reveals it in.
  let { item, codex, onclose, onopen }: { item: Item; codex: Codex; onclose: () => void; onopen: (item: Item) => void } = $props();

  /** Svelte's transitions run whatever the system says: held still (reduced motion, or the effects off), things just appear. */
  const calm = <T extends { duration?: number; delay?: number }>(p: T): T => (motion.still ? { ...p, duration: 0, delay: 0 } : p);

  const entry = $derived(codex.items[item.id]);
  /** What it is, as one item: "Wand", "Ring". A gem's group is only its attribute, so gems say "Lineage Gem". */
  const kind = $derived(singular(item.kind === 'gem' ? item.category : item.group));
  const byCount = (pairs: [string, number][]) =>
    pairs
      .flatMap(([id, n]) => {
        const it = engine.byId.get(id);
        return it ? [{ item: it, n }] : [];
      })
      .sort((a, b) => b.n - a.n || a.item.name.localeCompare(b.item.name));
  /** The names its art was taken for. */
  const tookItFor = $derived(byCount(Object.entries(entry?.mixed ?? {})));
  /** The items whose art was taken for its name. */
  const tookForIt = $derived(
    byCount(Object.entries(codex.items).flatMap(([id, e]) => (e.mixed[item.id] ? [[id, e.mixed[item.id]] as [string, number]] : []))),
  );

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
  const score = (t: Tally) => `${t.ok} of ${t.n} (${Math.round((accuracy(t) ?? 0) * 100)}%)`;

  let box = $state<HTMLElement>();
  let art = $state<HTMLElement>();
  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    box?.focus();
    return () => before?.focus?.();
  });
  // Each item that opens comes in with the flare the game reveals art with.
  $effect(() => {
    void item.id;
    const el = art;
    if (!el) return;
    const t = setTimeout(() => artRevealed(el), 200);
    return () => clearTimeout(t);
  });

  /** Escape closes; Tab keeps cycling through the dialog's own buttons. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !box) return;
    const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items.at(-1)!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#snippet related(title: string, list: { item: Item; n: number }[])}
  {#if list.length}
    <div class="sep" aria-hidden="true"></div>
    <p class="label">{title}</p>
    <ul class="related">
      {#each list as r (r.item.id)}
        <li>
          <button class="pick" onclick={() => onopen(r.item)} disabled={!codex.items[r.item.id]} title={codex.items[r.item.id] ? `Open ${r.item.name}` : undefined}>
            <img src={itemThumb(r.item.id, 128)} alt="" loading="lazy" />
            <span>{r.item.name}</span>
            <b>{r.n}×</b>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="tooltip"
    bind:this={box}
    transition:fly={calm({ y: 20, duration: 250 })}
    onclick={(e) => e.stopPropagation()}
    {onkeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="codex-item-name"
    tabindex="-1"
  >
    <div class="head">
      <NamePlate end="empty" />
      {#key item.id}
        <div class="head-text" in:fade={{ duration: 250 }}>
          <span class="iname" id="codex-item-name">{item.name}</span>
          <span class="ibase">{item.base}</span>
        </div>
      {/key}
      <button class="close" style:--socket="{SOCKET_X}px" onclick={onclose} aria-label="Close" title="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <div class="art" bind:this={art}>
      <ArcaneCircle />
      <div class="frame">
        {#key item.id}
          <ArtImage src={itemImage(item.id)} alt={item.name} float />
        {/key}
      </div>
    </div>

    <div class="body">
      <p class="kind">{kind}</p>
      {#if entry}
        <div class="sep" aria-hidden="true"></div>
        <ul class="lines">
          <li>Seen <b>{times(entry.seen)}</b></li>
          <li>
            {#if entry.first === entry.last}Seen on <b>{date(entry.first)}</b>{:else}First seen <b>{date(entry.first)}</b>, last <b>{date(entry.last)}</b>{/if}
          </li>
          <li>Named from its art: {#if entry.name.n}<b>{score(entry.name)}</b>{:else}<i>never asked</i>{/if}</li>
          <li>Found from its name: {#if entry.art.n}<b>{score(entry.art)}</b>{:else}<i>never asked</i>{/if}</li>
          {#if entry.delve}
            {@const d = entry.delve}
            {@const lives = livesCost(d)}
            <li>
              In Delve: <b>{d.n}</b> answered, <b>{d.ok}</b> right{#if d.deepest}, as deep as depth <b>{shownDepth(d.deepest)}</b>{/if}
            </li>
            {#if d.n > d.ok}
              <li>
                {#if lives}Cost you a life <b>{times(lives)}</b>{#if d.lostAt}, deepest at depth <b>{shownDepth(d.lostAt)}</b>{/if}{:else}Never cost you a life{/if}{#if d.warded}; it broke <b>{d.warded === 1 ? 'an Azurite Ward' : `${d.warded} Azurite Wards`}</b>{/if}
              </li>
            {/if}
            {#if d.finds || d.blasted}
              <li>
                {#if d.finds}Asked from a find <b>{times(d.finds)}</b>{/if}{#if d.blasted}{d.finds ? '; dynamite' : 'Dynamite'} went off on it <b>{times(d.blasted)}</b>{/if}
              </li>
            {/if}
          {/if}
        </ul>
      {/if}
      {@render related('You took it for', tookItFor)}
      {@render related('You took these for it', tookForIt)}
    </div>
  </div>
</div>

<style>
  /* The page behind scrolls the dialog on a short screen, so it never shows a scrollbar of its own. */
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the leave dialog (App.svelte). */
    z-index: 94;
    display: grid;
    padding: 1rem;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .backdrop::-webkit-scrollbar {
    display: none;
  }

  /* PoE-style item tooltip, as in the game (QuestionView). */
  .tooltip {
    margin: auto;
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    /*
     * Painted here, not by the backdrop: a dialog floats over the page, which
     * would show through. A faint grain (as on the page's backdrop) dithers the
     * art stage's glows, which would band this close to black.
     */
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.025'/%3E%3C/svg%3E"),
      #030201;
    box-shadow:
      0 0 0 1px #000,
      0 0 50px rgba(175, 96, 37, 0.12),
      0 20px 60px rgba(0, 0, 0, 0.75);
    outline: none;
  }
  .head {
    position: relative;
    display: grid;
    min-height: 64px;
    place-items: center;
    /* Clear of the braces at the plate's ends. */
    padding: 0.5rem 3.6rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.15;
  }
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.88rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* Centred in the empty end of the name plate. */
  .close {
    position: absolute;
    top: 50%;
    right: var(--socket);
    translate: 50% -50%;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    color: var(--unique-hi);
    transition: color 0.2s;
  }
  .close:hover {
    color: var(--gold-hi);
  }
  .close svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
  }

  .art {
    position: relative;
    height: 240px;
    display: grid;
    place-items: center;
    container-type: size;
    /*
     * Only light on the tooltip's own colour, no darker base of its own: each
     * glow dies out before the bottom edge, so the stage runs on into the text
     * below without a seam.
     */
    background:
      radial-gradient(ellipse 55% 50% at 50% 50%, rgba(175, 96, 37, 0.14), transparent),
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(90, 110, 160, 0.1), transparent);
    box-shadow: inset 0 1px 0 rgba(201, 164, 92, 0.12);
    overflow: hidden;
  }
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 80%;
    height: 84%;
    display: grid;
    place-items: center;
  }
  .frame > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }

  .body {
    padding: 0.9rem 1.2rem 1.1rem;
    text-align: center;
  }
  .kind {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  /* The tooltip's separator: a hairline with a gem in the middle. */
  .sep {
    position: relative;
    height: 1px;
    margin: 0.8rem auto;
    width: 80%;
    background: linear-gradient(90deg, transparent, #6b4520 25%, #6b4520 75%, transparent);
  }
  .sep::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    translate: -50% -50%;
    rotate: 45deg;
    background: var(--unique);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }
  /* Tooltip lines: cool against the warm name, like the game's extra lines. */
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    color: #8f9aa6;
    font-size: 1rem;
    line-height: 1.3;
  }
  .lines b {
    font-weight: 500;
    color: #a9c3dc;
  }
  .lines i {
    color: #6d7782;
  }
  .label {
    margin: 0 0 0.45rem;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .related {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.2rem 0.65rem 0.2rem 0.25rem;
    border: 1px solid rgba(107, 69, 32, 0.6);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
    color: var(--text);
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      border-color 0.2s,
      color 0.2s,
      box-shadow 0.25s;
  }
  .pick:hover:not(:disabled) {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
    box-shadow: 0 0 12px rgba(201, 164, 92, 0.25);
  }
  .pick:disabled {
    cursor: default;
  }
  .pick img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
  .pick b {
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    color: var(--gold);
  }

  @media (max-width: 480px) {
    .art {
      height: 200px;
    }
    .body {
      padding: 0.8rem 0.9rem 1rem;
    }
  }
</style>
