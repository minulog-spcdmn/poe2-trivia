<script lang="ts">
  // The boss's threshold (phase 'boss'), the run's last stop: its rule, its
  // items, the rules the corruption still alive added, a miss's cost, and
  // the one way on. (A zone opens its first item at once; a Well is a beat on
  // the map.)
  import { backdropShadow } from '../lib/backdropShadow';
  import { BOSS_MOD_NAMES, type Run } from './rules';
  import { BOSS_MOD_DOES, BOSS_RULE } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const items = $derived(s.visit?.items ?? 0);
  const [lo, hi] = $derived(run.missRange());
</script>

<div class="threshold">
  <header class="screen-title">
    <p class="kicker">The boss</p>
    <h1 class="boss">{run.node.name}</h1>
    <p class="sub">{BOSS_RULE}. Name all <span class="n">{items}</span> items to win.</p>
  </header>

  <section class="panel terms" aria-label="The boss" use:backdropShadow={{ fill: 'linear' }}>
    <dl>
      <div><dt>Rule</dt><dd>{BOSS_RULE}</dd></div>
      <div><dt>A miss costs</dt><dd><span class="n">{lo}</span> to <span class="n">{hi}</span> life</dd></div>
    </dl>
    <h2 class="mods-h">Made harder by the corruption</h2>
    {#if s.bossMods.length}
      <ul class="mods">
        {#each s.bossMods as m (m)}
          <li><span class="k">{BOSS_MOD_NAMES[m]}</span> • {BOSS_MOD_DOES[m]}</li>
        {/each}
      </ul>
    {:else}
      <p class="none">No corruption reached the boss.</p>
    {/if}
    {#if s.life <= lo}
      <p class="warn">Low life: one miss ends the run</p>
    {/if}
  </section>

  <div class="go dock">
    <button class="btn primary big" onclick={() => run.face()}>Face the boss</button>
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
