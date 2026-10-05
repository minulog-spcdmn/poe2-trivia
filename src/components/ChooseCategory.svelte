<script lang="ts">
  import { cubicInOut, cubicOut } from 'svelte/easing';
  import { engine, session } from '../lib/session.svelte';
  import { categoryIcon, categoryIconTweak, categoryIcons } from '../lib/ui';
  import { fits, fitStyle, maskOf, measure } from '../lib/iconFit.svelte';
  import { activeRules, difficultyOf, lastPicks } from '../lib/game';
  import { BLAST_TEXT, FIND_TEXT, deathmatchText, findNote, lockoutText } from '../lib/difficultyText';
  import { blastedOffer, delveLockout, dynamiteOf, findOffer, inventoryOf, type FindKind } from '../lib/delve';
  import { sfx } from '../lib/sound';
  import { backdropShadow } from '../lib/backdropShadow';
  import { cardHover, cardPicked, cardRevealed } from '../lib/fx/moments';
  import { fxActive, type Handle, type Vec3 } from '../lib/fx/core';
  import { C, embers, emitter, flare, glints, outline, puffs, ring, shards, sparks } from '../lib/fx/effects';
  import { light } from '../lib/lights';
  import { findArt } from '../lib/findArt';
  import CardEngraving from './CardEngraving.svelte';

  const s = $derived(session.state!);
  const active = $derived(s.players[s.turn]);
  const mine = $derived(session.myTurn);
  // The lockout in force (in Delve it grows with depth).
  const lockout = $derived(activeRules(s).lockout);

  // Delve: the last seconds before a card is picked for you.
  let hostNow = $state(session.hostNow());
  $effect(() => {
    if (!s.delve?.pickBy) return;
    hostNow = session.hostNow();
    const id = setInterval(() => (hostNow = session.hostNow()), 500);
    return () => clearInterval(id);
  });
  const pickLeft = $derived(s.delve?.pickBy ? Math.max(0, Math.ceil((s.delve.pickBy - hostNow) / 1000)) : null);
  /** Delve: the find among the cards on offer, and the card blasted open, if any. */
  const find = $derived(findOffer(s));
  const blasted = $derived(blastedOffer(s));
  /** What a card is: a find of some kind, blasted open, or plain. */
  const kindOf = (cat: string): FindKind | 'blast' | null => (find?.category === cat ? find.kind : blasted === cat ? 'blast' : null);

  // ---- finds --------------------------------------------------------------
  // A find is the ordinary card, its gold engraving and emblem untouched, with
  // its find grown into the window beside the pedestal (lib/findArt): azurite
  // breaking out of the frame, a signal flare burning, a bundle of dynamite
  // with its fuse lit. A card blasted open has its corner blown off; a find
  // blasted open shows both.

  /** Each card's measured size inside its border, for its art. */
  let sizes = $state<Record<string, [number, number]>>({});
  const uid = $props.id();
  function artOf(cat: string, kind: FindKind | 'blast') {
    const [w, h] = sizes[cat] ?? [0, 0];
    if (!w || !h) return null;
    const i = s.offered.indexOf(cat);
    const art = findArt(kind, w, h, `${uid}-${i}`);
    // A find blasted open: its own art, and the blast's cracks over it.
    if (kind !== 'blast' && blasted === cat) {
      const blast = findArt('blast', w, h, `${uid}-${i}b`);
      return { svg: art.svg + blast.svg, clip: blast.clip, w, h };
    }
    return { ...art, w, h };
  }
  const arts = $derived(Object.fromEntries(s.offered.map((cat) => [cat, kindOf(cat) ? artOf(cat, kindOf(cat)!) : null])));

  // Their effects: azurite rings like crystal, a flare and dynamite throw sparks.
  const FX: Record<FindKind | 'blast', { main: Vec3; pale: Vec3 }> = {
    azurite: { main: C.portal, pale: C.portalPale },
    flare: { main: [3.0, 0.45, 0.75], pale: [3.0, 1.7, 1.9] },
    dynamite: { main: C.ember, pale: C.whiteHot },
    blast: { main: C.ember, pale: C.gold },
  };
  const dim = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
  function findRevealed(frame: Element, kind: FindKind | 'blast') {
    if (!fxActive()) return;
    const { main, pale } = FX[kind];
    outline(frame, { color: dim(main, 0.8), width: 10, intensity: 0.9, life: 1, fadeIn: 0.06 });
    glints(frame, { count: 5, area: 'edge', color: pale, size: [4, 8], delay: [0, 0.4] });
    if (kind === 'blast') sparks(frame, { count: 40, area: 'fill', speed: [120, 520], life: [0.3, 0.9] });
    light(frame, { color: kind === 'azurite' ? [0.3, 0.6, 1] : [1, 0.4, 0.3], radius: 260, intensity: 0.3, decay: 0.9 });
  }
  function findHover(frame: Element, card: Element, kind: FindKind | 'blast'): Handle {
    if (!fxActive()) return { stop() {} };
    const { main, pale } = FX[kind];
    const glow = outline(frame, { color: dim(main, 0.7), width: 12, flame: kind === 'azurite' ? 0.25 : 0.7, pulse: 0.4, intensity: 0.7, fadeIn: 0.25, base: card });
    const twinkle = emitter(5, () => glints(frame, { count: 1, area: 'edge', color: pale, size: [3, 7] }));
    return {
      stop() {
        glow.stop(0.35);
        twinkle.stop();
      },
    };
  }
  /** A find is chosen: azurite rings out like struck crystal and sheds shards, the others go up in sparks; the other cards burn away. */
  function findPicked(card: Element, base: Element, others: Element[], kind: FindKind | 'blast') {
    if (!fxActive()) return;
    const { main, pale } = FX[kind];
    for (const o of others) {
      embers(o, { count: 24, area: 'fill', colors: [C.ember, C.emberDeep, C.ash], rise: [60, 200], life: [0.6, 1.6] });
      puffs(o, { count: 6, area: 'fill', color: [0.14, 0.09, 0.05] });
    }
    outline(card, { color: main, width: 16, flame: kind === 'azurite' ? 0.3 : 0.9, intensity: 1, life: 1.3, base });
    if (kind === 'azurite') shards(card, { count: 26, colors: [main, pale, C.whiteHot], speed: [180, 520] });
    sparks(card, { count: 40, area: 'edge', speed: [120, 560], life: [0.3, 0.9], colors: [pale, main] });
    ring(card, { radius: 260, thickness: 10, life: 0.8, color: main, breakup: 0.3 });
    flare(card, { size: 36, streak: 340, life: 0.7, color: pale });
    light(card, { color: kind === 'azurite' ? [0.3, 0.6, 1] : [1, 0.45, 0.3], radius: 360, intensity: 0.7, decay: 1.2 });
  }

  let picked = $state<string | null>(null);

  // ---- dynamite -----------------------------------------------------------
  const dynamite = $derived(mine && active && !s.deathmatch && s.delve ? dynamiteOf(s, active.id) : 0);
  const canBlast = $derived(dynamite > 0 && !s.delve?.blasted && !picked);
  /** Categories that could be blasted open: any not on offer, locked or not. */
  const blastable = $derived(engine.categories.filter((c) => !s.offered.includes(c)));
  const lockedNow = $derived(s.delve && active ? lastPicks(active.recent, delveLockout(s.round)) : []);
  let blasting = $state(false);
  function blast(category: string) {
    blasting = false;
    sfx('pick');
    session.dispatch({ type: 'blast', category });
  }

  // Size each emblem by its visible shape (see lib/iconFit); measured while the cards lie face down.
  for (const url of categoryIcons()) measure(url);

  // The deal: the cards slide in face down one after another, then turn face
  // up from left to right. Seconds from when they appear.
  const DEAL = 0.42;
  const FLIP = 0.46;
  const dealAt = (i: number) => 0.15 + i * 0.07;
  const flipAt = (i: number) => 0.62 + i * 0.12;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Cards turn over their longer side: across when stacked as wide rows (narrow screens), else sideways. */
  const narrow = matchMedia('(max-width: 700px)');
  /** When the deal began; null when the cards appeared without one (as after a refresh). */
  let dealtAt: number | null = null;
  /** Whether card i lies face up yet (it can't be picked or catch fire before). */
  const faceUp = (i: number) => dealtAt === null || performance.now() - dealtAt >= (flipAt(i) + FLIP) * 1000;

  // The transitions are global: the cards are created with the screen, which
  // a local transition skips. The card fades in, and its inner part moves:
  // an opacity on the element that turns would flatten it, and its back
  // would show through the face.
  function appear(_node: Element, { i }: { i: number }) {
    if (still) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return { delay: Math.round(dealAt(i) * 1000), duration: DEAL * 400, css: (t: number) => `opacity:${t}` };
  }
  function deal(node: Element, { i, n }: { i: number; n: number }) {
    if (still) return {};
    dealtAt ??= performance.now();
    // The face's own entrance (see .dealt below) plays with the deal only.
    node.classList.add('dealt');
    // Face down until it turns halfway (see .down below).
    const card = node.parentElement;
    card?.classList.add('down');
    setTimeout(() => card?.classList.remove('down'), (flipAt(i) + FLIP / 2) * 1000);
    const start = dealAt(i);
    const turn = flipAt(i) - start;
    const total = turn + FLIP;
    const rot = (i - (n - 1) / 2) * 7;
    const axis = narrow.matches ? 'X' : 'Y';
    return {
      delay: Math.round(start * 1000),
      duration: Math.round(total * 1000),
      css: (t: number) => {
        const u = t * total;
        const d = cubicOut(Math.min(1, u / DEAL));
        const f = cubicInOut(Math.min(1, Math.max(0, (u - turn) / FLIP)));
        // Lifted off the table while it turns.
        const lift = Math.sin(Math.PI * f);
        const y = (1 - d) * 90 - lift * 16;
        return `transform:perspective(1200px) translateY(${y.toFixed(2)}px) rotate(${((1 - d) * rot).toFixed(2)}deg) rotate${axis}(${(180 * (1 - f)).toFixed(2)}deg) scale(${(1 + 0.05 * lift).toFixed(4)})`;
      },
    };
  }

  /** Svelte action: the card's moment as it lands face up. */
  function revealed(node: HTMLElement, i: number) {
    if (still) return;
    const t = setTimeout(() => {
      const frame = node.querySelector('.frame') ?? node;
      if (dealtAt !== null) {
        const kind = kindOf(s.offered[i]);
        if (kind) findRevealed(frame, kind);
        else cardRevealed(frame, !!s.deathmatch);
      }
      // The pointer may already rest on it, having come while it lay face down.
      if (waiting === i) ignite(i);
    }, (flipAt(i) + FLIP) * 1000);
    return { destroy: () => clearTimeout(t) };
  }

  let cardEls = $state<HTMLElement[]>([]);
  let burning: Handle | null = null;
  /** The face-down card the mouse rests on, to catch fire once it turns up. */
  let waiting: number | null = null;

  function enter(e: PointerEvent, i: number) {
    if (e.pointerType !== 'mouse') return;
    if (!faceUp(i)) waiting = i;
    else ignite(i);
  }
  function ignite(i: number) {
    waiting = null;
    if (!mine || picked) return;
    burning?.stop();
    const card = cardEls[i];
    const frame = card?.querySelector('.frame');
    const kind = kindOf(s.offered[i]);
    if (frame) burning = kind ? findHover(frame, card, kind) : cardHover(frame, card, !!s.deathmatch);
  }
  function leave(e: PointerEvent) {
    waiting = null;
    burning?.stop();
    burning = null;
    const frame = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.frame');
    frame?.style.removeProperty('--rx');
    frame?.style.removeProperty('--ry');
  }
  /** Tilts the card toward the pointer, and moves the glare with it. */
  function tilt(e: PointerEvent) {
    if (!mine || picked || e.pointerType !== 'mouse') return;
    const frame = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.frame');
    if (!frame) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    frame.style.setProperty('--rx', `${((0.5 - y) * 20).toFixed(2)}deg`);
    frame.style.setProperty('--ry', `${((x - 0.5) * 24).toFixed(2)}deg`);
    frame.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    frame.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  }
  $effect(() => () => burning?.stop());

  function pick(category: string) {
    const i = s.offered.indexOf(category);
    if (!mine || picked || !faceUp(i)) return;
    picked = category;
    burning?.stop();
    burning = null;
    const frame = cardEls[i]?.querySelector('.frame');
    const others = cardEls.filter((c, j) => c && j !== i).map((c) => c.querySelector('.frame') ?? c);
    const kind = kindOf(category);
    if (frame && kind) findPicked(frame, cardEls[i], others, kind);
    else if (frame) cardPicked(frame, cardEls[i], others, !!s.deathmatch);
    sfx('pick');
    session.dispatch({ type: 'pick', category });
    // Allow a retry if the host rejected the pick.
    setTimeout(() => (picked = null), 2500);
  }
</script>

<div class="choose">
  <p class="prompt">
    {#if s.deathmatch}
      {#if mine}Sudden death: your category is drawn at random.{:else}<span class="muted">Sudden death for</span> {active.name}<span class="muted">…</span>{/if}
    {:else if mine}
      Choose your category
    {:else}
      <span class="muted">Waiting for</span> {active.name} <span class="muted">to choose a category…</span>
    {/if}
  </p>

  <div class="cards" class:single={s.offered.length === 1} style:--n={s.offered.length}>
    {#each s.offered as cat, i (cat)}
      <button
        class="card"
        data-sfx="none"
        data-fx="none"
        class:dm={!!s.deathmatch}
        class:special={!!kindOf(cat)}
        class:cut={!!arts[cat]?.clip}
        data-find={kindOf(cat)}
        aria-describedby={kindOf(cat) ? 'find-note' : undefined}
        class:mine
        class:chosen={picked === cat}
        class:faded={picked && picked !== cat}
        disabled={!mine}
        onclick={() => pick(cat)}
        onpointerenter={(e) => enter(e, i)}
        onpointerleave={leave}
        onpointermove={tilt}
        bind:this={cardEls[i]}
        style:--face="{Math.round((flipAt(i) + FLIP / 2) * 1000)}ms"
        use:revealed={i}
        in:appear|global={{ i }}
      >
        <span class="turn" in:deal|global={{ i, n: s.offered.length }}>
          <span class="back" aria-hidden="true">
            <CardEngraving side="back" />
            <span class="filigree"></span>
          </span>
          <span class="frame" use:backdropShadow style:clip-path={arts[cat]?.clip ?? undefined}>
            <CardEngraving side="face" />
            <span class="glare"></span>
            <span class="sheen"></span>
            <span class="filigree"></span>
            {#if kindOf(cat)}
              {@const kind = kindOf(cat)!}
              {@const art = arts[cat]}
              <span class="worked" bind:clientWidth={null, (w) => (sizes[cat] = [w ?? 0, sizes[cat]?.[1] ?? 0])} bind:clientHeight={null, (h) => (sizes[cat] = [sizes[cat]?.[0] ?? 0, h ?? 0])} aria-hidden="true">
                {#if art}
                  <svg viewBox="0 0 {art.w} {art.h}">{@html art.svg}</svg>
                {/if}
              </span>
              <span class="find-tag">{kind === 'blast' ? BLAST_TEXT.tag : FIND_TEXT[kind].name}</span>
            {/if}
            <span class="icon">
              <span class="lit"><span class="glyph" class:fit={!!fits[categoryIcon(cat)]} style={fitStyle(categoryIcon(cat), categoryIconTweak(cat))} style:--src="url('{maskOf(categoryIcon(cat))}')"></span></span>
            </span>
            <span class="title">{#if kindOf(cat)}{@const kind = kindOf(cat)!}<span class="find-tag-row">{kind === 'blast' ? BLAST_TEXT.tag : FIND_TEXT[kind].name}</span>{/if}{cat}</span>
          </span>
        </span>
      </button>
    {/each}
  </div>

  {#if canBlast}
    <div class="blast">
      {#if !blasting}
        <button class="btn small blast-btn" onclick={() => (blasting = true)}>
          {BLAST_TEXT.button}<span class="count" aria-label="{dynamite} dynamite">{dynamite}</span>
        </button>
      {:else}
        <p class="blast-q">{BLAST_TEXT.pick}</p>
        {#if find}
          <button class="btn small blast-find" data-find={find.kind} onclick={() => blast(find.category)}>{BLAST_TEXT.find(FIND_TEXT[find.kind].name)}</button>
          <p class="blast-q muted">{BLAST_TEXT.others}</p>
        {/if}
        <div class="blast-list">
          {#each blastable as c (c)}
            <button class="btn small" class:locked={lockedNow.includes(c)} onclick={() => blast(c)}>
              {c}{#if lockedNow.includes(c)}<span class="lock">locked</span>{/if}
            </button>
          {/each}
        </div>
        <p class="note muted">{BLAST_TEXT.note}{#if find}{' '}{BLAST_TEXT.withFind}{/if}</p>
        <button class="btn ghost small" onclick={() => (blasting = false)}>Keep the dynamite</button>
      {/if}
    </div>
  {/if}
  {#if find && !s.deathmatch}
    <p class="note find-note" data-find={find.kind} id="find-note">
      {#if mine}<strong>{FIND_TEXT[find.kind].tag}.</strong> {findNote(find.kind, s.round, inventoryOf(s, active.id), blasted === find.category)}{:else}{FIND_TEXT[find.kind].others}{/if}
    </p>
  {/if}
  {#if blasted && mine && blasted !== find?.category}
    <p class="note find-note" data-find="blast" id={find ? undefined : 'find-note'}>{BLAST_TEXT.opened}</p>
  {/if}
  {#if s.deathmatch}
    <p class="note muted">{mine ? 'Tap the card when you are ready.' : deathmatchText(difficultyOf(s.settings.difficulty))}</p>
  {:else if mine && pickLeft !== null && pickLeft <= 10}
    <p class="note muted">A card is chosen for you in {pickLeft}s.</p>
  {:else if mine && lockout > 0}
    <p class="note muted">A category you choose stays locked for {lockoutText(lockout)}.</p>
  {/if}
</div>

<style>
  .choose {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.6rem;
  }
  .prompt {
    margin: 0;
    font-size: 1.2rem;
    text-align: center;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(var(--n, 3), minmax(0, 220px));
    gap: 1.4rem;
  }
  .card {
    /* The engraving's gold, and the warm glow in the face's window. */
    --ink: #c9a05a;
    --warm: #c8682a;
    /* A faint grain over both sides, so they read as worked plates rather than flat fills. */
    --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .86 0 0 0 0 .62 .08 0 0 0 -.025'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")
      0 0 / 180px;
    padding: 0;
    border: 0;
    background: none;
    cursor: default;
  }
  .turn {
    position: relative;
    display: block;
    transform-style: preserve-3d;
  }
  /* The card's two sides: the deal turns it from its back to its face. */
  .frame,
  .back {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }
  .back {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    overflow: clip;
    border: 1px solid var(--gold-lo);
    background:
      var(--grain),
      radial-gradient(circle at 50% 50%, rgba(175, 96, 37, 0.2), transparent 90px),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    --ring: rgba(125, 99, 51, 0.35);
    box-shadow:
      inset 0 0 0 4px rgba(0, 0, 0, 0.5),
      inset 0 0 0 5px var(--ring),
      0 16px 40px rgba(0, 0, 0, 0.6);
    transform: rotateY(180deg);
    pointer-events: none;
  }
  /* The engraved plates (see lib/cardEngraving), behind what the card shows. */
  .frame > :global(.engraving),
  .back > :global(.engraving) {
    opacity: 0.6;
    transition: opacity 0.4s;
  }
  /* The face is laid out to its plate (see lib/cardEngraving, TALL): the
     emblem in the arch, the name in the nameplate, the same whatever the
     name's length. Inside its border the card is 298 high. */
  .frame {
    position: relative;
    display: block;
    height: 300px;
    overflow: clip;
    border-radius: 8px;
    border: 1px solid var(--gold-lo);
    background:
      var(--grain),
      radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #211912, #0d0a07 70%);
    --bs1: 16px 40px;
    --bs1-color: rgba(0, 0, 0, 0.6);
    --bs-shade: rgba(0, 0, 0, 0.5);
    --bs-ring: rgba(125, 99, 51, 0.35);
    box-shadow:
      inset 0 0 0 4px var(--bs-shade),
      inset 0 0 0 5px var(--bs-ring),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      transform 0.35s var(--ease-out),
      --bs-shade 0.35s,
      --bs-ring 0.35s,
      --bs1 0.35s,
      --bs1-color 0.35s,
      --bs2 0.35s,
      --bs2-color 0.35s,
      border-color 0.35s,
      opacity 0.4s,
      filter 0.4s;
  }
  /* The same gold filigree as the panels, on all four corners, joined by a
     fine rule along the outer line of each. */
  .filigree {
    --at: 1px;
    --end: 30px;
    --rule: linear-gradient(rgba(201, 164, 92, 0.26), rgba(201, 164, 92, 0.26));
    --rules:
      var(--rule) var(--end) var(--at) / calc(100% - 2 * var(--end)) 1px no-repeat,
      var(--rule) var(--end) calc(100% - var(--at)) / calc(100% - 2 * var(--end)) 1px no-repeat,
      var(--rule) var(--at) var(--end) / 1px calc(100% - 2 * var(--end)) no-repeat,
      var(--rule) calc(100% - var(--at)) var(--end) / 1px calc(100% - 2 * var(--end)) no-repeat;
    position: absolute;
    inset: 5px;
    background: var(--filigree), var(--rules);
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(224, 138, 68, 0.35));
    pointer-events: none;
    transition:
      opacity 0.3s,
      filter 0.3s;
  }
  .icon {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(132px - 75px);
    height: 150px;
    /* Centred even when an item grown larger (--e-k) overflows the cell:
       a flex box overflows both ways alike, where a grid would need
       `unsafe`, which older iOS Safari drops. */
    display: flex;
    align-items: center;
    justify-content: center;
    /* The emblem's warm glow, under its shadow (see .lit). */
    filter: drop-shadow(0 0 12px rgba(224, 138, 68, 0.45));
  }
  /* The emblem's shadow, on a layer of its own so the engraving stays
     crisp: the original card's, tight, just below it, as if lifted off the
     card. It's cast from the clean mask (see lib/iconFit), so the art's own
     faint shadow casts none, and it lies over the glow (on .icon) rather
     than under it, where the glow would wash it out. */
  .lit {
    position: relative;
    display: grid;
    place-items: center;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.8));
  }
  .glyph {
    width: 130px;
    height: 150px;
    /* The original card's gold, opaque so the glory's rays stay behind it. */
    background: linear-gradient(180deg, #fbe6b0 0%, #c9a45c 45%, #6d4a1c 100%);
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.4s;
  }
  /* Once measured: the box is the visible item, scaled to a common weight
     (lib/iconFit) and by the item's own --e-k, and the image is placed so
     its visible part fills it. An item drawn larger grows upward, its foot
     where it was, and --e-up and --e-left move it. --e-s scales it all
     down for a card in a row. */
  .glyph.fit {
    --e-k: var(--e-kin, 1);
    --u: calc(var(--e-s, 1) * var(--e-k) * 1px);
    translate: calc(var(--e-left, 0) * var(--e-s, 1) * -1px)
      calc(min(0px, (1 - var(--e-k)) * var(--e-h) * var(--e-s, 1) * 0.5px) - var(--e-up, 0) * var(--e-s, 1) * 1px);
    width: calc(var(--e-w) * var(--u));
    height: calc(var(--e-h) * var(--u));
    -webkit-mask-size: calc(var(--e-iw) * var(--u)) calc(var(--e-ih) * var(--u));
    mask-size: calc(var(--e-iw) * var(--u)) calc(var(--e-ih) * var(--u));
    -webkit-mask-position: calc(var(--e-x) * var(--u) * -1) calc(var(--e-y) * var(--u) * -1);
    mask-position: calc(var(--e-x) * var(--u) * -1) calc(var(--e-y) * var(--u) * -1);
  }
  /* As the face turns up in the deal, its emblem kindles and light runs across it. */
  .turn:global(.dealt) .glyph {
    animation: kindle 0.9s ease-out var(--face, 0ms) backwards;
  }
  .turn:global(.dealt) .sheen::before {
    animation: sheen 0.8s var(--ease-out) calc(var(--face, 0ms) + 80ms) backwards;
  }
  @keyframes kindle {
    from {
      opacity: 0.2;
      filter: brightness(0.4);
    }
    40% {
      opacity: 1;
      filter: brightness(1.45);
    }
  }
  .sheen {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
  }
  .sheen::before {
    content: '';
    position: absolute;
    inset: -10% auto -10% -80%;
    width: 50%;
    background: linear-gradient(100deg, transparent, rgba(255, 232, 180, 0.18), transparent);
    transform: skewX(-14deg);
    opacity: 0;
  }
  @keyframes sheen {
    from {
      opacity: 1;
      translate: 0 0;
    }
    to {
      opacity: 1;
      translate: 420% 0;
    }
  }
  /* In the nameplate (TALL.plateTop down to 14 from the foot). */
  .title {
    position: absolute;
    left: 22px;
    right: 22px;
    top: 238px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.04em;
    color: var(--gold-hi);
    text-align: center;
    line-height: 1.2;
    transition:
      color 0.3s,
      text-shadow 0.3s;
  }

  @media (min-width: 701px) {
    .cards.single {
      grid-template-columns: minmax(0, 220px);
    }
  }
  .card.dm .frame {
    border-color: #8c3a2c;
    --bs-ring: rgba(140, 58, 44, 0.45);
    background:
      var(--grain),
      radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #22110d, #0d0706 70%);
  }
  /* The filigree in red: its gold can't be filtered to a clean red, so its
     shapes mask a red of their own. */
  .card.dm .filigree {
    background: linear-gradient(135deg, #f0a08a, #c8503a 60%, #9a3424);
    -webkit-mask: var(--filigree), var(--rules);
    mask: var(--filigree), var(--rules);
    filter: none;
  }
  .card.dm .title {
    color: #f3cfc2;
  }
  .card.dm {
    --ink: #c85a44;
    --warm: #e0553f;
  }
  .card.dm .glyph {
    background: linear-gradient(180deg, #ffd7c9 0%, #e0553f 50%, #6d1a10 100%);
  }
  .card.dm .back {
    border-color: #8c3a2c;
    --ring: rgba(140, 58, 44, 0.45);
    background:
      var(--grain),
      radial-gradient(circle at 50% 50%, rgba(224, 85, 63, 0.2), transparent 90px),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.5)),
      linear-gradient(170deg, #22110d, #0d0706 70%);
  }
  .card.dm.mine .frame {
    animation: menace 2.4s ease-in-out infinite;
  }
  @keyframes menace {
    50% {
      --bs-ring: transparent;
      --bs1: 0px 45px;
      --bs1-color: rgba(224, 85, 63, 0.45);
    }
  }
  /* While a card lies face down its face is turned away, but the backdrop
     would still draw the face's shadow (and its hover shadow) under the back,
     which has a shadow of its own. */
  .card:global(.down) .frame {
    --bs1-color: transparent;
    --bs2-color: transparent;
  }
  .card.dm:global(.down) .frame {
    animation: none;
  }
  /* Only the side that faces up is shown. backface-visibility alone isn't
     enough in WebKit (every browser on iOS): the emblem, with a filter and
     an animation of its own, shows through the back while it lies face down.
     The sides swap as the card stands on edge, where neither shows. */
  .card:global(.down) .frame,
  .card:not(:global(.down)) .back {
    visibility: hidden;
  }
  .card.mine {
    cursor: pointer;
  }
  .card.mine:not(:global(.down)):hover .frame,
  .card.mine:not(:global(.down)):focus-visible .frame {
    transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(-10px) scale(1.04);
    border-color: var(--gold);
    --bs-ring: rgba(201, 164, 92, 0.6);
    --bs1: 0px 40px;
    --bs1-color: rgba(224, 138, 68, 0.3);
    --bs2: 24px 50px;
    --bs2-color: rgba(0, 0, 0, 0.7);
  }
  .card.dm.mine:not(:global(.down)):hover .frame,
  .card.dm.mine:not(:global(.down)):focus-visible .frame {
    border-color: #c0503b;
    --bs-ring: rgba(224, 85, 63, 0.6);
  }
  .card.mine:not(:global(.down)):hover .frame > :global(.engraving),
  .card.chosen .frame > :global(.engraving) {
    opacity: 0.85;
  }
  .card.mine:not(:global(.down)):hover .glyph {
    transform: scale(1.1) rotate(-3deg);
    opacity: 1;
    filter: brightness(1.15);
  }
  /* A soft highlight that follows the pointer across the card. */
  .glare {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at var(--gx, 50%) var(--gy, 30%), rgba(255, 226, 170, 0.07), transparent 45%);
    mix-blend-mode: screen;
    opacity: 0;
    transition: opacity 0.35s;
    pointer-events: none;
  }
  .card.mine:not(:global(.down)):hover .glare {
    opacity: 1;
  }
  .card.mine:not(:global(.down)):hover .title {
    color: #fff1cf;
    text-shadow: 0 0 14px rgba(241, 217, 155, 0.6);
  }
  .card.mine:not(:global(.down)):hover .filigree {
    opacity: 1;
    filter: brightness(1.25) drop-shadow(0 0 5px rgba(255, 170, 90, 0.6));
  }
  .card.dm.mine:not(:global(.down)):hover .filigree {
    filter: brightness(1.25);
  }
  .card.dm.mine:not(:global(.down)):hover .title {
    color: #ffe4db;
    text-shadow: 0 0 14px rgba(240, 140, 120, 0.6);
  }
  .card:focus-visible {
    outline: none;
  }
  .card:disabled .frame,
  .card:disabled .back {
    filter: saturate(0.6) brightness(0.8);
  }
  .card.chosen .frame {
    transform: translateY(-14px) scale(1.08);
    border-color: var(--gold-hi);
    --bs-shade: transparent;
    --bs-ring: transparent;
    --bs1: 0px 60px;
    --bs1-color: rgba(255, 170, 90, 0.5);
    --bs2: 0px 0px;
    --bs2-color: transparent;
  }
  .card.dm.chosen .frame {
    border-color: #e88a74;
  }
  .card.faded .frame {
    opacity: 0.2;
    transform: scale(0.92) translateY(8px);
    filter: grayscale(0.8) brightness(0.6) blur(1px);
  }

  .note {
    margin: 0;
    font-style: italic;
    font-size: 0.95rem;
  }
  /* Two notes under the cards sit closer than the cards sit to them. */
  .find-note + .note,
  .blast + .note {
    margin-top: -1rem;
  }

  /* ---- finds ---------------------------------------------------------------
     A find is the ordinary card, gold and engraved, with its find grown into
     the window (lib/findArt), its frame lit in the find's colour, and the
     warm glow in its window turned to the find's light. */
  .card[data-find='azurite'] {
    --warm: #2f78d8;
    --f: #8cbcf0;
    --f-hi: #dcedff;
    --f-border: #4a78b8;
    --f-pulse: rgba(70, 140, 255, 0.4);
    --f-glow: rgba(70, 140, 255, 0.28);
  }
  .card[data-find='flare'] {
    --warm: #e0405f;
    --f: #ff8fa1;
    --f-hi: #ffe1e6;
    --f-border: #a84a5c;
    --f-pulse: rgba(255, 70, 100, 0.36);
    --f-glow: rgba(255, 70, 100, 0.25);
  }
  .card[data-find='dynamite'] {
    --warm: #e0602a;
    --f: #f4a868;
    --f-hi: #ffe3c8;
    --f-border: #a4602a;
    --f-pulse: rgba(255, 120, 40, 0.36);
    --f-glow: rgba(255, 120, 40, 0.25);
  }
  .card[data-find='blast'] {
    --warm: #a04a1a;
    --f: #d8a070;
    --f-hi: #f3dcc4;
    --f-border: #7a5a40;
    --f-pulse: rgba(255, 110, 40, 0.28);
    --f-glow: rgba(255, 110, 40, 0.2);
  }
  .card.special .frame {
    border-color: var(--f-border);
    --bs-ring: color-mix(in srgb, var(--f-border) 45%, transparent);
  }
  /* Its light, once it lies face up (face down, the back has a shadow of its own). */
  .card.special:not(:global(.down)) .frame {
    --bs1: 0px 34px;
    --bs1-color: var(--f-glow);
  }
  /* A card with its corner blown off: the backdrop would shadow the whole
     rectangle, so its shadow and glow follow the broken shape instead. */
  .card.cut:not(:global(.down)) .frame,
  .card.cut.mine:not(:global(.down)):hover .frame,
  .card.cut.chosen .frame {
    --bs1-color: transparent;
    --bs2-color: transparent;
    animation: none;
  }
  .card.cut {
    filter: drop-shadow(0 14px 18px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 12px var(--f-glow));
  }
  .card.special.mine .frame {
    animation: pulse 3.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      --bs1: 0px 46px;
      --bs1-color: var(--f-pulse);
    }
  }
  .card.special:global(.down) .frame {
    animation: none;
  }
  .card.special.mine:not(:global(.down)):hover .frame,
  .card.special.mine:not(:global(.down)):focus-visible .frame {
    border-color: var(--f);
    --bs-ring: color-mix(in srgb, var(--f) 60%, transparent);
    --bs1-color: var(--f-pulse);
  }
  .card.special.chosen .frame {
    border-color: var(--f);
    --bs1-color: var(--f-pulse);
  }
  .worked {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .worked svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* What the card is, on a small plaque over the keystone, lozenges at its
     ends like the nameplate's (in its name on a row). */
  .find-tag {
    position: absolute;
    top: 8px;
    left: 50%;
    translate: -50% 0;
    padding: 3px 12px 4px;
    font-family: var(--font-display);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--f-hi);
    background: linear-gradient(#1a140e, #0a0806);
    border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent);
    box-shadow:
      inset 0 0 0 2px #0a0806,
      inset 0 0 0 2.5px color-mix(in srgb, var(--f) 55%, transparent),
      0 0 12px var(--f-pulse);
  }
  .find-tag::before,
  .find-tag::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 6px;
    height: 6px;
    background: #0a0806;
    border: 1px solid color-mix(in srgb, var(--gold) 70%, transparent);
    rotate: 45deg;
    translate: 0 -50%;
  }
  .find-tag::before {
    left: -4px;
  }
  .find-tag::after {
    right: -4px;
  }

  /* The art's motion, transform and opacity only: a glint now and then on the
     azurite and a light sweeping over it, the flare's flame flickering and its
     embers rising, the fuse sputtering, the broken edge smouldering. Held
     still with the effects off or reduced motion. */
  .worked :global(.glint) {
    opacity: 0;
    transform: scale(0.2) rotate(-20deg);
    animation: glint 5.2s ease-in-out infinite;
  }
  @keyframes glint {
    0%,
    74%,
    100% {
      opacity: 0;
      transform: scale(0.2) rotate(-20deg);
    }
    82% {
      opacity: 1;
      transform: scale(1) rotate(10deg);
    }
    90% {
      opacity: 0;
      transform: scale(0.5) rotate(30deg);
    }
  }
  .worked :global(.ember-glint) {
    animation-duration: 2.4s;
  }
  .worked :global(.sweep) {
    opacity: 0;
    animation: sweep 6.5s cubic-bezier(0.45, 0, 0.4, 1) infinite;
  }
  @keyframes sweep {
    0% {
      opacity: 0;
      translate: 0 0;
    }
    4% {
      opacity: 1;
    }
    26% {
      opacity: 1;
      translate: var(--sweep) 0;
    }
    30%,
    100% {
      opacity: 0;
      translate: var(--sweep) 0;
    }
  }
  .worked :global(.flame) {
    animation: flicker 1.1s ease-in-out infinite;
  }
  @keyframes flicker {
    0%,
    100% {
      transform: scale(1, 1);
    }
    22% {
      transform: scale(0.94, 1.08) skewX(-2deg);
    }
    47% {
      transform: scale(1.05, 0.93) skewX(1.5deg);
    }
    71% {
      transform: scale(0.97, 1.05) skewX(-1deg);
    }
  }
  .worked :global(:is(.flare-light, .spark-light)) {
    animation: throb 1.7s ease-in-out infinite;
  }
  @keyframes throb {
    50% {
      opacity: 0.78;
    }
  }
  .worked :global(.ember) {
    opacity: 0;
    animation: rise 2.4s linear infinite;
  }
  @keyframes rise {
    0% {
      opacity: 0;
      translate: 0 0;
    }
    15% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      translate: var(--drift) var(--rise);
    }
  }
  .worked :global(.spark) {
    animation: sputter 0.55s steps(1) infinite;
  }
  @keyframes sputter {
    0% {
      transform: scale(1) rotate(0);
    }
    25% {
      transform: scale(0.72) rotate(14deg);
    }
    50% {
      transform: scale(1.12) rotate(-6deg);
    }
    75% {
      transform: scale(0.86) rotate(22deg);
    }
  }
  .worked :global(.spit) {
    opacity: 0;
    animation: spit 0.9s ease-out infinite;
  }
  @keyframes spit {
    0% {
      opacity: 1;
      translate: 0 0;
    }
    70%,
    100% {
      opacity: 0;
      translate: var(--dx) var(--dy);
    }
  }
  .worked :global(.smoulder) {
    animation: smoulder 2.8s ease-in-out infinite;
  }
  @keyframes smoulder {
    50% {
      opacity: 0.35;
    }
  }
  /* Face down, and while another card is chosen, nothing moves. */
  .card:global(.down) .worked :global(*),
  .card.faded .worked :global(*) {
    animation-play-state: paused;
  }
  :global(html[data-still]) .worked :global(*) {
    animation: none;
  }
  :global(html[data-still]) .worked :global(:is(.sweep, .glint, .ember, .spit)) {
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .worked :global(*) {
      animation: none;
    }
    .worked :global(:is(.sweep, .glint, .ember, .spit)) {
      opacity: 0;
    }
  }
  .find-tag-row {
    display: none;
  }
  .find-note {
    text-align: center;
    max-width: 34rem;
  }
  .find-note[data-find='azurite'] {
    color: #a9cdf5;
  }
  .find-note[data-find='flare'] {
    color: #f3b2bd;
  }
  .find-note[data-find='dynamite'],
  .find-note[data-find='blast'] {
    color: #eebf96;
  }
  .find-note strong {
    font-weight: 600;
  }

  /* ---- dynamite ------------------------------------------------------------ */
  .blast {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    max-width: 40rem;
  }
  .blast-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
    border-color: #a4502a;
    color: #ffd2ad;
  }
  .count {
    display: inline-grid;
    place-items: center;
    min-width: 1.5em;
    height: 1.5em;
    border-radius: 50%;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.85em;
    color: #1a0d06;
    background: #f08a3c;
  }
  .blast-q {
    margin: 0;
  }
  .blast-q.muted {
    margin-bottom: -0.2rem;
    font-size: 0.9rem;
  }
  .blast-find {
    border-color: var(--f-border, #a4502a);
    color: #ffd2ad;
  }
  .blast-find[data-find='azurite'] {
    --f-border: #4a78b8;
    color: #dcedff;
  }
  .blast-find[data-find='flare'] {
    --f-border: #a84a5c;
    color: #ffe1e6;
  }
  .blast-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .blast-list .lock {
    margin-left: 0.5em;
    font-size: 0.75em;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  @media (max-width: 700px) {
    .cards {
      grid-template-columns: 1fr;
      width: min(360px, 100%);
      gap: 0.9rem;
    }
    .frame {
      display: flex;
      align-items: center;
      height: auto;
      /* The emblem 62 in and the divider halfway to the name (ROW). */
      padding: 15px 22px;
      gap: 32px;
      /* No window in a row: the warm glow sits round the emblem instead. */
      background:
        var(--grain),
        radial-gradient(circle at 62px 50%, color-mix(in srgb, var(--warm) 28%, transparent), transparent 74px),
        radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
        linear-gradient(170deg, #211912, #0d0a07 70%);
    }
    .card.dm .frame {
      background:
        var(--grain),
        radial-gradient(circle at 62px 50%, color-mix(in srgb, var(--warm) 28%, transparent), transparent 74px),
        radial-gradient(ellipse 120% 90% at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5)),
        linear-gradient(170deg, #22110d, #0d0706 70%);
    }
    .icon {
      position: relative;
      top: auto;
      flex: none;
      width: 80px;
      height: 80px;
    }
    .glyph {
      width: 74px;
      height: 74px;
      --e-s: 0.58;
    }
    /* A row has no room for an item to grow. */
    .glyph.fit {
      --e-k: min(var(--e-kin, 1), 1);
    }
    .title {
      position: static;
      display: block;
      height: auto;
      flex: 1;
      text-align: left;
    }
    .filigree {
      --at: 0.5px;
      --end: 20px;
      inset: 3px;
      background-size:
        20px 20px,
        20px 20px,
        20px 20px,
        20px 20px,
        calc(100% - 2 * var(--end)) 1px,
        calc(100% - 2 * var(--end)) 1px,
        1px calc(100% - 2 * var(--end)),
        1px calc(100% - 2 * var(--end));
    }
    .card.dm .filigree {
      background-size: auto;
      -webkit-mask-size:
        20px 20px,
        20px 20px,
        20px 20px,
        20px 20px,
        calc(100% - 2 * var(--end)) 1px,
        calc(100% - 2 * var(--end)) 1px,
        1px calc(100% - 2 * var(--end)),
        1px calc(100% - 2 * var(--end));
      mask-size:
        20px 20px,
        20px 20px,
        20px 20px,
        20px 20px,
        calc(100% - 2 * var(--end)) 1px,
        calc(100% - 2 * var(--end)) 1px,
        1px calc(100% - 2 * var(--end)),
        1px calc(100% - 2 * var(--end));
    }
    /* Over the find's art, which sits at the row's end: the name keeps clear of it. */
    .card.special .title {
      position: relative;
      inset: auto;
      padding-right: 46px;
    }
    .find-tag {
      display: none;
    }
    .find-tag-row {
      display: block;
      margin-bottom: 2px;
      font-size: 0.6rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--f);
    }
    .back {
      transform: rotateX(180deg);
    }
    .card.mine:not(:global(.down)):hover .frame {
      transform: translateX(6px);
    }
  }
</style>
