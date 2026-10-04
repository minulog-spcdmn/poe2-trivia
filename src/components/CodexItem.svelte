<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import type { Codex, Tally } from '../lib/codex';
  import { accuracy } from '../lib/codexStats';
  import { itemImage } from '../lib/ui';
  import { dialogBackdrop } from '../lib/behindDialog';
  import type { Item } from '../lib/game';
  import ArtImage from './ArtImage.svelte';

  let { item, codex, onclose, onopen }: { item: Item; codex: Codex; onclose: () => void; onopen: (item: Item) => void } = $props();

  const entry = $derived(codex.items[item.id]);
  const byCount = (pairs: [string, number][]) =>
    pairs
      .flatMap(([id, n]) => {
        const it = engine.byId.get(id);
        return it ? [{ item: it, n }] : [];
      })
      .sort((a, b) => b.n - a.n || a.item.name.localeCompare(b.item.name));
  /** What was picked when this was the answer. */
  const tookItFor = $derived(byCount(Object.entries(entry?.mixed ?? {})));
  /** What this was picked for. */
  const tookForIt = $derived(
    byCount(Object.entries(codex.items).flatMap(([id, e]) => (e.mixed[item.id] ? [[id, e.mixed[item.id]] as [string, number]] : []))),
  );

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const pct = (t: Tally) => {
    const a = accuracy(t);
    return a === null ? '' : `${Math.round(a * 100)}%`;
  };

  let box = $state<HTMLElement>();
  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    box?.focus();
    return () => before?.focus?.();
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
    <section class="related">
      <h3>{title}</h3>
      <ul>
        {#each list as r (r.item.id)}
          <li>
            {#if codex.items[r.item.id]}
              <button class="pick" onclick={() => onopen(r.item)}>
                <img src={itemImage(r.item.id)} alt="" loading="lazy" />
                <span>{r.item.name}</span>
              </button>
            {:else}
              <span class="pick">
                <img src={itemImage(r.item.id)} alt="" loading="lazy" />
                <span>{r.item.name}</span>
              </span>
            {/if}
            <b>{r.n}×</b>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="sheet panel"
    bind:this={box}
    transition:fly={{ y: 20, duration: 250 }}
    onclick={(e) => e.stopPropagation()}
    {onkeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="codex-item-title"
    tabindex="-1"
  >
    <div class="top">
      <div class="art">
        {#key item.id}
          <ArtImage src={itemImage(item.id)} alt={item.name} scale={1.4} />
        {/key}
      </div>
      <div class="who">
        <h2 id="codex-item-title">{item.name}</h2>
        <p class="base">{item.base}</p>
        <p class="muted where">{item.group} • {item.category}</p>
      </div>
    </div>

    {#if entry}
      <dl class="facts">
        <div>
          <dt>Seen</dt>
          <dd>{entry.seen}×</dd>
        </div>
        <div>
          <dt>First met</dt>
          <dd>{date(entry.first)}</dd>
        </div>
        <div>
          <dt>Last met</dt>
          <dd>{date(entry.last)}</dd>
        </div>
        <div>
          <dt>Name the art</dt>
          <dd>{#if entry.name.n}{entry.name.ok} of {entry.name.n} <small>{pct(entry.name)}</small>{:else}<small>no answers</small>{/if}</dd>
        </div>
        <div>
          <dt>Find the art</dt>
          <dd>{#if entry.art.n}{entry.art.ok} of {entry.art.n} <small>{pct(entry.art)}</small>{:else}<small>no answers</small>{/if}</dd>
        </div>
      </dl>
    {/if}

    {@render related('You took it for', tookItFor)}
    {@render related('You took these for it', tookForIt)}

    <footer>
      <button class="btn primary" onclick={onclose}>Close</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the leave dialog (App.svelte). */
    z-index: 94;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    width: min(520px, 100%);
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: 1.5rem;
    outline: none;
  }
  .top {
    display: flex;
    gap: 1.2rem;
    align-items: center;
  }
  .art {
    flex: none;
    width: 140px;
    height: 170px;
    display: grid;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: radial-gradient(ellipse at 50% 60%, rgba(175, 96, 37, 0.16), transparent 70%), rgba(0, 0, 0, 0.35);
    padding: 0.6rem;
  }
  h2 {
    font-size: 1.35rem;
    color: var(--unique-hi);
    text-shadow: 0 0 16px rgba(224, 138, 68, 0.3);
    line-height: 1.15;
  }
  .base {
    margin: 0.3rem 0 0;
    color: var(--text);
  }
  .where {
    margin: 0.15rem 0 0;
    font-size: 0.9rem;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.6rem;
    margin: 0;
  }
  .facts div {
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  dt {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  dd {
    margin: 0.15rem 0 0;
    color: var(--gold-hi);
    font-size: 1.05rem;
  }
  dd small {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .related h3 {
    font-size: 0.78rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.4rem;
  }
  .related ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .related li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .related b {
    font-family: var(--font-cinzel);
    color: var(--gold);
    font-size: 0.85rem;
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    text-align: left;
    color: var(--text);
  }
  button.pick {
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s;
  }
  button.pick:hover {
    border-color: var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--gold-hi);
  }
  .pick img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex: none;
  }
  .pick span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  footer {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 480px) {
    .sheet {
      padding: 1.2rem;
    }
    .top {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
