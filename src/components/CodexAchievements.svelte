<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Codex } from '../lib/codex';
  import type { DelveRecords } from '../lib/delveRecord';
  import type { Item } from '../lib/game';
  import { ACHIEVEMENTS, GROUPS, standings, summarize, type AchievementStore } from '../lib/achievements';
  import { backdropShadow } from '../lib/backdropShadow';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import AchievementSeal, { METALS } from './AchievementSeal.svelte';

  // The Codex's third page: every achievement, earned or not, by group, each
  // on its seal. The figures round the rune circle count them by metal. What
  // each one needs, and how it is counted, is in lib/achievements.ts.
  let { codex, records, store, items }: { codex: Codex; records: DelveRecords; store: AchievementStore; items: Item[] } = $props();

  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rise = (delay: number) => ({ y: 20, duration: still ? 0 : 700, delay: still ? 0 : delay });

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmt = (n: number) => n.toLocaleString();

  const list = $derived(standings(summarize(codex, records, store.games, items), store));
  const earned = $derived(list.filter((r) => r.earned !== null));
  const groups = $derived(GROUPS.map((g) => ({ ...g, rows: list.filter((r) => r.achievement.group === g.key) })));
  /** Earned and all, by metal (gold first). */
  const metals = $derived(
    ([3, 2, 1] as const).map((tier) => ({
      tier,
      name: tier === 3 ? 'Gold' : tier === 2 ? 'Silver' : 'Copper',
      have: earned.filter((r) => r.achievement.tier === tier).length,
      of: ACHIEVEMENTS.filter((a) => a.tier === tier).length,
    })),
  );
  /** The last earned; of several earned at once, the hardest. */
  const latest = $derived(
    earned.reduce<(typeof earned)[number] | null>(
      (a, b) => (!a || b.earned! > a.earned! || (b.earned === a.earned && b.achievement.tier > a.achievement.tier) ? b : a),
      null,
    ),
  );
  /** The earned share as an arc around the medallion (its circle's circumference is 100). */
  const share = $derived(earned.length / ACHIEVEMENTS.length);
</script>

{#snippet metal(m: (typeof metals)[number])}
  <div class="stat">
    <span class="stat-label" style:color={METALS[m.tier]}>{m.name}</span>
    <span class="stat-value">{m.have}<small> / {m.of}</small></span>
    <span class="stat-note">{m.have === m.of ? 'every one earned' : `${m.of - m.have} still to earn`}</span>
  </div>
{/snippet}

<section class="summary" in:fly={rise(150)}>
  <div class="side">
    {@render metal(metals[0])}
    {@render metal(metals[1])}
  </div>

  <div class="medallion">
    <ArcaneCircle size="100%" strength={0.3} />
    <svg class="progress" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="feats-arc" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stop-color="#fbe6b0" />
          <stop offset="0.5" stop-color="#c9a45c" />
          <stop offset="1" stop-color="#e08a44" />
        </linearGradient>
      </defs>
      <circle class="track" r="80" />
      {#if share > 0}<circle class="arc" r="80" pathLength="100" style:stroke-dasharray="{share * 100} 100" />{/if}
    </svg>
    <div class="medal-text">
      <span class="medal-value">{earned.length}</span>
      <span class="medal-of">of {ACHIEVEMENTS.length}</span>
      <span class="medal-label">earned</span>
    </div>
  </div>

  <div class="side">
    {@render metal(metals[2])}
    <div class="stat">
      <span class="stat-label">Latest</span>
      {#if latest}
        <span class="stat-title">{latest.achievement.title}</span>
        <span class="stat-note">{date(latest.earned!)}</span>
      {:else}
        <span class="stat-value">?</span>
        <span class="stat-note">none earned yet</span>
      {/if}
    </div>
  </div>
</section>

<div class="groups" in:fly={rise(250)}>
  {#each groups as g (g.key)}
    {@const done = g.rows.filter((r) => r.earned !== null).length}
    <section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="feats-{g.key}">
      <header>
        <h2 id="feats-{g.key}">{g.title}</h2>
        <span class="col-label">{done} / {g.rows.length}</span>
      </header>
      <p class="hint">{g.blurb}</p>
      <ul class="feats">
        {#each g.rows as r (r.achievement.id)}
          {@const a = r.achievement}
          {@const p = r.progress}
          {@const won = r.earned !== null}
          {@const hidden = !won && !!a.secret}
          <li class="feat" class:won class:hidden>
            <AchievementSeal sign={a.sign} tier={a.tier} earned={won} secret={!!a.secret} progress={p.have / p.need} size={52} />
            <div class="body">
              <span class="title">{hidden ? 'Secret' : a.title}</span>
              <span class="text">{hidden ? 'Hidden until you earn it.' : a.text}</span>
              {#if won}
                <span class="when">Earned {date(r.earned!)}</span>
              {:else if !hidden && p.need > 1}
                <span class="advance">
                  <span class="meter" aria-hidden="true"><span class="fill" style:width="{Math.min(1, p.have / p.need) * 100}%"></span></span>
                  <span class="count">{p.note ? `${p.note} • ` : ''}{fmt(Math.min(p.have, p.need))} / {fmt(p.need)}</span>
                </span>
              {:else if !hidden && p.note}
                <span class="when">{p.note}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  /* ---- summary: the medallion between four figures, as on the other pages (Codex.svelte) ---- */
  .summary {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1.5rem;
  }
  .side {
    display: flex;
    justify-content: space-evenly;
    gap: 1rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 0;
  }
  .stat-label,
  .medal-label {
    font-family: var(--font-display);
    font-size: 0.74rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .stat-value,
  .medal-value {
    font-family: var(--font-cinzel);
    font-weight: 700;
    line-height: 1.1;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .stat-label {
    margin-bottom: 0.35rem;
  }
  .stat-value {
    font-size: 2.3rem;
    line-height: 1;
    margin-bottom: 0.3rem;
  }
  .stat-value small {
    font-size: 1.1rem;
  }
  /* The latest one's name, where the others have a number. */
  .stat-title {
    font-family: var(--font-display);
    font-size: 1.05rem;
    line-height: 1.2;
    margin-bottom: 0.3rem;
    max-width: 9rem;
    color: var(--gold-hi);
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .stat-note {
    font-size: 0.92rem;
    line-height: 1.3;
    font-style: italic;
    color: var(--muted);
  }
  .medallion {
    grid-column: 2;
    position: relative;
    isolation: isolate;
    width: 240px;
    height: 240px;
    display: grid;
    place-items: center;
  }
  .medallion :global(.arcane) {
    z-index: -1;
  }
  .progress {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    rotate: -90deg;
    overflow: visible;
  }
  .track {
    fill: rgba(8, 6, 4, 0.75);
    stroke: rgba(125, 99, 51, 0.35);
    stroke-width: 6;
  }
  .arc {
    fill: none;
    stroke: url(#feats-arc);
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(224, 138, 68, 0.8));
    animation: fill-arc 1.6s var(--ease-out) 0.4s both;
  }
  @keyframes fill-arc {
    from {
      stroke-dasharray: 0 100;
    }
  }
  .medal-text {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.1;
  }
  .medal-value {
    font-size: 3.2rem;
  }
  .medal-of {
    font-family: var(--font-cinzel);
    font-size: 0.95rem;
    color: var(--gold);
    margin-bottom: 0.3rem;
  }

  /* ---- the groups ---- */
  .groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem;
    align-items: start;
  }
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .panel h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .col-label {
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    color: #d8a26a;
    white-space: nowrap;
  }
  .hint {
    margin: 0 0 0.9rem;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }

  .feats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .feat {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.45rem 0.6rem 0.45rem 0.45rem;
    border-radius: 8px;
    border: 1px solid transparent;
    background: rgba(0, 0, 0, 0.18);
  }
  .feat.won {
    border-color: rgba(201, 164, 92, 0.18);
    background: linear-gradient(90deg, rgba(201, 164, 92, 0.08), rgba(0, 0, 0, 0.15) 70%);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }
  .title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    color: #b9ab94;
  }
  .won .title {
    color: var(--gold-hi);
  }
  .hidden .title {
    color: var(--muted);
    font-style: italic;
  }
  .text {
    font-size: 0.95rem;
    line-height: 1.3;
    color: #a89c87;
  }
  .won .text {
    color: #cbbfa8;
  }
  .when {
    font-size: 0.82rem;
    font-style: italic;
    color: var(--gold-lo);
  }
  .won .when {
    color: #b59a63;
  }
  .advance {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.2rem;
  }
  .meter {
    position: relative;
    display: block;
    flex: 1;
    height: 5px;
    min-width: 40px;
    max-width: 160px;
    border-radius: 3px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: linear-gradient(90deg, #6d4a1c, #c9a45c 70%, #f1d99b);
    box-shadow: 0 0 8px rgba(224, 138, 68, 0.45);
  }
  .count {
    font-family: var(--font-cinzel);
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .summary {
      grid-template-columns: 1fr 1fr;
      row-gap: 1rem;
    }
    .medallion {
      grid-column: 1 / -1;
      grid-row: 1;
      justify-self: center;
    }
    .groups {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 560px) {
    .summary {
      grid-template-columns: 1fr;
      row-gap: 1.75rem;
    }
    .side {
      justify-content: space-around;
    }
    .medallion {
      width: 210px;
      height: 210px;
    }
    .medal-value {
      font-size: 2.8rem;
    }
    .stat-value {
      font-size: 1.9rem;
    }
    .panel {
      padding: 1rem 0.9rem 1.1rem;
    }
    .feat {
      gap: 0.65rem;
    }
  }
</style>
