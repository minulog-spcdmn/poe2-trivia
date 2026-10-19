<script lang="ts">
  // The boss's threshold (phase 'boss'), the run's last stop: the rules the
  // corruption still alive added (each with the place its corruption
  // started), what the player brings (life, flask, pack), a miss's cost, and
  // the one way on. Phones dock the
  // stakes and Face the boss at the foot; wide screens set the rules beside
  // what the player has, the stakes and the button under both.
  import { backdropShadow } from '../lib/backdropShadow';
  import { BOSS_MOD_NAMES, PACK_STACKS, SUPPLY_NAMES, type Run } from './rules';
  import { GRAPH } from './map';
  import { BOSS_MOD_DOES, FLASK_EACH, SHORT, bossReached, bossRuleFrom, chargesLeft } from './words';
  import Glyph from './Glyph.svelte';
  import Numbered from './Numbered.svelte';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const items = $derived(s.visit?.items ?? 0);
  const [lo, hi] = $derived(run.missRange());
  /** The corruptions that reached the boss, in the order seeded (s.bossMods' order), each with where it started. */
  const reached = $derived(
    s.fronts
      .filter((f) => f.alive)
      .map((f) => {
        const seed = s.log.fronts.seeds[f.id]?.node;
        return { rule: f.rule, from: seed ? (GRAPH.byId.get(seed)?.name ?? seed) : null };
      }),
  );
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / s.maxLife) * 100))}%`;
  const max = $derived(s.tuning.flask);
</script>

<div class="threshold">
  <header class="screen-title">
    <p class="kicker">The boss</p>
    <h1 class="boss">{run.node.name}</h1>
    <p class="sub">Name all <span class="n">{items}</span> items to win.</p>
  </header>

  <div class="cols">
    <div class="col">
      <section class="panel blk" aria-labelledby="mods-h" use:backdropShadow={{ fill: 'linear' }}>
        <div class="hd">
          <h2 id="mods-h">Made harder by the corruption</h2>
          {#if reached.length}<span class="aside"><Numbered text={bossReached(reached.length)} /></span>{/if}
        </div>
        {#if reached.length}
          <ul class="mods">
            {#each reached as r (r.rule)}
              <li>
                <span class="seal" aria-hidden="true"><Glyph of="corrupt" /></span>
                <div>
                  <p><b>{BOSS_MOD_NAMES[r.rule]}</b> • <Numbered text={BOSS_MOD_DOES[r.rule]} /></p>
                  {#if r.from}<p class="from">{bossRuleFrom(r.from)}</p>{/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="none">No corruption reached the boss.</p>
        {/if}
      </section>
    </div>

    <div class="col">
      <section class="panel blk" aria-labelledby="have-h" use:backdropShadow={{ fill: 'linear' }}>
        <div class="hd"><h2 id="have-h">What you have</h2></div>
        <div class="have">
          <div class="hrow">
            <span class="hl">Life</span>
            <span class="hv">
              <span class="vessel" class:low={s.life <= lo} role="meter" aria-label="Life: {s.life} of {s.maxLife}" aria-valuemin={0} aria-valuemax={s.maxLife} aria-valuenow={s.life}><i style:width={pct(s.life)}></i></span>
              <span><span class="n">{s.life}</span> of <span class="n">{s.maxLife}</span></span>
            </span>
          </div>
          <div class="hrow">
            <span class="hl">Flask</span>
            <span class="hv">
              <span class="pips" aria-hidden="true">{#each Array.from({ length: max }, (_, k) => k) as k (k)}<i class:full={k < s.flask.charges}></i>{/each}</span>
              <span><Numbered text={chargesLeft(s.flask.charges)} />{#if s.flask.charges}{' '}<span class="m">• <Numbered text={FLASK_EACH} /></span>{/if}</span>
            </span>
          </div>
          <div class="hrow stack">
            <span class="hl">Pack</span>
            <ul class="pack" aria-label="Your pack">
              {#each Array.from({ length: PACK_STACKS }, (_, i) => i) as i (i)}
                {@const st = s.pack[i]}
                <li>
                  {#if st}
                    <span class="slot" aria-label="{SUPPLY_NAMES[st.supply]}: {st.n} in your pack">
                      <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span><span class="lbl" aria-hidden="true">{SHORT[st.supply]}</span><span class="cnt" aria-hidden="true">{st.n}</span>
                    </span>
                  {:else}
                    <span class="slot empty" aria-label="Empty space"></span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>

  <div class="go dock bdock">
    <div class="stakes">
      <div class="row">Miss: <b>{lo}</b> to <b>{hi}</b> life</div>
      {#if s.life <= lo}
        <div class="row warn">Low life: one miss ends the run</div>
      {:else}
        <div class="row">No loot at the boss</div>
      {/if}
    </div>
    <button class="btn primary big" onclick={() => run.face()}>Face the boss</button>
  </div>
</div>

<style>
  .threshold {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h1.boss {
    color: #ff9c86;
  }
  .cols,
  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* A framed block, its heading in small capitals with a note beside it. */
  .blk {
    padding: 12px;
  }
  .hd {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 2px 8px;
    margin: 0 0 8px;
  }
  .hd h2 {
    margin: 0;
    font-family: var(--font-cinzel);
    font-size: 11px;
    letter-spacing: 0.2em;
  }
  .aside {
    font-size: 13.5px;
    color: var(--muted);
  }
  p {
    margin: 0;
  }

  .mods p {
    font-size: 16px;
    line-height: 1.25;
    color: #e6dccb;
  }
  .mods b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: #f0a68c;
  }

  .mods {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .mods li {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    column-gap: 10px;
    align-items: center;
    padding: 7px 0;
    border-top: 1px solid rgba(125, 99, 51, 0.16);
  }
  .mods li:first-child {
    border-top: 0;
    padding-top: 2px;
  }
  .mods p {
    font-size: 15.5px;
  }
  .mods p.from {
    margin-top: 1px;
    font-size: 13.5px;
    color: var(--muted);
  }
  /* The corruption's seal: a Vaal Orb's swirl in a red ring. */
  .seal {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    box-sizing: border-box;
    padding: 4px;
    border-radius: 50%;
    border: 1px solid rgba(224, 85, 63, 0.75);
    color: #f0a68c;
  }
  .none {
    font-size: 15.5px;
    font-style: italic;
    color: var(--muted);
  }

  /* What you have: a label in small capitals beside its value. */
  .have {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hrow {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    column-gap: 10px;
    align-items: center;
  }
  .hrow.stack {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 6px;
  }
  .hl {
    font-family: var(--font-cinzel);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .hv {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 15px;
    line-height: 1.25;
    color: #e6dccb;
  }
  .hv .m {
    font-size: 13.5px;
    color: var(--muted);
  }
  .hv .m :global(.n) {
    color: var(--muted);
  }
  .vessel {
    position: relative;
    flex: none;
    width: 110px;
    height: 9px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 0 0 1px rgba(125, 99, 51, 0.5);
    overflow: hidden;
  }
  .vessel i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(180deg, #ff8a68 0%, #ec3a48 42%, #9c0f2c 100%);
  }
  .vessel.low i {
    background: linear-gradient(180deg, #f25a52 0%, #c81e38 42%, #6e0820 100%);
  }
  .pips {
    flex: none;
    display: inline-flex;
    gap: 3px;
  }
  .pips i {
    width: 7px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid rgba(201, 164, 92, 0.6);
  }
  .pips i.full {
    background: #c98a3c;
    border-color: #e0b070;
  }

  /* The pack, as it stands at the boss. */
  .pack {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 5px;
  }
  .slot {
    position: relative;
    height: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid rgba(201, 164, 92, 0.75);
    border-radius: 4px;
    color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.08),
      0 0 10px rgba(201, 164, 92, 0.18);
  }
  .slot.empty {
    background: rgba(0, 0, 0, 0.3);
    border: 1px dashed var(--line);
    box-shadow: none;
  }
  .ic {
    width: 18px;
    height: 18px;
  }
  .lbl {
    font-size: 11px;
    line-height: 1;
    color: #e9c8a2;
  }
  .cnt {
    position: absolute;
    top: -6px;
    right: -4px;
    display: grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    box-sizing: border-box;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 10.5px;
    line-height: 1;
    color: var(--gold-hi);
    background: #0c0a08;
    border: 1px solid var(--gold-lo);
    border-radius: 8px;
  }

  /* The stakes beside Face the boss. */
  .go.bdock {
    flex-wrap: nowrap;
    align-items: center;
  }
  .stakes {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.2;
  }
  .stakes .row {
    font-size: 15px;
    color: #cfc4b2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stakes b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 14.5px;
    color: #f0a68c;
  }
  .stakes .warn {
    font-size: 13.5px;
    color: #ff9c86;
  }
  @media (max-width: 640px) {
    .bdock .btn.primary {
      flex: none;
      min-width: 132px;
      padding: 0.95em 1.2em;
      font-size: 14px;
    }
  }

  /* Wide screens: the rules beside what you have, the stakes and the button under both. */
  @media (min-width: 900px) {
    .cols {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 520px));
      justify-content: center;
      column-gap: 32px;
      align-items: start;
    }
    .col {
      gap: 14px;
    }
    .mods p {
      font-size: 16.5px;
    }
    .mods p.from {
      font-size: 14.5px;
    }
    .hrow {
      grid-template-columns: 64px minmax(0, 1fr);
    }
    .hv {
      font-size: 16px;
    }
    .vessel {
      width: 180px;
    }
    .slot {
      height: 52px;
    }
    .ic {
      width: 20px;
      height: 20px;
    }
    .go.bdock {
      justify-content: center;
      gap: 24px;
      padding-top: 14px;
    }
    .stakes {
      flex: none;
      text-align: right;
    }
    .stakes .row {
      font-size: 17px;
    }
    .bdock .btn.primary {
      min-width: 220px;
    }
  }
</style>
