<script lang="ts">
  import { fly } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import type { Codex } from '../lib/codex';
  import {
    CATEGORY_MIN,
    ITEM_MIN,
    MIN_RUNS,
    ZONE_MIN_RUNS,
    answersByRun,
    delveDeaths,
    delveSummary,
    findStats,
    otherRules,
    runStory,
    runsOf,
    toward,
    zoneRisks,
    zonesReached,
    type DelveKind,
  } from '../lib/codexStats';
  import { climbOf, tallyOf, type DelveRecords } from '../lib/delveRecord';
  import { shareText } from '../lib/delveShare';
  import { categoryIcon, itemImage } from '../lib/ui';
  import { backdropShadow } from '../lib/backdropShadow';
  import type { Item } from '../lib/game';
  import ArcaneCircle from './ArcaneCircle.svelte';
  import DelveLastRun from './codex/DelveLastRun.svelte';
  import DelveProgress from './codex/DelveProgress.svelte';
  import DelveRunLog from './codex/DelveRunLog.svelte';

  // The Codex's Delve page: your best and where it heads, your last run, how
  // you have climbed, where and to what you lose lives, what finds and wards
  // did for you, the zones you have reached, and every run. Every number is
  // under the current rules and of one kind of run, alone or together (the
  // switch); codexStats.ts says what each one means.
  let { codex, records, onopen, onbegin }: { codex: Codex; records: DelveRecords; onopen: (item: Item) => void; onbegin: () => void } = $props();

  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rise = (delay: number) => ({ y: 20, duration: still ? 0 : 700, delay: still ? 0 : delay });

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const rate = (x: number) => x.toFixed(2);
  const fmt = (n: number) => n.toLocaleString();
  const range = (from: number, to: number) => `${from}–${to}`;

  // ---- which runs: alone or together ----

  const solo = $derived(delveSummary(records, 'solo'));
  const group = $derived(delveSummary(records, 'group'));
  const both = $derived(solo.runs > 0 && group.runs > 0);
  let picked = $state<DelveKind | null>(null);
  const kind = $derived<DelveKind>(picked ?? (solo.runs || solo.best || !(group.runs || group.best) ? 'solo' : 'group'));
  const sum = $derived(kind === 'solo' ? solo : group);
  const other = $derived(kind === 'solo' ? group : solo);
  const alone = $derived(kind === 'solo');
  const kindWord = $derived(alone ? 'alone' : 'together');

  const others = $derived(otherRules(records));
  /** Anything at all, under any rules. */
  const anything = $derived(records.runs.length > 0 || records.frontier.length > 0 || Object.keys(records.bests).length > 0);
  /** Anything under the current rules. */
  const current = $derived(solo.runs + group.runs > 0 || !!solo.best || !!group.best);

  // ---- the hero ----

  /** Your best: the deepest fall (of this kind, under these rules). */
  const best = $derived(sum.deepest);
  const ahead = $derived(best ? toward(best) : null);
  /** The arc runs from the zone's first depth (bottom left) round to the next zone's (bottom right). */
  const GAP = 60;
  const at = (deg: number, r = 80) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];
  const [sx, sy] = at(180 + GAP / 2);
  const [ex, ey] = at(180 - GAP / 2);
  const arcPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A 80 80 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

  let shared = $state(false);
  async function share() {
    if (!best) return;
    const text = shareText(best);
    try {
      if (matchMedia('(pointer: coarse)').matches && navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        shared = true;
        setTimeout(() => (shared = false), 2000);
      }
    } catch {
      /* dismissed */
    }
  }

  // ---- the runs of this kind ----

  const runs = $derived(runsOf(records, kind));
  const byRun = $derived(answersByRun(codex));
  const last = $derived(runs[0] ?? null);
  const story = $derived(last ? runStory(last, byRun.get(last.id) ?? [], engine.byId) : null);
  const climb = $derived(climbOf(records, alone));

  // ---- where you fall ----

  /** Zones shown at most; deeper ones are summed up in a line. */
  const ZONES_SHOWN = 12;
  const risks = $derived(zoneRisks(tallyOf(records, alone)));
  const riskTop = $derived(Math.max(0.0001, ...risks.map((z) => z.rate)));
  const worstZone = $derived(risks.length > 1 ? risks.reduce((a, b) => (b.rate > a.rate ? b : a)) : null);

  // ---- what kills you ----

  const deaths = $derived(delveDeaths(codex, engine.items));
  const catTop = $derived(Math.max(0.0001, ...deaths.categories.map((c) => c.rate)));
  const allRuns = $derived(solo.runs + group.runs);

  // ---- finds and wards ----

  const finds = $derived(findStats(codex.log));
  const vein = $derived(finds.finds.azurite);
  const cache = $derived(finds.finds.flare);
  const dynamite = $derived(finds.finds.dynamite);
  const anyFinds = $derived(vein.taken + cache.taken + dynamite.taken + finds.wardsBroke + finds.flaresBurnt > 0);
  /** A tile's note: counts and what they are, the counts in Cinzel. */
  type Note = [number, string][];
  const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
  function veinNote(): Note {
    const out: Note = [];
    if (vein.gained.wards) out.push([vein.gained.wards, word(vein.gained.wards, 'ward')]);
    if (vein.gained.shards) out.push([vein.gained.shards, word(vein.gained.shards, 'shard')]);
    if (vein.taken - vein.ok) out.push([vein.taken - vein.ok, 'caved in']);
    return out;
  }
  function cacheNote(t: typeof cache, what: 'flare' | 'stick'): Note {
    const got = (what === 'flare' ? t.gained.flares : t.gained.dynamite) ?? 0;
    const out: Note = [];
    if (got) out.push([got, word(got, what)]);
    if (t.taken - t.ok) out.push([t.taken - t.ok, 'missed']);
    return out;
  }

  // ---- zones reached ----

  const zones = $derived(zonesReached(climb));
  /** Zone rows shown before the rest fold away above them. */
  const ZONE_ROWS = 8;
  let allZones = $state(false);
  const zoneRows = $derived(allZones || zones.reached.length <= ZONE_ROWS + 2 ? zones.reached : zones.reached.slice(-ZONE_ROWS));
  const zonesHidden = $derived(zones.reached.length - zoneRows.length);
</script>

{#snippet thumb(it: Item)}
  <span class="thumb"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
{/snippet}

{#snippet note(parts: [number, string][], none: string)}
  {#if parts.length}{#each parts as [n, w], i (i)}{i ? ' • ' : ''}<span class="n">{n}</span> {w}{/each}{:else}{none}{/if}
{/snippet}

{#snippet waiting(what: string)}
  <p class="hint">{what}</p>
{/snippet}

<div class="delve-page">
  {#if !anything}
    <div class="empty" in:fly={rise(100)}>
      <p>You have not delved yet.</p>
      <p class="muted">
        Three lives, one depth deeper every round, and the same rules for everyone. Your runs, the zones you reach and the items that cost you lives are
        written here.
      </p>
      <button class="btn primary" onclick={onbegin}>Begin the descent</button>
    </div>
  {:else}
    {#if both}
      <div class="seg kinds" role="group" aria-label="Runs shown" in:fly={rise(50)}>
        {#each [['solo', 'Alone'], ['group', 'Together']] as [k, label] (k)}
          <button class:on={kind === k} aria-pressed={kind === k} onclick={() => (picked = k as DelveKind)}>{label}</button>
        {/each}
      </div>
    {/if}

    {#if current}
      <section class="delve-hero" in:fly={rise(100)}>
        <div class="medallion">
          <ArcaneCircle size="100%" strength={0.3} />
          <svg class="gauge" viewBox="-100 -100 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="delve-arc" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stop-color="#c22a10" />
                <stop offset="0.55" stop-color="#e08a44" />
                <stop offset="1" stop-color="#ffd59a" />
              </linearGradient>
            </defs>
            <circle class="disc" r="80" />
            <path class="track" d={arcPath} />
            {#if ahead}<path class="arc" d={arcPath} pathLength="100" style:stroke-dasharray="{ahead.share * 100} 100" />{/if}
          </svg>
          {#if ahead}
            <span class="arc-end from" aria-hidden="true">{ahead.here.depth}</span>
            <span class="arc-end to" aria-hidden="true">{ahead.next.depth}</span>
          {/if}
          <div class="medal-text">
            <span class="medal-label">Best {kindWord}</span>
            {#if best}
              <span class="medal-value">{best}</span>
              <span class="medal-zone">{ahead?.here.name}</span>
            {:else}
              <span class="medal-none">no fall yet</span>
            {/if}
          </div>
        </div>
        <div class="hero-text">
          {#if ahead}
            <p class="toward">
              <b class="n">{ahead.left}</b> {ahead.left === 1 ? 'depth' : 'depths'} to <span class="zname">{ahead.next.name}</span>
            </p>
          {:else}
            <p class="toward">{sum.left ? 'Your runs so far were left before their last life went.' : 'Fall in a run to set your best.'}</p>
          {/if}
          <p class="sub">
            {#if other.deepest}<span>Best {alone ? 'together' : 'alone'} <b class="n">{other.deepest}</b></span>{' • '}{/if}<span
              ><b class="n">{fmt(sum.runs)}</b> {sum.runs === 1 ? 'run' : 'runs'} {kindWord}</span
            >{#if sum.left}<span>, <b class="n">{fmt(sum.left)}</b> left early</span>{/if}{#if !alone && sum.wins}<span>{' • '}<b class="n">{fmt(sum.wins)}</b> {sum.wins === 1 ? 'win' : 'wins'}</span>{/if}
          </p>
          {#if best}
            <button class="btn ghost small tall" onclick={share}>{shared ? 'Copied' : 'Share your best'}</button>
          {/if}
        </div>
      </section>
    {:else}
      <div class="empty" in:fly={rise(100)}>
        <p>No run under the current rules yet.</p>
        <p class="muted">The descent has changed since your runs below, so their depths are kept apart and never compared with new ones.</p>
        <button class="btn primary" onclick={onbegin}>Begin the descent</button>
      </div>
    {/if}

    {#if current}
      <div class="grid" in:fly={rise(200)}>
        {#if last && story}
          <DelveLastRun run={last} {story} median={sum.median} {best} {onopen} />
        {/if}

        <div class="col">
        <DelveProgress {climb} {runs} summary={sum} {kindWord} />

        <section class="panel o3" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="kill-h">
          <header><h2 id="kill-h">What kills you</h2><span class="col-label">Lives per answer</span></header>
          {#if allRuns < MIN_RUNS}
            {@render waiting(`After ${MIN_RUNS} runs: the kinds of item and the items that cost you the most lives for each answer.`)}
          {:else if !deaths.lives}
            {@render waiting('No answer has cost you a life yet.')}
          {:else}
            {#if deaths.categories.length}
              <ul class="bars">
                {#each deaths.categories.slice(0, 6) as c (c.category)}
                  <li>
                    <span class="bar-name cat"><span class="glyph" style:--src="url('{categoryIcon(c.category)}')" aria-hidden="true"></span><span>{c.category}</span></span>
                    <span class="meter" aria-hidden="true"><span class="fill ember" style:width="{(c.rate / catTop) * 100}%"></span></span>
                    <span class="bar-value"><b class="n">{rate(c.rate)}</b><small>of <span class="n">{fmt(c.n)}</span></small></span>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if deaths.items.length}
              <h3 class="sub-h">Deadliest items</h3>
              <ul class="rows">
                {#each deaths.items as d (d.item.id)}
                  <li>
                    <button class="row" onclick={() => onopen(d.item)}>
                      {@render thumb(d.item)}
                      <span class="row-name"><span>{d.item.name}</span><small><span class="n">{d.lives}</span> {d.lives === 1 ? 'life' : 'lives'} in <span class="n">{d.n}</span> answers</small></span>
                      <b class="n">{rate(d.rate)}</b>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            <p class="foot">From every Delve answer, alone or together; a cave-in counts two lives. Kinds from {CATEGORY_MIN} answers, items from {ITEM_MIN}.</p>
          {/if}
        </section>

        </div>
        <div class="col">
        <section class="panel o2" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="fall-h">
          <header><h2 id="fall-h">Where you fall</h2><span class="col-label">Lives per run</span></header>
          {#if sum.runs < MIN_RUNS}
            {@render waiting(`After ${MIN_RUNS} runs ${kindWord}: the lives you lose in each zone, per run that got there.`)}
          {:else if !risks.length}
            {@render waiting(`Once ${ZONE_MIN_RUNS} runs ${kindWord} reach a zone: the lives you lose there, per run that got there.`)}
          {:else}
            <ul class="bars">
              {#each risks.slice(0, ZONES_SHOWN) as z (z.k)}
                <li class:worst={worstZone?.k === z.k}>
                  <span class="bar-name"><span>{z.name}</span><small class="n">{range(z.depth, z.to)}</small></span>
                  <span class="meter" aria-hidden="true"><span class="fill ember" style:width="{(z.rate / riskTop) * 100}%"></span></span>
                  <span class="bar-value"><b class="n">{rate(z.rate)}</b><small>of <span class="n">{fmt(z.reached)}</span></small></span>
                </li>
              {/each}
            </ul>
            <p class="foot">
              {#if worstZone}Most lives go in <b>{worstZone.name}</b>: <b class="n">{rate(worstZone.rate)}</b> a run that gets there.{/if}
              Zones show once {ZONE_MIN_RUNS} runs reach them{risks.length > ZONES_SHOWN ? `; ${risks.length - ZONES_SHOWN} deeper ones are left out` : ''}.
            </p>
          {/if}
        </section>

        <section class="panel o4" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="find-h">
          <header><h2 id="find-h">Finds and wards</h2></header>
          {#if anyFinds}
            <ul class="tiles">
              <li>
                <span class="tile-label">Azurite Veins</span>
                <b class="tile-value">{vein.taken}</b>
                <span class="tile-note">{@render note(veinNote(), 'none taken')}</span>
              </li>
              <li>
                <span class="tile-label">Flare Caches</span>
                <b class="tile-value">{cache.taken}</b>
                <span class="tile-note">{@render note(cacheNote(cache, 'flare'), 'none taken')}</span>
              </li>
              {#if dynamite.taken}
                <li>
                  <span class="tile-label">Dynamite Caches</span>
                  <b class="tile-value">{dynamite.taken}</b>
                  <span class="tile-note">{@render note(cacheNote(dynamite, 'stick'), '')}</span>
                </li>
              {/if}
              <li>
                <span class="tile-label">Lives warded</span>
                <b class="tile-value">{finds.wardsBroke}</b>
                <span class="tile-note">wards that broke in their place</span>
              </li>
              <li>
                <span class="tile-label">Flares burnt</span>
                <b class="tile-value">{finds.flaresBurnt}</b>
                <span class="tile-note">each <span class="n">5</span> s more on the clock</span>
              </li>
            </ul>
            <p class="foot">From your latest Delve answers, alone or together.</p>
          {:else}
            {@render waiting('The veins and caches you take, the wards that save a life and the flares you burn are written here as you delve.')}
          {/if}
        </section>

        <section class="panel o5" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="zone-h">
          <header>
            <h2 id="zone-h">Zones reached</h2>
            {#if zones.reached.length}<span class="col-label">{plural(zones.biomes, 'biome')}</span>{/if}
          </header>
          {#if zones.reached.length}
            <ol class="atlas">
              {#if zonesHidden > 0}
                <li class="fold">
                  <button class="btn ghost small tall" onclick={() => (allZones = true)}>{plural(zonesHidden, 'zone')} above</button>
                </li>
              {/if}
              {#each zoneRows as z (z.k)}
                <li class="found" class:here={z.k === zones.reached.at(-1)?.k}>
                  <span class="node" aria-hidden="true"></span>
                  <span class="z-depth n">{z.depth}</span>
                  <span class="z-name">{z.name}</span>
                  <span class="z-when n">{date(z.at)}</span>
                </li>
              {/each}
              {#if zones.next}
                <li class="next">
                  <span class="node" aria-hidden="true"></span>
                  <span class="z-depth n">{zones.next.depth}</span>
                  <span class="z-name unknown"><span aria-hidden="true">???</span><span class="sr-only">Undiscovered</span></span>
                  <span class="z-when">next</span>
                </li>
              {/if}
            </ol>
            <p class="foot">The zones your best {kindWord} got to, and when it first did.</p>
          {:else}
            {@render waiting(`The zones your runs ${kindWord} fall in, every ten depths, are marked here.`)}
          {/if}
        </section>
        </div>
      </div>
    {/if}

    <DelveRunLog {runs} {others} {byRun} {kindWord} total={sum.runs} {onopen} />
  {/if}
</div>

<style>
  .delve-page {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  /* ---- shared by the page's parts (codex/Delve*.svelte) ---- */
  .delve-page :global(.n) {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .delve-page :global(.panel) {
    padding: 1.2rem 1.3rem 1.3rem;
    min-width: 0;
  }
  .delve-page :global(.panel > header) {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem 0.8rem;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
    min-height: 2.3rem;
  }
  .delve-page :global(.panel h2) {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .delve-page :global(.col-label) {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .delve-page :global(.hint) {
    margin: 0;
    font-size: 0.98rem;
    font-style: italic;
    color: var(--muted);
  }
  .delve-page :global(.foot) {
    margin: 0.8rem 0 0;
    font-size: 0.9rem;
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
  }
  .delve-page :global(.foot b:not(.n)) {
    font-weight: 400;
    color: var(--text);
  }
  .delve-page :global(.thumb) {
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
  .delve-page :global(.thumb img) {
    width: 34px;
    height: 34px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
  }
  .delve-page :global(.thumb.none) {
    font-family: var(--font-cinzel);
    color: var(--muted);
  }
  .delve-page :global(.tall) {
    min-height: 40px;
  }
  .delve-page :global(.sr-only) {
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

  /* ---- alone or together ---- */
  .seg {
    display: flex;
    gap: 0.3rem;
  }
  .kinds {
    align-self: center;
  }
  .seg > button {
    min-height: 40px;
    min-width: 6.5rem;
    padding: 0.3rem 0.9rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .seg > button:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .seg > button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border-color: var(--gold);
    box-shadow: inset 0 1px 0 rgba(255, 230, 170, 0.3);
  }

  /* ---- the hero: your best in the medallion, the arc to the next zone ---- */
  .delve-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
    text-align: center;
  }
  .medallion {
    position: relative;
    isolation: isolate;
    width: 250px;
    height: 250px;
    display: grid;
    place-items: center;
  }
  .medallion :global(.arcane) {
    z-index: -1;
  }
  .gauge {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .disc {
    fill: rgba(8, 6, 4, 0.78);
  }
  .track {
    fill: none;
    stroke: rgba(125, 99, 51, 0.35);
    stroke-width: 6;
  }
  .arc {
    fill: none;
    stroke: url(#delve-arc);
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(224, 108, 50, 0.85));
    animation: fill-arc 1.6s var(--ease-out) 0.4s both;
  }
  @keyframes fill-arc {
    from {
      stroke-dasharray: 0 100;
    }
  }
  /* The arc's ends: the zone's first depth, and the next zone's. */
  .arc-end {
    position: absolute;
    bottom: 13%;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .arc-end.from {
    left: 21%;
  }
  .arc-end.to {
    right: 21%;
    color: #e8a36a;
  }
  .medal-text {
    position: relative;
    width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .medal-label {
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .medal-value {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 3.4rem;
    line-height: 1;
    margin: 0.2rem 0 0.25rem;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .medal-zone {
    font-family: var(--font-display);
    font-size: 0.8rem;
    line-height: 1.25;
    letter-spacing: 0.06em;
    color: var(--gold);
  }
  .medal-none {
    margin-top: 0.5rem;
    font-style: italic;
    color: var(--muted);
  }
  .hero-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .toward {
    margin: 0;
    font-size: 1.15rem;
    color: var(--text);
  }
  .toward .n {
    color: #ffb070;
  }
  .zname {
    font-family: var(--font-display);
    letter-spacing: 0.04em;
    color: var(--gold-hi);
  }
  .sub {
    margin: 0;
    font-size: 0.98rem;
    font-style: italic;
    color: var(--muted);
  }
  .sub .n {
    color: var(--gold-hi);
    font-size: 0.92em;
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

  /* ---- the panels ---- */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: start;
  }
  .grid > :global(.wide) {
    grid-column: 1 / -1;
  }
  /* Two columns of panels, each as tall as it needs; one column on narrow screens, in the page's order. */
  .col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .sub-h {
    margin: 1.1rem 0 0.6rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--gold);
  }

  /* Rows of a rate: a name, a bar and its value written out. */
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
    grid-template-columns: minmax(0, 1fr) minmax(40px, 6rem) 4.6rem;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.2rem;
  }
  .bar-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .bar-name > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.98rem;
  }
  .bar-name small {
    font-size: 0.72rem;
    color: var(--muted);
  }
  .bar-name.cat {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .glyph {
    flex: none;
    width: 20px;
    height: 20px;
    background: var(--gold);
    mask: var(--src) center / contain no-repeat;
    -webkit-mask: var(--src) center / contain no-repeat;
  }
  .worst .bar-name > span {
    color: #ffb070;
  }
  .bar-value {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.1;
  }
  .bar-value b {
    font-size: 0.92rem;
    color: var(--gold-hi);
  }
  .bar-value small {
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  .bar-value small .n {
    font-size: 0.72rem;
  }
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
    min-width: 2px;
    border-radius: 3px;
  }
  .fill.ember {
    background: linear-gradient(90deg, #4d0705, #c22a10 55%, #ff8a32);
    box-shadow: 0 0 8px rgba(224, 85, 40, 0.4);
  }

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
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.3rem 0.7rem 0.3rem 0.3rem;
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
  .row > b {
    font-size: 0.92rem;
    color: var(--gold);
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
  .row-name small {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .row-name small .n {
    font-size: 0.75rem;
  }

  /* ---- finds and wards: a tile each ---- */
  .tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }
  .tiles li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid rgba(59, 48, 36, 0.6);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .tile-label {
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tile-value {
    font-family: var(--font-cinzel);
    font-size: 1.6rem;
    line-height: 1.1;
    color: var(--gold-hi);
  }
  .tile-note :global(.n) {
    font-size: 0.78rem;
  }
  .tile-note {
    font-size: 0.86rem;
    font-style: italic;
    line-height: 1.25;
    color: var(--muted);
  }

  /* ---- zones reached: strung down a shaft ---- */
  .atlas {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 14px auto minmax(0, 1fr) auto;
    column-gap: 0.6rem;
    row-gap: 0.55rem;
  }
  .atlas::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 0.6rem;
    bottom: 0.6rem;
    width: 1px;
    background: linear-gradient(180deg, var(--gold-lo), rgba(125, 99, 51, 0.15));
  }
  .atlas li {
    display: contents;
  }
  .atlas li.fold > :global(button) {
    grid-column: 2 / -1;
    justify-self: start;
  }
  .node {
    position: relative;
    align-self: center;
    justify-self: center;
    width: 8px;
    height: 8px;
    rotate: 45deg;
    border: 1px solid rgba(125, 99, 51, 0.6);
    background: var(--bg);
  }
  .found .node {
    border-color: var(--gold);
    background: linear-gradient(135deg, #fbe6b0, #8a6428);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }
  .here .node {
    border-color: #ffd59a;
    background: linear-gradient(135deg, #ffd59a, #c22a10);
    box-shadow: 0 0 10px rgba(255, 120, 50, 0.8);
  }
  .z-depth {
    align-self: baseline;
    font-size: 0.82rem;
    text-align: right;
    color: var(--gold-hi);
  }
  .next .z-depth {
    color: var(--muted);
  }
  .z-name {
    align-self: baseline;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 0.88rem;
    letter-spacing: 0.04em;
    color: var(--text);
  }
  .here .z-name {
    color: var(--gold-hi);
  }
  .z-name.unknown {
    font-family: var(--font-cinzel);
    letter-spacing: 0.3em;
    color: rgba(150, 138, 119, 0.55);
  }
  .z-when {
    align-self: baseline;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--muted);
    white-space: nowrap;
  }
  .next .z-when {
    font-style: italic;
    font-size: 0.85rem;
  }

  @media (max-width: 900px) {
    .grid {
      display: flex;
      flex-direction: column;
    }
    .col {
      display: contents;
    }
    .o2 {
      order: 2;
    }
    .o3 {
      order: 3;
    }
    .o4 {
      order: 4;
    }
    .o5 {
      order: 5;
    }
  }
  @media (max-width: 560px) {
    .medallion {
      width: 220px;
      height: 220px;
    }
    .medal-value {
      font-size: 3rem;
    }
    .delve-page :global(.panel) {
      padding: 1rem 1rem 1.1rem;
    }
    .bars li {
      grid-template-columns: minmax(0, 1fr) minmax(40px, 4.5rem) 4.2rem;
    }
  }
</style>
