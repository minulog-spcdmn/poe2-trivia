<script lang="ts">
  // The run's header and strip, as the design draws them: the brand's flame,
  // where you are (the node, its kind, Blood toll), then your entry as
  // the scoreboard's pill (the life vessel with its walls every 25, the life
  // a miss just took, the flask's heal still due, the charges, the gold) and
  // the step plaque.
  import { BLOOD_TOLL, FLASK_STEP, type Run } from './rules';
  import { FLASK_LINE, flaskDue, placeName } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const node = $derived(run.node);
  const place = $derived(s.places[s.at]);
  /** Blood toll, the whole time in the zone (its last reveal too, though the corruption there is gone). */
  const hidden = $derived(s.item ? s.item.hidden : run.hiddenHere());
  const share = $derived(Math.max(0, Math.min(1, s.life / s.maxLife)));
  const low = $derived(share <= 0.3);
  /** The life the last wrong submit took, while its marked line stands; else a Blood toll's, till the first submit. */
  const toll = $derived(s.phase === 'item' && s.item && !s.item.log.submits.length ? s.item.log.toll : 0);
  const hit = $derived(s.item?.lineMarks ? (s.item.log.submits.at(-1)?.lost ?? 0) : toll);
  /** The flask's heal still to come, as life (capped at the vessel's top). */
  const due = $derived(Math.min(s.maxLife - s.life, s.flask.recovering * FLASK_STEP));
  const ticks = $derived(Array.from({ length: Math.ceil(due / FLASK_STEP) }, (_, i) => i));
  const lastStep = $derived(run.graph.boss.step);
  const pct = (n: number) => `${(n / s.maxLife) * 100}%`;
</script>

<header class="hdr" aria-label="Where you are">
  <span class="flame" aria-hidden="true"></span>
  <p class="meta">
    <span class="zone" class:boss={place.kind === 'boss'}>{node.name}</span>
    <span class="kind"
      >{placeName(place)}{#if s.visit && s.item}{' '}• Item <span class="num">{s.visit.done + 1}</span> of <span class="num">{s.visit.items}</span>{/if}{#if hidden}{' '}<span
          class="corrupt"
          role="img"
          aria-label="Blood toll (corruption): each item here costs {BLOOD_TOLL} life when you start it">• Blood toll</span
        >{/if}</span
    >
  </p>
</header>

<div class="strip">
  <div class="chip me" aria-label="You: {s.life} life, {s.gold} gold">
    <span class="avatar" aria-hidden="true">E</span>
    <div class="info">
      <span class="name">Exile</span>
      <div class="holds">
        <span class="vessel" class:low role="meter" aria-label="Life: {s.life} of {s.maxLife}" aria-valuemin={0} aria-valuemax={s.maxLife} aria-valuenow={s.life}>
          <span class="glass">
            <span class="fill" style:width={pct(s.life)}></span>
            {#each ticks as t (t)}<span class="due" style:left={pct(s.life + t * FLASK_STEP)} style:width="calc({pct(Math.min(FLASK_STEP, due - t * FLASK_STEP))} - 1.5px)"></span>{/each}
            {#if hit}<span class="lost" style:left={pct(s.life)} style:width={pct(hit)}></span>{/if}
            <span class="walls"></span>
          </span>
        </span>
        <span class="lifenum" class:low>{s.life}{#if hit}<span class="hitn" title={toll && hit === toll ? 'Blood toll' : undefined}>−{hit}</span>{:else if due}<span class="due">+{due}</span>{/if}</span>
        <span class="flask" role="img" aria-label="Flask: {s.flask.charges} of {s.tuning.flask} charges. Each drink uses one charge." title={FLASK_LINE}>
          <span class="ch">
            {#each Array.from({ length: Math.max(s.flask.charges, s.tuning.flask) }, (_, i) => i) as i (i)}<i class:full={i < s.flask.charges}></i>{/each}
          </span>
        </span>
      </div>
    </div>
    <span class="score"><span class="coin" aria-hidden="true"></span>{s.gold}</span>
  </div>
  {#if place.kind === 'boss'}
    <div class="stepc boss" role="img" aria-label="The boss, the last step"><span class="k">Last</span><span class="v">Boss</span></div>
  {:else}
    <div class="stepc" role="img" aria-label="Step {node.step} of {lastStep}"><span class="k">Step</span><span class="v">{node.step}<small>/{lastStep}</small></span></div>
  {/if}
</div>
<span class="sr">{s.flask.recovering ? flaskDue(s.flask.recovering) : ''}</span>

<style>
  .hdr {
    position: relative;
    display: grid;
    grid-template-columns: 26px 1fr 26px;
    align-items: center;
    min-height: 52px;
    margin: -0.75rem -16px 0;
    padding: 4px 16px;
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
  }
  .hdr::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
  }
  /* The brand's flame, as the header's. */
  .flame {
    width: 13px;
    height: 12px;
    background: var(--unique-hi);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='20 0 400 391'%3E%3Cpath d='M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z'/%3E%3C/svg%3E") center / contain no-repeat;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
  }
  /* The place over its kind, two short lines. */
  .meta {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-family: var(--font-cinzel);
    font-size: 12.5px;
    line-height: 1.1;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-align: center;
    color: var(--muted);
  }
  .zone {
    color: color-mix(in srgb, #d8a26a 75%, var(--gold-hi));
  }
  .zone.boss {
    color: #ff9c86;
  }
  .kind {
    font-size: 10.5px;
    letter-spacing: 0.18em;
  }
  .corrupt {
    color: #f2685a;
  }
  .num {
    color: var(--gold-hi);
  }

  .strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 52px;
  }
  .chip {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 2px 11px 2px 2px;
    --c: #d9a066;
    background: rgba(20, 16, 11, 0.85);
    border: 1px solid var(--c);
    border-radius: 999px;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c), transparent 60%),
      0 0 22px color-mix(in srgb, var(--c), transparent 78%);
  }
  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex: none;
    display: grid;
    place-items: center;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: 13px;
    color: #3a210c;
    background: radial-gradient(circle at 40% 35%, #f4cf9d, #c98a4f 60%, #8a5326);
    box-shadow:
      0 0 0 2px #1a120a,
      0 0 0 3px color-mix(in srgb, var(--c), black 25%);
  }
  .info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-left: 2px;
  }
  .name {
    font-size: 14px;
    line-height: 1.1;
    color: #fff4e0;
  }
  .holds {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .score {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 3px;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: 17px;
    line-height: 1;
    color: var(--gold-hi);
  }
  .coin {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 1.3px solid #d9a45a;
    box-shadow: inset 0 0 0 2.2px #1a120a, inset 0 0 0 3.2px #d9a45a;
  }

  /* The life vessel: the phial's glass (Phial.svelte), drawn out long for a
     life of 100, its gold walls at every 25. */
  .vessel {
    position: relative;
    flex: none;
    width: 86px;
    height: 10px;
    --tip: 5px;
    clip-path: polygon(0 50%, var(--tip) 0, calc(100% - var(--tip)) 0, 100% 50%, calc(100% - var(--tip)) 100%, var(--tip) 100%);
    background: #c9a45c;
    filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9));
  }
  .glass {
    position: absolute;
    inset: 1.2px;
    clip-path: polygon(0 50%, calc(var(--tip) - 0.9px) 0, calc(100% - var(--tip) + 0.9px) 0, 100% 50%, calc(100% - var(--tip) + 0.9px) 100%, calc(var(--tip) - 0.9px) 100%);
    background: linear-gradient(180deg, #0b0806, #150d08);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background:
      linear-gradient(180deg, rgba(255, 226, 214, 0.45) 0, rgba(255, 226, 214, 0) 30%),
      linear-gradient(180deg, #ff8a68 0%, #ec3a48 42%, #9c0f2c 78%, #3c0410 100%);
    box-shadow: 0 0 6px rgba(236, 58, 72, 0.6);
    transition: width 0.4s ease;
  }
  .vessel.low .fill {
    background:
      linear-gradient(180deg, rgba(255, 200, 190, 0.35) 0, rgba(255, 200, 190, 0) 30%),
      linear-gradient(180deg, #f25a52 0%, #c81e38 42%, #6e0820 78%, #2a030c 100%);
  }
  /* Life the flask still has to give: ticks of pale light. */
  .vessel .due {
    position: absolute;
    top: 1.5px;
    bottom: 1.5px;
    background: rgba(255, 190, 170, 0.5);
  }
  /* Life just lost: its light flaring as it pours out. */
  .lost {
    position: absolute;
    top: 0;
    bottom: 0;
    background: linear-gradient(180deg, #ffe4cf, #ff8a68 60%, #ec3a48);
    box-shadow: 0 0 10px rgba(255, 120, 80, 0.9);
    opacity: 0.8;
  }
  .walls {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, transparent calc(25% - 0.5px), #c9a45c calc(25% - 0.5px) calc(25% + 0.5px), transparent calc(25% + 0.5px)),
      linear-gradient(90deg, transparent calc(50% - 0.5px), #c9a45c calc(50% - 0.5px) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
      linear-gradient(90deg, transparent calc(75% - 0.5px), #c9a45c calc(75% - 0.5px) calc(75% + 0.5px), transparent calc(75% + 0.5px));
  }
  .lifenum {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 12px;
    line-height: 1;
    color: #f3e8d2;
    min-width: 18px;
  }
  .lifenum.low {
    color: #ff9c86;
  }
  .lifenum .due {
    margin-left: 3px;
    color: #f2b8a6;
    font-size: 10.5px;
  }
  .hitn {
    margin-left: 4px;
    color: var(--bad);
    text-shadow: 0 0 8px rgba(224, 85, 63, 0.7);
  }
  .flask .ch {
    display: flex;
    gap: 2px;
  }
  .flask .ch i {
    width: 4px;
    height: 9px;
    border-radius: 1px 1px 2px 2px;
    border: 1px solid #6b5230;
    background: #120a08;
  }
  .flask .ch i.full {
    background: linear-gradient(180deg, #ffa585, #d8432e 55%, #7a160e);
    border-color: #b98b52;
    box-shadow: 0 0 4px rgba(224, 85, 63, 0.55);
  }

  /* Where the run stands: a waypoint plaque. */
  .stepc {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 58px;
    height: 44px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: rgba(12, 10, 8, 0.75);
    box-shadow: inset 0 1px 0 rgba(241, 217, 155, 0.06);
  }
  .k {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 8.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    line-height: 1;
  }
  .v {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 19px;
    line-height: 1;
    color: var(--gold-hi);
  }
  .v small {
    font-size: 11px;
    color: var(--muted);
    margin-left: 1px;
  }
  .stepc.boss {
    border-color: #8e4434;
  }
  .stepc.boss .v {
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ff9c86;
  }

  @media (min-width: 700px) {
    .hdr {
      min-height: 60px;
    }
    .meta {
      flex-direction: row;
      gap: 9px;
    }
    .kind::before {
      content: '•';
      margin-right: 9px;
      color: var(--gold-lo);
    }
    .kind {
      font-size: 12.5px;
      letter-spacing: 0.14em;
    }
    .strip {
      justify-content: center;
      gap: 18px;
    }
    .vessel {
      width: 150px;
      height: 12px;
      --tip: 6px;
    }
    .name {
      font-size: 16px;
    }
    .lifenum {
      font-size: 14px;
    }
  }
</style>
