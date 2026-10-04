<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';

  // A dropdown in the site's style (a native one can't style its list):
  // the category emblems in gold, with how much of each is discovered.
  // Arrow keys, Home/End, Enter and Escape work as in a native select.

  type Option = { value: string; label: string; icon?: string; note?: string };
  let { value = $bindable(''), options, label }: { value?: string; options: Option[]; label: string } = $props();

  let open = $state(false);
  let active = $state(0);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let list = $state<HTMLElement>();
  const id = `dd-${Math.random().toString(36).slice(2, 8)}`;
  const current = $derived(options.find((o) => o.value === value) ?? options[0]);

  async function show() {
    open = true;
    active = Math.max(0, options.findIndex((o) => o.value === value));
    await tick();
    list?.focus();
  }
  function hide(refocus = true) {
    open = false;
    if (refocus) button?.focus();
  }
  function choose(v: string) {
    value = v;
    hide();
  }

  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') active = Math.min(last, active + 1);
    else if (e.key === 'ArrowUp') active = Math.max(0, active - 1);
    else if (e.key === 'Home') active = 0;
    else if (e.key === 'End') active = last;
    else if (e.key === 'Enter' || e.key === ' ') choose(options[active].value);
    else if (e.key === 'Escape') hide();
    else if (e.key === 'Tab') hide(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
    e.stopPropagation();
  }
  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      void show();
    }
  }
  /** A press anywhere else closes it. */
  function outside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) hide(false);
  }
</script>

<svelte:window onpointerdown={outside} />

<div class="dd" bind:this={root}>
  <button
    class="field dd-button"
    class:open
    bind:this={button}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={label}
    onclick={() => (open ? hide() : show())}
    onkeydown={onButtonKey}
  >
    {#if current.icon}<span class="glyph" style:--src="url('{current.icon}')" aria-hidden="true"></span>{/if}
    <span class="dd-label">{current.label}</span>
    <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </button>

  {#if open}
    <ul
      class="dd-list"
      role="listbox"
      tabindex="-1"
      aria-label={label}
      aria-activedescendant="{id}-{active}"
      bind:this={list}
      onkeydown={onListKey}
      transition:fly={{ y: -6, duration: 160 }}
    >
      {#each options as o, i (o.value)}
        <!-- svelte-ignore a11y_click_events_have_key_events (the list handles the keys) -->
        <li
          id="{id}-{i}"
          role="option"
          aria-selected={o.value === value}
          class:active={i === active}
          class:chosen={o.value === value}
          onpointerenter={() => (active = i)}
          onclick={() => choose(o.value)}
        >
          {#if o.icon}<span class="glyph" style:--src="url('{o.icon}')" aria-hidden="true"></span>{:else}<span class="glyph none" aria-hidden="true"></span>{/if}
          <span class="dd-label">{o.label}</span>
          {#if o.note}<span class="note">{o.note}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dd {
    position: relative;
    z-index: 5;
  }
  .dd-button {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    min-width: 15rem;
    padding: 0.45rem 0.7rem;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
  }
  .dd-button.open {
    border-color: var(--gold-lo);
  }
  .dd-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--gold);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: rotate 0.25s var(--ease-out);
  }
  .open .chevron {
    rotate: 180deg;
  }
  /* The game's category emblems: the art as a gold silhouette (ChooseCategory). */
  .glyph {
    flex: none;
    width: 22px;
    height: 22px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
  }
  .glyph.none {
    background: none;
  }

  .dd-list {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    min-width: 17rem;
    margin: 0;
    padding: 0.35rem;
    list-style: none;
    background: linear-gradient(180deg, #221c15, #100d0a);
    border: 1px solid var(--gold-lo);
    border-radius: var(--radius);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 220, 150, 0.08),
      0 18px 40px rgba(0, 0, 0, 0.7);
    outline: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.6rem;
    border-radius: 3px;
    cursor: pointer;
    color: var(--text);
    font-size: 0.97rem;
    transition:
      background 0.15s,
      color 0.15s;
  }
  li.active {
    background: rgba(175, 96, 37, 0.18);
    color: var(--gold-hi);
  }
  li.chosen {
    color: var(--gold-hi);
    box-shadow: inset 2px 0 0 var(--gold);
  }
  .note {
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    color: var(--muted);
  }

  @media (max-width: 560px) {
    .dd-button {
      min-width: 0;
    }
    .dd-list {
      min-width: 0;
    }
  }
</style>
