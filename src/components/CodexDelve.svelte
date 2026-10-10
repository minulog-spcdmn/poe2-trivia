<script lang="ts">
  import { engine } from '../lib/session.svelte';
  import type { Codex } from '../lib/codex';
  import {
    CATEGORY_MIN,
    ITEM_MIN,
    MIN_RUNS,
    ZONE_MIN_RUNS,
    answersByRun,
    answersFor,
    answersOf,
    delveDeaths,
    delveSummary,
    findStats,
    mergeClimbs,
    milestones,
    otherRules,
    runStory,
    runsOf,
    zoneOf,
    zoneRisks,
    zonesReached,
    type DelveKind,
    type FindStats,
  } from '../lib/codexStats';
  import { climbOf, isTogether, tallyOf, type DelveRecords } from '../lib/delveRecord';
  import { FLARE_MS, shownDepth } from '../lib/delve';
  import { categoryGlyph, itemThumb } from '../lib/ui';
  import { backdropShadow } from '../lib/backdropShadow';
  import type { Item } from '../lib/game';
  import DelveLastRun from './codex/DelveLastRun.svelte';
  import DelveRunLog from './codex/DelveRunLog.svelte';
  import ArcaneCircle from './ArcaneCircle.svelte';

  // The Codex's Delve page, a sibling of the Collection (Codex.svelte) and
  // built from its parts: four figures around your deepest in the rune
  // circle (with no arc: depth has nothing to fill), your last run in a row,
  // one panel per topic (what kills you and the deadliest items, then where
  // you fall, your runs together, finds and wards, the zones you reached),
  // and every run in the Collection's table. Alone and together are never
  // summed: alone leads (together, before a run alone), and each figure says
  // which it counts. Under the current rules only (runs under others are only
  // listed), but for what the codex keeps by item or in its log, not by run:
  // what kills you, the deadliest items, finds and wards (their notes say
  // so). Zones ahead are never named: they are a surprise.
  // codexStats.ts says what each number means.
  let { codex, records, onopen, onbegin }: { codex: Codex; records: DelveRecords; onopen: (item: Item) => void; onbegin: () => void } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmt = (n: number) => n.toLocaleString();
  const usual = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));
  const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

  // ---- alone first, together beside it ----

  const solo = $derived(delveSummary(records, 'solo'));
  const together = $derived(delveSummary(records, 'together'));
  /** Alone leads, unless there is only together. */
  const alone = $derived(solo.runs > 0 || !!solo.best || !(together.runs > 0 || together.best));
  const kind: DelveKind = $derived(alone ? 'solo' : 'together');
  const main = $derived(alone ? solo : together);
  const other = $derived(alone ? together : solo);
  const kindWord = $derived(alone ? 'alone' : 'together');
  const otherWord = $derived(alone ? 'together' : 'alone');
  /** Any run together under the current rules. */
  const teamed = $derived(together.runs > 0 || !!together.best);

  const others = $derived(otherRules(records));
  /** Anything under the current rules. */
  const current = $derived(solo.runs + together.runs > 0 || !!solo.best || !!together.best);
  /** Anything to show, under any rules (the run log lists the others'). */
  const anything = $derived(current || others.length > 0);
  const allRuns = $derived(solo.runs + together.runs);

  const best = $derived(main.deepest);

  // ---- the runs ----

  const byRun = $derived(answersByRun(codex));
  /** Alone and together, newest first. */
  const runs = $derived([...runsOf(records, 'solo'), ...runsOf(records, 'together')].sort((a, b) => b.at - a.at));
  const last = $derived(runs[0] ?? null);
  const story = $derived(last ? runStory(last, answersFor(byRun, last), engine.byId) : null);
  const lastOf = $derived(last && isTogether(last) ? together : solo);

  // ---- where you fall: the leading kind's runs, your own lives ----

  const ZONES_SHOWN = 10;
  const risks = $derived(zoneRisks(tallyOf(records, alone), kind));
  const riskTop = $derived(Math.max(0.0001, ...risks.map((z) => z.rate)));
  const worstZone = $derived(risks.length > 1 ? risks.reduce((a, b) => (b.rate > a.rate ? b : a)) : null);

  // ---- what kills you ----

  const deaths = $derived(delveDeaths(codex, engine.items));
  const catTop = $derived(Math.max(0.0001, ...deaths.categories.map((c) => c.rate)));
  const worstCat = $derived(deaths.categories[0] ?? null);

  // ---- rows of a name, a note and a figure: together, finds and wards ----

  /** A note's parts, joined by bullets: a number (none for 0) and its words. */
  type Row = { name: string; value: string; note: [number, string][] };

  /** Together: your part in the team's runs (what the summary leaves to alone, when alone leads). */
  const teamRows = $derived.by(() => {
    const t = together;
    const out: Row[] = [];
    if (alone && t.median !== null) out.push({ name: 'Usual depth', value: usual(shownDepth(t.median)), note: [[0, 'at least half your runs get this deep']] });
    if (alone) out.push({ name: 'Lives lost', value: fmt(t.lives), note: t.warded ? [[t.warded, `more saved by ${word(t.warded, 'a ward', 'wards')}`]] : [[0, 'your own, in every run together']] });
    out.push({
      name: 'Perished',
      value: fmt(t.perished),
      note: t.revived ? [[t.revived, `${word(t.revived, 'time')} a teammate brought you back`]] : [[0, t.perished ? 'nobody brought you back' : 'not once yet']],
    });
    out.push({ name: 'Lives given', value: fmt(t.given), note: [[0, t.given ? 'each one brought a teammate back' : 'to bring back a teammate who perished']] });
    return out;
  });

  /**
   * One kind's finds, in the order they first turn up in a run (dynamite,
   * flares, then veins), and the dynamite and flares that went off and the
   * wards that saved a life: the questions dynamite blasted away are counted
   * by run (the codex logs no answer to them), over the runs the list keeps.
   */
  function findRowsOf(f: FindStats, blasts: number): Row[] {
    const out: Row[] = [];
    const { azurite: vein, flare: cache, dynamite } = f.finds;
    const missed = (t: typeof vein, how: string): [number, string][] => (t.taken - t.ok ? [[t.taken - t.ok, how]] : []);
    const got = (n: number | undefined, one: string): [number, string][] => (n ? [[n, word(n, one)]] : []);
    if (dynamite.taken) out.push({ name: 'Dynamite Caches', value: fmt(dynamite.taken), note: [...got(dynamite.gained.dynamite, 'stick'), ...missed(dynamite, 'missed')] });
    if (cache.taken) out.push({ name: 'Flare Caches', value: fmt(cache.taken), note: [...got(cache.gained.flares, 'flare'), ...missed(cache, 'missed')] });
    if (vein.taken) out.push({ name: 'Azurite Veins', value: fmt(vein.taken), note: [...got(vein.gained.wards, 'ward'), ...got(vein.gained.shards, 'shard'), ...missed(vein, 'caved in')] });
    if (blasts) out.push({ name: 'Dynamite blasts', value: fmt(blasts), note: [[0, 'questions blasted away for new ones']] });
    if (f.flaresBurnt) out.push({ name: 'Flares burnt', value: fmt(f.flaresBurnt), note: [[FLARE_MS / 1000, 's more on the clock each']] });
    if (f.wardsBroke) out.push({ name: 'Lives warded', value: fmt(f.wardsBroke), note: [[0, 'a ward broke in its place']] });
    return out;
  }
  /** Questions dynamite blasted away in the runs of one kind the list keeps. */
  const blastsIn = (kind: DelveKind) => runsOf(records, kind).reduce((n, r) => n + (r.blasts ?? 0), 0);
  /** Alone and together apart, from the answers the codex logged (and the runs, for blasts). */
  const findScopes = $derived(
    [
      { label: 'Alone', rows: findRowsOf(findStats(answersOf(codex.log, 'solo')), blastsIn('solo')) },
      { label: 'Together', rows: findRowsOf(findStats(answersOf(codex.log, 'together')), blastsIn('together')) },
    ].filter((sc) => sc.rows.length),
  );

  // ---- zones reached, alone or together ----

  /** Alone and together as one: each new deepest, and the zones they reached. */
  const climb = $derived(mergeClimbs(climbOf(records, true), climbOf(records, false)));
  const steps = $derived(milestones(climb));
  const zones = $derived(zonesReached(climb));
  const ZONE_ROWS = 6;
  let allZones = $state(false);
  const zoneRows = $derived(allZones || zones.reached.length <= ZONE_ROWS + 1 ? [...zones.reached].reverse() : zones.reached.slice(-ZONE_ROWS).reverse());
  const zonesHidden = $derived(zones.reached.length - zoneRows.length);
</script>

{#snippet meter(share: number)}
  <span class="meter" aria-hidden="true"><span class="fill" style:width="{Math.max(0.03, share) * 100}%"></span></span>
{/snippet}

{#snippet thumb(it: Item)}
  <span class="thumb"><img src={itemThumb(it.id, 128)} alt="" loading="lazy" /></span>
{/snippet}

{#snippet glyph(category: string)}
  <span class="glyph" style:--src="url('{categoryGlyph(category)}')" aria-hidden="true"></span>
{/snippet}

{#snippet zonesPanel()}
        <section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="zone-h">
          <header><h2 id="zone-h">Zones reached</h2>{#if zones.biomes}<span class="col-label">{zones.biomes} {word(zones.biomes, 'biome')}</span>{/if}</header>
          {#if zones.reached.length}
            {#if steps.length > 1}
              <p class="climb">
                <span class="climb-label">Deepest over time</span>
                <span class="climb-steps"
                  >{#each steps as s, i (i)}{#if i}<span class="arrow" aria-hidden="true"> → </span><span class="sr-only">, then </span>{/if}{#if s === null}<span
                        class="gap">…</span
                      >{:else}<span class="n">{shownDepth(s)}</span>{/if}{/each}</span
                >
              </p>
            {/if}
            <ol class="list zones">
              {#each zoneRows as z (z.k)}
                <li>
                  <span class="z-depth n">{shownDepth(z.depth)}</span>
                  <span class="l-name"><span>{z.name}</span></span>
                  <span class="z-when n">{date(z.at)}</span>
                </li>
              {/each}
            </ol>
            {#if zonesHidden > 0}
              <button class="more" onclick={() => (allZones = true)}>Show all {zones.reached.length} zones</button>
            {/if}
          {:else}
            <p class="hint">The zones you reach, and when you first got there, show up here.</p>
          {/if}
        </section>
{/snippet}

{#snippet rowList(list: Row[])}
  <ul class="list">
    {#each list as f (f.name)}
      <li>
        <span class="l-name"
          ><span>{f.name}</span><small
            >{#each f.note as [n, w], i (i)}{i ? ' • ' : ''}{#if n}<span class="n">{n}</span>{' '}{/if}{w}{/each}</small
          ></span
        >
        <b>{f.value}</b>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet findPanels()}
  <!-- One panel for each kind of run, alone and together. -->
  {#each findScopes as sc (sc.label)}
    <section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="find-h-{sc.label}">
      <header><h2 id="find-h-{sc.label}">Finds and wards</h2><span class="col-label">{sc.label}</span></header>
      {@render rowList(sc.rows)}
      <p class="foot">From your latest answers, under any rules.</p>
    </section>
  {/each}
{/snippet}

{#snippet teamPanel()}
  <section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="team-h">
    <header><h2 id="team-h">Together</h2><span class="col-label">{fmt(together.runs)} {word(together.runs, 'run')}</span></header>
    {@render rowList(teamRows)}
  </section>
{/snippet}

<div class="delve-page">
  {#if !anything}
    <div class="empty">
      <p>You have not delved yet.</p>
      <p class="muted">
        Three lives, one depth deeper every round, and the same rules for everyone. Your runs, the zones you reach and the items that cost you lives are
        written here.
      </p>
      <button class="btn primary" onclick={onbegin}>Begin the descent</button>
    </div>
  {:else}
    {#if current}
      <section class="summary">
        <div class="side">
          <div class="stat">
            <span class="stat-label">Deepest {otherWord}</span>
            <span class="stat-value">{other.deepest === null ? '?' : shownDepth(other.deepest)}</span>
            <span class="stat-note"
              >{#if other.runs}<span class="n">{fmt(other.runs)}</span> {word(other.runs, 'run')} {otherWord}{:else}no run {otherWord} yet{/if}</span
            >
          </div>
          <div class="stat">
            <span class="stat-label">Runs</span>
            <span class="stat-value">{fmt(allRuns)}</span>
            <span class="stat-note"><span class="n">{fmt(solo.runs)}</span> alone • <span class="n">{fmt(together.runs)}</span> together</span>
          </div>
        </div>

        <div class="medallion">
          <ArcaneCircle size="100%" strength={0.3} />
          <svg class="progress" viewBox="-100 -100 200 200" aria-hidden="true"><circle class="track" r="80" /></svg>
          <div class="medal-text">
            <span class="medal-label">Deepest</span>
            <span class="medal-value">{best === null ? '?' : shownDepth(best)}</span>
            {#if best}
              <span class="medal-zone">{zoneOf(best).name}</span>
              <span class="medal-note">{kindWord}</span>
            {:else}
              <span class="medal-note">{main.left ? (alone ? 'no fall yet' : 'not perished yet') : kindWord}</span>
            {/if}
          </div>
        </div>

        <div class="side">
          <div class="stat">
            <span class="stat-label">Usual depth</span>
            <span class="stat-value">{main.median === null ? '?' : usual(shownDepth(main.median))}</span>
            <span class="stat-note"
              >{#if main.median === null}shown once <span class="n">{MIN_RUNS}</span> runs {kindWord} have ended{:else}at least half your runs {kindWord} get this deep{/if}</span
            >
          </div>
          <div class="stat">
            <span class="stat-label">Lives lost</span>
            <span class="stat-value">{fmt(main.lives)}</span>
            <span class="stat-note"
              >{#if main.warded}{kindWord}, and <span class="n">{fmt(main.warded)}</span> more saved by {word(main.warded, 'a ward', 'wards')}{:else}in your runs {kindWord}{/if}</span
            >
          </div>
        </div>
      </section>

      {#if last && story}
        <DelveLastRun run={last} {story} median={lastOf.median} best={lastOf.best} {onopen} />
      {/if}

      {#if allRuns >= MIN_RUNS}
      <div class="split">
        <section class="panel by-cat" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="kill-h">
          <header><h2 id="kill-h">What kills you</h2><span class="col-label">Lives lost</span></header>
          {#if !deaths.lives}
            <p class="hint">No answer has cost you a life yet.</p>
          {:else if !deaths.categories.length}
            <p class="hint">The kinds of item that cost you the most lives show up here once you have answered {CATEGORY_MIN} of a kind.</p>
          {:else}
            <ul class="bars cats">
              {#each deaths.categories as c (c.category)}
                <li title="{c.category}: {c.lives} {word(c.lives, 'life', 'lives')} lost in {c.n} {word(c.n, 'answer')}">
                  <span class="cat-name">{@render glyph(c.category)}<span class="bar-name">{c.category}</span></span>
                  {@render meter(c.rate / catTop)}
                  <span class="bar-value">{fmt(c.lives)} <small>in {fmt(c.n)}</small></span>
                </li>
              {/each}
            </ul>
            {#if worstCat}
              <p class="foot">
                <b>{worstCat.category}</b> cost you the most lives per answer: <span class="n">{worstCat.lives}</span>
                in <span class="n">{worstCat.n}</span> answers. This counts your answers alone and together, under any rules. A cave-in counts as two.
              </p>
            {/if}
          {/if}
        </section>

        <section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="items-h">
          <header><h2 id="items-h">Deadliest items</h2><span class="col-label">Lives lost</span></header>
          {#if deaths.items.length}
            <ul class="rows">
              {#each deaths.items as d (d.item.id)}
                <li>
                  <button class="row" onclick={() => onopen(d.item)} title="{d.lives} {word(d.lives, 'life', 'lives')} lost in {d.n} answers">
                    {@render thumb(d.item)}
                    <span class="row-name"><span>{d.item.name}</span></span>
                    <b>{d.lives} <small>in {d.n}</small></b>
                  </button>
                </li>
              {/each}
            </ul>
            <p class="foot">Your answers alone and together, under any rules.</p>
          {:else}
            <p class="hint">Items that cost you lives, from {ITEM_MIN} answers each, show up here.</p>
          {/if}
        </section>
      </div>

      <div class="insights">
        <section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="fall-h">
          <header><h2 id="fall-h">Where you fall</h2><span class="col-label">Lives lost {kindWord}</span></header>
          {#if !risks.length}
            <p class="hint">Once {ZONE_MIN_RUNS} runs {kindWord} reach a zone, the lives you lose there show up here.</p>
          {:else}
            <ul class="bars">
              {#each risks.slice(0, ZONES_SHOWN) as z (z.k)}
                <li title="{z.name}, depths {shownDepth(z.depth)} to {shownDepth(z.to)}: {z.lives} {word(z.lives, 'life', 'lives')} lost in the {z.reached} {word(z.reached, 'run')} that got there">
                  <span class="bar-name">{z.name}</span>
                  {@render meter(z.rate / riskTop)}
                  <span class="bar-value">{fmt(z.lives)} <small>in {fmt(z.reached)} {word(z.reached, 'run')}</small></span>
                </li>
              {/each}
            </ul>
            <p class="foot">
              {#if worstZone}Most lives go in <b>{worstZone.name}</b>: <span class="n">{worstZone.lives}</span> lost in the
                <span class="n">{worstZone.reached}</span> {word(worstZone.reached, 'run')} that got there.{/if}
              From your runs {kindWord}. A zone shows once <span class="n">{ZONE_MIN_RUNS}</span> of them reach it{risks.length > ZONES_SHOWN ? `, and only the ${ZONES_SHOWN} highest are listed` : ''}.
            </p>
          {/if}
        </section>

        {#if teamed}{@render teamPanel()}{/if}

        {@render findPanels()}

        {@render zonesPanel()}
      </div>
      {:else}
        <p class="waiting">
          After <span class="n">{MIN_RUNS}</span> runs, where you fall, what kills you and your deadliest items show up here;
          <span class="n">{MIN_RUNS - allRuns}</span> to go.
        </p>
        <div class="insights">
          {#if teamed}{@render teamPanel()}{/if}
          {@render findPanels()}
          {@render zonesPanel()}
        </div>
      {/if}
    {:else}
      <div class="empty">
        <p>No run under the current rules yet.</p>
        <p class="muted">The descent has changed since your runs below, so their depths are kept apart and never compared with new ones.</p>
        <button class="btn primary" onclick={onbegin}>Begin the descent</button>
      </div>
    {/if}

    <DelveRunLog {runs} {others} {byRun} total={allRuns} {onopen} />
  {/if}
</div>

<style>
  /* Every rule below is the Collection's (Codex.svelte), so the two pages read as one. */
  .delve-page {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-variant-numeric: lining-nums;
    font-size: 0.88em;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* ---- summary: your best between four figures ---- */
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
  .stat-label {
    margin-bottom: 0.35rem;
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
    line-height: 1;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .stat-value {
    font-size: 2.3rem;
    margin-bottom: 0.3rem;
  }
  .stat-note {
    font-size: 0.92rem;
    line-height: 1.3;
    font-style: italic;
    color: var(--muted);
  }
  /* The Collection's medallion: the rune circle round a dark disc and its track, your deepest inside. No arc: depth has no end to fill to. */
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
    overflow: visible;
  }
  .track {
    fill: rgba(8, 6, 4, 0.75);
    stroke: rgba(125, 99, 51, 0.35);
    stroke-width: 6;
  }
  .medal-text {
    position: relative;
    width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.1;
  }
  .medal-label {
    font-family: var(--font-display);
    font-size: 0.74rem;
    letter-spacing: 0.2em;
    padding-left: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .medal-value {
    margin: 0.15rem 0 0.2rem;
    font-size: 3.2rem;
  }
  .medal-zone {
    font-family: var(--font-display);
    font-size: 0.9rem;
    line-height: 1.2;
    letter-spacing: 0.04em;
    color: var(--gold);
  }
  .medal-note {
    margin-top: 0.15rem;
    font-size: 0.9rem;
    font-style: italic;
    color: var(--muted);
  }

  .empty {
    width: min(520px, 100%);
    margin: 0 auto;
    text-align: center;
  }
  .empty p:first-child {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--gold-hi);
  }
  .empty p {
    margin: 0 0 1.4rem;
  }

  /* ---- panels ---- */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 1rem;
  }
  .insights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
    min-width: 0;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.8rem;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .waiting {
    margin: 0;
    text-align: center;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }
  .panel h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .col-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
    white-space: nowrap;
  }
  .hint {
    margin: 0;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }
  .foot {
    margin: 0.9rem 0 0;
    font-size: 0.9rem;
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
  }
  .foot b {
    font-weight: 400;
    color: var(--text);
  }

  /* Rows of a bar: a name, the bar and its figure. */
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(24px, 3.5rem) auto;
    align-items: center;
    gap: 0.7rem;
  }
  .bars.cats {
    gap: 0.45rem;
  }
  .bars.cats li {
    grid-template-columns: minmax(0, 1fr) minmax(40px, 9rem) 4.4rem;
  }
  .cat-name {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }
  .bar-name {
    font-size: 0.98rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-value {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }
  .bar-value small {
    color: var(--muted);
    font-family: var(--font-body);
    font-size: 0.85rem;
  }
  .glyph {
    flex: none;
    width: 24px;
    height: 24px;
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
    filter: drop-shadow(0 0 6px rgba(224, 138, 68, 0.45));
  }
  /* One hue for every bar, as the Collection's: ember to gold. */
  .meter {
    position: relative;
    display: block;
    height: 6px;
    min-width: 0;
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

  /* Item rows, as the Collection's nemeses. */
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0.7rem 0.35rem 0.35rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(59, 48, 36, 0.6);
    color: var(--text);
    font-size: 1rem;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.25s,
      background 0.25s,
      color 0.25s;
  }
  .row:hover {
    border-color: var(--gold-lo);
    background: rgba(0, 0, 0, 0.4);
    color: var(--gold-hi);
  }
  .row b {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--gold);
    white-space: nowrap;
  }
  .row b small {
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .row-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .row-name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thumb {
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background:
      radial-gradient(ellipse 60% 55% at 50% 50%, rgba(175, 96, 37, 0.22), transparent 70%),
      linear-gradient(180deg, #0c0d12, #060709);
    box-shadow: inset 0 0 0 1px rgba(90, 58, 28, 0.6);
  }
  .thumb img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
  }

  /* A name with a note under it and a figure on the right: finds, zones. */
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid rgba(59, 48, 36, 0.45);
  }
  .list li:last-child {
    border-bottom: 0;
  }
  .l-name {
    flex: 1;
    min-width: 0;
    font-size: 0.98rem;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .l-name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .l-name small {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .list b {
    font-family: var(--font-cinzel);
    font-size: 1.05rem;
    color: var(--gold-hi);
  }
  .zones li {
    padding: 0.3rem 0;
  }
  .z-depth {
    width: 2.2rem;
    text-align: right;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .z-when {
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .climb {
    margin: 0 0 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .climb-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .climb-steps {
    font-size: 1.05rem;
    color: var(--gold-hi);
  }
  .climb-steps .n {
    font-weight: 700;
  }
  .arrow,
  .gap {
    color: var(--gold-lo);
  }
  .more {
    align-self: center;
    display: block;
    margin: 0.3rem auto 0;
    min-height: 44px;
    padding: 0 1rem;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    text-decoration: underline 1px rgba(201, 164, 92, 0.4);
    text-underline-offset: 0.35em;
    cursor: pointer;
    transition: color 0.2s;
  }
  .more:hover {
    color: var(--gold-hi);
    text-decoration-color: var(--gold-hi);
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
    .split {
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
    .stat {
      flex: 1;
    }
    .stat-value {
      font-size: 1.9rem;
    }
    .medallion {
      width: 210px;
      height: 210px;
    }
    .medal-value {
      font-size: 2.8rem;
    }
    .panel {
      padding: 1rem 1rem 1.1rem;
    }
    .bars li {
      gap: 0.5rem;
    }
    .bars.cats li {
      grid-template-columns: minmax(0, 1fr) minmax(30px, 4rem) 3.6rem;
    }
  }
</style>
