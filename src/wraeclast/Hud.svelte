<script lang="ts">
  // The run's bar: where it stands, life (a bar and its number), the flask's
  // charges and its heal still to come, gold, and how full the pack is.
  import { FLASK_STEP, PACK_SLOTS, type Run } from './rules';
  import { FLASK_LINE, whereOf } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);

  /** The item the bar speaks for: the open one, the last one at the end, or the next. */
  const n = $derived(s.item?.n ?? (s.phase === 'end' ? s.done - 1 : s.done));
  const where = $derived(s.phase === 'camp' ? { zone: 'Camp', k: 0, of: 0 } : s.phase === 'town' ? { zone: 'Town', k: 0, of: 0 } : whereOf(run, Math.max(0, n)));
  const share = $derived(Math.max(0, Math.min(1, s.life / s.maxLife)));
</script>

<header class="hud" aria-label="The run">
  <p class="where">
    <span class="kicker">{where.zone}</span>
    {#if where.of && s.phase !== 'travel'}<span class="of">Item <span class="n">{where.k}</span> of <span class="n">{where.of}</span></span>{/if}
  </p>
  <div class="stats">
    <div class="life" class:low={share <= 0.35}>
      <span class="label">Life</span>
      <span class="bar" role="meter" aria-label="Life" aria-valuemin={0} aria-valuemax={s.maxLife} aria-valuenow={s.life}><span class="fill" style:width="{share * 100}%"></span></span>
      <span class="n">{s.life}</span>
    </div>
    <div class="flask" title="Flask: {FLASK_LINE}">
      <span class="label">Flask</span>
      <span class="sr">{s.flask.charges} {s.flask.charges === 1 ? 'charge' : 'charges'}</span>
      <span class="pips" aria-hidden="true">
        {#each Array.from({ length: Math.max(s.flask.charges, s.tuning.flask) }, (_, i) => i) as i (i)}
          <span class="pip" class:full={i < s.flask.charges}></span>
        {/each}
      </span>
      {#if s.flask.recovering}<span class="heal"><span class="n">+{FLASK_STEP}</span> × <span class="n">{s.flask.recovering}</span></span>{/if}
    </div>
    <div class="gold">
      <span class="label">Gold</span>
      <span class="n">{s.gold}</span>
    </div>
    <div class="pack">
      <span class="label">Pack</span>
      <span><span class="n">{s.pack.length}</span> of <span class="n">{PACK_SLOTS}</span></span>
    </div>
  </div>
</header>

<style>
  .hud {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.55rem 0.85rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: rgba(12, 10, 8, 0.78);
  }
  .where {
    margin: 0;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  .of {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1.4rem;
  }
  .label {
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .stats > div {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .life {
    flex: 1 1 14rem;
  }
  .bar {
    position: relative;
    flex: 1;
    height: 8px;
    border: 1px solid #4a2219;
    border-radius: 2px;
    background: #140a07;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, #6e1c12, #c8402c);
    transition: width 0.5s var(--ease-out);
  }
  .life .n {
    min-width: 2.2em;
    text-align: right;
  }
  .life.low .n {
    color: #ff9c86;
  }
  .pips {
    display: flex;
    gap: 4px;
  }
  .pip {
    width: 9px;
    height: 13px;
    border-radius: 3px 3px 5px 5px;
    border: 1px solid #6b3a2a;
    background: #1a0d09;
  }
  .pip.full {
    border-color: #c0503b;
    background: linear-gradient(180deg, #e0553f, #7a1f14);
  }
  .heal {
    font-size: 0.85rem;
    color: #d6e8c0;
  }
  .heal .n {
    color: #a9cf8f;
  }
  @media (max-width: 640px) {
    .life {
      flex-basis: 100%;
    }
  }
</style>
