<script lang="ts">
  // The spatial sound page's menu, over the real game screen (so the screen
  // keeps the whole window, and every sound comes from where it would in a
  // game): the spatial sound's settings (src/lab/SpatialControls.svelte),
  // the run's setup (players, the deal or a question, the depth for its
  // ambience), and buttons that play any of the game's sounds from the
  // element on screen it comes from, as the game's call sites have it. M
  // hides and shows it; Space plays a round over and over.
  import { onDestroy } from 'svelte';
  import { fireAmbience, sfx, type Sfx, type SoundPlace } from '../lib/sound';
  import { MOMENTS } from '../lib/soundDesign';
  import { FLARE_IGNITE_MS } from '../lib/flareBurn';
  import { GIFT_LANDS } from '../lib/fx/moments';
  import { scoreRowOf } from '../lib/scoreRows';
  import { session } from '../lib/session.svelte';
  import { zoneAt } from '../lib/zoneSigils';
  import { readStored, writeStored } from '../lib/storage';
  import * as L from '../lab/controls.svelte';
  import SpatialControls from '../lab/SpatialControls.svelte';

  let open = $state(readStored('menuOpen') !== '0');
  $effect(() => {
    writeStored('menuOpen', open ? '1' : '0');
  });

  const s = $derived(session.state);
  const players = $derived(s?.players ?? []);
  const depth = $derived(s?.round ?? 1);
  let roaring = $state(false);
  $effect(() => fireAmbience(roaring));

  // ---- the screen's elements, as shown now ----
  /** Elements showing, one per place (the game may draw one twice, stacked). */
  function shown(sel: string) {
    const seen = new Set<string>();
    return [...document.querySelectorAll(sel)].filter((e) => {
      const r = e.getBoundingClientRect();
      const key = `${Math.round(r.left)},${Math.round(r.top)}`;
      if (!r.width || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const cards = () => shown('.choose .card');
  const options = () => shown('.question .option, .question .tile');
  const timer = () => shown('.timer').at(-1);
  const art = () => shown('.question .art').at(-1);
  const meId = () => session.myPlayerId ?? players[0]?.id;
  const rowOf = (id: string | undefined) => (id ? scoreRowOf(id) : null);
  const myRow = () => rowOf(meId());
  /** A teammate's entry (the first other, or the second). */
  const mateRow = (n = 0) => rowOf(players.filter((p) => p.id !== meId())[n]?.id);

  let note = $state('');
  function missing(what: string) {
    note = `Nothing to play from: ${what}.`;
    setTimeout(() => (note = ''), 2500);
  }

  // ---- what it shows as a sound plays ----
  function flash(el: Element | null | undefined, colour = 'rgba(241, 217, 155, 0.9)') {
    el?.animate([{ boxShadow: `0 0 0 2px ${colour}, 0 0 22px ${colour}` }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700, easing: 'ease-out' });
  }
  const BLUE = 'rgba(120, 170, 230, 0.9)';
  const RED = 'rgba(224, 85, 63, 0.9)';
  /** A dot flying from one element to another over `s` seconds, roughly as the game's sparks do. */
  function spark(from: Element, to: Element, s: number, colour = '#f1d99b') {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed',
      left: '-5px',
      top: '-5px',
      zIndex: '300',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: colour,
      boxShadow: `0 0 10px 3px ${colour}`,
      pointerEvents: 'none',
    });
    document.body.append(dot);
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const [x0, y0, x1, y1] = [a.left + a.width / 2, a.top + a.height / 2, b.left + b.width / 2, b.top + b.height / 2];
    const frames = Array.from({ length: 31 }, (_, i) => {
      const u = ease(i / 30);
      return { transform: `translate(${x0 + (x1 - x0) * u}px, ${y0 + (y1 - y0) * u - Math.sin(Math.PI * u) * 60}px)` };
    });
    dot.animate(frames, { duration: s * 1000, easing: 'linear' }).finished.then(() => {
      dot.remove();
      flash(to);
    });
  }

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(ms: number, f: () => void) {
    const t = setTimeout(() => {
      timers.delete(t);
      f();
    }, ms);
    timers.add(t);
  }
  function hush() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    looping = false;
  }
  onDestroy(hush);

  const play = (name: Sfx, from?: SoundPlace) => sfx(name, from ? { from } : {});
  /** findReward's ring, its last layer, lands with the item. */
  const RING_AT = MOMENTS.findReward.layers.reduce((a, l) => Math.max(a, l.delay), 0) / 1000;

  /** Plays `name` from an element, lit as it plays; a note if there is none. */
  function from(name: Sfx, el: Element | null | undefined, what: string, colour?: string, far = false) {
    if (!el) return missing(what);
    play(name, { from: el, far });
    flash(el, colour);
  }
  /** Plays `name` along a path, a dot flying it. */
  function along(name: Sfx, a: Element | null | undefined, b: Element | null | undefined, seconds: number, what: string, colour: string, far = false) {
    if (!a || !b) return missing(what);
    play(name, { from: a, to: b, seconds, far });
    spark(a, b, seconds, colour);
  }

  type Action = { name: string; run: () => void };
  const placed: Action[] = [
    {
      name: 'Hover across',
      run: () => {
        const els = cards().length ? cards() : options();
        if (!els.length) return missing('cards or answers');
        els.forEach((el, i) => later(i * 190, () => from('hover', el, '', 'rgba(201, 164, 92, 0.6)')));
      },
    },
    {
      name: 'Pick first, last',
      run: () => {
        const c = cards();
        const o = options();
        const els = c.length ? [c[0], c.at(-1)] : [o[0], o.at(-1)];
        els.forEach((el, n) => later(n * 600, () => from(c.length ? 'pick' : 'select', el, 'cards or answers')));
      },
    },
    { name: 'Vote', run: () => from('vote', cards()[1], 'cards') },
    {
      name: 'Draw',
      run: () => {
        const c = cards();
        if (!c.length) return missing('cards');
        const hops = [0, 1, 2, 0, 1, 2, 0, 1].map((i) => i % c.length);
        hops.forEach((i, n) => later(n * (90 + n * 18), () => from('hover', c[i], '', 'rgba(201, 164, 92, 0.6)')));
        later(hops.length * (90 + hops.length * 18), () => from('draw', c[1 % c.length], 'cards'));
      },
    },
    { name: 'Clock ticks', run: () => [0, 1, 2, 3].forEach((n) => later(n * 1000, () => from('tick', timer(), 'the clock (ask a question)'))) },
    { name: 'Art burns in', run: () => [0, 1, 2].forEach((n) => later(n * 700, () => from('burn', art(), 'the art (ask a question)', 'rgba(224, 138, 68, 0.7)'))) },
    { name: 'Find: sparks to you', run: () => along('findReward', options()[2] ?? cards()[1], myRow(), RING_AT, 'an answer and your entry', '#6ab0ff') },
    { name: 'Your ward shatters', run: () => from('wardShatter', myRow(), 'your entry', 'rgba(110, 190, 255, 0.9)') },
    { name: 'Your life lost', run: () => from('lifeLost', myRow(), 'your entry', RED) },
    { name: 'Item blown up', run: () => from('itemBlown', myRow(), 'your entry', RED) },
    { name: 'Your flare', run: () => along('flare', myRow(), timer(), FLARE_IGNITE_MS / 1000, 'the clock (ask a question)', '#ff6a8a') },
    { name: 'A teammate’s flare', run: () => along('flare', mateRow(1) ?? mateRow(), timer(), FLARE_IGNITE_MS / 1000, 'a teammate and the clock', '#ff6a8a', true) },
    { name: 'You revive a teammate', run: () => along('revive', myRow(), mateRow(), GIFT_LANDS, 'a teammate (2 players or more)', '#ff8a80') },
    { name: 'A teammate revives you', run: () => along('revive', mateRow(1) ?? mateRow(), myRow(), GIFT_LANDS, 'a teammate (2 players or more)', '#ff8a80', true) },
    // As the game has it: the session doesn't know which answer, so it is only farther off.
    {
      name: 'A teammate strikes one',
      run: () => {
        play('struck', { far: true });
        flash(options()[1], RED);
        flash(mateRow(), BLUE);
      },
    },
  ];
  /** The scene's own sounds, centred; a blast (from the edge it bursts in from) and a cave-in fill the space with Size on. */
  const whole: Action[] = [
    { name: 'Run starts', run: () => play('start') },
    { name: 'Plunge', run: () => play('plunge') },
    { name: 'New stratum', run: () => play('stratum') },
    { name: 'Zone locks in', run: () => play('zoneLock') },
    { name: 'Blast from the left', run: () => play('blast', { edge: -1 }) },
    { name: 'Blast from the right', run: () => play('blast', { edge: 1 }) },
    { name: 'Cave-in', run: () => from('caveIn', myRow(), 'your entry', RED) },
    { name: 'Deathmatch', run: () => play('deathmatch') },
    { name: 'A teammate falls', run: () => (play('fallenFar'), flash(mateRow(), RED)) },
    { name: 'You fall (run over)', run: () => play('fallen') },
    { name: 'Right', run: () => play('correct') },
    { name: 'Wrong', run: () => play('wrong') },
  ];

  let looping = $state(false);
  const act = (list: Action[], name: string) => list.find((a) => a.name === name)!.run();
  /** A round of Delve together, over and over, to listen to while switching. */
  function round() {
    if (!looping) return;
    L.dealCards();
    later(200, () => act(whole, 'Plunge'));
    later(1900, () => act(placed, 'Hover across'));
    later(2800, () => act(placed, 'Vote'));
    later(3400, () => act(placed, 'Draw'));
    later(5300, () => L.ask());
    later(7600, () => act(placed, 'Art burns in'));
    later(9300, () => act(placed, 'Hover across'));
    later(10400, () => act(placed, 'A teammate strikes one'));
    later(11100, () => act(placed, 'Clock ticks'));
    later(14400, () => from('select', options()[2], 'answers'));
    later(15000, () => act(whole, 'Right'));
    later(15400, () => act(placed, 'Find: sparks to you'));
    later(17100, () => act(placed, 'A teammate’s flare'));
    later(18700, () => act(placed, 'Your ward shatters'));
    later(20100, () => act(whole, Math.random() < 0.5 ? 'Blast from the left' : 'Blast from the right'));
    later(22600, round);
  }
  function toggleLoop() {
    if (looping) return hush();
    looping = true;
    round();
  }
  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'm' || e.key === 'M') open = !open;
    else if (e.key === ' ') {
      e.preventDefault();
      toggleLoop();
    }
  }

  /** Svelte action: the mouse over the menu never reaches lib/sound.ts's hover sound. */
  function quiet(node: HTMLElement) {
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('pointerover', stop);
    return { destroy: () => node.removeEventListener('pointerover', stop) };
  }

  const ZONES = Array.from({ length: 12 }, (_, k) => 10 * k + 1);
</script>

<svelte:window onkeydown={onKey} />

<!-- Its own buttons make no sound: only the screen's do, as in the game. -->
<div data-sfx="none" use:quiet>
  {#if open}
    <aside class="menu" aria-label="Spatial sound">
      <header>
        <b>Spatial sound</b>
        <button class="small" onclick={() => (open = false)}>Hide (M)</button>
      </header>
      <p class="hint">The game's own screen fills the window behind this, so every sound comes from where it would in a game. Click the screen once for sound.</p>

      <div class="line">
        <span class="lbl">Players</span>
        <div class="seg" role="group" aria-label="Players">
          {#each [1, 2, 3] as n (n)}<button class:on={players.length === n} onclick={() => L.setPlayers(n)}>{n}</button>{/each}
        </div>
        <button class="small" onclick={() => L.dealCards()}>Deal cards</button>
        <button class="small" onclick={() => L.ask()}>Ask</button>
      </div>
      <div class="line">
        <label class="lbl" for="zone">Ambience</label>
        <select id="zone" value={ZONES.findLast((z) => z <= depth) ?? 1} onchange={(e) => L.setDepth(Number(e.currentTarget.value))}>
          {#each ZONES as z (z)}<option value={z}>{z} • {zoneAt(z)}</option>{/each}
        </select>
        <label class="check"><input type="checkbox" bind:checked={roaring} /> Deathmatch fire</label>
      </div>
      <button class="loop" class:on={looping} onclick={toggleLoop}>{looping ? 'Stop the round' : 'Play a round of Delve together'} (Space)</button>
      {#if note}<p class="note">{note}</p>{/if}

      <h3>Placed sounds</h3>
      <div class="grid">
        {#each placed as a (a.name)}<button onclick={a.run}>{a.name}</button>{/each}
      </div>
      <h3>The scene’s sounds</h3>
      <div class="grid">
        {#each whole as a (a.name)}<button onclick={a.run}>{a.name}</button>{/each}
      </div>

      <h3>Settings</h3>
      <SpatialControls />
      <p class="hint">Shared with the lab. A narrow window lays the game out as a phone does.</p>
    </aside>
  {:else}
    <button class="fab" onclick={() => (open = true)} aria-label="Show the menu">Menu</button>
  {/if}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 250;
    top: 8px;
    right: 8px;
    width: min(340px, calc(100vw - 16px));
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    padding: 0.7rem 0.8rem 1rem;
    border: 1px solid var(--gold-lo);
    border-radius: 8px;
    background: rgba(12, 10, 8, 0.9);
    box-shadow: 0 0 24px rgba(0, 0, 0, 0.6);
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.3;
    color: var(--text);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  header b,
  h3 {
    font-family: var(--font-cinzel);
    font-weight: normal;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--gold-hi);
    font-size: 0.85rem;
  }
  h3 {
    margin: 0.9rem 0 0.4rem;
  }
  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  .note {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--unique-hi);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    margin: 0.5rem 0;
  }
  .lbl {
    min-width: 5.4em;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--gold);
    cursor: pointer;
  }
  select {
    font: inherit;
    font-size: 0.85rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.15rem 0.3rem;
    cursor: pointer;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button {
    min-width: 2em;
    padding: 0.2rem 0.5rem;
    border: 0;
    border-right: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.3);
    color: var(--text);
    font: inherit;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button.on {
    background: rgba(201, 164, 92, 0.25);
    color: var(--gold-hi);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }
  .grid button,
  .loop,
  .small {
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .grid button:hover,
  .loop:hover,
  .small:hover {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .loop {
    width: 100%;
    margin: 0.3rem 0;
    color: var(--gold-hi);
  }
  .loop.on {
    border-color: var(--gold);
    background: rgba(201, 164, 92, 0.2);
  }
  .fab {
    position: fixed;
    z-index: 250;
    left: 12px;
    bottom: 12px;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
    background: rgba(12, 10, 8, 0.94);
    color: var(--gold-hi);
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(0, 0, 0, 0.6);
  }
</style>
