<script lang="ts">
  // A zone's threshold, on the way into it: which zone, its free clue and its
  // rule (or the boss's Silent rule and how each of its items starts), and
  // the one way on.
  import { backdropShadow } from '../lib/backdropShadow';
  import { BOSS_ITEMS, ITEMS_IN_RUN, ZONE_ITEMS, ZONE_NAMES, ZONES, type Run } from './rules';
  import { BOSS_RULE, bossStep, zoneLines } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const zoneNo = $derived(run.zoneNo);
  const boss = $derived(zoneNo > ZONES);
  const zone = $derived(run.zoneType(zoneNo));
  const lines = $derived(zone ? zoneLines(run, zone) : null);
  const [lo, hi] = $derived(run.missRange());
</script>

<div class="travel">
  <header class="screen-title">
    <p class="kicker">{boss ? `Items ${ZONES * ZONE_ITEMS + 1} to ${ITEMS_IN_RUN}` : `Zone ${zoneNo} of ${ZONES}`}</p>
    <h1 class:boss>{boss ? 'The boss' : ZONE_NAMES[zone!]}</h1>
    <p class="sub">{boss ? `${BOSS_RULE}. Three items, ten names each, and no loot.` : `Three items to name. A right answer drops loot; a miss costs life.`}</p>
  </header>

  <section class="panel terms" aria-label={boss ? 'The boss' : 'The zone'} use:backdropShadow={{ fill: 'linear' }}>
    {#if lines}
      <dl>
        <div><dt>Free clue</dt><dd>{lines.free}</dd></div>
        <div><dt>Rule</dt><dd>{lines.rule}</dd></div>
        <div><dt>A miss costs</dt><dd><span class="n">{lo}</span> to <span class="n">{hi}</span> life</dd></div>
        <div><dt>Loot</dt><dd><span class="n">{s.tuning.loot.deal}</span> cards for a right answer, one fewer a miss</dd></div>
      </dl>
    {:else}
      <ol class="steps">
        {#each Array.from({ length: BOSS_ITEMS }, (_, k) => k) as k (k)}
          <li><span class="k">Item <span class="n">{k + 1}</span></span> {bossStep(run, k)}</li>
        {/each}
      </ol>
      <p class="cost">A miss costs <span class="n">{lo}</span> to <span class="n">{hi}</span> life.{#if s.life <= lo}<span class="warn"> At <span class="n">{s.life}</span> life, a miss ends the run.</span>{/if}</p>
    {/if}
  </section>

  <div class="go dock">
    <button class="btn primary big" onclick={() => run.enter()}>{boss ? 'Face the boss' : 'Enter the zone'}</button>
  </div>
</div>

<style>
  .travel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
  }
  .travel > .go {
    align-self: stretch;
  }
  h1.boss {
    color: #ff9c86;
  }
  .terms {
    width: min(100%, 34rem);
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
  dt {
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
  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .k {
    font-family: var(--font-display);
    font-weight: 700;
    color: #e9c8a2;
  }
  .cost {
    margin: 0.7rem 0 0;
    color: var(--muted);
  }
  .warn {
    color: #ff9c86;
  }
  @media (max-width: 420px) {
    dl > div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.1rem;
    }
  }
</style>
