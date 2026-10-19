<script lang="ts">
  // On arriving at a node that holds items (phase 'zone') or at a Well
  // (phase 'well'): where the player is, and the one way on. A zone shows its
  // type, free clue and rule, a miss's cost, the loot a right answer deals and
  // how many items wait; a corrupted one deals a card face down that turns up
  // to show its hidden modifier (DealtCard's deal and turn). The boss shows
  // its Silent rule, its items and the modifiers the live fronts gave it. A
  // Well refills the flask and heals no life.
  import { onMount } from 'svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { motion } from '../lib/motion.svelte';
  import DealtCard from './DealtCard.svelte';
  import { GRAPH } from './map';
  import { BOSS_MOD_NAMES, HIDDEN_NAMES, ZONE_NAMES, type Run } from './rules';
  import { BOSS_MOD_DOES, BOSS_RULE, HIDDEN_DOES, plural, zoneLines } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const node = $derived(GRAPH.byId.get(s.at)!);
  const place = $derived(s.places[s.at]);
  const well = $derived(s.phase === 'well');
  const boss = $derived(!well && place.kind === 'boss');
  const zone = $derived(!well && place.kind === 'zone' ? place.type : null);
  const lines = $derived(zone ? zoneLines(run, zone) : null);
  const items = $derived(s.visit?.items ?? 0);
  const [lo, hi] = $derived(run.missRange());
  const deal = $derived(run.dealHere());
  const hidden = $derived(run.hiddenHere());
  const multiplier = $derived(s.tuning.corruption.multiplier);

  // The hidden modifier's card is dealt face down and turns up once it has
  // landed (at once when things are held still).
  const TURN_AT = 1000;
  let down = $state(!motion.still);
  onMount(() => {
    if (!down) return;
    const t = setTimeout(() => (down = false), TURN_AT);
    return () => clearTimeout(t);
  });
</script>

<div class="threshold">
  <header class="screen-title">
    <p class="kicker">{well ? 'Well' : boss ? 'The boss' : `${ZONE_NAMES[zone!]} zone`}</p>
    <h1 class:boss>{node.name}</h1>
    <p class="sub">
      {#if well}The Well refills your flask.
      {:else if boss}{BOSS_RULE}. No loot; beat it to win the run.
      {:else}{plural(items, 'item')} to name. A right answer deals loot; a miss costs life.{/if}
    </p>
  </header>

  {#if well}
    <section class="panel terms" aria-label="The Well" use:backdropShadow={{ fill: 'linear' }}>
      <dl>
        <div><dt>Flask</dt><dd><span class="n">{s.flask.charges}</span> of <span class="n">{s.tuning.flask}</span> charges</dd></div>
        <div><dt>Life</dt><dd><span class="n">{s.life}</span> of <span class="n">{s.maxLife}</span>; the Well heals no life</dd></div>
      </dl>
    </section>
  {:else}
    <div class="cols" class:omened={!!hidden}>
      {#if hidden}
        <section class="omen" aria-labelledby="omen-h">
          <h2 id="omen-h">Corrupted</h2>
          <div class="card">
            <DealtCard
              mark="corrupt"
              title={HIDDEN_NAMES[hidden]}
              line={HIDDEN_DOES[hidden]}
              label="Hidden modifier: {HIDDEN_NAMES[hidden]}. {HIDDEN_DOES[hidden]}"
              i={0}
              n={1}
              unid
              {down}
              disabled
            />
          </div>
          <p class="note">
            Corruption hides a modifier here, and pays for it: {multiplier === 2 ? 'loot is doubled' : `loot is ${multiplier} times`}. Name every item to cleanse the zone.
          </p>
        </section>
      {/if}

      <section class="panel terms" aria-label={boss ? 'The boss' : 'The zone'} use:backdropShadow={{ fill: 'linear' }}>
        <dl>
          {#if lines}
            <div><dt>Free clue</dt><dd>{lines.free}</dd></div>
            <div><dt>Rule</dt><dd>{lines.rule}</dd></div>
          {:else}
            <div><dt>Rule</dt><dd>{BOSS_RULE}</dd></div>
          {/if}
          <div><dt>Items</dt><dd><span class="n">{items}</span> to name</dd></div>
          <div><dt>A miss costs</dt><dd><span class="n">{lo}</span> to <span class="n">{hi}</span> life</dd></div>
          {#if !boss}
            <div><dt>Loot</dt><dd>{plural(deal, 'card')} for a right answer, one fewer a miss</dd></div>
          {/if}
        </dl>
        {#if boss}
          <h2 class="mods-h">Modifiers</h2>
          {#if s.bossMods.length}
            <ul class="mods">
              {#each s.bossMods as m (m)}
                <li><span class="k">{BOSS_MOD_NAMES[m]}</span> {BOSS_MOD_DOES[m]}</li>
              {/each}
            </ul>
          {:else}
            <p class="none">No corruption reached the boss.</p>
          {/if}
        {/if}
        {#if s.life <= lo}
          <p class="warn">At <span class="n">{s.life}</span> life, a miss ends the run.</p>
        {/if}
      </section>
    </div>
  {/if}

  <div class="go dock">
    {#if well}
      <button class="btn primary big" onclick={() => run.leave()}>Go on</button>
    {:else}
      <button class="btn primary big" onclick={() => run.enter()}>{boss ? 'Face the boss' : 'Enter the zone'}</button>
    {/if}
  </div>
</div>

<style>
  .threshold {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
  }
  .threshold > .go {
    align-self: stretch;
  }
  h1.boss {
    color: #ff9c86;
  }
  .cols {
    width: min(100%, 34rem);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  @media (min-width: 701px) {
    .cols.omened {
      width: min(100%, 52rem);
      flex-direction: row;
      align-items: center;
    }
    .cols.omened .omen {
      flex: 0 0 15rem;
    }
    .cols.omened .terms {
      flex: 1;
    }
  }
  .terms {
    width: min(100%, 34rem);
  }
  .cols .terms {
    width: auto;
  }
  .omen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .omen h2 {
    margin: 0;
    color: #f2846e;
  }
  .omen .card {
    width: 100%;
  }
  .note {
    margin: 0;
    text-align: center;
    font-style: italic;
    line-height: 1.35;
    color: #f2a08e;
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  dl > div {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: baseline;
  }
  dt,
  .mods-h {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  dd {
    margin: 0;
    color: #e9c8a2;
  }
  .mods-h {
    margin: 0.9rem 0 0.4rem;
    font-weight: 400;
  }
  .mods {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: #e9c8a2;
  }
  .mods .k {
    font-family: var(--font-display);
    font-weight: 700;
    color: #ff9c86;
  }
  .none {
    margin: 0;
    font-style: italic;
    color: var(--muted);
  }
  .warn {
    margin: 0.8rem 0 0;
    color: #ff9c86;
  }
  @media (max-width: 420px) {
    dl > div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.1rem;
    }
  }
</style>
