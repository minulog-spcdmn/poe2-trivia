<script lang="ts">
  // The tuning panel, collapsed at the page's foot: the numbers the next run
  // starts with, kept in storage as they change, and in each run's log.
  import { BOARD_SIZES, DEFAULT_TUNING, SUPPLIES, SUPPLY_NAMES, ZONE_TYPES, ZONE_NAMES, type Section } from './rules';
  import { LIMITS, isDefault } from './tuning';
  import { play } from './play.svelte';
  import { SECTION_NAMES } from './markup';
  import { FREE_CLUE } from './words';

  const t = $derived(play.tuning);
  const SECTIONS: Section[] = ['early', 'late', 'boss'];
  const changed = $derived(!isDefault(t));

  /** A number field's value, kept whole and in range (a blank or a stray value leaves the number as it was). */
  function num(value: string, [lo, hi]: readonly [number, number], set: (n: number) => void) {
    const n = Math.round(Number(value));
    if (value.trim() === '' || !Number.isFinite(n)) return;
    set(Math.max(lo, Math.min(hi, n)));
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
    <input class="field" type="number" inputmode="numeric" min={limits[0]} max={limits[1]} step="1" {value} onchange={(e) => num(e.currentTarget.value, limits, set)} />
  </label>
{/snippet}

<details class="panel tuning">
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
    </fieldset>

    <fieldset>
      <legend>Miss cost (life)</legend>
      {#each SECTIONS as sec (sec)}
        {@render field(SECTION_NAMES[sec], t.missCost[sec], LIMITS.missCost, (n) => (t.missCost[sec] = n))}
      {/each}
    </fieldset>

    <fieldset>
      <legend>Base reward (gold)</legend>
      {@render field(SECTION_NAMES.early, t.reward.early, LIMITS.reward, (n) => (t.reward.early = n))}
      {@render field(SECTION_NAMES.late, t.reward.late, LIMITS.reward, (n) => (t.reward.late = n))}
    </fieldset>

    <fieldset>
      <legend>Prices (gold)</legend>
      {#each SUPPLIES as sup (sup)}
        {@render field(SUPPLY_NAMES[sup], t.price[sup], LIMITS.price, (n) => (t.price[sup] = n))}
      {/each}
    </fieldset>

    <fieldset>
      <legend>Names on the board</legend>
      {#each SECTIONS as sec (sec)}
        <label class="knob">
          <span>{SECTION_NAMES[sec]}</span>
          <select
            class="field"
            value={t.board[sec]}
            onchange={(e) => {
              t.board[sec] = Number(e.currentTarget.value) as (typeof BOARD_SIZES)[number];
              play.saveTuning();
            }}
          >
            {#each BOARD_SIZES as size (size)}<option value={size}>{size}</option>{/each}
          </select>
        </label>
      {/each}
      <p class="small">Blight adds 2, up to 10. The engine deals 4, 6, 8 or 10.</p>
    </fieldset>

    <fieldset>
      <legend>Free clues</legend>
      {#each ZONE_TYPES as z (z)}
        <label class="check">
          <input
            type="checkbox"
            checked={t.freeClue[z]}
            onchange={(e) => {
              t.freeClue[z] = e.currentTarget.checked;
              play.saveTuning();
            }}
          />
          <span>{ZONE_NAMES[z]} <span class="small">({FREE_CLUE[z].toLowerCase()})</span></span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>The board</legend>
      <label class="check">
        <input
          type="checkbox"
          checked={t.wordCount}
          onchange={(e) => {
            t.wordCount = e.currentTarget.checked;
            play.saveTuning();
          }}
        />
        <span>Say how many words the name has</span>
      </label>
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
  .knob select {
    cursor: pointer;
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
</style>
