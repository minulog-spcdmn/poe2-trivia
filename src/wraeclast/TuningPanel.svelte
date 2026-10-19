<script lang="ts">
  // The tuning panel, collapsed at the page's foot: the numbers the next run
  // starts with, kept in storage as they change, and in each run's log.
  import { backdropShadow } from '../lib/backdropShadow';
  import { DEFAULT_TUNING, HIDDEN, HIDDEN_NAMES, LOOT_KINDS, SECTIONS, SUPPLIES, SUPPLY_NAMES, ZONE_TYPES, ZONE_NAMES, type Range } from './rules';
  import { LIMITS, isDefault } from './tuning';
  import { play } from './play.svelte';
  import { SECTION_NAMES } from './markup';
  import { FREE_CLUE } from './words';

  /** Whether it's open: from the start on the QA desk's bench, collapsed on the page till tapped. */
  let { open = $bindable(false) }: { open?: boolean } = $props();
  const t = $derived(play.tuning);
  const changed = $derived(!isDefault(t));
  const LOOT_NAMES = { gold: 'Gold', supply: 'Supplies', flask: 'Flask charge', jackpot: 'Jackpot' } as const;

  /**
   * A number field's value, kept whole and in range (a blank or a stray value
   * leaves the number as it was), written back to the field so it shows the
   * number kept.
   */
  function num(field: HTMLInputElement, was: number, [lo, hi]: readonly [number, number], set: (n: number) => void) {
    const n = Math.round(Number(field.value));
    const kept = field.value.trim() === '' || !Number.isFinite(n) ? was : Math.max(lo, Math.min(hi, n));
    field.value = String(kept);
    if (kept === was) return;
    set(kept);
    play.saveTuning();
  }
  /** A range's end set: the other end moves with it when they'd cross. */
  function setEnd(r: Range, end: 0 | 1, n: number) {
    r[end] = n;
    if (r[0] > r[1]) r[end === 0 ? 1 : 0] = n;
  }
  function toggle(set: (on: boolean) => void) {
    return (e: Event) => {
      set((e.currentTarget as HTMLInputElement).checked);
      play.saveTuning();
    };
  }
  function setMarks(e: Event) {
    t.marks = (e.currentTarget as HTMLInputElement).checked ? 'gold' : 'both';
    play.saveTuning();
  }
  function reset() {
    play.tuning = structuredClone(DEFAULT_TUNING);
    play.saveTuning();
  }
</script>

{#snippet field(label: string, value: number, limits: readonly [number, number], set: (n: number) => void)}
  <label class="knob">
    <span>{label}</span>
    <input class="field" type="number" inputmode="numeric" min={limits[0]} max={limits[1]} step="1" {value} onchange={(e) => num(e.currentTarget, value, limits, set)} />
  </label>
{/snippet}

{#snippet range(label: string, r: Range, limits: readonly [number, number])}
  <div class="knob">
    <span>{label}</span>
    <span class="pair">
      <input class="field" type="number" inputmode="numeric" aria-label="{label}, from" min={limits[0]} max={limits[1]} step="1" value={r[0]} onchange={(e) => num(e.currentTarget, r[0], limits, (n) => setEnd(r, 0, n))} />
      <span class="to">to</span>
      <input class="field" type="number" inputmode="numeric" aria-label="{label}, to" min={limits[0]} max={limits[1]} step="1" value={r[1]} onchange={(e) => num(e.currentTarget, r[1], limits, (n) => setEnd(r, 1, n))} />
    </span>
  </div>
{/snippet}

<details class="panel tuning" bind:open use:backdropShadow={{ fill: 'linear' }}>
  <summary>
    <span class="title">Tuning</span>
    {#if changed}<span class="tag">Changed</span>{/if}
    <span class="hint">The next run starts with these numbers.</span>
  </summary>

  <div class="groups">
    <fieldset>
      <legend>Start</legend>
      {@render field('Life', t.life, LIMITS.life, (n) => (t.life = n))}
      {@render field('Gold', t.gold, LIMITS.gold, (n) => (t.gold = n))}
      {@render field('Flask charges', t.flask, LIMITS.flask, (n) => (t.flask = n))}
      {@render field('Items per zone', t.itemsPerZone, LIMITS.itemsPerZone, (n) => (t.itemsPerZone = n))}
      {@render field('Open nodes that are zones (%)', t.zoneShare, LIMITS.zoneShare, (n) => (t.zoneShare = n))}
    </fieldset>

    <fieldset>
      <legend>Miss cost (life)</legend>
      {#each SECTIONS as sec (sec)}
        {@render range(SECTION_NAMES[sec], t.missCost[sec], LIMITS.missCost)}
      {/each}
    </fieldset>

    <fieldset>
      <legend>Tiles per section</legend>
      {#each SECTIONS as sec (sec)}
        {@render field(SECTION_NAMES[sec], t.tiles[sec], LIMITS.tiles, (n) => (t.tiles[sec] = n))}
      {/each}
      <label class="check">
        <input type="checkbox" checked={t.marks === 'gold'} onchange={setMarks} />
        <span>Gold marks only (no silver or struck)</span>
      </label>
      <p class="small">Each item rolls its total within 3 either way, at least 5 of them decoys, among them of, the, and and 2 or 3 possessive tiles. Blight adds 6, Swarming and Teeming 8, up to 36 tiles.</p>
    </fieldset>

    <fieldset>
      <legend>Prices (gold) and stacks</legend>
      {#each SUPPLIES as w (w)}
        <div class="knob">
          <span>{SUPPLY_NAMES[w]}</span>
          <span class="pair">
            <input class="field" type="number" inputmode="numeric" aria-label="{SUPPLY_NAMES[w]}, how many" min={LIMITS.stack[0]} max={LIMITS.stack[1]} step="1" value={t.stack[w]} onchange={(e) => num(e.currentTarget, t.stack[w], LIMITS.stack, (n) => (t.stack[w] = n))} />
            <span class="to">for</span>
            <input class="field" type="number" inputmode="numeric" aria-label="{SUPPLY_NAMES[w]}, price" min={LIMITS.price[0]} max={LIMITS.price[1]} step="1" value={t.price[w]} onchange={(e) => num(e.currentTarget, t.price[w], LIMITS.price, (n) => (t.price[w] = n))} />
          </span>
        </div>
      {/each}
    </fieldset>

    <fieldset>
      <legend>The Veil (patches)</legend>
      {@render field('Seeds a side', t.seeds, LIMITS.seeds, (n) => (t.seeds = n))}
      {@render field('A Flare burns in', t.burnIn.flare, LIMITS.burnIn, (n) => (t.burnIn.flare = n))}
      {@render field("Blight's free burn-in", t.burnIn.blight, LIMITS.burnIn, (n) => (t.burnIn.blight = n))}
      {@render field("The boss's first item, free", t.burnIn.boss, LIMITS.burnIn, (n) => (t.burnIn.boss = n))}
      <p class="small">Incursion and a Murky boss halve a Flare's.</p>
    </fieldset>

    <fieldset>
      <legend>Loot</legend>
      {#each ZONE_TYPES as z (z)}
        {@render field(`Cards, ${ZONE_NAMES[z]}`, t.loot.cards[z], LIMITS.cards, (n) => (t.loot.cards[z] = n))}
      {/each}
      {#each LOOT_KINDS as k (k)}
        {@render field(`${LOOT_NAMES[k]} (weight)`, t.loot.weights[k], LIMITS.weight, (n) => (t.loot.weights[k] = n))}
      {/each}
      {@render range('Gold, steps 1 to 5', t.loot.gold.early, LIMITS.lootGold)}
      {@render range('Gold, steps 6 to 10', t.loot.gold.mid, LIMITS.lootGold)}
      {@render range('Gold, steps 11 to 15', t.loot.gold.late, LIMITS.lootGold)}
      {@render field('Jackpot (gold)', t.loot.jackpot, LIMITS.lootGold, (n) => (t.loot.jackpot = n))}
      {@render field('Supplies on a card', t.loot.supplies, LIMITS.supplies, (n) => (t.loot.supplies = n))}
    </fieldset>

    <fieldset>
      <legend>Corruption</legend>
      {@render field('Fronts seeded', t.corruption.seeds, LIMITS.fronts, (n) => (t.corruption.seeds = n))}
      {@render field('Creeps every (steps)', t.corruption.creep, LIMITS.creep, (n) => (t.corruption.creep = n))}
      {@render field('Loot multiplier', t.corruption.multiplier, LIMITS.multiplier, (n) => (t.corruption.multiplier = n))}
      {#each HIDDEN as c (c)}
        {@render field(`${HIDDEN_NAMES[c]} (weight)`, t.corruption.weights[c], LIMITS.weight, (n) => (t.corruption.weights[c] = n))}
      {/each}
    </fieldset>

    <fieldset>
      <legend>Free clues</legend>
      {#each ZONE_TYPES as z (z)}
        <label class="check">
          <input type="checkbox" checked={t.freeClue[z]} onchange={toggle((on) => (t.freeClue[z] = on))} />
          <span>{ZONE_NAMES[z]} <span class="small">({FREE_CLUE[z].toLowerCase()})</span></span>
        </label>
      {/each}
    </fieldset>
  </div>

  <div class="actions">
    <button class="btn small" onclick={() => play.start()}>New run with these</button>
    <button class="btn small ghost" disabled={!changed} onclick={reset}>Back to the handoff's</button>
  </div>
</details>

<style>
  .tuning {
    margin-top: 1rem;
  }
  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.8rem;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '▸';
    color: var(--gold);
    transition: transform 0.2s;
  }
  details[open] summary::before {
    transform: rotate(90deg);
  }
  .title {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .tag {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0 0.4rem;
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    color: var(--gold-hi);
  }
  .hint {
    font-size: 0.9rem;
    font-style: italic;
    color: var(--muted);
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.9rem 1.2rem;
    margin-top: 0.9rem;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  legend {
    margin-bottom: 0.3rem;
    padding: 0;
    font-family: var(--font-display);
    font-weight: 700;
    color: #e9c8a2;
  }
  .knob {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    font-size: 0.95rem;
  }
  /* The app's text field (app.css .field), narrow, its number in Cinzel. */
  .knob .field {
    flex: none;
    width: 5.5rem;
    padding: 0.3em 0.5em;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--gold-hi);
  }
  .knob input {
    cursor: text;
    user-select: text;
  }
  .check {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .check input {
    cursor: pointer;
    accent-color: var(--gold);
  }
  .small {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .pair {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .pair .field {
    width: 4rem;
  }
  .to {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
