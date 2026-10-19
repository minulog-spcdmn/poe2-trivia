<script lang="ts">
  // The run's header and strip, as the design draws them: the brand's flame
  // (its name beside it on a wide screen), where you are (the node, its kind,
  // the item) and the sound key; then your entry as the scoreboard's pill
  // (the life vessel with its walls every 25, the life a miss just took, the
  // gold and what a reveal just added) and the step plaque. On a short phone
  // the two sit as one bar: the place and the key on a line, you and the step
  // under it.
  import { MediaQuery } from 'svelte/reactivity';
  import { isMuted, setMuted, sfx } from '../lib/sound';
  import type { Run } from './rules';
  import { placeName } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const node = $derived(run.node);
  const place = $derived(s.places[s.at]);
  const share = $derived(Math.max(0, Math.min(1, s.life / s.maxLife)));
  const low = $derived(share <= 0.3);
  /** The life the last wrong submit took, while its marked line stands. */
  const hit = $derived(s.item?.lineMarks ? (s.item.log.submits.at(-1)?.lost ?? 0) : 0);
  /** The gold a named item just paid, shown beside the gold. */
  const gain = $derived(s.phase === 'solved' ? (s.item?.log.gold ?? 0) : 0);
  const lastStep = $derived(run.graph.boss.step);
  const pct = (n: number) => `${(n / s.maxLife) * 100}%`;

  /** A desktop (860 px and up, as the screens): the step plaque moves from the strip to the task row. */
  const wideQ = new MediaQuery('(min-width: 860px)');
  /** The line naming what the player is doing, on a desktop: the item just named, the town or camp they're in. Not at the end (its screen says it). */
  const task = $derived(
    wideQ.current
      ? s.phase === 'solved' && s.item
          ? `Named: ${s.item.log.name}`
          : s.phase === 'item' && s.visit && s.item
            ? `Item ${s.visit.done + 1} of ${s.visit.items} in ${node.name}`
            : s.phase === 'vendor'
              ? node.name
              : ''
      : '',
  );

  let muted = $state(isMuted());
  function toggleSound() {
    setMuted((muted = !muted));
    if (!muted) sfx('click');
  }
</script>

<header class="hdr" aria-label="Where you are">
  <span class="brand"><span class="flame" aria-hidden="true"></span><span class="brand-name">PoE2.Quest</span></span>
  <p class="meta">
    <span class="zone" class:boss={place.kind === 'boss'}>{node.name}</span>
    <span class="kind"
      >{placeName(place)}{#if place.kind === 'zone'}<span class="zw">{' '}zone</span>{/if}{#if s.visit && s.item}<span class="count" class:dup={!!task}>{' '}• Item <span class="num">{s.visit.done + 1}</span> of <span class="num">{s.visit.items}</span></span>{/if}</span
    >
  </p>
  <div class="tools">
    <button class="icon-btn" onclick={toggleSound} title={muted ? 'Unmute' : 'Mute'} aria-label="Sound" aria-pressed={!muted}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z" />{#if muted}<path d="M15 9.5l5 5M20 9.5l-5 5" />{:else}<path d="M14.6 9.3a3.8 3.8 0 0 1 0 5.4M17 7a7 7 0 0 1 0 10" />{/if}</svg
      >
    </button>
  </div>
</header>

{#snippet step()}
  {#if place.kind === 'boss'}
    <div class="stepc boss" role="img" aria-label="The boss, the last step"><span class="k">Last</span><span class="v">Boss</span></div>
  {:else if place.kind === 'camp'}
    <div class="stepc start" role="img" aria-label="The camp, the start of the run"><span class="k">Run</span><span class="v">Start</span></div>
  {:else}
    <div class="stepc" role="img" aria-label="Step {node.step} of {lastStep}"><span class="k">Step</span><span class="v">{node.step}<small>/{lastStep}</small></span></div>
  {/if}
{/snippet}

<div class="strip">
  <div class="chip me" aria-label="You: {s.life} life, {s.gold} gold">
    <span class="avatar" aria-hidden="true">E</span>
    <div class="info">
      <span class="name">Exile</span>
      <div class="holds">
        <span class="vessel" class:low role="meter" aria-label="Life: {s.life} of {s.maxLife}" aria-valuemin={0} aria-valuemax={s.maxLife} aria-valuenow={s.life}>
          <span class="glass">
            <span class="fill" style:width={pct(s.life)}></span>
            {#if hit}<span class="lost" style:left={pct(s.life)} style:width={pct(hit)}></span>{/if}
            <span class="walls"></span>
          </span>
        </span>
        <span class="lifenum" class:low>{s.life}{#if hit}<span class="hitn">−{hit}</span>{/if}</span>
      </div>
    </div>
    <span class="score"><span class="coin" aria-hidden="true"></span>{s.gold}{#if gain}<span class="gain" aria-hidden="true">+{gain}</span>{/if}</span>
  </div>
  {#if !task}{@render step()}{/if}
</div>
{#if task}
  <div class="task" class:reveal={s.phase === 'solved'} class:vend={s.phase === 'vendor'}>
    <p class="sub">{task}</p>
    {@render step()}
  </div>
{/if}

<style>
  .hdr {
    position: relative;
    display: grid;
    /* Phones: the place takes what the flame and the key leave. */
    grid-template-columns: 26px 1fr auto;
    column-gap: 8px;
    align-items: center;
    min-height: 52px;
    margin: -0.75rem -16px 0;
    padding: 4px 12px 4px 16px;
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
  .brand {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 9px;
    font-family: var(--font-title);
    font-weight: 900;
    font-size: 14.4px;
    letter-spacing: 0.14em;
    color: var(--gold);
    text-shadow: 0 0 14px rgba(201, 164, 92, 0.25);
    white-space: nowrap;
  }
  .brand-name {
    display: none;
  }
  /* The brand's flame, as the header's. */
  .flame {
    flex: none;
    width: 13px;
    height: 12px;
    background: var(--unique-hi);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='20 0 400 391'%3E%3Cpath d='M224 390Q255 331 301.0 283.5Q347 236 377 218L407 200L220 -1Q164 31 116.5 82.5Q69 134 50 169L31 204Z'/%3E%3C/svg%3E") center / contain no-repeat;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.7));
  }
  /* The place over its kind, two short lines. */
  .meta {
    margin: 0;
    min-width: 0;
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
  /* On a desktop the task row says which item this is. */
  .count.dup {
    display: none;
  }
  .num {
    color: var(--gold-hi);
  }
  .tools {
    justify-self: end;
    display: flex;
    gap: 6px;
  }
  .icon-btn {
    width: 38px;
    height: 38px;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.35);
    color: var(--muted);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    cursor: pointer;
  }
  .icon-btn:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.3);
  }
  .icon-btn svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .strip {
    position: relative;
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
  .gain {
    margin-left: 3px;
    font-size: 13px;
    color: #a9cf8f;
    text-shadow: 0 0 10px rgba(150, 190, 110, 0.5);
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
    white-space: nowrap;
  }
  .lifenum.low {
    color: #ff9c86;
  }
  .hitn {
    margin-left: 4px;
    color: var(--bad);
    text-shadow: 0 0 8px rgba(224, 85, 63, 0.7);
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
  .stepc.boss .v,
  .stepc.start .v {
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ff9c86;
  }
  .stepc.start .v {
    color: var(--gold-hi);
  }

  /* A short phone (375 by 667): one bar. The place and the key on a 32 px
     line, you and the step under it, the hairline under both. */
  @media (max-width: 699px) and (max-height: 740px) {
    .hdr {
      min-height: 32px;
      padding: 3px 12px 0 16px;
      border-bottom: none;
      grid-template-columns: 16px minmax(0, 1fr) auto;
    }
    .hdr::after {
      display: none;
    }
    .flame {
      width: 16px;
      height: 18px;
    }
    .meta {
      flex-direction: row;
      justify-content: flex-start;
      gap: 8px;
      overflow: hidden;
      white-space: nowrap;
      font-size: 11px;
      letter-spacing: 0.12em;
    }
    .zone {
      flex: none;
    }
    .kind {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      letter-spacing: 0.12em;
    }
    .kind::before {
      content: '•';
      margin-right: 8px;
      color: var(--gold-lo);
    }
    /* One line holds the place and its kind; the item's count is left out, as the design's short bar does, and "zone" too. */
    .count,
    .zw {
      display: none;
    }
    .icon-btn {
      width: 32px;
      height: 32px;
    }
    .icon-btn svg {
      width: 16px;
      height: 16px;
    }
    .strip {
      min-height: 0;
      margin: -0.5rem -16px 0;
      padding: 0 16px 5px;
      border-bottom: 1px solid rgba(125, 99, 51, 0.22);
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0));
    }
    .strip::after {
      content: '';
      position: absolute;
      left: 10%;
      right: 10%;
      bottom: -1px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(224, 138, 68, 0.55), rgba(241, 217, 155, 0.7), rgba(224, 138, 68, 0.55), transparent);
    }
  }

  /* The desktop's task row: the line over the screen, the plaque at the end of it (as the boards: 1140, 1320 and 1240 px wide by the screen). */
  .task {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    height: 50px;
    width: min(100%, 1240px);
    margin: 0 auto;
  }
  .task.reveal {
    width: min(100%, 1320px);
  }
  .task .sub {
    margin: 0;
    text-align: center;
    font-size: 19px;
    line-height: 1.2;
    color: #e6dccb;
  }
  .task .stepc {
    position: absolute;
    right: 0;
    top: 50%;
    translate: 0 -50%;
  }

  @media (min-width: 700px) {
    .hdr {
      grid-template-columns: 1fr auto 1fr;
      min-height: 64px;
      padding: 4px 20px;
    }
    .brand-name {
      display: inline;
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
    .icon-btn {
      width: 34px;
      height: 34px;
    }
    .icon-btn svg {
      width: 16px;
      height: 16px;
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
