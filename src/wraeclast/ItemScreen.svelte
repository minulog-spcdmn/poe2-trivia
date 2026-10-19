<script lang="ts">
  // An item, as the design lays it out: the tooltip (the name plate, the art
  // in its square frame beside what is known of it), the pack, the answer
  // line and the tiles, and the dock: what a miss costs and the loot a right
  // name drops, the flask's drink, and Identify. After a miss the dock says
  // what it cost. Phones stack it all, the dock pinned at the foot; a short
  // phone keeps the pack in a tray the dock's pack key opens. Wide screens
  // set the tooltip beside the answer line, the dock under both.
  //
  // Named, the screen turns into the reveal: the tooltip whole, the loot's
  // cards flying into the pack (a supply that doesn't fit is held over a full
  // pack until a space is tapped, or it's left), and the way on in one tap:
  // Next item in the dock, or on a zone's last item the places one step
  // ahead as rows (the whole map one tap more).
  import { tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import NamePlate from '../components/NamePlate.svelte';
  import { motion } from '../lib/motion.svelte';
  import { BOSS_MOD_NAMES, CLUES, PACK_STACKS, SUPPLY_NAMES, type LootCard, type Place, type Run, type Supply } from './rules';
  import Veil from './Veil.svelte';
  import Clues from './Clues.svelte';
  import ItemPack from './ItemPack.svelte';
  import Inscription from './Inscription.svelte';
  import Glyph from './Glyph.svelte';
  import { BLOOD_DOES, BOSS_MOD_DOES, BOSS_RULE, DRINK_LINE, SHORT, ZONE_RULE, bloodLine, bossAdds, lootLine, placeDoes, placeKind, plural, zoneLines } from './words';

  /** `onmap`: the whole map, opened from the reveal's Where next. */
  let { run, onmap }: { run: Run; onmap?: () => void } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const named = $derived(s.phase === 'solved');
  const boss = $derived(it.boss !== null);
  const [lo, hi] = $derived(run.missRange());
  const healed = $derived(it.log.healed);
  const last = $derived(it.log.submits.at(-1));
  /** The last wrong submit, while its marked line stands. */
  const miss = $derived(it.lineMarks && last && !last.right ? last : null);
  /** The loot a right name drops now: the zone's cards (corruption's too) less one a miss, never below 1. */
  const full = $derived(named ? it.log.loot.length + it.misses : run.dealHere());
  const deal = $derived(boss ? 0 : named ? it.log.loot.length : Math.max(1, full - it.misses));
  const lost = $derived(boss ? 0 : full - deal);
  const ahead = $derived(run.ahead());
  const pending = $derived(s.loot?.pending[0] ?? null);
  /** The corruption here stopped as the zone's last item was named. */
  const cleared = $derived(named && !!it.hidden && s.fronts.some((f) => f.stoppedAt === it.node));
  /** The zone's rule on the plate (none for a zone without one; the boss's own line says Silent). */
  const rule = $derived(!boss && it.zoneType ? (ZONE_RULE[it.zoneType] ?? '') : '');
  /** The plate's terms in full, one line each, for a long press or a hover. */
  const terms = $derived(
    [it.hidden ? `Blood toll: ${BLOOD_DOES}` : '', boss ? BOSS_RULE : rule, ...(boss ? s.bossMods.map((m) => `${BOSS_MOD_NAMES[m]}: ${BOSS_MOD_DOES[m]}`) : [])].filter(Boolean).join('\n'),
  );
  /** The board's height, about (rows of tiles at a phone's width), for the art to give way to it on a short screen. */
  const boardH = $derived.by(() => {
    const dense = it.tiles.length > 26;
    return Math.ceil(it.tiles.length / (dense ? 7.5 : 6.5)) * (dense ? 38 : 45);
  });
  let plateScale = $state<number>();
  let art = $state<HTMLElement>();
  let ins = $state<HTMLElement>();

  /** A short phone (375 by 667): the pack goes in a tray over the dock. */
  const short = new MediaQuery('(max-width: 699px) and (max-height: 740px)');
  let tray = $state(false);

  /** A supply used: what it changed brought into view (on a phone the art is above the pack, the line under it). */
  function used(what: Supply) {
    tray = false;
    const to = what === 'first' || what === 'decoy' || what === 'lengths' ? ins : art;
    to?.scrollIntoView({ block: 'nearest', behavior: motion.still ? 'auto' : 'smooth' });
  }

  // ---- The reveal ----

  const place = $derived(s.places[s.at]);
  /** The visit's last item is named. */
  const lastHere = $derived(named && !!s.visit && s.visit.done + 1 >= s.visit.items);
  /** An Expedition's last item: its vendor comes next. */
  const expedition = $derived(lastHere && place.kind === 'zone' && place.type === 'expedition');
  /** A zone's last item: the places one step ahead (shown dimmed while a supply waits for a space). */
  const ways = $derived(lastHere && place.kind === 'zone' && place.type !== 'expedition' ? run.graph.next[s.at] : []);
  const nextStep = $derived(ways.length ? run.graph.byId.get(ways[0])!.step : 0);
  /** The loot's cards (none at the boss). */
  const cards = $derived<LootCard[]>(named && !boss ? (s.loot?.cards ?? it.log.loot) : []);
  /** The cards still waiting for a space, by their place among the cards. */
  const held = $derived.by(() => {
    const at = new Set<number>();
    for (const p of s.loot?.pending ?? []) {
      const k = cards.findIndex((c, i) => !at.has(i) && c.kind === p.kind && c.supply === p.supply && c.n === p.n);
      if (k >= 0) at.add(k);
    }
    return at;
  });
  /** Held as the item was named: these never fly; once settled, they fade. */
  let heldFirst = $state<Set<number>>(new Set());
  /** Room kept for the full pack's question for the whole reveal, so nothing under it moves once it's answered. */
  let asked = $state(false);
  /** What the loot added to each pack space: the cards that went straight in (on their supply's first space), and a held one that replaced a space. */
  const plus = $derived.by(() => {
    const add: number[] = Array.from({ length: PACK_STACKS }, () => 0);
    const by: Partial<Record<Supply, number>> = {};
    cards.forEach((c, k) => {
      if (c.kind === 'supply' && !heldFirst.has(k)) by[c.supply!] = (by[c.supply!] ?? 0) + c.n;
    });
    for (const [sp, n] of Object.entries(by) as [Supply, number][]) {
      const i = s.pack.findIndex((st) => st.supply === sp);
      if (i >= 0) add[i] += n;
    }
    for (const r of it.log.replaced) if (s.pack[r.slot]?.supply === r.by.supply) add[r.slot] += r.by.n;
    return add;
  });

  let tipEl = $state<HTMLElement>();
  let headEl = $state<HTMLElement>();
  let sideEl = $state<HTMLElement>();
  const cardEls: HTMLElement[] = [];
  const slotEls: HTMLElement[] = [];
  /** The tooltip's body height on a phone: what the window leaves under the run bar, over the loot, the pack, Where next and the dock. */
  let rh = $state<number>();
  /** Each flying card's way to where it lands, once measured. */
  let flights = $state<{ dx: number; dy: number }[]>([]);

  /** Where a card lands: its supply's first space, or the gold and the flask on the run bar. */
  function landing(c: LootCard): Element | null {
    if (c.kind === 'supply') return slotEls[s.pack.findIndex((st) => st.supply === c.supply)] ?? null;
    return document.querySelector(`[data-fly="${c.kind === 'gold' ? 'gold' : 'flask'}"]`);
  }

  async function measure() {
    if (!tipEl || !headEl || !sideEl) return;
    const top = tipEl.getBoundingClientRect().top + scrollY;
    rh = Math.round(Math.max(150, Math.min(340, innerHeight - top - headEl.offsetHeight - sideEl.offsetHeight - 14)));
    await tick();
    flights = cards.map((c, k) => {
      const from = cardEls[k]?.getBoundingClientRect();
      const to = landing(c)?.getBoundingClientRect();
      if (!from || !to) return { dx: 0, dy: 0 };
      return { dx: Math.round(to.left + to.width / 2 - (from.left + from.width / 2)), dy: Math.round(to.top + to.height / 2 - (from.top + from.height / 2)) };
    });
  }

  // Named: the reveal starts at the top of the page (the tiles above it are gone), sized to the window, its loot on its way.
  $effect(() => {
    if (!named) return;
    untrack(() => {
      tray = false;
      heldFirst = new Set(held);
      asked = held.size > 0;
      scrollTo({ top: 0 });
    });
    const raf = requestAnimationFrame(() => void measure());
    return () => cancelAnimationFrame(raf);
  });

  /** A place's row under Where next: its kind, its lines (a Blood toll's red), and all of it said. */
  function row(id: string) {
    const n = run.graph.byId.get(id)!;
    const p: Place = s.places[id];
    const bad = run.corrupted(id);
    const lines: { text: string; toll?: boolean }[] = [];
    if (p.kind === 'zone') {
      const z = zoneLines(run, p.type);
      lines.push({ text: z.free });
      if (z.rule) lines.push({ text: z.rule });
    } else {
      lines.push({ text: placeDoes(run, p) });
      if (p.kind === 'boss') lines.push({ text: bossAdds(run) });
    }
    const front = bad ? s.fronts.find((f) => f.alive && f.at === id) : undefined;
    const said = [`Go to ${n.name}: ${placeKind(p)}`, ...lines.map((l) => l.text)].join(', ');
    return {
      n,
      p,
      bad,
      lines,
      blood: bad ? bloodLine(run) : '',
      bossIf: front ? `If it reaches the boss: ${BOSS_MOD_NAMES[front.rule]}` : '',
      label: bad ? `${said}. Blood toll (corruption): ${bloodLine(run).replace(' • ', ', ')}${front ? `. If it reaches the boss: ${BOSS_MOD_NAMES[front.rule]}` : ''}` : said,
    };
  }
</script>

{#snippet placeMark(p: Place, bad: boolean)}
  {#if bad}
    <Glyph of="corrupt" />
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">
      {#if p.kind === 'well'}
        <path d="M5 12.5h14M6.4 12.5v7.6h11.2v-7.6M7.6 12.5V6.2M16.4 12.5V6.2M5.4 6.2 12 3.4l6.6 2.8z" /><path d="M12 6.2v2.4M10.6 8.6h2.8v2h-2.8z" stroke-width=".9" /><path
          d="M6.4 16.3h11.2"
          stroke-width=".8"
        />
      {:else if p.kind === 'town' || p.kind === 'camp'}
        <path d="M4.5 20.5v-9L12 5.5l7.5 6v9M9.6 20.5v-5.4h4.8v5.4M2.8 20.5h18.4" /><path d="M12 2.5v3" stroke-width=".9" />
      {:else if p.kind === 'boss'}
        <path d="M4 17.5 5.6 7.8l4 4.2L12 5l2.4 7 4-4.2L20 17.5z" /><path d="M4 20.5h16" /><circle cx="12" cy="14.6" r="1.1" stroke-width=".9" />
      {:else}
        <path d="M12 3 20 12 12 21 4 12z" /><path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-width=".9" />
      {/if}
    </svg>
  {/if}
{/snippet}

{#snippet chev()}
  <svg class="chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
{/snippet}

{#snippet plate()}
  <div class="head" bind:this={headEl} style:--plate-scale={plateScale}>
    <NamePlate fit bind:scale={plateScale} />
    <div class="head-text">
      {#if named}
        <span class="iname">{it.log.name}</span>
        <span class="ibase">{CLUES[it.itemId].base}</span>
      {:else}
        <span class="iname unknown">Unidentified</span>
        {#if boss || rule}
          <span class="terms" title={terms}>
            {#if boss}<span class="corrupt-line">Boss: {['Silent', ...s.bossMods.map((m) => BOSS_MOD_NAMES[m])].join(' • ')}</span>{:else if rule}<span class="rule-line">{rule}</span>{/if}
          </span>
        {/if}
      {/if}
    </div>
  </div>
{/snippet}

<!-- One tree for the item and its reveal, so the tooltip (its Veil mid-finale) stays as it is named. -->
<div class="item" class:reveal={named} style:--board="{boardH}px" style:--rh={named && rh ? `${rh}px` : undefined}>
  <div class="desk">
    <div class="col">
      <section class="tip" class:good={named} class:corrupted={!named && boss && s.bossMods.length > 0} bind:this={tipEl} aria-label="The item">
        {@render plate()}
        <div class="ibody">
          <div class="art" bind:this={art}>
            <div class="frame"><Veil {run} /></div>
          </div>
          <Clues {run} beside={short.current} />
        </div>
      </section>
      {#if !named && !short.current}<ItemPack {run} onuse={used} />{/if}
    </div>

  {#if named}
    <div class="side" bind:this={sideEl}>
      {#if cards.length}
        <div class="flyrow" role="img" aria-label="The loot: {plural(cards.length, 'card')}, going into your pack">
          {#each cards as c, k (k)}
            {@const f = flights[k]}
            {@const wait = held.has(k)}
            <div
              class="mcard"
              class:held={wait}
              class:fly={!wait && !heldFirst.has(k) && !!f && !motion.still}
              class:settle={!wait && (heldFirst.has(k) || (motion.still && !!f))}
              style:--dx="{f?.dx ?? 0}px"
              style:--dy="{f?.dy ?? 0}px"
              style:--k={k}
              bind:this={cardEls[k]}
            >
              <span class="ic"><Glyph of={c.kind === 'supply' ? c.supply! : c.kind} /></span>
              <span class="nm">{lootLine(c).name}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="rpack" role="group" aria-label="Your pack: {s.pack.length} of {PACK_STACKS} spaces used">
        {#each Array.from({ length: PACK_STACKS }, (_, i) => i) as i (i)}
          {@const st = s.pack[i]}
          {#if st && pending}
            <button class="slot target" bind:this={slotEls[i]} onclick={() => run.keep(i)} aria-label="Replace {st.n} {SUPPLY_NAMES[st.supply]} with the new supply" title="{st.n} {SUPPLY_NAMES[st.supply]}">
              <span class="n" aria-hidden="true">{st.n}</span>
              <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span>
              <span class="lbl" aria-hidden="true">{SHORT[st.supply]}</span>
            </button>
          {:else if st}
            <span
              class="slot"
              class:gets={plus[i] > 0}
              bind:this={slotEls[i]}
              role="img"
              aria-label="{SUPPLY_NAMES[st.supply]}: {st.n} in your pack{plus[i] ? `, ${plus[i]} new` : ''}"
              title="{st.n} {SUPPLY_NAMES[st.supply]}"
            >
              <span class="n" aria-hidden="true">{st.n}</span>
              {#if plus[i]}<span class="plus" aria-hidden="true">+{plus[i]}</span>{/if}
              <span class="ic" aria-hidden="true"><Glyph of={st.supply} /></span>
              <span class="lbl" aria-hidden="true">{SHORT[st.supply]}</span>
            </span>
          {:else}
            <span class="slot empty" bind:this={slotEls[i]} role="img" aria-label="Empty space"></span>
          {/if}
        {/each}
      </div>

      {#if asked}
        <div class="fullask" role={pending ? 'alertdialog' : undefined} aria-label={pending ? 'Pack full' : undefined}>
          {#if pending}
            <p>Pack full. Tap a space to replace it with <b>{pending.n} {SUPPLY_NAMES[pending.supply!]}</b>.</p>
            <button class="btn ghost small" onclick={() => run.keep(null)}>{pending.n === 1 ? 'Leave it' : 'Leave them'}</button>
          {/if}
        </div>
      {/if}

      {#if ways.length || expedition}
        <section class="wn" class:resting={!!pending} aria-labelledby="wn-h">
          <div class="wn-head">
            <h2 id="wn-h">Where next</h2>
            {#if ways.length}<span class="stp">Step <span class="n">{nextStep}</span> of <span class="n">{run.graph.boss.step}</span></span>{/if}
            <span class="grow"></span>
            {#if ways.length && onmap}
              <button class="btn ghost small" onclick={onmap} disabled={!!pending} aria-label="The whole map">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"
                  ><path d="M3.5 6.2 9 4.2l6 2 5.5-2v13.6l-5.5 2-6-2-5.5 2z" /><path d="M9 4.2v13.6M15 6.2v13.6" stroke-width=".9" /></svg
                >Map
              </button>
            {/if}
          </div>
          {#if expedition}
            <button class="place" disabled={!!pending} onclick={() => run.next()} aria-label="Go to the Expedition vendor: buy before you go on">
              <span class="k">{@render placeMark({ kind: 'town' } as Place, false)}</span>
              <span class="tx"><span class="nm">Expedition vendor</span><span class="ln">Buy before you go on</span></span>
              {@render chev()}
            </button>
          {:else}
            {#each ways as id (id)}
              {@const r = row(id)}
              <button class="place" class:cor={r.bad} disabled={!!pending} onclick={() => run.choose(id)} aria-label={r.label}>
                <span class="k">{@render placeMark(r.p, r.bad)}</span>
                <span class="tx">
                  <span class="nm">{r.n.name}<span class="kd">{placeKind(r.p)}</span></span>
                  {#each r.lines as l, j (j)}<span class="ln">{l.text}</span>{/each}
                  {#if r.bad}<span class="ln t"><b>Blood toll</b> • {r.blood}</span>{/if}
                  {#if r.bossIf}<span class="ln t">{r.bossIf}</span>{/if}
                </span>
                {@render chev()}
              </button>
            {/each}
          {/if}
        </section>
      {/if}

      <div class="dock">
        <div class="result" role="status">
          <span class="vsign" aria-hidden="true">✓</span>
          <p>
            {it.log.name}
            <small
              >{#if boss}Named{:else}{it.misses ? plural(it.misses, 'miss') : 'First try'}{#if it.hidden}{' '}• Blood toll: double loot{/if}{/if}{#if healed}{' '}• Your flask healed <b>{healed}</b> life{/if}{#if cleared}{' '}• The corruption here is gone{/if}</small
            >
          </p>
        </div>
        {#if ahead === 'item' || ahead === 'win'}
          <button class="btn primary" onclick={() => run.next()}>{ahead === 'win' ? 'Claim the win' : 'Next item'}</button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="col" bind:this={ins}><Inscription {run} /></div>
  {/if}
  </div>

  {#if !named}
    <div class="dock" class:short={short.current}>
      {#if short.current && tray}
        <div class="tray" role="dialog" aria-label="Your pack">
          <div class="tray-head"><h2>Your pack</h2></div>
          <ItemPack {run} onuse={used} tray />
        </div>
      {/if}
      {#if miss}
        <div class="result" role="status">
          <span class="vsign bad" aria-hidden="true">✕</span>
          <span class="lost-vial" aria-hidden="true"></span>
          <p>
            <b class="minus">−{miss.lost}</b> life
            <small>{#if boss}A miss costs <b>{lo}</b> to <b>{hi}</b> life{:else}<span class="deal" class:many={full > 4} aria-hidden="true">{#each Array.from({ length: full }, (_, k) => k) as k (k)}<i class:lost={k >= deal}></i>{/each}</span>Loot: {plural(deal, 'card')} now{/if}</small>
          </p>
        </div>
      {:else}
        <div class="stakes">
          <div class="row miss">Miss: <b>{lo}</b> to <b>{hi}</b> life</div>
          {#if boss}
            <div class="row reward">No loot at the boss</div>
          {:else}
            <div class="row reward">
              <span class="deal" class:many={full > 4} aria-hidden="true"
                >{#each Array.from({ length: full }, (_, k) => k) as k (k)}<i class:lost={k >= deal} class:extra={!!it.hidden && k >= full / 2 && k < deal}></i>{/each}</span
              >Loot: {plural(deal, 'card')}{#if lost}{' '}<s>{full}</s>{/if}<span class="inline-note"> • a miss takes one</span>
            </div>
          {/if}
          {#if run.blocked() === 'tried'}<div class="row warn">You tried this one. Change a tile</div>{:else if s.life <= lo}<div class="row warn">Low life: one miss ends the run</div>{:else if !boss}<div
              class="row note"
            >
              a miss takes one
            </div>{/if}
        </div>
      {/if}
      {#if short.current}
        <button class="packbtn" class:on={tray} onclick={() => (tray = !tray)} aria-label="Your pack" aria-expanded={tray}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
            ><path d="M9.4 6.5V5.2c0-.9.7-1.6 1.6-1.6h2c.9 0 1.6.7 1.6 1.6v1.3" /><path
              d="M5.6 9.2c0-1.5 1.2-2.7 2.7-2.7h7.4c1.5 0 2.7 1.2 2.7 2.7l.9 9.4c.1 1-.7 1.9-1.7 1.9H6.4c-1 0-1.8-.9-1.7-1.9z"
            /><path d="M5.7 10.6c4.1 1.9 8.5 1.9 12.6 0" /><path d="M10.6 11.6h2.8v2.6h-2.8z" /></svg
          >
        </button>
      {/if}
      <button class="drink" disabled={!run.canDrink()} onclick={() => run.drink()} aria-label="Drink from your flask: {s.flask.charges} left" title={DRINK_LINE}>
        <span class="ic" aria-hidden="true"><Glyph of="flask" /></span><span class="n" aria-hidden="true">{s.flask.charges}</span>
      </button>
      <button class="btn primary" disabled={!run.canSubmit()} onclick={() => run.submit()}>Identify</button>
    </div>
  {/if}
</div>

<style>
  /* Laid out by its own width (the page's, or a cell's on the QA desk). */
  .item {
    container: item / inline-size;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .desk {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* The game's tooltip box (QuestionView .tooltip). */
  .tip {
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    background: rgba(5, 4, 3, 0.92);
    box-shadow:
      0 0 0 1px #000,
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .tip.good {
    border-color: #4f7a45;
    box-shadow:
      0 0 0 1px #000,
      0 0 50px rgba(150, 190, 110, 0.12),
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .tip.corrupted {
    border-color: #7a1c14;
    box-shadow:
      0 0 0 1px #000,
      0 0 40px rgba(210, 0, 0, 0.12),
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    min-height: 54px;
    place-items: center;
    padding: 0 3.2rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: baseline;
    column-gap: 0.6em;
    line-height: 1.15;
    text-align: center;
  }
  .iname {
    flex-basis: 100%;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 19px;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .iname.unknown {
    font-size: 16.8px;
    letter-spacing: 0.1em;
    color: #c8c8c8;
    text-shadow: none;
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 15.2px;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* The item's terms under its name, as the game adds a line to the plate:
     the boss's rules red, a zone's rule cool. */
  .terms {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    column-gap: 0.6em;
    font-family: var(--font-cinzel);
    font-weight: 500;
    font-size: 12px;
    line-height: 1.2;
    letter-spacing: 0.04em;
  }
  .corrupt-line {
    color: #f0574a;
  }
  .rule-line {
    color: #a9c3dc;
  }
  /* The body under the plate: the square frame beside what is known. */
  .ibody {
    display: flex;
    align-items: stretch;
  }
  /* The art stage, square for every item: a warm glow behind the art, cool
     rim light, a vignette, dithered (no banding). */
  .art {
    position: relative;
    flex: none;
    /* On a phone the art gives way to the board, so a full one (the boss's) still shows above the dock. */
    width: clamp(84px, calc(100dvh - 400px - var(--board, 0px)), min(42%, 220px));
    aspect-ratio: 1;
    align-self: flex-start;
    padding: 8px;
    border-right: 1px solid #2a1c10;
    border-bottom: 1px solid #2a1c10;
    background:
      var(--dither),
      radial-gradient(ellipse 55% 50% at 50% 52%, rgba(175, 96, 37, 0.16), transparent 70%),
      radial-gradient(ellipse 80% 45% at 50% 0%, rgba(90, 110, 160, 0.1), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
    image-rendering: pixelated;
    box-shadow:
      inset 0 1px 0 rgba(201, 164, 92, 0.12),
      inset 0 0 40px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .art > * {
    image-rendering: auto;
  }
  .tip.good .art {
    background:
      var(--dither),
      radial-gradient(ellipse 55% 50% at 50% 52%, rgba(150, 185, 105, 0.16), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
  }
  .tip.corrupted .art {
    background:
      var(--dither),
      radial-gradient(ellipse 60% 55% at 50% 52%, rgba(200, 30, 20, 0.22), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .ibody :global(.lines) {
    flex: 1;
  }

  /* ---- The reveal ---- */
  .reveal .desk {
    gap: 8px;
  }
  .side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Phones: the tooltip takes what the window leaves over the loot, the pack, Where next and the dock; its lines fade where they run out. */
  .reveal .ibody {
    height: var(--rh, 200px);
    container-type: size;
    overflow: hidden;
  }
  .reveal .art {
    width: min(46cqw, 100cqh);
    height: min(46cqw, 100cqh);
    aspect-ratio: auto;
    border-bottom: 1px solid #2a1c10;
  }
  .reveal .ibody :global(.lines) {
    overflow: hidden;
    mask: linear-gradient(180deg, #000 calc(100% - 40px), transparent);
  }

  /* The loot's cards: each flies to the space it lands in (or to the gold, the flask), shrinking as it goes. */
  .flyrow {
    position: relative;
    z-index: 6;
    flex: none;
    display: flex;
    justify-content: center;
    gap: 8px;
    height: 60px;
  }
  .mcard {
    position: relative;
    flex: 0 1 92px;
    min-width: 0;
    height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0 4px;
    border: 1px solid var(--gold-lo);
    border-radius: 6px;
    background:
      radial-gradient(ellipse 70% 60% at 50% 30%, rgba(201, 164, 92, 0.16), transparent 70%),
      linear-gradient(180deg, #1d150c, #0c0906);
    box-shadow:
      inset 0 0 0 2px #0c0906,
      inset 0 0 0 3px rgba(201, 164, 92, 0.28),
      0 8px 16px rgba(0, 0, 0, 0.5);
    text-align: center;
  }
  .mcard .ic {
    width: 20px;
    height: 20px;
    color: var(--gold);
  }
  .mcard .nm {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 11px;
    line-height: 1.1;
    color: #f6e7c6;
    white-space: nowrap;
  }
  .mcard.fly {
    animation: fly 1.3s cubic-bezier(0.5, 0, 0.75, 0.3) calc(0.35s + var(--k) * 0.12s) both;
  }
  @keyframes fly {
    0%,
    20% {
      translate: 0 0;
      scale: 1;
      opacity: 1;
    }
    75% {
      translate: var(--dx) var(--dy);
      scale: 0.4;
      opacity: 0.9;
    }
    85%,
    100% {
      translate: var(--dx) var(--dy);
      scale: 0.3;
      opacity: 0;
    }
  }
  /* Held still (or settled after it waited): it fades where it is. */
  .mcard.settle {
    animation: settle 0.9s ease-out calc(0.6s + var(--k) * 0.12s) both;
  }
  @keyframes settle {
    to {
      opacity: 0;
    }
  }
  /* The card that didn't fit: held over the pack until you choose. */
  .mcard.held {
    border-color: var(--gold);
    box-shadow:
      inset 0 0 0 2px #0c0906,
      inset 0 0 0 3px rgba(241, 217, 155, 0.4),
      0 0 20px rgba(241, 190, 90, 0.25),
      0 10px 20px rgba(0, 0, 0, 0.6);
  }

  /* The pack on the reveal: its eight spaces, what the loot added lit green; with a supply held, each a space to replace. */
  .rpack {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 4px;
    padding-top: 5px;
  }
  .slot {
    position: relative;
    min-width: 0;
    height: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.05);
    color: var(--gold);
    font: inherit;
  }
  .slot .ic {
    width: 20px;
    height: 20px;
  }
  .slot .lbl {
    display: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11.5px;
    line-height: 1;
    color: #e9c8a2;
  }
  .slot .n,
  .slot .plus {
    position: absolute;
    top: -6px;
    display: grid;
    place-items: center;
    height: 16px;
    padding: 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 10.5px;
    line-height: 1;
    background: #0c0a08;
    border-radius: 8px;
  }
  .slot .n {
    right: -4px;
    min-width: 16px;
    color: var(--gold-hi);
    border: 1px solid var(--gold-lo);
  }
  .slot .plus {
    left: -4px;
    min-width: 18px;
    color: #c8e6b2;
    background: #0c0f08;
    border: 1px solid #6d9a58;
  }
  .slot.empty {
    background: rgba(0, 0, 0, 0.25);
    border-style: dashed;
    box-shadow: none;
  }
  .slot.gets {
    border-color: #8fb57a;
    box-shadow:
      inset 0 0 0 1px rgba(169, 207, 143, 0.25),
      0 0 14px rgba(150, 190, 110, 0.3);
    color: #e4f2d4;
  }
  .slot.target {
    border-color: var(--gold);
    border-style: dashed;
    box-shadow:
      0 0 0 1px rgba(241, 217, 155, 0.18),
      0 0 12px rgba(241, 190, 90, 0.25);
    cursor: pointer;
    animation: target 1.4s ease-in-out infinite;
  }
  .slot.target:hover {
    border-color: var(--gold-hi);
    color: var(--gold-hi);
  }
  @keyframes target {
    50% {
      box-shadow:
        0 0 0 1px rgba(241, 217, 155, 0.35),
        0 0 18px rgba(241, 190, 90, 0.4);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .slot.target {
      animation: none;
    }
  }

  /* A full pack's question: the held card's name, and leaving it. Its room stays once answered. */
  .fullask {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
  }
  .fullask p {
    flex: 1;
    margin: 0;
    font-size: 15px;
    line-height: 1.25;
    color: #e6dccb;
  }
  .fullask b {
    font-family: var(--font-display);
    font-weight: 700;
    color: #f6e7c6;
  }
  .fullask .btn {
    flex: none;
  }

  /* Where next: the places one step ahead, as rows; a tap goes there. */
  .wn {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .resting {
    opacity: 0.4;
    filter: saturate(0.6);
    pointer-events: none;
  }
  .wn-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
  }
  .wn-head h2 {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 17px;
    line-height: 1.2;
    letter-spacing: 0;
    text-transform: none;
    color: #e6dccb;
  }
  .stp {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  :global(.wr) .stp .n {
    font-size: 1em;
    color: inherit;
  }
  .grow {
    flex: 1;
  }
  .wn-head .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .wn-head .btn svg {
    width: 14px;
    height: 14px;
  }
  .place {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 16px;
    align-items: center;
    column-gap: 10px;
    min-height: 48px;
    padding: 4px 10px;
    text-align: left;
    font: inherit;
    color: inherit;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.06),
      0 6px 14px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  }
  .place:hover:not(:disabled) {
    border-color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.25);
  }
  .place .k {
    justify-self: center;
    width: 24px;
    height: 24px;
    color: var(--gold);
  }
  .place .k svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .place .tx {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .place .nm {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    line-height: 1.15;
    color: #f6e7c6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .place .kd {
    margin-left: 6px;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 13.5px;
    color: var(--gold);
  }
  .place .ln {
    font-size: 13.5px;
    line-height: 1.2;
    color: var(--muted);
  }
  .place .chev {
    width: 16px;
    height: 16px;
    color: var(--gold-lo);
  }
  .place.cor {
    border-color: #8e2a1e;
    background: linear-gradient(90deg, rgba(52, 20, 14, 0.95), rgba(22, 12, 9, 0.95));
  }
  .place.cor .k {
    color: #ff8a72;
  }
  .place.cor .ln.t {
    color: #ff9c86;
  }
  .place.cor .ln.t b {
    font-weight: 500;
    color: #ffc4b2;
  }

  /* The dock: the one gold button, in reach of a thumb (QuestionView .dock). */
  .dock {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 66px;
    margin: 0 -16px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    background-color: rgb(10, 8, 6);
    border-top: 1px solid rgba(125, 99, 51, 0.35);
    box-shadow: 0 -8px 22px rgba(0, 0, 0, 0.55);
  }
  .dock .btn.primary {
    flex: none;
    min-width: 132px;
    padding: 0.95em 1.2em;
    font-size: 14px;
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
  .stakes s {
    color: #7a6e5c;
    font-family: var(--font-cinzel);
    font-size: 12.5px;
    text-decoration-color: rgba(224, 85, 63, 0.8);
  }
  .stakes .warn {
    color: #ff9c86;
    font-size: 13.5px;
  }
  .stakes .row.note {
    font-size: 13px;
    color: var(--muted);
  }
  /* "a miss takes one" sits on its own line under the loot; on a wide screen, on the loot's line. */
  .inline-note {
    display: none;
  }
  /* The coming loot: a small card for each card a right name drops; one a miss took, dashed. */
  .deal {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: -2px;
    margin-right: 5px;
  }
  .deal i {
    width: 9px;
    height: 13px;
    border-radius: 1.5px;
    border: 1px solid var(--gold);
    background: linear-gradient(180deg, #3a2a17, #1d140b);
  }
  .deal.many {
    gap: 1px;
    margin-right: 4px;
  }
  .deal.many i {
    width: 7px;
  }
  .deal i.lost {
    border: 1px dashed rgba(224, 85, 63, 0.9);
    background: none;
    opacity: 0.8;
  }
  .deal i.extra {
    border-color: #e2342b;
    background: linear-gradient(180deg, #4a1a12, #1d0b07);
    box-shadow: 0 0 5px rgba(226, 52, 43, 0.6);
  }
  /* After a verdict: the sign, then the sentence (QuestionView .result). */
  .result {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .result p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 16px;
    line-height: 1.25;
    color: #e6dccb;
  }
  .result b {
    font-family: var(--font-cinzel);
    font-weight: 700;
  }
  .result .minus {
    color: #f0a68c;
  }
  .result small {
    display: block;
    font-size: 13.5px;
    color: var(--muted);
  }
  .result small b {
    font-size: 13px;
    color: var(--gold-hi);
  }
  .vsign {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 14px;
    --v-icon: #c2e3a6;
    --v-tint: 150, 200, 105;
    color: var(--v-icon);
    background: radial-gradient(circle at 50% 35%, rgba(var(--v-tint), 0.35), rgba(var(--v-tint), 0.12) 70%), #0c0a08;
    box-shadow:
      0 0 0 1px rgba(var(--v-tint), 0.75),
      0 0 12px rgba(var(--v-tint), 0.45);
  }
  .vsign.bad {
    --v-icon: #f0a68c;
    --v-tint: 220, 110, 80;
  }
  /* One chamber of the phial, its light pouring out of its tip (QuestionView .lost-vial). */
  .lost-vial {
    position: relative;
    flex: none;
    width: 24px;
    height: 10px;
    clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);
    background: #c9a45c;
  }
  .lost-vial::before {
    content: '';
    position: absolute;
    inset: 1.2px;
    clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);
    background: linear-gradient(90deg, #150d08 0 45%, #9c0f2c 60%, #ec3a48 80%, #ffe4cf);
  }
  /* The drink: the flask's own button, beside the gold one but not like it. */
  .drink {
    position: relative;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid #6b3a2c;
    background: radial-gradient(circle at 50% 35%, rgba(150, 40, 40, 0.35), rgba(30, 10, 8, 0.9) 70%);
    color: #f0a68c;
    box-shadow:
      inset 0 1px 0 rgba(255, 200, 180, 0.1),
      0 0 0 3px #0a0806,
      0 0 0 4px rgba(107, 58, 44, 0.5);
    cursor: pointer;
  }
  .drink:hover:not(:disabled) {
    border-color: #ff9a78;
    color: #fff0e8;
  }
  .drink .ic {
    width: 22px;
    height: 22px;
  }
  .drink .n {
    position: absolute;
    top: -5px;
    right: -5px;
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11.5px;
    line-height: 1;
    color: #ffd2c2;
    background: #0c0a08;
    border: 1px solid #6b3a2c;
    border-radius: 9px;
  }
  .drink:disabled {
    opacity: 0.35;
    filter: saturate(0.4);
    cursor: not-allowed;
  }

  /* A short phone: the pack's own key, round like the flask's in the run's
     bronze, and its tray rising out of the dock over the tiles' last rows. */
  .dock.short {
    gap: 8px;
    padding-left: 14px;
    padding-right: 14px;
  }
  .dock.short .stakes .row {
    font-size: 13.5px;
  }
  .dock.short .stakes b {
    font-size: 13px;
  }
  .dock.short .stakes .note {
    display: none;
  }
  .dock.short .btn.primary {
    min-width: 112px;
    padding: 0.95em 1em;
  }
  .dock.short .drink {
    width: 44px;
    height: 44px;
  }
  .packbtn {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--line);
    background: radial-gradient(circle at 50% 35%, rgba(201, 164, 92, 0.16), rgba(12, 10, 8, 0.9) 70%);
    color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.08),
      0 0 0 3px #0a0806,
      0 0 0 4px rgba(125, 99, 51, 0.45);
    cursor: pointer;
  }
  .packbtn svg {
    width: 21px;
    height: 21px;
  }
  .packbtn:hover,
  .packbtn.on {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .packbtn.on {
    box-shadow:
      inset 0 0 10px rgba(241, 217, 155, 0.18),
      0 0 0 3px #0a0806,
      0 0 0 4px rgba(201, 164, 92, 0.7);
  }
  .tray {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    padding: 8px 16px 10px;
    background-color: rgb(10, 8, 6);
    border-top: 1px solid rgba(125, 99, 51, 0.35);
    box-shadow: 0 -10px 24px rgba(0, 0, 0, 0.6);
  }
  .tray-head {
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
  }
  .tray-head h2 {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 15px;
    letter-spacing: 0;
    text-transform: none;
    color: #e6dccb;
  }
  /* With the pack in the tray, the art takes the room it left. */
  @media (max-width: 699px) and (max-height: 740px) {
    .art {
      width: clamp(84px, calc(100dvh - 330px - var(--board, 0px)), min(42%, 220px));
    }
  }

  /* Wide screens: the game's two columns (QuestionView), the dock under both. */
  @container item (min-width: 700px) {
    .desk {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: 28px;
      align-items: start;
    }
    .head {
      min-height: 64px;
    }
    .art {
      width: min(50%, 300px);
    }
    .dock {
      position: static;
      margin: 0;
      padding: 14px 0 0;
      background: none;
      border-top: 1px solid rgba(125, 99, 51, 0.25);
      box-shadow: none;
    }
    .dock .btn.primary {
      min-width: 170px;
      padding: 1em 1.8em;
      font-size: 15px;
    }
    .stakes .row {
      font-size: 17px;
    }
    .stakes .row.note {
      display: none;
    }
    .inline-note {
      display: inline;
    }
    .result p {
      font-size: 18px;
    }

    /* The reveal: the tooltip whole (its art over its lines), beside the
       verdict, the loot, the pack and Where next. */
    .reveal .desk {
      grid-template-columns: minmax(0, 400px) minmax(0, 460px);
      column-gap: 40px;
      justify-content: center;
    }
    .reveal .ibody {
      flex-direction: column;
      height: auto;
      container-type: normal;
      overflow: visible;
    }
    .reveal .art {
      width: 230px;
      height: 230px;
      align-self: center;
      margin: 10px 0 2px;
      border: 1px solid #2a1c10;
    }
    .reveal .ibody :global(.lines) {
      mask: none;
    }
    .side {
      gap: 14px;
    }
    .side .dock {
      order: -1;
      min-height: 0;
      padding: 0;
      border-top: none;
    }
    .slot {
      height: 52px;
    }
    .slot .lbl {
      display: block;
    }
    .place {
      min-height: 64px;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
    }
    .place .k {
      width: 28px;
      height: 28px;
    }
    .place .nm {
      font-size: 17px;
    }
    .place .ln {
      font-size: 15px;
    }
    .wn-head h2 {
      font-size: 19px;
    }
  }
  /* A short window (a laptop's): the dock stays pinned, so Identify is never below the fold. */
  @media (max-height: 820px) {
    .item:not(.reveal) .dock {
      position: sticky;
      background-color: rgb(10, 8, 6);
    }
  }
</style>
