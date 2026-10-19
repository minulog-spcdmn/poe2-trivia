<script lang="ts">
  // The run's end: won or lost, where, the run in numbers, your road (a row
  // per step from the camp to the boss: the step's places as the map draws
  // them, the items there, the life after it), the corruption (each one:
  // stopped, still out, or at the boss with its rule), gold, supplies, item
  // by item (phones; the wide road names them), the Copy run log button
  // (every run kept, as JSON, for the owner) and New run. Phones dock the two
  // buttons at the foot; wide screens set the road beside the rest.
  import { BOSS_MOD_NAMES, LOOT_KINDS, SUPPLIES, SUPPLY_NAMES, ZONE_NAMES, type Run, type RunLog } from './rules';
  import { backdropShadow } from '../lib/backdropShadow';
  import { GRAPH, type MapNode } from './map';
  import { logText } from './runLog';
  import { play } from './play.svelte';
  import { BOSS_MOD_SHORT, placeKind } from './words';
  import Glyph from './Glyph.svelte';
  import Numbered from './Numbered.svelte';

  /** The runs kept and New run are the page's (play.svelte.ts) unless given (the QA desk's bench gives its own). */
  let { run, runs, onnew }: { run: Run; runs?: RunLog[]; onnew?: () => void } = $props();
  const kept = $derived(runs ?? play.runs);
  const s = $derived(run.state);
  const log = $derived(s.log);
  const won = $derived(log.result === 'win');
  const named = $derived(log.items.filter((it) => it.submits.at(-1)?.right).length);
  const minutes = $derived(Math.max(1, Math.round(log.ms / 60000)));
  const node = (id: string) => GRAPH.byId.get(id)?.name ?? id;
  const where = (it: RunLog['items'][number]) => (it.boss ? 'Boss' : `Step ${it.step} • ${node(it.node)} • ${ZONE_NAMES[it.zoneType as keyof typeof ZONE_NAMES]}`);

  /** Wide screens: the road beside the rest, its rows naming the items. */
  const WIDE = '(min-width: 1100px)';
  let wide = $state(typeof matchMedia === 'function' && matchMedia(WIDE).matches);
  $effect(() => {
    const mq = matchMedia(WIDE);
    const on = () => (wide = mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  // ---- Your road ----
  type Item = RunLog['items'][number];
  interface Row {
    id: string;
    n: MapNode;
    items: Item[];
    blood: boolean;
    life: number | null;
    delta: number;
    gold: number;
    /** The boss rule the corruption here carried (a Blood toll zone), or null. */
    rule: string | null;
    /** A corruption was stopped here. */
    cleared: boolean;
    /** A town's heal on arrival. */
    healed: number;
    /** Gold spent and supplies bought here (a vendor: the camp, a town, an Expedition). */
    spent: number;
    bought: number;
    /** The run ended here. */
    fell: boolean;
    /** Not reached (the boss, on a lost run). */
    ahead: boolean;
    /** The places offered beside it that were corrupted then. */
    tainted: Set<string>;
  }
  const rows = $derived.by(() => {
    const out: Row[] = [];
    let prev: number | null = null;
    const fellAt = log.result === 'loss' ? (log.endedOn?.node ?? s.at) : null;
    log.route.forEach((id, k) => {
      const items = log.items.filter((it) => it.node === id);
      const later = log.items.find((it) => log.route.indexOf(it.node) > k);
      const life = items.length ? items.at(-1)!.lifeAfter : (later?.lifeBefore ?? prev ?? log.lifeEnd);
      const met = log.met.find((m) => m.node === id);
      const blood = met?.corruption === 'blood';
      const offer = log.travel[k - 1];
      out.push({
        id,
        n: GRAPH.byId.get(id)!,
        items,
        blood,
        life,
        delta: prev === null ? 0 : life - prev,
        gold: items.reduce((t, it) => t + it.gold, 0),
        rule: blood && met?.rule ? BOSS_MOD_NAMES[met.rule] : null,
        cleared: s.fronts.some((f) => f.stoppedAt === id),
        healed: met?.healed ?? 0,
        spent: met?.spent ?? 0,
        bought: met?.bought ?? 0,
        fell: id === fellAt,
        ahead: false,
        tainted: new Set(offer ? offer.options.filter((o) => o.corrupted && o.node !== id).map((o) => o.node) : []),
      });
      prev = life;
    });
    if (!log.route.includes(GRAPH.boss.id))
      out.push({ id: GRAPH.boss.id, n: GRAPH.boss, items: [], blood: false, life: null, delta: 0, gold: 0, rule: null, cleared: false, healed: 0, spent: 0, bought: 0, fell: false, ahead: true, tainted: new Set() });
    return out.filter((r) => r.n);
  });
  const reachedStep = $derived(GRAPH.byId.get(log.route.at(-1) ?? '')?.step ?? 0);

  /** A row's little map: its step's places across, the one taken lit, the road in and out. */
  const W = $derived(wide ? 92 : 50);
  const span = $derived(wide ? 78 : 36);
  function xs(r: Row) {
    const at = [...(GRAPH.atStep.get(r.n.step) ?? [r.n])].sort((a, b) => a.x - b.x);
    const gap = span / at.length;
    return at.map((m, i) => ({ m, x: W / 2 + (i - (at.length - 1) / 2) * gap }));
  }
  const xOf = (r: Row | undefined) => (r ? (xs(r).find((p) => p.m.id === r.id)?.x ?? W / 2) : null);
  const heightOf = (r: Row) => (wide ? (r.items.length > 2 ? 62 : 46) : 30);
  const kindOf = (id: string) => s.places[id]?.kind ?? GRAPH.byId.get(id)?.kind;
  const pct = (life: number) => `${Math.max(0, Math.min(100, (life / s.maxLife) * 100))}%`;
  /** A row's place, said under its name on wide screens. */
  function kindLine(r: Row) {
    const p = s.places[r.id];
    if (!p) return '';
    return p.kind === 'zone' && r.blood ? ZONE_NAMES[p.type] : placeKind(p);
  }
  const supplyCount = (n: number) => `Bought ${n} ${n === 1 ? 'supply' : 'supplies'}`;
  const shown = $derived(rows.filter((r) => !r.ahead));

  // ---- Corruption, gold, supplies ----
  const fronts = $derived(
    s.fronts.map((f) => {
      const rule = `${BOSS_MOD_NAMES[f.rule]} (${BOSS_MOD_SHORT[f.rule]})`;
      if (!f.alive) return { rule, alive: false, line: `Stopped at ${node(f.stoppedAt ?? f.at)}` };
      if (log.fronts.aliveAtBoss !== null) return { rule, alive: true, line: `Reached the boss from ${node(f.at)}` };
      return { rule, alive: true, line: `Still at ${node(f.at)}` };
    }),
  );
  const bloodZones = $derived(log.met.filter((m) => m.corruption === 'blood').length);
  const madeHarder = $derived(log.bossMods.map((m) => `${BOSS_MOD_NAMES[m]} (${BOSS_MOD_SHORT[m]})`).join(' • ') || (log.fronts.aliveAtBoss === null ? 'Not reached' : 'Nothing'));
  const spentShare = $derived(log.goldSpent / Math.max(1, log.goldSpent + s.gold));
  const LOOT_WORDS = { gold: 'gold', supply: 'supplies', flask: 'flask' } as const;
  const loot = $derived(
    LOOT_KINDS.filter((k) => log.loot.dealt[k])
      .map((k) => `${LOOT_WORDS[k]} ${log.loot.taken[k]} of ${log.loot.dealt[k]}`)
      .join(' • ') || 'None',
  );
  const supplies = $derived(SUPPLIES.filter((k) => log.bought[k] || log.found[k] || log.used[k]));

  // ---- The run log ----
  const text = $derived(logText(kept));
  let copied = $state<'yes' | 'no' | null>(null);
  let box = $state<HTMLTextAreaElement>();
  let showLog = $state(false);
  /** What the last copy did, said for a few seconds over the button row (it moves nothing). */
  let said = $state<'yes' | 'no' | null>(null);
  let unsay: ReturnType<typeof setTimeout> | undefined;
  let bar = $state<HTMLElement>();
  /** The note goes under the buttons when they're too near the top of the screen for it to show over them. */
  let under = $state(false);
  function say(what: 'yes' | 'no') {
    under = (bar?.getBoundingClientRect().top ?? Infinity) < 64;
    copied = said = what;
    clearTimeout(unsay);
    unsay = setTimeout(() => (said = null), 4000);
  }
  $effect(() => () => clearTimeout(unsay));
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      say('yes');
    } catch {
      // No clipboard here (an old browser, a page not in focus): the log shown, selected, to copy by hand.
      say('no');
      showLog = true;
      queueMicrotask(() => {
        box?.focus();
        box?.select();
      });
    }
  }
</script>

{#snippet minimap(r: Row, i: number)}
  {@const H = heightOf(r)}
  {@const x = xOf(r)!}
  {@const up = i > 0 && !r.ahead ? xOf(shown[i - 1]) : null}
  {@const down = !r.ahead && i + 1 < shown.length ? xOf(shown[i + 1]) : null}
  {@const y = H / 2}
  <svg width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true">
    {#if up !== null}<path d="M{(up + x) / 2} 0L{x} {y}" stroke="#c9a45c" stroke-width="1.2" fill="none" />{/if}
    {#if down !== null}<path d="M{x} {y}L{(down + x) / 2} {H}" stroke="#c9a45c" stroke-width="1.2" fill="none" />{/if}
    {#each xs(r) as p (p.m.id)}
      {@const me = p.m.id === r.id}
      {@const kind = kindOf(p.m.id)}
      {@const fill = me && !r.ahead ? (r.fell ? '#e0553f' : '#c9a45c') : 'none'}
      {@const stroke = me && !r.ahead ? '#f1d99b' : '#6f6555'}
      {#if kind === 'boss'}
        <circle cx={p.x} cy={y} r="6" fill={r.ahead ? 'none' : '#5a1d14'} stroke={r.ahead ? '#6f6555' : '#e0553f'} stroke-width="1.1" />
        <circle cx={p.x} cy={y} r="3.2" fill="none" stroke={r.ahead ? '#6f6555' : '#e0553f'} stroke-width="0.8" />
      {:else if kind === 'town' || kind === 'camp'}
        {@const h = me ? 4.2 : 3}
        <rect x={p.x - h} y={y - h} width={h * 2} height={h * 2} {fill} {stroke} stroke-width={me ? 0.8 : 1} />
      {:else if kind === 'well'}
        <path d="M{p.x} {y - 3.6}L{p.x + 3.4} {y + 2.6}H{p.x - 3.4}Z" {fill} {stroke} stroke-width="1" />
      {:else}
        <circle cx={p.x} cy={y} r={me ? 4.3 : 3} {fill} {stroke} stroke-width={me ? 0.8 : 1} />
      {/if}
      {#if (me && r.blood) || r.tainted.has(p.m.id)}
        <circle cx={p.x} cy={y} r={me ? 7.2 : 5.6} fill="none" stroke="#e0553f" stroke-width="1.1" />
      {/if}
    {/each}
  </svg>
{/snippet}

{#snippet road()}
  <section class="panel blk" aria-labelledby="road-h" use:backdropShadow={{ fill: 'linear' }}>
    <div class="hd"><h2 id="road-h">Your road</h2><span class="aside">{wide ? 'Camp to boss, item by item' : 'Camp to boss'}</span></div>
    <div class="road-head" aria-hidden="true">
      <span></span><span>Map</span><span>Place</span><span>Items</span>{#if wide}<span class="r">Gold</span>{/if}<span class="r">Life</span>
    </div>
    <ol class="road">
      {#each rows as r, i (r.id)}
        <li class="rrow" class:ahead={r.ahead} style:height="{heightOf(r)}px" aria-label="Step {r.n.step}: {r.n.name}">
          <span class="st n">{r.n.step}</span>
          {@render minimap(r, i)}
          {#if wide}
            <span class="pl"
              ><span>{r.n.name}</span><span class="k"
                >{kindLine(r)}{#if r.blood}<span class="bt">{' '}• Blood toll{#if r.rule}{' '}• {r.rule}{/if}</span>{/if}</span
              ></span
            >
            <span class="its">
              {#each r.items as it, j (j)}
                {@const right = it.submits.at(-1)?.right}
                <span class="it" class:lostit={!right}
                  ><span class="mk" class:x={!right} aria-hidden="true">{right ? '✓' : '✕'}</span>{it.name}{#if !right}{' '}<small>lost here</small>{:else if it.misses}{' '}<small><Numbered text={it.misses === 1 ? '1 miss' : `${it.misses} misses`} /></small>{/if}</span
                >
              {/each}
              {#if r.cleared}<span class="plain gone">The corruption here is gone</span>{/if}
              {#if r.healed > 0 || r.bought > 0}
                <span class="plain"
                  >{#if r.healed > 0}You rested: <span class="n heal">+{r.healed}</span> life{/if}{#if r.healed > 0 && r.bought > 0}{' • '}{/if}{#if r.bought > 0}<Numbered text={supplyCount(r.bought)} />{/if}</span
                >
              {/if}
              {#if r.ahead}<span class="plain">Not reached</span>{/if}
            </span>
            <span class="gd n">{r.gold ? `+${r.gold}` : ''}{#if r.spent}<span class="sp">−{r.spent}</span>{/if}</span>
          {:else}
            <span class="pl">{r.n.name}{#if r.blood}<span class="bt">{' '}• Blood toll</span>{/if}</span>
            <span class="mks">
              {#each r.items as it, j (j)}
                {@const right = it.submits.at(-1)?.right}
                {#each Array.from({ length: Math.max(0, it.misses - (right ? 0 : 1)) }, (_, k) => k) as k (k)}<span class="mn" role="img" aria-label="A miss"></span>{/each}
                <span class="mk" class:x={!right} role="img" aria-label={right ? 'Named' : 'Lost here'}>{right ? '✓' : '✕'}</span>
              {/each}
              {#if r.healed > 0}<span class="heal n">+{r.healed}</span>{/if}
            </span>
          {/if}
          <span class="lf">
            {#if r.life !== null}
              {#if wide}<small class="n" class:dn={r.delta < 0} class:up={r.delta > 0}>{r.delta ? (r.delta > 0 ? `+${r.delta}` : `−${-r.delta}`) : ''}</small>{/if}
              <span class="lbar"><i style:width={pct(r.life)}></i></span><span class="n" class:dead={r.life <= 0}>{r.life}</span>
            {/if}
          </span>
        </li>
      {/each}
    </ol>
    <div class="key" aria-hidden="true">
      <span><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#c9a45c" /></svg>Your road</span>
      <span><svg width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="#c9a45c" /></svg>Town</span>
      <span><svg width="10" height="10"><path d="M5 1.2L8.6 8.2H1.4Z" fill="none" stroke="#968a77" /></svg>Well</span>
      <span><svg width="14" height="14"><circle cx="7" cy="7" r="5.6" fill="none" stroke="#e0553f" stroke-width="1.1" /></svg>Blood toll</span>
      <span><span class="mk small">✓</span>Named</span>
      <span><span class="mn"></span>A miss</span>
    </div>
  </section>
{/snippet}

{#snippet corruption()}
  <section class="panel blk" aria-labelledby="cor-h" use:backdropShadow={{ fill: 'linear' }}>
    <div class="hd"><h2 id="cor-h">Corruption</h2></div>
    <p class="cline">
      Started with <span class="n">{log.fronts.seeded}</span> • stopped <span class="n">{log.fronts.stopped}</span> •
      {#if log.fronts.aliveAtBoss !== null}<span class="n">{log.fronts.aliveAtBoss}</span> still out at the boss{:else}boss not reached{/if}
    </p>
    {#if fronts.length}
      <ul class="crows">
        {#each fronts as f, i (i)}
          <li class:off={!f.alive}>
            <span class="seal" class:stopped={!f.alive} role="img" aria-label={f.alive ? 'Still out' : 'Stopped'}><Glyph of="corrupt" /></span>
            <p><b>{f.rule}</b> • {f.line}</p>
          </li>
        {/each}
      </ul>
    {/if}
    <dl class="pairs">
      <div><dt>Boss made harder by</dt><dd>{madeHarder}</dd></div>
      <div><dt>Blood toll zones entered</dt><dd class="n">{bloodZones}</dd></div>
    </dl>
  </section>
{/snippet}

{#snippet gold()}
  <section class="panel blk" aria-labelledby="gold-h" use:backdropShadow={{ fill: 'linear' }}>
    <div class="hd"><h2 id="gold-h">Gold</h2><span class="aside"><span class="n">{s.gold}</span> left at the end</span></div>
    <div class="gbar" role="img" aria-label="{log.goldSpent} of {log.goldEarned} gold spent"><i style:width="{spentShare * 100}%"></i></div>
    <p class="cline"><span class="n">{log.goldEarned}</span> earned • <span class="n">{log.goldSpent}</span> spent</p>
    <dl class="pairs">
      <div><dt>Rewards taken</dt><dd><Numbered text={loot} /></dd></div>
    </dl>
  </section>
{/snippet}

{#snippet supplyTable()}
  <section class="panel blk" aria-labelledby="sup-h" use:backdropShadow={{ fill: 'linear' }}>
    <div class="hd"><h2 id="sup-h">Supplies</h2></div>
    {#if supplies.length}
      <table class="sup">
        <thead><tr><th>Supply</th><th>Bought</th><th>Found</th><th>Used</th></tr></thead>
        <tbody>
          {#each supplies as k (k)}
            <tr>
              <td>{SUPPLY_NAMES[k]}</td>
              {#each [log.bought[k], log.found[k], log.used[k]] as v, j (j)}<td class:z={!v}>{v}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="cline m">Nothing</p>
    {/if}
  </section>
{/snippet}

{#snippet buttons(dock: boolean)}
  <div class="ebtns" class:go={dock} class:dock bind:this={bar}>
    <!-- What the copy did, just over the buttons wherever they are (pinned at the foot or not), taking no room. -->
    <p class="copied" class:under role="status">{#if said === 'yes'}Copied: the last <span class="n">{kept.length}</span> {kept.length === 1 ? 'run' : 'runs'}, to paste to the owner.{:else if said === 'no'}It couldn't be copied here: copy it by hand from the log below.{/if}</p>
    <button class="btn" onclick={copy}>Copy run log</button>
    <button class="btn primary" onclick={() => (onnew ? onnew() : play.start())}>New run</button>
  </div>
{/snippet}

{#snippet foot()}
  <p class="foot">
    The log holds the last <span class="n">{kept.length}</span> {kept.length === 1 ? 'run' : 'runs'} on this device.
    {#if !showLog}<button class="link" onclick={() => (showLog = true)}>Show the log</button>{/if}
  </p>
{/snippet}

<div class="end" class:wide>
  <header class="screen-title">
    <p class="kicker">{won ? 'The boss is beaten' : `Fell at ${node(log.endedOn?.node ?? s.at)}`}</p>
    <h1 class:lost={!won}>{won ? 'The run is won' : 'The run is lost'}</h1>
    <p class="sub">
      {#if won}<span class="n">{named}</span> items named, with <span class="n">{log.lifeEnd}</span> life left.{:else}<span class="it">{log.endedOn?.name ?? 'The road'}</span> took the last of your life.{/if}
    </p>
  </header>

  <dl class="facts" aria-label="The run in numbers">
    <div><dt>Named</dt><dd>{named}</dd></div>
    <div><dt>Misses</dt><dd>{log.misses}</dd></div>
    <div><dt>Time</dt><dd>{minutes}<small>min</small></dd></div>
    {#if won}
      <div><dt>Life at the end</dt><dd>{log.lifeEnd}</dd></div>
    {:else}
      <div><dt>Reached</dt><dd>Step {reachedStep}<small>/{GRAPH.boss.step}</small></dd></div>
    {/if}
    <div><dt>Flask drinks</dt><dd>{log.drinks}</dd></div>
    <div><dt>Gold left</dt><dd>{s.gold}</dd></div>
  </dl>

  {#if wide}
    <div class="ecols">
      <div class="lcol">{@render road()}</div>
      <div class="rcol">
        {@render corruption()}
        {@render gold()}
        {@render supplyTable()}
        <div class="fill"></div>
        {@render buttons(false)}
        {@render foot()}
      </div>
    </div>
  {:else}
    {@render road()}
    {@render corruption()}
    {@render gold()}
    <section class="panel blk" aria-labelledby="items-h" use:backdropShadow={{ fill: 'linear' }}>
      <div class="hd"><h2 id="items-h">Item by item</h2></div>
      <ol class="items">
        {#each log.items as it, i (i)}
          {@const right = it.submits.at(-1)?.right}
          <li class:lostit={!right}>
            <span class="no n">{i + 1}</span>
            <span class="what">
              <span class="nm">{it.name}</span>
              <span class="wh">{where(it)} • {it.category}{#if it.corruption}{' '}• <span class="bt">Blood toll</span>{/if}</span>
            </span>
            <span class="res">
              {#if right}{#if it.misses}<span class="n">{it.misses}</span> {it.misses === 1 ? 'miss' : 'misses'}{' • '}{/if}{#if it.gold}<span class="n">+{it.gold}</span> gold{:else}Named{/if}{:else}<span class="red">Lost here</span>{/if}{#if it.supplies.length}{' • '}<span class="n">{it.supplies.length}</span> {it.supplies.length === 1 ? 'supply' : 'supplies'}{/if}
            </span>
          </li>
        {/each}
      </ol>
    </section>
    {@render supplyTable()}
    {@render foot()}
  {/if}

  {#if showLog}
    <section class="panel" aria-labelledby="log-h" use:backdropShadow={{ fill: 'linear' }}>
      <h2 id="log-h">Run log</h2>
      <p class="note">{copied === 'no' ? "It couldn't be copied here: select it all and copy it by hand." : 'Every run kept on this device, newest last.'}</p>
      <textarea bind:this={box} readonly rows="8" value={text}></textarea>
    </section>
  {/if}

  {#if !wide}{@render buttons(true)}{/if}
</div>

<style>
  .end {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 44rem;
    margin: 0 auto;
  }
  /* Wide: the board's 1300 across, wider than the page's column (centred over it). */
  .end.wide {
    align-self: center;
    width: min(1300px, calc(100vw - 48px));
    max-width: none;
    gap: 14px;
  }
  p {
    margin: 0;
  }
  h1.lost {
    color: #f0b3a0;
  }
  .end .screen-title .sub {
    font-style: normal;
    font-size: 17px;
    line-height: 1.3;
    color: #e6dccb;
  }
  .sub .it {
    color: var(--unique-hi);
    font-weight: 600;
  }

  /* The run in numbers: a label in small capitals over a Cinzel value. */
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 10px;
  }
  .wide .facts {
    width: min(960px, 100%);
    margin: 0 auto;
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .facts > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 4px 7px;
    border-bottom: 1px solid rgba(125, 99, 51, 0.22);
  }
  .facts dt {
    font-family: var(--font-cinzel);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .facts dd {
    margin: 0;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 20px;
    line-height: 1.1;
    color: var(--gold-hi);
    white-space: nowrap;
  }
  .wide .facts dd {
    font-size: 22px;
  }
  .facts dd small {
    margin-left: 2px;
    font-size: 12px;
    color: var(--muted);
  }

  /* A framed block, its heading in small capitals with a note beside it. */
  .blk {
    padding: 12px;
  }
  .wide .lcol .blk {
    padding: 14px 18px;
  }
  .hd {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
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

  /* Your road: one row per step, top (camp) to bottom (boss), as on the map. */
  .road {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .rrow,
  .road-head {
    display: grid;
    grid-template-columns: 16px 50px minmax(0, 1fr) 54px 56px;
    column-gap: 6px;
    align-items: center;
  }
  .wide .rrow,
  .wide .road-head {
    grid-template-columns: 18px 92px 210px minmax(0, 1fr) 74px 108px;
    column-gap: 12px;
  }
  .rrow {
    border-top: 1px solid rgba(125, 99, 51, 0.16);
  }
  .rrow:first-child {
    border-top: 0;
  }
  .road-head {
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(125, 99, 51, 0.3);
  }
  .road-head span {
    font-family: var(--font-cinzel);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .road-head .r {
    text-align: right;
  }
  .rrow .st {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }
  .rrow svg {
    display: block;
    overflow: visible;
  }
  .rrow .pl {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 14px;
    color: #e6dccb;
  }
  .wide .rrow .pl {
    display: flex;
    flex-direction: column;
    white-space: normal;
    line-height: 1.2;
    font-size: 15px;
  }
  .wide .rrow .pl > span:first-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rrow .pl .k {
    font-size: 12.5px;
    color: var(--muted);
  }
  .bt {
    font-size: 12.5px;
    color: #f0a68c;
  }
  .rrow.ahead .pl,
  .rrow.ahead .st {
    color: #6f6555;
  }
  .rrow.ahead .pl .k {
    color: #6f6555;
  }
  .mks {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .rrow .heal {
    font-size: 12px;
    color: #a9cf8f;
  }
  .its {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 12px;
    font-size: 14.5px;
    line-height: 1.25;
  }
  .its .it {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--unique-hi);
    white-space: nowrap;
  }
  .its .it.lostit {
    color: #f0b3a0;
  }
  .its .it small {
    font-size: 12.5px;
    color: #f0a68c;
  }
  .its .it small :global(.n) {
    color: #f0a68c;
  }
  .its .plain {
    font-size: 13.5px;
    color: var(--muted);
  }
  .its .plain.gone {
    color: #cdb79a;
  }
  .gd {
    font-size: 12.5px;
    line-height: 1.3;
    text-align: right;
    color: var(--gold-hi);
  }
  /* Gold spent here, under what was earned. */
  .gd .sp {
    display: block;
    color: #a99a80;
  }
  .lf {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
  }
  .lf .n {
    min-width: 18px;
    font-size: 12.5px;
    text-align: right;
    color: #e6dccb;
  }
  .wide .lf .n {
    min-width: 24px;
    font-size: 13.5px;
  }
  .lf .n.dead {
    color: #f0a68c;
  }
  .lf small.n {
    min-width: 26px;
    font-size: 11px;
  }
  .lf small.dn {
    color: #f0a68c;
  }
  .lf small.up {
    color: #a9cf8f;
  }
  .wide .its .n.heal {
    color: #a9cf8f;
  }
  /* Life after each step: a short vessel. */
  .lbar {
    position: relative;
    width: 28px;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 0 1px rgba(125, 99, 51, 0.4);
    overflow: hidden;
  }
  .wide .lbar {
    width: 56px;
    height: 6px;
  }
  .lbar i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(180deg, #ff8a68 0%, #ec3a48 42%, #9c0f2c 100%);
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .key > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .key svg {
    display: block;
  }
  /* An item's mark: a small cut square, green for named, red for the one that ended the run; a red notch per miss before it. */
  .mk {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border-radius: 2px;
    border: 1px solid rgba(150, 200, 105, 0.7);
    background: rgba(150, 200, 105, 0.16);
    color: #c2e3a6;
    font-size: 10px;
    line-height: 1;
  }
  .mk.small {
    width: 12px;
    height: 12px;
    font-size: 9px;
  }
  .mk.x {
    border-color: rgba(224, 85, 63, 0.85);
    background: rgba(224, 85, 63, 0.2);
    color: #f0a68c;
  }
  .mn {
    display: inline-block;
    width: 3px;
    height: 12px;
    margin-right: -1px;
    border-radius: 1px;
    background: #e0553f;
  }

  /* Corruption and gold. */
  .cline {
    font-size: 15px;
    line-height: 1.3;
    color: #e6dccb;
  }
  .cline.m {
    font-size: 14px;
    color: var(--muted);
  }
  .crows {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .crows li {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    column-gap: 10px;
    align-items: center;
    padding: 5px 0;
    border-top: 1px solid rgba(125, 99, 51, 0.16);
  }
  .crows li:first-child {
    border-top: 0;
  }
  .crows p {
    font-size: 14.5px;
    line-height: 1.25;
    color: #e6dccb;
  }
  .crows b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: #f0a68c;
  }
  .crows li.off b {
    color: #a99a80;
  }
  /* The corruption's seal: a Vaal Orb's swirl in a red ring; struck through and dimmed once stopped. */
  .seal {
    position: relative;
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
  .seal.stopped {
    border-color: rgba(125, 99, 51, 0.5);
    color: #7a6e5c;
  }
  .seal.stopped::after {
    content: '';
    position: absolute;
    left: 3px;
    right: 3px;
    top: 50%;
    height: 1px;
    background: #a99a80;
    rotate: -35deg;
  }
  .pairs {
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pairs > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-size: 14px;
  }
  .pairs dt {
    color: var(--muted);
  }
  .pairs dd {
    margin: 0;
    text-align: right;
    color: #e6dccb;
  }
  .gbar {
    display: flex;
    height: 7px;
    margin: 6px 0;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(125, 99, 51, 0.45);
    background: rgba(255, 255, 255, 0.05);
  }
  .gbar i {
    display: block;
    height: 100%;
    background: #b8893f;
  }

  /* Item by item (phones). */
  .items {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .items li {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    column-gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-top: 1px solid rgba(125, 99, 51, 0.16);
  }
  .items li:first-child {
    border-top: 0;
  }
  .items .no {
    grid-row: span 2;
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }
  .items .what {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .items .nm {
    font-weight: 600;
    font-size: 15px;
    line-height: 1.2;
    color: var(--unique-hi);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .items li.lostit .nm {
    color: #f0b3a0;
  }
  .items .wh,
  .items .res {
    font-size: 12.5px;
    line-height: 1.25;
    color: var(--muted);
  }
  .items .wh {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .items .res {
    grid-column: 2;
  }
  .items .res :global(.n) {
    font-size: 12px;
    color: #e6dccb;
  }
  .items .red {
    color: #f0a68c;
  }

  /* Supplies: bought, found, used. */
  .sup {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .sup th {
    padding: 0 0 4px;
    font-family: var(--font-cinzel);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-align: right;
    color: var(--muted);
    border-bottom: 1px solid rgba(125, 99, 51, 0.3);
  }
  .sup th:first-child {
    text-align: left;
  }
  .sup td {
    padding: 3px 0;
    text-align: right;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 12.5px;
    color: #e6dccb;
    border-top: 1px solid rgba(125, 99, 51, 0.12);
  }
  .sup td:first-child {
    text-align: left;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 14px;
  }
  .sup td.z {
    color: #5f574a;
  }

  /* Wide: the road on the left, the rest and the buttons on the right. */
  .ecols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    column-gap: 28px;
    align-items: stretch;
  }
  .lcol {
    min-width: 0;
  }
  .rcol {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .rcol .fill {
    flex: 1;
  }

  /* The buttons: Copy run log (cut metal) beside New run (gold); docked at the foot on phones. */
  .ebtns {
    position: relative;
    display: flex;
    gap: 12px;
  }
  .ebtns .btn {
    flex: 1 1 0;
    min-width: 0;
    padding: 1em 0.8em;
    font-size: 14px;
  }
  .ebtns.go.dock {
    flex-wrap: nowrap;
    gap: 10px;
  }
  .ebtns.go.dock .btn {
    flex: 1 1 0;
    padding: 0.95em 0.6em;
    font-size: 13.5px;
  }
  .copied {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 50%;
    translate: -50% 0;
    width: max-content;
    max-width: calc(100% - 1rem);
    margin: 0;
    padding: 5px 12px;
    border: 1px solid rgba(201, 164, 92, 0.55);
    border-radius: 4px;
    background: rgb(18, 14, 10);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
    font-size: 14.5px;
    text-align: center;
    color: #f1d99b;
    pointer-events: none;
    z-index: 1;
  }
  .copied.under {
    top: calc(100% + 0.5rem);
    bottom: auto;
  }
  /* Empty, it takes no room but stays in the page, so a screen reader hears what comes into it. */
  .copied:empty {
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    box-shadow: none;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .foot {
    text-align: center;
    font-size: 14px;
    color: var(--muted);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--gold);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .note {
    margin: 0.3rem 0 0.5rem;
    font-size: 0.92rem;
    color: var(--muted);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
    color: var(--text);
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.5rem;
    user-select: text;
    cursor: text;
  }
</style>
