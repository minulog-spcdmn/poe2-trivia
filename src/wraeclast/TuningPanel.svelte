<script lang="ts">
  // The tuning panel, collapsed at the page's foot: the numbers the next run
  // starts with, kept in storage as they change, and in each run's log.
  import { backdropShadow } from '../lib/backdropShadow';
  import { DEFAULT_TUNING, DEPTHS, SUPPLIES, SUPPLY_NAMES, type Range } from './rules';
  import { LIMITS, isDefault } from './tuning';
  import { play } from './play.svelte';
  import { DEPTH_NAME } from './words';

  /** Whether it's open: from the start on the QA desk's bench, collapsed on the page till tapped. */
  let { open = $bindable(false) }: { open?: boolean } = $props();
  const t = $derived(play.tuning);
  const changed = $derived(!isDefault(t));
  const BOARD_NAMES = { zone: 'A zone', duel: 'The duel' } as const;
  const BOARDS = ['zone', 'duel'] as const;
  const HIT_NAMES = ['No supply', 'One kind', 'Two kinds or more'] as const;

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
      {@render field('A town heals (life, first entry)', t.townHeal, LIMITS.townHeal, (n) => (t.townHeal = n))}
    </fieldset>

    <fieldset>
      <legend>Zones by depth</legend>
      {#each DEPTHS as d (d)}
        {@render field(`${DEPTH_NAME[d]}: rolls (weight)`, t.depthRoll[d], LIMITS.depthRoll, (n) => (t.depthRoll[d] = n))}
        {@render field(`${DEPTH_NAME[d]}: pays (gold)`, t.pay[d], LIMITS.pay, (n) => (t.pay[d] = n))}
        {@render field(`${DEPTH_NAME[d]}: a miss (life)`, t.missCost[d], LIMITS.missCost, (n) => (t.missCost[d] = n))}
      {/each}
    </fieldset>

    <fieldset>
      <legend>Waystone mods</legend>
      {@render field('A zone rolls one 1 in', t.modOdds, LIMITS.modOdds, (n) => (t.modOdds = n))}
      {@render field('A mod adds (gold)', t.modGold, LIMITS.modGold, (n) => (t.modGold = n))}
      {@render field('Extra damage adds to a miss', t.modDamage, LIMITS.modDamage, (n) => (t.modDamage = n))}
    </fieldset>

    <fieldset>
      <legend>The Seed and the duel</legend>
      {@render field('The Seed: life at the start', t.seedLife, LIMITS.seedLife, (n) => (t.seedLife = n))}
      {@render field('The Seed: hit at the start', t.seedHit, LIMITS.seedHit, (n) => (t.seedHit = n))}
      {@render field('Life a zone adds', t.seedGrowth, LIMITS.seedGrowth, (n) => (t.seedGrowth = n))}
      {@render field('Hit +1 every (zones)', t.seedHitEvery, LIMITS.seedHitEvery, (n) => (t.seedHitEvery = n))}
      {#each HIT_NAMES as name, i (name)}
        {@render field(`Your hit: ${name.toLowerCase()}`, t.duelHit[i], LIMITS.duelHit, (n) => (t.duelHit[i] = n))}
      {/each}
      {@render field('A wrong answer (life)', t.duelMiss, LIMITS.duelMiss, (n) => (t.duelMiss = n))}
    </fieldset>

    <fieldset>
      <legend>Boons</legend>
      {@render field('Honoured Challenger heals', t.challengerHeal, LIMITS.challengerHeal, (n) => (t.challengerHeal = n))}
      {@render field('Earned Honour heals', t.honourHeal, LIMITS.honourHeal, (n) => (t.honourHeal = n))}
      {@render field('Sanguine Vial takes (Seed life)', t.vialLife, LIMITS.vialLife, (n) => (t.vialLife = n))}
      {@render field('Upward Path adds (gold a step)', t.upwardGold, LIMITS.upwardGold, (n) => (t.upwardGold = n))}
      {@render field('Dagger and Blade multiply a hit by', t.boonHit, LIMITS.boonHit, (n) => (t.boonHit = n))}
    </fieldset>

    <fieldset>
      <legend>Boards</legend>
      {#each BOARDS as b (b)}
        {@render field(`${BOARD_NAMES[b]}: tiles`, t.tiles[b], LIMITS.tiles, (n) => (t.tiles[b] = n))}
        {@render range(`${BOARD_NAMES[b]}: decoy names`, t.names[b], LIMITS.names)}
      {/each}
      <label class="check">
        <input type="checkbox" checked={t.marks === 'gold'} onchange={setMarks} />
        <span>Gold marks only (no silver or struck)</span>
      </label>
      <p class="small">Decoy names are whole names of real items that the tiles can also spell (the answer's look-alikes, or the closest others of its category). Each item rolls its total within 3 either way, with at least 5 decoys; of, the, and and 2 or 3 possessive tiles come on top, up to 36 tiles.</p>
    </fieldset>

    <fieldset>
      <legend>Prices (gold, one at a time)</legend>
      {#each SUPPLIES as w (w)}
        {@render field(SUPPLY_NAMES[w], t.price[w], LIMITS.price, (n) => (t.price[w] = n))}
      {/each}
    </fieldset>

    <fieldset>
      <legend>The art (patches)</legend>
      {@render field('Seeds a side', t.seeds, LIMITS.seeds, (n) => (t.seeds = n))}
      {@render field('A Torch burns in', t.torch, LIMITS.torch, (n) => (t.torch = n))}
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
